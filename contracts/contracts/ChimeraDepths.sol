// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IChimeraTraining, IChimeraTreasury, IChimeraRelics} from "./interfaces/IChimeraEconomy.sol";

interface IDepthsLab {
    function ownerOf(uint256 id) external view returns (address);
    function battleProfile(uint256 id) external returns (euint16 power, euint8 element);
}

/// @title ChimeraDepths — Arkhive Depths, a push-your-luck dungeon run on ciphertext
/// @notice Every floor has three sealed doors: stairs, a monster, treasure or a trap. A lantern
///         lights one door and only the delver can decrypt what is behind it. Health and the loot
///         sack are encrypted too, and the dungeon itself never learns whether you are still alive:
///         if your sealed health hits 0 the sack silently empties and stays empty. Leave whenever
///         you like; the payout is an encrypted transfer of whatever the sack holds (0 if you died).
///
///         Nothing is ever decrypted publicly unless the delver opts in with `revealSurvival`,
///         which opens a single bit (survived or not) to post a depth record and earn a relic.
contract ChimeraDepths is Ownable, ZamaEthereumConfig {
    uint8 public constant STAIRS = 0;
    uint8 public constant MONSTER = 1;
    uint8 public constant TREASURE = 2;
    uint8 public constant TRAP = 3;

    uint8 public constant MAX_FLOOR = 10;
    uint64 public constant ENTRY_FEE = 2_000_000; // 2 cZAMA → Treasury
    uint8 public constant RELIC_DEPTH = 6; // prove you survived this deep → free relic cache
    uint32 public constant XP_PER_FLOOR = 6;

    struct Run {
        address keeper;
        uint32 creatureId;
        uint8 floor; // the floor you are standing on (1-based); doors here are still closed
        uint8 cleared; // floors whose door you opened
        uint8 lit; // which door on this floor the lantern lights (0..2)
        bool over;
        bool revealing;
        bool recorded;
        uint64 startedAt;
    }

    IERC7984 public immutable token;
    IDepthsLab public immutable lab;
    address public treasury;
    address public training;
    address public relics;
    uint8 public maxDailyRuns = 3;

    uint256 public totalRuns;
    mapping(uint256 => Run) private _runs;
    mapping(uint256 => euint16) private _hp;
    mapping(uint256 => euint16) private _maxHp;
    mapping(uint256 => euint16) private _power;
    mapping(uint256 => euint64) private _sack;
    mapping(uint256 => ebool) private _survived;
    mapping(uint256 => euint64) private _paid;
    mapping(uint256 => mapping(uint8 => euint8)) private _doors; // runId → door → content (current floor)
    mapping(uint256 => mapping(uint8 => euint8)) private _seen; // runId → floor → content you met
    mapping(uint256 => mapping(uint8 => euint16)) private _hurt; // runId → floor → damage taken
    mapping(uint256 => mapping(uint8 => euint64)) private _found; // runId → floor → loot kept
    mapping(uint256 => mapping(uint8 => uint8)) public picked; // runId → floor → door opened
    mapping(address => uint256[]) private _runsOf;
    mapping(address => uint256) public activeRun;
    mapping(address => mapping(uint256 => uint8)) public runsOn; // keeper → day → runs
    mapping(address => uint8) public bestDepth; // proven survived depth
    address public deepestKeeper;
    uint8 public deepest;

    event RunStarted(uint256 indexed runId, address indexed keeper, uint256 indexed creatureId);
    event DoorOpened(uint256 indexed runId, address indexed keeper, uint8 floor, uint8 door, uint8 nextLit);
    event RunEnded(uint256 indexed runId, address indexed keeper, uint8 cleared, bytes32 paidHandle);
    event SurvivalRevealed(uint256 indexed runId, bytes32 survivedHandle);
    event DepthRecorded(uint256 indexed runId, address indexed keeper, uint8 depth, bool survived, uint256 relicId);

    error NotOwner(uint256 creatureId);
    error NotKeeper(uint256 runId);
    error RunActive(uint256 runId);
    error RunOver(uint256 runId);
    error RunNotOver(uint256 runId);
    error BadDoor();
    error Bottom();
    error DailyLimit();
    error AlreadyRecorded();
    error NotRevealing();

    constructor(IERC7984 token_, IDepthsLab lab_, address treasury_, address training_) Ownable(msg.sender) {
        token = token_;
        lab = lab_;
        treasury = treasury_;
        training = training_;
    }

    // ═════════════════════════════ play ═════════════════════════════

    /// @notice Enter with a creature. 2 cZAMA entry (needs `token.setOperator(depths, until)`).
    ///         An unpaid entry still opens a run, but you start with 0 health: you can never win loot.
    function enter(uint256 creatureId) external returns (uint256 runId) {
        if (lab.ownerOf(creatureId) != msg.sender) revert NotOwner(creatureId);
        uint256 active = activeRun[msg.sender];
        if (active != 0) revert RunActive(active);
        uint256 day = block.timestamp / 1 days;
        if (runsOn[msg.sender][day] >= maxDailyRuns) revert DailyLimit();
        runsOn[msg.sender][day] += 1;

        euint64 fee = FHE.asEuint64(ENTRY_FEE);
        FHE.allowTransient(fee, address(token));
        euint64 paid = token.confidentialTransferFrom(msg.sender, treasury, fee);

        (euint16 power, ) = lab.battleProfile(creatureId);
        // 60 health + half your hidden power (power 0..150, plus training and relics)
        euint16 maxHp = FHE.add(FHE.shr(power, 1), 60);
        euint16 hp = FHE.select(FHE.eq(paid, ENTRY_FEE), maxHp, FHE.asEuint16(0));

        runId = ++totalRuns;
        _runs[runId] = Run({
            keeper: msg.sender,
            creatureId: uint32(creatureId),
            floor: 1,
            cleared: 0,
            lit: 0,
            over: false,
            revealing: false,
            recorded: false,
            startedAt: uint64(block.timestamp)
        });
        _hp[runId] = hp;
        _maxHp[runId] = maxHp;
        _power[runId] = power;
        _sack[runId] = FHE.asEuint64(0);
        _keep(runId, hp);
        _keep(runId, maxHp);
        FHE.allowThis(power);
        FHE.allowThis(_sack[runId]);
        FHE.allow(_sack[runId], msg.sender);
        activeRun[msg.sender] = runId;
        _runsOf[msg.sender].push(runId);
        _rollFloor(runId);
        emit RunStarted(runId, msg.sender, creatureId);
    }

    /// @notice Open one of the three doors on your current floor, then step down to the next one.
    function open(uint256 runId, uint8 door) external {
        Run storage r = _runs[runId];
        if (r.keeper != msg.sender) revert NotKeeper(runId);
        if (r.over) revert RunOver(runId);
        if (door >= 3) revert BadDoor();
        uint8 f = r.floor;
        if (r.cleared >= MAX_FLOOR) revert Bottom();

        euint8 c = _doors[runId][door];
        (euint16 dmg, euint64 gain) = _encounter(c, _power[runId], f);
        euint16 left = FHE.sub(FHE.max(_hp[runId], dmg), dmg);
        _settle(runId, f, c, dmg, gain, left);
        picked[runId][f] = door;
        r.cleared = f;

        if (f < MAX_FLOOR) {
            r.floor = f + 1;
            _rollFloor(runId);
        }
        emit DoorOpened(runId, msg.sender, f, door, r.lit);
    }

    /// @notice Climb out with whatever the sack holds (an encrypted transfer, 0 if you died down there).
    function leave(uint256 runId) external {
        Run storage r = _runs[runId];
        if (r.keeper != msg.sender) revert NotKeeper(runId);
        if (r.over) revert RunOver(runId);
        r.over = true;
        activeRun[msg.sender] = 0;

        euint64 sack = _sack[runId];
        FHE.allowTransient(sack, treasury);
        euint64 sent = IChimeraTreasury(treasury).pay(msg.sender, sack);
        FHE.allowThis(sent);
        FHE.allow(sent, msg.sender);
        _paid[runId] = sent;

        ebool survived = FHE.gt(_hp[runId], 0);
        FHE.allowThis(survived);
        FHE.allow(survived, msg.sender);
        _survived[runId] = survived;

        if (training != address(0) && r.cleared > 0) IChimeraTraining(training).grantXp(r.creatureId, uint32(r.cleared) * XP_PER_FLOOR);
        emit RunEnded(runId, msg.sender, r.cleared, FHE.toBytes32(sent));
    }

    /// @notice Opt in: make the single "survived" bit of a finished run publicly decryptable.
    function revealSurvival(uint256 runId) external {
        Run storage r = _runs[runId];
        if (r.keeper != msg.sender) revert NotKeeper(runId);
        if (!r.over) revert RunNotOver(runId);
        if (r.recorded) revert AlreadyRecorded();
        r.revealing = true;
        FHE.makePubliclyDecryptable(_survived[runId]);
        emit SurvivalRevealed(runId, FHE.toBytes32(_survived[runId]));
    }

    /// @notice Post the depth record with the KMS proof. Survived ≥ 6 floors → a free relic cache.
    /// @param cleartexts abi.encode(bool survived)
    function recordDepth(uint256 runId, bytes calldata cleartexts, bytes calldata proof) external {
        Run storage r = _runs[runId];
        if (!r.revealing) revert NotRevealing();
        if (r.recorded) revert AlreadyRecorded();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_survived[runId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        bool survived = abi.decode(cleartexts, (bool));
        r.recorded = true;
        uint256 relicId;
        if (survived) {
            if (r.cleared > bestDepth[r.keeper]) bestDepth[r.keeper] = r.cleared;
            if (r.cleared > deepest) {
                deepest = r.cleared;
                deepestKeeper = r.keeper;
            }
            if (r.cleared >= RELIC_DEPTH && relics != address(0)) relicId = IChimeraRelics(relics).grantCache(r.keeper);
        }
        emit DepthRecorded(runId, r.keeper, r.cleared, survived, relicId);
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getRun(uint256 runId) external view returns (Run memory run, bytes32 hp, bytes32 maxHp, bytes32 sack, bytes32 litDoor, bytes32 survived, bytes32 paid) {
        run = _runs[runId];
        hp = FHE.toBytes32(_hp[runId]);
        maxHp = FHE.toBytes32(_maxHp[runId]);
        sack = FHE.toBytes32(_sack[runId]);
        litDoor = run.over || run.cleared >= MAX_FLOOR ? bytes32(0) : FHE.toBytes32(_doors[runId][run.lit]);
        survived = FHE.toBytes32(_survived[runId]);
        paid = FHE.toBytes32(_paid[runId]);
    }

    /// @notice What you met on a floor: (content, damage, loot kept) handles — decryptable by the delver only.
    function floorLog(uint256 runId, uint8 floor) external view returns (uint8 door, bytes32 content, bytes32 damage, bytes32 loot) {
        return (picked[runId][floor], FHE.toBytes32(_seen[runId][floor]), FHE.toBytes32(_hurt[runId][floor]), FHE.toBytes32(_found[runId][floor]));
    }

    function runsOf(address keeper) external view returns (uint256[] memory) {
        return _runsOf[keeper];
    }

    function runsToday(address keeper) external view returns (uint8) {
        return runsOn[keeper][block.timestamp / 1 days];
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setLinks(address treasury_, address training_, address relics_) external onlyOwner {
        treasury = treasury_;
        training = training_;
        relics = relics_;
    }

    function setMaxDailyRuns(uint8 n) external onlyOwner {
        maxDailyRuns = n;
    }

    // ═════════════════════════════ internals ═════════════════════════════

    /// @dev Seal three doors for the current floor. Deeper floors hide more traps and monsters.
    ///      Odds per door (out of 256): trap 26+8f, monster 90+5f, treasure 38, stairs the rest.
    function _rollFloor(uint256 runId) private {
        Run storage r = _runs[runId];
        uint16 f = r.floor;
        uint16 tTrap = 26 + 8 * f;
        uint16 tMon = tTrap + 90 + 5 * f;
        uint16 tTre = tMon + 38;
        if (tTre > 255) tTre = 255;
        if (tMon > 255) tMon = 255;
        for (uint8 d = 0; d < 3; d++) {
            euint8 roll = FHE.randEuint8();
            euint8 c = FHE.select(
                FHE.lt(roll, uint8(tTrap)),
                FHE.asEuint8(TRAP),
                FHE.select(FHE.lt(roll, uint8(tMon)), FHE.asEuint8(MONSTER), FHE.select(FHE.lt(roll, uint8(tTre)), FHE.asEuint8(TREASURE), FHE.asEuint8(STAIRS)))
            );
            FHE.allowThis(c);
            _doors[runId][d] = c;
        }
        // which door the lantern lights is public; what is behind it is for the delver only
        uint8 lit = uint8(uint256(keccak256(abi.encode(blockhash(block.number - 1), runId, f))) % 3);
        r.lit = lit;
        FHE.allow(_doors[runId][lit], r.keeper);
    }

    /// @dev What the door does to you: damage taken and loot found (before the death check).
    function _encounter(euint8 c, euint16 power, uint8 f) private returns (euint16 dmg, euint64 gain) {
        ebool isTrap = FHE.eq(c, TRAP);
        ebool isMonster = FHE.eq(c, MONSTER);
        // the monster: 25 + 10·floor + 0..31, against your sealed power
        euint16 mPow = FHE.add(FHE.asEuint16(FHE.shr(FHE.randEuint8(), 3)), uint16(25) + uint16(f) * 10);
        ebool beat = FHE.ge(power, mPow);
        // losing a fight costs 4 + half the gap; winning still costs 4
        euint16 gapDmg = FHE.add(FHE.shr(FHE.sub(FHE.max(mPow, power), power), 1), 4);
        dmg = FHE.select(isTrap, FHE.asEuint16(uint16(12) + uint16(f) * 4), FHE.select(isMonster, gapDmg, FHE.asEuint16(0)));
        // loot scales with depth: stairs 0.2·f, monster 0.6·f (0.2·f if it beat you), treasure 1.5·f, trap 0
        uint64 m = uint64(f);
        euint64 walk = FHE.select(FHE.and(isMonster, beat), FHE.asEuint64(600_000 * m), FHE.asEuint64(200_000 * m));
        walk = FHE.select(isTrap, FHE.asEuint64(0), walk);
        gain = FHE.select(FHE.eq(c, TREASURE), FHE.asEuint64(1_500_000 * m), walk);
    }

    /// @dev Apply the encounter. If your sealed health hit 0 the sack silently empties for good.
    function _settle(uint256 runId, uint8 f, euint8 c, euint16 dmg, euint64 gain, euint16 left) private {
        address k = _runs[runId].keeper;
        ebool alive = FHE.gt(left, 0);
        euint64 kept = FHE.select(alive, gain, FHE.asEuint64(0));
        euint64 sack = FHE.select(alive, FHE.add(_sack[runId], gain), FHE.asEuint64(0));
        _hp[runId] = left;
        _sack[runId] = sack;
        _keep(runId, left);
        FHE.allowThis(sack);
        FHE.allow(sack, k);
        _seen[runId][f] = c;
        _hurt[runId][f] = dmg;
        _found[runId][f] = kept;
        FHE.allow(c, k);
        FHE.allow(dmg, k);
        FHE.allowThis(dmg);
        FHE.allow(kept, k);
        FHE.allowThis(kept);
    }

    function _keep(uint256 runId, euint16 v) private {
        FHE.allowThis(v);
        FHE.allow(v, _runs[runId].keeper);
    }
}
