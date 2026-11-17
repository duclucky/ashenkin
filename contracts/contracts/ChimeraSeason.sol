// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IChimeraRelics, IChimeraTreasury} from "./interfaces/IChimeraEconomy.sol";

interface IColosseumStats {
    function wins(address) external view returns (uint32);
    function captures(address) external view returns (uint32);
    function sweeps(address) external view returns (uint32);
}

interface IOracleStats {
    function solves(address) external view returns (uint32);
}

interface ITreasuryToken {
    function token() external view returns (IERC7984);
}

interface IRaidStats {
    struct Boss {
        uint32 level;
        uint8 element;
        uint32 maxHp;
        uint32 raiders;
        uint32 strikes;
        uint64 spawnedAt;
        uint64 slainAt;
        address killer;
    }

    function currentLevel() external view returns (uint32);
    function joined(uint32 level, address keeper) external view returns (bool);
    function getBoss(uint32 level) external view returns (Boss memory boss, bytes32 bandHandle, bytes32 shareHandle);
}

/// @title ChimeraSeason — three on-chain thrones, King of the Hill
/// @notice A season lasts 14 days. Keepers join (their public counters are snapshotted) and
///         score only what they do afterwards:
///
///             Colosseum win ×3 · capture ×2 · 3-0 sweep ×1 · boss raid joined ×2
///             killing blow ×10 · Oracle riddle solved ×5
///
///         Anyone who out-scores a throne holder can take that throne — an O(1) comparison
///         of two live scores, no sorted leaderboard. When the season ends anyone can close it:
///         a funded Treasury pool is split with target weights 2,000 / 1,000 / 500. Actual
///         rewards are bounded by the Treasury's budget. Holders also get a Relic Cache and crown.
///         Only public counters feed the score; hidden power, stakes and loot stay hidden.
contract ChimeraSeason is ZamaEthereumConfig, Ownable {
    IColosseumStats public immutable colosseum;
    IOracleStats public immutable oracle;
    IRaidStats public immutable raid;
    IChimeraTreasury public immutable treasury;
    IChimeraRelics public relics;

    uint32 public constant MAX_RAID_SCAN = 64;

    struct Base {
        uint32 season;
        uint32 wins;
        uint32 captures;
        uint32 sweeps;
        uint32 solves;
        uint32 raidLevel;
        bool raidJoinedAtStart;
        uint64 joinedAt;
    }

    uint32 public season;
    uint64 public startedAt;
    uint64 public endsAt;
    uint64 public length = 14 days;
    uint64[3] public prizes = [uint64(2_000_000_000), uint64(1_000_000_000), uint64(500_000_000)];

    address[3] public thrones;
    mapping(address => Base) public baseOf;
    mapping(uint32 => uint32) public players;
    mapping(uint32 => address[3]) private _winners;
    mapping(uint32 => mapping(address => uint8)) public rankIn; // 1..3, soulbound crowns
    mapping(address => uint32) public crowns;
    mapping(uint32 => mapping(address => bytes32)) public prizePaid;

    event SeasonStarted(uint32 indexed season, uint64 startedAt, uint64 endsAt);
    event Joined(uint32 indexed season, address indexed keeper);
    event ThroneClaimed(uint32 indexed season, uint8 indexed seat, address indexed keeper, address previous, uint32 score);
    event SeasonEnded(uint32 indexed season, address[3] winners, uint32[3] scores);
    event PrizePaid(uint32 indexed season, address indexed keeper, bytes32 amountHandle);

    error SeasonOver();
    error SeasonRunning();
    error NotJoined();
    error AlreadyJoined();
    error BadSeat();
    error AlreadyHolding();
    error NotEnough(uint32 mine, uint32 holder);
    error PrizesTooLarge();

    constructor(IColosseumStats colosseum_, IOracleStats oracle_, IRaidStats raid_, IChimeraTreasury treasury_) Ownable(msg.sender) {
        colosseum = colosseum_;
        oracle = oracle_;
        raid = raid_;
        treasury = treasury_;
        _start();
    }

    // ═════════════════════════════ play ═════════════════════════════

    function join() external {
        if (block.timestamp >= endsAt) revert SeasonOver();
        Base storage b = baseOf[msg.sender];
        if (b.season == season) revert AlreadyJoined();
        uint32 lvl = raid.currentLevel();
        baseOf[msg.sender] = Base({
            season: season,
            wins: colosseum.wins(msg.sender),
            captures: colosseum.captures(msg.sender),
            sweeps: colosseum.sweeps(msg.sender),
            solves: oracle.solves(msg.sender),
            raidLevel: lvl,
            raidJoinedAtStart: lvl > 0 && raid.joined(lvl, msg.sender),
            joinedAt: uint64(block.timestamp)
        });
        players[season] += 1;
        emit Joined(season, msg.sender);
    }

    /// @notice Take `seat` (0 = first) if your live score beats its holder's live score.
    function claimThrone(uint8 seat) external {
        if (seat >= 3) revert BadSeat();
        if (block.timestamp >= endsAt) revert SeasonOver();
        if (baseOf[msg.sender].season != season) revert NotJoined();
        address holder = thrones[seat];
        if (holder == msg.sender) revert AlreadyHolding();
        uint32 mine = scoreOf(msg.sender);
        uint32 theirs = scoreOf(holder);
        if (mine == 0 || mine <= theirs) revert NotEnough(mine, theirs);
        for (uint8 i = 0; i < 3; i++) if (thrones[i] == msg.sender) thrones[i] = address(0);
        thrones[seat] = msg.sender;
        emit ThroneClaimed(season, seat, msg.sender, holder, mine);
    }

    /// @notice Anyone can close a finished season: pay the three holders and start the next one.
    function endSeason() external {
        if (block.timestamp < endsAt) revert SeasonRunning();
        uint32[3] memory scores;
        address[3] memory w = thrones;
        _payPrizes(w);
        for (uint8 i = 0; i < 3; i++) {
            address k = w[i];
            if (k == address(0)) continue;
            scores[i] = scoreOf(k);
            rankIn[season][k] = i + 1;
            crowns[k] += 1;
            if (address(relics) != address(0)) relics.grantCache(k);
        }
        _winners[season] = w;
        emit SeasonEnded(season, w, scores);
        delete thrones;
        _start();
    }

    /// @dev Ask for one affordable pool, so seat order cannot determine who gets funded.
    function _payPrizes(address[3] memory winners) private {
        uint64 total;
        uint8 last;
        for (uint8 i = 0; i < 3; i++) {
            if (winners[i] == address(0) || prizes[i] == 0) continue;
            total += prizes[i];
            last = i;
        }
        if (total == 0) return;
        euint64 requested = FHE.asEuint64(total);
        FHE.allowTransient(requested, address(treasury));
        euint64 funded = treasury.pay(address(this), requested);
        euint64 remaining = funded;
        IERC7984 token = ITreasuryToken(address(treasury)).token();
        for (uint8 i = 0; i < 3; i++) {
            if (winners[i] == address(0) || prizes[i] == 0) continue;
            // Wide intermediate keeps the full six-decimal precision without uint64 overflow.
            euint64 share = i == last ? remaining : FHE.asEuint64(FHE.div(FHE.mul(FHE.asEuint128(funded), uint128(prizes[i])), uint128(total)));
            FHE.allowTransient(share, address(token));
            euint64 sent = token.confidentialTransfer(winners[i], share);
            remaining = FHE.sub(remaining, sent);
            prizePaid[season][winners[i]] = FHE.toBytes32(sent);
            emit PrizePaid(season, winners[i], FHE.toBytes32(sent));
        }
    }

    // ═════════════════════════════ views ═════════════════════════════

    function scoreOf(address k) public view returns (uint32 s) {
        if (k == address(0)) return 0;
        Base memory b = baseOf[k];
        if (b.season != season) return 0;
        s += (colosseum.wins(k) - b.wins) * 3;
        s += (colosseum.captures(k) - b.captures) * 2;
        s += colosseum.sweeps(k) - b.sweeps;
        s += (oracle.solves(k) - b.solves) * 5;
        uint32 cur = raid.currentLevel();
        uint32 from = b.raidLevel == 0 ? 1 : b.raidLevel;
        if (cur > from + MAX_RAID_SCAN) from = cur - MAX_RAID_SCAN;
        for (uint32 l = from; l <= cur && l > 0; l++) {
            if (raid.joined(l, k) && !(l == b.raidLevel && b.raidJoinedAtStart)) s += 2;
            (IRaidStats.Boss memory boss, , ) = raid.getBoss(l);
            if (boss.killer == k && boss.slainAt >= b.joinedAt) s += 10;
        }
    }

    function getThrones() external view returns (address[3] memory holders, uint32[3] memory scores) {
        holders = thrones;
        for (uint8 i = 0; i < 3; i++) scores[i] = scoreOf(holders[i]);
    }

    function winnersOf(uint32 s) external view returns (address[3] memory) {
        return _winners[s];
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setRelics(IChimeraRelics relics_) external onlyOwner {
        relics = relics_;
    }

    function setPrizes(uint64[3] calldata p) external onlyOwner {
        if (uint256(p[0]) + p[1] + p[2] > type(uint64).max) revert PrizesTooLarge();
        prizes = p;
    }

    /// @notice Applies from the next season. Owner may also shorten the current one for demos.
    function setLength(uint64 len, bool applyNow) external onlyOwner {
        length = len;
        if (applyNow) endsAt = startedAt + len;
    }

    function _start() private {
        season += 1;
        startedAt = uint64(block.timestamp);
        endsAt = startedAt + length;
        emit SeasonStarted(season, startedAt, endsAt);
    }
}
