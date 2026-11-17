// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64, externalEuint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IChimeraRelics} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraOracle — the Oracle's Riddle, a sealed gene puzzle
/// @notice The Oracle keeps a secret genome of four genes, each 0..15, drawn with FHE
///         randomness. Keepers guess it: every guess is an encrypted input (so nobody can copy
///         it from the mempool) and costs 2 cZAMA, which goes into the jackpot.
///
///         The Oracle answers each gene privately — only the guesser can decrypt the hint:
///             2 = exact · 1 = close (within ±2) · 0 = far
///
///         Why it must be encrypted: if the hints were public, everyone could solve the riddle
///         for free by reading other players' feedback; if the secret were public there would
///         be no riddle. FHE lets the contract compare a hidden guess to a hidden answer and
///         reply to one person only.
///
///         The first keeper to prove a 4/4 guess (`claim` → KMS decrypts one bit →
///         `finalize`) takes the jackpot plus a free Relic Cache. Unsolved jackpots roll over.
///         When a round ends (solved, or expired after `roundLength`) the answer is made
///         publicly decryptable, so anyone can verify the Oracle never moved the target.
contract ChimeraOracle is Ownable, ZamaEthereumConfig {
    uint64 private constant CZAMA = 1e6;
    uint64 public constant GUESS_PRICE = 2 * CZAMA;
    uint8 public constant GENES = 4;
    uint8 public constant CLOSE = 2;
    uint8 public constant UNPAID = 255;

    struct Round {
        uint64 startedAt;
        uint64 endedAt;
        uint32 guesses;
        address solver;
        bool ended;
    }

    struct Guess {
        address keeper;
        uint32 round;
        uint64 at;
        bool claimed;
        bool finalized;
        bool won;
    }

    IERC7984 public immutable token;
    address public relics;
    uint64 public roundLength = 3 days;
    uint32 public dailyGuesses = 6;

    uint32 public currentRound;
    uint256 public totalGuesses;
    euint64 private _pot;

    mapping(uint32 => Round) private _rounds;
    mapping(uint32 => euint8[4]) private _secret;
    mapping(uint256 => Guess) private _guesses;
    mapping(uint256 => euint8) private _feedback;
    mapping(uint256 => ebool) private _solved;
    mapping(address => uint256[]) private _guessesOf;
    mapping(address => uint32) public guessDay;
    mapping(address => uint32) public guessesToday;
    mapping(address => uint32) public solves;

    event RoundStarted(uint32 indexed round, uint64 startedAt);
    event Guessed(uint256 indexed guessId, uint32 indexed round, address indexed keeper, bytes32 feedbackHandle);
    event ClaimRequested(uint256 indexed guessId, uint32 indexed round, address indexed keeper, bytes32 solvedHandle);
    event Solved(uint32 indexed round, uint256 guessId, address indexed keeper, uint256 relicId);
    event ClaimRejected(uint256 indexed guessId, address indexed keeper);
    event RoundEnded(uint32 indexed round, bool solved, bytes32[4] answerHandles);
    event PotUpdated(bytes32 potHandle);

    error NotYours(uint256 guessId);
    error StaleGuess(uint256 guessId);
    error AlreadyClaimed(uint256 guessId);
    error NotClaimed(uint256 guessId);
    error DailyLimit();
    error RoundLive();

    constructor(IERC7984 token_) Ownable(msg.sender) {
        token = token_;
    }

    // ═════════════════════════════ play ═════════════════════════════

    /// @notice Submit a sealed guess. Requires `token.setOperator(oracle, until)`.
    /// @param packed g0 | g1 << 4 | g2 << 8 | g3 << 12
    function guess(externalEuint16 packed, bytes calldata inputProof) external returns (uint256 guessId) {
        uint32 day = uint32(block.timestamp / 1 days);
        if (guessDay[msg.sender] != day) {
            guessDay[msg.sender] = day;
            guessesToday[msg.sender] = 0;
        }
        if (guessesToday[msg.sender] >= dailyGuesses) revert DailyLimit();
        guessesToday[msg.sender] += 1;

        uint32 rid = _liveRound();
        euint16 g = FHE.fromExternal(packed, inputProof);

        euint64 price = FHE.asEuint64(GUESS_PRICE);
        FHE.allowTransient(price, address(token));
        euint64 escrowed = token.confidentialTransferFrom(msg.sender, address(this), price);
        ebool paid = FHE.eq(escrowed, GUESS_PRICE);
        _addToPot(escrowed);

        (euint8 fb, ebool all) = _score(g, _secret[rid]);
        fb = FHE.select(paid, fb, FHE.asEuint8(UNPAID));
        ebool solved = FHE.and(all, paid);

        guessId = ++totalGuesses;
        _guesses[guessId] = Guess(msg.sender, rid, uint64(block.timestamp), false, false, false);
        FHE.allowThis(fb);
        FHE.allow(fb, msg.sender);
        FHE.allowThis(solved);
        _feedback[guessId] = fb;
        _solved[guessId] = solved;
        _guessesOf[msg.sender].push(guessId);
        _rounds[rid].guesses += 1;
        emit Guessed(guessId, rid, msg.sender, FHE.toBytes32(fb));
    }

    /// @notice Your hint says 4/4? Ask the KMS to prove it publicly (one bit).
    function claim(uint256 guessId) external {
        Guess storage q = _guesses[guessId];
        if (q.keeper != msg.sender) revert NotYours(guessId);
        if (q.claimed) revert AlreadyClaimed(guessId);
        if (_rounds[q.round].ended) revert StaleGuess(guessId);
        q.claimed = true;
        FHE.makePubliclyDecryptable(_solved[guessId]);
        emit ClaimRequested(guessId, q.round, msg.sender, FHE.toBytes32(_solved[guessId]));
    }

    /// @notice Anyone may finalize a claim with the KMS proof. First valid solver wins.
    /// @param cleartexts abi.encode(bool solved)
    function finalize(uint256 guessId, bytes calldata cleartexts, bytes calldata proof) external {
        Guess storage q = _guesses[guessId];
        if (!q.claimed) revert NotClaimed(guessId);
        if (q.finalized) revert AlreadyClaimed(guessId);
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_solved[guessId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        bool ok = abi.decode(cleartexts, (bool));
        q.finalized = true;

        Round storage r = _rounds[q.round];
        if (!ok || r.ended) {
            emit ClaimRejected(guessId, q.keeper);
            return;
        }
        q.won = true;
        r.solver = q.keeper;
        solves[q.keeper] += 1;

        euint64 prize = _pot;
        FHE.allowTransient(prize, address(token));
        token.confidentialTransfer(q.keeper, prize);
        _pot = FHE.asEuint64(0);
        _publishPot();

        uint256 relicId;
        if (relics != address(0)) relicId = IChimeraRelics(relics).grantCache(q.keeper);
        emit Solved(q.round, guessId, q.keeper, relicId);
        _endRound(q.round, true);
    }

    /// @notice Close an expired, unsolved round: the answer is revealed and the jackpot rolls over.
    function expire() external {
        uint32 rid = currentRound;
        Round storage r = _rounds[rid];
        if (rid == 0 || r.ended || block.timestamp < r.startedAt + roundLength) revert RoundLive();
        _endRound(rid, false);
    }

    /// @notice Add to the jackpot. Requires `token.setOperator(oracle, until)`.
    function seedPot(uint64 amount) external {
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(token));
        _addToPot(token.confidentialTransferFrom(msg.sender, address(this), a));
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getRound(uint32 rid) external view returns (Round memory round, bytes32[4] memory answerHandles) {
        round = _rounds[rid];
        for (uint8 i = 0; i < GENES; i++) answerHandles[i] = FHE.toBytes32(_secret[rid][i]);
    }

    function getGuess(
        uint256 guessId
    ) external view returns (Guess memory g, bytes32 feedbackHandle, bytes32 solvedHandle) {
        return (_guesses[guessId], FHE.toBytes32(_feedback[guessId]), FHE.toBytes32(_solved[guessId]));
    }

    function guessesOf(address keeper) external view returns (uint256[] memory) {
        return _guessesOf[keeper];
    }

    function potHandle() external view returns (bytes32) {
        return FHE.toBytes32(_pot);
    }

    function guessesLeft(address keeper) external view returns (uint32) {
        if (guessDay[keeper] != uint32(block.timestamp / 1 days)) return dailyGuesses;
        return dailyGuesses > guessesToday[keeper] ? dailyGuesses - guessesToday[keeper] : 0;
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setRelics(address relics_) external onlyOwner {
        relics = relics_;
    }

    function setRules(uint64 roundLength_, uint32 dailyGuesses_) external onlyOwner {
        roundLength = roundLength_;
        dailyGuesses = dailyGuesses_;
    }

    // ═════════════════════════════ internals ═════════════════════════════

    /// @dev per gene i: 2 << 2i exact, 1 << 2i within ±2, 0 far. `all` = four exact genes.
    function _score(euint16 g, euint8[4] storage secret) private returns (euint8 fb, ebool all) {
        fb = FHE.asEuint8(0);
        for (uint8 i = 0; i < GENES; i++) {
            euint8 gi = FHE.asEuint8(FHE.and(i == 0 ? g : FHE.shr(g, 4 * i), 15));
            euint8 si = secret[i];
            ebool exact = FHE.eq(gi, si);
            ebool close = FHE.and(FHE.le(gi, FHE.add(si, CLOSE)), FHE.le(si, FHE.add(gi, CLOSE)));
            euint8 code = FHE.select(
                exact,
                FHE.asEuint8(uint8(2) << (2 * i)),
                FHE.select(close, FHE.asEuint8(uint8(1) << (2 * i)), FHE.asEuint8(0))
            );
            fb = FHE.add(fb, code);
            all = i == 0 ? exact : FHE.and(all, exact);
        }
    }

    function _liveRound() private returns (uint32 rid) {
        rid = currentRound;
        Round storage r = _rounds[rid];
        if (rid != 0 && !r.ended && block.timestamp >= r.startedAt + roundLength) {
            _endRound(rid, false);
        }
        if (rid == 0 || _rounds[rid].ended) {
            rid = ++currentRound;
            _rounds[rid].startedAt = uint64(block.timestamp);
            for (uint8 i = 0; i < GENES; i++) {
                euint8 s = FHE.randEuint8(16);
                FHE.allowThis(s);
                _secret[rid][i] = s;
            }
            emit RoundStarted(rid, uint64(block.timestamp));
        }
    }

    function _endRound(uint32 rid, bool solved) private {
        Round storage r = _rounds[rid];
        r.ended = true;
        r.endedAt = uint64(block.timestamp);
        bytes32[4] memory hs;
        for (uint8 i = 0; i < GENES; i++) {
            FHE.makePubliclyDecryptable(_secret[rid][i]);
            hs[i] = FHE.toBytes32(_secret[rid][i]);
        }
        emit RoundEnded(rid, solved, hs);
    }

    function _addToPot(euint64 amount) private {
        _pot = FHE.isInitialized(_pot) ? FHE.add(_pot, amount) : amount;
        FHE.allowThis(_pot);
        _publishPot();
    }

    function _publishPot() private {
        FHE.allowThis(_pot);
        FHE.makePubliclyDecryptable(_pot);
        emit PotUpdated(FHE.toBytes32(_pot));
    }
}
