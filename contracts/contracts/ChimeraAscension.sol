// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ChimeraLab} from "./ChimeraLab.sol";
import {IChimeraTraining} from "./interfaces/IChimeraEconomy.sol";

interface ITrainingRoom {
    function xpRoomToday(uint256 creatureId) external view returns (uint32);
}

interface IColosseumDefenders {
    function getDefender(
        uint256 id
    ) external view returns (address keeper, uint64 since, bool active, uint32 replans, bytes32 stakeHandle, bytes32 planHandle);
}

interface IRelicSlots {
    function slotsOf(uint256 creatureId) external view returns (uint256[2] memory);
}

/// @title ChimeraAscension — offer a spare creature to power up another
/// @notice Wild captures and extra hatchlings pile up. At the Ascension altar a keeper offers
///         one of them: it is locked in this contract forever (a creature sink) and the hero
///         gains `30 + 10 × generation` XP (max 120), still bound by the daily XP cap.
///         The hero's hidden power still rises only through Training's encrypted level-up
///         rolls, so ascending shortens the grind without revealing anything.
contract ChimeraAscension is Ownable {
    ChimeraLab public immutable lab;
    address public immutable training;
    address public colosseum;
    address public relics;

    uint32 public constant BASE_XP = 30;
    uint32 public constant XP_PER_GEN = 10;
    uint32 public constant MAX_XP = 120;

    uint256 public totalAscensions;
    mapping(address => uint32) public ascensions;
    mapping(uint256 => uint256) public offeredTo; // offering → hero

    event Ascended(uint256 indexed heroId, uint256 indexed offeringId, address indexed keeper, uint16 generation, uint32 xp);
    event LinksUpdated(address colosseum, address relics);
    event RetiredForLineage(uint256 indexed offeringId, address indexed keeper);

    error SameCreature();
    error NotOwner(uint256 id);
    error StillDefending(uint256 id);
    error RelicsEquipped(uint256 id);
    error NoXpRoom(uint256 heroId);
    error LineageVaultNotConfigured();

    constructor(ChimeraLab lab_, address training_) Ownable(msg.sender) {
        lab = lab_;
        training = training_;
    }

    function xpFor(uint256 offeringId) public view returns (uint32) {
        uint32 xp = BASE_XP + XP_PER_GEN * uint32(lab.getCreature(offeringId).generation);
        return xp > MAX_XP ? MAX_XP : xp;
    }

    /// @notice Requires `lab.approve(ascension, offeringId)` or `setApprovalForAll`.
    function ascend(uint256 heroId, uint256 offeringId) external {
        if (heroId == offeringId) revert SameCreature();
        if (lab.ownerOf(heroId) != msg.sender) revert NotOwner(heroId);
        _checkOffering(offeringId);
        if (ITrainingRoom(training).xpRoomToday(heroId) == 0) revert NoXpRoom(heroId);

        uint16 gen = lab.getCreature(offeringId).generation;
        uint32 xp = xpFor(offeringId);
        lab.transferFrom(msg.sender, address(this), offeringId);
        IChimeraTraining(training).grantXp(heroId, xp);

        offeredTo[offeringId] = heroId;
        ascensions[msg.sender] += 1;
        totalAscensions += 1;
        emit Ascended(heroId, offeringId, msg.sender, gen, xp);
    }

    /// @notice Voluntary permanent retirement for a lineage charge, without requiring an XP recipient.
    function retire(uint256 offeringId) external {
        if (lab.retirementVault() != address(this)) revert LineageVaultNotConfigured();
        _checkOffering(offeringId);
        lab.transferFrom(msg.sender, address(this), offeringId);
        ascensions[msg.sender] += 1;
        totalAscensions += 1;
        emit RetiredForLineage(offeringId, msg.sender);
    }

    function _checkOffering(uint256 offeringId) private view {
        if (lab.ownerOf(offeringId) != msg.sender) revert NotOwner(offeringId);
        if (colosseum != address(0)) {
            (, , bool active, , , ) = IColosseumDefenders(colosseum).getDefender(offeringId);
            if (active) revert StillDefending(offeringId);
        }
        if (relics != address(0)) {
            uint256[2] memory s = IRelicSlots(relics).slotsOf(offeringId);
            if (s[0] != 0 || s[1] != 0) revert RelicsEquipped(offeringId);
        }
    }

    function setLinks(address colosseum_, address relics_) external onlyOwner {
        colosseum = colosseum_;
        relics = relics_;
        emit LinksUpdated(colosseum_, relics_);
    }
}
