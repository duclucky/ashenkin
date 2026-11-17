import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { ChimeraLab, ChimeraRaffle, ChimeraRelics, ConfidentialTokenMock } from "../types";

const Z = 1_000_000n;

describe("Sealed Raffle", function () {
  this.timeout(900_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner, carol: HardhatEthersSigner, treasury: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let relics: ChimeraRelics;
  let raffle: ChimeraRaffle;
  const A: Record<string, string> = {};
  const w = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();
  const hcu: Record<string, { global: number; depth: number; gas: number }> = {};

  before(async function () {
    [deployer, alice, bob, carol, treasury] = await ethers.getSigners();
  });

  after(function () {
    if (Object.keys(hcu).length) {
      console.log("\n      HCU per transaction (limits: 20,000,000 global / 5,000,000 depth)");
      for (const [k, v] of Object.entries(hcu))
        console.log(`        ${k.padEnd(20)} global ${v.global.toLocaleString().padStart(11)}   depth ${v.depth.toLocaleString().padStart(10)}   gas ${v.gas.toLocaleString().padStart(11)}`);
    }
  });

  async function measure(label: string, txp: Promise<{ wait: () => Promise<unknown> }>) {
    const receipt = (await (await txp).wait()) as Parameters<typeof fhevm.computeTransactionHCU>[0];
    const info = fhevm.computeTransactionHCU(receipt);
    const prev = hcu[label];
    if (!prev || info.globalHCU > prev.global) hcu[label] = { global: info.globalHCU, depth: info.maxHCUDepth, gas: Number((receipt as { gasUsed: bigint }).gasUsed) };
    expect(info.globalHCU).to.be.lte(20_000_000);
    expect(info.maxHCUDepth).to.be.lte(5_000_000);
    return receipt;
  }

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const f = (n: string) => ethers.getContractFactory(n).then((x) => x.connect(deployer));
    token = (await (await f("ConfidentialTokenMock")).deploy()) as unknown as ConfidentialTokenMock;
    A.token = await token.getAddress();
    lab = (await (await f("ChimeraLab")).deploy(A.token)) as unknown as ChimeraLab;
    A.lab = await lab.getAddress();
    relics = (await (await f("ChimeraRelics")).deploy(A.lab, A.token)) as unknown as ChimeraRelics;
    A.relics = await relics.getAddress();
    raffle = (await (await f("ChimeraRaffle")).deploy(A.token, treasury.address)) as unknown as ChimeraRaffle;
    A.raffle = await raffle.getAddress();
    await w(relics.setGame(A.raffle, true));
    await w(raffle.setRelics(A.relics));
    for (const s of [alice, bob]) {
      await w(token.mint(s.address, 100n * Z));
      await w(token.connect(s).setOperator(A.raffle, (await time.latest()) + 86400 * 30));
    }
  });

  async function buy(s: HardhatEthersSigner, n: number, label = "raffle.buy") {
    const enc = await fhevm.createEncryptedInput(A.raffle, s.address).add16(n).encrypt();
    await measure(label, raffle.connect(s).buy(enc.handles[0], enc.inputProof));
  }
  const tickets = async (s: HardhatEthersSigner, rid = 1) => fhevm.userDecryptEuint(FhevmType.euint64, await raffle.ticketsHandle(rid, s.address), A.raffle, s);
  const bal = async (a: string, s: HardhatEthersSigner) => fhevm.userDecryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(a), A.token, s);

  async function drawAndFinalize() {
    await time.increase(3 * 86400);
    await measure("raffle.draw", raffle.draw());
    const [, wh, ph] = await raffle.getRound(await raffle.currentRound());
    const res = await fhevm.publicDecrypt([wh, ph]);
    await measure("raffle.finalize", raffle.finalize(res.abiEncodedClearValues, res.decryptionProof));
    return res;
  }

  it("ticket counts are sealed: each keeper reads only their own", async function () {
    await buy(alice, 5);
    await buy(bob, 3);
    await buy(alice, 2);
    expect(await tickets(alice)).to.eq(7n);
    expect(await tickets(bob)).to.eq(3n);
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, await raffle.ticketsHandle(1, bob.address), A.raffle, alice)).to.be.rejected;
    const [r, wh, ph] = await raffle.getRound(1);
    expect(r[2]).to.eq(3); // entries (r.entries collides with Result.entries())
    expect(r.players).to.eq(2);
    // the leader and the pot are not even exposed as handles before the draw
    expect(wh).to.eq(ethers.ZeroHash);
    expect(ph).to.eq(ethers.ZeroHash);
    expect(await bal(alice.address, alice)).to.eq(93n * Z);
  });

  it("caps a purchase at 50 and counts an unpaid purchase as 0", async function () {
    await buy(alice, 400);
    expect(await tickets(alice)).to.eq(50n);
    await w(token.connect(carol).setOperator(A.raffle, (await time.latest()) + 86400));
    await buy(carol, 10); // no cZAMA
    expect(await tickets(carol)).to.eq(0n);
    // a zero-ticket buyer can never take the lead: alice wins with certainty
    const res = await drawAndFinalize();
    expect(Object.values(res.clearValues)[0]).to.eq(alice.address);
  });

  it("the draw opens only winner + pot; the winner gets 90% and a relic, 10% refills the Treasury", async function () {
    await buy(alice, 5);
    await buy(bob, 3);
    const a0 = await bal(alice.address, alice);
    const b0 = await bal(bob.address, bob);
    await expect(raffle.draw()).to.be.revertedWithCustomError(raffle, "RoundOpen");
    const res = await drawAndFinalize();
    const winner = Object.values(res.clearValues)[0] as string;
    expect([alice.address, bob.address]).to.include(winner);
    expect(Object.values(res.clearValues)[1]).to.eq(8n * Z);
    const [r] = await raffle.getRound(1);
    expect(r.done).to.eq(true);
    expect(r.winner).to.eq(winner);
    expect(r.pot).to.eq(8n * Z);
    expect(await raffle.wins(winner)).to.eq(1);
    const gain = winner === alice.address ? (await bal(alice.address, alice)) - a0 : (await bal(bob.address, bob)) - b0;
    expect(gain).to.eq(7_200_000n);
    expect(await bal(treasury.address, treasury)).to.eq(800_000n);
    expect(await relics.totalRelics()).to.eq(1n);
    expect((await relics.getRelic(1n))[0].keeper).to.eq(winner);
    expect(await raffle.currentRound()).to.eq(2);
    // round 2 is fresh
    expect(await raffle.entered(2, alice.address)).to.eq(false);
    await buy(bob, 1);
    expect(await tickets(bob, 2)).to.eq(1n);
  });

  it("both buyers win sometimes (weighted lead over sealed counts)", async function () {
    const seen = new Set<string>();
    for (let i = 0; i < 8 && seen.size < 2; i++) {
      await buy(alice, 1);
      await buy(bob, 1);
      const res = await drawAndFinalize();
      seen.add(Object.values(res.clearValues)[0] as string);
    }
    expect(seen.size).to.eq(2);
  });

  it("an empty round is extended; buying after the deadline is refused", async function () {
    await time.increase(3 * 86400);
    const enc = await fhevm.createEncryptedInput(A.raffle, alice.address).add16(1).encrypt();
    await expect(raffle.connect(alice).buy(enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(raffle, "RoundClosed");
    await w(raffle.draw());
    expect(await raffle.currentRound()).to.eq(1);
    await buy(alice, 1);
    await expect(raffle.finalize("0x", "0x")).to.be.revertedWithCustomError(raffle, "NotDrawing");
  });
});
