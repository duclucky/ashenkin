// P2: Arkhive Depths. Idempotent.
// npx hardhat run scripts/deploy-depths.ts --network sepolia
import { deployments, ethers, getNamedAccounts } from "hardhat";

const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);
  const get = async (n: string) => (await deployments.get(n)).address;
  const [lab, relics, treasury, training] = await Promise.all(["ChimeraLab", "ChimeraRelics", "ChimeraTreasury", "ChimeraTraining"].map(get));
  const token = await (await ethers.getContractAt("ChimeraLab", lab)).token();
  console.log("deployer", deployer, "balance", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
  const depths = (
    await deployments.deploy("ChimeraDepths", {
      from: deployer,
      log: true,
      maxFeePerGas: fee.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
      args: [token, lab, treasury, training],
    })
  ).address;
  console.log({ depths });
  const L = await ethers.getContractAt("ChimeraLab", lab, signer);
  const T = await ethers.getContractAt("ChimeraTraining", training, signer);
  const Tr = await ethers.getContractAt("ChimeraTreasury", treasury, signer);
  const R = await ethers.getContractAt("ChimeraRelics", relics, signer);
  const D = await ethers.getContractAt("ChimeraDepths", depths, signer);
  const step = async (label: string, done: boolean, send: () => Promise<{ wait: () => Promise<unknown> }>) => {
    if (done) return console.log("  · ", label);
    await (await send()).wait();
    console.log("  ✓", label);
  };
  await step("lab.setCombat(depths)", await L.isCombat(depths), () => L.setCombat(depths, true, fee));
  await step("training.setGame(depths)", await T.isGame(depths), () => T.setGame(depths, true, fee));
  await step("treasury.setGame(depths)", await Tr.isGame(depths), () => Tr.setGame(depths, true, fee));
  await step("relics.setGame(depths)", await R.isGame(depths), () => R.setGame(depths, true, fee));
  await step("depths.setLinks", eq(await D.relics(), relics), () => D.setLinks(treasury, training, relics, fee));
  console.log("balance after", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
