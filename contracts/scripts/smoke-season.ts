// Live Sepolia check of the Season of Masks contracts with the real relayer + KMS:
// open a Relic Cache, fight a Blind Tactics wild hunt, send one sealed riddle guess.
// npx hardhat run scripts/smoke-season.ts --network sepolia
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import { deployments, ethers } from "hardhat";
import fs from "fs";
import path from "path";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const STEPS = (process.env.STEPS ?? "relic,fight,riddle").split(",");

async function retry<T>(f: () => Promise<T>, n = 15): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= n) throw e;
      await sleep(4000 + i * 2000);
    }
  }
}

async function main() {
  const pk = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tmp", "e2e-wallet.json"), "utf8")).pk;
  const A = new ethers.Wallet(pk, ethers.provider);
  console.log("keeper", A.address, ethers.formatEther(await ethers.provider.getBalance(A.address)), "ETH");
  const d = async (n: string) => {
    const x = await deployments.get(n);
    return new ethers.Contract(x.address, x.abi, A);
  };
  const [lab, relics, col, oracle] = await Promise.all(["ChimeraLab", "ChimeraRelics", "ChimeraColosseum", "ChimeraOracle"].map(d));
  const token = new ethers.Contract(await lab.token(), ["function setOperator(address,uint48)", "function isOperator(address,address) view returns (bool)"], A);
  const until = Math.floor(Date.now() / 1000) + 30 * 86400;
  for (const c of [relics, col, oracle]) {
    const a = await c.getAddress();
    if (!(await token.isOperator(A.address, a))) await (await token.setOperator(a, until, fee)).wait();
  }

  const fhe = await retry(() => createInstance({ ...SepoliaConfig, network: RPC }), 20);
  const kp = fhe.generateKeypair();
  const start = Math.floor(Date.now() / 1000);
  const contracts = await Promise.all([relics, col, oracle].map((c) => c.getAddress()));
  const eip = fhe.createEIP712(kp.publicKey, contracts, start, 1);
  const sig = await A.signTypedData(eip.domain, { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification }, eip.message);
  const udec = (pairs: { handle: string; contractAddress: string }[]) =>
    retry(() => fhe.userDecrypt(pairs, kp.privateKey, kp.publicKey, sig.replace("0x", ""), contracts, A.address, start, 1));
  const parse = (c: ethers.Contract, r: ethers.TransactionReceipt, name: string) =>
    r.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === name)!;

  if (STEPS.includes("relic")) {
    const r = await (await relics.openCache(fee)).wait();
    const ev = parse(relics, r, "CacheOpened");
    const out = await udec([
      { handle: ev.args.tierHandle, contractAddress: contracts[0] },
      { handle: ev.args.powerHandle, contractAddress: contracts[0] },
    ]);
    console.log(`relic #${ev.args.relicId}: tier ${out[ev.args.tierHandle]} power +${out[ev.args.powerHandle]}  gas ${r.gasUsed} ${r.hash}`);
  }

  if (STEPS.includes("fight")) {
    const n = Number(await lab.balanceOf(A.address));
    let id: bigint | undefined;
    for (let i = 0; i < n && id === undefined; i++) {
      const c = await lab.tokenOfOwnerByIndex(A.address, i);
      if (Number(await col.readyAt(c)) <= Math.floor(Date.now() / 1000)) id = c;
    }
    if (id === undefined) throw new Error("no ready creature");
    const plan = 0 | (1 << 2) | (2 << 4); // Strike, Guard, Feint
    const enc = await retry(() => fhe.createEncryptedInput(contracts[1], A.address).add8(plan).encrypt());
    const r = await (await col.explore(id, enc.handles[0], enc.inputProof, fee)).wait();
    const ev = parse(col, r, "BattleStarted");
    const hs: string[] = [...ev.args.roundHandles];
    console.log(`battle #${ev.args.battleId} creature ${id} vs wild ${ev.args.opponentId}  gas ${r.gasUsed} ${r.hash}`);
    const pd = await retry(() => fhe.publicDecrypt(hs), 30);
    const bits = hs.map((h) => pd.clearValues[h as `0x${string}`]);
    const s = await (await col.settle(ev.args.battleId, pd.decryptionProof ? pd.abiEncodedClearValues : "0x", pd.decryptionProof, fee)).wait();
    const wp = await col.wildPlanHandle(ev.args.battleId);
    const wild = await udec([{ handle: wp, contractAddress: contracts[1] }]);
    const names = ["Strike", "Guard", "Feint"];
    const w = Number(wild[wp]);
    console.log(`rounds ${bits.join(" / ")} → ${bits.filter(Boolean).length >= 2 ? "WIN" : "loss"}; wild played ${[0, 1, 2].map((i) => names[(w >> (2 * i)) & 3]).join(", ")}  settle gas ${s.gasUsed}`);
  }

  if (STEPS.includes("riddle")) {
    const g = [3, 7, 11, 14];
    const packed = g[0] | (g[1] << 4) | (g[2] << 8) | (g[3] << 12);
    const enc = await retry(() => fhe.createEncryptedInput(contracts[2], A.address).add16(packed).encrypt());
    const r = await (await oracle.guess(enc.handles[0], enc.inputProof, fee)).wait();
    const ev = parse(oracle, r, "Guessed");
    const out = await udec([{ handle: ev.args.feedbackHandle, contractAddress: contracts[2] }]);
    const fb = Number(out[ev.args.feedbackHandle]);
    console.log(`guess #${ev.args.guessId} round ${ev.args.round}: ${g.join("-")} → hints ${[0, 1, 2, 3].map((i) => ["far", "close", "EXACT"][(fb >> (2 * i)) & 3]).join(", ")}  gas ${r.gasUsed}`);
    const ph = await oracle.potHandle();
    const pot = await retry(() => fhe.publicDecrypt([ph]));
    console.log("jackpot", Number(pot.clearValues[ph]) / 1e6, "cZAMA");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
