// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ChimeraLab} from "./ChimeraLab.sol";
import {IChimeraQuests, IChimeraTraining, Task} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraArena — the Ashlands, where hidden genes fight
/// @notice Battles are resolved entirely on encrypted data. Each side's score is
///         `power (both alleles of 5 combat loci) + element bonus + encrypted d64 roll`.
///         Only one bit ever leaves the ciphertext domain: who won.
///
///         Wild hunts: explore to spawn a wild creature from the Ashlands, or challenge one
///         that is already roaming. Beat it and you capture it (it joins your gene pool).
///         Lose and it keeps roaming for others to hunt.
///
///         Duels: register a defender with a hidden cZAMA (ERC-7984) stake; challengers bring
///         their own hidden stake. The arena only ever puts `min(stakeA, stakeB)` at risk and
///         refunds the excess — neither side learns the other's stake, and a stake that
///         silently transferred 0 (insufficient funds) simply means nothing was at risk.
///         The winner takes the pot minus a 5% rake that feeds the World Boss pot.
contract ChimeraArena is ZamaEthereumConfig, Ownable, IERC721Receiver {
    // ───────────────────────────── constants ─────────────────────────────
    uint8 public constant ELEMENT_VOID = 3;
    uint16 public constant ADVANTAGE_BONUS = 25; // Ember › Spore › Tide › Ember
    uint16 public constant VOID_BONUS = 12; // Void is never countered, but never counters
    uint16 public constant ROLL_BOUND = 64; // encrypted d64 per side
    uint64 public constant RAKE_DIVISOR = 20; // 5% of every duel pot → World Boss

    // ───────────────────────────── storage ─────────────────────────────
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
        uint32 challengerId;
        uint32 opponentId;
        address challenger;
        address opponent; // defender keeper, or the arena itself for wild hunts
        uint64 startedAt;
    }

    struct Purse {
        euint64 matched; // amount each side actually has at risk
        euint64 challengerExcess;
        euint64 opponentExcess;
    }

    struct Defender {
        address keeper;
        uint64 since;
        bool active;
        euint64 stake; // what actually arrived in escrow (may be 0)
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
    mapping(uint256 => ebool) private _outcome;
    mapping(uint256 => Purse) private _purses;
    mapping(uint256 => Defender) private _defenders;

    uint256[] private _roaming;
    mapping(uint256 => uint256) private _roamingSlot; // 1-based index into _roaming
    mapping(uint256 => bool) public wildEngaged;

    uint256[] private _defenderList;
    mapping(uint256 => uint256) private _defenderSlot; // 1-based index into _defenderList

    mapping(uint256 => uint64) public readyAt; // per creature battle cooldown
    mapping(address => uint32) public wins;
    mapping(address => uint32) public losses;
    mapping(uint256 => uint32) public creatureWins;
    mapping(address => uint32) public captures;

    // ───────────────────────────── events ─────────────────────────────
    event WildSpawned(uint256 indexed wildId);
    event BattleStarted(
        uint256 indexed battleId,
        Kind kind,
        address indexed challenger,
        uint256 challengerId,
        uint256 opponentId,
        bytes32 outcomeHandle
    );
    event BattleSettled(uint256 indexed battleId, bool challengerWon, address indexed winner);
    event WildCaptured(uint256 indexed wildId, address indexed hunter);
    event DefenderRegistered(uint256 indexed creatureId, address indexed keeper);
    event DefenderWithdrawn(uint256 indexed creatureId, address indexed keeper);
    event SettingsUpdated(uint64 battleCooldown, uint16 maxRoaming);
    event EconomyUpdated(address raid, address quests);

    // ───────────────────────────── errors ─────────────────────────────
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

    /// @notice Venture into the Ashlands: a new wild creature is born and attacks.
    function explore(uint256 myId) external ownsReady(myId) returns (uint256 battleId) {
        if (_roaming.length >= maxRoaming) revert AshlandsCrowded();
        uint256 wildId = lab.spawnWild();
        _roaming.push(wildId);
        _roamingSlot[wildId] = _roaming.length;
        emit WildSpawned(wildId);
        battleId = _startWild(myId, wildId);
    }

    /// @notice Hunt a wild creature that is already roaming (it beat someone before).
    function challengeWild(uint256 myId, uint256 wildId) external ownsReady(myId) returns (uint256 battleId) {
        if (_roamingSlot[wildId] == 0) revert NotRoaming(wildId);
        battleId = _startWild(myId, wildId);
    }

    function _startWild(uint256 myId, uint256 wildId) private returns (uint256 battleId) {
        if (wildEngaged[wildId]) revert WildEngaged(wildId);
        wildEngaged[wildId] = true;
        battleId = _record(Kind.Wild, myId, wildId, address(this));
    }

    // ═════════════════════════════ duels ═════════════════════════════

    /// @notice Offer your creature as a defender with a hidden stake. Requires
    ///         `token.setOperator(arena, until)` beforehand.
    function registerDefender(
        uint256 id,
        externalEuint64 encryptedStake,
        bytes calldata inputProof
    ) external {
        if (lab.ownerOf(id) != msg.sender) revert NotOwner(id);
        Defender storage d = _defenders[id];
        if (d.active) revert AlreadyDefending(id);

        euint64 escrowed = _pull(msg.sender, FHE.fromExternal(encryptedStake, inputProof));
        d.keeper = msg.sender;
        d.since = uint64(block.timestamp);
        d.active = true;
        d.stake = escrowed;
        _defenderList.push(id);
        _defenderSlot[id] = _defenderList.length;
        emit DefenderRegistered(id, msg.sender);
    }

    /// @notice Retire a defender that has not been challenged yet; the stake is refunded.
    function withdrawDefender(uint256 id) external {
        Defender storage d = _defenders[id];
        if (!d.active || d.keeper != msg.sender) revert NotDefending(id);
        d.active = false;
        _removeDefender(id);
        _pay(d.keeper, d.stake);
        emit DefenderWithdrawn(id, msg.sender);
    }

    /// @notice Challenge a registered defender with your own hidden stake.
    function duel(
        uint256 myId,
        uint256 defenderId,
        externalEuint64 encryptedStake,
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

        battleId = _record(Kind.Duel, myId, defenderId, d.keeper);
        _purses[battleId] = Purse(matched, challengerExcess, opponentExcess);
    }

    // ═════════════════════════════ settlement ═════════════════════════════

    /// @notice Anyone can settle once the KMS has publicly decrypted the outcome bit.
    /// @param cleartexts abi.encode(bool challengerWon)
    /// @param proof KMS decryption proof for the battle's outcome handle
    function settle(uint256 battleId, bytes calldata cleartexts, bytes calldata proof) external {
        Battle storage b = _battles[battleId];
        if (b.status != Status.Pending) revert NotPending(battleId);

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_outcome[battleId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        bool won = abi.decode(cleartexts, (bool));

        b.status = Status.Settled; // replay protection
        b.challengerWon = won;

        if (b.kind == Kind.Wild) {
            wildEngaged[b.opponentId] = false;
            if (won) {
                _removeRoaming(b.opponentId);
                captures[b.challenger] += 1;
                lab.transferFrom(address(this), b.challenger, b.opponentId);
                emit WildCaptured(b.opponentId, b.challenger);
            }
        } else {
            Purse storage p = _purses[battleId];
            euint64 pot = FHE.add(p.matched, p.matched);
            if (raid != address(0)) {
                euint64 rake = FHE.div(pot, RAKE_DIVISOR);
                pot = FHE.sub(pot, rake);
                _pay(raid, rake);
            }
            if (won) {
                _pay(b.challenger, FHE.add(pot, p.challengerExcess));
                _pay(b.opponent, p.opponentExcess);
            } else {
                _pay(b.opponent, FHE.add(pot, p.opponentExcess));
                _pay(b.challenger, p.challengerExcess);
            }
        }

        address winner;
        if (won) {
            winner = b.challenger;
            wins[b.challenger] += 1;
            creatureWins[b.challengerId] += 1;
            if (b.kind == Kind.Duel) losses[b.opponent] += 1;
        } else {
            winner = b.opponent;
            losses[b.challenger] += 1;
            if (b.kind == Kind.Duel) {
                wins[b.opponent] += 1;
                creatureWins[b.opponentId] += 1;
            }
        }
        if (quests != address(0)) IChimeraQuests(quests).record(b.challenger, Task.BATTLE);
        if (training != address(0)) IChimeraTraining(training).grantXp(b.challengerId, won ? 15 : 8);
        emit BattleSettled(battleId, won, winner);
    }

    // ═════════════════════════════ views ═════════════════════════════

    function getBattle(uint256 battleId) external view returns (Battle memory battle, bytes32 outcomeHandle) {
        return (_battles[battleId], FHE.toBytes32(_outcome[battleId]));
    }

    function roamingWilds() external view returns (uint256[] memory) {
        return _roaming;
    }

    /// @notice Creature ids currently registered as defenders (may include ones whose keeper
    ///         has since transferred the creature — `duel` will reject those).
    function activeDefenders() external view returns (uint256[] memory) {
        return _defenderList;
    }

    function getDefender(
        uint256 id
    ) external view returns (address keeper, uint64 since, bool active, bytes32 stakeHandle) {
        Defender storage d = _defenders[id];
        return (d.keeper, d.since, d.active, FHE.toBytes32(d.stake));
    }

    function purseHandles(uint256 battleId) external view returns (bytes32 matched) {
        return FHE.toBytes32(_purses[battleId].matched);
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setSettings(uint64 battleCooldown_, uint16 maxRoaming_) external onlyOwner {
        battleCooldown = battleCooldown_;
        maxRoaming = maxRoaming_;
        emit SettingsUpdated(battleCooldown_, maxRoaming_);
    }

    function setTraining(address training_) external onlyOwner {
        training = training_;
    }

    function setEconomy(address raid_, address quests_) external onlyOwner {
        raid = raid_;
        quests = quests_;
        emit EconomyUpdated(raid_, quests_);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(lab)) revert UnexpectedNft();
        return IERC721Receiver.onERC721Received.selector;
    }

    // ═════════════════════════════ internals ═════════════════════════════

    function _record(Kind kind, uint256 myId, uint256 opponentId, address opponent) private returns (uint256 battleId) {
        ebool challengerWins = _fight(myId, opponentId);
        battleId = ++totalBattles;
        _battles[battleId] = Battle({
            kind: kind,
            status: Status.Pending,
            challengerWon: false,
            challengerId: uint32(myId),
            opponentId: uint32(opponentId),
            challenger: msg.sender,
            opponent: opponent,
            startedAt: uint64(block.timestamp)
        });
        _outcome[battleId] = challengerWins;
        emit BattleStarted(battleId, kind, msg.sender, myId, opponentId, FHE.toBytes32(challengerWins));
    }

    /// @dev Everything here is ciphertext. The only plaintext that will ever exist is the
    ///      final `ebool`, made publicly decryptable for settlement.
    function _fight(uint256 a, uint256 b) private returns (ebool challengerWins) {
        (euint16 powerA, euint8 elemA) = lab.battleProfile(a);
        (euint16 powerB, euint8 elemB) = lab.battleProfile(b);

        euint16 scoreA = FHE.add(FHE.add(powerA, _bonus(elemA, elemB)), FHE.randEuint16(ROLL_BOUND));
        euint16 scoreB = FHE.add(FHE.add(powerB, _bonus(elemB, elemA)), FHE.randEuint16(ROLL_BOUND));

        challengerWins = FHE.gt(scoreA, scoreB); // ties go to the defender
        FHE.allowThis(challengerWins);
        FHE.makePubliclyDecryptable(challengerWins);
    }

    /// @dev Ember(0) › Spore(1) › Tide(2) › Ember(0): x counters y iff y == (x + 1) % 3.
    function _bonus(euint8 x, euint8 y) private returns (euint16) {
        ebool xVoid = FHE.eq(x, ELEMENT_VOID);
        ebool counters = FHE.eq(y, FHE.rem(FHE.add(x, 1), 3));
        euint16 elemental = FHE.select(counters, FHE.asEuint16(ADVANTAGE_BONUS), FHE.asEuint16(0));
        return FHE.select(xVoid, FHE.asEuint16(VOID_BONUS), elemental);
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
