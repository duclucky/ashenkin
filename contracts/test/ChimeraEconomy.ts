import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type {
  ChimeraArena,
  ChimeraExpeditions,
  ChimeraLab,
  ChimeraMarket,
  ChimeraQuests,
  ChimeraRaid,
  ChimeraTraining,
  ChimeraTreasury,
  ConfidentialTokenMock,
} from "../types";

const Z = 1_000_000n; // 1 cZAMA (6 decimals)
const TASK = { BREED: 0, BATTLE: 1, EXPEDITION: 2, RAID: 3 };

describe("Chimera economy (cZAMA)", function () {
  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner, carol: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let arena: ChimeraArena;
  let market: ChimeraMarket;
  let treasury: ChimeraTreasury;
  let raid: ChimeraRaid;
  let exp: ChimeraExpeditions;
  let quests: ChimeraQuests;
  let training: ChimeraTraining;
  let dave: HardhatEthersSigner;
  const A: Record<string, string> = {};
  const hcu: Record<string, { global: number; depth: number; gas: number }> = {};

  before(async function () {
    [deployer, alice, bob, carol, dave] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const f = (n: string) => ethers.getContractFactory(n).then((x) => x.connect(deployer));
    token = (await (await f("ConfidentialTokenMock")).deploy()) as unknown as ConfidentialTokenMock;
    A.token = await token.getAddress();
    lab = (await (await f("ChimeraLab")).deploy(A.token)) as unknown as ChimeraLab;
    A.lab = await lab.getAddress();
    arena = (await (await f("ChimeraArena")).deploy(A.lab, A.token)) as unknown as ChimeraArena;
    market = (await (await f("ChimeraMarket")).deploy(A.lab, A.token)) as unknown as ChimeraMarket;
    treasury = (await (await f("ChimeraTreasury")).deploy(A.token)) as unknown as ChimeraTreasury;
    raid = (await (await f("ChimeraRaid")).deploy(A.lab, A.token)) as unknown as ChimeraRaid;
    A.arena = await arena.getAddress();
    A.market = await market.getAddress();
    A.treasury = await treasury.getAddress();
    A.raid = await raid.getAddress();
    exp = (await (await f("ChimeraExpeditions")).deploy(A.lab, A.treasury)) as unknown as ChimeraExpeditions;
    A.exp = await exp.getAddress();
    quests = (await (await f("ChimeraQuests")).deploy(A.treasury)) as unknown as ChimeraQuests;
    A.quests = await quests.getAddress();
    training = (await (await f("ChimeraTraining")).deploy(A.lab, A.token)) as unknown as ChimeraTraining;
    A.training = await training.getAddress();

    const w = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();
    await w(lab.setArena(A.arena));
    await w(lab.setCombat(A.exp, true));
    await w(lab.setCombat(A.raid, true));
    await w(lab.setEconomy(A.raid, A.treasury, A.quests));
    await w(arena.setEconomy(A.raid, A.quests));
    await w(market.setRaid(A.raid));
    await w(raid.setQuests(A.quests));
    await w(exp.setQuests(A.quests));
    await w(treasury.setGame(A.exp, true));
    await w(treasury.setGame(A.quests, true));
    for (const g of [A.lab, A.arena, A.exp, A.raid]) await w(quests.setGame(g, true));
    await w(lab.setTraining(A.training, "https://chimera.example/api/nft/"));
    await w(training.setEconomy(A.raid, A.treasury));
    for (const g of [A.arena, A.exp, A.raid]) await w(training.setGame(g, true));
    await w(arena.setTraining(A.training));
    await w(raid.setTraining(A.training));
    await w(exp.setTraining(A.training));

    // seed the treasury
    await w(token.mint(A.treasury, 10_000n * Z));
    for (const s of [alice, bob, carol]) {
      await w(token.mint(s.address, 1_000n * Z));
      const until = (await time.latest()) + 86400 * 30;
      for (const op of [A.lab, A.arena, A.market, A.training]) await w(token.connect(s).setOperator(op, until));
      await w(lab.connect(s).setApprovalForAll(A.exp, true));
    }
  });

  after(function () {
    if (Object.keys(hcu).length) {
      console.log("\n      HCU per transaction (limits: 20,000,000 global / 5,000,000 depth)");
      for (const [k, v] of Object.entries(hcu)) {
        console.log(
          `        ${k.padEnd(16)} global ${v.global.toLocaleString().padStart(11)}   depth ${v.depth
            .toLocaleString()
            .padStart(10)}   gas ${v.gas.toLocaleString().padStart(11)}`,
        );
      }
    }
  });

  async function measure(label: string, p: Promise<{ wait: () => Promise<unknown> }>) {
    const receipt = (await (await p).wait()) as Parameters<typeof fhevm.computeTransactionHCU>[0] & { gasUsed: bigint };
    const info = fhevm.computeTransactionHCU(receipt);
    hcu[label] = { global: info.globalHCU, depth: info.maxHCUDepth, gas: Number(receipt.gasUsed) };
    return receipt;
  }

  async function bal(who: string, signer?: HardhatEthersSigner): Promise<bigint> {
    const h = await token.confidentialBalanceOf(who);
    if (h === ethers.ZeroHash) return 0n;
    if (signer) return fhevm.userDecryptEuint(FhevmType.euint64, h, A.token, signer);
    const r = await fhevm.publicDecrypt([h]);
    return BigInt(r.clearValues[h as `0x${string}`] as bigint);
  }

  async function pub(handle: string) {
    return fhevm.publicDecrypt([handle]);
  }

  async function hatch(s: HardhatEthersSigner) {
    await (await lab.connect(s).hatchGenesis()).wait();
    return lab.totalCreatures();
  }

  async function breed(s: HardhatEthersSigner, a: bigint, b: bigint) {
    await measure("breed (egg)", lab.connect(s).breed(a, b));
    const egg = await lab.totalCreatures();
    const [, paid] = await lab.getEgg(egg);
    const r = await pub(paid);
    await measure("hatchEgg", lab.hatchEgg(egg, r.abiEncodedClearValues, r.decryptionProof));
    return { egg, paid: Boolean(r.clearValues[paid as `0x${string}`]) };
  }

  /* ─────────────────────────────── breeding ─────────────────────────────── */

  it("breeding charges a rising cZAMA fee, splits it 60/40 and caps at 7", async function () {
    const a = await hatch(alice);
    const b = await hatch(alice);
    await time.increase(600);
    expect(await lab.breedFee(a, b)).to.eq(10n * Z);

    const { egg, paid } = await breed(alice, a, b);
    const ascension = await (await ethers.getContractFactory("ChimeraAscension")).deploy(A.lab, A.training);
    const altar = await ascension.getAddress();
    await (await lab.setRetirementVault(altar)).wait();
    expect(paid).to.eq(true);
    expect(await lab.ownerOf(egg)).to.eq(alice.address);
    expect(await bal(alice.address, alice)).to.eq(990n * Z);
    await (await raid.publishPot()).wait();
    expect(Object.values((await pub(await raid.potHandle())).clearValues)[0]).to.eq(6n * Z);
    expect((await lab.getCreature(a)).breeds).to.eq(1);
    expect(await lab.breedFee(a, b)).to.eq(16n * Z); // 8 + 8
    expect(await lab.feesCollected()).to.eq(10n * Z);

    // treasury got 40%
    await (await treasury.publishReserve()).wait();
    const reserve = await pub(await treasury.reserveHandle());
    expect(Object.values(reserve.clearValues)[0]).to.eq(10_000n * Z + 4n * Z);

    // 6 more breeds for `a` with fresh partners (genesis quota is 3 per wallet) → cap at 7
    const partners: bigint[] = [await hatch(alice)];
    for (const s of [bob, bob, bob, carol, carol, carol]) {
      const id = await hatch(s);
      await (await lab.connect(s).transferFrom(s.address, alice.address, id)).wait();
      partners.push(id);
    }
    let offering = egg;
    for (let i = 0; i < 6; i++) {
      await (await lab.connect(alice).approve(altar, offering)).wait();
      await (await ascension.connect(alice).retire(offering)).wait();
      await time.increase(3600);
      const child = await breed(alice, a, partners[i]);
      expect(child.paid).to.eq(true);
      offering = child.egg;
    }
    expect((await lab.getCreature(a)).breeds).to.eq(7);
    await time.increase(3600);
    await expect(lab.connect(alice).breed(a, partners[6])).to.be.revertedWithCustomError(lab, "BreedLimit");
  });

  it("an unpaid egg is a dud: no child, breed slots restored", async function () {
    const a = await hatch(carol);
    const b = await hatch(carol);
    await time.increase(600);
    // carol revokes the operator → the fee silently transfers 0
    await (await token.connect(carol).setOperator(A.lab, 0)).wait();
    await expect(lab.connect(carol).breed(a, b)).to.be.reverted; // not an operator → OZ reverts
    await (await token.connect(carol).setOperator(A.lab, (await time.latest()) + 86400)).wait();
    // drain carol so the fee transfer moves 0
    const all = await bal(carol.address, carol);
    const enc = await fhevm.createEncryptedInput(A.token, carol.address).add64(all).encrypt();
    await (
      await token
        .connect(carol)
        ["confidentialTransfer(address,bytes32,bytes)"](bob.address, enc.handles[0], enc.inputProof)
    ).wait();
    const { egg, paid } = await breed(carol, a, b);
    expect(paid).to.eq(false);
    await expect(lab.ownerOf(egg)).to.be.reverted;
    const [e] = await lab.getEgg(egg);
    expect(e.status).to.eq(3n); // Dud
    expect((await lab.getCreature(a)).breeds).to.eq(0);
  });

  /* ─────────────────────────────── expeditions ─────────────────────────────── */

  it("expeditions hold the creature, seal the outcome, and pay loot from the treasury", async function () {
    const id = await hatch(alice);
    const before = await bal(alice.address, alice);
    await measure("expedition start", exp.connect(alice).start(id, 2));
    expect(await lab.ownerOf(id)).to.eq(A.exp);
    const xid = await exp.totalExpeditions();
    await expect(exp.connect(alice).claim(xid)).to.be.revertedWithCustomError(exp, "StillAway");
    await expect(exp.connect(bob).claim(xid)).to.be.revertedWithCustomError(exp, "NotKeeper");
    await time.increase(3600);
    await measure("expedition claim", exp.connect(alice).claim(xid));
    expect(await lab.ownerOf(id)).to.eq(alice.address);

    const [, sH, lH] = await exp.getExpedition(xid);
    const ok = await fhevm.userDecryptEbool(sH, A.exp, alice);
    const loot = await fhevm.userDecryptEuint(FhevmType.euint64, lH, A.exp, alice);
    if (ok) expect(loot).to.be.within(20n * Z, 20n * Z + (1n << 25n));
    else expect(loot).to.eq(2n * Z);
    expect(await bal(alice.address, alice)).to.eq(before + loot);
    await expect(fhevm.userDecryptEbool(sH, A.exp, bob)).to.be.rejected;
    await expect(exp.connect(alice).claim(xid)).to.be.revertedWithCustomError(exp, "AlreadyClaimed");

    const [p] = await quests.status(alice.address);
    expect(Number(p.done) & (1 << TASK.EXPEDITION)).to.not.eq(0);
  });

  it("caps expeditions per day", async function () {
    await time.increaseTo((Math.floor((await time.latest()) / 86400) + 1) * 86400 + 60);
    const ids = [await hatch(bob), await hatch(bob), await hatch(bob)];
    for (let i = 0; i < 6; i++) {
      const id = ids[i % 3];
      if ((await lab.ownerOf(id)) !== bob.address) {
        await time.increase(600);
        await (await exp.connect(bob).claim((await exp.expeditionsOf(bob.address))[i - 3])).wait();
      }
      await (await exp.connect(bob).start(id, 0)).wait();
    }
    await time.increase(600);
    await (await exp.connect(bob).claim((await exp.expeditionsOf(bob.address))[3])).wait();
    await expect(exp.connect(bob).start(ids[0], 0)).to.be.revertedWithCustomError(exp, "DailyLimit");
  });

  /* ─────────────────────────────── world boss ─────────────────────────────── */

  it("world boss: encrypted HP, killing-blow bit, killer + raider shares", async function () {
    await (await token.mint(A.raid, 1_000n * Z)).wait();
    const [boss0] = await raid.getBoss(1);
    expect(boss0.maxHp).to.eq(1500);

    const fighters = [
      { s: alice, id: await hatch(alice) },
      { s: bob, id: await hatch(bob) },
      { s: alice, id: await hatch(alice) },
      { s: bob, id: await hatch(bob) },
    ];
    let killer: { strikeId: bigint; who: HardhatEthersSigner } | null = null;
    let dealt = 0n;
    for (let round = 0; round < 12 && !killer; round++) {
      for (const f of fighters) {
        await measure("raid strike", raid.connect(f.s).strike(f.id));
        const sid = await raid.totalStrikes();
        const [, kH] = await raid.getStrike(sid);
        const r = await pub(kH);
        if (r.clearValues[kH as `0x${string}`]) {
          killer = { strikeId: sid, who: f.s };
          await measure("raid finalize", raid.finalizeKill(sid, r.abiEncodedClearValues, r.decryptionProof));
          break;
        } else {
          await expect(raid.finalizeKill(sid, r.abiEncodedClearValues, r.decryptionProof)).to.be.revertedWithCustomError(
            raid,
            "NotKillingBlow",
          );
        }
      }
      await time.increase(601);
    }
    expect(killer).to.not.eq(null);
    dealt += await fhevm.userDecryptEuint(FhevmType.euint32, await raid.damageOf(1, alice.address), A.raid, alice);
    dealt += await fhevm.userDecryptEuint(FhevmType.euint32, await raid.damageOf(1, bob.address), A.raid, bob);
    expect(dealt).to.be.gte(1500n);

    const [slain] = await raid.getBoss(1);
    expect(slain.killer).to.eq(killer!.who.address);
    expect(slain.raiders).to.eq(2);
    expect(await raid.currentLevel()).to.eq(2);
    const [next] = await raid.getBoss(2);
    expect(next.maxHp).to.eq(2000);

    // pot was 1000: killer 250, each raider 250, 250 carries over (minus nothing owed)
    const pot = await pub(await raid.potHandle());
    expect(Object.values(pot.clearValues)[0]).to.eq(250n * Z);

    const aBefore = await bal(alice.address, alice);
    await (await raid.connect(alice).claimShare(1)).wait();
    expect(await bal(alice.address, alice)).to.eq(aBefore + 250n * Z);
    await expect(raid.connect(alice).claimShare(1)).to.be.revertedWithCustomError(raid, "AlreadyClaimed");
    await expect(raid.connect(carol).claimShare(1)).to.be.revertedWithCustomError(raid, "NotRaider");
    await (await raid.connect(bob).claimShare(1)).wait();
    const pot2 = await pub(await raid.potHandle());
    expect(Object.values(pot2.clearValues)[0]).to.eq(250n * Z);

    // the health band is public, coarse
    const [, bandH] = await raid.getBoss(1);
    expect(Object.values((await pub(bandH)).clearValues)[0]).to.eq(0n);
  });

  /* ─────────────────────────────── quests ─────────────────────────────── */

  it("daily quests: check-in streak multiplies task rewards and the chest", async function () {
    await time.increaseTo((Math.floor((await time.latest()) / 86400) + 1) * 86400 + 60);
    const before = await bal(carol.address, carol);
    await (await quests.connect(carol).checkIn()).wait();
    await expect(quests.connect(carol).checkIn()).to.be.revertedWithCustomError(quests, "AlreadyCheckedIn");
    await time.increase(86400);
    await (await quests.connect(carol).checkIn()).wait(); // streak 2 → 110%
    const [p, mult] = await quests.status(carol.address);
    expect(p.streak).to.eq(2);
    expect(mult).to.eq(110);

    await expect(quests.connect(carol).claimTask(TASK.BREED)).to.be.revertedWithCustomError(quests, "TaskNotDone");
    const id = await hatch(carol); // genesis counts as breeding
    await (await quests.connect(carol).claimTask(TASK.BREED)).wait();
    await expect(quests.connect(carol).claimTask(TASK.BREED)).to.be.revertedWithCustomError(quests, "AlreadyClaimed");
    await expect(quests.connect(carol).claimChest()).to.be.revertedWithCustomError(quests, "ChestLocked");

    await (await raid.connect(carol).strike(id)).wait();
    await (await arena.connect(carol).explore(id)).wait();
    const battleId = await arena.totalBattles();
    const [, oH] = await arena.getBattle(battleId);
    const r = await pub(oH);
    await (await arena.settle(battleId, r.abiEncodedClearValues, r.decryptionProof)).wait();
    if ((await lab.ownerOf(id)) === carol.address) {
      await (await exp.connect(carol).start(id, 0)).wait();
    }
    const [p2] = await quests.status(carol.address);
    expect(p2.done).to.eq(15);
    await (await quests.connect(carol).claimChest()).wait();

    // 1 (day 1) + 1.1 (day 2) + 2.2 (task) + 11 (chest)
    expect(await bal(carol.address, carol)).to.eq(before + 1n * Z + 1_100_000n + 2_200_000n + 11n * Z);
    const [p3] = await quests.status(carol.address);
    expect(p3.earned).to.eq(1n * Z + 1_100_000n + 2_200_000n + 11n * Z);

    await time.increase(86400 * 2);
    const [p4, m4] = await quests.status(carol.address);
    expect(p4.streak).to.eq(0);
    expect(m4).to.eq(100);
  });

  /* ─────────────────────────────── fees ─────────────────────────────── */

  it("market sales send 5% to the boss pot", async function () {
    const id = await hatch(alice);
    await (await lab.connect(alice).approve(A.market, id)).wait();
    await (await market.connect(alice).list(id, 100n * Z)).wait();
    const lid = await market.totalListings();
    const aBefore = await bal(alice.address, alice);
    await (await market.connect(bob).buy(lid)).wait();
    const [, paidH] = await market.getListing(lid);
    const r = await pub(paidH);
    await (await market.finalize(lid, r.abiEncodedClearValues, r.decryptionProof)).wait();
    expect(await bal(alice.address, alice)).to.eq(aBefore + 95n * Z);
    expect(await market.volume()).to.eq(100n * Z);
    await (await raid.publishPot()).wait();
    expect(Object.values((await pub(await raid.potHandle())).clearValues)[0]).to.eq(5n * Z);
  });

  it("duel pots pay a 5% rake to the boss pot", async function () {
    const d = await hatch(alice);
    const c = await hatch(bob);
    const stake = async (s: HardhatEthersSigner, v: bigint) =>
      fhevm.createEncryptedInput(A.arena, s.address).add64(v).encrypt();
    const e1 = await stake(alice, 40n * Z);
    await (await arena.connect(alice).registerDefender(d, e1.handles[0], e1.inputProof)).wait();
    const e2 = await stake(bob, 40n * Z);
    await (await arena.connect(bob).duel(c, d, e2.handles[0], e2.inputProof)).wait();
    const bid = await arena.totalBattles();
    const [, oH] = await arena.getBattle(bid);
    const r = await pub(oH);
    await measure("duel settle", arena.settle(bid, r.abiEncodedClearValues, r.decryptionProof));
    const won = Boolean(r.clearValues[oH as `0x${string}`]);
    const winner = won ? bob : alice;
    expect(await bal(winner.address, winner)).to.eq(1_000n * Z + 40n * Z - 4n * Z);
    await (await raid.publishPot()).wait();
    expect(Object.values((await pub(await raid.potHandle())).clearValues)[0]).to.eq(4n * Z);
  });

  /* ─────────────────────────────── training ─────────────────────────────── */

  async function train(s: HardhatEthersSigner, id: bigint) {
    await measure("train", training.connect(s).train(id));
    const [, , paidH] = await training.getProfile(id);
    const r = await pub(paidH);
    await measure("completeTraining", training.completeTraining(id, r.abiEncodedClearValues, r.decryptionProof));
    return Boolean(r.clearValues[paidH as `0x${string}`]);
  }

  it("training: XP from expeditions and raids, cZAMA fee 60/40, encrypted bonus for the owner only", async function () {
    const id = await hatch(alice);
    await expect(training.connect(alice).train(id)).to.be.revertedWithCustomError(training, "NotEnoughXp");
    await (await exp.connect(alice).start(id, 2)).wait();
    await time.increase(3600);
    await (await exp.connect(alice).claim(await exp.totalExpeditions())).wait();
    await measure("raid strike+xp", raid.connect(alice).strike(id));
    let [p] = await training.getProfile(id);
    expect(p.xp).to.eq(62n);

    await expect(training.connect(bob).train(id)).to.be.revertedWithCustomError(training, "NotOwner");
    await (await raid.publishPot()).wait();
    const pot = async () => BigInt(Object.values((await pub(await raid.potHandle())).clearValues)[0] as bigint);
    const raidBefore = await pot();
    const before = await bal(alice.address, alice);
    expect(await train(alice, id)).to.eq(true);
    [p] = await training.getProfile(id);
    expect(p.level).to.eq(1n);
    expect(p.xp).to.eq(52n);
    expect(await bal(alice.address, alice)).to.eq(before - 3n * Z);
    await (await raid.publishPot()).wait();
    expect(await pot()).to.eq(raidBefore + (3n * Z * 60n) / 100n);

    const [, , , bonusH] = await training.getProfile(id);
    const bonus = await fhevm.userDecryptEuint(FhevmType.euint16, bonusH, A.training, alice);
    expect(bonus).to.be.within(2n, 5n);
    await expect(fhevm.userDecryptEuint(FhevmType.euint16, bonusH, A.training, bob)).to.be.rejected;

    // the bonus feeds battleProfile (raid strike still works with trained power)
    await time.increase(700);
    await (await raid.connect(alice).strike(id)).wait();
  });

  it("training: evolution at level 5, unpaid sessions refund XP, children start untrained", async function () {
    await (await training.setGame(deployer.address, true)).wait();
    await (await training.setDailyXpCap(1_000_000)).wait(); // tests fast-forward levels
    const a = await hatch(alice);
    const b = await hatch(alice);
    await (await training.grantXp(a, 150)).wait();
    for (let i = 0; i < 5; i++) expect(await train(alice, a)).to.eq(true);
    const [p, stage] = await training.getProfile(a);
    expect(p.level).to.eq(5n);
    expect(stage).to.eq(1n);
    const [, , , bonusH] = await training.getProfile(a);
    const bonus = await fhevm.userDecryptEuint(FhevmType.euint16, bonusH, A.training, alice);
    expect(bonus).to.be.within(14n, 29n); // 5×(2..5) + 4 evolution bonus

    await time.increase(86400);
    const { egg } = await breed(alice, a, b);
    const [child, childStage, , childBonus] = await training.getProfile(egg);
    expect(child.level).to.eq(0n);
    expect(childStage).to.eq(0n);
    expect(childBonus).to.eq(ethers.ZeroHash);

    // dave has no cZAMA: fee moves 0 → session is unpaid, XP refunded, no level
    const d = await hatch(dave);
    await (await token.connect(dave).setOperator(A.training, (await time.latest()) + 86400)).wait();
    await (await training.grantXp(d, 10)).wait();
    expect(await train(dave, d)).to.eq(false);
    const [dp] = await training.getProfile(d);
    expect(dp.level).to.eq(0n);
    expect(dp.xp).to.eq(10n);

    // a sold creature: new owner can re-reveal the bonus
    await (await lab.connect(alice).transferFrom(alice.address, bob.address, a)).wait();
    await (await training.connect(bob).reveal(a)).wait();
    expect(await fhevm.userDecryptEuint(FhevmType.euint16, bonusH, A.training, bob)).to.eq(bonus);
  });

  it("tokenURI points at the metadata endpoint", async function () {
    const id = await hatch(alice);
    expect(await lab.tokenURI(id)).to.eq(`https://chimera.example/api/nft/${id}`);
  });
});
