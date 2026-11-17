// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IChimeraTraining, IChimeraRelics} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraTraining — earned power that nobody else can read
/// @notice Creatures earn public XP on expeditions, World Boss strikes and arena battles.
///         The owner spends XP plus a cZAMA fee to level up. The *level* is public (it drives
///         the evolution stage you see on the sprite), but every level adds an encrypted,
///         randomly rolled bonus to the creature's combat power that only its owner can
///         decrypt. Opponents know a creature trained — never how strong it became.
/// @dev The bonus is keyed by creature id and is NOT inherited by offspring: genes are innate,
///      power is earned. The fee is pulled confidentially into escrow; once the KMS proves
///      `paid == fee`, `completeTraining` levels the creature and splits the fee 60% to the
///      World Boss pot / 40% to the Treasury (same as breeding).
///      v2 (Season of Masks): XP earned per creature is capped per UTC day (`dailyXpCap`), so
///      levels reward days of play rather than hours of grinding; equipped relics
///      (ChimeraRelics) are folded into `bonusOf`, so every mode sees relic power without a lab
///      redeploy; `migrate` carries public levels over from v1.
contract ChimeraTraining is IChimeraTraining, Ownable, ZamaEthereumConfig {
    uint8 public constant MAX_LEVEL = 10;
    uint8 public constant STAGE_ONE = 5;
    uint8 public constant STAGE_TWO = 10;
    uint8 public constant EVOLUTION_BONUS = 4;
    uint64 private constant CZAMA = 1e6;
    uint64 public constant RAID_SHARE_PCT = 60;
    uint32 public dailyXpCap = 120;
    address public relics;
    bool public migrationOpen = true;

    struct Profile {
        uint32 xp;
        uint8 level;
        bool pending;
        uint16 trainings;
        uint64 trainedAt;
        address keeper; // who started the pending session
        uint32 spentXp; // XP held for the pending session (refunded if unpaid)
        uint64 fee; // fee of the pending session
    }

    IERC721 public immutable lab;
    IERC7984 public immutable token;
    address public raid;
    address public treasury;

    mapping(address => bool) public isGame;
    mapping(uint256 => Profile) private _profiles;
    mapping(uint256 => euint16) private _bonus;
    mapping(uint256 => euint64) private _escrow;
    mapping(uint256 => ebool) private _paid;
    mapping(uint256 => uint32) public xpDay; // UTC day of the last grant
    mapping(uint256 => uint32) public xpToday; // XP granted on `xpDay`

    uint64 public feesCollected;
    uint32 public totalLevels;
    uint64 public totalXp;

    event XpGranted(uint256 indexed creatureId, address indexed game, uint32 amount, uint32 xp);
    event TrainingStarted(uint256 indexed creatureId, address indexed keeper, uint8 level, uint64 fee, bytes32 paidHandle);
    event LevelUp(uint256 indexed creatureId, address indexed keeper, uint8 level, uint8 stage, bytes32 bonusHandle);
    event TrainingUnpaid(uint256 indexed creatureId, address indexed keeper);
    event GameUpdated(address game, bool allowed);
    event EconomyUpdated(address raid, address treasury);
    event XpCapped(uint256 indexed creatureId, address indexed game, uint32 requested, uint32 granted);
    event Migrated(uint256 indexed creatureId, uint8 level, uint32 xp);
    event RelicsUpdated(address relics);
    event XpCapUpdated(uint32 cap);

    error NotGame();
    error NotLab();
    error NotOwner(uint256 creatureId);
    error MaxLevel(uint256 creatureId);
    error NotEnoughXp(uint256 creatureId, uint32 have, uint32 need);
    error TrainingPending(uint256 creatureId);
    error NoTraining(uint256 creatureId);

    constructor(IERC721 lab_, IERC7984 token_) Ownable(msg.sender) {
        lab = lab_;
        token = token_;
    }

    // ═════════════════════════════ game hooks ═════════════════════════════

    function grantXp(uint256 creatureId, uint32 amount) external {
        if (!isGame[msg.sender]) revert NotGame();
        uint32 day = uint32(block.timestamp / 1 days);
        if (xpDay[creatureId] != day) {
            xpDay[creatureId] = day;
            xpToday[creatureId] = 0;
        }
        uint32 room = dailyXpCap > xpToday[creatureId] ? dailyXpCap - xpToday[creatureId] : 0;
        uint32 granted = amount > room ? room : amount;
        if (granted < amount) emit XpCapped(creatureId, msg.sender, amount, granted);
        if (granted == 0) return;
        xpToday[creatureId] += granted;
        Profile storage p = _profiles[creatureId];
        p.xp += granted;
        totalXp += granted;
        emit XpGranted(creatureId, msg.sender, granted, p.xp);
    }

    /// @notice XP this creature can still earn today (UTC).
    function xpRoomToday(uint256 creatureId) external view returns (uint32) {
        if (xpDay[creatureId] != uint32(block.timestamp / 1 days)) return dailyXpCap;
        return dailyXpCap > xpToday[creatureId] ? dailyXpCap - xpToday[creatureId] : 0;
    }

    /// @dev trained bonus + equipped relics, handed to the lab for this transaction only.
    function bonusOf(uint256 creatureId) external returns (euint16 bonus) {
        if (msg.sender != address(lab)) revert NotLab();
        bonus = _bonus[creatureId];
        if (relics != address(0)) {
            euint16 gear = IChimeraRelics(relics).bonusOf(creatureId);
            if (FHE.isInitialized(gear)) bonus = FHE.isInitialized(bonus) ? FHE.add(bonus, gear) : gear;
        }
        if (FHE.isInitialized(bonus)) FHE.allowTransient(bonus, msg.sender);
    }

    // ═════════════════════════════ training ═════════════════════════════

    /// @notice Spend `xpToNext(level)` XP and `feeFor(level)` cZAMA to train one level.
    ///         Requires `token.setOperator(training, until)`. Finish with `completeTraining`.
    function train(uint256 creatureId) external {
        if (lab.ownerOf(creatureId) != msg.sender) revert NotOwner(creatureId);
        Profile storage p = _profiles[creatureId];
        if (p.pending) revert TrainingPending(creatureId);
        if (p.level >= MAX_LEVEL) revert MaxLevel(creatureId);
        uint32 need = xpToNext(p.level);
        if (p.xp < need) revert NotEnoughXp(creatureId, p.xp, need);

        uint64 fee = feeFor(p.level);
        p.xp -= need;
        p.spentXp = need;
        p.pending = true;
        p.keeper = msg.sender;
        p.fee = fee;

        euint64 price = FHE.asEuint64(fee);
        FHE.allowTransient(price, address(token));
        euint64 escrowed = token.confidentialTransferFrom(msg.sender, address(this), price);
        ebool paid = FHE.eq(escrowed, fee);
        FHE.allowThis(escrowed);
        FHE.allowThis(paid);
        FHE.makePubliclyDecryptable(paid);
        _escrow[creatureId] = escrowed;
        _paid[creatureId] = paid;
        emit TrainingStarted(creatureId, msg.sender, p.level, fee, FHE.toBytes32(paid));
    }

    /// @notice Anyone may complete a pending session with the KMS proof of its `paid` bit.
    /// @param cleartexts abi.encode(bool paid)
    function completeTraining(uint256 creatureId, bytes calldata cleartexts, bytes calldata proof) external {
        Profile storage p = _profiles[creatureId];
        if (!p.pending) revert NoTraining(creatureId);

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_paid[creatureId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        bool paid = abi.decode(cleartexts, (bool));
        p.pending = false;

        if (!paid) {
            p.xp += p.spentXp;
            p.spentXp = 0;
            emit TrainingUnpaid(creatureId, p.keeper);
            return;
        }

        p.spentXp = 0;
        p.level += 1;
        p.trainings += 1;
        p.trainedAt = uint64(block.timestamp);
        totalLevels += 1;
        feesCollected += p.fee;
        uint64 toRaid = (p.fee * RAID_SHARE_PCT) / 100;
        _forward(raid, toRaid);
        _forward(treasury, p.fee - toRaid);

        // encrypted gain: 2..5, +4 on evolution levels
        uint8 flat = (p.level == STAGE_ONE || p.level == STAGE_TWO) ? 2 + EVOLUTION_BONUS : 2;
        euint16 gain = FHE.asEuint16(FHE.add(FHE.randEuint8(4), flat));
        euint16 b = _bonus[creatureId];
        b = FHE.isInitialized(b) ? FHE.add(b, gain) : gain;
        FHE.allowThis(b);
        address owner_ = lab.ownerOf(creatureId);
        FHE.allow(b, owner_);
        _bonus[creatureId] = b;
        emit LevelUp(creatureId, owner_, p.level, stageOf(p.level), FHE.toBytes32(b));
    }

    /// @notice Re-grant decrypt rights on the trained bonus to the current owner (e.g. after a sale).
    function reveal(uint256 creatureId) external {
        if (lab.ownerOf(creatureId) != msg.sender) revert NotOwner(creatureId);
        euint16 b = _bonus[creatureId];
        if (FHE.isInitialized(b)) FHE.allow(b, msg.sender);
    }

    // ═════════════════════════════ views ═════════════════════════════

    function xpToNext(uint8 level) public pure returns (uint32) {
        return uint32(level + 1) * 10;
    }

    function feeFor(uint8 level) public pure returns (uint64) {
        return (3 + 2 * uint64(level)) * CZAMA;
    }

    function stageOf(uint8 level) public pure returns (uint8) {
        return level >= STAGE_TWO ? 2 : level >= STAGE_ONE ? 1 : 0;
    }

    function getProfile(
        uint256 creatureId
    ) external view returns (Profile memory profile, uint8 stage, bytes32 paidHandle, bytes32 bonusHandle) {
        profile = _profiles[creatureId];
        stage = stageOf(profile.level);
        paidHandle = FHE.toBytes32(_paid[creatureId]);
        bonusHandle = FHE.toBytes32(_bonus[creatureId]);
    }

    function levelOf(uint256 creatureId) external view returns (uint8) {
        return _profiles[creatureId].level;
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setGame(address game, bool allowed) external onlyOwner {
        isGame[game] = allowed;
        emit GameUpdated(game, allowed);
    }

    function setRelics(address relics_) external onlyOwner {
        relics = relics_;
        emit RelicsUpdated(relics_);
    }

    function setDailyXpCap(uint32 cap) external onlyOwner {
        dailyXpCap = cap;
        emit XpCapUpdated(cap);
    }

    /// @notice One-time carry-over of public progress from Training v1. Each migrated level
    ///         re-rolls its encrypted gain (2..5, +4 on evolution levels) — the v1 ciphertexts
    ///         are bound to the v1 contract and cannot be moved.
    function migrate(uint256[] calldata ids, uint8[] calldata levels, uint32[] calldata xps) external onlyOwner {
        require(migrationOpen, "migration closed");
        for (uint256 i = 0; i < ids.length; i++) {
            Profile storage p = _profiles[ids[i]];
            if (p.level != 0 || p.xp != 0 || p.pending) continue;
            uint8 lvl = levels[i] > MAX_LEVEL ? MAX_LEVEL : levels[i];
            p.level = lvl;
            p.trainings = lvl;
            p.xp = xps[i];
            totalLevels += lvl;
            if (lvl > 0) {
                uint16 flat = uint16(lvl) * 2;
                if (lvl >= STAGE_ONE) flat += EVOLUTION_BONUS;
                if (lvl >= STAGE_TWO) flat += EVOLUTION_BONUS;
                euint16 b = FHE.add(FHE.asEuint16(FHE.randEuint8(4)), flat);
                for (uint8 k = 1; k < lvl; k++) b = FHE.add(b, FHE.asEuint16(FHE.randEuint8(4)));
                FHE.allowThis(b);
                FHE.allow(b, lab.ownerOf(ids[i]));
                _bonus[ids[i]] = b;
            }
            emit Migrated(ids[i], lvl, xps[i]);
        }
    }

    function closeMigration() external onlyOwner {
        migrationOpen = false;
    }

    function setEconomy(address raid_, address treasury_) external onlyOwner {
        raid = raid_;
        treasury = treasury_;
        emit EconomyUpdated(raid_, treasury_);
    }

    function _forward(address to, uint64 amount) private {
        if (to == address(0) || amount == 0) return;
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(token));
        token.confidentialTransfer(to, a);
    }
}
