import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ChimeraLab, ChimeraLab__factory, ConfidentialTokenMock } from "../types";

const LOCI = 8;
const VISIBLE = 7;
const hi = (locus: bigint) => Number(locus >> 4n);
const lo = (locus: bigint) => Number(locus & 15n);

describe("ChimeraLab", function () {
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let lab: ChimeraLab;
  let labAddress: string;
  let token: ConfidentialTokenMock;
  const hcu: Record<string, { global: number; depth: number }> = {};

  before(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    token = await (await ethers.getContractFactory("ConfidentialTokenMock")).connect(deployer).deploy();
    const factory = (await ethers.getContractFactory("ChimeraLab")) as ChimeraLab__factory;
    lab = await factory.connect(deployer).deploy(await token.getAddress());
    labAddress = await lab.getAddress();
    for (const s of [alice, bob]) {
      await (await token.mint(s.address, 1_000_000_000n)).wait();
      await (await token.connect(s).setOperator(labAddress, (await time.latest()) + 86400 * 30)).wait();
    }
  });

  after(function () {
    if (Object.keys(hcu).length) {
      console.log("\n      HCU per transaction (limits: 20,000,000 global / 5,000,000 depth)");
      for (const [k, v] of Object.entries(hcu)) {
        console.log(`        ${k.padEnd(14)} global ${v.global.toLocaleString().padStart(11)}   depth ${v.depth.toLocaleString().padStart(10)}`);
      }
    }
  });

  async function hatch(signer: HardhatEthersSigner, label?: string): Promise<bigint> {
    const tx = await lab.connect(signer).hatchGenesis();
    const receipt = await tx.wait();
    if (label && receipt) {
      const info = fhevm.computeTransactionHCU(receipt);
      hcu[label] = { global: info.globalHCU, depth: info.maxHCUDepth };
    }
    return await lab.totalCreatures();
  }

  /** breed → KMS proof of the paid bit → hatch; returns the child id */
  async function breed(signer: HardhatEthersSigner, a: bigint, b: bigint, label?: string): Promise<bigint> {
    const tx = await lab.connect(signer).breed(a, b);
    const receipt = await tx.wait();
    if (label && receipt) {
      const info = fhevm.computeTransactionHCU(receipt);
      hcu[label] = { global: info.globalHCU, depth: info.maxHCUDepth };
    }
    const eggId = await lab.totalCreatures();
    const [, paid] = await lab.getEgg(eggId);
    const res = await fhevm.publicDecrypt([paid]);
    await (await lab.hatchEgg(eggId, res.abiEncodedClearValues, res.decryptionProof)).wait();
    return eggId;
  }

  async function phenotype(id: bigint): Promise<number[]> {
    const handles = await lab.getPhenotypeHandles(id);
    const res = await fhevm.publicDecrypt(handles.slice(0, VISIBLE));
    return handles.slice(0, VISIBLE).map((h) => Number(res.clearValues[h as `0x${string}`]));
  }

  async function certifiedGenome(signer: HardhatEthersSigner, id: bigint): Promise<bigint[]> {
    await (await lab.connect(signer).certify(id)).wait();
    const handles = [...(await lab.getGenomeHandles(id))];
    const res = await fhevm.publicDecrypt(handles);
    return handles.map((h) => BigInt(res.clearValues[h as `0x${string}`] as bigint));
  }

  describe("hatching", function () {
    it("mints a creature with public looks and a private element", async function () {
      const id = await hatch(alice, "hatchGenesis");
      expect(await lab.ownerOf(id)).to.eq(alice.address);

      const looks = await phenotype(id);
      expect(looks).to.have.length(VISIBLE);
      looks.forEach((v) => expect(v).to.be.within(0, 15));

      const handles = await lab.getPhenotypeHandles(id);
      const element = await fhevm.userDecryptEuint(FhevmType.euint8, handles[7], labAddress, alice);
      expect(Number(element)).to.be.within(0, 15);
    });

    it("keeps the element hidden from everyone else", async function () {
      const id = await hatch(alice);
      const handles = await lab.getPhenotypeHandles(id);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, handles[7], labAddress, bob)).to.be.rejected;
      await expect(fhevm.publicDecrypt([handles[7]])).to.be.rejected;
    });

    it("keeps the genome hidden, even from the owner", async function () {
      const id = await hatch(alice);
      const genome = await lab.getGenomeHandles(id);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, genome[0], labAddress, alice)).to.be.rejected;
      await expect(fhevm.publicDecrypt([genome[0]])).to.be.rejected;
    });

    it("limits free genesis embryos to 3 per wallet", async function () {
      await hatch(alice);
      await hatch(alice);
      await hatch(alice);
      await expect(lab.connect(alice).hatchGenesis()).to.be.revertedWithCustomError(lab, "GenesisLimitReached");
      await hatch(bob); // other wallets unaffected
    });

    it("phenotype equals the dominant (lower) allele of each locus", async function () {
      const id = await hatch(alice);
      const looks = await phenotype(id);
      const genome = await certifiedGenome(alice, id);
      for (let i = 0; i < VISIBLE; i++) {
        expect(looks[i]).to.eq(Math.min(hi(genome[i]), lo(genome[i])));
      }
    });
  });

  describe("sequencing", function () {
    it("reveals both alleles of one locus to the owner only and costs energy", async function () {
      const id = await hatch(alice);
      expect(await lab.energyOf(alice.address)).to.eq(3);

      await expect(lab.connect(alice).sequence(id, 4)).to.emit(lab, "Sequenced").withArgs(id, alice.address, 4);
      expect(await lab.energyOf(alice.address)).to.eq(2);

      const genome = await lab.getGenomeHandles(id);
      const locus = await fhevm.userDecryptEuint(FhevmType.euint8, genome[4], labAddress, alice);
      const looks = await phenotype(id);
      expect(looks[4]).to.eq(Math.min(hi(locus), lo(locus)));

      // other loci and other players stay locked
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, genome[5], labAddress, alice)).to.be.rejected;
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, genome[4], labAddress, bob)).to.be.rejected;
    });

    it("rejects strangers, duplicates, invalid loci and empty energy", async function () {
      const id = await hatch(alice);
      await expect(lab.connect(bob).sequence(id, 0)).to.be.revertedWithCustomError(lab, "NotOwner");
      await expect(lab.connect(alice).sequence(id, 8)).to.be.revertedWithCustomError(lab, "InvalidLocus");
      await lab.connect(alice).sequence(id, 0);
      await expect(lab.connect(alice).sequence(id, 0)).to.be.revertedWithCustomError(lab, "AlreadySequenced");
      await lab.connect(alice).sequence(id, 1);
      await lab.connect(alice).sequence(id, 2);
      await expect(lab.connect(alice).sequence(id, 3)).to.be.revertedWithCustomError(lab, "NoEnergy");

      await time.increase(24 * 3600);
      expect(await lab.energyOf(alice.address)).to.eq(3);
      await lab.connect(alice).sequence(id, 3);
    });
  });

  describe("breeding", function () {
    it("enforces ownership and cooldown", async function () {
      const a = await hatch(alice);
      const b = await hatch(alice);
      const c = await hatch(bob);
      await expect(lab.connect(alice).breed(a, b)).to.be.revertedWithCustomError(lab, "OnCooldown");
      await time.increase(120);
      await expect(lab.connect(alice).breed(a, c)).to.be.revertedWithCustomError(lab, "NotOwner");
      await expect(lab.connect(alice).breed(a, a)).to.be.revertedWithCustomError(lab, "SameCreature");
    });

    it("child inherits one allele from each parent (Mendel) with rare mutations", async function () {
      const a = await hatch(alice);
      const b = await hatch(alice);
      await time.increase(120);

      const child = await breed(alice, a, b, "breed");
      const meta = await lab.getCreature(child);
      expect(meta.parentA).to.eq(a);
      expect(meta.parentB).to.eq(b);
      expect(meta.generation).to.eq(1);

      const ga = await certifiedGenome(alice, a);
      const gb = await certifiedGenome(alice, b);
      const gc = await certifiedGenome(alice, child);

      let mutations = 0;
      for (let i = 0; i < LOCI; i++) {
        const fromA = hi(gc[i]);
        const fromB = lo(gc[i]);
        expect([hi(gb[i]), lo(gb[i])]).to.include(fromB);
        if (![hi(ga[i]), lo(ga[i])].includes(fromA)) mutations++;
      }
      expect(mutations).to.be.lessThan(5);

      const looks = await phenotype(child);
      for (let i = 0; i < VISIBLE; i++) expect(looks[i]).to.eq(Math.min(hi(gc[i]), lo(gc[i])));
    });

    it("generations stack and cooldowns grow", async function () {
      const a = await hatch(alice);
      const b = await hatch(alice);
      await time.increase(120);
      const c1 = await breed(alice, a, b);
      const spare = await hatch(alice);
      const training = await (await ethers.getContractFactory("ChimeraTraining")).deploy(labAddress, await token.getAddress());
      const altar = await (await ethers.getContractFactory("ChimeraAscension")).deploy(labAddress, await training.getAddress());
      await (await lab.setRetirementVault(await altar.getAddress())).wait();
      await (await lab.connect(alice).approve(await altar.getAddress(), spare)).wait();
      await (await altar.connect(alice).retire(spare)).wait();
      await time.increase(600);
      const c2 = await breed(alice, c1, a);
      expect((await lab.getCreature(c2)).generation).to.eq(2);
      expect(await lab.cooldownFor(2)).to.eq(120 + 2 * 60);
    });
  });

  describe("certification & chimera claims", function () {
    it("certify publishes genome and element", async function () {
      const id = await hatch(alice);
      await certifiedGenome(alice, id);
      const handles = await lab.getPhenotypeHandles(id);
      await fhevm.publicDecrypt([handles[7]]);
      await expect(lab.connect(alice).certify(id)).to.be.revertedWithCustomError(lab, "AlreadyCertified");
    });

    it("claimChimera checks KMS proof and rarity", async function () {
      const id = await hatch(alice);
      const handles = (await lab.getPhenotypeHandles(id)).slice(0, VISIBLE);
      const res = await fhevm.publicDecrypt(handles);
      const looks = handles.map((h) => Number(res.clearValues[h as `0x${string}`]));

      // forged cleartexts with a real proof -> rejected by KMS signature check
      const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint8[7]"], [[15, 15, 15, 15, 15, 15, 15]]);
      const isAlreadyChimera = looks.filter((v) => v >= 12).length >= 5;
      if (!isAlreadyChimera) {
        await expect(lab.claimChimera(id, forged, res.decryptionProof)).to.be.reverted;
        // honest cleartexts -> valid proof, but not rare enough
        await expect(lab.claimChimera(id, res.abiEncodedClearValues, res.decryptionProof)).to.be.revertedWithCustomError(
          lab,
          "NotAChimera",
        );
      }
    });
  });

  describe("transfers", function () {
    it("new owner inherits element and sequenced knowledge", async function () {
      const id = await hatch(alice);
      await lab.connect(alice).sequence(id, 2);
      await lab.connect(alice).transferFrom(alice.address, bob.address, id);

      const ph = await lab.getPhenotypeHandles(id);
      const genome = await lab.getGenomeHandles(id);
      await fhevm.userDecryptEuint(FhevmType.euint8, ph[7], labAddress, bob);
      await fhevm.userDecryptEuint(FhevmType.euint8, genome[2], labAddress, bob);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, genome[3], labAddress, bob)).to.be.rejected;
    });
  });
});
