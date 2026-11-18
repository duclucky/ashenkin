// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IEncounterLab {
    function totalCreatures() external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
    function battleProfile(uint256 id) external returns (euint16 power, euint8 element);
}

/// @notice No approvals, transfers, entry fees or player signatures. Any caller
/// may sponsor a fixed daily draw; the hidden battle profile never becomes public.
contract AshenkinEncounters is ZamaEthereumConfig {
    IEncounterLab public immutable lab;
    uint8 public constant MAX_BATCH = 2;
    uint8 public constant RULES = 1;

    struct Day { uint64 openedAt; uint64 population; }
    struct Encounter { address holder; uint64 occurredAt; bytes32 result; }
    mapping(uint256 => Day) public epochs;
    mapping(uint256 => mapping(uint256 => Encounter)) private _encounters;

    event EncounterSealed(uint256 indexed day, uint256 indexed creatureId, address indexed holder, bytes32 result);
    error InvalidBatch();
    error OutsideSnapshot(uint256 id);
    error AlreadyDrawn(uint256 day, uint256 id);
    error MissingEncounter();

    constructor(IEncounterLab lab_) { lab = lab_; }

    function draw(uint256[] calldata ids) external {
        if (ids.length == 0 || ids.length > MAX_BATCH) revert InvalidBatch();
        uint256 day = block.timestamp / 1 days;
        if (epochs[day].openedAt == 0) {
            epochs[day] = Day(uint64(block.timestamp), uint64(lab.totalCreatures()));
        }
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (id == 0 || id > epochs[day].population) revert OutsideSnapshot(id);
            if (_encounters[day][id].occurredAt != 0) revert AlreadyDrawn(day, id);
            address holder = lab.ownerOf(id);
            (euint16 power, euint8 element) = lab.battleProfile(id);
            euint16 result = _resolve(power, element, FHE.randEuint16());
            FHE.allowThis(result);
            FHE.makePubliclyDecryptable(result);
            bytes32 handle = FHE.toBytes32(result);
            _encounters[day][id] = Encounter(holder, uint64(block.timestamp), handle);
            emit EncounterSealed(day, id, holder, handle);
        }
    }

    // Only the final story/loot code is public: kind bits 0–1, tier 2–3,
    // win bit 4, item 5–7, quantity 8–9. Power, element and luck stay sealed.
    function _resolve(euint16 power, euint8 element, euint16 entropy) internal returns (euint16) {
        euint16 kind = FHE.rem(FHE.and(entropy, 3), 3);
        euint16 tierRoll = FHE.and(FHE.shr(entropy, 2), 7);
        euint16 tier = FHE.select(FHE.lt(tierRoll, 4), FHE.asEuint16(0),
            FHE.select(FHE.lt(tierRoll, 7), FHE.asEuint16(1), FHE.asEuint16(2)));
        euint16 difficulty = FHE.select(FHE.eq(tier, 0), FHE.asEuint16(60),
            FHE.select(FHE.eq(tier, 1), FHE.asEuint16(95), FHE.asEuint16(130)));
        euint16 bonus = FHE.select(FHE.eq(FHE.asEuint16(element), FHE.rem(FHE.add(kind, 2), 3)),
            FHE.asEuint16(20), FHE.select(FHE.eq(element, 3), FHE.asEuint16(10), FHE.asEuint16(0)));
        euint16 luck = FHE.and(FHE.shr(entropy, 5), 15);
        ebool won = FHE.ge(FHE.add(FHE.add(power, bonus), luck), difficulty);
        euint16 lootRoll = FHE.and(FHE.shr(entropy, 9), 15);
        euint16 item = FHE.select(FHE.and(FHE.eq(tier, 2), FHE.eq(lootRoll, 0)), FHE.asEuint16(3),
            FHE.select(FHE.lt(lootRoll, 3), FHE.asEuint16(2), FHE.asEuint16(1)));
        euint16 qty = FHE.select(FHE.eq(item, 1), FHE.add(tier, 1), FHE.asEuint16(1));
        item = FHE.select(won, item, FHE.asEuint16(0));
        qty = FHE.select(won, qty, FHE.asEuint16(0));
        return FHE.or(FHE.or(kind, FHE.shl(tier, 2)),
            FHE.or(FHE.shl(FHE.asEuint16(won), 4), FHE.or(FHE.shl(item, 5), FHE.shl(qty, 8))));
    }

    function encounter(uint256 day, uint256 id) external view returns (Encounter memory) { return _encounters[day][id]; }

    /// @notice Read-only KMS verification lets the backend credit ordinary items
    /// without another paid transaction. No on-chain token claim is implied.
    function verify(uint256 day, uint256 id, bytes calldata cleartexts, bytes calldata proof) external view returns (bool) {
        bytes32 handle = _encounters[day][id].result;
        if (handle == bytes32(0)) revert MissingEncounter();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        return FHE.isPublicDecryptionResultValid(handles, cleartexts, proof);
    }
}
