// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {euint16, euint64} from "@fhevm/solidity/lib/FHE.sol";

/// @dev Daily task ids tracked by ChimeraQuests.
library Task {
    uint8 internal constant BREED = 0;
    uint8 internal constant BATTLE = 1;
    uint8 internal constant EXPEDITION = 2;
    uint8 internal constant RAID = 3;
    uint8 internal constant COUNT = 4;
}

interface IChimeraQuests {
    function record(address player, uint8 task) external;
}

interface IChimeraTreasury {
    /// @dev caller must `FHE.allowTransient(amount, treasury)` first
    function pay(address to, euint64 amount) external returns (euint64 sent);
}

interface IChimeraTraining {
    /// @dev called by game contracts (expeditions, raid, arena) when a creature earns XP
    function grantXp(uint256 creatureId, uint32 amount) external;

    /// @dev called by the lab inside `battleProfile`; the handle is allowed transiently to the lab
    function bonusOf(uint256 creatureId) external returns (euint16 bonus);

    function levelOf(uint256 creatureId) external view returns (uint8);
}

interface IChimeraRelics {
    /// @dev called by ChimeraTraining inside `bonusOf`; sum of the creature's equipped relics,
    ///      allowed transiently to the caller. Uninitialized when nothing is equipped.
    function bonusOf(uint256 creatureId) external returns (euint16 bonus);

    /// @dev free cache for prize winners (Oracle's Riddle, seasons)
    function grantCache(address to) external returns (uint256 relicId);
}
