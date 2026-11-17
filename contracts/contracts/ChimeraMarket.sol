// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ChimeraLab} from "./ChimeraLab.sol";

/// @title ChimeraMarket — the black market of the Arkhive
/// @notice Creatures are sold for cZAMA (ERC-7984). A 5% fee on every sale feeds the
///         World Boss pot. Buyers only see the phenotype and how
///         many loci the seller has sequenced — the hidden genes are the gamble.
///
///         ERC-7984 transfers never revert on insufficient balance: they silently move 0.
///         So a purchase is two steps:
///           1. `buy` pulls the price into escrow and computes `ebool paid == price`,
///              made publicly decryptable (balances stay private).
///           2. `finalize` verifies the KMS proof of that bit. If paid: creature → buyer,
///              escrow → seller. If not: listing reopens (the escrow, which is 0, is returned).
contract ChimeraMarket is ZamaEthereumConfig, Ownable, IERC721Receiver {
    enum Status {
        None,
        Open,
        Pending,
        Sold,
        Cancelled
    }

    struct Listing {
        uint32 creatureId;
        Status status;
        address seller;
        address buyer;
        uint64 price; // public price, 6 decimals
        uint64 listedAt;
    }

    ChimeraLab public immutable lab;
    IERC7984 public immutable token;

    uint64 public constant FEE_BPS = 500; // 5%
    address public raid;
    uint256 public volume; // plaintext total of settled sale prices

    uint256 public totalListings;
    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => euint64) private _escrow;
    mapping(uint256 => ebool) private _paid;
    mapping(uint256 => uint256) public activeListingOf; // creatureId => listingId

    event Listed(uint256 indexed listingId, uint256 indexed creatureId, address indexed seller, uint64 price);
    event Cancelled(uint256 indexed listingId);
    event PurchaseStarted(uint256 indexed listingId, address indexed buyer, bytes32 paidHandle);
    event Sold(uint256 indexed listingId, uint256 indexed creatureId, address indexed buyer, uint64 price);
    event PurchaseFailed(uint256 indexed listingId, address indexed buyer);
    event RaidUpdated(address raid);

    error NotOwner(uint256 creatureId);
    error NotSeller(uint256 listingId);
    error NotOpen(uint256 listingId);
    error NotPending(uint256 listingId);
    error ZeroPrice();
    error OwnListing();
    error UnexpectedNft();

    constructor(ChimeraLab lab_, IERC7984 token_) Ownable(msg.sender) {
        lab = lab_;
        token = token_;
    }

    /// @notice List a creature. Requires `lab.approve(market, id)` (or approval for all).
    function list(uint256 creatureId, uint64 price) external returns (uint256 listingId) {
        if (lab.ownerOf(creatureId) != msg.sender) revert NotOwner(creatureId);
        if (price == 0) revert ZeroPrice();
        lab.transferFrom(msg.sender, address(this), creatureId);

        listingId = ++totalListings;
        _listings[listingId] = Listing({
            creatureId: uint32(creatureId),
            status: Status.Open,
            seller: msg.sender,
            buyer: address(0),
            price: price,
            listedAt: uint64(block.timestamp)
        });
        activeListingOf[creatureId] = listingId;
        emit Listed(listingId, creatureId, msg.sender, price);
    }

    function cancel(uint256 listingId) external {
        Listing storage l = _listings[listingId];
        if (l.seller != msg.sender) revert NotSeller(listingId);
        if (l.status != Status.Open) revert NotOpen(listingId);
        l.status = Status.Cancelled;
        delete activeListingOf[l.creatureId];
        lab.transferFrom(address(this), l.seller, l.creatureId);
        emit Cancelled(listingId);
    }

    /// @notice Step 1. Requires `token.setOperator(market, until)` beforehand.
    function buy(uint256 listingId) external {
        Listing storage l = _listings[listingId];
        if (l.status != Status.Open) revert NotOpen(listingId);
        if (l.seller == msg.sender) revert OwnListing();

        euint64 price = FHE.asEuint64(l.price);
        FHE.allowTransient(price, address(token));
        euint64 escrowed = token.confidentialTransferFrom(msg.sender, address(this), price);
        ebool paid = FHE.eq(escrowed, l.price);

        FHE.allowThis(escrowed);
        FHE.allowThis(paid);
        FHE.makePubliclyDecryptable(paid);

        l.status = Status.Pending;
        l.buyer = msg.sender;
        _escrow[listingId] = escrowed;
        _paid[listingId] = paid;
        emit PurchaseStarted(listingId, msg.sender, FHE.toBytes32(paid));
    }

    /// @notice Step 2. Anyone may finalize with the KMS proof of the `paid` bit.
    /// @param cleartexts abi.encode(bool paid)
    function finalize(uint256 listingId, bytes calldata cleartexts, bytes calldata proof) external {
        Listing storage l = _listings[listingId];
        if (l.status != Status.Pending) revert NotPending(listingId);

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_paid[listingId]);
        FHE.checkSignatures(handles, cleartexts, proof);
        bool paid = abi.decode(cleartexts, (bool));

        euint64 escrowed = _escrow[listingId];
        address buyer = l.buyer;

        if (paid) {
            l.status = Status.Sold;
            delete activeListingOf[l.creatureId];
            volume += l.price;
            uint64 fee = raid == address(0) ? 0 : (l.price * FEE_BPS) / 10_000;
            _send(l.seller, l.price - fee);
            if (fee > 0) _send(raid, fee);
            lab.transferFrom(address(this), buyer, l.creatureId);
            emit Sold(listingId, l.creatureId, buyer, l.price);
        } else {
            l.status = Status.Open;
            l.buyer = address(0);
            FHE.allowTransient(escrowed, address(token));
            token.confidentialTransfer(buyer, escrowed);
            emit PurchaseFailed(listingId, buyer);
        }
    }

    function setRaid(address raid_) external onlyOwner {
        raid = raid_;
        emit RaidUpdated(raid_);
    }

    /// @dev escrow equals the price once `paid` is proven, so plaintext splits are exact.
    function _send(address to, uint64 amount) private {
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(token));
        token.confidentialTransfer(to, a);
    }

    // ───────────────────────────── views ─────────────────────────────

    function getListing(uint256 listingId) external view returns (Listing memory listing, bytes32 paidHandle) {
        return (_listings[listingId], FHE.toBytes32(_paid[listingId]));
    }

    /// @notice All listings currently open or awaiting finalization (newest first).
    function openListings(uint256 max) external view returns (uint256[] memory ids) {
        uint256[] memory tmp = new uint256[](max);
        uint256 n;
        for (uint256 i = totalListings; i > 0 && n < max; i--) {
            Status s = _listings[i].status;
            if (s == Status.Open || s == Status.Pending) tmp[n++] = i;
        }
        ids = new uint256[](n);
        for (uint256 j = 0; j < n; j++) ids[j] = tmp[j];
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(lab)) revert UnexpectedNft();
        return IERC721Receiver.onERC721Received.selector;
    }
}
