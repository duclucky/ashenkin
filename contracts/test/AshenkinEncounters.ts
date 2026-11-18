import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AshenkinEncounters", function () {
  this.timeout(600_000);
  let lab: any, game: any, fixture: any, alice: any, bob: any;
  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    [, alice, bob] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("ConfidentialTokenMock")).deploy();
    lab = await (await ethers.getContractFactory("ChimeraLab")).deploy(await token.getAddress());
    game = await (await ethers.getContractFactory("AshenkinEncounters")).deploy(await lab.getAddress());
    fixture = await (await ethers.getContractFactory("EncounterFixture")).deploy(await lab.getAddress());
    await (await lab.setCombat(await game.getAddress(), true)).wait();
    await (await lab.connect(alice).hatchGenesis()).wait();
  });
  const unpack = (n: number) => ({ kind: n & 3, tier: (n >> 2) & 3, won: !!(n & 16), item: (n >> 5) & 7, qty: (n >> 8) & 3 });
  async function outcome(power: number, element: number, entropy: number) {
    await (await fixture.resolve(power, element, entropy)).wait();
    const h = await fixture.tested();
    return unpack(Number((await fhevm.publicDecrypt([h])).clearValues[h]));
  }
  it("keeps the NFT at home, draws once per day regardless of caller, and locks the population snapshot", async () => {
    const day = Math.floor((await time.latest()) / 86400);
    await expect(game.connect(bob).draw([1])).to.emit(game, "EncounterSealed");
    expect(await lab.ownerOf(1)).to.eq(alice.address);
    expect((await game.encounter(day, 1)).holder).to.eq(alice.address);
    await expect(game.connect(alice).draw([1])).to.be.revertedWithCustomError(game, "AlreadyDrawn");
    await (await lab.connect(bob).hatchGenesis()).wait();
    await expect(game.draw([2])).to.be.revertedWithCustomError(game, "OutsideSnapshot");
    await time.increaseTo((day + 1) * 86400 + 1);
    const batch = await game.draw([1, 2]);
    await expect(batch).to.emit(game, "EncounterSealed");
    const receipt = await batch.wait();
    const budget = fhevm.computeTransactionHCU(receipt);
    expect(budget.globalHCU).to.be.at.most(20_000_000);
    expect(budget.maxHCUDepth).to.be.at.most(5_000_000);
    expect(receipt.gasUsed).to.be.lessThan(16_000_000n);
    console.log(`        encounters(2): HCU ${budget.globalHCU}, depth ${budget.maxHCUDepth}, local gas ${receipt.gasUsed}`);
  });
  it("has no empty/oversized draws or duplicate NFT loopholes", async () => {
    await expect(game.draw([])).to.be.revertedWithCustomError(game, "InvalidBatch");
    await expect(game.draw([1, 1, 1])).to.be.revertedWithCustomError(game, "InvalidBatch");
    await expect(game.draw([0])).to.be.revertedWithCustomError(game, "OutsideSnapshot");
    await expect(game.draw([1, 1])).to.be.revertedWithCustomError(game, "AlreadyDrawn");
    const day = Math.floor((await time.latest()) / 86400);
    expect((await game.encounter(day, 1)).occurredAt).to.eq(0);
  });
  it("a weak specimen loses without loot, strong specimens win; equality succeeds and advantage matters", async () => {
    expect(await outcome(0, 0, 0)).to.deep.eq({ kind: 0, tier: 0, won: false, item: 0, qty: 0 });
    expect((await outcome(59, 0, 0)).won).to.eq(false);
    expect((await outcome(60, 0, 0)).won).to.eq(true);
    expect((await outcome(40, 2, 0)).won).to.eq(true);
    expect((await outcome(50, 3, 0)).won).to.eq(true);
    expect((await outcome(44, 0, 15 << 5)).won).to.eq(false);
    expect((await outcome(45, 0, 15 << 5)).won).to.eq(true);
  });
  it("produces only the configured materials/fragment/lantern, and loss never drops an item", async () => {
    expect(await outcome(200, 0, 3 << 9)).to.deep.eq({ kind: 0, tier: 0, won: true, item: 1, qty: 1 });
    expect((await outcome(200, 0, (4 << 2) | (3 << 9))).qty).to.eq(2);
    expect((await outcome(200, 0, (7 << 2) | (3 << 9))).qty).to.eq(3);
    expect((await outcome(200, 0, 0)).item).to.eq(2);
    expect((await outcome(200, 0, 7 << 2)).item).to.eq(3);
    expect((await outcome(0, 0, 7 << 2)).item).to.eq(0);
  });
  it("verifies real KMS results but refuses forged and cross-NFT proofs", async () => {
    await (await lab.connect(bob).hatchGenesis()).wait();
    await (await game.draw([1, 2])).wait();
    const day = Math.floor((await time.latest()) / 86400);
    const handle = (await game.encounter(day, 1)).result;
    const proof = await fhevm.publicDecrypt([handle]);
    expect(await game.verify(day, 1, proof.abiEncodedClearValues, proof.decryptionProof)).to.eq(true);
    await expect(game.verify(day, 2, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.reverted;
    await expect(game.verify(day, 1, ethers.AbiCoder.defaultAbiCoder().encode(["uint16"], [65535]), proof.decryptionProof)).to.be.reverted;
    await expect(game.verify(day, 99, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.revertedWithCustomError(game, "MissingEncounter");
    const creature = await lab.getGenomeHandles(1);
    await expect(fhevm.publicDecrypt([creature[0]])).to.be.rejected;
  });

  it("runs the actual backend worker, signed transaction, FHE proof and exactly-once bag without a player session", async () => {
    const { createPublicClient, createWalletClient, custom, parseGwei } = require('../../backend/node_modules/viem');
    const { mnemonicToAccount } = require('../../backend/node_modules/viem/accounts');
    const { keeperStore } = require('../../backend/lib/keeper-store');
    const { lifeService } = require('../../backend/lib/life');
    const { livingChain } = require('../../backend/lib/life-chain');
    const network = { id: 31337, name: 'Local FHE mock', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://localhost'] } } };
    const transport = custom({ request: ({ method, params }: any) => ethers.provider.send(method, params || []) });
    const account = mnemonicToAccount('test test test test test test test test test test test junk');
    const client = createPublicClient({ chain: network, transport });
    const wallet = createWalletClient({ chain: network, transport, account });
    const store = keeperStore(':memory:', 'test-secret');
    const world = `31337:${await game.getAddress()}`;
    const chain = livingChain({ address: await game.getAddress(), clients: { client, wallet, account }, maxFee: parseGwei('100'), store, world, network, labAddress: await lab.getAddress() });
    chain.decrypt = async (handle: string) => {
      const p = await fhevm.publicDecrypt([handle]);
      return { value: Number(p.clearValues[handle as `0x${string}`]), cleartexts: p.abiEncodedClearValues, proof: p.decryptionProof };
    };
    const now = (await time.latest()) * 1000;
    const config = { store, chain, world, dailyBudgetWei: ethers.parseEther('10'), clock: () => now };
    const service = lifeService(config);
    try {
      await service.tick();
      const op = store.life.state(world).operation;
      expect(op).not.to.eq(null);
      expect(ethers.keccak256(op.raw)).to.eq(op.hash);
      const tx = await ethers.provider.getTransaction(op.hash);
      expect(tx?.from).to.eq(account.address);
      expect(tx?.from).not.to.eq(alice.address);
      await ethers.provider.send('evm_mine', []); await ethers.provider.send('evm_mine', []);
      await lifeService(config).tick();
      const view = await service.view(1);
      expect(view.history).to.have.length(1);
      expect(view.history[0].hash).to.eq(op.hash);
      const inventory = JSON.stringify(view.inventory);
      await service.tick(); await service.tick();
      expect(JSON.stringify((await service.view(1)).inventory)).to.eq(inventory);
      expect((await service.view(1)).history).to.have.length(1);
      expect(await lab.ownerOf(1)).to.eq(alice.address);
    } finally { store.close(); }
  });
});
