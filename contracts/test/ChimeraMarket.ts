import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ChimeraLab, ChimeraMarket, ConfidentialTokenMock } from "../types";

const START = 1_000_000_000n;
const PRICE = 250_000_000n;

describe("ChimeraMarket", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;
  let lab: ChimeraLab;
  let market: ChimeraMarket;
  let token: ConfidentialTokenMock;
  let marketAddress: string;
  let tokenAddress: string;
  const hcu: Record<string, { global: number; depth: number }> = {};

  before(async function () {
    [deployer, alice, bob, carol] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    token = await (await ethers.getContractFactory("ConfidentialTokenMock")).connect(deployer).deploy();
    lab = await (await ethers.getContractFactory("ChimeraLab")).connect(deployer).deploy(await token.getAddress());
    market = await (await ethers.getContractFactory("ChimeraMarket"))
      .connect(deployer)
      .deploy(await lab.getAddress(), await token.getAddress());
    marketAddress = await market.getAddress();
    tokenAddress = await token.getAddress();
  });

  after(function () {
    if (Object.keys(hcu).length) {
      console.log("\n      HCU per transaction (limits: 20,000,000 global / 5,000,000 depth)");
      for (const [k, v] of Object.entries(hcu)) {
        console.log(`        ${k.padEnd(16)} global ${v.global.toLocaleString().padStart(11)}   depth ${v.depth.toLocaleString().padStart(10)}`);
      }
    }
  });

  async function measure(label: string, txPromise: Promise<{ wait: () => Promise<unknown> }>) {
    const receipt = (await (await txPromise).wait()) as Parameters<typeof fhevm.computeTransactionHCU>[0];
    const info = fhevm.computeTransactionHCU(receipt);
    hcu[label] = { global: info.globalHCU, depth: info.maxHCUDepth };
  }

  async function fund(signer: HardhatEthersSigner, amount: bigint) {
    if (amount > 0n) await (await token.mint(signer.address, amount)).wait();
    await (await token.connect(signer).setOperator(marketAddress, (await time.latest()) + 86400)).wait();
  }

  async function balance(signer: HardhatEthersSigner) {
    return await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await token.confidentialBalanceOf(signer.address),
      tokenAddress,
      signer,
    );
  }

  async function listOne(): Promise<{ creature: bigint; listingId: bigint }> {
    await (await lab.connect(alice).hatchGenesis()).wait();
    const creature = await lab.totalCreatures();
    await (await lab.connect(alice).approve(marketAddress, creature)).wait();
    await (await market.connect(alice).list(creature, PRICE)).wait();
    return { creature, listingId: await market.totalListings() };
  }

  async function finalize(listingId: bigint) {
    const [, handle] = await market.getListing(listingId);
    const res = await fhevm.publicDecrypt([handle]);
    await measure("finalize", market.finalize(listingId, res.abiEncodedClearValues, res.decryptionProof));
    return Boolean(res.clearValues[handle as `0x${string}`]);
  }

  it("lists into escrow and cancels back", async function () {
    const { creature, listingId } = await listOne();
    expect(await lab.ownerOf(creature)).to.eq(marketAddress);
    expect(await market.openListings(10)).to.deep.eq([listingId]);
    await expect(market.connect(bob).cancel(listingId)).to.be.revertedWithCustomError(market, "NotSeller");
    await (await market.connect(alice).cancel(listingId)).wait();
    expect(await lab.ownerOf(creature)).to.eq(alice.address);
    expect(await market.openListings(10)).to.deep.eq([]);
  });

  it("a funded buyer gets the creature; the seller gets the cZAMA", async function () {
    await fund(bob, START);
    const { creature, listingId } = await listOne();
    await measure("buy", market.connect(bob).buy(listingId));
    await expect(market.connect(alice).cancel(listingId)).to.be.revertedWithCustomError(market, "NotOpen");

    expect(await finalize(listingId)).to.eq(true);
    expect(await lab.ownerOf(creature)).to.eq(bob.address);
    expect(await balance(bob)).to.eq(START - PRICE);
    expect(await balance(alice)).to.eq(PRICE);
    // the buyer inherits the private element knowledge
    const ph = await lab.getPhenotypeHandles(creature);
    await fhevm.userDecryptEuint(FhevmType.euint8, ph[7], await lab.getAddress(), bob);
  });

  it("an underfunded buyer silently pays 0 — the listing reopens, nothing moves", async function () {
    await fund(carol, PRICE - 1n);
    const { creature, listingId } = await listOne();
    await (await market.connect(carol).buy(listingId)).wait();
    expect(await finalize(listingId)).to.eq(false);

    expect(await lab.ownerOf(creature)).to.eq(marketAddress);
    expect(await balance(carol)).to.eq(PRICE - 1n);
    const [listing] = await market.getListing(listingId);
    expect(listing.status).to.eq(1n); // Open again

    await fund(bob, START);
    await (await market.connect(bob).buy(listingId)).wait();
    expect(await finalize(listingId)).to.eq(true);
    expect(await lab.ownerOf(creature)).to.eq(bob.address);
  });

  it("rejects self-buys, forged proofs and replays", async function () {
    await fund(alice, START);
    await fund(bob, START);
    const { listingId } = await listOne();
    await expect(market.connect(alice).buy(listingId)).to.be.revertedWithCustomError(market, "OwnListing");
    await (await market.connect(bob).buy(listingId)).wait();

    const [, handle] = await market.getListing(listingId);
    const res = await fhevm.publicDecrypt([handle]);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]);
    await expect(market.finalize(listingId, forged, res.decryptionProof)).to.be.reverted;
    await (await market.finalize(listingId, res.abiEncodedClearValues, res.decryptionProof)).wait();
    await expect(market.finalize(listingId, res.abiEncodedClearValues, res.decryptionProof)).to.be.revertedWithCustomError(
      market,
      "NotPending",
    );
  });
});
