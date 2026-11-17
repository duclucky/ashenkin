// Seeds the Treasury and the World Boss pot with test cZAMA: mint ZAMA mock → approve → wrap(to=contract).
// npx hardhat run scripts/seed-sepolia.ts --network sepolia   (TREASURY_SEED / RAID_SEED in whole cZAMA)
import { ethers, deployments } from "hardhat";

const CZAMA = "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB";
const ZAMA = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57";

async function main() {
  const [signer] = await ethers.getSigners();
  // Sepolia base fee is near zero; avoid ethers' default 1.5 gwei tip
  const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
  const zama = new ethers.Contract(ZAMA, ["function mint(address,uint256)", "function approve(address,uint256) returns (bool)"], signer);
  const czama = new ethers.Contract(CZAMA, ["function wrap(address,uint256)"], signer);
  const targets = [
    { name: "ChimeraTreasury", amount: BigInt(process.env.TREASURY_SEED ?? "300000") },
    { name: "ChimeraRaid", amount: BigInt(process.env.RAID_SEED ?? "2000") },
  ];
  for (const t of targets) {
    const to = (await deployments.get(t.name)).address;
    const wei = t.amount * 10n ** 18n;
    let left = wei;
    while (left > 0n) {
      const chunk = left > 1_000_000n * 10n ** 18n ? 1_000_000n * 10n ** 18n : left;
      await (await zama.mint(signer.address, chunk, fee)).wait();
      left -= chunk;
    }
    await (await zama.approve(CZAMA, wei, fee)).wait();
    await (await czama.wrap(to, wei, fee)).wait();
    console.log(`seeded ${t.name} ${to} with ${t.amount} cZAMA`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
