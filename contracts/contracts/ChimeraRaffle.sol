// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint16, euint64, eaddress, externalEuint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IChimeraRelics} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraRaffle — the Sealed Raffle
/// @notice Buy any number of tickets; nobody can see how many you hold, how big the pot is,
///         or who is currently winning — not even this contract.
///
///         The winner is picked on the fly with weighted reservoir sampling over encrypted values:
///         each purchase of k tickets takes the lead with probability k / total, decided by a
///         fresh `FHE.randEuint32` compared against encrypted ticket counts. The leader is an
///         `eaddress`. At the draw, only two values are opened with a KMS proof: the winner and
///         the pot. Everything else (each keeper's ticket count, the order of leads) stays sealed.
///
///         Why the pot is sealed until the draw: a public pot changes with every purchase, so the
///         difference would reveal each buyer's ticket count.
contract ChimeraRaffle is Ownable, ZamaEthereumConfig {
    uint64 public constant TICKET_PRICE = 1_000_000; // 1 cZAMA
    uint16 public constant MAX_PER_BUY = 50;
    uint64 public constant RAKE_PCT = 10; // to the Treasury
    uint32 private constant SCALE = 65536;

    struct Round {
        uint64 startedAt;
        uint64 endsAt;
        uint32 entries;
        uint32 players;
        bool drawing;
        bool done;
        address winner;
        uint64 pot;
        uint256 relicId;
    }

    IERC7984 public immutable token;
    address public treasury;
    address public relics;
    uint64 public duration = 3 days;

    uint32 public currentRound;
    mapping(uint32 => Round) private _rounds;
    mapping(uint32 => euint64) private _total;
    mapping(uint32 => euint64) private _pot;
    mapping(uint32 => eaddress) private _leader;
    mapping(uint32 => mapping(address => euint64)) private _tickets;
    mapping(uint32 => mapping(address => bool)) public entered;
    mapping(address => uint32) public wins;

    event Entered(uint32 indexed round, address indexed keeper, bytes32 ticketsHandle);
    event DrawRequested(uint32 indexed round, bytes32 winnerHandle, bytes32 potHandle);
    event Drawn(uint32 indexed round, address indexed winner, uint64 pot, uint64 prize, uint256 relicId);
    event RoundStarted(uint32 indexed round, uint64 endsAt);

    error RoundClosed();
    error RoundOpen();
    error AlreadyDrawing();
    error NotDrawing();

    constructor(IERC7984 token_, address treasury_) Ownable(msg.sender) {
        token = token_;
        treasury = treasury_;
        _start();
    }

    // ═════════════════════════════ play ═════════════════════════════

    /// @notice Buy up to 50 sealed tickets (1 cZAMA each). An unpaid purchase counts as 0 tickets.
    function buy(externalEuint16 count, bytes calldata inputProof) external {
        uint32 rid = currentRound;
        Round storage r = _rounds[rid];
        if (block.timestamp >= r.endsAt || r.drawing) revert RoundClosed();

        euint64 k = FHE.asEuint64(FHE.min(FHE.fromExternal(count, inputProof), MAX_PER_BUY));
        euint64 cost = FHE.mul(k, TICKET_PRICE);
        FHE.allowTransient(cost, address(token));
        euint64 paid = token.confidentialTransferFrom(msg.sender, address(this), cost);
        k = FHE.select(FHE.eq(paid, cost), k, FHE.asEuint64(0));

        euint64 total = FHE.add(_total[rid], k);
        _total[rid] = total;
        _pot[rid] = FHE.add(_pot[rid], paid);

        // take the lead with probability k / total
        euint64 roll = FHE.asEuint64(FHE.randEuint32(SCALE));
        ebool lead = FHE.lt(FHE.mul(roll, total), FHE.mul(k, uint64(SCALE)));
        _leader[rid] = FHE.select(lead, FHE.asEaddress(msg.sender), _leader[rid]);

        euint64 mine = FHE.add(_tickets[rid][msg.sender], k);
        _tickets[rid][msg.sender] = mine;

        FHE.allowThis(total);
        FHE.allowThis(_pot[rid]);
        FHE.allowThis(_leader[rid]);
        FHE.allowThis(mine);
        FHE.allow(mine, msg.sender);

        r.entries += 1;
        if (!entered[rid][msg.sender]) {
            entered[rid][msg.sender] = true;
            r.players += 1;
        }
        emit Entered(rid, msg.sender, FHE.toBytes32(mine));
    }

    /// @notice After the round ends, anyone opens the winner and the pot for public decryption.
    function draw() external {
        uint32 rid = currentRound;
        Round storage r = _rounds[rid];
        if (block.timestamp < r.endsAt) revert RoundOpen();
        if (r.drawing) revert AlreadyDrawing();
        if (r.entries == 0) {
            // nobody played: just run it again
            r.endsAt = uint64(block.timestamp) + duration;
            emit RoundStarted(rid, r.endsAt);
            return;
        }
        r.drawing = true;
        FHE.makePubliclyDecryptable(_leader[rid]);
        FHE.makePubliclyDecryptable(_pot[rid]);
        emit DrawRequested(rid, FHE.toBytes32(_leader[rid]), FHE.toBytes32(_pot[rid]));
    }

    /// @notice Anyone finalizes with the KMS proof: pays the winner, refills the Treasury, next round.
    /// @param cleartexts abi.encode(address winner, uint64 pot)
    function finalize(bytes calldata cleartexts, bytes calldata proof) external {
        uint32 rid = currentRound;
        Round storage r = _rounds[rid];
        if (!r.drawing) revert NotDrawing();
        bytes32[] memory handles = new bytes32[](2);
        handles[0] = FHE.toBytes32(_leader[rid]);
        handles[1] = FHE.toBytes32(_pot[rid]);
        FHE.checkSignatures(handles, cleartexts, proof);
        (address winner, uint64 pot) = abi.decode(cleartexts, (address, uint64));

        r.done = true;
        r.winner = winner;
        r.pot = pot;
        uint64 rake = (pot * RAKE_PCT) / 100;
        uint64 prize = pot - rake;
        if (winner != address(0)) {
            _pay(winner, prize);
            _pay(treasury, rake);
            wins[winner] += 1;
            if (relics != address(0)) r.relicId = IChimeraRelics(relics).grantCache(winner);
        } else {
            _pay(treasury, pot);
        }
        emit Drawn(rid, winner, pot, winner != address(0) ? prize : 0, r.relicId);
        _start();
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getRound(uint32 rid) external view returns (Round memory round, bytes32 winnerHandle, bytes32 potHandle) {
        round = _rounds[rid];
        // the sealed handles are only exposed once they are publicly decryptable
        if (round.drawing) {
            winnerHandle = FHE.toBytes32(_leader[rid]);
            potHandle = FHE.toBytes32(_pot[rid]);
        }
    }

    /// @notice Your sealed ticket count for a round (decrypt it with your key).
    function ticketsHandle(uint32 rid, address keeper) external view returns (bytes32) {
        return FHE.toBytes32(_tickets[rid][keeper]);
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setRelics(address relics_) external onlyOwner {
        relics = relics_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
    }

    /// @notice Applies from the next round; `applyNow` also moves the current deadline (demos).
    function setDuration(uint64 d, bool applyNow) external onlyOwner {
        duration = d;
        if (applyNow) _rounds[currentRound].endsAt = _rounds[currentRound].startedAt + d;
    }

    function _pay(address to, uint64 amount) private {
        if (amount == 0) return;
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(token));
        token.confidentialTransfer(to, a);
    }

    function _start() private {
        uint32 rid = ++currentRound;
        _rounds[rid].startedAt = uint64(block.timestamp);
        _rounds[rid].endsAt = uint64(block.timestamp) + duration;
        _total[rid] = FHE.asEuint64(0);
        _pot[rid] = FHE.asEuint64(0);
        _leader[rid] = FHE.asEaddress(address(0));
        FHE.allowThis(_total[rid]);
        FHE.allowThis(_pot[rid]);
        FHE.allowThis(_leader[rid]);
        emit RoundStarted(rid, _rounds[rid].endsAt);
    }
}
