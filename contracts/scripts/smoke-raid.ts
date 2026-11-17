// Live check of the redeployed Raid: one strike from the deployer, then decrypt that strike's damage
// (needs the allowThis fix) and the band. npx hardhat run scripts/smoke-raid.ts --network sepolia
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import { deployments, ethers } from "hardhat";
import fs from "fs";
import path from "path";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };

async function retry<T>(f: () => Promise<T>, n = 12): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) { if (i >= n) throw e; await sleep(4000 + i * 2000); }
  }
}

async function main() {
  // the throwaway e2e wallet owns creatures; key stays in tmp/ (git-ignored)
  const pk = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tmp", "e2e-wallet.json"), "utf8")).pk;
  const A = new ethers.Wallet(pk, ethers.provider);
  const labD = await deployments.get("ChimeraLab");
  const raidD = await deployments.get("ChimeraRaid");
  const lab = new ethers.Contract(labD.address, labD.abi, A);
  const raid = new ethers.Contract(raidD.address, raidD.abi, A);
  const n = Number(await lab.balanceOf(A.address));
  if (!n) throw new Error("deployer owns no creature");
  let id: bigint | undefined;
  for (let i = 0; i < n && id === undefined; i++) {
    const c = await lab.tokenOfOwnerByIndex(A.address, i);
    if (Number(await raid.readyAt(c)) <= Math.floor(Date.now() / 1000)) id = c;
  }
  if (id === undefined) throw new Error("all creatures recovering");
  const r = await (await raid.strike(id, fee)).wait();
  const ev = r.logs.map((l: any) => { try { return raid.interface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === "Struck");
  console.log("strike", ev.args.strikeId.toString(), "creature", id.toString(), "gas", r.gasUsed.toString(), r.hash);
  const fhe = await retry(() => createInstance({ ...SepoliaConfig, network: RPC }), 20);
  const kp = fhe.generateKeypair();
  const start = Math.floor(Date.now() / 1000);
  const eip = fhe.createEIP712(kp.publicKey, [raidD.address], start, 1);
  const sig = await A.signTypedData(eip.domain, { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification }, eip.message);
  const dmgH = ev.args.damageHandle;
  const out = await retry(() => fhe.userDecrypt([{ handle: dmgH, contractAddress: raidD.address }], kp.privateKey, kp.publicKey, sig.replace("0x", ""), [raidD.address], A.address, start, 1));
  console.log("this strike's sealed damage =", out[dmgH]);
  const bandH = ev.args.bandHandle;
  const pd = await retry(() => fhe.publicDecrypt([bandH]));
  console.log("health band =", pd.clearValues[bandH], "/ 10");
}
main().catch((e) => { console.error(e); process.exit(1); });
