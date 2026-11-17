// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IChimeraRelics, IChimeraTraining} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraRelics — mystery caches with public odds and private results
/// @notice A Relic Cache costs 25 cZAMA. Inside is a relic whose tier and power are rolled
///         with on-chain FHE randomness and stay encrypted: only the keeper can decrypt what
///         they pulled. The odds are compile-time constants anyone can read (out of 256):
///
///             Legendary   5/256 ≈  1.95%   power 20..27
///             Epic       26/256 ≈ 10.16%   power 11..18
///             Rare       72/256 ≈ 28.13%   power  6..9
///             Common    153/256 ≈ 59.77%   power  2..5
///
///         Pity: every keeper has an encrypted counter of caches since their last Epic+. The
///         20th cache in a dry streak is guaranteed Epic or better. The counter is private, so
///         rivals cannot tell who is about to spike.
///
///         Equip relics on creatures (slot 0 always, slot 1 from training level 5): the
///         encrypted power is added to the creature's battle power in every mode via
///         ChimeraTraining. Opponents see that a creature carries relics — never how strong.
///
///         Fuse three relics into one: the result keeps the best tier of the three and has a
///         90/256 ≈ 35% chance to climb one tier. Appraise to make a relic's tier and power
///         public (bragging rights / trading).
/// @dev Payment is a confidential transfer; if it silently moved 0 (insufficient balance)
///      the relic is rolled as Dust (tier 0, power 0) — no KMS round-trip is needed, the cache
///      opens in the same transaction.
contract ChimeraRelics is IChimeraRelics, Ownable, ZamaEthereumConfig {
    uint64 private constant CZAMA = 1e6;
    uint64 public constant CACHE_PRICE = 25 * CZAMA;
    uint64 public constant FUSE_PRICE = 5 * CZAMA;
    uint64 public constant RAID_SHARE_PCT = 60;

    uint8 public constant DUST = 0;
    uint8 public constant COMMON = 1;
    uint8 public constant RARE = 2;
    uint8 public constant EPIC = 3;
    uint8 public constant LEGENDARY = 4;

    /// @dev roll r ∈ [0,256): r < 5 Legendary, r < 31 Epic, r < 103 Rare, else Common
    uint8 public constant LEGENDARY_BELOW = 5;
    uint8 public constant EPIC_BELOW = 31;
    uint8 public constant RARE_BELOW = 103;
    uint8 public constant PITY = 20;
    uint8 public constant FUSE_UPGRADE_BELOW = 90; // 90/256 ≈ 35.2%
    uint8 public constant SECOND_SLOT_LEVEL = 5;

    struct Relic {
        address keeper;
        uint32 equippedTo; // creature id, 0 = in the bag
        uint8 slot;
        bool burned;
        bool appraised;
        uint8 tier; // public only after appraisal
        uint8 power; // public only after appraisal
        uint8 source; // 0 cache, 1 fusion, 2 prize
        uint64 createdAt;
    }

    IERC721 public immutable lab;
    IERC7984 public immutable token;
    address public training;
    address public raid;
    address public treasury;
    mapping(address => bool) public isGame;

    uint256 public totalRelics;
    uint256 public cachesOpened;
    uint256 public fusions;
    uint32[5] public appraisedByTier;

    mapping(uint256 => Relic) private _relics;
    mapping(uint256 => euint8) private _tier;
    mapping(uint256 => euint16) private _power;
    mapping(address => uint256[]) private _bag; // every relic ever held (filter client-side)
    mapping(address => euint8) private _dry; // caches since last Epic+
    mapping(uint256 => uint256[2]) private _slots; // creature → relic ids

    event CacheOpened(uint256 indexed relicId, address indexed keeper, uint8 source, bytes32 tierHandle, bytes32 powerHandle);
    event Equipped(uint256 indexed relicId, uint256 indexed creatureId, uint8 slot, address indexed keeper);
    event Unequipped(uint256 indexed relicId, uint256 indexed creatureId, address indexed keeper);
    event Fused(uint256 indexed relicId, address indexed keeper, uint256 a, uint256 b, uint256 c);
    event AppraisalRequested(uint256 indexed relicId, address indexed keeper);
    event Appraised(uint256 indexed relicId, address indexed keeper, uint8 tier, uint8 power);

    error NotKeeper(uint256 relicId);
    error NotCreatureOwner(uint256 creatureId);
    error Busy(uint256 relicId);
    error BadSlot(uint8 slot);
    error SlotLocked(uint256 creatureId);
    error NotGame();
    error NotTraining();
    error AlreadyAppraised(uint256 relicId);
    error Duplicate();

    constructor(IERC721 lab_, IERC7984 token_) Ownable(msg.sender) {
        lab = lab_;
        token = token_;
    }

    // ═════════════════════════════ caches ═════════════════════════════

    /// @notice Buy and open one cache. Requires `token.setOperator(relics, until)`.
    function openCache() external returns (uint256 relicId) {
        euint64 price = FHE.asEuint64(CACHE_PRICE);
        FHE.allowTransient(price, address(token));
        euint64 escrowed = token.confidentialTransferFrom(msg.sender, address(this), price);
        ebool paid = FHE.eq(escrowed, CACHE_PRICE);
        // split exactly what arrived: 15 → World Boss, 10 → Treasury (or 0 / 0)
        euint64 toRaid = FHE.select(paid, FHE.asEuint64((CACHE_PRICE * RAID_SHARE_PCT) / 100), FHE.asEuint64(0));
        _forward(raid, toRaid);
        _forward(treasury, FHE.sub(escrowed, toRaid));
        cachesOpened += 1;
        relicId = _roll(msg.sender, paid, 0);
    }

    /// @notice Prize cache from an allowed game (Oracle's Riddle, season thrones).
    function grantCache(address to) external returns (uint256 relicId) {
        if (!isGame[msg.sender]) revert NotGame();
        cachesOpened += 1;
        relicId = _roll(to, FHE.asEbool(true), 2);
    }

    function _roll(address keeper, ebool paid, uint8 source) private returns (uint256 relicId) {
        euint8 r = FHE.randEuint8();
        euint8 tier = FHE.select(
            FHE.lt(r, LEGENDARY_BELOW),
            FHE.asEuint8(LEGENDARY),
            FHE.select(
                FHE.lt(r, EPIC_BELOW),
                FHE.asEuint8(EPIC),
                FHE.select(FHE.lt(r, RARE_BELOW), FHE.asEuint8(RARE), FHE.asEuint8(COMMON))
            )
        );

        // encrypted pity: the PITY-th dry cache is lifted to Epic
        euint8 dry = _dry[keeper];
        if (!FHE.isInitialized(dry)) dry = FHE.asEuint8(0);
        ebool forced = FHE.and(FHE.ge(dry, PITY - 1), FHE.lt(tier, EPIC));
        tier = FHE.select(forced, FHE.asEuint8(EPIC), tier);
        tier = FHE.select(paid, tier, FHE.asEuint8(DUST));
        ebool hit = FHE.ge(tier, EPIC);
        dry = FHE.select(paid, FHE.select(hit, FHE.asEuint8(0), FHE.add(dry, 1)), dry);
        FHE.allowThis(dry);
        FHE.allow(dry, keeper);
        _dry[keeper] = dry;

        relicId = _mint(keeper, tier, source);
    }

    /// @dev power = base(tier) + spread; Common/Rare spread 0..3, Epic/Legendary 0..7.
    function _powerFor(euint8 tier) private returns (euint16) {
        euint8 spread = FHE.randEuint8(8);
        euint8 low = FHE.and(spread, 3);
        euint8 base = FHE.select(
            FHE.eq(tier, LEGENDARY),
            FHE.asEuint8(20),
            FHE.select(
                FHE.eq(tier, EPIC),
                FHE.asEuint8(11),
                FHE.select(FHE.eq(tier, RARE), FHE.asEuint8(6), FHE.asEuint8(2))
            )
        );
        euint8 p = FHE.add(base, FHE.select(FHE.ge(tier, EPIC), spread, low));
        p = FHE.select(FHE.eq(tier, DUST), FHE.asEuint8(0), p);
        return FHE.asEuint16(p);
    }

    function _mint(address keeper, euint8 tier, uint8 source) private returns (uint256 relicId) {
        euint16 power = _powerFor(tier);
        relicId = ++totalRelics;
        _relics[relicId] = Relic({
            keeper: keeper,
            equippedTo: 0,
            slot: 0,
            burned: false,
            appraised: false,
            tier: 0,
            power: 0,
            source: source,
            createdAt: uint64(block.timestamp)
        });
        FHE.allowThis(tier);
        FHE.allowThis(power);
        FHE.allow(tier, keeper);
        FHE.allow(power, keeper);
        _tier[relicId] = tier;
        _power[relicId] = power;
        _bag[keeper].push(relicId);
        emit CacheOpened(relicId, keeper, source, FHE.toBytes32(tier), FHE.toBytes32(power));
    }

    // ═════════════════════════════ fusion ═════════════════════════════

    /// @notice Burn three unequipped relics into one: best tier of the three, 35% chance of +1
    ///         tier (max Legendary). The 5 cZAMA fee unlocks the upgrade chance — if it did not
    ///         arrive, you still get the best tier, just no roll.
    function fuse(uint256 a, uint256 b, uint256 c) external returns (uint256 relicId) {
        if (a == b || b == c || a == c) revert Duplicate();
        _consume(a);
        _consume(b);
        _consume(c);

        euint64 price = FHE.asEuint64(FUSE_PRICE);
        FHE.allowTransient(price, address(token));
        euint64 escrowed = token.confidentialTransferFrom(msg.sender, address(this), price);
        ebool paid = FHE.eq(escrowed, FUSE_PRICE);
        euint64 toRaid = FHE.select(paid, FHE.asEuint64((FUSE_PRICE * RAID_SHARE_PCT) / 100), FHE.asEuint64(0));
        _forward(raid, toRaid);
        _forward(treasury, FHE.sub(escrowed, toRaid));

        euint8 best = FHE.max(FHE.max(_tier[a], _tier[b]), _tier[c]);
        ebool lucky = FHE.and(paid, FHE.lt(FHE.randEuint8(), FUSE_UPGRADE_BELOW));
        ebool climb = FHE.and(lucky, FHE.lt(best, LEGENDARY));
        euint8 tier = FHE.select(climb, FHE.add(best, 1), best);
        fusions += 1;
        relicId = _mint(msg.sender, tier, 1);
        emit Fused(relicId, msg.sender, a, b, c);
    }

    function _consume(uint256 id) private {
        Relic storage r = _relics[id];
        if (r.keeper != msg.sender || r.burned) revert NotKeeper(id);
        if (r.equippedTo != 0) revert Busy(id);
        r.burned = true;
    }

    // ═════════════════════════════ equipment ═════════════════════════════

    function equip(uint256 relicId, uint256 creatureId, uint8 slot) external {
        Relic storage r = _relics[relicId];
        if (r.keeper != msg.sender || r.burned) revert NotKeeper(relicId);
        if (r.equippedTo != 0) revert Busy(relicId);
        if (lab.ownerOf(creatureId) != msg.sender) revert NotCreatureOwner(creatureId);
        if (slot > 1) revert BadSlot(slot);
        if (slot == 1 && (training == address(0) || IChimeraTraining(training).levelOf(creatureId) < SECOND_SLOT_LEVEL))
            revert SlotLocked(creatureId);

        uint256 prev = _slots[creatureId][slot];
        if (prev != 0) {
            _relics[prev].equippedTo = 0;
            emit Unequipped(prev, creatureId, _relics[prev].keeper);
        }
        _slots[creatureId][slot] = relicId;
        r.equippedTo = uint32(creatureId);
        r.slot = slot;
        emit Equipped(relicId, creatureId, slot, msg.sender);
    }

    function unequip(uint256 relicId) external {
        Relic storage r = _relics[relicId];
        if (r.keeper != msg.sender) revert NotKeeper(relicId);
        uint256 cid = r.equippedTo;
        if (cid == 0) return;
        _slots[cid][r.slot] = 0;
        r.equippedTo = 0;
        emit Unequipped(relicId, cid, msg.sender);
    }

    /// @dev Only relics whose keeper still owns the creature count (a sold creature does not
    ///      carry its previous keeper's relics into battle).
    function bonusOf(uint256 creatureId) external returns (euint16 bonus) {
        if (msg.sender != training) revert NotTraining();
        address owner_ = lab.ownerOf(creatureId);
        for (uint8 s = 0; s < 2; s++) {
            uint256 id = _slots[creatureId][s];
            if (id == 0 || _relics[id].keeper != owner_) continue;
            bonus = FHE.isInitialized(bonus) ? FHE.add(bonus, _power[id]) : _power[id];
        }
        if (FHE.isInitialized(bonus)) FHE.allowTransient(bonus, msg.sender);
    }

    // ═════════════════════════════ appraisal ═════════════════════════════

    /// @notice Make a relic's tier and power publicly decryptable; then anyone may publish them.
    function appraise(uint256 relicId) external {
        Relic storage r = _relics[relicId];
        if (r.keeper != msg.sender || r.burned) revert NotKeeper(relicId);
        if (r.appraised) revert AlreadyAppraised(relicId);
        FHE.makePubliclyDecryptable(_tier[relicId]);
        FHE.makePubliclyDecryptable(_power[relicId]);
        emit AppraisalRequested(relicId, msg.sender);
    }

    /// @param cleartexts abi.encode(uint8 tier, uint16 power)
    function publishAppraisal(uint256 relicId, bytes calldata cleartexts, bytes calldata proof) external {
        Relic storage r = _relics[relicId];
        if (r.appraised) revert AlreadyAppraised(relicId);
        bytes32[] memory handles = new bytes32[](2);
        handles[0] = FHE.toBytes32(_tier[relicId]);
        handles[1] = FHE.toBytes32(_power[relicId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        (uint8 tier, uint16 power) = abi.decode(cleartexts, (uint8, uint16));
        r.appraised = true;
        r.tier = tier;
        r.power = uint8(power);
        appraisedByTier[tier] += 1;
        emit Appraised(relicId, r.keeper, tier, uint8(power));
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getRelic(
        uint256 relicId
    ) external view returns (Relic memory relic, bytes32 tierHandle, bytes32 powerHandle) {
        return (_relics[relicId], FHE.toBytes32(_tier[relicId]), FHE.toBytes32(_power[relicId]));
    }

    function relicsOf(address keeper) external view returns (uint256[] memory) {
        return _bag[keeper];
    }

    function slotsOf(uint256 creatureId) external view returns (uint256[2] memory) {
        return _slots[creatureId];
    }

    function pityHandle(address keeper) external view returns (bytes32) {
        return FHE.toBytes32(_dry[keeper]);
    }

    /// @notice Public odds out of 256: [Common, Rare, Epic, Legendary].
    function odds() external pure returns (uint16[4] memory) {
        return [uint16(256 - RARE_BELOW), uint16(RARE_BELOW - EPIC_BELOW), uint16(EPIC_BELOW - LEGENDARY_BELOW), uint16(LEGENDARY_BELOW)];
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setTraining(address training_) external onlyOwner {
        training = training_;
    }

    function setEconomy(address raid_, address treasury_) external onlyOwner {
        raid = raid_;
        treasury = treasury_;
    }

    function setGame(address game, bool allowed) external onlyOwner {
        isGame[game] = allowed;
    }

    function _forward(address to, euint64 amount) private {
        if (to == address(0)) return;
        FHE.allowTransient(amount, address(token));
        token.confidentialTransfer(to, amount);
    }
}
