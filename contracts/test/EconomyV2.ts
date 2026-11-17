import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const Z = 1_000_000n;

describe("Economy v2 — bounded circulation and funded rewards", function () {
  this.timeout(900_000);
  let owner: any, alice: any, bob: any, token: any, lab: any, treasury: any, requester: any;
  const w = async (tx: Promise<any>) => (await tx).wait();
  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    [owner, alice, bob] = await ethers.getSigners();
    const deploy = async (name: string, ...args: any[]) => (await ethers.getContractFactory(name)).deploy(...args);
    token = await deploy("ConfidentialTokenMock");
    lab = await deploy("ChimeraLab", await token.getAddress());
    treasury = await deploy("ChimeraTreasury", await token.getAddress());
    requester = await deploy("TreasuryRequester");
    await w(treasury.setGame(await requester.getAddress(), true));
    await w(token.mint(await treasury.getAddress(), 10_000n * Z));
    await w(token.mint(alice.address, 1_000n * Z));
    await w(token.connect(alice).setOperator(await lab.getAddress(), (await time.latest()) + 30 * 86400));
    await time.increaseTo((Math.floor((await time.latest()) / 86400) + 1) * 86400 + 60);
  });
  async function hatch() {
    await w(lab.connect(alice).hatchGenesis());
    return lab.totalCreatures();
  }
  async function resolveEgg(id: bigint) {
    const [, handle] = await lab.getEgg(id);
    const proof = await fhevm.publicDecrypt([handle]);
    await w(lab.hatchEgg(id, proof.abiEncodedClearValues, proof.decryptionProof));
  }
  async function balance(signer: any) {
    const handle = await token.confidentialBalanceOf(signer.address);
    return handle === ethers.ZeroHash ? 0n : fhevm.userDecryptEuint(FhevmType.euint64, handle, await token.getAddress(), signer);
  }
  async function altar() {
    const training = await (await ethers.getContractFactory("ChimeraTraining")).deploy(await lab.getAddress(), await token.getAddress());
    const asc = await (await ethers.getContractFactory("ChimeraAscension")).deploy(await lab.getAddress(), await training.getAddress());
    await w(training.setGame(await asc.getAddress(), true));
    await w(lab.setRetirementVault(await asc.getAddress()));
    return { asc, training };
  }
  async function retire(asc: any, id: bigint) {
    await w(lab.connect(alice).approve(await asc.getAddress(), id));
    await w(asc.connect(alice).retire(id));
  }

  it("a second breeding needs a retired creature instead of recursively creating free breeders", async function () {
    const a = await hatch(), b = await hatch();
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    await resolveEgg(await lab.totalCreatures());
    await time.increase(600);
    await expect(lab.connect(alice).breed(a, b)).to.be.reverted;
    expect(await lab.ownerOf(a)).to.eq(alice.address);
    expect(await lab.ownerOf(b)).to.eq(alice.address);
  });

  it("an oversized quest pays at most the daily reserve budget, instead of zero or the entire request", async function () {
    await w(requester.request(await treasury.getAddress(), alice.address, 20_000n * Z));
    expect(await balance(alice)).to.eq(1_100n * Z); // original 1,000 + 1% of the 10,000 reserve
  });

  it("one permanent offering earns one charge, funds one later birth and never consumes either parent", async function () {
    const { asc, training } = await altar();
    const a = await hatch(), b = await hatch(), spare = await hatch();
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    await resolveEgg(await lab.totalCreatures());
    await w(lab.connect(alice).approve(await asc.getAddress(), spare));
    await w(asc.connect(alice).ascend(a, spare));
    expect(await lab.lineageCharges(alice.address)).to.eq(1);
    expect(await lab.circulatingPopulation()).to.eq(3);
    expect((await training.getProfile(a))[0].xp).to.eq(30);
    await expect(asc.connect(alice).retire(spare)).to.be.reverted;
    expect(await lab.lineageCharges(alice.address)).to.eq(1);
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    expect(await lab.lineageCharges(alice.address)).to.eq(0);
    await resolveEgg(await lab.totalCreatures());
    expect(await lab.circulatingPopulation()).to.eq(4);
    expect(await lab.ownerOf(a)).to.eq(alice.address);
    expect(await lab.ownerOf(b)).to.eq(alice.address);
    expect((await lab.getCreature(a)).breeds).to.eq(2);
    expect(await lab.ownerOf(spare)).to.eq(await asc.getAddress());
  });

  it("pending eggs reserve headroom, retirement releases it, and the configured ceiling stays bounded", async function () {
    const { asc } = await altar();
    const a = await hatch(), b = await hatch();
    await w(lab.setPopulationLimit(3));
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    const egg = await lab.totalCreatures();
    expect(await lab.pendingBirths()).to.eq(1);
    expect(await lab.circulatingPopulation()).to.eq(3);
    await expect(lab.connect(bob).hatchGenesis()).to.be.revertedWithCustomError(lab, "PopulationFull");
    await expect(lab.setPopulationLimit(2)).to.be.revertedWithCustomError(lab, "InvalidPopulationLimit");
    await expect(lab.setPopulationLimit(10001)).to.be.revertedWithCustomError(lab, "InvalidPopulationLimit");
    await resolveEgg(egg);
    expect(await lab.pendingBirths()).to.eq(0);
    expect(await lab.circulatingPopulation()).to.eq(3);
    await retire(asc, egg);
    expect(await lab.circulatingPopulation()).to.eq(2);
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    expect(await lab.circulatingPopulation()).to.eq(3);
  });

  it("failed payment refunds the introduction or charge and releases its population reservation", async function () {
    const { asc } = await altar();
    const a = await hatch(), b = await hatch(), spare = await hatch();
    const drain = async () => {
      const amount = await balance(alice);
      const enc = await fhevm.createEncryptedInput(await token.getAddress(), alice.address).add64(amount).encrypt();
      await w(token.connect(alice)["confidentialTransfer(address,bytes32,bytes)"](bob.address, enc.handles[0], enc.inputProof));
    };
    await drain();
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    await resolveEgg(await lab.totalCreatures());
    expect(await lab.introBreedUsed(alice.address)).to.eq(false);
    expect(await lab.circulatingPopulation()).to.eq(3);
    await w(token.mint(alice.address, 100n * Z));
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    await resolveEgg(await lab.totalCreatures());
    await retire(asc, spare);
    await drain();
    await time.increase(600);
    await w(lab.connect(alice).breed(a, b));
    expect(await lab.lineageCharges(alice.address)).to.eq(0);
    await resolveEgg(await lab.totalCreatures());
    expect(await lab.lineageCharges(alice.address)).to.eq(1);
    expect(await lab.pendingBirths()).to.eq(0);
    expect(await lab.circulatingPopulation()).to.eq(3);
  });

  it("vault wiring is one-time and direct transfers cannot bypass offering checks", async function () {
    const { asc } = await altar();
    const id = await hatch();
    await expect(lab.setRetirementVault(await asc.getAddress())).to.be.revertedWithCustomError(lab, "InvalidRetirementVault");
    await expect(lab.connect(alice).setPopulationLimit(2)).to.be.reverted;
    await expect(lab.connect(bob).approve(await asc.getAddress(), id)).to.be.reverted;
    await expect(lab.connect(alice).transferFrom(alice.address, await asc.getAddress(), id)).to.be.revertedWithCustomError(lab, "InvalidRetirementVault");
    await expect(asc.connect(bob).retire(id)).to.be.revertedWithCustomError(asc, "NotOwner");
    expect(await lab.lineageCharges(alice.address)).to.eq(0);
    await retire(asc, id);
    expect(await lab.retired(id)).to.eq(true);
    expect(await lab.lineageCharges(alice.address)).to.eq(1);
  });

  it("the daily budget is shared across games, ignores midday deposits and resets from the next day's reserve", async function () {
    const second = await (await ethers.getContractFactory("TreasuryRequester")).deploy();
    await w(treasury.setGame(await second.getAddress(), true));
    await w(requester.request(await treasury.getAddress(), bob.address, 60n * Z));
    await w(token.mint(await treasury.getAddress(), 10_000n * Z));
    await w(second.request(await treasury.getAddress(), bob.address, 60n * Z));
    await w(requester.request(await treasury.getAddress(), bob.address, 1n * Z));
    expect(await balance(bob)).to.eq(100n * Z);
    const [opening, remaining] = await treasury.budgetHandles();
    const proof = await fhevm.publicDecrypt([opening, remaining]);
    expect(proof.clearValues[opening as `0x${string}`]).to.eq(100n * Z);
    expect(proof.clearValues[remaining as `0x${string}`]).to.eq(0n);
    await time.increaseTo((Math.floor((await time.latest()) / 86400) + 1) * 86400 + 60);
    await w(second.request(await treasury.getAddress(), bob.address, 1_000n * Z));
    expect(await balance(bob)).to.eq(299n * Z); // 1% of the new 19,900 reserve
  });

  it("large reserves still obey the absolute 3,000 cap and empty reserves cannot fabricate a payment", async function () {
    await w(token.mint(await treasury.getAddress(), 500_000n * Z));
    await w(requester.request(await treasury.getAddress(), bob.address, 10_000n * Z));
    expect(await balance(bob)).to.eq(3_000n * Z);
    const empty = await (await ethers.getContractFactory("ChimeraTreasury")).deploy(await token.getAddress());
    await w(empty.setGame(await requester.getAddress(), true));
    await w(requester.request(await empty.getAddress(), bob.address, 10n * Z));
    expect(await balance(bob)).to.eq(3_000n * Z);
    await expect(empty.connect(alice).pay(bob.address, ethers.ZeroHash)).to.be.revertedWithCustomError(empty, "NotGame");
  });

  it("quests distinguish their nominal targets from encrypted actual receipts when the shared budget runs out", async function () {
    const quests = await (await ethers.getContractFactory("ChimeraQuests")).deploy(await treasury.getAddress());
    await w(treasury.setGame(await quests.getAddress(), true));
    await w(requester.request(await treasury.getAddress(), bob.address, 100n * Z));
    const before = await balance(alice);
    await w(quests.connect(alice).checkIn());
    const sent = await quests.lastRewardSent(alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, sent, await token.getAddress(), alice)).to.eq(0);
    expect(await balance(alice)).to.eq(before);
    expect((await quests.status(alice.address))[0].earned).to.eq(1n * Z);
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, sent, await token.getAddress(), bob)).to.be.rejected;
  });
});
