import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { ChimeraLab, ChimeraQuests, ChimeraRaid, ChimeraTreasury, ConfidentialTokenMock } from "../types";

const Z = 1_000_000n; // 1 cZAMA (6 decimals)
const TASK = { BREED: 0, BATTLE: 1, EXPEDITION: 2, RAID: 3 };

describe("ChimeraQuests", function () {
  this.timeout(600_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let treasury: ChimeraTreasury;
  let raid: ChimeraRaid;
  let quests: ChimeraQuests;
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
    quests = (await (await f("ChimeraQuests")).deploy(A.treasury)) as unknown as ChimeraQuests;
    A.quests = await quests.getAddress();

    const w = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();
    await w(lab.setCombat(A.raid, true));
    await w(lab.setEconomy(A.raid, A.treasury, A.quests));
    await w(raid.setQuests(A.quests));
    await w(treasury.setGame(A.quests, true));
    for (const g of [A.lab, A.raid]) await w(quests.setGame(g, true));

    await w(token.mint(A.treasury, 10_000n * Z));
    // align to just after UTC midnight so a test never straddles a day boundary by accident
    await time.increaseTo((Math.floor((await time.latest()) / 86400) + 1) * 86400 + 60);
  });

  async function bal(who: string, signer?: HardhatEthersSigner): Promise<bigint> {
    const h = await token.confidentialBalanceOf(who);
    if (h === ethers.ZeroHash) return 0n;
    if (signer) return fhevm.userDecryptEuint(FhevmType.euint64, h, A.token, signer);
    const r = await fhevm.publicDecrypt([h]);
    return BigInt(r.clearValues[h as `0x${string}`] as bigint);
  }

  async function hatch(s: HardhatEthersSigner) {
    await (await lab.connect(s).hatchGenesis()).wait();
    return lab.totalCreatures();
  }

  it("check-in pays 1 cZAMA once per UTC day and builds a +10%/day streak", async function () {
    await expect(quests.connect(alice).checkIn())
      .to.emit(quests, "Rewarded")
      .withArgs(alice.address, 4, 1n * Z);
    await expect(quests.connect(alice).checkIn()).to.be.revertedWithCustomError(quests, "AlreadyCheckedIn");
    let [p, mult, today] = await quests.status(alice.address);
    expect(p.streak).to.eq(1);
    expect(p.lastCheckIn).to.eq(today);
    expect(mult).to.eq(100);

    await time.increase(86400);
    await expect(quests.connect(alice).checkIn()).to.emit(quests, "Rewarded").withArgs(alice.address, 4, 1_100_000n);
    await time.increase(86400);
    await expect(quests.connect(alice).checkIn()).to.emit(quests, "Rewarded").withArgs(alice.address, 4, 1_200_000n);
    [p, mult] = await quests.status(alice.address);
    expect(p.streak).to.eq(3);
    expect(p.bestStreak).to.eq(3);
    expect(mult).to.eq(120);
    expect(p.earned).to.eq(3_300_000n);
    expect(await bal(alice.address, alice)).to.eq(3_300_000n);
  });

  it("the streak bonus caps at +100% from day 11 on", async function () {
    for (let day = 1; day <= 12; day++) {
      const expected = (1n * Z * BigInt(100 + Math.min(day - 1, 10) * 10)) / 100n;
      await expect(quests.connect(bob).checkIn()).to.emit(quests, "Rewarded").withArgs(bob.address, 4, expected);
      await time.increase(86400);
    }
    const [p] = await quests.status(bob.address);
    expect(p.streak).to.eq(12);
    expect(p.bestStreak).to.eq(12);
    // days 1-10: 1.0 + 1.1 + … + 1.9 = 14.5, days 11-12: 2.0 + 2.0 → 18.5 cZAMA
    expect(p.earned).to.eq(18_500_000n);
  });

  it("missing a day resets the streak to 1 but keeps bestStreak", async function () {
    await (await quests.connect(alice).checkIn()).wait();
    await time.increase(86400);
    await (await quests.connect(alice).checkIn()).wait();
    await time.increase(86400 * 2); // skip a day
    let [p, mult] = await quests.status(alice.address);
    expect(p.streak).to.eq(0); // the view reports the broken streak
    expect(mult).to.eq(100);
    await expect(quests.connect(alice).checkIn()).to.emit(quests, "Rewarded").withArgs(alice.address, 4, 1n * Z);
    [p] = await quests.status(alice.address);
    expect(p.streak).to.eq(1);
    expect(p.bestStreak).to.eq(2);
  });

  it("tasks are recorded only by games and can be claimed once per day after completion", async function () {
    await expect(quests.connect(alice).record(alice.address, TASK.RAID)).to.be.revertedWithCustomError(
      quests,
      "NotGame",
    );
    await expect(quests.connect(alice).claimTask(TASK.RAID))
      .to.be.revertedWithCustomError(quests, "TaskNotDone")
      .withArgs(TASK.RAID);

    const id = await hatch(alice); // genesis → BREED, via the lab
    await (await raid.connect(alice).strike(id)).wait(); // → RAID, via the raid
    const [p] = await quests.status(alice.address);
    expect(p.done).to.eq((1 << TASK.BREED) | (1 << TASK.RAID));

    await expect(quests.connect(alice).claimTask(TASK.RAID)).to.emit(quests, "Rewarded").withArgs(alice.address, 3, 2n * Z);
    await expect(quests.connect(alice).claimTask(TASK.RAID)).to.be.revertedWithCustomError(quests, "AlreadyClaimed");
    await (await quests.connect(alice).claimTask(TASK.BREED)).wait();
    expect(await bal(alice.address, alice)).to.eq(4n * Z);
    expect((await quests.status(alice.address))[0].claimedMask).to.eq(p.done);

    // next UTC day: progress and claims reset
    await time.increase(86400);
    const [p2] = await quests.status(alice.address);
    expect(p2.done).to.eq(0);
    expect(p2.claimedMask).to.eq(0);
    await expect(quests.connect(alice).claimTask(TASK.RAID)).to.be.revertedWithCustomError(quests, "TaskNotDone");
    await time.increase(601);
    await (await raid.connect(alice).strike(id)).wait();
    await (await quests.connect(alice).claimTask(TASK.RAID)).wait();
  });

  it("the streak multiplier only applies to rewards claimed after checking in that day", async function () {
    await (await quests.setGame(deployer.address, true)).wait();
    await (await quests.connect(alice).checkIn()).wait();
    await time.increase(86400);
    // day 2, not yet checked in: 100%
    await (await quests.record(alice.address, TASK.BATTLE)).wait();
    await expect(quests.connect(alice).claimTask(TASK.BATTLE)).to.emit(quests, "Rewarded").withArgs(alice.address, 1, 2n * Z);
    await (await quests.connect(alice).checkIn()).wait(); // streak 2 → 110%
    await (await quests.record(alice.address, TASK.EXPEDITION)).wait();
    await expect(quests.connect(alice).claimTask(TASK.EXPEDITION))
      .to.emit(quests, "Rewarded")
      .withArgs(alice.address, 2, 2_200_000n);
  });

  it("the chest unlocks only once all four tasks are done, and pays once per day", async function () {
    await (await quests.setGame(deployer.address, true)).wait();
    expect(await quests.ALL_TASKS()).to.eq(15);
    for (const t of [TASK.BREED, TASK.BATTLE, TASK.EXPEDITION]) await (await quests.record(bob.address, t)).wait();
    await expect(quests.connect(bob).claimChest()).to.be.revertedWithCustomError(quests, "ChestLocked");
    await expect(quests.record(bob.address, TASK.RAID)).to.emit(quests, "TaskDone");
    await expect(quests.record(bob.address, TASK.RAID)).to.not.emit(quests, "TaskDone"); // idempotent

    await expect(quests.connect(bob).claimChest()).to.emit(quests, "Rewarded").withArgs(bob.address, 5, 10n * Z);
    await expect(quests.connect(bob).claimChest()).to.be.revertedWithCustomError(quests, "AlreadyClaimed");
    expect(await bal(bob.address, bob)).to.eq(10n * Z);

    await time.increase(86400);
    await expect(quests.connect(bob).claimChest()).to.be.revertedWithCustomError(quests, "ChestLocked");
  });

  it("an empty treasury pays 0 cZAMA while `earned` still counts the reward", async function () {
    const f = (n: string) => ethers.getContractFactory(n).then((x) => x.connect(deployer));
    const empty = (await (await f("ChimeraTreasury")).deploy(A.token)) as unknown as ChimeraTreasury;
    const q2 = (await (await f("ChimeraQuests")).deploy(await empty.getAddress())) as unknown as ChimeraQuests;
    await (await empty.setGame(await q2.getAddress(), true)).wait();

    await (await q2.connect(alice).checkIn()).wait();
    const [p] = await q2.status(alice.address);
    expect(p.earned).to.eq(1n * Z);
    expect(await bal(alice.address, alice)).to.eq(0n);
  });

  it("claims check-in, remaining tasks and the chest in one capped Treasury payout", async function () {
    await quests.setGame(deployer.address, true);
    await quests.connect(alice).checkIn();
    await time.increase(86400);
    for (const task of Object.values(TASK)) await quests.record(alice.address, task);
    await quests.connect(alice).claimTask(TASK.BREED);

    const [, , today] = await quests.status(alice.address);
    const payouts = await treasury.payouts();
    await expect(quests.connect(alice).claimAll(today))
      .to.emit(quests, "RewardsClaimed")
      .withArgs(alice.address, today, 14, true, true)
      .and.to.emit(quests, "Rewarded")
      .withArgs(alice.address, 6, 18_700_000n);
    const [player, mult] = await quests.status(alice.address);
    expect(player.claimedMask).to.eq(15);
    expect(player.chestClaimed).to.eq(true);
    expect(player.streak).to.eq(2);
    expect(mult).to.eq(110);
    expect(player.earned).to.eq(21_700_000n);
    expect(await bal(alice.address, alice)).to.eq(21_700_000n);
    expect(await treasury.payouts()).to.eq(payouts + 1n);
    await expect(quests.connect(alice).claimAll(today)).to.be.revertedWithCustomError(quests, "NothingToClaim");
    await expect(quests.connect(alice).claimTask(TASK.BATTLE)).to.be.revertedWithCustomError(quests, "AlreadyClaimed");
    await expect(quests.connect(alice).claimChest()).to.be.revertedWithCustomError(quests, "AlreadyClaimed");
  });

  it("skips incomplete tasks and rejects a quote from the previous UTC day", async function () {
    await quests.setGame(deployer.address, true);
    await quests.record(bob.address, TASK.RAID);
    const [, , today] = await quests.status(bob.address);
    await expect(quests.connect(bob).claimAll(today)).to.emit(quests, "RewardsClaimed")
      .withArgs(bob.address, today, 8, true, false);
    const [player] = await quests.status(bob.address);
    expect(player.earned).to.eq(3n * Z);
    expect(player.chestClaimed).to.eq(false);
    await time.increase(86400);
    await expect(quests.connect(bob).claimAll(today)).to.be.revertedWithCustomError(quests, "QuestDayChanged");
    const [nextDay] = await quests.status(bob.address);
    expect(nextDay.lastCheckIn).to.eq(today);
    expect(nextDay.claimedMask).to.eq(0);
  });

  it("clips the combined transfer at the confidential daily budget", async function () {
    const limited = await (await ethers.getContractFactory("ChimeraTreasury")).deploy(A.token);
    const limitedAddress = await limited.getAddress();
    const batch = await (await ethers.getContractFactory("ChimeraQuests")).deploy(limitedAddress);
    await limited.setGame(await batch.getAddress(), true);
    await batch.setGame(deployer.address, true);
    await token.mint(limitedAddress, 500n * Z);
    for (const task of Object.values(TASK)) await batch.record(bob.address, task);

    const [, , today] = await batch.status(bob.address);
    await batch.connect(bob).claimAll(today);
    const [player] = await batch.status(bob.address);
    expect(player.earned).to.eq(19n * Z);
    expect(await bal(bob.address, bob)).to.eq(5n * Z);
    const handle = await batch.lastRewardSent(bob.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, handle, A.token, bob)).to.eq(5n * Z);
    expect(await limited.payouts()).to.eq(1);
  });
});
