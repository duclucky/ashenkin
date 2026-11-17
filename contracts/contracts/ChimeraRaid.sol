// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint32, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ChimeraLab} from "./ChimeraLab.sol";
import {IChimeraQuests, IChimeraTraining, Task} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraRaid — the World Boss
/// @notice A boss with *encrypted* hit points. Every keeper can strike with any creature
///         (once per cooldown). Damage = both alleles of the 5 combat loci + element bonus +
///         an encrypted d64 — computed on ciphertexts, visible only to the attacker.
///         The public only ever sees a coarse health band (10% steps) and, for each strike,
///         a single bit: "was this the killing blow?".
///
///         The boss pot is this contract's cZAMA balance, fed by 60% of every breeding fee,
///         5% of every duel pot and 5% of every market sale. When the boss falls:
///           25% → the keeper who landed the killing blow
///           50% → split evenly between every keeper who struck this boss (claim)
///           25% → carries over to the next, stronger boss
contract ChimeraRaid is ZamaEthereumConfig, Ownable {
    uint32 public constant BASE_HP = 1500;
    uint32 public constant HP_PER_LEVEL = 500;
    uint8 public constant ELEMENT_VOID = 3;
    uint16 public constant ADVANTAGE_BONUS = 25;
    uint16 public constant VOID_BONUS = 12;
    uint16 public constant ROLL_BOUND = 64;

    struct Boss {
        uint32 level;
        uint8 element; // 0 Ember, 1 Spore, 2 Tide — creatures that counter it hit harder
        uint32 maxHp;
        uint32 raiders;
        uint32 strikes;
        uint64 spawnedAt;
        uint64 slainAt;
        address killer;
    }

    struct Strike {
        uint32 level;
        uint32 creatureId;
        address attacker;
        uint64 at;
    }

    ChimeraLab public immutable lab;
    IERC7984 public immutable token;
    address public quests;
    address public training;
    uint32 public constant STRIKE_XP = 12;
    uint64 public strikeCooldown = 10 minutes;

    uint32 public currentLevel;
    uint256 public totalStrikes;
    bytes32 public potHandle; // publicly decryptable: current pot (balance minus owed shares)

    mapping(uint32 => Boss) private _bosses;
    mapping(uint32 => euint32) private _hp;
    mapping(uint32 => bytes32) private _band; // latest public health band handle
    mapping(uint32 => euint64) private _share;
    mapping(uint256 => Strike) private _strikes;
    mapping(uint256 => ebool) private _killing;
    mapping(uint32 => mapping(address => bool)) public joined;
    mapping(uint32 => mapping(address => bool)) public claimed;
    mapping(uint32 => mapping(address => euint32)) private _damage;
    mapping(uint256 => uint64) public readyAt; // per creature
    /// @notice strikeId of each raider's first strike on boss `level` (0 = never struck)
    mapping(uint32 => mapping(address => uint256)) public firstStrike;
    /// @notice strikeId of the killing blow on boss `level` (0 = still alive)
    mapping(uint32 => uint256) public killStrikeOf;
    mapping(uint256 => uint32) private _raidersAt; // distinct raiders right after each strike
    euint64 private _owed; // shares promised to raiders but not yet claimed

    event BossSpawned(uint32 indexed level, uint8 element, uint32 maxHp);
    event Struck(
        uint256 indexed strikeId,
        uint32 indexed level,
        address indexed attacker,
        uint256 creatureId,
        bytes32 killingHandle,
        bytes32 damageHandle,
        bytes32 bandHandle
    );
    event BossSlain(uint32 indexed level, address indexed killer, uint256 strikeId, uint32 raiders);
    event ShareClaimed(uint32 indexed level, address indexed raider);
    event PotPublished(bytes32 handle);

    error NotOwner(uint256 id);
    error NotReady(uint256 id, uint64 readyAt);
    error AlreadySlain(uint32 level);
    error NotKillingBlow(uint256 strikeId);
    error NotSlain(uint32 level);
    error NotRaider(uint32 level);
    error AlreadyClaimed(uint32 level);
    error LateToTheFight(uint32 level);

    constructor(ChimeraLab lab_, IERC7984 token_) Ownable(msg.sender) {
        lab = lab_;
        token = token_;
        _owed = FHE.asEuint64(0);
        FHE.allowThis(_owed);
        _spawn(1);
    }

    // ═════════════════════════════ gameplay ═════════════════════════════

    function strike(uint256 creatureId) external returns (uint256 strikeId) {
        if (lab.ownerOf(creatureId) != msg.sender) revert NotOwner(creatureId);
        if (readyAt[creatureId] > block.timestamp) revert NotReady(creatureId, readyAt[creatureId]);
        readyAt[creatureId] = uint64(block.timestamp) + strikeCooldown;

        uint32 lvl = currentLevel;
        strikeId = ++totalStrikes;
        (ebool killing, euint32 dmg, bytes32 band) = _hit(lvl, creatureId);
        _track(lvl, dmg, strikeId);

        _strikes[strikeId] = Strike(lvl, uint32(creatureId), msg.sender, uint64(block.timestamp));
        _killing[strikeId] = killing;
        if (quests != address(0)) IChimeraQuests(quests).record(msg.sender, Task.RAID);
        if (training != address(0)) IChimeraTraining(training).grantXp(creatureId, STRIKE_XP);
        emit Struck(strikeId, lvl, msg.sender, creatureId, FHE.toBytes32(killing), FHE.toBytes32(dmg), band);
        _publishPot();
    }

    function _hit(uint32 lvl, uint256 creatureId) private returns (ebool killing, euint32 dmg, bytes32 bandHandle) {
        Boss storage b = _bosses[lvl];
        (euint16 power, euint8 elem) = lab.battleProfile(creatureId);
        dmg = FHE.asEuint32(FHE.add(FHE.add(power, _bonus(elem, b.element)), FHE.randEuint16(ROLL_BOUND)));

        euint32 hp = _hp[lvl];
        ebool lethal = FHE.le(hp, dmg);
        killing = FHE.and(FHE.gt(hp, uint32(0)), lethal);
        euint32 newHp = FHE.select(lethal, FHE.asEuint32(0), FHE.sub(hp, dmg));
        FHE.allowThis(newHp);
        _hp[lvl] = newHp;

        // coarse public health: ceil(hp * 10 / maxHp) → 0..10
        euint32 band = FHE.div(FHE.add(FHE.mul(newHp, uint32(10)), b.maxHp - 1), b.maxHp);
        FHE.makePubliclyDecryptable(band);
        bandHandle = FHE.toBytes32(band);
        _band[lvl] = bandHandle;

        FHE.allowThis(killing);
        FHE.makePubliclyDecryptable(killing);
        // the contract must hold ACL rights too, or the attacker's user-decrypt of this strike is refused
        FHE.allowThis(dmg);
        FHE.allow(dmg, msg.sender);
    }

    function _track(uint32 lvl, euint32 dmg, uint256 strikeId) private {
        euint32 prev = _damage[lvl][msg.sender];
        euint32 total = FHE.isInitialized(prev) ? FHE.add(prev, dmg) : dmg;
        FHE.allowThis(total);
        FHE.allow(total, msg.sender);
        _damage[lvl][msg.sender] = total;

        Boss storage b = _bosses[lvl];
        if (!joined[lvl][msg.sender]) {
            joined[lvl][msg.sender] = true;
            firstStrike[lvl][msg.sender] = strikeId;
            b.raiders += 1;
        }
        b.strikes += 1;
        _raidersAt[strikeId] = b.raiders;
    }

    /// @notice Anyone may finalize a strike whose `killing` bit the KMS revealed as true.
    function finalizeKill(uint256 strikeId, bytes calldata cleartexts, bytes calldata proof) external {
        Strike storage s = _strikes[strikeId];
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_killing[strikeId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        if (!abi.decode(cleartexts, (bool))) revert NotKillingBlow(strikeId);

        Boss storage b = _bosses[s.level];
        if (b.slainAt != 0) revert AlreadySlain(s.level);
        b.slainAt = uint64(block.timestamp);
        b.killer = s.attacker;
        // Health is encrypted, so keepers can keep striking a dead boss until this call lands.
        // Only raiders who joined at or before the killing blow share the pot.
        killStrikeOf[s.level] = strikeId;
        b.raiders = _raidersAt[strikeId];

        euint64 pot = _pot();
        euint64 share = FHE.div(FHE.div(pot, 2), uint64(b.raiders));
        FHE.allowThis(share);
        _share[s.level] = share;
        _owed = FHE.add(_owed, FHE.mul(share, uint64(b.raiders)));
        FHE.allowThis(_owed);
        _pay(s.attacker, FHE.div(pot, 4));

        emit BossSlain(s.level, s.attacker, strikeId, b.raiders);
        _spawn(s.level + 1);
        _publishPot();
    }

    function claimShare(uint32 level) external {
        if (_bosses[level].slainAt == 0) revert NotSlain(level);
        if (!joined[level][msg.sender]) revert NotRaider(level);
        if (claimed[level][msg.sender]) revert AlreadyClaimed(level);
        if (firstStrike[level][msg.sender] > killStrikeOf[level]) revert LateToTheFight(level);
        claimed[level][msg.sender] = true;
        euint64 share = _share[level];
        _owed = FHE.sub(_owed, share);
        FHE.allowThis(_owed);
        _pay(msg.sender, share);
        emit ShareClaimed(level, msg.sender);
        _publishPot();
    }

    function publishPot() external returns (bytes32) {
        return _publishPot();
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getBoss(uint32 level) external view returns (Boss memory boss, bytes32 bandHandle, bytes32 shareHandle) {
        return (_bosses[level], _band[level], FHE.toBytes32(_share[level]));
    }

    function getStrike(uint256 strikeId) external view returns (Strike memory s, bytes32 killingHandle) {
        return (_strikes[strikeId], FHE.toBytes32(_killing[strikeId]));
    }

    /// @notice True when `raider` may still claim a share of slain boss `level`.
    function canClaim(uint32 level, address raider) external view returns (bool) {
        return
            _bosses[level].slainAt != 0 &&
            joined[level][raider] &&
            !claimed[level][raider] &&
            firstStrike[level][raider] <= killStrikeOf[level];
    }

    /// @notice Encrypted total damage `raider` dealt to boss `level` (decryptable by the raider).
    function damageOf(uint32 level, address raider) external view returns (bytes32) {
        return FHE.toBytes32(_damage[level][raider]);
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setTraining(address training_) external onlyOwner {
        training = training_;
    }

    function setQuests(address quests_) external onlyOwner {
        quests = quests_;
    }

    function setStrikeCooldown(uint64 cd) external onlyOwner {
        strikeCooldown = cd;
    }

    // ═════════════════════════════ internals ═════════════════════════════

    function _spawn(uint32 level) private {
        uint32 maxHp = BASE_HP + HP_PER_LEVEL * (level - 1);
        uint8 element = uint8(uint256(keccak256(abi.encode(blockhash(block.number - 1), level))) % 3);
        _bosses[level] = Boss({
            level: level,
            element: element,
            maxHp: maxHp,
            raiders: 0,
            strikes: 0,
            spawnedAt: uint64(block.timestamp),
            slainAt: 0,
            killer: address(0)
        });
        euint32 hp = FHE.asEuint32(maxHp);
        FHE.allowThis(hp);
        _hp[level] = hp;
        currentLevel = level;
        emit BossSpawned(level, element, maxHp);
    }

    /// @dev x counters boss element y iff y == (x + 1) % 3  ⇔  x == (y + 2) % 3.
    function _bonus(euint8 x, uint8 y) private returns (euint16) {
        euint16 elemental = FHE.select(FHE.eq(x, (y + 2) % 3), FHE.asEuint16(ADVANTAGE_BONUS), FHE.asEuint16(0));
        return FHE.select(FHE.eq(x, ELEMENT_VOID), FHE.asEuint16(VOID_BONUS), elemental);
    }

    function _pot() private returns (euint64) {
        euint64 bal = token.confidentialBalanceOf(address(this));
        if (!FHE.isInitialized(bal)) bal = FHE.asEuint64(0);
        return FHE.sub(bal, _owed);
    }

    function _publishPot() private returns (bytes32 h) {
        euint64 pot = _pot();
        FHE.allowThis(pot);
        FHE.makePubliclyDecryptable(pot);
        h = FHE.toBytes32(pot);
        potHandle = h;
        emit PotPublished(h);
    }

    function _pay(address to, euint64 amount) private {
        FHE.allowTransient(amount, address(token));
        token.confidentialTransfer(to, amount);
    }
}
