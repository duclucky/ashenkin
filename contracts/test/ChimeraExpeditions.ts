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
const TASK_EXPEDITION = 2;

describe("ChimeraExpeditions", function () {
  this.timeout(600_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let treasury: ChimeraTreasury;
  let raid: ChimeraRaid;
  let exp: ChimeraExpeditions;
  let quests: ChimeraQuests;
  let training: ChimeraTraining;
  const A: Record<string, string> = {};

  before(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
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
    for (const s of [alice, bob]) {
      await w(token.mint(s.address, 1_000n * Z));
      const until = (await time.latest()) + 86400 * 30;
      for (const op of [A.lab, A.training]) await w(token.connect(s).setOperator(op, until));
    }
  });

  async function bal(who: string, signer?: HardhatEthersSigner): Promise<bigint> {
    const h = await token.confidentialBalanceOf(who);
    if (h === ethers.ZeroHash) return 0n;
    if (signer) return fhevm.userDecryptEuint(FhevmType.euint64, h, A.token, signer);
    const r = await fhevm.publicDecrypt([h]);
    return BigInt(r.clearValues[h as `0x${string}`] as bigint);
  }

  async function reserve(): Promise<bigint> {
    await (await treasury.publishReserve()).wait();
    const h = await treasury.reserveHandle();
    return BigInt(Object.values((await fhevm.publicDecrypt([h])).clearValues)[0] as bigint);
  }

  async function hatch(s: HardhatEthersSigner) {
    await (await lab.connect(s).hatchGenesis()).wait();
    return lab.totalCreatures();
  }

  async function nextUtcDay() {
    await time.increaseTo((Math.floor((await time.latest()) / 86400) + 1) * 86400 + 60);
  }

  it("start needs approval, validates zone and ownership, and takes the creature into custody", async function () {
    const id = await hatch(alice);
    await expect(exp.connect(alice).start(id, 0)).to.be.reverted; // no approval → ERC721 transfer fails
    await (await lab.connect(alice).setApprovalForAll(A.exp, true)).wait();
    await expect(exp.connect(alice).start(id, 3)).to.be.revertedWithCustomError(exp, "InvalidZone").withArgs(3);
    await expect(exp.connect(bob).start(id, 0)).to.be.revertedWithCustomError(exp, "NotOwner").withArgs(id);

    await expect(exp.connect(alice).start(id, 1)).to.emit(exp, "ExpeditionStarted");
    const xid = await exp.totalExpeditions();
    expect(await lab.ownerOf(id)).to.eq(A.exp);
    const [e, sH, lH, sentH] = await exp.getExpedition(xid);
    expect(e.keeper).to.eq(alice.address);
    expect(e.creatureId).to.eq(id);
    expect(e.zone).to.eq(1);
    expect(e.claimed).to.eq(false);
    expect(e.endsAt - e.startedAt).to.eq(BigInt((await exp.getZone(1)).duration));
    expect(e.endsAt - e.startedAt).to.eq(1800n);
    expect(sentH).to.eq(ethers.ZeroHash);
    expect(await exp.runsToday(alice.address)).to.eq(1);
    expect(await exp.expeditionsOf(alice.address)).to.deep.eq([xid]);
    const [q] = await quests.status(alice.address);
    expect(Number(q.done) & (1 << TASK_EXPEDITION)).to.not.eq(0);

    // the sealed report is not readable by anyone while away — not even the keeper
    await expect(fhevm.userDecryptEbool(sH, A.exp, alice)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, lH, A.exp, alice)).to.be.rejected;
    // the creature is busy: it cannot strike the boss or be started again
    await expect(raid.connect(alice).strike(id)).to.be.revertedWithCustomError(raid, "NotOwner");
    await expect(exp.connect(alice).start(id, 0)).to.be.revertedWithCustomError(exp, "NotOwner");
  });

  it("claim is keeper-only, blocked until endsAt and cannot be repeated", async function () {
    const id = await hatch(alice);
    await (await lab.connect(alice).setApprovalForAll(A.exp, true)).wait();
    await (await exp.connect(alice).start(id, 0)).wait();
    const xid = await exp.totalExpeditions();
    const [e] = await exp.getExpedition(xid);

    await expect(exp.connect(alice).claim(xid))
      .to.be.revertedWithCustomError(exp, "StillAway")
      .withArgs(xid, e.endsAt);
    await time.increaseTo(e.endsAt - 5n);
    await expect(exp.connect(alice).claim(xid)).to.be.revertedWithCustomError(exp, "StillAway");
    await time.increaseTo(e.endsAt);
    await expect(exp.connect(bob).claim(xid)).to.be.revertedWithCustomError(exp, "NotKeeper").withArgs(xid);
    await expect(exp.connect(alice).claim(xid)).to.emit(exp, "ExpeditionReturned");
    expect(await lab.ownerOf(id)).to.eq(alice.address);
    expect((await exp.getExpedition(xid))[0].claimed).to.eq(true);
    await expect(exp.connect(alice).claim(xid)).to.be.revertedWithCustomError(exp, "AlreadyClaimed").withArgs(xid);
    await expect(exp.connect(alice).claim(999)).to.be.revertedWithCustomError(exp, "NotKeeper");
  });

  it("claim returns the creature, grants zone XP and pays the sealed loot from the treasury (keeper-only report)", async function () {
    const id = await hatch(alice);
    await (await lab.connect(alice).setApprovalForAll(A.exp, true)).wait();
    const before = await bal(alice.address, alice);
    const reserveBefore = await reserve();
    await (await exp.connect(alice).start(id, 2)).wait();
    const xid = await exp.totalExpeditions();
    await time.increase(3600);
    await (await exp.connect(alice).claim(xid)).wait();

    expect(await lab.ownerOf(id)).to.eq(alice.address);
    expect((await training.getProfile(id))[0].xp).to.eq(BigInt(await exp.xpFor(2)));
    expect(await exp.xpFor(2)).to.eq(50);

    const [, sH, lH, sentH] = await exp.getExpedition(xid);
    const ok = await fhevm.userDecryptEbool(sH, A.exp, alice);
    const loot = await fhevm.userDecryptEuint(FhevmType.euint64, lH, A.exp, alice);
    if (ok) expect(loot).to.be.within(20n * Z, 20n * Z + (1n << 25n) - 1n);
    else expect(loot).to.eq(2n * Z);
    // what actually moved is readable by the keeper via the token's ACL
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, sentH, A.token, alice)).to.eq(loot);
    expect(await bal(alice.address, alice)).to.eq(before + loot);
    expect(await reserve()).to.eq(reserveBefore - loot);

    await expect(fhevm.userDecryptEbool(sH, A.exp, bob)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, lH, A.exp, bob)).to.be.rejected;
  });

  it("an oversized reward pays the affordable daily budget and still returns the creature", async function () {
    const id = await hatch(alice);
    await (await lab.connect(alice).setApprovalForAll(A.exp, true)).wait();
    // make every outcome cost more than the 10,000 cZAMA reserve
    await (
      await exp.setZone(0, {
        duration: 600,
        difficulty: 60,
        element: 0,
        lootBase: 20_000n * Z,
        lootRoll: 1n << 22n,
        consolation: 20_000n * Z,
      })
    ).wait();
    await expect(
      exp.connect(alice).setZone(0, { duration: 1, difficulty: 1, element: 0, lootBase: 1, lootRoll: 1, consolation: 1 }),
    ).to.be.revertedWithCustomError(exp, "OwnableUnauthorizedAccount");

    const before = await bal(alice.address, alice);
    await (await exp.connect(alice).start(id, 0)).wait();
    const xid = await exp.totalExpeditions();
    await time.increase(600);
    await (await exp.connect(alice).claim(xid)).wait();

    const [, , lH, sentH] = await exp.getExpedition(xid);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, lH, A.exp, alice)).to.be.gte(20_000n * Z);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, sentH, A.token, alice)).to.eq(100n * Z);
    expect(await bal(alice.address, alice)).to.eq(before + 100n * Z);
    expect(await reserve()).to.eq(9_900n * Z);
    expect(await lab.ownerOf(id)).to.eq(alice.address); // the creature still comes home
  });

  it("caps runs per keeper per UTC day and resets the next day", async function () {
    await nextUtcDay();
    await (await lab.connect(bob).setApprovalForAll(A.exp, true)).wait();
    expect(await exp.maxDailyRuns()).to.eq(6);
    await (await exp.setMaxDailyRuns(2)).wait();
    const ids = [await hatch(bob), await hatch(bob), await hatch(bob)];
    await (await exp.connect(bob).start(ids[0], 0)).wait();
    await (await exp.connect(bob).start(ids[1], 0)).wait();
    expect(await exp.runsToday(bob.address)).to.eq(2);
    await expect(exp.connect(bob).start(ids[2], 0)).to.be.revertedWithCustomError(exp, "DailyLimit");
    // the limit is per keeper, not global
    await (await lab.connect(alice).setApprovalForAll(A.exp, true)).wait();
    await (await exp.connect(alice).start(await hatch(alice), 0)).wait();

    await time.increase(86400);
    expect(await exp.runsToday(bob.address)).to.eq(0);
    await (await exp.connect(bob).start(ids[2], 0)).wait();
    expect(await exp.runsToday(bob.address)).to.eq(1);
  });

  it("only accepts ERC-721 safe transfers from the lab", async function () {
    const otherLab = (await (await ethers.getContractFactory("ChimeraLab"))
      .connect(deployer)
      .deploy(A.token)) as unknown as ChimeraLab;
    await (await otherLab.connect(alice).hatchGenesis()).wait();
    const foreign = await otherLab.totalCreatures();
    await expect(
      otherLab
        .connect(alice)
        ["safeTransferFrom(address,address,uint256)"](alice.address, A.exp, foreign),
    ).to.be.revertedWithCustomError(exp, "UnexpectedNft");
  });
});
