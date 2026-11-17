import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { ChimeraDepths, ChimeraLab, ChimeraRelics, ChimeraTraining, ChimeraTreasury, ConfidentialTokenMock } from "../types";

const Z = 1_000_000n;
const w = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();

describe("ChimeraDepths", function () {
  this.timeout(900_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner, carol: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let treasury: ChimeraTreasury;
  let training: ChimeraTraining;
  let relics: ChimeraRelics;
  let depths: ChimeraDepths;
  const A: Record<string, string> = {};
  const hcu: Record<string, { global: number; depth: number; gas: number }> = {};

  before(async function () {
    [deployer, alice, bob, carol] = await ethers.getSigners();
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
    treasury = (await (await f("ChimeraTreasury")).deploy(A.token)) as unknown as ChimeraTreasury;
    A.treasury = await treasury.getAddress();
    training = (await (await f("ChimeraTraining")).deploy(A.lab, A.token)) as unknown as ChimeraTraining;
    A.training = await training.getAddress();
    relics = (await (await f("ChimeraRelics")).deploy(A.lab, A.token)) as unknown as ChimeraRelics;
    A.relics = await relics.getAddress();
    depths = (await (await f("ChimeraDepths")).deploy(A.token, A.lab, A.treasury, A.training)) as unknown as ChimeraDepths;
    A.depths = await depths.getAddress();

    await w(lab.setTraining(A.training, "https://chimera.example/api/nft/"));
    await w(lab.setCombat(A.depths, true));
    await w(training.setGame(A.depths, true));
    await w(treasury.setGame(A.depths, true));
    await w(relics.setGame(A.depths, true));
    await w(depths.setLinks(A.treasury, A.training, A.relics));

    await w(token.mint(A.treasury, 10_000n * Z));
    for (const s of [alice, bob]) {
      await w(token.mint(s.address, 1_000n * Z));
      await w(token.connect(s).setOperator(A.lab, (await time.latest()) + 86400 * 30));
    }
  });

  const approve = async (s: HardhatEthersSigner) => w(token.connect(s).setOperator(A.depths, (await time.latest()) + 86400 * 30));
  async function hatch(s: HardhatEthersSigner) {
    await w(lab.connect(s).hatchGenesis());
    return lab.totalCreatures();
  }
  const dec16 = (h: string, s: HardhatEthersSigner) => fhevm.userDecryptEuint(FhevmType.euint16, h, A.depths, s);
  const dec64 = (h: string, s: HardhatEthersSigner) => fhevm.userDecryptEuint(FhevmType.euint64, h, A.depths, s);
  const dec8 = (h: string, s: HardhatEthersSigner) => fhevm.userDecryptEuint(FhevmType.euint8, h, A.depths, s);
  const bal = async (s: HardhatEthersSigner) => fhevm.userDecryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(s.address), A.token, s);

  async function enter(s: HardhatEthersSigner, id: bigint) {
    await measure("depths.enter", depths.connect(s).enter(id));
    return depths.totalRuns();
  }

  /** opens the lit door every floor (a "careful" delver) and checks the private bookkeeping on the way */
  async function delve(s: HardhatEthersSigner, runId: bigint, floors: number, smart = false) {
    let [, hpH, maxH] = await depths.getRun(runId);
    let hp = await dec16(hpH, s);
    const max = await dec16(maxH, s);
    let sack = 0n;
    for (let i = 0; i < floors; i++) {
      const [run, , , , litH] = await depths.getRun(runId);
      const peek = await dec8(litH, s);
      expect(Number(peek)).to.be.within(0, 3);
      // a smart delver avoids a lit trap or monster and gambles on a dark door instead
      const pick = smart && (peek === 1n || peek === 3n) ? (Number(run.lit) + 1) % 3 : Number(run.lit);
      await measure("depths.open", depths.connect(s).open(runId, pick));
      const [door, cH, dH, lH] = await depths.floorLog(runId, run.floor);
      expect(door).to.eq(pick);
      if (pick === Number(run.lit)) expect(await dec8(cH, s)).to.eq(peek); // the lantern told the truth
      const dmg = await dec16(dH, s);
      const kept = await dec64(lH, s);
      hp = hp > dmg ? hp - dmg : 0n;
      sack = hp > 0n ? sack + kept : 0n;
      if (hp === 0n) expect(kept).to.eq(0n);
      ;[, hpH] = await depths.getRun(runId);
      expect(await dec16(hpH, s)).to.eq(hp);
    }
    const [, , , sackH] = await depths.getRun(runId);
    expect(await dec64(sackH, s)).to.eq(sack);
    return { hp, max, sack };
  }

  it("enter: checks ownership, charges 2 cZAMA, seals health from hidden power, one run at a time, 3 a day", async function () {
    const id = await hatch(alice);
    await approve(alice);
    await expect(depths.connect(bob).enter(id)).to.be.revertedWithCustomError(depths, "NotOwner").withArgs(id);
    const before = await bal(alice);
    await expect(depths.connect(alice).enter(id)).to.emit(depths, "RunStarted").withArgs(1n, alice.address, id);
    expect(await bal(alice)).to.eq(before - 2n * Z);
    expect(await depths.activeRun(alice.address)).to.eq(1n);
    await expect(depths.connect(alice).enter(id)).to.be.revertedWithCustomError(depths, "RunActive").withArgs(1n);

    const [run, hpH, maxH, sackH] = await depths.getRun(1n);
    expect(run.keeper).to.eq(alice.address);
    expect(run.floor).to.eq(1);
    expect(run.cleared).to.eq(0);
    const hp = await dec16(hpH, alice);
    expect(hp).to.eq(await dec16(maxH, alice));
    expect(hp).to.be.gte(60n);
    expect(hp).to.be.lte(60n + 75n + 10n);
    expect(await dec64(sackH, alice)).to.eq(0n);
    // bob sees nothing
    await expect(dec16(hpH, bob)).to.be.rejected;

    await w(depths.connect(alice).leave(1n));
    await enter(alice, id);
    await w(depths.connect(alice).leave(2n));
    await enter(alice, id);
    await w(depths.connect(alice).leave(3n));
    expect(await depths.runsToday(alice.address)).to.eq(3);
    await expect(depths.connect(alice).enter(id)).to.be.revertedWithCustomError(depths, "DailyLimit");
    await time.increase(86400);
    await enter(alice, id);
  });

  it("the lantern shows one door to the delver only; the other two stay sealed", async function () {
    const id = await hatch(alice);
    await approve(alice);
    const runId = await enter(alice, id);
    const [run, , , , litH] = await depths.getRun(runId);
    expect(run.lit).to.be.within(0, 2);
    expect(Number(await dec8(litH, alice))).to.be.within(0, 3);
    await expect(dec8(litH, bob)).to.be.rejected;
    await expect(depths.connect(alice).open(runId, 3)).to.be.revertedWithCustomError(depths, "BadDoor");
    await expect(depths.connect(bob).open(runId, 0)).to.be.revertedWithCustomError(depths, "NotKeeper").withArgs(runId);
    // open an unlit door: its content becomes visible afterwards (in the floor log), not before
    const dark = (Number(run.lit) + 1) % 3;
    await measure("depths.open", depths.connect(alice).open(runId, dark));
    const [door, cH] = await depths.floorLog(runId, 1);
    expect(door).to.eq(dark);
    expect(Number(await dec8(cH, alice))).to.be.within(0, 3);
    await expect(dec8(cH, bob)).to.be.rejected;
    const [run2] = await depths.getRun(runId);
    expect(run2.floor).to.eq(2);
    expect(run2.cleared).to.eq(1);
  });

  it("an entry you cannot afford starts with 0 health: the sack can never fill and pays 0", async function () {
    const id = await hatch(carol); // carol holds no cZAMA, but approves the dungeon
    await approve(carol);
    const runId = await enter(carol, id);
    const [, hpH] = await depths.getRun(runId);
    expect(await dec16(hpH, carol)).to.eq(0n);
    const r = await delve(carol, runId, 3);
    expect(r.sack).to.eq(0n);
    await measure("depths.leave", depths.connect(carol).leave(runId));
    const [, , , , , survH, paidH] = await depths.getRun(runId);
    expect(await dec64(paidH, carol)).to.eq(0n);
    expect(await fhevm.userDecryptEbool(survH, A.depths, carol)).to.eq(false);
  });

  it("full descent: floor log matches health and sack, payout and XP on leave, bottom at floor 10", async function () {
    const id = await hatch(alice);
    await approve(alice);
    const runId = await enter(alice, id);
    const before = await bal(alice);
    const r = await delve(alice, runId, 10);
    await expect(depths.connect(alice).open(runId, 0)).to.be.revertedWithCustomError(depths, "Bottom");
    const [run, , , , litH] = await depths.getRun(runId);
    expect(run.cleared).to.eq(10);
    expect(litH).to.eq(ethers.ZeroHash);
    await expect(depths.connect(alice).leave(runId)).to.emit(depths, "RunEnded");
    expect(await bal(alice)).to.eq(before + r.sack);
    const [, , , , , survH, paidH] = await depths.getRun(runId);
    expect(await dec64(paidH, alice)).to.eq(r.sack);
    expect(await fhevm.userDecryptEbool(survH, A.depths, alice)).to.eq(r.hp > 0n);
    const [profile] = await training.getProfile(id);
    expect(profile.xp).to.eq(60n);
    expect(await depths.activeRun(alice.address)).to.eq(0n);
    await expect(depths.connect(alice).leave(runId)).to.be.revertedWithCustomError(depths, "RunOver").withArgs(runId);
    await expect(depths.connect(alice).open(runId, 0)).to.be.revertedWithCustomError(depths, "RunOver").withArgs(runId);
    console.log(`        full descent: hp ${r.hp}/${r.max}, loot ${Number(r.sack) / 1e6} cZAMA`);
  });

  it("depth proof: only the survival bit is opened; survivors past floor 6 earn a relic cache", async function () {
    await w(depths.setMaxDailyRuns(20));
    const id = await hatch(alice);
    await approve(alice);
    // unpaid → certainly dead: proves the "died" branch
    const dead = await hatch(carol);
    await approve(carol);
    const deadRun = await enter(carol, dead);
    await delve(carol, deadRun, 7);
    await expect(depths.connect(carol).revealSurvival(deadRun)).to.be.revertedWithCustomError(depths, "RunNotOver");
    await w(depths.connect(carol).leave(deadRun));
    await expect(depths.connect(alice).revealSurvival(deadRun)).to.be.revertedWithCustomError(depths, "NotKeeper");
    await measure("depths.reveal", depths.connect(carol).revealSurvival(deadRun));
    const [, , , , , survDead] = await depths.getRun(deadRun);
    const rd = await fhevm.publicDecrypt([survDead]);
    expect(rd.clearValues[survDead as `0x${string}`]).to.eq(false);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
    await expect(depths.recordDepth(deadRun, forged, rd.decryptionProof)).to.be.reverted;
    await expect(depths.recordDepth(deadRun, rd.abiEncodedClearValues, rd.decryptionProof))
      .to.emit(depths, "DepthRecorded")
      .withArgs(deadRun, carol.address, 7, false, 0n);
    expect(await depths.bestDepth(carol.address)).to.eq(0);
    await expect(depths.recordDepth(deadRun, rd.abiEncodedClearValues, rd.decryptionProof)).to.be.revertedWithCustomError(depths, "AlreadyRecorded");

    // alice delves 7 floors until she survives once
    let proved = false;
    for (let t = 0; t < 10 && !proved; t++) {
      const runId = await enter(alice, id);
      const r = await delve(alice, runId, 7, true);
      await w(depths.connect(alice).leave(runId));
      if (r.hp === 0n) continue;
      await w(depths.connect(alice).revealSurvival(runId));
      const [, , , , , survH] = await depths.getRun(runId);
      const res = await fhevm.publicDecrypt([survH]);
      const caches = await relics.cachesOpened();
      await measure("depths.recordDepth", depths.recordDepth(runId, res.abiEncodedClearValues, res.decryptionProof));
      expect(await relics.cachesOpened()).to.eq(caches + 1n);
      expect(await depths.bestDepth(alice.address)).to.eq(7);
      expect(await depths.deepest()).to.eq(7);
      expect(await depths.deepestKeeper()).to.eq(alice.address);
      proved = true;
    }
    if (!proved) console.log("        (alice never survived 7 floors in 10 tries — survivor branch skipped)");
  });
});
