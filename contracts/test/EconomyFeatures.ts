import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Chimera funded tournament and market disclosure", function () {
  this.timeout(120_000);

  async function fixture() {
    const [sponsor, ...signers] = await ethers.getSigners();
    const players = signers.slice(0, 8);
    const token = await ethers.deployContract("ConfidentialTokenMock");
    const lab = await ethers.deployContract("ChimeraLab", [await token.getAddress()]);
    const ids: bigint[] = [];
    for (const player of players) {
      await lab.connect(player).hatchGenesis();
      ids.push(await lab.totalCreatures());
    }
    return { sponsor, players, ids, token, lab };
  }

  it("escrows the announced prize before enrollment and pays a complete bracket exactly once", async function () {
    if (!fhevm.isMock) this.skip();
    const { sponsor, players, ids, lab } = await fixture();
    const prize = await ethers.deployContract("TournamentPrizeMock");
    const closes = (await time.latest()) + 100;
    const cup = await ethers.deployContract("ChimeraTournament", [await lab.getAddress(), await prize.getAddress(), 1000, closes, 30, players.map(player => player.address)]);
    const address = await cup.getAddress();
    await lab.setCombat(address, true);
    await expect(cup.connect(players[0]).join(ids[0])).to.be.revertedWithCustomError(cup, "RegistrationClosed");
    await prize.approve(address, 1000);
    await cup.fund();
    for (let i = 0; i < 8; i++) await cup.connect(players[i]).join(ids[i]);
    await cup.start();
    const seals = async (slot: number, index: number, plan = 0) => {
      const player = players[index];
      const input = await fhevm.createEncryptedInput(address, player.address).add8(plan).encrypt();
      return (await cup.connect(player).sealPlan(slot, input.handles[0], input.inputProof)).wait();
    };
    await seals(0, 0, 21);
    const computed = await seals(0, 1);
    const hcu = fhevm.computeTransactionHCU(computed as Parameters<typeof fhevm.computeTransactionHCU>[0]);
    expect(hcu.globalHCU).to.be.lte(20_000_000);
    expect(hcu.maxHCUDepth).to.be.lte(5_000_000);
    const handles = await cup.roundHandles(0);
    const proof = await fhevm.publicDecrypt([...handles]);
    const bits = handles.map(handle => !!proof.clearValues[handle as `0x${string}`]);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool", "bool"], [!bits[0], bits[1], bits[2]]);
    await expect(cup.settle(0, forged, proof.decryptionProof)).to.be.reverted;
    await cup.settle(0, proof.abiEncodedClearValues, proof.decryptionProof);
    const first = bits.filter(Boolean).length >= 2 ? 0 : 1;
    await expect(cup.settle(0, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.revertedWithCustomError(cup, "MatchUnavailable");
    for (const [match, index] of [[1, 2], [2, 4], [3, 6]]) await seals(match, index);
    await time.increase(30);
    for (const match of [1, 2, 3]) await cup.resolveNoShow(match);
    await seals(4, first);
    await seals(5, 4);
    await time.increase(30);
    await cup.resolveNoShow(4);
    await cup.resolveNoShow(5);
    await seals(6, first);
    await time.increase(30);
    await cup.resolveNoShow(6);
    for (const [index, amount] of [[first, 600], [4, 200], [2, 100], [6, 100]]) {
      await cup.connect(sponsor).claim(players[index].address);
      expect(await prize.balanceOf(players[index].address)).to.equal(amount);
    }
    expect(await prize.balanceOf(address)).to.equal(0);
    await expect(cup.claim(players[first].address)).to.be.revertedWithCustomError(cup, "NothingToClaim");
  });

  it("returns the full escrow when registration closes below eight entries", async function () {
    if (!fhevm.isMock) this.skip();
    const { sponsor, players, ids, lab } = await fixture();
    const prize = await ethers.deployContract("TournamentPrizeMock");
    const balance = await prize.balanceOf(sponsor.address);
    const closes = (await time.latest()) + 20;
    const cup = await ethers.deployContract("ChimeraTournament", [await lab.getAddress(), await prize.getAddress(), 1000, closes, 30, players.map(player => player.address)]);
    await expect(cup.fund()).to.be.revertedWithCustomError(cup, "FundingUnavailable");
    await lab.setCombat(await cup.getAddress(), true);
    await prize.approve(await cup.getAddress(), 999);
    await expect(cup.fund()).to.be.reverted;
    expect(await cup.status()).to.equal(0);
    await prize.approve(await cup.getAddress(), 1000);
    await cup.fund();
    await cup.connect(players[0]).join(ids[0]);
    await time.increaseTo(closes);
    await cup.start();
    expect(await cup.status()).to.equal(4);
    await cup.connect(players[0]).claim(sponsor.address);
    expect(await prize.balanceOf(sponsor.address)).to.equal(balance);
    expect(await prize.balanceOf(players[0].address)).to.equal(0);
  });

  it("caps encrypted power symmetrically without lifting the weaker side", async function () {
    if (!fhevm.isMock) this.skip();
    const harness = await ethers.deployContract("CombatGapMock");
    for (const [left, right, expected] of [[180, 70, [80n, 70n]], [30, 110, [30n, 40n]], [82, 75, [82n, 75n]]] as const) {
      const receipt = await (await harness.compare(left, right)).wait();
      const event = receipt!.logs.map(log => harness.interface.parseLog(log)).find(log => log?.name === "Compared");
      const handles = [event!.args.left, event!.args.right] as `0x${string}`[];
      const proof = await fhevm.publicDecrypt(handles);
      expect(handles.map(handle => proof.clearValues[handle])).to.deep.equal([...expected]);
    }
  });

  it("publishes only a coarse tier, with a proof tied to the listed specimen", async function () {
    if (!fhevm.isMock) this.skip();
    const { players, ids, token, lab } = await fixture();
    const market = await ethers.deployContract("ChimeraMarket", [await lab.getAddress(), await token.getAddress()]);
    const badge = await ethers.deployContract("ChimeraMarketBadge", [await market.getAddress()]);
    await lab.setCombat(await badge.getAddress(), true);
    await lab.connect(players[0]).approve(await market.getAddress(), ids[0]);
    await market.connect(players[0]).list(ids[0], 10_000_000);
    await expect(badge.connect(players[1]).request(1)).to.be.revertedWithCustomError(badge, "NotSeller");
    await badge.connect(players[0]).request(1);
    const [,, handle] = await badge.badges(1);
    const proof = await fhevm.publicDecrypt([handle]);
    const tier = Number(proof.clearValues[handle as `0x${string}`]);
    await badge.publish(1, proof.abiEncodedClearValues, proof.decryptionProof);
    expect((await badge.badges(1)).tier).to.equal(tier);
    expect(await lab.getCreature(ids[0]).then(creature => creature.certified)).to.equal(false);
    await market.connect(players[0]).cancel(1);
    await lab.connect(players[0]).approve(await market.getAddress(), ids[0]);
    await market.connect(players[0]).list(ids[0], 10_000_000);
    expect((await badge.badges(2)).published).to.equal(false);
    await badge.connect(players[0]).request(2);
    await expect(badge.publish(2, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.reverted;
  });
});
