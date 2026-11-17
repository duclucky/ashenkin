// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ChimeraLab} from "./ChimeraLab.sol";
import {IChimeraQuests, IChimeraTraining, IChimeraTreasury, Task} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraExpeditions — send creatures into the wastes for cZAMA loot
/// @notice The outcome is sealed the moment the creature leaves: success is decided on
///         ciphertexts (`power + element bonus + d64 > zone difficulty`) and the loot is an
///         encrypted roll. Hidden recessive alleles count, so well-bred lines bring back more.
///         Nobody — not even the keeper — learns how it went until the creature returns;
///         then only the keeper can decrypt the report. Loot is paid by the Arkhive Treasury.
contract ChimeraExpeditions is ZamaEthereumConfig, Ownable, IERC721Receiver {
    uint8 public constant ZONES = 3;
    uint8 public constant ELEMENT_VOID = 3;
    uint16 public constant ADVANTAGE_BONUS = 20;
    uint16 public constant VOID_BONUS = 10;
    uint16 public constant ROLL_BOUND = 64;

    struct Zone {
        uint32 duration;
        uint16 difficulty;
        uint8 element; // creatures that counter it get +20
        uint64 lootBase; // on success: lootBase + rand[0, lootRoll)
        uint64 lootRoll; // power of two
        uint64 consolation; // on failure
    }

    struct Expedition {
        uint32 creatureId;
        uint8 zone;
        bool claimed;
        address keeper;
        uint64 startedAt;
        uint64 endsAt;
    }

    ChimeraLab public immutable lab;
    IChimeraTreasury public immutable treasury;
    address public quests;
    address public training;
    uint8 public maxDailyRuns = 6;

    Zone[3] private _zones;
    uint256 public totalExpeditions;
    mapping(uint256 => Expedition) private _expeditions;
    mapping(uint256 => ebool) private _success;
    mapping(uint256 => euint64) private _loot;
    mapping(uint256 => bytes32) private _sent;
    mapping(address => uint256[]) private _expeditionsOf;
    mapping(address => mapping(uint256 => uint8)) public runsOn; // keeper => day => runs

    event ExpeditionStarted(uint256 indexed expeditionId, address indexed keeper, uint256 indexed creatureId, uint8 zone, uint64 endsAt);
    event ExpeditionReturned(
        uint256 indexed expeditionId,
        address indexed keeper,
        bytes32 successHandle,
        bytes32 lootHandle,
        bytes32 sentHandle
    );

    error NotOwner(uint256 id);
    error InvalidZone(uint8 zone);
    error DailyLimit();
    error NotKeeper(uint256 expeditionId);
    error StillAway(uint256 expeditionId, uint64 endsAt);
    error AlreadyClaimed(uint256 expeditionId);
    error UnexpectedNft();

    constructor(ChimeraLab lab_, IChimeraTreasury treasury_) Ownable(msg.sender) {
        lab = lab_;
        treasury = treasury_;
        // Ashen Dunes (Ember): easy, 3–7 cZAMA
        _zones[0] = Zone(10 minutes, 60, 0, 3e6, 1 << 22, 5e5);
        // Spore Hollows (Spore): medium, 8–16 cZAMA
        _zones[1] = Zone(30 minutes, 95, 1, 8e6, 1 << 23, 1e6);
        // Abyssal Trench (Tide): hard, 20–53 cZAMA
        _zones[2] = Zone(60 minutes, 130, 2, 20e6, 1 << 25, 2e6);
    }

    /// @notice Requires `lab.setApprovalForAll(expeditions, true)` (the creature is held in
    ///         custody until it returns).
    function start(uint256 creatureId, uint8 zone) external returns (uint256 expeditionId) {
        if (zone >= ZONES) revert InvalidZone(zone);
        if (lab.ownerOf(creatureId) != msg.sender) revert NotOwner(creatureId);
        uint256 day = block.timestamp / 1 days;
        if (runsOn[msg.sender][day] >= maxDailyRuns) revert DailyLimit();
        runsOn[msg.sender][day] += 1;

        Zone memory z = _zones[zone];
        (euint16 power, euint8 elem) = lab.battleProfile(creatureId);
        lab.transferFrom(msg.sender, address(this), creatureId);

        euint16 bonus = FHE.select(
            FHE.eq(elem, (z.element + 2) % 3),
            FHE.asEuint16(ADVANTAGE_BONUS),
            FHE.select(FHE.eq(elem, ELEMENT_VOID), FHE.asEuint16(VOID_BONUS), FHE.asEuint16(0))
        );
        euint16 score = FHE.add(FHE.add(power, bonus), FHE.randEuint16(ROLL_BOUND));
        ebool success = FHE.gt(score, z.difficulty);
        euint64 loot = FHE.select(
            success,
            FHE.add(FHE.randEuint64(z.lootRoll), z.lootBase),
            FHE.asEuint64(z.consolation)
        );
        FHE.allowThis(success);
        FHE.allowThis(loot);

        expeditionId = ++totalExpeditions;
        uint64 endsAt = uint64(block.timestamp) + z.duration;
        _expeditions[expeditionId] = Expedition({
            creatureId: uint32(creatureId),
            zone: zone,
            claimed: false,
            keeper: msg.sender,
            startedAt: uint64(block.timestamp),
            endsAt: endsAt
        });
        _success[expeditionId] = success;
        _loot[expeditionId] = loot;
        _expeditionsOf[msg.sender].push(expeditionId);
        if (quests != address(0)) IChimeraQuests(quests).record(msg.sender, Task.EXPEDITION);
        emit ExpeditionStarted(expeditionId, msg.sender, creatureId, zone, endsAt);
    }

    /// @notice Bring the creature home, collect the loot and unseal the report (to you only).
    function claim(uint256 expeditionId) external {
        Expedition storage e = _expeditions[expeditionId];
        if (e.keeper != msg.sender) revert NotKeeper(expeditionId);
        if (e.claimed) revert AlreadyClaimed(expeditionId);
        if (block.timestamp < e.endsAt) revert StillAway(expeditionId, e.endsAt);
        e.claimed = true;

        lab.transferFrom(address(this), e.keeper, e.creatureId);
        if (training != address(0)) IChimeraTraining(training).grantXp(e.creatureId, xpFor(e.zone));

        euint64 loot = _loot[expeditionId];
        FHE.allowTransient(loot, address(treasury));
        euint64 sent = treasury.pay(e.keeper, loot);
        FHE.allow(_success[expeditionId], e.keeper);
        FHE.allow(loot, e.keeper);
        _sent[expeditionId] = FHE.toBytes32(sent);
        emit ExpeditionReturned(expeditionId, e.keeper, FHE.toBytes32(_success[expeditionId]), FHE.toBytes32(loot), FHE.toBytes32(sent));
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getZone(uint8 zone) external view returns (Zone memory) {
        return _zones[zone];
    }

    function getExpedition(
        uint256 expeditionId
    ) external view returns (Expedition memory e, bytes32 successHandle, bytes32 lootHandle, bytes32 sentHandle) {
        return (
            _expeditions[expeditionId],
            FHE.toBytes32(_success[expeditionId]),
            FHE.toBytes32(_loot[expeditionId]),
            _sent[expeditionId]
        );
    }

    function expeditionsOf(address keeper) external view returns (uint256[] memory) {
        return _expeditionsOf[keeper];
    }

    function runsToday(address keeper) external view returns (uint8) {
        return runsOn[keeper][block.timestamp / 1 days];
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setTraining(address training_) external onlyOwner {
        training = training_;
    }

    /// @notice XP a creature earns for returning from each zone
    function xpFor(uint8 zone) public pure returns (uint32) {
        return zone == 0 ? 10 : zone == 1 ? 25 : 50;
    }

    function setQuests(address quests_) external onlyOwner {
        quests = quests_;
    }

    function setZone(uint8 zone, Zone calldata z) external onlyOwner {
        if (zone >= ZONES) revert InvalidZone(zone);
        _zones[zone] = z;
    }

    function setMaxDailyRuns(uint8 n) external onlyOwner {
        maxDailyRuns = n;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(lab)) revert UnexpectedNft();
        return IERC721Receiver.onERC721Received.selector;
    }
}
