// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChimeraQuests, IChimeraTreasury, Task} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraQuests — daily orders from the Arkhive
/// @notice Four daily tasks (breed, battle, expedition, raid) recorded by the game contracts,
///         a daily check-in streak, and a chest for finishing all four. Rewards are paid in
///         cZAMA by the Treasury and multiplied by the streak: +10% per consecutive day, up
///         to +100%. Days are UTC.
contract ChimeraQuests is ZamaEthereumConfig, Ownable, IChimeraQuests {
    uint64 public constant CHECKIN_REWARD = 1e6; // 1 cZAMA
    uint64 public constant TASK_REWARD = 2e6; // 2 cZAMA
    uint64 public constant CHEST_REWARD = 10e6; // 10 cZAMA
    uint8 public constant ALL_TASKS = (uint8(1) << Task.COUNT) - 1;
    uint32 public constant MAX_STREAK_BONUS = 10;

    struct Player {
        uint32 streak;
        uint32 lastCheckIn; // day index
        uint32 bestStreak;
        uint32 day; // day the masks below refer to
        uint8 done; // tasks completed that day
        uint8 claimedMask; // tasks claimed that day
        bool chestClaimed;
        uint64 earned; // lifetime nominal reward targets; actual receipts stay encrypted
    }

    IChimeraTreasury public immutable treasury;
    mapping(address => bool) public isGame;
    mapping(address => Player) private _players;
    mapping(address => bytes32) public lastRewardSent;

    event TaskDone(address indexed player, uint8 task, uint32 day);
    event CheckedIn(address indexed player, uint32 day, uint32 streak);
    event Rewarded(address indexed player, uint8 kind, uint64 amount); // 0–3 task, 4 check-in, 5 chest, 6 batch
    event GameUpdated(address game, bool allowed);
    event RewardSent(address indexed player, uint8 kind, bytes32 amountHandle);
    event RewardsClaimed(address indexed player, uint32 indexed day, uint8 tasks, bool checkIn, bool chest);

    error NotGame();
    error AlreadyCheckedIn();
    error TaskNotDone(uint8 task);
    error AlreadyClaimed();
    error ChestLocked();
    error NothingToClaim();
    error QuestDayChanged(uint32 expectedDay, uint32 actualDay);

    constructor(IChimeraTreasury treasury_) Ownable(msg.sender) {
        treasury = treasury_;
    }

    function economyVersion() external pure returns (uint8) { return 2; }
    function supportsClaimAll() external pure returns (bool) { return true; }

    function record(address player, uint8 task) external {
        if (!isGame[msg.sender]) revert NotGame();
        Player storage p = _roll(player);
        uint8 bit = uint8(1) << task;
        if (p.done & bit == 0) {
            p.done |= bit;
            emit TaskDone(player, task, p.day);
        }
    }

    function checkIn() external {
        Player storage p = _roll(msg.sender);
        _checkIn(p, _today());
        _reward(p, 4, CHECKIN_REWARD);
    }

    function claimTask(uint8 task) external {
        Player storage p = _roll(msg.sender);
        uint8 bit = uint8(1) << task;
        if (p.done & bit == 0) revert TaskNotDone(task);
        if (p.claimedMask & bit != 0) revert AlreadyClaimed();
        p.claimedMask |= bit;
        _reward(p, task, TASK_REWARD);
    }

    function claimChest() external {
        Player storage p = _roll(msg.sender);
        if (p.done != ALL_TASKS) revert ChestLocked();
        if (p.chestClaimed) revert AlreadyClaimed();
        p.chestClaimed = true;
        _reward(p, 5, CHEST_REWARD);
    }

    /// @notice Check in and claim outstanding rewards for the quoted UTC day with one Treasury transfer.
    function claimAll(uint32 expectedDay) external {
        uint32 today = _today();
        if (today != expectedDay) revert QuestDayChanged(expectedDay, today);
        Player storage p = _roll(msg.sender);
        bool checkInDue = p.lastCheckIn != today || p.streak == 0;
        uint8 tasks = p.done & ALL_TASKS & ~p.claimedMask;
        bool chestDue = p.done == ALL_TASKS && !p.chestClaimed;
        if (!checkInDue && tasks == 0 && !chestDue) revert NothingToClaim();

        uint64 base;
        if (checkInDue) {
            _checkIn(p, today);
            base = CHECKIN_REWARD;
        }
        for (uint8 task; task < Task.COUNT; ++task) {
            if (tasks & (uint8(1) << task) != 0) base += TASK_REWARD;
        }
        p.claimedMask |= tasks;
        if (chestDue) {
            p.chestClaimed = true;
            base += CHEST_REWARD;
        }
        emit RewardsClaimed(msg.sender, today, tasks, checkInDue, chestDue);
        _reward(p, 6, base);
    }

    // ═════════════════════════════ views ═════════════════════════════

    /// @return p the player's record with today's masks (zeroed if stale)
    /// @return multiplier reward multiplier in percent (100..200)
    /// @return today current UTC day index
    function status(address player) external view returns (Player memory p, uint32 multiplier, uint32 today) {
        p = _players[player];
        today = _today();
        if (p.day != today) {
            p.day = today;
            p.done = 0;
            p.claimedMask = 0;
            p.chestClaimed = false;
        }
        if (p.lastCheckIn + 1 < today) p.streak = 0; // streak broken
        multiplier = _multiplier(p, today);
    }

    function setGame(address game, bool allowed) external onlyOwner {
        isGame[game] = allowed;
        emit GameUpdated(game, allowed);
    }

    // ═════════════════════════════ internals ═════════════════════════════

    function _today() private view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    function _checkIn(Player storage p, uint32 today) private {
        if (p.lastCheckIn == today && p.streak > 0) revert AlreadyCheckedIn();
        p.streak = (p.lastCheckIn + 1 == today) ? p.streak + 1 : 1;
        p.lastCheckIn = today;
        if (p.streak > p.bestStreak) p.bestStreak = p.streak;
        emit CheckedIn(msg.sender, today, p.streak);
    }

    function _roll(address player) private returns (Player storage p) {
        p = _players[player];
        uint32 today = _today();
        if (p.day != today) {
            p.day = today;
            p.done = 0;
            p.claimedMask = 0;
            p.chestClaimed = false;
        }
    }

    function _multiplier(Player memory p, uint32 today) private pure returns (uint32) {
        if (p.lastCheckIn != today || p.streak == 0) return 100;
        uint32 bonus = p.streak - 1;
        if (bonus > MAX_STREAK_BONUS) bonus = MAX_STREAK_BONUS;
        return 100 + bonus * 10;
    }

    function _reward(Player storage p, uint8 kind, uint64 base) private {
        uint64 amount = (base * _multiplier(p, _today())) / 100;
        p.earned += amount;
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(treasury));
        euint64 sent = treasury.pay(msg.sender, a);
        lastRewardSent[msg.sender] = FHE.toBytes32(sent);
        emit RewardSent(msg.sender, kind, FHE.toBytes32(sent));
        emit Rewarded(msg.sender, kind, amount);
    }
}
