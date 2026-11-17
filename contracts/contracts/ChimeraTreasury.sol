// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IChimeraTreasury} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraTreasury — the Arkhive Treasury
/// @notice Holds the cZAMA that pays expedition loot and quest rewards. It is refilled by
///         40% of every breeding fee (and can be topped up by anyone with a plain
///         confidential transfer). Payouts are confidential; the *reserve* is published
///         (made publicly decryptable) so anyone can audit that the game stays solvent.
///         Daily outflow is min(1% of the first payout's reserve, 3,000 cZAMA). Requests are
///         clipped to the remaining budget and balance, without revealing individual balances.
///         Fees recirculate into reward pools; they do not burn token supply.
contract ChimeraTreasury is ZamaEthereumConfig, Ownable, IChimeraTreasury {
    IERC7984 public immutable token;
    mapping(address => bool) public isGame;
    uint256 public payouts;
    bytes32 public reserveHandle;
    uint64 public reservePublishedAt;
    uint64 public constant DAILY_BUDGET_CAP = 3_000_000_000;
    uint64 public budgetDay;
    euint64 private _dailyBudget;
    euint64 private _remainingBudget;
    bool private _budgetStarted;

    event GameUpdated(address game, bool allowed);
    event Paid(address indexed to, address indexed game);
    event ReservePublished(bytes32 handle);
    event BudgetPublished(uint64 indexed day, bytes32 openingBudget, bytes32 remainingBudget);

    error NotGame();

    constructor(IERC7984 token_) Ownable(msg.sender) {
        token = token_;
    }

    function pay(address to, euint64 amount) external returns (euint64 sent) {
        if (!isGame[msg.sender]) revert NotGame();
        euint64 balance = token.confidentialBalanceOf(address(this));
        if (!FHE.isInitialized(balance)) balance = FHE.asEuint64(0);
        uint64 today = uint64(block.timestamp / 1 days);
        if (!_budgetStarted || budgetDay != today) {
            budgetDay = today;
            _budgetStarted = true;
            _dailyBudget = FHE.min(FHE.div(balance, 100), DAILY_BUDGET_CAP);
            _remainingBudget = _dailyBudget;
            FHE.allowThis(_dailyBudget);
        }
        euint64 affordable = FHE.min(amount, FHE.min(balance, _remainingBudget));
        FHE.allowTransient(affordable, address(token));
        sent = token.confidentialTransfer(to, affordable);
        _remainingBudget = FHE.sub(_remainingBudget, sent);
        FHE.allowThis(_remainingBudget);
        FHE.allowTransient(sent, msg.sender);
        payouts += 1;
        emit Paid(to, msg.sender);
        _publish();
        FHE.makePubliclyDecryptable(_dailyBudget);
        FHE.makePubliclyDecryptable(_remainingBudget);
        emit BudgetPublished(budgetDay, FHE.toBytes32(_dailyBudget), FHE.toBytes32(_remainingBudget));
    }

    function economyVersion() external pure returns (uint8) { return 2; }

    function budgetHandles() external view returns (bytes32 opening, bytes32 remaining) {
        return (FHE.toBytes32(_dailyBudget), FHE.toBytes32(_remainingBudget));
    }

    /// @notice Anyone may re-publish the current reserve (e.g. after deposits).
    function publishReserve() external returns (bytes32) {
        return _publish();
    }

    function setGame(address game, bool allowed) external onlyOwner {
        isGame[game] = allowed;
        emit GameUpdated(game, allowed);
    }

    function _publish() private returns (bytes32 h) {
        euint64 bal = token.confidentialBalanceOf(address(this));
        if (!FHE.isInitialized(bal)) return bytes32(0);
        FHE.makePubliclyDecryptable(bal);
        h = FHE.toBytes32(bal);
        reserveHandle = h;
        reservePublishedAt = uint64(block.timestamp);
        emit ReservePublished(h);
    }
}
