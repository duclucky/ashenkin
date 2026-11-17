import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type {
  ChimeraArena,
  ChimeraExpeditions,
  ChimeraLab,
  ChimeraQuests,
  ChimeraRaid,
  ChimeraTraining,
  ChimeraTreasury,
  ConfidentialTokenMock,
} from "../types";

const Z = 1_000_000n; // 1 cZAMA (6 decimals)

describe("ChimeraTraining", function () {
  this.timeout(600_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner, dave: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let arena: ChimeraArena;
  let treasury: ChimeraTreasury;
  let raid: ChimeraRaid;
  let exp: ChimeraExpeditions;
  let quests: ChimeraQuests;
  let training: ChimeraTraining;
  const A: Record<string, string> = {};

  before(async function () {
    [deployer, alice, bob, , dave] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const f = (n: string) => ethers.getContractFactory(n).then((x) => x.connect(deployer));
    token = (await (await f("ConfidentialTokenMock")).deploy()) as unknown as ConfidentialTokenMock;
    A.token = await token.getAddress();
    lab = (await (await f("ChimeraLab")).deploy(A.token)) as unknown as ChimeraLab;
    A.lab = await lab.getAddress();
    arena = (await (await f("ChimeraArena")).deploy(A.lab, A.token)) as unknown as ChimeraArena;
    treasury = (await (await f("ChimeraTreasury")).deploy(A.token)) as unknown as ChimeraTreasury;
    raid = (await (await f("ChimeraRaid")).deploy(A.lab, A.token)) as unknown as ChimeraRaid;
    A.arena = await arena.getAddress();
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

    await w(token.mint(A.treasury, 10_000n * Z));
    for (const s of [alice, bob]) {
      await w(token.mint(s.address, 1_000n * Z));
      const until = (await time.latest()) + 86400 * 30;
      for (const op of [A.lab, A.arena, A.training]) await w(token.connect(s).setOperator(op, until));
      await w(lab.connect(s).setApprovalForAll(A.exp, true));
    }
  });

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

  async function pubValue(handle: string): Promise<bigint> {
    return BigInt(Object.values((await pub(handle)).clearValues)[0] as bigint);
  }

  async function hatch(s: HardhatEthersSigner) {
    await (await lab.connect(s).hatchGenesis()).wait();
    return lab.totalCreatures();
  }

  /** train → KMS proof of the paid bit → completeTraining; returns the decrypted paid bit */
  async function train(s: HardhatEthersSigner, id: bigint) {
    await (await training.connect(s).train(id)).wait();
    const [, , paidH] = await training.getProfile(id);
    const r = await pub(paidH);
    await (await training.completeTraining(id, r.abiEncodedClearValues, r.decryptionProof)).wait();
    return Boolean(r.clearValues[paidH as `0x${string}`]);
  }

  async function bonus(id: bigint, s: HardhatEthersSigner) {
    const [, , , bonusH] = await training.getProfile(id);
    return fhevm.userDecryptEuint(FhevmType.euint16, bonusH, A.training, s);
  }

  it("creatures earn public XP from raid strikes and expedition returns; only games may grant XP", async function () {
    const id = await hatch(alice);
    await (await raid.connect(alice).strike(id)).wait();
    let [p] = await training.getProfile(id);
    expect(p.xp).to.eq(12n); // STRIKE_XP

    await (await exp.connect(alice).start(id, 1)).wait();
    await time.increase(1800);
    await expect(exp.connect(alice).claim(await exp.totalExpeditions()))
      .to.emit(training, "XpGranted")
      .withArgs(id, A.exp, 25, 37);
    [p] = await training.getProfile(id);
    expect(p.xp).to.eq(37n);
    expect(await training.totalXp()).to.eq(37n);

    await expect(training.connect(alice).grantXp(id, 1000)).to.be.revertedWithCustomError(training, "NotGame");
    await expect(training.connect(alice).setGame(alice.address, true)).to.be.revertedWithCustomError(
      training,
      "OwnableUnauthorizedAccount",
    );
  });

  it("train() reverts without enough XP, for non-owners, and while a session is pending", async function () {
    await (await training.setGame(deployer.address, true)).wait();
    await (await training.setDailyXpCap(1_000_000)).wait(); // tests fast-forward levels
    const id = await hatch(alice);
    await expect(training.connect(alice).train(id))
      .to.be.revertedWithCustomError(training, "NotEnoughXp")
      .withArgs(id, 0, 10);
    await (await training.grantXp(id, 9)).wait();
    await expect(training.connect(alice).train(id))
      .to.be.revertedWithCustomError(training, "NotEnoughXp")
      .withArgs(id, 9, 10);
    await (await training.grantXp(id, 21)).wait(); // 30 XP: enough for levels 1 and 2

    await expect(training.connect(bob).train(id)).to.be.revertedWithCustomError(training, "NotOwner").withArgs(id);
    await expect(training.completeTraining(id, "0x", "0x"))
      .to.be.revertedWithCustomError(training, "NoTraining")
      .withArgs(id);

    await expect(training.connect(alice).train(id)).to.emit(training, "TrainingStarted");
    const [p] = await training.getProfile(id);
    expect(p.pending).to.eq(true);
    expect(p.spentXp).to.eq(10n);
    expect(p.xp).to.eq(20n);
    expect(p.fee).to.eq(3n * Z);
    expect(p.keeper).to.eq(alice.address);
    await expect(training.connect(alice).train(id))
      .to.be.revertedWithCustomError(training, "TrainingPending")
      .withArgs(id);
  });

  it("a paid session levels up, splits the fee 60/40 and seals a 2..5 bonus only the owner can decrypt", async function () {
    await (await training.setGame(deployer.address, true)).wait();
    await (await training.setDailyXpCap(1_000_000)).wait(); // tests fast-forward levels
    const id = await hatch(alice);
    await (await training.grantXp(id, 10)).wait();
    expect(await training.xpToNext(0)).to.eq(10);
    expect(await training.feeFor(0)).to.eq(3n * Z);

    await (await raid.publishPot()).wait();
    const potBefore = await pubValue(await raid.potHandle());
    await (await treasury.publishReserve()).wait();
    const reserveBefore = await pubValue(await treasury.reserveHandle());
    const before = await bal(alice.address, alice);

    expect(await train(alice, id)).to.eq(true);

    const [p, stage] = await training.getProfile(id);
    expect(p.level).to.eq(1n);
    expect(p.xp).to.eq(0n);
    expect(p.pending).to.eq(false);
    expect(p.spentXp).to.eq(0n);
    expect(p.trainings).to.eq(1n);
    expect(p.trainedAt).to.eq(BigInt(await time.latest()));
    expect(stage).to.eq(0n);
    expect(await training.levelOf(id)).to.eq(1);
    expect(await training.totalLevels()).to.eq(1);
    expect(await training.feesCollected()).to.eq(3n * Z);

    expect(await bal(alice.address, alice)).to.eq(before - 3n * Z);
    await (await raid.publishPot()).wait();
    expect(await pubValue(await raid.potHandle())).to.eq(potBefore + 1_800_000n);
    await (await treasury.publishReserve()).wait();
    expect(await pubValue(await treasury.reserveHandle())).to.eq(reserveBefore + 1_200_000n);

    const b = await bonus(id, alice);
    expect(b).to.be.within(2n, 5n);
    const [, , , bonusH] = await training.getProfile(id);
    await expect(fhevm.userDecryptEuint(FhevmType.euint16, bonusH, A.training, bob)).to.be.rejected;
    // reveal is owner-only
    await expect(training.connect(bob).reveal(id)).to.be.revertedWithCustomError(training, "NotOwner");
  });

  it("completeTraining rejects a forged paid bit and cannot be replayed", async function () {
    await (await training.setGame(deployer.address, true)).wait();
    await (await training.setDailyXpCap(1_000_000)).wait(); // tests fast-forward levels
    const id = await hatch(dave); // dave holds no cZAMA → the real bit is false
    await (await token.connect(dave).setOperator(A.training, (await time.latest()) + 86400)).wait();
    await (await training.grantXp(id, 10)).wait();
    await (await training.connect(dave).train(id)).wait();
    const [, , paidH] = await training.getProfile(id);
    const r = await pub(paidH);
    expect(r.clearValues[paidH as `0x${string}`]).to.eq(false);

    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
    await expect(training.completeTraining(id, forged, r.decryptionProof)).to.be.reverted;
    let [p] = await training.getProfile(id);
    expect(p.pending).to.eq(true);
    expect(p.level).to.eq(0n);

    await (await training.completeTraining(id, r.abiEncodedClearValues, r.decryptionProof)).wait();
    await expect(training.completeTraining(id, r.abiEncodedClearValues, r.decryptionProof))
      .to.be.revertedWithCustomError(training, "NoTraining")
      .withArgs(id);
    [p] = await training.getProfile(id);
    expect(p.level).to.eq(0n);
  });

  it("an unpaid session (keeper has no cZAMA) refunds the XP and grants no level or bonus", async function () {
    await (await training.setGame(deployer.address, true)).wait();
    await (await training.setDailyXpCap(1_000_000)).wait(); // tests fast-forward levels
    const id = await hatch(dave);
    await (await token.connect(dave).setOperator(A.training, (await time.latest()) + 86400)).wait();
    await (await training.grantXp(id, 15)).wait();
    await (await raid.publishPot()).wait();
    const potBefore = await pubValue(await raid.potHandle());

    await (await training.connect(dave).train(id)).wait();
    expect((await training.getProfile(id))[0].xp).to.eq(5n);
    const [, , paidH] = await training.getProfile(id);
    const r = await pub(paidH);
    expect(r.clearValues[paidH as `0x${string}`]).to.eq(false);
    await expect(training.completeTraining(id, r.abiEncodedClearValues, r.decryptionProof))
      .to.emit(training, "TrainingUnpaid")
      .withArgs(id, dave.address);

    const [p, , , bonusH] = await training.getProfile(id);
    expect(p.level).to.eq(0n);
    expect(p.xp).to.eq(15n);
    expect(p.spentXp).to.eq(0n);
    expect(p.pending).to.eq(false);
    expect(bonusH).to.eq(ethers.ZeroHash);
    expect(await training.feesCollected()).to.eq(0n);
    await (await raid.publishPot()).wait();
    expect(await pubValue(await raid.potHandle())).to.eq(potBefore);

    // without an operator grant the fee pull reverts outright
    const id2 = await hatch(bob);
    await (await training.grantXp(id2, 10)).wait();
    await (await token.connect(bob).setOperator(A.training, 0)).wait();
    await expect(training.connect(bob).train(id2)).to.be.reverted;
  });

  it("evolves to stage 1 at level 5 (+4 bonus) and stage 2 at level 10, then hits MaxLevel", async function () {
    await (await training.setGame(deployer.address, true)).wait();
    await (await training.setDailyXpCap(1_000_000)).wait(); // tests fast-forward levels
    const id = await hatch(alice);
    await (await training.grantXp(id, 550)).wait(); // sum of xpToNext(0..9)
    const before = await bal(alice.address, alice);

    for (let lvl = 1; lvl <= 10; lvl++) {
      expect(await train(alice, id)).to.eq(true);
      const [p, stage] = await training.getProfile(id);
      expect(p.level).to.eq(BigInt(lvl));
      expect(stage).to.eq(lvl >= 10 ? 2n : lvl >= 5 ? 1n : 0n);
      if (lvl === 4) expect(await bonus(id, alice)).to.be.within(8n, 20n);
      if (lvl === 5) expect(await bonus(id, alice)).to.be.within(14n, 29n); // 5×(2..5) + 4
    }
    const [p] = await training.getProfile(id);
    expect(p.xp).to.eq(0n);
    expect(await bonus(id, alice)).to.be.within(28n, 58n); // 10×(2..5) + 2×4
    // fees: sum(3 + 2L) for L = 0..9 = 120 cZAMA
    expect(await bal(alice.address, alice)).to.eq(before - 120n * Z);
    expect(await training.feesCollected()).to.eq(120n * Z);

    await (await training.grantXp(id, 1000)).wait();
    await expect(training.connect(alice).train(id)).to.be.revertedWithCustomError(training, "MaxLevel").withArgs(id);
  });

  it("a creature sold mid-session: the keeper pays, the new owner receives the bonus", async function () {
    await (await training.setGame(deployer.address, true)).wait();
    await (await training.setDailyXpCap(1_000_000)).wait(); // tests fast-forward levels
    const id = await hatch(alice);
    await (await training.grantXp(id, 10)).wait();
    const aliceBefore = await bal(alice.address, alice);
    await (await training.connect(alice).train(id)).wait();
    await (await lab.connect(alice).transferFrom(alice.address, bob.address, id)).wait();

    const [, , paidH] = await training.getProfile(id);
    const r = await pub(paidH);
    await expect(training.completeTraining(id, r.abiEncodedClearValues, r.decryptionProof))
      .to.emit(training, "LevelUp")
      .withArgs(id, bob.address, 1, 0, (h: string) => h !== ethers.ZeroHash);

    expect(await bal(alice.address, alice)).to.eq(aliceBefore - 3n * Z);
    expect(await bonus(id, bob)).to.be.within(2n, 5n);
    const [, , , bonusH] = await training.getProfile(id);
    await expect(fhevm.userDecryptEuint(FhevmType.euint16, bonusH, A.training, alice)).to.be.rejected;
  });
});
