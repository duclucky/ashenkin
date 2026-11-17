// P2: Sealed Raffle. Idempotent.
// npx hardhat run scripts/deploy-raffle.ts --network sepolia
import { deployments, ethers, getNamedAccounts } from "hardhat";

const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);
  const get = async (n: string) => (await deployments.get(n)).address;
  const [lab, relics, treasury] = await Promise.all(["ChimeraLab", "ChimeraRelics", "ChimeraTreasury"].map(get));
  const token = await (await ethers.getContractAt("ChimeraLab", lab)).token();
  console.log("deployer", deployer, "balance", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH", "token", token);
  const raffle = (
    await deployments.deploy("ChimeraRaffle", {
      from: deployer,
      log: true,
      maxFeePerGas: fee.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
      args: [token, treasury],
    })
  ).address;
  console.log({ raffle });
  const R = await ethers.getContractAt("ChimeraRelics", relics, signer);
  const Ra = await ethers.getContractAt("ChimeraRaffle", raffle, signer);
  const step = async (label: string, done: boolean, send: () => Promise<{ wait: () => Promise<unknown> }>) => {
    if (done) return console.log("  · ", label);
    await (await send()).wait();
    console.log("  ✓", label);
  };
  await step("relics.setGame(raffle)", await R.isGame(raffle), () => R.setGame(raffle, true, fee));
  await step("raffle.setRelics", eq(await Ra.relics(), relics), () => Ra.setRelics(relics, fee));
  console.log("balance after", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
