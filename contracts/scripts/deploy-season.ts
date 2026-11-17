// Season of Masks (v5): deploys Training v2, Relics, Colosseum (Blind Tactics) and the Oracle's Riddle,
// rewires the live v4 world to them and carries public training levels over from Training v1.
// Idempotent: every wiring step checks on-chain state first, so it can be re-run after a hiccup.
// npx hardhat run scripts/deploy-season.ts --network sepolia
import fs from "fs";
import path from "path";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { SEPOLIA_CZAMA, SEPOLIA_ZAMA_MOCK } from "../deploy/deploy";

const ORACLE_SEED = BigInt(process.env.ORACLE_SEED ?? "200"); // cZAMA
const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);
  const get = async (n: string) => (await deployments.get(n)).address;
  const [lab, arena, treasury, quests, raid, exp] = await Promise.all(
    ["ChimeraLab", "ChimeraArena", "ChimeraTreasury", "ChimeraQuests", "ChimeraRaid", "ChimeraExpeditions"].map(get),
  );
  console.log("deployer", deployer, "balance", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");

  // ── Training v1 → archive, remember its address for the migration ──
  const archiveDir = path.join(__dirname, "..", "deployments-archive");
  fs.mkdirSync(archiveDir, { recursive: true });
  const v1File = path.join(archiveDir, "ChimeraTraining-v1.json");
  if (!fs.existsSync(v1File))
    fs.copyFileSync(path.join(__dirname, "..", "deployments", network.name, "ChimeraTraining.json"), v1File);
  const v1 = JSON.parse(fs.readFileSync(v1File, "utf8")).address as string;
  console.log("training v1", v1);

  const opts = {
    from: deployer,
    log: true,
    maxFeePerGas: fee.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas.toString(),
  };
  const training = (await deployments.deploy("ChimeraTraining", { ...opts, args: [lab, SEPOLIA_CZAMA] })).address;
  if (eq(training, v1)) throw new Error("Training bytecode unchanged");
  const relics = (await deployments.deploy("ChimeraRelics", { ...opts, args: [lab, SEPOLIA_CZAMA] })).address;
  const colosseum = (await deployments.deploy("ChimeraColosseum", { ...opts, args: [lab, SEPOLIA_CZAMA] })).address;
  const oracle = (await deployments.deploy("ChimeraOracle", { ...opts, args: [SEPOLIA_CZAMA] })).address;
  console.log({ training, relics, colosseum, oracle });

  const at = (n: string, a: string) => ethers.getContractAt(n, a, signer);
  const L = await at("ChimeraLab", lab);
  const T = await at("ChimeraTraining", training);
  const R = await at("ChimeraRelics", relics);
  const C = await at("ChimeraColosseum", colosseum);
  const O = await at("ChimeraOracle", oracle);
  const Q = await at("ChimeraQuests", quests);
  const step = async (label: string, done: boolean, send: () => Promise<{ wait: () => Promise<unknown> }>) => {
    if (done) return console.log("  · ", label);
    await (await send()).wait();
    console.log("  ✓", label);
  };

  // lab: new arena (wild spawns), Training v2 (power hub), baseURI preserved
  const uri1 = await L.tokenURI(1n);
  const baseURI = uri1.endsWith("1") ? uri1.slice(0, -1) : "";
  await step("lab.setArena(colosseum)", eq(await L.arena(), colosseum), () => L.setArena(colosseum, fee));
  await step("lab.setTraining(v2)", eq(await L.training(), training), () => L.setTraining(training, baseURI, fee));

  // training v2
  await step("training.setEconomy", eq(await T.raid(), raid), () => T.setEconomy(raid, treasury, fee));
  await step("training.setRelics", eq(await T.relics(), relics), () => T.setRelics(relics, fee));
  for (const g of [colosseum, raid, exp, arena])
    await step(`training.setGame ${g.slice(0, 8)}`, await T.isGame(g), () => T.setGame(g, true, fee));
  for (const [n, a] of [
    ["ChimeraRaid", raid],
    ["ChimeraExpeditions", exp],
    ["ChimeraArena", arena],
  ] as const) {
    const g = new ethers.Contract(a, ["function training() view returns (address)", "function setTraining(address)"], signer);
    await step(`${n}.setTraining(v2)`, eq(await g.training(), training), () => g.setTraining(training, fee));
  }

  // relics
  await step("relics.setTraining", eq(await R.training(), training), () => R.setTraining(training, fee));
  await step("relics.setEconomy", eq(await R.raid(), raid), () => R.setEconomy(raid, treasury, fee));
  await step("relics.setGame(oracle)", await R.isGame(oracle), () => R.setGame(oracle, true, fee));

  // colosseum
  await step("colosseum.setEconomy", eq(await C.raid(), raid), () => C.setEconomy(raid, quests, fee));
  await step("colosseum.setTraining", eq(await C.training(), training), () => C.setTraining(training, fee));
  await step("quests.setGame(colosseum)", await Q.isGame(colosseum), () => Q.setGame(colosseum, true, fee));

  // oracle
  await step("oracle.setRelics", eq(await O.relics(), relics), () => O.setRelics(relics, fee));

  // ── migrate public training progress v1 → v2 ──
  const T1 = await at("ChimeraTraining", v1);
  const total = Number(await L.totalCreatures());
  const ids: bigint[] = [], levels: number[] = [], xps: number[] = [];
  for (let id = 1; id <= total; id++) {
    const [p] = await T1.getProfile(id);
    const [p2] = await T.getProfile(id);
    if ((p.level > 0n || p.xp > 0n) && p2.level === 0n && p2.xp === 0n) {
      ids.push(BigInt(id));
      levels.push(Number(p.level));
      xps.push(Number(p.xp) + Number(p.pending ? p.spentXp : 0n));
    }
  }
  console.log(`migrating ${ids.length} trained creatures of ${total}`);
  for (let i = 0; i < ids.length; i += 15)
    await step(
      `migrate ${i}..${Math.min(i + 15, ids.length) - 1}`,
      false,
      () => T.migrate(ids.slice(i, i + 15), levels.slice(i, i + 15), xps.slice(i, i + 15), fee),
    );

  // ── seed the riddle jackpot ──
  if (ORACLE_SEED > 0n && process.env.SKIP_SEED !== "1") {
    const c = (a: string, abi: string[]) => new ethers.Contract(a, abi, signer);
    const zama = c(SEPOLIA_ZAMA_MOCK, ["function mint(address,uint256)", "function approve(address,uint256) returns (bool)"]);
    const cz = c(SEPOLIA_CZAMA, ["function wrap(address,uint256)", "function setOperator(address,uint48)"]);
    const amount18 = ORACLE_SEED * 10n ** 18n;
    await step(`mint ${ORACLE_SEED} ZAMA`, false, () => zama.mint(deployer, amount18, fee));
    await step("approve wrapper", false, () => zama.approve(SEPOLIA_CZAMA, amount18, fee));
    await step("wrap to deployer", false, () => cz.wrap(deployer, amount18, fee));
    const until = Math.floor(Date.now() / 1000) + 3600;
    await step("operator oracle", false, () => cz.setOperator(oracle, until, fee));
    await step(`seed oracle pot ${ORACLE_SEED}`, false, () => O.seedPot(ORACLE_SEED * 1_000_000n, fee));
  }
  console.log("balance left", ethers.formatEther(await ethers.provider.getBalance(deployer)), "ETH");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
