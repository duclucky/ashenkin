// Redeploys ChimeraRaid (v5: late-striker fix + per-strike damage ACL) and rewires every contract that
// points at the World Boss. Seeds the new pot with test cZAMA so the boss doesn't start at zero.
// npx hardhat run scripts/redeploy-raid.ts --network sepolia
import fs from "fs";
import path from "path";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { SEPOLIA_CZAMA, SEPOLIA_ZAMA_MOCK } from "../deploy/deploy";

const SEED = BigInt(process.env.RAID_SEED ?? "2000"); // cZAMA

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);
  const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
  const get = async (n: string) => (await deployments.get(n)).address;
  const [lab, arena, market, treasury, quests, training] = await Promise.all(
    ["ChimeraLab", "ChimeraArena", "ChimeraMarket", "ChimeraTreasury", "ChimeraQuests", "ChimeraTraining"].map(get),
  );
  const old = await get("ChimeraRaid");
  console.log("deployer", deployer, "balance", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
  console.log("old raid", old);

  // keep the previous deployment file for the record
  const file = path.join(__dirname, "..", "deployments", network.name, "ChimeraRaid.json");
  const archive = path.join(__dirname, "..", "deployments-archive", `ChimeraRaid-v4-${old}.json`);
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  if (!fs.existsSync(archive)) fs.copyFileSync(file, archive);

  const d = await deployments.deploy("ChimeraRaid", {
    from: deployer,
    args: [lab, SEPOLIA_CZAMA],
    log: true,
    maxFeePerGas: fee.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
  });
  const raid = d.address;
  if (raid.toLowerCase() === old.toLowerCase()) throw new Error("bytecode unchanged: nothing redeployed");
  console.log("new raid", raid);

  const c = (addr: string, abi: string[]) => new ethers.Contract(addr, abi, signer);
  const step = async (label: string, p: Promise<{ wait: () => Promise<unknown> }>) => {
    await (await p).wait();
    console.log("  ✓", label);
  };
  const L = c(lab, ["function setCombat(address,bool)", "function setEconomy(address,address,address)"]);
  const A = c(arena, ["function setEconomy(address,address)"]);
  const M = c(market, ["function setRaid(address)"]);
  const R = c(raid, ["function setQuests(address)", "function setTraining(address)", "function publishPot()"]);
  const Q = c(quests, ["function setGame(address,bool)"]);
  const T = c(training, ["function setGame(address,bool)", "function setEconomy(address,address)"]);

  await step("lab: combat", L.setCombat(raid, true, fee));
  await step("lab: economy", L.setEconomy(raid, treasury, quests, fee));
  await step("arena: economy", A.setEconomy(raid, quests, fee));
  await step("market: fee sink", M.setRaid(raid, fee));
  await step("raid: quests", R.setQuests(quests, fee));
  await step("raid: training", R.setTraining(training, fee));
  await step("quests: game", Q.setGame(raid, true, fee));
  await step("training: game", T.setGame(raid, true, fee));
  await step("training: economy", T.setEconomy(raid, treasury, fee));
  // the old raid can no longer read battle profiles, record quests or grant XP
  await step("revoke old: lab", L.setCombat(old, false, fee));
  await step("revoke old: quests", Q.setGame(old, false, fee));
  await step("revoke old: training", T.setGame(old, false, fee));

  if (SEED > 0n) {
    const amount = SEED * 10n ** 18n;
    const zama = c(SEPOLIA_ZAMA_MOCK, ["function mint(address,uint256)", "function approve(address,uint256) returns (bool)"]);
    const cz = c(SEPOLIA_CZAMA, ["function wrap(address,uint256)"]);
    await step(`mint ${SEED} ZAMA`, zama.mint(deployer, amount, fee));
    await step("approve wrapper", zama.approve(SEPOLIA_CZAMA, amount, fee));
    await step(`wrap ${SEED} cZAMA into the boss pot`, cz.wrap(raid, amount, fee));
  }
  await step("publish pot", R.publishPot(fee));
  console.log("balance left", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
