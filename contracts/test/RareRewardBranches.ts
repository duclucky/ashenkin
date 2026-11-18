import { expect } from "chai";
import { ethers, fhevm, network } from "hardhat";

describe("Rare title reward — deterministic local ciphertext fixtures", function () {
  this.timeout(120_000);
  let lab: any, fixture: any, alice: any, bob: any;
  let phenotypeSlot: number;
  const coder = ethers.AbiCoder.defaultAbiCoder();

  beforeEach(async function () {
    if (!fhevm.isMock || network.name !== "hardhat") throw new Error("Controlled rarity fixtures must run only on local Hardhat");
    [, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("ConfidentialTokenMock");
    lab = await ethers.deployContract("ChimeraLab", [await token.getAddress()]);
    fixture = await ethers.deployContract("RarePhenotypeFixture");
    await (await lab.connect(alice).hatchGenesis()).wait();
    const [original] = await lab.getPhenotypeHandles(1);
    phenotypeSlot = -1;
    // Discover the existing mapping by its actual handle; never assume a layout.
    for (let slot = 0; slot < 80; slot++) {
      const index = ethers.keccak256(coder.encode(["uint256", "uint256"], [1, slot]));
      if ((await ethers.provider.getStorage(await lab.getAddress(), index)).toLowerCase() === original.toLowerCase()) {
        phenotypeSlot = slot;
        break;
      }
    }
    expect(phenotypeSlot).to.be.gte(0);
  });

  async function prepare(id: number, values: number[]) {
    const receipt = await (await fixture.prepare(await lab.getAddress(), values)).wait();
    const event = receipt.logs.map((log: any) => { try { return fixture.interface.parseLog(log); } catch { return null; } }).find((log: any) => log?.name === "Prepared");
    const handles = [...event.args.handles] as `0x${string}`[];
    const base = BigInt(ethers.keccak256(coder.encode(["uint256", "uint256"], [id, phenotypeSlot])));
    // Fixture injection is confined to local EVM storage. Production bytecode is unchanged.
    for (let i = 0; i < 7; i++) await network.provider.send("hardhat_setStorageAt", [await lab.getAddress(), ethers.toBeHex(base + BigInt(i)), handles[i]]);
    expect([...(await lab.getPhenotypeHandles(id))].slice(0, 7)).to.deep.equal(handles);
    const proof = await fhevm.publicDecrypt(handles);
    expect(handles.map(handle => Number(proof.clearValues[handle]))).to.deep.equal(values);
    return proof;
  }

  it("exactly five visible traits at 12+ award the title and increment the count once", async function () {
    const proof = await prepare(1, [12, 13, 14, 15, 12, 11, 0]);
    await expect(lab.claimChimera(1, proof.abiEncodedClearValues, proof.decryptionProof)).to.emit(lab, "ChimeraVerified").withArgs(1, alice.address);
    expect((await lab.getCreature(1)).chimera).to.equal(true);
    expect(await lab.chimeraCount()).to.equal(1);
    expect(await lab.ownerOf(1)).to.equal(alice.address);
    await expect(lab.claimChimera(1, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.revertedWithCustomError(lab, "AlreadyChimera");
    expect(await lab.chimeraCount()).to.equal(1);
  });

  it("four rare traits cannot claim, and 11 does not count as rare", async function () {
    const proof = await prepare(1, [12, 13, 14, 15, 11, 11, 0]);
    await expect(lab.claimChimera(1, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.revertedWithCustomError(lab, "NotAChimera");
    expect((await lab.getCreature(1)).chimera).to.equal(false);
    expect(await lab.chimeraCount()).to.equal(0);
  });

  it("forged cleartexts and a proof for another NFT cannot award a title", async function () {
    const proof = await prepare(1, [12, 13, 14, 15, 12, 11, 0]);
    const forged = coder.encode(["uint8[7]"], [[15, 15, 15, 15, 15, 15, 15]]);
    await expect(lab.claimChimera(1, forged, proof.decryptionProof)).to.be.reverted;
    await (await lab.connect(bob).hatchGenesis()).wait();
    await prepare(2, [13, 14, 15, 12, 13, 1, 2]);
    await expect(lab.claimChimera(2, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.reverted;
    expect(await lab.chimeraCount()).to.equal(0);
    await lab.claimChimera(1, proof.abiEncodedClearValues, proof.decryptionProof);
    expect(await lab.chimeraCount()).to.equal(1);
  });

  it("a third-party submitter awards the current NFT owner, including after transfer", async function () {
    const proof = await prepare(1, [12, 12, 12, 12, 12, 0, 0]);
    await (await lab.connect(alice).transferFrom(alice.address, bob.address, 1)).wait();
    await expect(lab.connect(alice).claimChimera(1, proof.abiEncodedClearValues, proof.decryptionProof)).to.emit(lab, "ChimeraVerified").withArgs(1, bob.address);
    expect(await lab.ownerOf(1)).to.equal(bob.address);
    expect((await lab.getCreature(1)).chimera).to.equal(true);
  });
});
