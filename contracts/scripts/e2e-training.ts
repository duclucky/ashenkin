/**
 * Live Sepolia check of the v4 player loop with a throwaway wallet (tmp/e2e-wallet.json):
 * faucet → hatch → raid strike (+XP) → train → completeTraining → private bonus read → NFT metadata.
 * Run: npx hardhat run scripts/e2e-training.ts --network sepolia
 */
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import { ethers, deployments } from "hardhat";
import fs from "fs";
import path from "path";

const CZAMA = "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB";
const ZAMA = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57";
const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stateFile = path.join(__dirname, "..", "tmp", "e2e-v4.json");
const state: Record<string, any> = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));

async function tx(label: string, f: () => Promise<ethers.ContractTransactionResponse>) {
  let sent: ethers.ContractTransactionResponse | undefined;
  for (let i = 0; !sent; i++) {
    try {
      sent = await f();
    } catch (e) {
      if (i >= 5) throw e;
      log(`  retry ${label}: ${(e as Error).message.slice(0, 120)}`);
      await sleep(5000);
    }
  }
  const r = await sent.wait();
  if (!r || r.status !== 1) throw new Error(`${label} failed`);
  log(`✓ ${label.padEnd(20)} gas ${r.gasUsed.toLocaleString().padStart(10)}  ${r.hash}`);
  await sleep(3000); // let the load-balanced RPC catch up
  return r;
}

async function main() {
  const provider = ethers.provider;
  const B = new ethers.Wallet(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tmp", "e2e-wallet.json"), "utf8")).pk, provider);
  log("player", B.address, "ETH", ethers.formatEther(await provider.getBalance(B.address)));

  const at = async (n: string) => ethers.getContractAt(n, (await deployments.get(n)).address, B);
  const lab = await at("ChimeraLab");
  const raid = await at("ChimeraRaid");
  const training = await at("ChimeraTraining");
  const zama = new ethers.Contract(ZAMA, ["function mint(address,uint256)", "function approve(address,uint256) returns (bool)"], B);
  const czama = new ethers.Contract(
    CZAMA,
    [
      "function wrap(address,uint256)",
      "function setOperator(address,uint48)",
      "function isOperator(address,address) view returns (bool)",
      "function confidentialBalanceOf(address) view returns (bytes32)",
    ],
    B,
  );
  const fhe = await createInstance({ ...SepoliaConfig, network: RPC });

  // 1 · faucet
  if (!state.funded) {
    const amt = ethers.parseUnits("100", 18);
    await tx("faucet mint", () => zama.mint(B.address, amt, fee));
    await tx("faucet approve", () => zama.approve(CZAMA, amt, fee));
    await tx("faucet wrap", () => czama.wrap(B.address, amt, fee));
    state.funded = true;
    save();
  }
  const tAddr = await training.getAddress();
  if (!(await czama.isOperator(B.address, tAddr))) {
    await tx("operator Training", () => czama.setOperator(tAddr, Math.floor(Date.now() / 1000) + 30 * 86400, fee));
  }

  // 2 · hatch
  if (!state.id) {
    const r = await tx("hatchGenesis", () => lab.hatchGenesis(fee));
    const ev = r.logs.map((l) => { try { return lab.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "Hatched");
    state.id = Number(ev!.args.id);
    save();
  }
  const id = BigInt(state.id);
  log("creature", state.id);

  // 3 · raid strike → +12 XP
  let [p] = await training.getProfile(id);
  if (Number(p.xp) < Number(await training.xpToNext(p.level)) && !p.pending) {
    await tx("raid strike", () => raid.strike(id, fee));
    [p] = await training.getProfile(id);
  }
  log("xp", Number(p.xp), "level", Number(p.level), "next needs", Number(await training.xpToNext(p.level)), "fee", ethers.formatUnits(await training.feeFor(p.level), 6), "cZAMA");

  // 4 · train → public paid flag → complete
  if (!p.pending) await tx("train", () => training.train(id, fee));
  const [, , paidHandle] = await training.getProfile(id);
  let proof: Awaited<ReturnType<typeof fhe.publicDecrypt>> | undefined;
  for (let i = 0; !proof; i++) {
    try {
      proof = await fhe.publicDecrypt([paidHandle]);
    } catch (e) {
      if (i > 10) throw e;
      log("  waiting for KMS…", (e as Error).message.slice(0, 80));
      await sleep(6000);
    }
  }
  log("paid =", proof.clearValues[paidHandle]);
  await tx("completeTraining", () => training.completeTraining(id, proof!.abiEncodedClearValues, proof!.decryptionProof, fee));
  const [prof, stage, , bonusHandle] = await training.getProfile(id);
  log("now level", Number(prof.level), "stage", Number(stage), "xp left", Number(prof.xp), "bonus handle", bonusHandle.slice(0, 18) + "…");

  // 5 · owner-only private read of trained power
  const kp = fhe.generateKeypair();
  const start = Math.floor(Date.now() / 1000) - 60;
  const contracts = [tAddr];
  const eip = fhe.createEIP712(kp.publicKey, contracts, start, 1);
  const sig = await B.signTypedData(eip.domain, { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification }, eip.message);
  let bonus: unknown;
  for (let i = 0; bonus === undefined; i++) {
    try {
      const r = await fhe.userDecrypt([{ handle: bonusHandle, contractAddress: tAddr }], kp.privateKey, kp.publicKey, sig.replace(/^0x/, ""), contracts, B.address, start, 1);
      bonus = Object.values(r)[0];
    } catch (e) {
      if (i > 8) throw e;
      await sleep(6000);
    }
  }
  log("trained power (owner-only) = +" + bonus);

  // 6 · stranger cannot publicly decrypt it
  try {
    await fhe.publicDecrypt([bonusHandle]);
    log("✗ bonus was publicly decryptable!");
  } catch {
    log("✓ bonus is sealed to the public");
  }
  log("ETH left", ethers.formatEther(await provider.getBalance(B.address)));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
