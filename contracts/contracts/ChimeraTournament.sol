// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ChimeraLab} from "./ChimeraLab.sol";
import {ChimeraCombat} from "./ChimeraCombat.sol";

/// @notice An eight-keeper knockout funded in an ordinary ERC-20 before registration opens.
contract ChimeraTournament is ZamaEthereumConfig, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Funding, Registration, Active, Complete, Cancelled }
    struct Match {
        address left;
        address right;
        address winner;
        uint64 deadline;
        uint8 sealedPlans;
        uint8 rounds;
        bool done;
        bool forfeit;
    }

    uint16 public constant MAX_POWER_GAP = 10;
    ChimeraLab public immutable lab;
    IERC20 public immutable prizeToken;
    address public immutable sponsor;
    uint128 public immutable prize;
    uint64 public immutable registrationEndsAt;
    uint64 public immutable matchWindow;
    Status public status;
    uint8 public joined;

    address[8] public roster;
    mapping(address => bool) public invited;
    mapping(address => uint256) public specimenOf;
    mapping(uint256 => bool) public specimenEntered;
    Match[7] public matches;
    mapping(uint8 => euint8) private _firstPlan;
    mapping(uint8 => ebool[3]) private _roundWins;
    mapping(address => uint256) public claimable;

    event Funded(address indexed sponsor, uint128 prize);
    event Joined(address indexed keeper, uint256 indexed specimen);
    event BracketStarted();
    event MatchOpened(uint8 indexed matchId, address indexed left, address indexed right, uint64 deadline);
    event PlanSealed(uint8 indexed matchId, address indexed keeper);
    event MatchReady(uint8 indexed matchId, bytes32[3] roundHandles);
    event MatchResolved(uint8 indexed matchId, address indexed winner, uint8 rounds, bool forfeit);
    event BracketClosed(bool cancelled);
    event PrizeClaimed(address indexed keeper, uint256 amount);

    error InvalidConfig();
    error FundingUnavailable();
    error InexactTransfer();
    error RegistrationClosed();
    error InvalidEntry();
    error MatchUnavailable();
    error PlanUnavailable();
    error NothingToClaim();

    constructor(ChimeraLab lab_, IERC20 prizeToken_, uint128 prize_, uint64 registrationEndsAt_, uint64 matchWindow_, address[8] memory roster_) {
        if (address(lab_) == address(0) || address(prizeToken_) == address(0) || prize_ < 10 || registrationEndsAt_ <= block.timestamp || matchWindow_ == 0) revert InvalidConfig();
        lab = lab_;
        prizeToken = prizeToken_;
        sponsor = msg.sender;
        prize = prize_;
        registrationEndsAt = registrationEndsAt_;
        matchWindow = matchWindow_;
        for (uint8 i = 0; i < 8; i++) {
            address keeper = roster_[i];
            if (keeper == address(0) || invited[keeper]) revert InvalidConfig();
            roster[i] = keeper;
            invited[keeper] = true;
        }
    }

    function fund() external nonReentrant {
        if (msg.sender != sponsor || status != Status.Funding || block.timestamp >= registrationEndsAt) revert FundingUnavailable();
        if (!lab.isCombat(address(this))) revert FundingUnavailable();
        uint256 before = prizeToken.balanceOf(address(this));
        prizeToken.safeTransferFrom(sponsor, address(this), prize);
        if (prizeToken.balanceOf(address(this)) - before != prize) revert InexactTransfer();
        status = Status.Registration;
        emit Funded(sponsor, prize);
    }

    function join(uint256 specimen) external {
        if (status != Status.Registration || block.timestamp >= registrationEndsAt) revert RegistrationClosed();
        if (!invited[msg.sender] || specimenOf[msg.sender] != 0 || specimenEntered[specimen] || !_owns(msg.sender, specimen)) revert InvalidEntry();
        specimenOf[msg.sender] = specimen;
        specimenEntered[specimen] = true;
        joined++;
        emit Joined(msg.sender, specimen);
    }

    function start() external {
        if (status != Status.Registration || (joined < 8 && block.timestamp < registrationEndsAt)) revert RegistrationClosed();
        if (joined < 8) {
            status = Status.Cancelled;
            claimable[sponsor] = prize;
            emit BracketClosed(true);
            return;
        }
        status = Status.Active;
        emit BracketStarted();
        for (uint8 i = 0; i < 4; i++) _open(i, roster[2 * i], roster[2 * i + 1]);
    }

    function sealPlan(uint8 id, externalEuint8 plan, bytes calldata inputProof) external {
        Match storage m = _activeMatch(id);
        if (block.timestamp >= m.deadline || (msg.sender != m.left && msg.sender != m.right)) revert PlanUnavailable();
        uint8 seat = msg.sender == m.left ? 1 : 2;
        if ((m.sealedPlans & seat) != 0 || !_owns(msg.sender, specimenOf[msg.sender])) revert PlanUnavailable();
        euint8 moves = FHE.fromExternal(plan, inputProof);
        emit PlanSealed(id, msg.sender);
        if (m.sealedPlans == 0) {
            m.sealedPlans = seat;
            _firstPlan[id] = moves;
            FHE.allowThis(moves);
            return;
        }

        m.sealedPlans = 3;
        address other = seat == 1 ? m.right : m.left;
        if (!_owns(other, specimenOf[other])) {
            _resolve(id, msg.sender, 0, true);
            return;
        }
        euint8 first = _firstPlan[id];
        _firstPlan[id] = euint8.wrap(bytes32(0));
        _fight(id, m, seat == 1 ? moves : first, seat == 1 ? first : moves);
    }

    function settle(uint8 id, bytes calldata cleartexts, bytes calldata proof) external {
        Match storage m = _activeMatch(id);
        if (m.sealedPlans != 3) revert MatchUnavailable();
        bytes32[3] memory fixedHandles = roundHandles(id);
        bytes32[] memory handles = new bytes32[](3);
        for (uint8 i = 0; i < 3; i++) handles[i] = fixedHandles[i];
        FHE.checkSignatures(handles, cleartexts, proof);
        (bool a, bool b, bool c) = abi.decode(cleartexts, (bool, bool, bool));
        uint8 mask = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0);
        bool leftWon = (a && (b || c)) || (b && c);
        _resolve(id, leftWon ? m.left : m.right, mask, false);
    }

    function resolveNoShow(uint8 id) external {
        Match storage m = _activeMatch(id);
        if (block.timestamp < m.deadline || m.sealedPlans == 3) revert MatchUnavailable();
        address keeper = m.sealedPlans == 1 ? m.left : m.sealedPlans == 2 ? m.right : address(0);
        if (!_owns(keeper, specimenOf[keeper])) keeper = address(0);
        _resolve(id, keeper, 0, true);
    }

    function claim(address keeper) external nonReentrant {
        uint256 amount = claimable[keeper];
        if (amount == 0) revert NothingToClaim();
        delete claimable[keeper];
        uint256 before = prizeToken.balanceOf(keeper);
        prizeToken.safeTransfer(keeper, amount);
        if (prizeToken.balanceOf(keeper) - before != amount) revert InexactTransfer();
        emit PrizeClaimed(keeper, amount);
    }

    function roundHandles(uint8 id) public view returns (bytes32[3] memory handles) {
        for (uint8 i = 0; i < 3; i++) handles[i] = FHE.toBytes32(_roundWins[id][i]);
    }

    function _activeMatch(uint8 id) private view returns (Match storage m) {
        if (status != Status.Active || id >= 7) revert MatchUnavailable();
        m = matches[id];
        if (m.deadline == 0 || m.done) revert MatchUnavailable();
    }

    function _owns(address keeper, uint256 specimen) private view returns (bool) {
        if (keeper == address(0) || specimen == 0) return false;
        try lab.ownerOf(specimen) returns (address current) { return current == keeper; }
        catch { return false; }
    }

    function _fight(uint8 id, Match storage m, euint8 left, euint8 right) private {
        (euint16 powerA, euint8 elementA) = lab.battleProfile(specimenOf[m.left]);
        (euint16 powerB, euint8 elementB) = lab.battleProfile(specimenOf[m.right]);
        (powerA, powerB) = ChimeraCombat.capGap(
            ChimeraCombat.withElement(powerA, elementA, elementB),
            ChimeraCombat.withElement(powerB, elementB, elementA), MAX_POWER_GAP
        );
        for (uint8 i = 0; i < 3; i++) _roundWins[id][i] = ChimeraCombat.round(powerA, powerB, left, right, i, true);
        emit MatchReady(id, roundHandles(id));
    }

    function _open(uint8 id, address left, address right) private {
        uint64 deadline = uint64(block.timestamp) + matchWindow;
        matches[id].left = left;
        matches[id].right = right;
        matches[id].deadline = deadline;
        emit MatchOpened(id, left, right, deadline);
        if (left == address(0) || right == address(0)) {
            address keeper = left == address(0) ? right : left;
            _resolve(id, _owns(keeper, specimenOf[keeper]) ? keeper : address(0), 0, true);
        }
    }

    function _resolve(uint8 id, address keeper, uint8 mask, bool forfeit) private {
        Match storage m = matches[id];
        m.winner = keeper;
        m.done = true;
        m.rounds = mask;
        m.forfeit = forfeit;
        _firstPlan[id] = euint8.wrap(bytes32(0));
        emit MatchResolved(id, keeper, mask, forfeit);
        if (id == 6) {
            _close();
            return;
        }
        uint8 other = id ^ 1;
        if (matches[other].done) {
            uint8 left = id & 0xfe;
            _open(id < 4 ? 4 + id / 2 : 6, matches[left].winner, matches[left + 1].winner);
        }
    }

    function _close() private {
        address champion = matches[6].winner;
        uint256 tenth = uint256(prize) / 10;
        _allocate(champion, uint256(prize) - 4 * tenth);
        _allocate(_loser(matches[6]), 2 * tenth);
        _allocate(_loser(matches[4]), tenth);
        _allocate(_loser(matches[5]), tenth);
        status = Status.Complete;
        emit BracketClosed(false);
    }

    function _loser(Match storage m) private view returns (address) {
        // A player earns a placement by reaching this match. An unfilled place goes back to the sponsor.
        return m.winner == address(0) ? address(0) : m.winner == m.left ? m.right : m.left;
    }

    function _allocate(address keeper, uint256 amount) private {
        claimable[keeper == address(0) ? sponsor : keeper] += amount;
    }
}
