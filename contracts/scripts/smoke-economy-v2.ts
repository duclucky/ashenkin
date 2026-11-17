import assert from "node:assert/strict";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import type { TransactionResponse, Wallet } from "ethers";
import { artifacts, ethers, network } from "hardhat";
import { SEPOLIA_CZAMA, SEPOLIA_ZAMA_MOCK } from "../deploy/deploy";

const Z = 1_000_000n;
const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 1_000_000n };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function main() {
  assert.equal(network.name, "sepolia");
  const folder = resolve(__dirname, "../deployments-v2");
  const world = JSON.parse(readFileSync(resolve(folder, "sepolia.json"), "utf8"));
  assert(world.ready && world.chainId === 11155111, "Configure world v2 before testing it");
  const rpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpc);
  provider.pollingInterval = 2000;
  assert.equal((await provider.getNetwork()).chainId, 11155111n);
  const key = process.env.DEPLOYER_PRIVATE_KEY ?? JSON.parse(readFileSync(resolve(__dirname, "../tmp/e2e-wallet.json"), "utf8")).pk;
  const admin = new ethers.Wallet(key, provider);
  assert(same(admin.address, world.deployer));

  const address = (name: string): string => world.steps[name].address;
  const labAddress = address("ChimeraLab");
  // Deterministic test accounts for interrupted runs. The input key never leaves this process.
  const keepers = [0, 1, 2].map(i => new ethers.Wallet(ethers.keccak256(ethers.concat([key, ethers.toUtf8Bytes(`chimera-v2-smoke:${labAddress}:${i}`)])), provider));
  const [alice, bob] = keepers;
  const path = resolve(folder, "smoke.json");
  const record: { lab: string; transactions: Record<string, string>; result?: Record<string, unknown> } = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8")) : { lab: labAddress, transactions: {} };
  assert(same(record.lab, labAddress));
  const save = () => {
    writeFileSync(`${path}.next`, `${JSON.stringify(record, null, 2)}\n`);
    renameSync(`${path}.next`, path);
  };
  if (record.result) { console.log(JSON.stringify(record.result)); return; }
  async function send(label: string, fn: () => Promise<TransactionResponse>) {
    let response: TransactionResponse | undefined;
    if (!record.transactions[label]) {
      response = await fn();
      record.transactions[label] = response.hash;
      save();
      console.log(`${label} submitted ${response.hash}`);
    }
    const hash = record.transactions[label];
    const r = await provider.getTransactionReceipt(hash) ?? await (response ? response.wait(1, 180_000) : provider.waitForTransaction(hash, 1, 180_000));
    assert(r && r.status === 1, `${label} did not succeed`);
    console.log(`${label} confirmed at ${r.blockNumber}`);
    return r;
  }
  const at = async (name: string) => new ethers.Contract(address(name), (await artifacts.readArtifact(name)).abi, admin);
  const [lab, altar, treasury, quests, raid, liveSeason] = await Promise.all(["ChimeraLab", "ChimeraAscension", "ChimeraTreasury", "ChimeraQuests", "ChimeraRaid", "ChimeraSeason"].map(at));
  type Game = typeof lab;
  const as = (game: Game, keeper: Wallet) => game.connect(keeper) as Game;
  const czama = new ethers.Contract(SEPOLIA_CZAMA, [
    "function wrap(address,uint256)", "function setOperator(address,uint48)",
    "function confidentialBalanceOf(address) view returns (bytes32)",
  ], admin);
  const zama = new ethers.Contract(SEPOLIA_ZAMA_MOCK, ["function mint(address,uint256)", "function approve(address,uint256) returns(bool)"], admin);
  const receiptEvent = (game: Game, receipt: Awaited<ReturnType<typeof send>>, name: string) => {
    for (const log of receipt.logs) if (same(log.address, String(game.target))) {
      const e = game.interface.parseLog(log);
      if (e?.name === name) return e.args;
    }
    throw new Error(`Missing ${name} in ${receipt.hash}`);
  };
  async function retry<T>(fn: () => Promise<T>) {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (error) { if (i === 19) throw error; await delay(Math.min(2000 + i * 1000, 8000)); }
    }
  }
  const sdkPromise = retry(() => createInstance({ ...SepoliaConfig, network: rpc }));
  sdkPromise.catch(() => {});
  const mintTotal = 302_226n * 10n ** 18n;
  await send("Mint test supplies", () => zama.mint(admin.address, mintTotal, fee));
  await send("Approve initial supplies", () => zama.approve(SEPOLIA_CZAMA, mintTotal, fee));
  for (const [name, amount] of [["ChimeraTreasury", 300_000n], ["ChimeraRaid", 2_000n], ["ChimeraOracle", 200n]] as const) {
    await send(`Seed ${name}`, () => czama.wrap(address(name), amount * 10n ** 18n, fee));
  }
  await send("Publish initial Treasury reserve", () => treasury.publishReserve(fee));
  for (const [i, keeper] of keepers.entries()) {
    await send(`Gas for keeper ${i + 1}`, () => admin.sendTransaction({ to: keeper.address, value: ethers.parseEther("0.0005"), ...fee }));
  }
  const starterReceipts = await Promise.all(keepers.map((keeper, i) => send(`Hatch starter ${i + 1}`, () => as(lab, keeper).hatchGenesis(fee))));
  const starters = starterReceipts.map(r => receiptEvent(lab, r, "Hatched").id as bigint);
  const secondParent = receiptEvent(lab, await send("Hatch second parent", () => as(lab, alice).hatchGenesis(fee)), "Hatched").id as bigint;
  await send("Approve breeding operator", async () => as(czama, alice).setOperator(labAddress, (await provider.getBlock("latest"))!.timestamp + 30 * 86400, fee));

  // Exercise the same bytecode without spending the live world's daily budget or advancing its season.
  async function install(name: string, args: string[]) {
    const factory = await ethers.getContractFactory(name, admin);
    const receipt = await send(`Deploy isolated smoke ${name}`, async () => admin.sendTransaction({ ...await factory.getDeployTransaction(...args), ...fee }));
    assert(receipt.contractAddress);
    return new ethers.Contract(receipt.contractAddress, factory.interface, admin);
  }
  const testTreasury = await install("ChimeraTreasury", [SEPOLIA_CZAMA]);
  const testTreasuryAddress = await testTreasury.getAddress();
  const testQuests = await install("ChimeraQuests", [testTreasuryAddress]);
  const season = await install("ChimeraSeason", [address("ChimeraColosseum"), address("ChimeraOracle"), address("ChimeraRaid"), testTreasuryAddress]);
  await send("Allow isolated Quest payouts", async () => testTreasury.setGame(await testQuests.getAddress(), true, fee));
  await send("Allow isolated Season payouts", async () => testTreasury.setGame(await season.getAddress(), true, fee));
  await send("Mint isolated reward funds", () => zama.mint(admin.address, 200n * 10n ** 18n, fee));
  await send("Approve total remaining supplies", () => zama.approve(SEPOLIA_CZAMA, 226n * 10n ** 18n, fee));
  await send("Fund isolated rewards", () => czama.wrap(testTreasuryAddress, 200n * 10n ** 18n, fee));

  const sdk = await sdkPromise;
  async function publicProof(handle: string) { return retry(() => sdk.publicDecrypt([handle])); }
  async function decryptReceipt(keeper: Wallet, handle: string) {
    const pair = { handle, contractAddress: SEPOLIA_CZAMA };
    const kp = sdk.generateKeypair();
    const start = Math.floor(Date.now() / 1000) - 60;
    const scope = [SEPOLIA_CZAMA];
    const eip = sdk.createEIP712(kp.publicKey, scope, start, 1);
    const signature = await keeper.signTypedData(eip.domain, { UserDecryptRequestVerification: [...eip.types.UserDecryptRequestVerification] }, eip.message);
    const clear = await retry(() => sdk.userDecrypt([pair], kp.privateKey, kp.publicKey, signature.slice(2), scope, keeper.address, start, 1));
    return BigInt(clear[handle as `0x${string}`] ?? clear[handle.toLowerCase() as `0x${string}`] as bigint);
  }
  const parentA = starters[0];
  async function breed(label: string, expectedPaid: boolean) {
    const r = await send(`Lay ${label}`, async () => {
      const a = await lab.getCreature(parentA), b = await lab.getCreature(secondParent);
      const readyAt = Number(a.cooldownUntil > b.cooldownUntil ? a.cooldownUntil : b.cooldownUntil);
      for (;;) {
        const now = (await provider.getBlock("latest"))!.timestamp;
        if (now >= readyAt) break;
        await delay(Math.min(12, readyAt - now + 1) * 1000);
      }
      return as(lab, alice).breed(parentA, secondParent, fee);
    });
    const { eggId, paidHandle } = receiptEvent(lab, r, "EggLaid");
    const result = await send(`Resolve ${label}`, async () => {
      const proof = await publicProof(paidHandle);
      assert.equal(ethers.AbiCoder.defaultAbiCoder().decode(["bool"], proof.abiEncodedClearValues)[0], expectedPaid);
      return as(lab, alice).hatchEgg(eggId, proof.abiEncodedClearValues, proof.decryptionProof, fee);
    });
    receiptEvent(lab, result, expectedPaid ? "Hatched" : "EggDud");
    return eggId as bigint;
  }

  const dud = await breed("unpaid introductory egg", false);
  if (!record.transactions["Lay first paid egg"]) {
    assert.equal(await lab.introBreedUsed(alice.address), false);
    assert.equal((await lab.getCreature(parentA)).breeds, 0n);
    assert.equal(await lab.pendingBirths(), 0n);
  }
  await send("Fund two paid breedings", () => czama.wrap(alice.address, 26n * 10n ** 18n, fee));
  const first = await breed("first paid egg", true);
  await send("Approve first hatchling for retirement", () => as(lab, alice).approve(address("ChimeraAscension"), first, fee));
  const offered = await send("Retire first hatchling", () => as(altar, alice).retire(first, fee));
  assert.equal(receiptEvent(lab, offered, "Retired").lineageCharges, 1n);
  const second = await breed("second paid egg", true);
  assert.equal(await lab.lineageCharges(alice.address), 0n);
  assert.equal(await lab.retired(first), true);
  for (const id of [parentA, secondParent, second]) assert(same(await lab.ownerOf(id), alice.address));
  assert.equal((await lab.getCreature(parentA)).breeds, 2n);
  assert.equal(await lab.pendingBirths(), 0n);

  const liveQuest = await send("First live Quest reward", () => as(quests, alice).checkIn(fee));
  assert.equal(await decryptReceipt(alice, receiptEvent(quests, liveQuest, "RewardSent").amountHandle), Z);
  const checkIn = await send("First isolated Quest reward", () => as(testQuests, alice).checkIn(fee));
  const initialPaid = await decryptReceipt(alice, receiptEvent(testQuests, checkIn, "RewardSent").amountHandle);
  assert.equal(initialPaid, Z);
  await Promise.all(keepers.map((keeper, i) => send(`Join season keeper ${i + 1}`, () => as(season, keeper).join(fee))));
  await Promise.all(keepers.map((keeper, i) => send(`Raid strike keeper ${i + 1}`, () => as(raid, keeper).strike(starters[i], fee))));
  await Promise.all(keepers.map((keeper, i) => send(`Claim season throne ${i + 1}`, () => as(season, keeper).claimThrone(i, fee))));
  // Close season 1 while staging and restore the normal 14-day duration before season 2 begins.
  await send("Close window for staging season", () => season.setLength(1, true, fee));
  await send("Restore 14-day season duration", () => season.setLength(14 * 86400, false, fee));
  const payout = await send("Settle three season prizes", () => season.endSeason(fee));
  assert.equal(await season.season(), 2n);
  assert.equal((await season.endsAt()) - (await season.startedAt()), 14n * 86400n);
  const paid: bigint[] = [];
  for (const keeper of keepers) paid.push(await decryptReceipt(keeper, await season.prizePaid(1, keeper.address)));
  const [opening, remaining] = await testTreasury.budgetHandles();
  const openingProof = await publicProof(opening);
  const budget = BigInt(openingProof.clearValues[opening as `0x${string}`] as bigint);
  const expenditure = budget - initialPaid;
  assert.ok(expenditure > 0n && expenditure < 3_500n * Z);
  assert.equal(paid[0], expenditure * 2000n / 3500n);
  assert.equal(paid[1], expenditure * 1000n / 3500n);
  assert.equal(paid.reduce((a, b) => a + b, 0n), expenditure);
  const remainder = await publicProof(remaining);
  assert.equal(remainder.clearValues[remaining as `0x${string}`], 0n);
  const depleted = await send("Quest with depleted budget", () => as(testQuests, bob).checkIn(fee));
  assert.equal(await decryptReceipt(bob, receiptEvent(testQuests, depleted, "RewardSent").amountHandle), 0n);
  record.result = {
    parents: [parentA.toString(), secondParent.toString()], unpaidEgg: dud.toString(), retiredChild: first.toString(), liveChild: second.toString(),
    treasuryBudgetUnits: budget.toString(), initialQuestPaidUnits: initialPaid.toString(), depletedQuestPaidUnits: "0",
    seasonPrizesUnits: paid.map(String), seasonSettlement: payout.hash, liveSeason: Number(await liveSeason.season()),
    isolatedTreasury: testTreasuryAddress, isolatedSeason: await season.getAddress(),
  };
  save();
  console.log(JSON.stringify(record.result));
}

main().catch(error => {
  console.error(error.shortMessage ?? (error.code === "ERR_ASSERTION" ? error.message : error.code ?? error.name));
  process.exitCode = 1;
});
