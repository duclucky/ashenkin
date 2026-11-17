import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type {
  ChimeraExpeditions,
  ChimeraLab,
  ChimeraQuests,
  ChimeraRaid,
  ChimeraTraining,
  ChimeraTreasury,
  ConfidentialTokenMock,
} from "../types";

const Z = 1_000_000n; // 1 cZAMA (6 decimals)
const TASK_RAID = 3;

describe("ChimeraRaid", function () {
  this.timeout(600_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner, carol: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let treasury: ChimeraTreasury;
  let raid: ChimeraRaid;
  let exp: ChimeraExpeditions;
  let quests: ChimeraQuests;
  let training: ChimeraTraining;
  const A: Record<string, string> = {};

  before(async function () {
    [deployer, alice, bob, carol] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const f = (n: string) => ethers.getContractFactory(n).then((x) => x.connect(deployer));
    token = (await (await f("ConfidentialTokenMock")).deploy()) as unknown as ConfidentialTokenMock;
    A.token = await token.getAddress();
    lab = (await (await f("ChimeraLab")).deploy(A.token)) as unknown as ChimeraLab;
    A.lab = await lab.getAddress();
    treasury = (await (await f("ChimeraTreasury")).deploy(A.token)) as unknown as ChimeraTreasury;
    raid = (await (await f("ChimeraRaid")).deploy(A.lab, A.token)) as unknown as ChimeraRaid;
    A.treasury = await treasury.getAddress();
    A.raid = await raid.getAddress();
    exp = (await (await f("ChimeraExpeditions")).deploy(A.lab, A.treasury)) as unknown as ChimeraExpeditions;
    A.exp = await exp.getAddress();
    quests = (await (await f("ChimeraQuests")).deploy(A.treasury)) as unknown as ChimeraQuests;
    A.quests = await quests.getAddress();
    training = (await (await f("ChimeraTraining")).deploy(A.lab, A.token)) as unknown as ChimeraTraining;
    A.training = await training.getAddress();

    const w = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();
    await w(lab.setCombat(A.exp, true));
    await w(lab.setCombat(A.raid, true));
    await w(lab.setEconomy(A.raid, A.treasury, A.quests));
    await w(raid.setQuests(A.quests));
    await w(exp.setQuests(A.quests));
    await w(treasury.setGame(A.exp, true));
    await w(treasury.setGame(A.quests, true));
    for (const g of [A.lab, A.exp, A.raid]) await w(quests.setGame(g, true));
    await w(lab.setTraining(A.training, "https://chimera.example/api/nft/"));
    await w(training.setEconomy(A.raid, A.treasury));
    for (const g of [A.exp, A.raid]) await w(training.setGame(g, true));
    await w(raid.setTraining(A.training));
    await w(exp.setTraining(A.training));

    await w(token.mint(A.treasury, 10_000n * Z));
    for (const s of [alice, bob, carol]) {
      await w(token.mint(s.address, 1_000n * Z));
      const until = (await time.latest()) + 86400 * 30;
      for (const op of [A.lab, A.training]) await w(token.connect(s).setOperator(op, until));
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

  /** strike and return the strike id plus the handles from the Struck event */
  async function strike(s: HardhatEthersSigner, id: bigint) {
    const receipt = await (await raid.connect(s).strike(id)).wait();
    const ev = receipt!.logs
      .map((l) => {
        try {
          return raid.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "Struck")!;
    return {
      strikeId: ev.args.strikeId as bigint,
      killingH: ev.args.killingHandle as string,
      damageH: ev.args.damageHandle as string,
      bandH: ev.args.bandHandle as string,
    };
  }

  it("a strike is recorded, grants XP and the raid task, and reveals only the killing bit and health band", async function () {
    const id = await hatch(alice);
    const [boss] = await raid.getBoss(1);
    expect(boss.level).to.eq(1);
    expect(boss.maxHp).to.eq(1500);
    expect(boss.element).to.be.lt(3);
    expect(await raid.currentLevel()).to.eq(1);

    const s = await strike(alice, id);
    expect(s.strikeId).to.eq(1n);
    const [st, kH] = await raid.getStrike(1);
    expect(st.attacker).to.eq(alice.address);
    expect(st.creatureId).to.eq(id);
    expect(st.level).to.eq(1);
    expect(kH).to.eq(s.killingH);

    // a genesis creature hits for at most 150 + 25 + 63 → the first strike can never kill a 1500 HP boss
    expect((await pub(kH)).clearValues[kH as `0x${string}`]).to.eq(false);
    const band = await pubValue(s.bandH);
    expect(band).to.be.within(9n, 10n);
    const [b1, bandH] = await raid.getBoss(1);
    expect(bandH).to.eq(s.bandH);
    expect(b1.raiders).to.eq(1);
    expect(b1.strikes).to.eq(1);
    expect(await raid.joined(1, alice.address)).to.eq(true);
    expect((await training.getProfile(id))[0].xp).to.eq(12n);
    const [q] = await quests.status(alice.address);
    expect(Number(q.done) & (1 << TASK_RAID)).to.not.eq(0);

    // the damage itself is not public
    await expect(pub(s.damageH)).to.be.rejected;
  });

  it("enforces the per-creature strike cooldown and owner-only strikes", async function () {
    const a = await hatch(alice);
    const a2 = await hatch(alice);
    await expect(raid.connect(bob).strike(a)).to.be.revertedWithCustomError(raid, "NotOwner").withArgs(a);

    await (await raid.connect(alice).strike(a)).wait();
    const ready = await raid.readyAt(a);
    expect(ready).to.eq(BigInt(await time.latest()) + 600n);
    await expect(raid.connect(alice).strike(a)).to.be.revertedWithCustomError(raid, "NotReady").withArgs(a, ready);
    // a different creature is not on cooldown
    await (await raid.connect(alice).strike(a2)).wait();

    await time.increaseTo(ready - 5n);
    await expect(raid.connect(alice).strike(a)).to.be.revertedWithCustomError(raid, "NotReady");
    await time.increaseTo(ready);
    await (await raid.connect(alice).strike(a)).wait();
    expect((await raid.getBoss(1))[0].strikes).to.eq(3);
    expect((await raid.getBoss(1))[0].raiders).to.eq(1); // one keeper, counted once

    // cooldown is owner-configurable
    await expect(raid.connect(alice).setStrikeCooldown(0)).to.be.revertedWithCustomError(
      raid,
      "OwnableUnauthorizedAccount",
    );
    await (await raid.setStrikeCooldown(0)).wait();
    // lowering the cooldown does not shorten a readyAt that was already stamped
    await expect(raid.connect(alice).strike(a)).to.be.revertedWithCustomError(raid, "NotReady");
    const a3 = await hatch(alice);
    await (await raid.connect(alice).strike(a3)).wait();
    await (await raid.connect(alice).strike(a3)).wait();
  });

  it("damage totals are decryptable by the striker only and sum the individual hits", async function () {
    const id = await hatch(alice);
    const first = await strike(alice, id);
    const d1 = await fhevm.userDecryptEuint(FhevmType.euint32, first.damageH, A.raid, alice);
    expect(d1).to.be.within(0n, 150n + 25n + 63n);
    const total1 = await fhevm.userDecryptEuint(FhevmType.euint32, await raid.damageOf(1, alice.address), A.raid, alice);
    expect(total1).to.eq(d1);
    await expect(fhevm.userDecryptEuint(FhevmType.euint32, first.damageH, A.raid, bob)).to.be.rejected;
    await expect(
      fhevm.userDecryptEuint(FhevmType.euint32, await raid.damageOf(1, alice.address), A.raid, bob),
    ).to.be.rejected;

    await time.increase(601);
    const second = await strike(alice, id);
    // every strike's own damage handle is ACL'd to the raid too, so the striker can always decrypt it
    const d2 = await fhevm.userDecryptEuint(FhevmType.euint32, second.damageH, A.raid, alice);
    expect(d2).to.be.lte(150n + 25n + 63n);
    await expect(fhevm.userDecryptEuint(FhevmType.euint32, second.damageH, A.raid, bob)).to.be.rejected;
    const total2 = await fhevm.userDecryptEuint(FhevmType.euint32, await raid.damageOf(1, alice.address), A.raid, alice);
    expect(total2).to.eq(total1 + d2);
    expect(await raid.damageOf(1, bob.address)).to.eq(ethers.ZeroHash);

    // the health band tracks the hidden HP: ceil((1500 - dealt) * 10 / 1500)
    const [, bandH] = await raid.getBoss(1);
    expect(await pubValue(bandH)).to.eq((((1500n - total2) * 10n + 1499n) / 1500n) as bigint);
  });

  it("finalizeKill rejects non-lethal strikes; the kill pays 25% to the killer, 50% split, 25% carries over", async function () {
    await (await raid.setStrikeCooldown(0)).wait();
    await (await token.mint(A.raid, 400n * Z)).wait();
    const a = await hatch(alice);
    const b = await hatch(bob);

    const first = await strike(alice, a);
    const r0 = await pub(first.killingH);
    await expect(raid.finalizeKill(first.strikeId, r0.abiEncodedClearValues, r0.decryptionProof))
      .to.be.revertedWithCustomError(raid, "NotKillingBlow")
      .withArgs(first.strikeId);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
    await expect(raid.finalizeKill(first.strikeId, forged, r0.decryptionProof)).to.be.reverted;
    await expect(raid.connect(alice).claimShare(1)).to.be.revertedWithCustomError(raid, "NotSlain").withArgs(1);

    let kill: { strikeId: bigint; who: HardhatEthersSigner; r: Awaited<ReturnType<typeof pub>> } | null = null;
    for (let i = 0; i < 80 && !kill; i++) {
      const [who, id] = i % 2 === 0 ? [bob, b] : [alice, a];
      const s = await strike(who, id);
      const r = await pub(s.killingH);
      if (r.clearValues[s.killingH as `0x${string}`]) kill = { strikeId: s.strikeId, who, r };
    }
    expect(kill, "boss never fell").to.not.eq(null);

    // a strike landing after the killing blow (before finalisation) hits a dead boss: never a killing blow,
    // and the late keeper does not dilute the raiders' share
    const late = await strike(carol, await hatch(carol));
    expect((await pub(late.killingH)).clearValues[late.killingH as `0x${string}`]).to.eq(false);
    expect((await raid.getBoss(1))[0].raiders).to.eq(3);

    const killerBefore = await bal(kill!.who.address, kill!.who);
    await expect(raid.finalizeKill(kill!.strikeId, kill!.r.abiEncodedClearValues, kill!.r.decryptionProof))
      .to.emit(raid, "BossSlain")
      .withArgs(1, kill!.who.address, kill!.strikeId, 2);
    expect(await raid.killStrikeOf(1)).to.eq(kill!.strikeId);
    expect((await raid.getBoss(1))[0].raiders).to.eq(2);
    // pot 400: killer 100, the two raiders who struck before the kill split 200
    expect(await bal(kill!.who.address, kill!.who)).to.eq(killerBefore + 100n * Z);
    const [slain, , shareH] = await raid.getBoss(1);
    expect(slain.killer).to.eq(kill!.who.address);
    expect(slain.slainAt).to.be.gt(0n);
    expect(await raid.currentLevel()).to.eq(2);
    expect((await raid.getBoss(2))[0].maxHp).to.eq(2000);
    const share = 100n * Z;
    // the pot excludes shares owed to raiders: 400 - 100 - 2·share
    expect(await pubValue(await raid.potHandle())).to.eq(300n * Z - 2n * share);

    await expect(
      raid.finalizeKill(kill!.strikeId, kill!.r.abiEncodedClearValues, kill!.r.decryptionProof),
    ).to.be.revertedWithCustomError(raid, "AlreadySlain");

    expect(await raid.canClaim(1, carol.address)).to.eq(false);
    await expect(raid.connect(carol).claimShare(1)).to.be.revertedWithCustomError(raid, "LateToTheFight").withArgs(1);
    for (const s of [alice, bob]) {
      expect(await raid.canClaim(1, s.address)).to.eq(true);
      const before = await bal(s.address, s);
      await (await raid.connect(s).claimShare(1)).wait();
      expect(await bal(s.address, s)).to.eq(before + share);
      expect(await raid.canClaim(1, s.address)).to.eq(false);
    }
    await expect(raid.connect(alice).claimShare(1)).to.be.revertedWithCustomError(raid, "AlreadyClaimed");
    await expect(raid.connect(deployer).claimShare(1)).to.be.revertedWithCustomError(raid, "NotRaider");
    expect(shareH).to.not.eq(ethers.ZeroHash);
    // 25% (plus rounding dust) carries over to the level-2 boss
    expect(await pubValue(await raid.potHandle())).to.eq(400n * Z - 100n * Z - 2n * share);
  });

  it("the pot is public and grows with deposits", async function () {
    await (await raid.publishPot()).wait();
    expect(await pubValue(await raid.potHandle())).to.eq(0n);
    await (await token.mint(A.raid, 42n * Z)).wait();
    await expect(raid.publishPot()).to.emit(raid, "PotPublished");
    expect(await pubValue(await raid.potHandle())).to.eq(42n * Z);
  });
});
