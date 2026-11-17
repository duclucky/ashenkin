import { ethers, deployments } from "hardhat";
const GAS = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
async function main() {
  const [signer] = await ethers.getSigners();
  const raid = await ethers.getContractAt("ChimeraRaid", (await deployments.get("ChimeraRaid")).address, signer);
  const cd = BigInt(process.env.CD ?? 7200);
  console.log("before", await raid.strikeCooldown());
  await (await raid.setStrikeCooldown(cd, GAS)).wait();
  console.log("after", await raid.strikeCooldown());
  console.log("balance", ethers.formatEther(await ethers.provider.getBalance(signer.address)));
}
main().catch((e) => { console.error(e); process.exit(1); });
