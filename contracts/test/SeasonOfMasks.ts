import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { runDemo } from "../scripts/e2e-sepolia";
import type {
  ChimeraColosseum,
  ChimeraLab,
  ChimeraOracle,
  ChimeraQuests,
  ChimeraRaid,
  ChimeraRelics,
  ChimeraTraining,
  ChimeraTreasury,
  ConfidentialTokenMock,
} from "../types";

const Z = 1_000_000n;
const S = 0, G = 1, F = 2; // Strike, Guard, Feint
const pack = (m: number[]) => m[0] | (m[1] << 2) | (m[2] << 4);
const counter = (m: number) => (m === S ? G : m === G ? F : S); // the move that beats m
const beats = (a: number, b: number) => (a === G && b === S) || (a === F && b === G) || (a === S && b === F);

describe("Season of Masks (Colosseum · Relics · Oracle · Training v2)", function () {
  this.timeout(900_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let col: ChimeraColosseum;
  let relics: ChimeraRelics;
  let oracle: ChimeraOracle;
  let training: ChimeraTraining;
  let treasury: ChimeraTreasury;
  let raid: ChimeraRaid;
  let quests: ChimeraQuests;
  const A: Record<string, string> = {};
  const hcu: Record<string, { global: number; depth: number; gas: number }> = {};
  const w = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();

  before(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
  });

  after(function () {
    if (Object.keys(hcu).length) {
      console.log("\n      HCU per transaction (limits: 20,000,000 global / 5,000,000 depth)");
      for (const [k, v] of Object.entries(hcu))
        console.log(
          `        ${k.padEnd(20)} global ${v.global.toLocaleString().padStart(11)}   depth ${v.depth.toLocaleString().padStart(10)}   gas ${v.gas.toLocaleString().padStart(11)}`,
        );
    }
  });

  async function measure(label: string, txp: Promise<{ wait: () => Promise<unknown> }>) {
    const receipt = (await (await txp).wait()) as Parameters<typeof fhevm.computeTransactionHCU>[0];
    const info = fhevm.computeTransactionHCU(receipt);
    const prev = hcu[label];
    if (!prev || info.globalHCU > prev.global)
      hcu[label] = { global: info.globalHCU, depth: info.maxHCUDepth, gas: Number((receipt as { gasUsed: bigint }).gasUsed) };
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
    col = (await (await f("ChimeraColosseum")).deploy(A.lab, A.token)) as unknown as ChimeraColosseum;
    A.col = await col.getAddress();
    treasury = (await (await f("ChimeraTreasury")).deploy(A.token)) as unknown as ChimeraTreasury;
    A.treasury = await treasury.getAddress();
    raid = (await (await f("ChimeraRaid")).deploy(A.lab, A.token)) as unknown as ChimeraRaid;
    A.raid = await raid.getAddress();
    quests = (await (await f("ChimeraQuests")).deploy(A.treasury)) as unknown as ChimeraQuests;
    A.quests = await quests.getAddress();
    training = (await (await f("ChimeraTraining")).deploy(A.lab, A.token)) as unknown as ChimeraTraining;
    A.training = await training.getAddress();
    relics = (await (await f("ChimeraRelics")).deploy(A.lab, A.token)) as unknown as ChimeraRelics;
    A.relics = await relics.getAddress();
    oracle = (await (await f("ChimeraOracle")).deploy(A.token)) as unknown as ChimeraOracle;
    A.oracle = await oracle.getAddress();

    await w(lab.setArena(A.col));
    await w(lab.setCombat(A.raid, true));
    await w(lab.setEconomy(A.raid, A.treasury, A.quests));
    await w(lab.setTraining(A.training, ""));
    await w(col.setEconomy(A.raid, A.quests));
    await w(col.setTraining(A.training));
    await w(training.setEconomy(A.raid, A.treasury));
    await w(training.setRelics(A.relics));
    for (const g of [A.col, A.raid, deployer.address]) await w(training.setGame(g, true));
    await w(relics.setTraining(A.training));
    await w(relics.setEconomy(A.raid, A.treasury));
    await w(relics.setGame(A.oracle, true));
    await w(oracle.setRelics(A.relics));
    for (const g of [A.col, A.lab]) await w(quests.setGame(g, true));
    await w(treasury.setGame(A.quests, true));
    await w(token.mint(A.treasury, 10_000n * Z));
    for (const s of [alice, bob]) {
      await w(token.mint(s.address, 2_000n * Z));
      const until = (await time.latest()) + 86400 * 60;
      for (const op of [A.lab, A.col, A.training, A.relics, A.oracle]) await w(token.connect(s).setOperator(op, until));
    }
  });

  async function hatch(s: HardhatEthersSigner) {
    await w(lab.connect(s).hatchGenesis());
    return await lab.totalCreatures();
  }
  async function bal(s: HardhatEthersSigner) {
    return fhevm.userDecryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(s.address), A.token, s);
  }
  async function planInput(s: HardhatEthersSigner, moves: number[], stake?: bigint) {
    const b = fhevm.createEncryptedInput(A.col, s.address);
    if (stake !== undefined) b.add64(stake);
    b.add8(pack(moves));
    return b.encrypt();
  }
  async function settle(battleId: bigint, label = "colosseum.settle") {
    const [, hs] = await col.getBattle(battleId);
    const res = await fhevm.publicDecrypt([...hs]);
    const bits = hs.map((h) => Boolean(res.clearValues[h as `0x${string}`]));
    await measure(label, col.settle(battleId, res.abiEncodedClearValues, res.decryptionProof));
    return bits;
  }

  it("plays the demo from Genesis embryos to a proof-settled fight and sale", async function () {
    const market = await ethers.deployContract("ChimeraMarket", [A.lab, A.token]);
    const marketAddress = await market.getAddress();
    await w(market.setRaid(A.raid));
    await w(token.connect(bob).setOperator(marketAddress, (await time.latest()) + 86400));

    const { child, battleId, listingId } = await runDemo({
      lab,
      colosseum: col,
      market,
      seller: alice,
      buyer: bob,
      decrypt: (handles) => fhevm.publicDecrypt(handles),
      encryptPlan: (plan) => fhevm.createEncryptedInput(A.col, alice.address).add8(plan).encrypt(),
      waitUntil: async (timestamp) => {
        if (BigInt(await time.latest()) < timestamp) await time.increaseTo(timestamp);
      },
    });

    expect(await lab.genesisClaimed(alice.address)).to.eq(2n);
    expect((await lab.getEgg(child))[0].status).to.eq(2n); // Hatched
    const [battle] = await col.getBattle(battleId);
    expect(battle.status).to.eq(2n); // Settled
    expect(battle.challengerId).to.eq(child);
    const [listing] = await market.getListing(listingId);
    expect(listing.creatureId).to.eq(child);
    expect(await lab.ownerOf(child)).to.eq(bob.address);
    expect(await bal(alice)).to.eq(2_004_250_000n); // 2,000 - 10 breed + 14.25 sale
    expect(await bal(bob)).to.eq(1_985n * Z);
  });

  // ═════════════════════════════ Colosseum ═════════════════════════════

  describe("Colosseum — Blind Tactics", function () {
    it("explore fights a sealed plan vs a random wild plan; settlement reveals only 3 round bits", async function () {
      const mine = await hatch(alice);
      const enc = await planInput(alice, [S, G, F]);
      await measure("colosseum.explore", col.connect(alice).explore(mine, enc.handles[0], enc.inputProof));
      const wildId = await lab.totalCreatures();
      expect(await lab.ownerOf(wildId)).to.eq(A.col);
      const bits = await settle(1n);
      const [b] = await col.getBattle(1n);
      const taken = bits.filter(Boolean).length;
      expect(b.status).to.eq(2n);
      expect(b.challengerWon).to.eq(taken >= 2);
      expect(Number(b.rounds)).to.eq((bits[0] ? 1 : 0) | (bits[1] ? 2 : 0) | (bits[2] ? 4 : 0));
      expect(await lab.ownerOf(wildId)).to.eq(taken >= 2 ? alice.address : A.col);
      // the hunter may inspect the wild's (random, now harmless) plan
      const wp = await fhevm.userDecryptEuint(FhevmType.euint8, await col.wildPlanHandle(1n), A.col, alice);
      for (let i = 0; i < 3; i++) expect(Number((wp >> BigInt(2 * i)) & 3n)).to.be.within(0, 2);
      expect((await training.getProfile(mine))[0].xp).to.eq(taken >= 2 ? 15n : 8n);
      await expect(settle(1n)).to.be.reverted;
    });

    it("reading the defender's plan wins far more rounds than being read (why plans must stay sealed)", async function () {
      // three different pairings so a lopsided power gap cannot decide the comparison
      const signers = await ethers.getSigners();
      const defPlan = [S, F, G];
      let countered = 0, beaten = 0;
      for (let pair = 0; pair < 3; pair++) {
        const [x, y] = [signers[3 + 2 * pair], signers[4 + 2 * pair]];
        const until = (await time.latest()) + 86400;
        for (const s of [x, y]) await w(token.connect(s).setOperator(A.col, until));
        const a = await hatch(x);
        const d = await hatch(y);
        for (const knows of [true, false]) {
          const reg = await planInput(y, defPlan, 0n);
          await w(col.connect(y).registerDefender(d, reg.handles[0], reg.handles[1], reg.inputProof));
          // knowing: counter every round · not knowing: walk into every counter
          const mine = knows ? defPlan.map(counter) : defPlan.map((m) => [S, G, F].find((v) => beats(m, v))!);
          const enc = await planInput(x, mine, 0n);
          await measure("colosseum.duel", col.connect(x).duel(a, d, enc.handles[0], enc.handles[1], enc.inputProof));
          const t = (await settle(await col.totalBattles())).filter(Boolean).length;
          if (knows) countered += t;
          else beaten += t;
          await time.increase(181);
        }
      }
      expect(countered).to.be.gt(beaten);
    });

    it("duel stakes: only min(stake) is at risk, excess refunded, 5% rake, defender can replan / withdraw", async function () {
      const a = await hatch(alice);
      const d = await hatch(bob);
      const reg = await planInput(bob, [G, G, G], 40n * Z);
      await w(col.connect(bob).registerDefender(d, reg.handles[0], reg.handles[1], reg.inputProof));
      const rp = await planInput(bob, [F, S, G]);
      await measure("colosseum.replan", col.connect(bob).replan(d, rp.handles[0], rp.inputProof));
      const [, , active, replans, , planH] = await col.getDefender(d);
      expect(active).to.eq(true);
      expect(replans).to.eq(1n);
      expect(await fhevm.userDecryptEuint(FhevmType.euint8, planH, A.col, bob)).to.eq(BigInt(pack([F, S, G])));

      const a0 = await bal(alice), b0 = await bal(bob);
      const enc = await planInput(alice, [S, S, S], 100n * Z);
      await w(col.connect(alice).duel(a, d, enc.handles[0], enc.handles[1], enc.inputProof));
      const bits = await settle(await col.totalBattles());
      const won = bits.filter(Boolean).length >= 2;
      const a1 = await bal(alice), b1 = await bal(bob);
      // 40 matched each side → pot 80, rake 4, winner +36 net
      if (won) {
        expect(a1 - a0).to.eq(36n * Z);
        expect(b1 - b0).to.eq(0n); // bob's 40 was already escrowed at registration
      } else {
        expect(a1 - a0).to.eq(-40n * Z);
        expect(b1 - b0).to.eq(76n * Z);
      }
      // withdraw path
      const reg2 = await planInput(bob, [S, S, S], 10n * Z);
      await w(col.connect(bob).registerDefender(d, reg2.handles[0], reg2.handles[1], reg2.inputProof));
      const b2 = await bal(bob);
      await w(col.connect(bob).withdrawDefender(d));
      expect((await bal(bob)) - b2).to.eq(10n * Z);
    });
  });

  // ═════════════════════════════ Relics ═════════════════════════════

  describe("Relics — public odds, private results", function () {
    it("caches roll private tiers, pity guarantees Epic+ within 20, fees are split", async function () {
      const tiers: number[] = [];
      for (let i = 0; i < 20; i++) {
        await measure("relics.openCache", relics.connect(alice).openCache());
        const [, th, ph] = await relics.getRelic(await relics.totalRelics());
        const t = Number(await fhevm.userDecryptEuint(FhevmType.euint8, th, A.relics, alice));
        const p = Number(await fhevm.userDecryptEuint(FhevmType.euint16, ph, A.relics, alice));
        tiers.push(t);
        expect(t).to.be.within(1, 4);
        const [lo, hi] = [[0, 0], [2, 5], [6, 9], [11, 18], [20, 27]][t];
        expect(p).to.be.within(lo, hi);
      }
      expect(tiers.some((t) => t >= 3)).to.eq(true);
      expect(await relics.odds()).to.deep.eq([153n, 72n, 26n, 5n]);
      expect(await bal(alice)).to.eq(2_000n * Z - 20n * 25n * Z);
      // bob cannot read alice's relic
      const [, th] = await relics.getRelic(1n);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, th, A.relics, bob)).to.be.rejected;
    });

    it("an unpaid cache is Dust", async function () {
      const [, , , carol] = await ethers.getSigners();
      await w(token.connect(carol).setOperator(A.relics, (await time.latest()) + 3600));
      await w(relics.connect(carol).openCache());
      const [, th] = await relics.getRelic(1n);
      expect(await fhevm.userDecryptEuint(FhevmType.euint8, th, A.relics, carol)).to.eq(0n);
    });

    it("equip rules, battle with relics, fusion keeps best tier, appraisal publishes", async function () {
      const c = await hatch(alice);
      for (let i = 0; i < 4; i++) await w(relics.connect(alice).openCache());
      await measure("relics.equip", relics.connect(alice).equip(1n, c, 0));
      expect(await relics.slotsOf(c)).to.deep.eq([1n, 0n]);
      await expect(relics.connect(alice).equip(2n, c, 1)).to.be.revertedWithCustomError(relics, "SlotLocked");
      await expect(relics.connect(bob).equip(2n, c, 0)).to.be.revertedWithCustomError(relics, "NotKeeper");
      // battle path folds relic power in via Training.bonusOf → Relics.bonusOf
      const enc = await planInput(alice, [S, G, F]);
      await measure("colosseum.explore+relic", col.connect(alice).explore(c, enc.handles[0], enc.inputProof));
      await settle(1n);
      await expect(relics.connect(alice).fuse(1n, 2n, 3n)).to.be.revertedWithCustomError(relics, "Busy");
      await w(relics.connect(alice).unequip(1n));

      const tierOf = async (id: bigint) =>
        Number(await fhevm.userDecryptEuint(FhevmType.euint8, (await relics.getRelic(id))[1], A.relics, alice));
      const best = Math.max(await tierOf(1n), await tierOf(2n), await tierOf(3n));
      await measure("relics.fuse", relics.connect(alice).fuse(1n, 2n, 3n));
      const fused = await relics.totalRelics();
      const ft = await tierOf(fused);
      expect(ft).to.be.within(best, Math.min(best + 1, 4));
      expect((await relics.getRelic(1n))[0].burned).to.eq(true);

      await w(relics.connect(alice).appraise(fused));
      const [, th, ph] = await relics.getRelic(fused);
      const res = await fhevm.publicDecrypt([th, ph]);
      await w(relics.publishAppraisal(fused, res.abiEncodedClearValues, res.decryptionProof));
      const [r] = await relics.getRelic(fused);
      expect(r.appraised).to.eq(true);
      expect(Number(r.tier)).to.eq(ft);
    });
  });

  // ═════════════════════════════ Oracle ═════════════════════════════

  describe("Oracle's Riddle — private hints", function () {
    it("hints are private, a 4/4 solver takes the jackpot + a relic, the answer is revealed", async function () {
      await w(oracle.setRules(3 * 86400, 40));
      const hint = async (s: HardhatEthersSigner, g: number[], label?: string) => {
        const packed = g[0] | (g[1] << 4) | (g[2] << 8) | (g[3] << 12);
        const enc = await fhevm.createEncryptedInput(A.oracle, s.address).add16(packed).encrypt();
        const tx = oracle.connect(s).guess(enc.handles[0], enc.inputProof);
        if (label) await measure(label, tx);
        else await w(tx);
        const id = await oracle.totalGuesses();
        const [, fh] = await oracle.getGuess(id);
        const fb = Number(await fhevm.userDecryptEuint(FhevmType.euint8, fh, A.oracle, s));
        return { id, codes: [0, 1, 2, 3].map((i) => (fb >> (2 * i)) & 3), fh };
      };
      // bob plays once: alice cannot read bob's hint
      const bobs = await hint(bob, [0, 0, 0, 0]);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, bobs.fh, A.oracle, alice)).to.be.rejected;

      // alice sweeps values gene-wise until every gene is exact
      const answer = [-1, -1, -1, -1];
      let last = { id: 0n, codes: [0, 0, 0, 0] };
      for (let v = 0; v < 16 && answer.includes(-1); v++) {
        const g = answer.map((a) => (a >= 0 ? a : v));
        last = await hint(alice, g, "oracle.guess");
        last.codes.forEach((c, i) => {
          if (c === 2) answer[i] = g[i];
        });
      }
      expect(answer.includes(-1)).to.eq(false);
      if (!last.codes.every((c) => c === 2)) last = await hint(alice, answer);
      expect(last.codes).to.deep.eq([2, 2, 2, 2]);

      const a0 = await bal(alice);
      const guesses = Number(await oracle.totalGuesses());
      await w(oracle.connect(alice).claim(last.id));
      const [, , sh] = await oracle.getGuess(last.id);
      const res = await fhevm.publicDecrypt([sh]);
      await measure("oracle.finalize", oracle.finalize(last.id, res.abiEncodedClearValues, res.decryptionProof));
      expect(await oracle.solves(alice.address)).to.eq(1n);
      expect((await bal(alice)) - a0).to.eq(BigInt(guesses) * 2n * Z);
      expect(await relics.totalRelics()).to.eq(1n);
      expect((await relics.getRelic(1n))[0].keeper).to.eq(alice.address);

      // the answer is now publicly verifiable
      const [round, ah] = await oracle.getRound(1);
      expect(round.ended).to.eq(true);
      expect(round.solver).to.eq(alice.address);
      const pub = await fhevm.publicDecrypt([...ah]);
      expect(ah.map((h) => Number(pub.clearValues[h as `0x${string}`]))).to.deep.eq(answer);
      // a stale claim is rejected
      await expect(oracle.connect(bob).claim(bobs.id)).to.be.revertedWithCustomError(oracle, "StaleGuess");
      // next guess opens round 2
      await hint(bob, [1, 2, 3, 4]);
      expect(await oracle.currentRound()).to.eq(2);
    });

    it("daily guess limit and expiry roll the jackpot over", async function () {
      for (let i = 0; i < 6; i++) {
        const enc = await fhevm.createEncryptedInput(A.oracle, bob.address).add16(i).encrypt();
        await w(oracle.connect(bob).guess(enc.handles[0], enc.inputProof));
      }
      const enc = await fhevm.createEncryptedInput(A.oracle, bob.address).add16(9).encrypt();
      await expect(oracle.connect(bob).guess(enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(oracle, "DailyLimit");
      await expect(oracle.expire()).to.be.revertedWithCustomError(oracle, "RoundLive");
      await time.increase(3 * 86400);
      await w(oracle.expire());
      const pot = await oracle.potHandle();
      const res = await fhevm.publicDecrypt([pot]);
      expect(res.clearValues[pot as `0x${string}`]).to.eq(12n * Z);
    });
  });

  // ═════════════════════════════ Training v2 ═════════════════════════════

  describe("Training v2", function () {
    it("caps XP per creature per UTC day", async function () {
      const c = await hatch(alice);
      await w(training.grantXp(c, 100));
      await w(training.grantXp(c, 100));
      expect((await training.getProfile(c))[0].xp).to.eq(120n);
      expect(await training.xpRoomToday(c)).to.eq(0n);
      await time.increase(86400);
      expect(await training.xpRoomToday(c)).to.eq(120n);
      await w(training.grantXp(c, 15));
      expect((await training.getProfile(c))[0].xp).to.eq(135n);
    });

    it("migrates public levels from v1 with a re-rolled private bonus", async function () {
      const c = await hatch(alice);
      await measure("training.migrate(L6)", training.migrate([c], [6], [42]));
      const [p, stage, , bh] = await training.getProfile(c);
      expect(p.level).to.eq(6n);
      expect(p.xp).to.eq(42n);
      expect(stage).to.eq(1n);
      const bonus = Number(await fhevm.userDecryptEuint(FhevmType.euint16, bh, A.training, alice));
      expect(bonus).to.be.within(6 * 2 + 4, 6 * 5 + 4);
      // slot 1 opens at level 5
      await w(relics.connect(alice).openCache());
      await w(relics.connect(alice).openCache());
      await w(relics.connect(alice).equip(1n, c, 0));
      await w(relics.connect(alice).equip(2n, c, 1));
      await w(training.closeMigration());
      await expect(training.migrate([c], [1], [0])).to.be.reverted;
    });
  });
});
