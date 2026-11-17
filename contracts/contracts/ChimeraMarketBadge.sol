// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ChimeraMarket} from "./ChimeraMarket.sol";

/// @notice A seller can opt in to a permanent coarse power snapshot for an open listing.
contract ChimeraMarketBadge is ZamaEthereumConfig {
    ChimeraMarket public immutable market;
    uint16 public constant VANGUARD_MIN = 60;
    uint16 public constant ELITE_MIN = 90;

    struct Badge {
        uint8 tier;
        bool published;
        bytes32 handle;
        uint64 observedAt;
    }
    mapping(uint256 => Badge) public badges;

    event BadgeRequested(uint256 indexed listing, uint256 indexed specimen, bytes32 handle);
    event BadgePublished(uint256 indexed listing, uint8 tier);
    error NotSeller();
    error ListingUnavailable();
    error BadgeUnavailable();

    constructor(ChimeraMarket market_) { market = market_; }

    function request(uint256 id) external {
        (ChimeraMarket.Listing memory listing,) = market.getListing(id);
        if (listing.status != ChimeraMarket.Status.Open) revert ListingUnavailable();
        if (msg.sender != listing.seller) revert NotSeller();
        Badge storage badge = badges[id];
        if (badge.handle != bytes32(0)) revert BadgeUnavailable();
        // The Market owns the NFT while listed, so the seller's equipped relics do not count.
        (euint16 power,) = market.lab().battleProfile(listing.creatureId);
        euint8 tier = FHE.select(
            FHE.ge(power, ELITE_MIN), FHE.asEuint8(2),
            FHE.select(FHE.ge(power, VANGUARD_MIN), FHE.asEuint8(1), FHE.asEuint8(0))
        );
        // A fresh encrypted zero binds the proof to this snapshot even if the same creature is relisted.
        euint8 salt = FHE.randEuint8();
        tier = FHE.add(tier, FHE.xor(salt, salt));
        FHE.allowThis(tier);
        FHE.makePubliclyDecryptable(tier);
        badge.handle = FHE.toBytes32(tier);
        badge.observedAt = uint64(block.timestamp);
        emit BadgeRequested(id, listing.creatureId, badge.handle);
    }

    function publish(uint256 id, bytes calldata cleartexts, bytes calldata proof) external {
        Badge storage badge = badges[id];
        if (badge.handle == bytes32(0) || badge.published) revert BadgeUnavailable();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = badge.handle;
        FHE.checkSignatures(handles, cleartexts, proof);
        badge.tier = abi.decode(cleartexts, (uint8));
        badge.published = true;
        emit BadgePublished(id, badge.tier);
    }
}
