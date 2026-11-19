import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ChimeraArena, ChimeraLab, ConfidentialTokenMock } from "../types";

const COOLDOWN = 3 * 60;
const START = 1_000_000_000n; // 1,000 cZAMA (6 decimals)

describe("ChimeraArena", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;
  let lab: ChimeraLab;
  let arena: ChimeraArena;
  let token: ConfidentialTokenMock;
  let arenaAddress: string;
  let tokenAddress: string;
  const hcu: Record<string, { global: number; depth: number }> = {};

  before(async function () {
    [deployer, alice, bob, carol] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    token = await (await ethers.getContractFactory("ConfidentialTokenMock")).connect(deployer).deploy();
    lab = await (await ethers.getContractFactory("ChimeraLab")).connect(deployer).deploy(await token.getAddress());
    arena = await (await ethers.getContractFactory("ChimeraArena"))
      .connect(deployer)
      .deploy(await lab.getAddress(), await token.getAddress());
    arenaAddress = await arena.getAddress();
    tokenAddress = await token.getAddress();
    await (await lab.setArena(arenaAddress)).wait();
  });

  after(function () {
    if (Object.keys(hcu).length) {
      console.log("\n      HCU per transaction (limits: 20,000,000 global / 5,000,000 depth)");
      for (const [k, v] of Object.entries(hcu)) {
        console.log(`        ${k.padEnd(16)} global ${v.global.toLocaleString().padStart(11)}   depth ${v.depth.toLocaleString().padStart(10)}   gas ${((v as { gas?: number }).gas ?? 0).toLocaleString().padStart(11)}`);
      }
    }
  });

  async function measure(label: string | undefined, txPromise: Promise<{ wait: () => Promise<unknown> }>) {
    const tx = await txPromise;
    const receipt = (await tx.wait()) as Parameters<typeof fhevm.computeTransactionHCU>[0];
    if (label && receipt) {
      const info = fhevm.computeTransactionHCU(receipt);
      hcu[label] = { global: info.globalHCU, depth: info.maxHCUDepth, gas: Number((receipt as { gasUsed: bigint }).gasUsed) } as never;
    }
  }

  async function hatch(signer: HardhatEthersSigner): Promise<bigint> {
    await (await lab.connect(signer).hatchGenesis()).wait();
    return await lab.totalCreatures();
  }

  async function outcome(battleId: bigint) {
    const [, handle] = await arena.getBattle(battleId);
    const res = await fhevm.publicDecrypt([handle]);
    return { won: Boolean(res.clearValues[handle as `0x${string}`]), res };
  }

  async function settle(battleId: bigint, label?: string): Promise<boolean> {
    const { won, res } = await outcome(battleId);
    await measure(label, arena.settle(battleId, res.abiEncodedClearValues, res.decryptionProof));
    return won;
  }

  async function balance(signer: HardhatEthersSigner): Promise<bigint> {
    const h = await token.confidentialBalanceOf(signer.address);
    return await fhevm.userDecryptEuint(FhevmType.euint64, h, tokenAddress, signer);
  }

  async function stake(signer: HardhatEthersSigner, amount: bigint) {
    return await fhevm.createEncryptedInput(arenaAddress, signer.address).add64(amount).encrypt();
  }

  async function fund(signer: HardhatEthersSigner, amount = START) {
    await (await token.mint(signer.address, amount)).wait();
    const until = (await time.latest()) + 30 * 24 * 3600;
    await (await token.connect(signer).setOperator(arenaAddress, until)).wait();
  }

  describe("wild hunts", function () {
    it("explore spawns a wild creature and fights it on encrypted data", async function () {
      const mine = await hatch(alice);
      await measure("explore", arena.connect(alice).explore(mine));

      const wildId = await lab.totalCreatures();
      expect((await lab.getCreature(wildId)).wild).to.eq(true);
      expect(await lab.ownerOf(wildId)).to.eq(arenaAddress);
      expect(await arena.wildEngaged(wildId)).to.eq(true);

      const battleId = await arena.totalBattles();
      const [battle] = await arena.getBattle(battleId);
      expect(battle.status).to.eq(1n); // Pending
      expect(battle.challenger).to.eq(alice.address);
      expect(battle.opponentId).to.eq(wildId);
    });

    it("winning captures the wild creature, losing leaves it roaming for others", async function () {
      const mine = await hatch(alice);
      // A hunter keeps the same NFT across attempts; repeated losses must not
      // consume another genesis claim or make this random-outcome test flaky.
      const bobs = await hatch(bob);
      let sawWin = false;
      let sawLoss = false;
      for (let i = 0; i < 12 && !(sawWin && sawLoss); i++) {
        await (await arena.connect(alice).explore(mine)).wait();
        const wildId = await lab.totalCreatures();
        const won = await settle(await arena.totalBattles(), "settle (wild)");
        expect(await arena.wildEngaged(wildId)).to.eq(false);
        const roaming = (await arena.roamingWilds()).map((x) => x);
        if (won) {
          sawWin = true;
          expect(await lab.ownerOf(wildId)).to.eq(alice.address);
          expect(roaming).to.not.include(wildId);
          // the hunter now holds the captured creature's private element
          const ph = await lab.getPhenotypeHandles(wildId);
          const el = await fhevm.userDecryptEuint(FhevmType.euint8, ph[7], await lab.getAddress(), alice);
          expect(Number(el)).to.be.within(0, 15);
        } else {
          sawLoss = true;
          expect(await lab.ownerOf(wildId)).to.eq(arenaAddress);
          expect(roaming).to.include(wildId);
          // another hunter can take a shot at the escaped wild
          await measure("challengeWild", arena.connect(bob).challengeWild(bobs, wildId));
          await settle(await arena.totalBattles());
        }
        await time.increase(COOLDOWN);
      }
      expect(sawWin || sawLoss).to.eq(true);
      expect(await lab.genesisClaimed(bob.address)).to.eq(1n);
      expect(await arena.wins(alice.address)).to.eq(await arena.captures(alice.address));
    });

    it("enforces ownership, cooldown, engagement and crowding", async function () {
      const mine = await hatch(alice);
      await expect(arena.connect(bob).explore(mine)).to.be.revertedWithCustomError(arena, "NotOwner");
      await (await arena.connect(alice).explore(mine)).wait();
      await expect(arena.connect(alice).explore(mine)).to.be.revertedWithCustomError(arena, "NotReady");

      const wildId = await lab.totalCreatures();
      await (await lab.connect(alice).hatchGenesis()).wait();
      const second = await lab.totalCreatures();
      // pending wild can't be engaged twice, and unknown ids are rejected
      await expect(arena.connect(alice).challengeWild(second, wildId)).to.be.revertedWithCustomError(arena, "WildEngaged");
      await expect(arena.connect(alice).challengeWild(second, mine)).to.be.revertedWithCustomError(arena, "NotRoaming");

      await (await arena.setSettings(COOLDOWN, 1)).wait();
      await expect(arena.connect(alice).explore(second)).to.be.revertedWithCustomError(arena, "AshlandsCrowded");
    });

    it("only the arena spawns wilds; only combat contracts read battle profiles", async function () {
      const mine = await hatch(alice);
      await expect(lab.connect(alice).spawnWild()).to.be.revertedWithCustomError(lab, "NotArena");
      await expect(lab.connect(alice).battleProfile(mine)).to.be.revertedWithCustomError(lab, "NotCombat");
    });

    it("rejects forged outcomes and replayed settlements", async function () {
      const mine = await hatch(alice);
      await (await arena.connect(alice).explore(mine)).wait();
      const battleId = await arena.totalBattles();
      const { won, res } = await outcome(battleId);
      const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!won]);
      await expect(arena.settle(battleId, forged, res.decryptionProof)).to.be.reverted;
      await (await arena.settle(battleId, res.abiEncodedClearValues, res.decryptionProof)).wait();
      await expect(arena.settle(battleId, res.abiEncodedClearValues, res.decryptionProof)).to.be.revertedWithCustomError(
        arena,
        "NotPending",
      );
      const [battle] = await arena.getBattle(battleId);
      expect(battle.status).to.eq(2n);
      expect(battle.challengerWon).to.eq(won);
    });
  });

  describe("duels with hidden cZAMA stakes", function () {
    it("only min(stakes) is at risk; excess is refunded; winner takes the matched pot", async function () {
      await fund(alice);
      await fund(bob);
      const a = await hatch(alice);
      const b = await hatch(bob);

      const s1 = await stake(alice, 100_000_000n);
      await measure("registerDefender", arena.connect(alice).registerDefender(a, s1.handles[0], s1.inputProof));
      expect(await balance(alice)).to.eq(START - 100_000_000n);
      expect(await arena.activeDefenders()).to.deep.eq([a]);

      const s2 = await stake(bob, 300_000_000n);
      await measure("duel", arena.connect(bob).duel(b, a, s2.handles[0], s2.inputProof));
      const battleId = await arena.totalBattles();

      // both sides can see what was actually at risk — nobody sees the other's raw stake
      const matchedHandle = await arena.purseHandles(battleId);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, matchedHandle, arenaAddress, bob)).to.eq(100_000_000n);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, matchedHandle, arenaAddress, alice)).to.eq(100_000_000n);
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, matchedHandle, arenaAddress, carol)).to.be.rejected;

      const bobWon = await settle(battleId, "settle (duel)");
      const [ba, bb] = [await balance(alice), await balance(bob)];
      expect(ba + bb).to.eq(2n * START);
      if (bobWon) {
        expect(bb).to.eq(START + 100_000_000n);
        expect(await arena.wins(bob.address)).to.eq(1);
        expect(await arena.losses(alice.address)).to.eq(1);
      } else {
        expect(ba).to.eq(START + 100_000_000n);
        expect(await arena.wins(alice.address)).to.eq(1);
        expect(await arena.creatureWins(a)).to.eq(1);
      }
      expect((await arena.getDefender(a)).active).to.eq(false);
      expect(await arena.activeDefenders()).to.deep.eq([]);
    });

    it("a stake that silently transferred 0 puts nothing at risk", async function () {
      await fund(alice);
      await fund(bob, 0n); // bob is broke but still sets the operator
      const a = await hatch(alice);
      const b = await hatch(bob);

      const s1 = await stake(alice, 50_000_000n);
      await (await arena.connect(alice).registerDefender(a, s1.handles[0], s1.inputProof)).wait();
      const s2 = await stake(bob, 500_000_000n);
      await (await arena.connect(bob).duel(b, a, s2.handles[0], s2.inputProof)).wait();
      await settle(await arena.totalBattles());

      expect(await balance(alice)).to.eq(START);
      expect(await balance(bob)).to.eq(0n);
    });

    it("defenders can withdraw, can't self-duel, and are void once the creature leaves", async function () {
      await fund(alice);
      await fund(bob);
      const a = await hatch(alice);
      const b = await hatch(bob);
      const a2 = await hatch(alice);

      const s1 = await stake(alice, 70_000_000n);
      await (await arena.connect(alice).registerDefender(a, s1.handles[0], s1.inputProof)).wait();
      const again = await stake(alice, 1n);
      await expect(
        arena.connect(alice).registerDefender(a, again.handles[0], again.inputProof),
      ).to.be.revertedWithCustomError(arena, "AlreadyDefending");

      const self = await stake(alice, 1n);
      await expect(arena.connect(alice).duel(a2, a, self.handles[0], self.inputProof)).to.be.revertedWithCustomError(
        arena,
        "SelfDuel",
      );

      await expect(arena.connect(bob).withdrawDefender(a)).to.be.revertedWithCustomError(arena, "NotDefending");
      await (await arena.connect(alice).withdrawDefender(a)).wait();
      expect(await balance(alice)).to.eq(START);

      const s3 = await stake(alice, 20_000_000n);
      await (await arena.connect(alice).registerDefender(a, s3.handles[0], s3.inputProof)).wait();
      await (await lab.connect(alice).transferFrom(alice.address, carol.address, a)).wait();
      const s4 = await stake(bob, 20_000_000n);
      await expect(arena.connect(bob).duel(b, a, s4.handles[0], s4.inputProof)).to.be.revertedWithCustomError(
        arena,
        "DefenderGone",
      );
      await (await arena.connect(alice).withdrawDefender(a)).wait();
      expect(await balance(alice)).to.eq(START);
    });
  });
});
