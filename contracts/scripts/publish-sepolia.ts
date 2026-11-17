// Publishes the World Boss pot and Treasury reserve so the UI can show them.
// npx hardhat run scripts/publish-sepolia.ts --network sepolia
import { ethers, deployments } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
  const raid = new ethers.Contract((await deployments.get("ChimeraRaid")).address, ["function publishPot()"], signer);
  const treasury = new ethers.Contract((await deployments.get("ChimeraTreasury")).address, ["function publishReserve()"], signer);
  await (await raid.publishPot(fee)).wait();
  console.log("published pot");
  await new Promise((r) => setTimeout(r, 8000));
  await (await treasury.publishReserve(fee)).wait();
  console.log("published reserve");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
