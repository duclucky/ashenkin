// P1: Ascension altar + Season thrones. Idempotent — every wiring step checks on-chain state first.
// npx hardhat run scripts/deploy-p1.ts --network sepolia
import { deployments, ethers, getNamedAccounts } from "hardhat";

const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);
  const get = async (n: string) => (await deployments.get(n)).address;
  const [lab, training, colosseum, relics, oracle, raid, treasury] = await Promise.all(
    ["ChimeraLab", "ChimeraTraining", "ChimeraColosseum", "ChimeraRelics", "ChimeraOracle", "ChimeraRaid", "ChimeraTreasury"].map(get),
  );
  console.log("deployer", deployer, "balance", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
  const opts = {
    from: deployer,
    log: true,
    maxFeePerGas: fee.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
  };
  const ascension = (await deployments.deploy("ChimeraAscension", { ...opts, args: [lab, training] })).address;
  const season = (await deployments.deploy("ChimeraSeason", { ...opts, args: [colosseum, oracle, raid, treasury] })).address;
  console.log({ ascension, season });

  const at = (n: string, a: string) => ethers.getContractAt(n, a, signer);
  const T = await at("ChimeraTraining", training);
  const R = await at("ChimeraRelics", relics);
  const Tr = await at("ChimeraTreasury", treasury);
  const As = await at("ChimeraAscension", ascension);
  const L = await at("ChimeraLab", lab);
  const Se = await at("ChimeraSeason", season);
  const step = async (label: string, done: boolean, send: () => Promise<{ wait: () => Promise<unknown> }>) => {
    if (done) return console.log("  · ", label);
    await (await send()).wait();
    console.log("  ✓", label);
  };
  await step("training.setGame(ascension)", await T.isGame(ascension), () => T.setGame(ascension, true, fee));
  await step("ascension.setLinks", eq(await As.colosseum(), colosseum), () => As.setLinks(colosseum, relics, fee));
  // New worlds only: the v1 Lab has no lineage policy and must not be silently migrated.
  const economyVersion = await L.economyVersion().catch((error: any) => {
    if (error.code === "CALL_EXCEPTION" && error.data === "0x") return 1n;
    throw error;
  });
  if (economyVersion === 2n) {
    const vault = await L.retirementVault();
    if (!eq(vault, ethers.ZeroAddress) && !eq(vault, ascension)) throw new Error("Lab already has a different permanent retirement vault");
    await step("lab.setRetirementVault", eq(vault, ascension), () => L.setRetirementVault(ascension, fee));
  }
  await step("treasury.setGame(season)", await Tr.isGame(season), () => Tr.setGame(season, true, fee));
  await step("relics.setGame(season)", await R.isGame(season), () => R.setGame(season, true, fee));
  await step("season.setRelics", eq(await Se.relics(), relics), () => Se.setRelics(relics, fee));
  console.log("balance after", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
