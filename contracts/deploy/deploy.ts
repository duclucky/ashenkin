import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/** Zama's official confidential ZAMA mock on Sepolia (ERC-7984 wrapper, 6 decimals) and its free-mint ERC-20. */
export const SEPOLIA_CZAMA = "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB";
export const SEPOLIA_ZAMA_MOCK = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, read } = hre.deployments;
  // Sepolia base fee is near zero; ethers' default 1.5 gwei tip overpays ~100×
  const fees =
    hre.network.name === "sepolia"
      ? { maxFeePerGas: process.env.MAX_FEE_WEI ?? "50000000", maxPriorityFeePerGas: process.env.TIP_WEI ?? "10000000" }
      : {};
  const opts = { from: deployer, log: true, ...fees };

  let token = process.env.CZAMA_ADDRESS ?? (hre.network.name === "sepolia" ? SEPOLIA_CZAMA : "");
  if (!token) token = (await deploy("ConfidentialTokenMock", opts)).address;

  const lab = await deploy("ChimeraLab", { ...opts, args: [token] });
  const arena = await deploy("ChimeraArena", { ...opts, args: [lab.address, token] });
  const market = await deploy("ChimeraMarket", { ...opts, args: [lab.address, token] });
  const treasury = await deploy("ChimeraTreasury", { ...opts, args: [token] });
  const raid = await deploy("ChimeraRaid", { ...opts, args: [lab.address, token] });
  const exp = await deploy("ChimeraExpeditions", { ...opts, args: [lab.address, treasury.address] });
  const quests = await deploy("ChimeraQuests", { ...opts, args: [treasury.address] });
  const training = await deploy("ChimeraTraining", { ...opts, args: [lab.address, token] });
  const baseURI = process.env.NFT_BASE_URI ?? "";

  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const x = (c: string, m: string, ...args: unknown[]) => execute(c, opts, m, ...args);

  if (!eq(await read("ChimeraLab", "arena"), arena.address)) await x("ChimeraLab", "setArena", arena.address);
  if (!(await read("ChimeraLab", "isCombat", exp.address))) await x("ChimeraLab", "setCombat", exp.address, true);
  if (!(await read("ChimeraLab", "isCombat", raid.address))) await x("ChimeraLab", "setCombat", raid.address, true);
  if (!eq(await read("ChimeraLab", "quests"), quests.address))
    await x("ChimeraLab", "setEconomy", raid.address, treasury.address, quests.address);
  if (!eq(await read("ChimeraArena", "quests"), quests.address)) await x("ChimeraArena", "setEconomy", raid.address, quests.address);
  if (!eq(await read("ChimeraMarket", "raid"), raid.address)) await x("ChimeraMarket", "setRaid", raid.address);
  if (!eq(await read("ChimeraRaid", "quests"), quests.address)) await x("ChimeraRaid", "setQuests", quests.address);
  if (!eq(await read("ChimeraExpeditions", "quests"), quests.address)) await x("ChimeraExpeditions", "setQuests", quests.address);
  for (const g of [exp.address, quests.address])
    if (!(await read("ChimeraTreasury", "isGame", g))) await x("ChimeraTreasury", "setGame", g, true);
  for (const g of [lab.address, arena.address, exp.address, raid.address])
    if (!(await read("ChimeraQuests", "isGame", g))) await x("ChimeraQuests", "setGame", g, true);

  if (!eq(await read("ChimeraLab", "training"), training.address))
    await x("ChimeraLab", "setTraining", training.address, baseURI);
  if (!eq(await read("ChimeraTraining", "raid"), raid.address))
    await x("ChimeraTraining", "setEconomy", raid.address, treasury.address);
  for (const g of [arena.address, exp.address, raid.address])
    if (!(await read("ChimeraTraining", "isGame", g))) await x("ChimeraTraining", "setGame", g, true);
  for (const c of ["ChimeraArena", "ChimeraRaid", "ChimeraExpeditions"])
    if (!eq(await read(c, "training"), training.address)) await x(c, "setTraining", training.address);

  console.log(
    `\n  cZAMA              ${token}\n  ChimeraLab         ${lab.address}\n  ChimeraArena       ${arena.address}\n  ChimeraMarket      ${market.address}\n  ChimeraTreasury    ${treasury.address}\n  ChimeraRaid        ${raid.address}\n  ChimeraExpeditions ${exp.address}\n  ChimeraQuests      ${quests.address}\n  ChimeraTraining    ${training.address}\n`,
  );
};
export default func;
func.id = "deploy_chimera_v4";
func.tags = ["Chimera"];
