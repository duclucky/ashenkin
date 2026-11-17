// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ChimeraLab} from "./ChimeraLab.sol";
import {ChimeraCombat} from "./ChimeraCombat.sol";
import {IChimeraQuests, IChimeraTraining, Task} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraColosseum — Blind Tactics: three rounds, sealed moves
/// @notice Every fight is three rounds. Before it starts, each side commits a plan of three
///         moves — Strike, Guard or Feint — as a single encrypted input:
///
///             Strike beats Feint · Feint beats Guard · Guard beats Strike
///
///         Round score = power (genes + training + relics) + element bonus + encrypted d32
///         + 30 if your move beats theirs. Win two rounds to win the fight.
///
///         Why it must be encrypted: a duel defender registers its plan once and waits for
///         challengers. If plans were public every challenger would counter all three rounds
///         and defending would be pointless. Wild creatures draw their plan from FHE
///         randomness — nobody, including the developers, can predict it.
///
///         What leaves the ciphertext domain: three bits (who took each round) — enough to
///         animate the fight. Never the moves, the scores or the rolls. A defender may change
///         its plan for free at any time, so the round bits cannot be farmed.
///
///         Duels keep the Ashlands stake model: both stakes are hidden, only `min(a, b)` is at
///         risk, excess is refunded, 5% of the pot feeds the World Boss.
contract ChimeraColosseum is ZamaEthereumConfig, Ownable, IERC721Receiver {
    uint8 public constant STRIKE = 0;
    uint8 public constant GUARD = 1;
    uint8 public constant FEINT = ChimeraCombat.FEINT;
    uint8 public constant ROUNDS = 3;
    uint8 public constant ELEMENT_VOID = ChimeraCombat.ELEMENT_VOID;
    uint16 public constant ADVANTAGE_BONUS = ChimeraCombat.ADVANTAGE_BONUS;
    uint16 public constant VOID_BONUS = ChimeraCombat.VOID_BONUS;
    uint16 public constant ROLL_BOUND = ChimeraCombat.ROLL_BOUND;
    uint16 public constant MOVE_BONUS = ChimeraCombat.MOVE_BONUS;
    uint64 public constant RAKE_DIVISOR = 20;
    uint32 public constant WIN_XP = 15;
    uint32 public constant LOSS_XP = 8;
    uint32 public constant DEFEND_XP = 6;

    enum Kind {
        Wild,
        Duel
    }
    enum Status {
        None,
        Pending,
        Settled
    }

    struct Battle {
        Kind kind;
        Status status;
        bool challengerWon;
        uint8 rounds; // bit i set = challenger took round i (after settlement)
        uint32 challengerId;
        uint32 opponentId;
        address challenger;
        address opponent; // defender keeper, or the colosseum itself for wild hunts
        uint64 startedAt;
    }

    struct Purse {
        euint64 matched;
        euint64 challengerExcess;
        euint64 opponentExcess;
    }

    struct Defender {
        address keeper;
        uint64 since;
        bool active;
        uint32 replans;
        euint64 stake;
        euint8 plan;
    }

    ChimeraLab public immutable lab;
    IERC7984 public immutable token;

    uint64 public battleCooldown = 3 minutes;
    uint16 public maxRoaming = 24;
    uint256 public totalBattles;
    address public raid;
    address public quests;
    address public training;

    mapping(uint256 => Battle) private _battles;
    mapping(uint256 => ebool[3]) private _roundWon;
    mapping(uint256 => euint8) private _wildPlan; // revealed to the hunter after the fight
    mapping(uint256 => Purse) private _purses;
    mapping(uint256 => Defender) private _defenders;

    uint256[] private _roaming;
    mapping(uint256 => uint256) private _roamingSlot;
    mapping(uint256 => bool) public wildEngaged;
    uint256[] private _defenderList;
    mapping(uint256 => uint256) private _defenderSlot;

    mapping(uint256 => uint64) public readyAt;
    mapping(address => uint32) public wins;
    mapping(address => uint32) public losses;
    mapping(uint256 => uint32) public creatureWins;
    mapping(address => uint32) public captures;
    mapping(address => uint32) public roundsTaken;
    mapping(address => uint32) public sweeps; // 3-0 wins

    event WildSpawned(uint256 indexed wildId);
    event BattleStarted(
        uint256 indexed battleId,
        Kind kind,
        address indexed challenger,
        uint256 challengerId,
        uint256 opponentId,
        bytes32[3] roundHandles
    );
    event BattleSettled(uint256 indexed battleId, bool challengerWon, uint8 rounds, address indexed winner);
    event WildCaptured(uint256 indexed wildId, address indexed hunter);
    event DefenderRegistered(uint256 indexed creatureId, address indexed keeper);
    event DefenderReplanned(uint256 indexed creatureId, address indexed keeper);
    event DefenderWithdrawn(uint256 indexed creatureId, address indexed keeper);

    error NotOwner(uint256 id);
    error NotReady(uint256 id, uint64 readyAt);
    error AshlandsCrowded();
    error NotRoaming(uint256 wildId);
    error WildEngaged(uint256 wildId);
    error AlreadyDefending(uint256 id);
    error NotDefending(uint256 id);
    error DefenderGone(uint256 id);
    error SelfDuel();
    error NotPending(uint256 battleId);
    error UnexpectedNft();

    constructor(ChimeraLab lab_, IERC7984 token_) Ownable(msg.sender) {
        lab = lab_;
        token = token_;
    }

    modifier ownsReady(uint256 id) {
        if (lab.ownerOf(id) != msg.sender) revert NotOwner(id);
        if (readyAt[id] > block.timestamp) revert NotReady(id, readyAt[id]);
        readyAt[id] = uint64(block.timestamp) + battleCooldown;
        _;
    }

    // ═════════════════════════════ wild hunts ═════════════════════════════

    /// @notice A new wild creature is born in the Ashlands and fights your sealed plan.
    /// @param plan packed moves: m0 | m1 << 2 | m2 << 4 (each 0 Strike, 1 Guard, 2 Feint)
    function explore(uint256 myId, externalEuint8 plan, bytes calldata inputProof) external ownsReady(myId) returns (uint256) {
        if (_roaming.length >= maxRoaming) revert AshlandsCrowded();
        uint256 wildId = lab.spawnWild();
        _roaming.push(wildId);
        _roamingSlot[wildId] = _roaming.length;
        emit WildSpawned(wildId);
        return _startWild(myId, wildId, FHE.fromExternal(plan, inputProof));
    }

    function challengeWild(
        uint256 myId,
        uint256 wildId,
        externalEuint8 plan,
        bytes calldata inputProof
    ) external ownsReady(myId) returns (uint256) {
        if (_roamingSlot[wildId] == 0) revert NotRoaming(wildId);
        return _startWild(myId, wildId, FHE.fromExternal(plan, inputProof));
    }

    function _startWild(uint256 myId, uint256 wildId, euint8 plan) private returns (uint256 battleId) {
        if (wildEngaged[wildId]) revert WildEngaged(wildId);
        wildEngaged[wildId] = true;
        euint8 wild = _randomPlan();
        battleId = _record(Kind.Wild, myId, wildId, address(this), plan, wild);
        FHE.allowThis(wild);
        FHE.allow(wild, msg.sender);
        _wildPlan[battleId] = wild;
    }

    // ═════════════════════════════ duels ═════════════════════════════

    /// @notice Offer a defender with a hidden stake and a sealed 3-move plan (one input proof
    ///         for both). Requires `token.setOperator(colosseum, until)`.
    function registerDefender(
        uint256 id,
        externalEuint64 encryptedStake,
        externalEuint8 plan,
        bytes calldata inputProof
    ) external {
        if (lab.ownerOf(id) != msg.sender) revert NotOwner(id);
        Defender storage d = _defenders[id];
        if (d.active) revert AlreadyDefending(id);
        d.stake = _pull(msg.sender, FHE.fromExternal(encryptedStake, inputProof));
        d.plan = _keepPlan(FHE.fromExternal(plan, inputProof), msg.sender);
        d.keeper = msg.sender;
        d.since = uint64(block.timestamp);
        d.active = true;
        _defenderList.push(id);
        _defenderSlot[id] = _defenderList.length;
        emit DefenderRegistered(id, msg.sender);
    }

    /// @notice Change the sealed plan of an active defender. Free, as often as you like.
    function replan(uint256 id, externalEuint8 plan, bytes calldata inputProof) external {
        Defender storage d = _defenders[id];
        if (!d.active || d.keeper != msg.sender) revert NotDefending(id);
        d.plan = _keepPlan(FHE.fromExternal(plan, inputProof), msg.sender);
        d.replans += 1;
        emit DefenderReplanned(id, msg.sender);
    }

    function withdrawDefender(uint256 id) external {
        Defender storage d = _defenders[id];
        if (!d.active || d.keeper != msg.sender) revert NotDefending(id);
        d.active = false;
        _removeDefender(id);
        _pay(d.keeper, d.stake);
        emit DefenderWithdrawn(id, msg.sender);
    }

    function duel(
        uint256 myId,
        uint256 defenderId,
        externalEuint64 encryptedStake,
        externalEuint8 plan,
        bytes calldata inputProof
    ) external ownsReady(myId) returns (uint256 battleId) {
        Defender storage d = _defenders[defenderId];
        if (!d.active) revert NotDefending(defenderId);
        if (d.keeper == msg.sender || myId == defenderId) revert SelfDuel();
        if (lab.ownerOf(defenderId) != d.keeper) revert DefenderGone(defenderId);
        d.active = false;
        _removeDefender(defenderId);

        euint64 escrowed = _pull(msg.sender, FHE.fromExternal(encryptedStake, inputProof));
        euint64 matched = FHE.min(escrowed, d.stake);
        euint64 challengerExcess = FHE.sub(escrowed, matched);
        euint64 opponentExcess = FHE.sub(d.stake, matched);
        FHE.allowThis(matched);
        FHE.allowThis(challengerExcess);
        FHE.allowThis(opponentExcess);
        FHE.allow(matched, msg.sender);
        FHE.allow(matched, d.keeper);

        battleId = _record(Kind.Duel, myId, defenderId, d.keeper, FHE.fromExternal(plan, inputProof), d.plan);
        _purses[battleId] = Purse(matched, challengerExcess, opponentExcess);
    }

    // ═════════════════════════════ settlement ═════════════════════════════

    /// @notice Anyone settles with the KMS proof of the three round bits.
    /// @param cleartexts abi.encode(bool round0, bool round1, bool round2)
    function settle(uint256 battleId, bytes calldata cleartexts, bytes calldata proof) external {
        Battle storage b = _battles[battleId];
        if (b.status != Status.Pending) revert NotPending(battleId);

        uint8 mask = _verifyRounds(battleId, cleartexts, proof);
        uint8 taken = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
        bool won = taken >= 2;
        b.status = Status.Settled;
        b.challengerWon = won;
        b.rounds = mask;
        roundsTaken[b.challenger] += taken;
        if (b.kind == Kind.Duel) roundsTaken[b.opponent] += ROUNDS - taken;

        if (b.kind == Kind.Wild) {
            wildEngaged[b.opponentId] = false;
            if (won) {
                _removeRoaming(b.opponentId);
                captures[b.challenger] += 1;
                lab.transferFrom(address(this), b.challenger, b.opponentId);
                emit WildCaptured(b.opponentId, b.challenger);
            }
        } else {
            _payout(battleId, b.challenger, b.opponent, won);
        }
        _tally(b, won, taken);
        emit BattleSettled(battleId, won, mask, won ? b.challenger : b.opponent);
    }

    function _verifyRounds(uint256 battleId, bytes calldata cleartexts, bytes calldata proof) private returns (uint8 mask) {
        ebool[3] storage r = _roundWon[battleId];
        bytes32[] memory handles = new bytes32[](3);
        for (uint8 i = 0; i < ROUNDS; i++) handles[i] = FHE.toBytes32(r[i]);
        FHE.checkSignatures(handles, cleartexts, proof);
        (bool r0, bool r1, bool r2) = abi.decode(cleartexts, (bool, bool, bool));
        mask = (r0 ? 1 : 0) | (r1 ? 2 : 0) | (r2 ? 4 : 0);
    }

    function _payout(uint256 battleId, address challenger, address opponent, bool won) private {
        Purse storage p = _purses[battleId];
        euint64 pot = FHE.add(p.matched, p.matched);
        if (raid != address(0)) {
            euint64 rake = FHE.div(pot, RAKE_DIVISOR);
            pot = FHE.sub(pot, rake);
            _pay(raid, rake);
        }
        if (won) {
            _pay(challenger, FHE.add(pot, p.challengerExcess));
            _pay(opponent, p.opponentExcess);
        } else {
            _pay(opponent, FHE.add(pot, p.opponentExcess));
            _pay(challenger, p.challengerExcess);
        }
    }

    function _tally(Battle storage b, bool won, uint8 taken) private {
        if (won) {
            wins[b.challenger] += 1;
            creatureWins[b.challengerId] += 1;
            if (taken == ROUNDS) sweeps[b.challenger] += 1;
            if (b.kind == Kind.Duel) losses[b.opponent] += 1;
        } else {
            losses[b.challenger] += 1;
            if (b.kind == Kind.Duel) {
                wins[b.opponent] += 1;
                creatureWins[b.opponentId] += 1;
                if (taken == 0) sweeps[b.opponent] += 1;
            }
        }
        if (quests != address(0)) IChimeraQuests(quests).record(b.challenger, Task.BATTLE);
        if (training != address(0)) {
            IChimeraTraining(training).grantXp(b.challengerId, won ? WIN_XP : LOSS_XP);
            if (b.kind == Kind.Duel && !won) IChimeraTraining(training).grantXp(b.opponentId, DEFEND_XP);
        }
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getBattle(uint256 battleId) external view returns (Battle memory battle, bytes32[3] memory roundHandles) {
        battle = _battles[battleId];
        for (uint8 i = 0; i < ROUNDS; i++) roundHandles[i] = FHE.toBytes32(_roundWon[battleId][i]);
    }

    /// @notice The wild creature's random plan, decryptable by the hunter (no secret to keep).
    function wildPlanHandle(uint256 battleId) external view returns (bytes32) {
        return FHE.toBytes32(_wildPlan[battleId]);
    }

    function roamingWilds() external view returns (uint256[] memory) {
        return _roaming;
    }

    function activeDefenders() external view returns (uint256[] memory) {
        return _defenderList;
    }

    function getDefender(
        uint256 id
    ) external view returns (address keeper, uint64 since, bool active, uint32 replans, bytes32 stakeHandle, bytes32 planHandle) {
        Defender storage d = _defenders[id];
        return (d.keeper, d.since, d.active, d.replans, FHE.toBytes32(d.stake), FHE.toBytes32(d.plan));
    }

    function purseHandle(uint256 battleId) external view returns (bytes32) {
        return FHE.toBytes32(_purses[battleId].matched);
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setSettings(uint64 battleCooldown_, uint16 maxRoaming_) external onlyOwner {
        battleCooldown = battleCooldown_;
        maxRoaming = maxRoaming_;
    }

    function setTraining(address training_) external onlyOwner {
        training = training_;
    }

    function setEconomy(address raid_, address quests_) external onlyOwner {
        raid = raid_;
        quests = quests_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(lab)) revert UnexpectedNft();
        return IERC721Receiver.onERC721Received.selector;
    }

    // ═════════════════════════════ internals ═════════════════════════════

    function _record(
        Kind kind,
        uint256 myId,
        uint256 opponentId,
        address opponent,
        euint8 planA,
        euint8 planB
    ) private returns (uint256 battleId) {
        battleId = ++totalBattles;
        ebool[3] storage r = _roundWon[battleId];
        _fight(myId, opponentId, planA, planB, r);
        _battles[battleId] = Battle({
            kind: kind,
            status: Status.Pending,
            challengerWon: false,
            rounds: 0,
            challengerId: uint32(myId),
            opponentId: uint32(opponentId),
            challenger: msg.sender,
            opponent: opponent,
            startedAt: uint64(block.timestamp)
        });
        bytes32[3] memory hs;
        for (uint8 i = 0; i < ROUNDS; i++) hs[i] = FHE.toBytes32(r[i]);
        emit BattleStarted(battleId, kind, msg.sender, myId, opponentId, hs);
    }

    function _fight(uint256 a, uint256 b, euint8 planA, euint8 planB, ebool[3] storage out) private {
        (euint16 powerA, euint8 elemA) = lab.battleProfile(a);
        (euint16 powerB, euint8 elemB) = lab.battleProfile(b);
        euint16 baseA = ChimeraCombat.withElement(powerA, elemA, elemB);
        euint16 baseB = ChimeraCombat.withElement(powerB, elemB, elemA);
        for (uint8 i = 0; i < ROUNDS; i++) out[i] = ChimeraCombat.round(baseA, baseB, planA, planB, i, false);
    }

    function _randomPlan() private returns (euint8 plan) {
        plan = FHE.rem(FHE.randEuint8(), 3);
        plan = FHE.or(plan, FHE.shl(FHE.rem(FHE.randEuint8(), 3), 2));
        plan = FHE.or(plan, FHE.shl(FHE.rem(FHE.randEuint8(), 3), 4));
    }

    function _keepPlan(euint8 plan, address keeper) private returns (euint8) {
        FHE.allowThis(plan);
        FHE.allow(plan, keeper);
        return plan;
    }

    function _pull(address from, euint64 amount) private returns (euint64 escrowed) {
        FHE.allowTransient(amount, address(token));
        escrowed = token.confidentialTransferFrom(from, address(this), amount);
        FHE.allowThis(escrowed);
    }

    function _pay(address to, euint64 amount) private {
        FHE.allowTransient(amount, address(token));
        token.confidentialTransfer(to, amount);
    }

    function _removeDefender(uint256 id) private {
        uint256 slot = _defenderSlot[id];
        uint256 last = _defenderList[_defenderList.length - 1];
        _defenderList[slot - 1] = last;
        _defenderSlot[last] = slot;
        _defenderList.pop();
        delete _defenderSlot[id];
    }

    function _removeRoaming(uint256 wildId) private {
        uint256 slot = _roamingSlot[wildId];
        uint256 last = _roaming[_roaming.length - 1];
        _roaming[slot - 1] = last;
        _roamingSlot[last] = slot;
        _roaming.pop();
        delete _roamingSlot[wildId];
    }
}
