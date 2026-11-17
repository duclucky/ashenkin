import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { deployEconomyWorld } from "../scripts/deploy-economy-v2";

describe("Economy v2 standalone deployment", function () {
  this.timeout(120_000);
  it("wires a complete world and verifies its owner, vault and reward routes", async function () {
    if (!fhevm.isMock) this.skip();
    const world = await deployEconomyWorld();
    expect(world.ready).to.equal(true);
    expect(world.steps.ChimeraLab.address).not.to.equal(world.steps.ChimeraTreasury.address);
    const lab = await ethers.getContractAt("ChimeraLab", world.steps.ChimeraLab.address!);
    expect(await lab.name()).to.equal("Ashenkin");
    expect(await lab.symbol()).to.equal("ASHEN");
  });
});
