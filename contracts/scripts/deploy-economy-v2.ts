import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Signer, TransactionRequest, TransactionResponse } from "ethers";
import { artifacts, ethers, network } from "hardhat";
import { SEPOLIA_CZAMA, SEPOLIA_ZAMA_MOCK } from "../deploy/deploy";

type Entry = { hash: string; address?: string; block?: number };
type Journal = { chainId: number; deployer: string; steps: Record<string, Entry>; ready?: boolean };
const release = process.env.ASHENKIN_RELEASE === "1";
const journalPath = resolve(__dirname, release ? "../deployments-ashenkin/sepolia.json" : "../deployments-v2/sepolia.json");
const releaseBaseUri = "https://ashenkin.xyz/api/ashenkin-nft/";
const v1 = JSON.parse(readFileSync(resolve(__dirname, "../../frontend/src/chimera/contracts.json"), "utf8"));
const v2 = JSON.parse(readFileSync(resolve(__dirname, "../../frontend/src/chimera/contracts.v2.json"), "utf8"));
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function deployEconomyWorld() {
  const live = network.name === "sepolia";
  assert(live || network.name === "hardhat", "Expected Sepolia or the local Hardhat network");
  const provider = live ? new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com") : ethers.provider;
  if (provider instanceof ethers.JsonRpcProvider) provider.pollingInterval = 2000;
  const chainId = Number((await provider.getNetwork()).chainId);
  assert.equal(chainId, live ? 11155111 : 31337);
  const signer: Signer = live
    ? new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY ?? JSON.parse(readFileSync(resolve(__dirname, "../tmp/e2e-wallet.json"), "utf8")).pk, provider)
    : (await ethers.getSigners())[0];
  const deployer = await signer.getAddress();
  const fee = live ? { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 1_000_000n } : {};
  const journal: Journal = live && existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : { chainId, deployer, steps: {} };
  assert.equal(journal.chainId, chainId);
  assert(equal(journal.deployer, deployer), "Resume with the signer recorded in the deployment journal");
  const save = () => {
    if (!live) return;
    mkdirSync(dirname(journalPath), { recursive: true });
    writeFileSync(`${journalPath}.next`, `${JSON.stringify(journal, null, 2)}\n`);
    renameSync(`${journalPath}.next`, journalPath);
  };
  const confirm = async (label: string, response?: TransactionResponse) => {
    const entry = journal.steps[label];
    if (entry.block != null) return;
    const tx = response ?? await provider.getTransaction(entry.hash);
    const receipt = tx ? await tx.wait(1, 180_000) : await provider.waitForTransaction(entry.hash, 1, 180_000);
    assert(receipt && receipt.status === 1, `${label} did not succeed: ${entry.hash}`);
    if (entry.address) assert(receipt.contractAddress && equal(entry.address, receipt.contractAddress), `${label}: address mismatch`);
    entry.block = receipt.blockNumber;
    save();
    console.log(`${label} confirmed at ${receipt.blockNumber}${entry.address ? ` ${entry.address}` : ""}`);
  };
  const pending = Object.entries(journal.steps).filter(([, step]) => step.block == null);
  for (const [label] of pending) await confirm(label);
  if (live) {
    assert.equal(await provider.getTransactionCount(deployer, "pending"), await provider.getTransactionCount(deployer, "latest"), "Deployer has another pending transaction");
    console.log(`Sepolia deployer ${deployer} · ${ethers.formatEther(await provider.getBalance(deployer))} ETH`);
    assert(await provider.getCode(SEPOLIA_CZAMA) !== "0x" && await provider.getCode(SEPOLIA_ZAMA_MOCK) !== "0x");
  }

  type Step = { label: string; tx: TransactionRequest; creating?: boolean };
  async function wave(steps: Step[]) {
    const next = steps.filter(step => !journal.steps[step.label]);
    if (!next.length) return;
    // Estimate independent calls before assigning nonces, then broadcast in nonce order.
    const gasLimits = await Promise.all(next.map(async step => (await signer.estimateGas({ ...step.tx, ...fee })) * 12n / 10n + 5_000n));
    if (live) {
      const feeCeiling = gasLimits.reduce((total, limit) => total + limit, 0n) * fee.maxFeePerGas!;
      assert((await provider.getBalance(deployer, "pending")) >= feeCeiling, "Insufficient Sepolia ETH for the next deployment batch");
    }
    let nonce = await provider.getTransactionCount(deployer, "pending");
    const responses: { label: string; response: TransactionResponse }[] = [];
    for (let i = 0; i < next.length; i++) {
      const { label, tx, creating } = next[i];
      const response = await signer.sendTransaction({ ...tx, ...fee, nonce, gasLimit: gasLimits[i] });
      journal.steps[label] = { hash: response.hash, ...(creating && { address: ethers.getCreateAddress({ from: deployer, nonce }) }) };
      save();
      console.log(`${label} submitted ${response.hash}`);
      responses.push({ label, response });
      nonce++;
    }
    // Persist completion serially. All transactions have already been submitted.
    for (const { label, response } of responses) await confirm(label, response);
  }
  const deployment = async (name: string, args: unknown[] = []): Promise<Step> => ({
    label: name, creating: true,
    tx: await (await ethers.getContractFactory(name, signer)).getDeployTransaction(...args),
  });
  const address = (name: string) => {
    const addr = journal.steps[name]?.address;
    assert(addr, `${name} not deployed`);
    return addr;
  };
  const contract = async (name: string) => new ethers.Contract(address(name), (await artifacts.readArtifact(name)).abi, signer);
  const call = async (name: string, method: string, args: unknown[]): Promise<Step> => ({
    label: `${name}.${method}(${args.join(",")})`, tx: await (await contract(name)).getFunction(method).populateTransaction(...args),
  });

  if (!live) await wave([await deployment("ConfidentialTokenMock")]);
  const token = live ? SEPOLIA_CZAMA : address("ConfidentialTokenMock");
  await wave(await Promise.all(["ChimeraLab", "ChimeraTreasury", "ChimeraOracle"].map(name => deployment(name, [token]))));
  const lab = address("ChimeraLab"), treasury = address("ChimeraTreasury");
  const labGames = ["ChimeraArena", "ChimeraMarket", "ChimeraRaid", "ChimeraTraining", "ChimeraColosseum", "ChimeraRelics"];
  await wave(await Promise.all([
    ...labGames.map(name => deployment(name, [lab, token])),
    deployment("ChimeraExpeditions", [lab, treasury]), deployment("ChimeraQuests", [treasury]),
    deployment("ChimeraRaffle", [token, treasury]),
  ]));
  const [arena, market, raid, training, colosseum, relics] = labGames.map(address);
  const [expeditions, quests, oracle, raffle] = ["ChimeraExpeditions", "ChimeraQuests", "ChimeraOracle", "ChimeraRaffle"].map(address);
  await wave(await Promise.all([
    deployment("ChimeraAscension", [lab, training]),
    deployment("ChimeraSeason", [colosseum, oracle, raid, treasury]),
    deployment("ChimeraDepths", [token, lab, treasury, training]),
  ]));
  const [altar, season, depths] = ["ChimeraAscension", "ChimeraSeason", "ChimeraDepths"].map(address);
  if (live) {
    const olderAddresses = release ? [...Object.values(v1.addresses), ...Object.values(v2.addresses)] : Object.values(v1.addresses);
    for (const { address: addr } of Object.values(journal.steps)) {
      if (addr) assert(!olderAddresses.some(old => typeof old === "string" && equal(old, addr)), "Deployment overlaps an older game");
    }
  }

  const baseUri = release ? releaseBaseUri : process.env.ECONOMY_V2_NFT_BASE_URI ?? "";
  const wire: [string, string, unknown[]][] = [
    ["ChimeraLab", "setArena", [colosseum]],
    ["ChimeraLab", "setEconomy", [raid, treasury, quests]],
    ["ChimeraLab", "setTraining", [training, baseUri]],
    ["ChimeraArena", "setEconomy", [raid, quests]],
    ["ChimeraColosseum", "setEconomy", [raid, quests]],
    ["ChimeraMarket", "setRaid", [raid]],
    ["ChimeraRaid", "setQuests", [quests]],
    ["ChimeraExpeditions", "setQuests", [quests]],
    ["ChimeraTraining", "setEconomy", [raid, treasury]],
    ["ChimeraTraining", "setRelics", [relics]],
    ["ChimeraRelics", "setTraining", [training]],
    ["ChimeraRelics", "setEconomy", [raid, treasury]],
    ["ChimeraOracle", "setRelics", [relics]],
    ["ChimeraSeason", "setRelics", [relics]],
    ["ChimeraRaffle", "setRelics", [relics]],
    ["ChimeraAscension", "setLinks", [colosseum, relics]],
    ["ChimeraDepths", "setLinks", [treasury, training, relics]],
  ];
  for (const target of ["ChimeraArena", "ChimeraColosseum", "ChimeraRaid", "ChimeraExpeditions"]) wire.push([target, "setTraining", [training]]);
  for (const addr of [arena, raid, expeditions, depths]) wire.push(["ChimeraLab", "setCombat", [addr, true]]);
  for (const addr of [expeditions, quests, depths, season]) wire.push(["ChimeraTreasury", "setGame", [addr, true]]);
  for (const addr of [lab, arena, colosseum, expeditions, raid]) wire.push(["ChimeraQuests", "setGame", [addr, true]]);
  for (const addr of [arena, colosseum, raid, expeditions, altar, depths]) wire.push(["ChimeraTraining", "setGame", [addr, true]]);
  for (const addr of [oracle, season, raffle, depths]) wire.push(["ChimeraRelics", "setGame", [addr, true]]);
  // Limit concurrent reads against public RPC quotas.
  for (let i = 0; i < wire.length; i += 8) await wave(await Promise.all(wire.slice(i, i + 8).map(([name, method, args]) => call(name, method, args))));
  await wave([await call("ChimeraLab", "setRetirementVault", [altar])]);

  const L = await contract("ChimeraLab"), T = await contract("ChimeraTreasury");
  assert.equal(await L.economyVersion(), 2n);
  assert.equal(await T.economyVersion(), 2n);
  assert(equal(await L.arena(), colosseum) && equal(await L.retirementVault(), altar));
  assert(equal(await L.treasury(), treasury) && equal(await L.quests(), quests));
  for (const game of [expeditions, quests, depths, season]) assert(await T.isGame(game));
  for (const name of ["ChimeraLab", "ChimeraTreasury", "ChimeraQuests", ...labGames, "ChimeraExpeditions", "ChimeraOracle", "ChimeraAscension", "ChimeraSeason", "ChimeraRaffle", "ChimeraDepths"]) {
    assert.equal(await (await contract(name)).owner(), deployer);
  }
  if (release) {
    assert.equal(await L.name(), "Ashenkin");
    assert.equal(await L.symbol(), "ASHEN");
    if (live) {
      const zama = new ethers.Contract(SEPOLIA_ZAMA_MOCK, [
        "function mint(address,uint256)", "function approve(address,uint256) returns (bool)",
      ], signer);
      const czama = new ethers.Contract(SEPOLIA_CZAMA, ["function wrap(address,uint256)"], signer);
      const supplies = 302_200n * 10n ** 18n;
      await wave([
        { label: "Mint test supplies", tx: await zama.mint.populateTransaction(deployer, supplies) },
        { label: "Approve test supplies", tx: await zama.approve.populateTransaction(SEPOLIA_CZAMA, supplies) },
        await call("ChimeraLab", "hatchGenesis", []),
      ]);
      for (const [name, amount] of [["ChimeraTreasury", 300_000n], ["ChimeraRaid", 2_000n], ["ChimeraOracle", 200n]] as const) {
        await wave([{ label: `Seed ${name}`, tx: await czama.wrap.populateTransaction(address(name), amount * 10n ** 18n) }]);
      }
      await wave([await call("ChimeraTreasury", "publishReserve", []), await call("ChimeraRaid", "publishPot", [])]);
      assert.equal(await L.tokenURI(1n), `${releaseBaseUri}1`);
    }
  }
  journal.ready = true;
  save();
  console.log(`${release ? "Ashenkin" : "Economy v2"} configured on chain ${chainId}: Lab ${lab}, Treasury ${treasury}.`);
  return journal;
}

if (require.main === module) deployEconomyWorld().catch((error) => {
  // RPC errors can include configured endpoint credentials in request details.
  console.error(network.name === "hardhat" ? error : error.shortMessage ?? (error.code === "ERR_ASSERTION" ? error.message : error.code ?? error.name));
  process.exitCode = 1;
});
