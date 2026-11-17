// NPC keepers: a few bot wallets that live in the world so a new player never walks into an empty
// Colosseum. Each tick every NPC does 1–2 ordinary player moves (hunt, defend, relic, riddle, boss,
// expedition). Keys live in tmp/npc-wallets.json (git-ignored) and are never printed.
//   NPCS=2 npx hardhat run scripts/npc-keepers.ts --network sepolia            (one tick)
//   LOOP=1 NPCS=2 nohup npx hardhat run scripts/npc-keepers.ts --network sepolia > tmp/npc.log 2>&1 &
// Funding: NPCs below MIN_ETH are topped up from tmp/e2e-wallet.json (FUNDER) to TOP_ETH.
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import { deployments, ethers } from "hardhat";
import fs from "fs";
import path from "path";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const N = Number(process.env.NPCS ?? 2);
const MIN_ETH = ethers.parseEther(process.env.MIN_ETH ?? "0.002");
const TOP_ETH = ethers.parseEther(process.env.TOP_ETH ?? "0.007");
const ZAMA = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57";
const TMP = path.join(__dirname, "..", "tmp");
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const now = () => Math.floor(Date.now() / 1000);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

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

function wallets(): ethers.Wallet[] {
  const f = path.join(TMP, "npc-wallets.json");
  let pks: string[] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
  while (pks.length < N) pks.push(ethers.Wallet.createRandom().privateKey);
  fs.writeFileSync(f, JSON.stringify(pks), { mode: 0o600 });
  return pks.slice(0, N).map((pk) => new ethers.Wallet(pk, ethers.provider));
}

async function main() {
  const npcs = wallets();
  const funderPk = JSON.parse(fs.readFileSync(path.join(TMP, "e2e-wallet.json"), "utf8")).pk;
  const funder = new ethers.Wallet(funderPk, ethers.provider);
  const fhe = await retry(() => createInstance({ ...SepoliaConfig, network: RPC }), 20);
  const dep = async (n: string) => deployments.get(n);
  const D = Object.fromEntries(
    await Promise.all(["ChimeraLab", "ChimeraColosseum", "ChimeraRelics", "ChimeraOracle", "ChimeraRaid", "ChimeraExpeditions", "ChimeraSeason", "ChimeraRaffle", "ChimeraDepths"].map(async (n) => [n, await dep(n)])),
  );

  do {
    for (const [i, w] of npcs.entries()) {
      try {
        await tick(i, w);
      } catch (e: any) {
        log(`npc${i}`, "tick failed:", e.shortMessage ?? e.message?.slice(0, 160));
      }
    }
    if (process.env.LOOP) {
      const m = 20 + Math.floor(Math.random() * 25);
      log(`sleeping ${m} min`);
      await sleep(m * 60_000);
    }
  } while (process.env.LOOP);

  async function tick(i: number, w: ethers.Wallet) {
    const tag = `npc${i} ${w.address.slice(0, 8)}`;
    const c = (n: string) => new ethers.Contract(D[n].address, D[n].abi, w);
    const lab = c("ChimeraLab"), col = c("ChimeraColosseum"), relics = c("ChimeraRelics"), oracle = c("ChimeraOracle"), raid = c("ChimeraRaid"), exp = c("ChimeraExpeditions");
    const parse = (k: ethers.Contract, r: ethers.TransactionReceipt, name: string) =>
      r.logs.map((l) => { try { return k.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === name);
    const send = async (label: string, p: () => Promise<ethers.ContractTransactionResponse>) => {
      let tx: ethers.ContractTransactionResponse;
      try {
        tx = await p();
      } catch (e: any) {
        if (!/nonce|underpriced/i.test(String(e.shortMessage ?? e.message))) throw e;
        await sleep(6000);
        tx = await p();
      }
      const r = (await tx.wait())!;
      log(tag, label, r.hash.slice(0, 12));
      return r;
    };

    // ── gas ──
    const bal = await ethers.provider.getBalance(w.address);
    if (bal < MIN_ETH) {
      const fb = await ethers.provider.getBalance(funder.address);
      if (fb < TOP_ETH + ethers.parseEther("0.003")) return log(tag, "low gas and funder is low too; skipping");
      await (await funder.sendTransaction({ to: w.address, value: TOP_ETH - bal, ...fee })).wait();
      log(tag, `topped up to ${ethers.formatEther(TOP_ETH)} ETH`);
    }

    // ── setup: cZAMA, operators, creatures ──
    const token = new ethers.Contract(await lab.token(), ["function setOperator(address,uint48)", "function isOperator(address,address) view returns (bool)", "function confidentialBalanceOf(address) view returns (bytes32)", "function wrap(address,uint256)"], w);
    if (/^0x0+$/.test(await token.confidentialBalanceOf(w.address))) {
      const zama = new ethers.Contract(ZAMA, ["function mint(address,uint256)", "function approve(address,uint256) returns (bool)"], w);
      const amt = 400n * 10n ** 18n;
      await send("mint ZAMA", () => zama.mint(w.address, amt, fee));
      await send("approve", async () => zama.approve(await token.getAddress(), amt, fee));
      await send("wrap 400 cZAMA", () => token.wrap(w.address, amt, fee));
    }
    const until = now() + 60 * 86400;
    for (const k of [col, relics, oracle]) {
      const a = await k.getAddress();
      if (!(await token.isOperator(w.address, a))) await send(`operator ${a.slice(0, 8)}`, () => token.setOperator(a, until, fee));
    }
    let n = Number(await lab.balanceOf(w.address));
    if (n < 2 && Number(await lab.genesisClaimed(w.address)) < 3) {
      await send("hatch", () => lab.hatchGenesis(fee));
      n++;
    }
    const ids: bigint[] = [];
    for (let k = 0; k < n; k++) ids.push(await lab.tokenOfOwnerByIndex(w.address, k));
    if (!ids.length) return log(tag, "no creatures");

    // finish anything left open: expeditions that came back
    const exps: bigint[] = await exp.expeditionsOf(w.address);
    for (const id of exps.slice(-4)) {
      const [e] = await exp.getExpedition(id);
      if (!e.claimed && Number(e.endsAt) <= now()) await send(`expedition #${id} home`, () => exp.claim(id, fee));
    }

    const ready = async (id: bigint) => Number(await col.readyAt(id)) <= now();
    const plan = () => pick([0, 1, 2]) | (pick([0, 1, 2]) << 2) | (pick([0, 1, 2]) << 4);
    const colAddr = await col.getAddress();

    const moves: Record<string, () => Promise<unknown>> = {
      hunt: async () => {
        const id = (await Promise.all(ids.map(async (x) => ((await ready(x)) ? x : null)))).find((x) => x != null);
        if (id == null) return log(tag, "hunt: nobody ready");
        const enc = await retry(() => fhe.createEncryptedInput(colAddr, w.address).add8(plan()).encrypt());
        const r = await send(`hunt with #${id}`, () => col.explore(id, enc.handles[0], enc.inputProof, fee));
        const ev = parse(col, r, "BattleStarted")!;
        const hs: string[] = [...ev.args.roundHandles];
        const pd = await retry(() => fhe.publicDecrypt(hs), 30);
        await send(`settle #${ev.args.battleId}`, () => col.settle(ev.args.battleId, pd.abiEncodedClearValues, pd.decryptionProof, fee));
      },
      defend: async () => {
        const defs = await Promise.all(ids.map(async (x) => !!(await col.getDefender(x).catch(() => null))?.active));
        const id = ids.find((_, k) => !defs[k]);
        if (id == null || defs.filter(Boolean).length >= 1) return log(tag, "defend: already holding the gate");
        const enc = await retry(() => fhe.createEncryptedInput(colAddr, w.address).add64(5_000_000n).add8(plan()).encrypt());
        await send(`defend with #${id}`, () => col.registerDefender(id, enc.handles[0], enc.handles[1], enc.inputProof, fee));
      },
      relic: async () => {
        const have = ((await relics.relicsOf(w.address)) as bigint[]).length;
        if (have >= 3) return log(tag, "relic: bag is full enough");
        await send("open relic cache", () => relics.openCache(fee));
      },
      riddle: async () => {
        const left = Number(await oracle.guessesLeft(w.address));
        if (!left) return log(tag, "riddle: out of guesses today");
        const g = [0, 1, 2, 3].map(() => Math.floor(Math.random() * 16));
        const packed = g[0] | (g[1] << 4) | (g[2] << 8) | (g[3] << 12);
        const oAddr = await oracle.getAddress();
        const enc = await retry(() => fhe.createEncryptedInput(oAddr, w.address).add16(packed).encrypt());
        await send("riddle guess", () => oracle.guess(enc.handles[0], enc.inputProof, fee));
      },
      boss: async () => {
        const rr = await Promise.all(ids.map(async (x) => Number(await raid.readyAt(x)) <= now()));
        const id = ids.find((_, k) => rr[k]);
        if (id == null) return log(tag, "boss: on cooldown");
        const r = await send(`strike boss with #${id}`, () => raid.strike(id, fee));
        const ev = parse(raid, r, "Struck")!;
        const pd = await retry(() => fhe.publicDecrypt([ev.args.killingHandle]), 12);
        if (Object.values(pd.clearValues)[0] === true) await send("killing blow!", () => raid.finalizeKill(ev.args.strikeId, pd.abiEncodedClearValues, pd.decryptionProof, fee));
      },
      expedition: async () => {
        if (ids.length < 2) return log(tag, "expedition: keep the only creature home");
        const labAddr = await exp.getAddress();
        if (!(await lab.isApprovedForAll(w.address, labAddr))) await send("approve camp", () => lab.setApprovalForAll(labAddr, true, fee));
        await send(`expedition #${ids[ids.length - 1]}`, () => exp.start(ids[ids.length - 1], pick([0, 0, 1]), fee));
      },
    };
    const planList = [pick(["hunt", "hunt", "defend", "riddle", "boss"]), pick(["relic", "riddle", "expedition", "hunt", "boss"])];
    for (const m of [...new Set(planList)]) {
      try {
        log(tag, `-> ${m}`);
        await moves[m]();
      } catch (e: any) {
        log(tag, m, "failed:", e.shortMessage ?? e.reason ?? e.message?.slice(0, 160));
      }
    }

    // ── season thrones: join, then climb to the best seat the score allows ──
    try {
      const season = c("ChimeraSeason");
      const cur = Number(await season.season());
      if (Number((await season.baseOf(w.address))[0]) !== cur && Date.now() / 1000 < Number(await season.endsAt())) await send(`join season ${cur}`, () => season.join(fee));
      const score = Number(await season.scoreOf(w.address));
      const [holders, scores] = await season.getThrones();
      const mine = (holders as string[]).findIndex((h) => h.toLowerCase() === w.address.toLowerCase());
      const seat = [0, 1, 2].find((k) => k < (mine < 0 ? 3 : mine) && score > Number(scores[k]));
      log(tag, `season score ${score}${mine >= 0 ? ` · on seat ${mine}` : ""}`);
      if (seat !== undefined) await send(`took throne ${seat}`, () => season.claimThrone(seat, fee));
      if (Date.now() / 1000 >= Number(await season.endsAt())) await send("closed the season", () => season.endSeason(fee));
    } catch (e: any) {
      log(tag, "season failed:", e.shortMessage ?? e.reason ?? e.message?.slice(0, 160));
    }

    // ── sealed raffle: a few tickets once per round; draw + finalize when the timer is up ──
    try {
      const raffle = c("ChimeraRaffle");
      const rAddr = await raffle.getAddress();
      const rid = Number(await raffle.currentRound());
      let [r] = await raffle.getRound(rid);
      if (!r.drawing && now() < Number(r.endsAt) && !(await raffle.entered(rid, w.address)) && Math.random() < 0.8) {
        if (!(await token.isOperator(w.address, rAddr))) await send("operator raffle", () => token.setOperator(rAddr, until, fee));
        const k = 1 + Math.floor(Math.random() * 6);
        const enc = await retry(() => fhe.createEncryptedInput(rAddr, w.address).add16(k).encrypt());
        await send(`raffle #${rid}: sealed tickets`, () => raffle.buy(enc.handles[0], enc.inputProof, fee));
      }
      if (!r.drawing && now() >= Number(r.endsAt) && Number(r.entries) > 0) {
        await send(`raffle #${rid}: draw`, () => raffle.draw(fee));
        await sleep(5000);
        [r] = await raffle.getRound(rid);
      }
      if (r.drawing && !r.done) {
        const [, wh, ph] = await raffle.getRound(rid);
        const pd = await retry(() => fhe.publicDecrypt([wh, ph]), 30);
        await send(`raffle #${rid}: finalized, winner ${String(Object.values(pd.clearValues)[0]).slice(0, 8)}`, () => raffle.finalize(pd.abiEncodedClearValues, pd.decryptionProof, fee));
      }
    } catch (e: any) {
      log(tag, "raffle failed:", e.shortMessage ?? e.reason ?? e.message?.slice(0, 160));
    }
    // ── arkhive depths: dive, open a few doors, climb out, prove the depth ──
    try {
      const depths = c("ChimeraDepths");
      const dAddr = await depths.getAddress();
      let active = await depths.activeRun(w.address);
      if (active == 0n && Number(await depths.runsToday(w.address)) < Number(await depths.maxDailyRuns()) && Math.random() < 0.5) {
        if (!(await token.isOperator(w.address, dAddr))) await send("operator depths", () => token.setOperator(dAddr, until, fee));
        const id = pick(ids);
        const r = await send(`depths: dove with #${id}`, () => depths.enter(id, fee));
        active = parse(depths, r, "RunStarted")?.args.runId ?? (await depths.activeRun(w.address));
      }
      if (active != 0n) {
        const target = 2 + (Number(active) % 4); // climbs out after 2..5 floors
        await sleep(4000); // public RPCs lag a block behind
        let cleared = Number((await depths.getRun(active))[0].cleared);
        for (let k = 0; k < 3 && cleared < target && cleared < 10; k++) {
          const door = Math.floor(Math.random() * 3);
          await send(`depths #${active}: floor ${cleared + 1} door ${door + 1}`, () => depths.open(active, door, fee));
          cleared++;
        }
        if (cleared >= target || cleared >= 10) await send(`depths #${active}: climbed out`, () => depths.leave(active, fee));
      }
      const mine: bigint[] = await depths.runsOf(w.address);
      for (const rid of mine.slice(-3)) {
        const [run, , , , , survived] = await depths.getRun(rid);
        if (!run.over || run.recorded) continue;
        if (!run.revealing) { await send(`depths #${rid}: reveal`, () => depths.revealSurvival(rid, fee)); await sleep(5000); }
        const pd = await retry(() => fhe.publicDecrypt([survived]), 30);
        await send(`depths #${rid}: depth proven (${Object.values(pd.clearValues)[0] ? "made it out" : "lost"})`, () => depths.recordDepth(rid, pd.abiEncodedClearValues, pd.decryptionProof, fee));
      }
    } catch (e: any) {
      log(tag, "depths failed:", e.shortMessage ?? e.reason ?? e.message?.slice(0, 160));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
