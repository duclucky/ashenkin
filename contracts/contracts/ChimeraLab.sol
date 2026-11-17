// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IChimeraQuests, IChimeraTraining, Task} from "./interfaces/IChimeraEconomy.sol";

/// @title ChimeraLab — creatures whose genome nobody can read
/// @notice Every creature carries 8 diploid loci. Each locus is an encrypted byte
///         `[alleleA:4 bits][alleleB:4 bits]`. Only the *phenotype* (the expressed
///         allele, `min(alleleA, alleleB)`) of the 7 visible loci is public. Recessive
///         alleles stay encrypted until the owner pays to sequence a locus. The 8th
///         locus (element) is expressed privately: only the owner can see it.
/// @dev Low allele values are common and dominant; high values are rare and recessive.
///      0-7 common, 8-11 uncommon, 12-14 rare, 15 mythic.
///
///      Economy (cZAMA, ERC-7984, 6 decimals): breeding costs a fee per parent that rises
///      with how many times that parent has bred (max 7). The fee is pulled confidentially
///      into escrow and the pair lays an *egg*; once the Zama KMS proves `paid == fee`, the
///      egg hatches and the fee is split 60% to the World Boss pot / 40% to the Treasury.
///      After one introductory egg, every breeding consumes one lineage charge from a
///      voluntary permanent Ascension offering. Pending eggs reserve global population room.
contract ChimeraLab is ERC721Enumerable, Ownable, ZamaEthereumConfig {
    // ───────────────────────────── constants ─────────────────────────────
    uint8 public constant LOCI = 8;
    uint8 public constant VISIBLE_LOCI = 7;
    uint8 public constant ELEMENT_LOCUS = 7;
    uint8 public constant RARE_THRESHOLD = 12;
    /// @dev a Chimera expresses at least this many visible traits at rare tier (>= 12)
    uint8 public constant CHIMERA_RARE_TRAITS = 5;
    uint8 public constant GENESIS_PER_WALLET = 3;
    uint8 public constant MAX_ENERGY = 3;
    uint64 public constant ENERGY_REFILL = 1 days;
    /// @dev mutation triggers when an encrypted random byte is below this value (8/256 = 1/32)
    uint8 public constant MUTATION_THRESHOLD = 8;
    uint8 public constant MAX_BREEDS = 7;
    uint256 public constant MAX_POPULATION = 10_000;
    uint64 private constant CZAMA = 1e6;
    uint64 public constant RAID_SHARE_PCT = 60;

    // ───────────────────────────── storage ─────────────────────────────
    struct Creature {
        uint32 parentA;
        uint32 parentB;
        uint16 generation;
        uint64 bornAt;
        uint64 cooldownUntil;
        uint8 sequencedMask; // bit i set => owner was granted genome[i]
        bool certified; // whole genome made publicly decryptable
        bool chimera; // verified legendary
        bool wild; // spawned in the Ashlands by the arena (no parents, no genesis quota)
        uint8 breeds; // times this creature has been a parent (max 7)
    }

    enum EggStatus {
        None,
        Pending,
        Hatched,
        Dud
    }

    struct Egg {
        address keeper;
        uint32 parentA;
        uint32 parentB;
        uint16 generation;
        EggStatus status;
        uint64 fee;
        uint64 laidAt;
    }

    struct Energy {
        uint8 amount;
        uint64 lastRefill;
    }

    uint256 public totalCreatures;
    uint256 public populationLimit = MAX_POPULATION;
    uint256 public pendingBirths;
    uint256 public retiredCreatures;
    address public retirementVault;
    mapping(uint256 => bool) public retired;
    mapping(address => uint256) public lineageCharges;
    mapping(address => bool) public introBreedUsed;
    mapping(uint256 => bool) private _chargedEgg;
    uint256 public chimeraCount;
    /// @notice the only contract allowed to spawn wild creatures and read battle profiles
    address public arena;
    uint64 public baseCooldown = 2 minutes;
    uint64 public cooldownPerGeneration = 1 minutes;
    uint64 public maxCooldown = 30 minutes;

    mapping(uint256 => Creature) private _creatures;
    mapping(uint256 => euint8[8]) private _genome;
    mapping(uint256 => euint8[8]) private _phenotype;
    mapping(address => uint8) public genesisClaimed;
    mapping(address => Energy) private _energy;

    IERC7984 public immutable token;
    address public raid; // World Boss pot
    address public treasury; // Arkhive Treasury
    address public quests;
    address public training;
    string private _base;
    mapping(address => bool) public isCombat; // may read encrypted battle profiles
    mapping(uint256 => Egg) private _eggs; // eggId == the child creature id it will become
    mapping(uint256 => euint64) private _eggEscrow;
    mapping(uint256 => ebool) private _eggPaid;
    mapping(address => uint256[]) private _eggsOf;
    uint256 public feesCollected; // plaintext total of settled breed fees

    // ───────────────────────────── events ─────────────────────────────
    event Hatched(
        uint256 indexed id,
        address indexed owner,
        uint16 generation,
        uint32 parentA,
        uint32 parentB,
        bytes32 genomeCommitment
    );
    event Sequenced(uint256 indexed id, address indexed owner, uint8 locus);
    event Certified(uint256 indexed id);
    event ChimeraVerified(uint256 indexed id, address indexed owner);
    event CooldownsUpdated(uint64 base, uint64 perGeneration, uint64 max);
    event ArenaUpdated(address arena);
    event EggLaid(uint256 indexed eggId, address indexed keeper, uint32 parentA, uint32 parentB, uint64 fee, bytes32 paidHandle);
    event EggDud(uint256 indexed eggId, address indexed keeper);
    event EconomyUpdated(address raid, address treasury, address quests);
    event CombatUpdated(address combat, bool allowed);
    event RetirementVaultSet(address vault);
    event Retired(uint256 indexed id, address indexed keeper, uint256 lineageCharges);
    event PopulationLimitSet(uint256 limit);

    // ───────────────────────────── errors ─────────────────────────────
    error NotOwner(uint256 id);
    error GenesisLimitReached();
    error InvalidLocus(uint8 locus);
    error AlreadySequenced(uint256 id, uint8 locus);
    error NoEnergy();
    error SameCreature();
    error OnCooldown(uint256 id, uint64 until);
    error AlreadyCertified(uint256 id);
    error AlreadyChimera(uint256 id);
    error NotCertified(uint256 id);
    error NotAChimera(uint256 id);
    error NotArena();
    error NotCombat();
    error BreedLimit(uint256 id);
    error EggNotPending(uint256 eggId);
    error NoLineageCharge();
    error PopulationFull();
    error InvalidPopulationLimit();
    error InvalidRetirementVault();
    error PermanentlyRetired();

    constructor(IERC7984 token_) ERC721("Ashenkin", "ASHEN") Ownable(msg.sender) {
        token = token_;
    }

    modifier onlyCreatureOwner(uint256 id) {
        if (_requireOwned(id) != msg.sender) revert NotOwner(id);
        _;
    }

    modifier onlyArena() {
        if (msg.sender != arena) revert NotArena();
        _;
    }

    modifier onlyCombat() {
        if (msg.sender != arena && !isCombat[msg.sender]) revert NotCombat();
        _;
    }

    // ═════════════════════════════ gameplay ═════════════════════════════

    /// @notice Hatch a free genesis embryo. Both alleles of every locus are uniform
    ///         random nibbles, so 25% of alleles are rare but only 6.25% of traits
    ///         *express* rare (both copies needed) — 37.5% of traits hide a rare allele.
    function hatchGenesis() external returns (uint256 id) {
        if (genesisClaimed[msg.sender] >= GENESIS_PER_WALLET) revert GenesisLimitReached();
        _requirePopulationRoom();
        genesisClaimed[msg.sender] += 1;

        id = _nextId();
        _randomGenome(id);
        _birth(id, msg.sender, 0, 0, 0, false);
        _record(msg.sender);
    }

    /// @notice Breed two creatures you own. For every locus the child inherits one random
    ///         allele from each parent (Mendel), with a 1/32 chance that the allele from
    ///         parent A mutates into a fresh random allele. Nobody, including the owner,
    ///         learns the child's genotype — only its phenotype.
    ///         Costs `breedFee(a, b)` cZAMA, pulled confidentially (requires
    ///         `token.setOperator(lab, until)`). Lays an egg; call `hatchEgg` with the KMS
    ///         proof of the `paid` bit to hatch it.
    function breed(uint256 a, uint256 b) external onlyCreatureOwner(a) onlyCreatureOwner(b) returns (uint256 id) {
        if (a == b) revert SameCreature();
        Creature storage ca = _creatures[a];
        Creature storage cb = _creatures[b];
        if (ca.cooldownUntil > block.timestamp) revert OnCooldown(a, ca.cooldownUntil);
        if (cb.cooldownUntil > block.timestamp) revert OnCooldown(b, cb.cooldownUntil);
        if (ca.breeds >= MAX_BREEDS) revert BreedLimit(a);
        if (cb.breeds >= MAX_BREEDS) revert BreedLimit(b);
        _requirePopulationRoom();
        bool charged = introBreedUsed[msg.sender];
        if (charged) {
            if (lineageCharges[msg.sender] == 0) revert NoLineageCharge();
            lineageCharges[msg.sender] -= 1;
        } else introBreedUsed[msg.sender] = true;
        pendingBirths += 1;

        uint64 fee = feeFor(ca.breeds) + feeFor(cb.breeds);
        ca.breeds += 1;
        cb.breeds += 1;
        uint16 generation = (ca.generation > cb.generation ? ca.generation : cb.generation) + 1;
        ca.cooldownUntil = uint64(block.timestamp) + _cooldownFor(ca.generation);
        cb.cooldownUntil = uint64(block.timestamp) + _cooldownFor(cb.generation);

        id = _nextId();
        _chargedEgg[id] = charged;
        for (uint8 i = 0; i < LOCI; i++) {
            _inherit(id, i, _genome[a][i], _genome[b][i]);
        }

        // confidential fee: ERC-7984 moves either the full amount or 0, never reverts
        euint64 price = FHE.asEuint64(fee);
        FHE.allowTransient(price, address(token));
        euint64 escrowed = token.confidentialTransferFrom(msg.sender, address(this), price);
        ebool paid = FHE.eq(escrowed, fee);
        FHE.allowThis(escrowed);
        FHE.allowThis(paid);
        FHE.makePubliclyDecryptable(paid);

        _eggs[id] = Egg({
            keeper: msg.sender,
            parentA: uint32(a),
            parentB: uint32(b),
            generation: generation,
            status: EggStatus.Pending,
            fee: fee,
            laidAt: uint64(block.timestamp)
        });
        _eggEscrow[id] = escrowed;
        _eggPaid[id] = paid;
        _eggsOf[msg.sender].push(id);
        emit EggLaid(id, msg.sender, uint32(a), uint32(b), fee, FHE.toBytes32(paid));
    }

    /// @notice Anyone may hatch an egg with the KMS proof of its `paid` bit.
    ///         Paid → the child is born to the keeper and the fee flows into the economy.
    ///         Unpaid → the egg is a dud, the (zero) escrow is returned and the parents get
    ///         their breed slot back.
    /// @param cleartexts abi.encode(bool paid)
    function hatchEgg(uint256 eggId, bytes calldata cleartexts, bytes calldata proof) external {
        Egg storage e = _eggs[eggId];
        if (e.status != EggStatus.Pending) revert EggNotPending(eggId);

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_eggPaid[eggId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        bool paid = abi.decode(cleartexts, (bool));
        pendingBirths -= 1;

        if (paid) {
            e.status = EggStatus.Hatched;
            feesCollected += e.fee;
            uint64 toRaid = (e.fee * RAID_SHARE_PCT) / 100;
            _forward(raid, toRaid);
            _forward(treasury, e.fee - toRaid);
            _birth(eggId, e.keeper, e.parentA, e.parentB, e.generation, false);
            _record(e.keeper);
        } else {
            e.status = EggStatus.Dud;
            if (_chargedEgg[eggId]) lineageCharges[e.keeper] += 1;
            else introBreedUsed[e.keeper] = false;
            _creatures[e.parentA].breeds -= 1;
            _creatures[e.parentB].breeds -= 1;
            euint64 escrowed = _eggEscrow[eggId];
            FHE.allowTransient(escrowed, address(token));
            token.confidentialTransfer(e.keeper, escrowed);
            emit EggDud(eggId, e.keeper);
        }
    }

    // ═════════════════════════════ arena hooks ═════════════════════════════

    /// @notice Spawn a wild creature into the arena's custody. Same genetics as genesis.
    function spawnWild() external onlyArena returns (uint256 id) {
        _requirePopulationRoom();
        id = _nextId();
        _randomGenome(id);
        _birth(id, msg.sender, 0, 0, 0, true);
    }

    /// @notice Encrypted battle profile, handed to the arena for this transaction only.
    /// @return power sum of BOTH alleles of the 5 combat loci (body, eyes, crest, limbs, aura),
    ///         0..150 — hidden recessive alleles count too.
    /// @return element 0 Ember, 1 Spore, 2 Tide (Ember › Spore › Tide › Ember), 3 Void
    ///         (expressed element allele 15), derived from the private element phenotype.
    function battleProfile(uint256 id) external onlyCombat returns (euint16 power, euint8 element) {
        _requireOwned(id);
        euint8[8] storage g = _genome[id];
        euint8 sum = FHE.add(FHE.shr(g[0], 4), FHE.and(g[0], 15)); // body: 0..30
        power = FHE.asEuint16(sum);
        power = FHE.add(power, FHE.asEuint16(FHE.add(FHE.shr(g[3], 4), FHE.and(g[3], 15))));
        power = FHE.add(power, FHE.asEuint16(FHE.add(FHE.shr(g[4], 4), FHE.and(g[4], 15))));
        power = FHE.add(power, FHE.asEuint16(FHE.add(FHE.shr(g[5], 4), FHE.and(g[5], 15))));
        power = FHE.add(power, FHE.asEuint16(FHE.add(FHE.shr(g[6], 4), FHE.and(g[6], 15))));

        if (training != address(0)) {
            euint16 trained = IChimeraTraining(training).bonusOf(id);
            if (FHE.isInitialized(trained)) power = FHE.add(power, trained);
        }

        euint8 expressed = _phenotype[id][ELEMENT_LOCUS];
        element = FHE.select(FHE.eq(expressed, 15), FHE.asEuint8(3), FHE.rem(expressed, 3));

        FHE.allowTransient(power, msg.sender);
        FHE.allowTransient(element, msg.sender);
    }

    /// @notice Spend 1 lab energy to reveal both alleles of one locus — to the owner only.
    function sequence(uint256 id, uint8 locus) external onlyCreatureOwner(id) {
        if (locus >= LOCI) revert InvalidLocus(locus);
        Creature storage c = _creatures[id];
        uint8 bit = uint8(1) << locus;
        if (c.sequencedMask & bit != 0) revert AlreadySequenced(id, locus);
        _spendEnergy(msg.sender);
        c.sequencedMask |= bit;
        FHE.allow(_genome[id][locus], msg.sender);
        emit Sequenced(id, msg.sender, locus);
    }

    /// @notice Publish the full genome (e.g. to sell a certified pedigree). Irreversible.
    function certify(uint256 id) external onlyCreatureOwner(id) {
        Creature storage c = _creatures[id];
        if (c.certified) revert AlreadyCertified(id);
        c.certified = true;
        for (uint8 i = 0; i < LOCI; i++) {
            FHE.makePubliclyDecryptable(_genome[id][i]);
        }
        FHE.makePubliclyDecryptable(_phenotype[id][ELEMENT_LOCUS]);
        emit Certified(id);
    }

    /// @notice Verify a Chimera: at least 5 of the 7 visible traits expressed at rare tier.
    /// @param cleartexts abi-encoded 7 uint8 phenotype values, in locus order
    /// @param proof KMS public-decryption proof for those 7 phenotype handles
    function claimChimera(uint256 id, bytes calldata cleartexts, bytes calldata proof) external {
        address holder = _requireOwned(id);
        Creature storage c = _creatures[id];
        if (c.chimera) revert AlreadyChimera(id);

        bytes32[] memory handles = new bytes32[](VISIBLE_LOCI);
        for (uint8 i = 0; i < VISIBLE_LOCI; i++) {
            handles[i] = FHE.toBytes32(_phenotype[id][i]);
        }
        FHE.checkSignatures(handles, cleartexts, proof);

        uint8[7] memory traits = abi.decode(cleartexts, (uint8[7]));
        uint8 rare;
        for (uint8 i = 0; i < VISIBLE_LOCI; i++) {
            if (traits[i] >= RARE_THRESHOLD) rare++;
        }
        if (rare < CHIMERA_RARE_TRAITS) revert NotAChimera(id);
        c.chimera = true;
        chimeraCount += 1;
        emit ChimeraVerified(id, holder);
    }

    // ═════════════════════════════ views ═════════════════════════════

    function economyVersion() external pure returns (uint8) { return 2; }

    /// @notice Includes pending eggs and wild inventory; permanent vault holdings are excluded.
    function circulatingPopulation() public view returns (uint256) {
        return totalSupply() + pendingBirths - retiredCreatures;
    }

    function _requirePopulationRoom() private view {
        if (circulatingPopulation() >= populationLimit) revert PopulationFull();
    }

    function setPopulationLimit(uint256 limit) external onlyOwner {
        if (limit == 0 || limit > MAX_POPULATION || limit < circulatingPopulation()) revert InvalidPopulationLimit();
        populationLimit = limit;
        emit PopulationLimitSet(limit);
    }

    /// @notice One-time link. A retired creature never returns to circulation.
    function setRetirementVault(address vault) external onlyOwner {
        if (retirementVault != address(0) || vault.code.length == 0) revert InvalidRetirementVault();
        (bool ok, bytes memory result) = vault.staticcall(abi.encodeWithSignature("lab()"));
        if (!ok || result.length != 32 || abi.decode(result, (address)) != address(this)) revert InvalidRetirementVault();
        retirementVault = vault;
        emit RetirementVaultSet(vault);
    }

    function getCreature(uint256 id) external view returns (Creature memory) {
        _requireOwned(id);
        return _creatures[id];
    }

    /// @notice Handles of the 7 public phenotype values + the private element phenotype.
    function getPhenotypeHandles(uint256 id) external view returns (bytes32[8] memory out) {
        _requireOwned(id);
        for (uint8 i = 0; i < LOCI; i++) {
            out[i] = FHE.toBytes32(_phenotype[id][i]);
        }
    }

    /// @notice Genome handles. They are public pointers; decrypting them requires ACL rights.
    function getGenomeHandles(uint256 id) external view returns (bytes32[8] memory out) {
        _requireOwned(id);
        for (uint8 i = 0; i < LOCI; i++) {
            out[i] = FHE.toBytes32(_genome[id][i]);
        }
    }

    /// @notice All creature ids held by `account` (enumerable, for frontends without an indexer).
    function creaturesOf(address account) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(account);
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = tokenOfOwnerByIndex(account, i);
    }

    function energyOf(address account) public view returns (uint8) {
        Energy memory e = _energy[account];
        if (e.lastRefill == 0 || block.timestamp >= e.lastRefill + ENERGY_REFILL) return MAX_ENERGY;
        return e.amount;
    }

    function nextEnergyRefill(address account) external view returns (uint64) {
        Energy memory e = _energy[account];
        if (e.lastRefill == 0) return 0;
        return e.lastRefill + ENERGY_REFILL;
    }

    function cooldownFor(uint16 generation) external view returns (uint64) {
        return _cooldownFor(generation);
    }

    /// @notice Fee one parent adds to a breeding, by how many times it already bred:
    ///         5, 8, 12, 18, 26, 38, 55 cZAMA.
    function feeFor(uint8 breeds) public pure returns (uint64) {
        uint64[7] memory table = [uint64(5), 8, 12, 18, 26, 38, 55];
        return (breeds < MAX_BREEDS ? table[breeds] : table[MAX_BREEDS - 1]) * CZAMA;
    }

    function breedFee(uint256 a, uint256 b) external view returns (uint64) {
        return feeFor(_creatures[a].breeds) + feeFor(_creatures[b].breeds);
    }

    function getEgg(uint256 eggId) external view returns (Egg memory egg, bytes32 paidHandle) {
        return (_eggs[eggId], FHE.toBytes32(_eggPaid[eggId]));
    }

    /// @notice Every egg a keeper ever laid (filter by status client-side).
    function eggsOf(address keeper) external view returns (uint256[] memory) {
        return _eggsOf[keeper];
    }

    // ═════════════════════════════ admin ═════════════════════════════

    function setArena(address arena_) external onlyOwner {
        arena = arena_;
        emit ArenaUpdated(arena_);
    }

    function setEconomy(address raid_, address treasury_, address quests_) external onlyOwner {
        raid = raid_;
        treasury = treasury_;
        quests = quests_;
        emit EconomyUpdated(raid_, treasury_, quests_);
    }

    /// @notice Trained power (ChimeraTraining) is added to `battleProfile`; metadata is served at `baseURI + id`.
    function setTraining(address training_, string calldata baseURI_) external onlyOwner {
        training = training_;
        _base = baseURI_;
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    function setCombat(address combat, bool allowed) external onlyOwner {
        isCombat[combat] = allowed;
        emit CombatUpdated(combat, allowed);
    }

    function setCooldowns(uint64 base, uint64 perGeneration, uint64 max) external onlyOwner {
        baseCooldown = base;
        cooldownPerGeneration = perGeneration;
        maxCooldown = max;
        emit CooldownsUpdated(base, perGeneration, max);
    }

    // ═════════════════════════════ internals ═════════════════════════════

    function _nextId() private returns (uint256) {
        return ++totalCreatures;
    }

    /// @dev uniform random alleles: one encrypted byte = two encrypted alleles per locus.
    function _randomGenome(uint256 id) private {
        for (uint8 i = 0; i < LOCI; i++) {
            euint8 r = FHE.randEuint8();
            _store(id, i, FHE.shr(r, 4), FHE.and(r, 15));
        }
    }

    /// @dev child locus = (allele picked from A) | (allele picked from B), then maybe mutate.
    function _inherit(uint256 id, uint8 i, euint8 locusA, euint8 locusB) private {
        euint8 fromA = FHE.select(FHE.randEbool(), FHE.shr(locusA, 4), FHE.and(locusA, 15));
        euint8 fromB = FHE.select(FHE.randEbool(), FHE.shr(locusB, 4), FHE.and(locusB, 15));

        // mutation: one encrypted byte decides if (< 8, i.e. 1/32), another decides into what
        euint8 m = FHE.randEuint8();
        euint8 mutant = FHE.shr(FHE.randEuint8(), 4);
        fromA = FHE.select(FHE.lt(m, MUTATION_THRESHOLD), mutant, fromA);

        _store(id, i, fromA, fromB);
    }

    /// @dev pack alleles, derive phenotype, set ACL.
    function _store(uint256 id, uint8 i, euint8 alleleA, euint8 alleleB) private {
        euint8 locus = FHE.or(FHE.shl(alleleA, 4), alleleB);
        euint8 expressed = FHE.min(alleleA, alleleB);

        FHE.allowThis(locus);
        FHE.allowThis(expressed);
        if (i == ELEMENT_LOCUS) {
            FHE.allow(expressed, msg.sender); // element: private to the owner
        } else {
            FHE.makePubliclyDecryptable(expressed); // looks: public to everyone
        }
        _genome[id][i] = locus;
        _phenotype[id][i] = expressed;
    }

    function _birth(uint256 id, address to, uint32 parentA, uint32 parentB, uint16 generation, bool wild) private {
        _creatures[id] = Creature({
            parentA: parentA,
            parentB: parentB,
            generation: generation,
            bornAt: uint64(block.timestamp),
            cooldownUntil: uint64(block.timestamp) + _cooldownFor(generation),
            sequencedMask: 0,
            certified: false,
            chimera: false,
            wild: wild,
            breeds: 0
        });

        bytes32[] memory handles = new bytes32[](LOCI);
        for (uint8 i = 0; i < LOCI; i++) {
            handles[i] = FHE.toBytes32(_genome[id][i]);
        }
        _safeMint(to, id);
        emit Hatched(id, to, generation, parentA, parentB, keccak256(abi.encodePacked(handles)));
    }

    function _forward(address to, uint64 amount) private {
        if (to == address(0) || amount == 0) return;
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(token));
        token.confidentialTransfer(to, a);
    }

    function _record(address player) private {
        if (quests != address(0)) IChimeraQuests(quests).record(player, Task.BREED);
    }

    function _spendEnergy(address account) private {
        Energy storage e = _energy[account];
        if (e.lastRefill == 0 || block.timestamp >= e.lastRefill + ENERGY_REFILL) {
            e.amount = MAX_ENERGY;
            e.lastRefill = uint64(block.timestamp);
        }
        if (e.amount == 0) revert NoEnergy();
        e.amount -= 1;
    }

    function _cooldownFor(uint16 generation) private view returns (uint64) {
        uint64 cd = baseCooldown + cooldownPerGeneration * generation;
        return cd > maxCooldown ? maxCooldown : cd;
    }

    /// @dev On transfer, the new owner inherits the knowledge that was paid for (sequenced
    ///      loci) and the private element. Note: FHE ACL grants cannot be revoked, so the
    ///      previous owner keeps what they already learned — documented game rule.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721Enumerable) returns (address from) {
        from = super._update(to, tokenId, auth);
        if (retired[tokenId]) revert PermanentlyRetired();
        if (to == retirementVault && from != address(0)) {
            if (auth != retirementVault) revert InvalidRetirementVault();
            retired[tokenId] = true;
            retiredCreatures += 1;
            lineageCharges[from] += 1;
            emit Retired(tokenId, from, lineageCharges[from]);
        }
        if (from != address(0) && to != address(0)) {
            Creature storage c = _creatures[tokenId];
            FHE.allow(_phenotype[tokenId][ELEMENT_LOCUS], to);
            for (uint8 i = 0; i < LOCI; i++) {
                if (c.sequencedMask & (uint8(1) << i) != 0) {
                    FHE.allow(_genome[tokenId][i], to);
                }
            }
        }
    }
}
