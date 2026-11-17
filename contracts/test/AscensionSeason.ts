import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type {
  ChimeraAscension,
  ChimeraColosseum,
  ChimeraLab,
  ChimeraOracle,
  ChimeraQuests,
  ChimeraRaid,
  ChimeraRelics,
  ChimeraSeason,
  ChimeraTraining,
  ChimeraTreasury,
  ConfidentialTokenMock,
} from "../types";

const Z = 1_000_000n;

describe("P1 — Ascension altar · Season thrones", function () {
  this.timeout(900_000);

  let deployer: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner, carol: HardhatEthersSigner;
  let token: ConfidentialTokenMock;
  let lab: ChimeraLab;
  let col: ChimeraColosseum;
  let relics: ChimeraRelics;
  let oracle: ChimeraOracle;
  let training: ChimeraTraining;
  let treasury: ChimeraTreasury;
  let raid: ChimeraRaid;
  let quests: ChimeraQuests;
  let asc: ChimeraAscension;
  let season: ChimeraSeason;
  const A: Record<string, string> = {};
  const w = async (p: Promise<{ wait: () => Promise<unknown> }>) => (await p).wait();

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
    asc = (await (await f("ChimeraAscension")).deploy(A.lab, A.training)) as unknown as ChimeraAscension;
    A.asc = await asc.getAddress();
    season = (await (await f("ChimeraSeason")).deploy(A.col, A.oracle, A.raid, A.treasury)) as unknown as ChimeraSeason;
    A.season = await season.getAddress();

    await w(lab.setArena(A.col));
    await w(lab.setCombat(A.raid, true));
    await w(lab.setEconomy(A.raid, A.treasury, A.quests));
    await w(lab.setTraining(A.training, ""));
    await w(col.setEconomy(A.raid, A.quests));
    await w(col.setTraining(A.training));
    await w(training.setEconomy(A.raid, A.treasury));
    await w(training.setRelics(A.relics));
    for (const g of [A.col, A.raid, A.asc, deployer.address]) await w(training.setGame(g, true));
    await w(relics.setTraining(A.training));
    await w(relics.setEconomy(A.raid, A.treasury));
    await w(relics.setGame(A.oracle, true));
    await w(relics.setGame(A.season, true));
    await w(oracle.setRelics(A.relics));
    for (const g of [A.col, A.lab]) await w(quests.setGame(g, true));
    await w(treasury.setGame(A.quests, true));
    await w(treasury.setGame(A.season, true));
    await w(asc.setLinks(A.col, A.relics));
    await w(lab.setRetirementVault(A.asc));
    await w(season.setRelics(A.relics));
    await w(token.mint(A.treasury, 10_000n * Z));
    for (const s of [alice, bob, carol]) {
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
  const xpOf = async (id: bigint) => (await training.getProfile(id))[0].xp;

  // ═════════════════════════════ Ascension ═════════════════════════════

  describe("Ascension altar", function () {
    it("sacrifices a spare creature for 30 + 10·gen XP and locks it in the altar", async function () {
      const hero = await hatch(alice);
      const spare = await hatch(alice);
      expect(await asc.xpFor(spare)).to.eq(30n);
      await w(lab.connect(alice).approve(A.asc, spare));
      await expect(asc.connect(alice).ascend(hero, spare))
        .to.emit(asc, "Ascended")
        .withArgs(hero, spare, alice.address, 0, 30);
      expect(await xpOf(hero)).to.eq(30n);
      expect(await lab.ownerOf(spare)).to.eq(A.asc);
      expect(await asc.ascensions(alice.address)).to.eq(1n);
      expect(await asc.totalAscensions()).to.eq(1n);
      expect(await asc.offeredTo(spare)).to.eq(hero);
    });

    it("rejects same creature, foreign creatures and a hero with no XP room today", async function () {
      const hero = await hatch(alice);
      const spare = await hatch(alice);
      const bobs = await hatch(bob);
      await expect(asc.connect(alice).ascend(hero, hero)).to.be.revertedWithCustomError(asc, "SameCreature");
      await expect(asc.connect(alice).ascend(hero, bobs)).to.be.revertedWithCustomError(asc, "NotOwner").withArgs(bobs);
      await expect(asc.connect(bob).ascend(bobs, spare)).to.be.revertedWithCustomError(asc, "NotOwner").withArgs(spare);
      await w(training.grantXp(hero, 120));
      await w(lab.connect(alice).approve(A.asc, spare));
      await expect(asc.connect(alice).ascend(hero, spare)).to.be.revertedWithCustomError(asc, "NoXpRoom").withArgs(hero);
      await time.increase(86400);
      await w(asc.connect(alice).ascend(hero, spare));
      expect(await xpOf(hero)).to.eq(150n);
    });

    it("an active Colosseum defender cannot be sacrificed", async function () {
      const hero = await hatch(alice);
      const spare = await hatch(alice);
      const enc = await fhevm.createEncryptedInput(A.col, alice.address).add64(5n * Z).add8(0).encrypt();
      await w(col.connect(alice).registerDefender(spare, enc.handles[0], enc.handles[1], enc.inputProof));
      await expect(asc.connect(alice).ascend(hero, spare)).to.be.revertedWithCustomError(asc, "StillDefending").withArgs(spare);
      await expect(asc.connect(alice).retire(spare)).to.be.revertedWithCustomError(asc, "StillDefending").withArgs(spare);
    });

    it("charge-only retirement refuses equipped relics without losing the NFT or earning a charge", async function () {
      const spare = await hatch(alice);
      await w(relics.connect(alice).openCache());
      const relic = await relics.totalRelics();
      await w(relics.connect(alice).equip(relic, spare, 0));
      await w(lab.connect(alice).approve(A.asc, spare));
      await expect(asc.connect(alice).retire(spare)).to.be.revertedWithCustomError(asc, "RelicsEquipped");
      expect(await lab.ownerOf(spare)).to.eq(alice.address);
      expect(await lab.lineageCharges(alice.address)).to.eq(0);
    });
  });

  // ═════════════════════════════ Season ═════════════════════════════

  describe("Season thrones", function () {
    async function strike(s: HardhatEthersSigner) {
      const id = await hatch(s);
      await w(raid.connect(s).strike(id));
    }

    it("only activity after joining scores; out-scoring a holder takes the throne", async function () {
      expect(await season.season()).to.eq(1n);
      // alice raids before joining — it does not count
      await strike(alice);
      await w(season.connect(alice).join());
      expect(await season.scoreOf(alice.address)).to.eq(0n);
      await expect(season.connect(alice).claimThrone(0)).to.be.revertedWithCustomError(season, "NotEnough");
      await expect(season.connect(bob).claimThrone(0)).to.be.revertedWithCustomError(season, "NotJoined");
      await expect(season.connect(alice).join()).to.be.revertedWithCustomError(season, "AlreadyJoined");

      await w(season.connect(bob).join());
      await strike(bob);
      expect(await season.scoreOf(bob.address)).to.eq(2n);
      await expect(season.connect(bob).claimThrone(0)).to.emit(season, "ThroneClaimed");
      expect(await season.thrones(0)).to.eq(bob.address);

      // carol ties bob: not enough for seat 0, but an empty seat 1 is hers
      await w(season.connect(carol).join());
      await strike(carol);
      await expect(season.connect(carol).claimThrone(0))
        .to.be.revertedWithCustomError(season, "NotEnough")
        .withArgs(2, 2);
      await w(season.connect(carol).claimThrone(1));
      // moving seats vacates the old one
      await w(season.connect(bob).claimThrone(2));
      expect(await season.thrones(0)).to.eq(ethers.ZeroAddress);
      expect(await season.thrones(2)).to.eq(bob.address);
      const [holders, scores] = await season.getThrones();
      expect(holders).to.deep.eq([ethers.ZeroAddress, carol.address, bob.address]);
      expect(scores.map(Number)).to.deep.eq([0, 2, 2]);
    });

    it("ending pays the holders from the Treasury, grants a relic cache and a crown, and restarts", async function () {
      await w(token.mint(A.treasury, 300_000n * Z));
      await w(season.connect(alice).join());
      await w(season.connect(bob).join());
      await strike(alice);
      await strike(bob);
      await w(season.connect(alice).claimThrone(0));
      await w(season.connect(bob).claimThrone(1));
      await expect(season.endSeason()).to.be.revertedWithCustomError(season, "SeasonRunning");
      await time.increase(14 * 86400);
      await expect(season.connect(carol).join()).to.be.revertedWithCustomError(season, "SeasonOver");

      const a0 = await bal(alice);
      const b0 = await bal(bob);
      const r0 = await relics.totalRelics();
      await w(season.connect(carol).endSeason());
      expect((await bal(alice)) - a0).to.eq(2_000n * Z);
      expect((await bal(bob)) - b0).to.eq(1_000n * Z);
      expect((await relics.totalRelics()) - r0).to.eq(2n);
      expect(await season.rankIn(1, alice.address)).to.eq(1);
      expect(await season.rankIn(1, bob.address)).to.eq(2);
      expect(await season.crowns(alice.address)).to.eq(1);
      expect(await season.winnersOf(1)).to.deep.eq([alice.address, bob.address, ethers.ZeroAddress]);

      expect(await season.season()).to.eq(2n);
      expect(await season.thrones(0)).to.eq(ethers.ZeroAddress);
      expect(await season.scoreOf(alice.address)).to.eq(0n);
      await w(season.connect(alice).join());
    });

    it("a constrained season pool pays both occupied seats proportionally instead of exhausting it on the first", async function () {
      await w(season.connect(alice).join());
      await w(season.connect(bob).join());
      await strike(alice);
      await strike(bob);
      await w(season.connect(alice).claimThrone(0));
      await w(season.connect(bob).claimThrone(1));
      await time.increase(14 * 86400);
      const a0 = await bal(alice), b0 = await bal(bob);
      const receipt = await w(season.endSeason());
      const hcu = fhevm.computeTransactionHCU(receipt as any);
      expect(hcu.globalHCU).to.be.at.most(20_000_000);
      expect(hcu.maxHCUDepth).to.be.at.most(5_000_000);
      console.log(`        budgeted season: HCU ${hcu.globalHCU}, depth ${hcu.maxHCUDepth}`);
      expect((await bal(alice)) - a0).to.eq(66_666_666n);
      expect((await bal(bob)) - b0).to.eq(33_333_334n);
      await expect(season.endSeason()).to.be.revertedWithCustomError(season, "SeasonRunning");
    });

    it("owner can shorten the season for demos", async function () {
      const started = await season.startedAt();
      await w(season.setLength(3600, true));
      expect(await season.endsAt()).to.eq(started + 3600n);
      await expect(season.connect(alice).setLength(1, true)).to.be.revertedWithCustomError(season, "OwnableUnauthorizedAccount");
    });

    it("three seats conserve the funded pool including rounding dust within the FHE budget", async function () {
      for (const [index, keeper] of [alice, bob, carol].entries()) {
        await w(season.connect(keeper).join());
        await strike(keeper);
        await w(season.connect(keeper).claimThrone(index));
      }
      await time.increase(14 * 86400);
      // The local mock coprocessor advances one shared event cursor while decrypting.
      const before: bigint[] = [];
      for (const keeper of [alice, bob, carol]) before.push(await bal(keeper));
      const receipt = await w(season.endSeason());
      const hcu = fhevm.computeTransactionHCU(receipt as any);
      expect(hcu.globalHCU).to.be.at.most(20_000_000);
      expect(hcu.maxHCUDepth).to.be.at.most(5_000_000);
      console.log(`        three-seat season: HCU ${hcu.globalHCU}, depth ${hcu.maxHCUDepth}`);
      const after: bigint[] = [];
      for (const keeper of [alice, bob, carol]) after.push(await bal(keeper));
      expect(after.map((value, i) => value - before[i])).to.deep.eq([57_142_857n, 28_571_428n, 14_285_715n]);
      expect(await season.rankIn(1, carol.address)).to.eq(3);
      await expect(season.setPrizes([ethers.MaxUint256 >> 192n, 1n, 0n])).to.be.revertedWithCustomError(season, "PrizesTooLarge");
    });
  });
});
