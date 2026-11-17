// Reserve-aware expedition loot. Reads the Treasury's publicly decryptable reserve, picks a loot
// factor by a public rule, and rescales the three expedition loot tables (never above launch values).
//   ≥ 50% of the 300,000 cZAMA seed → 1×   ·   25–50% → ¾×   ·   < 25% → ½×
// npx hardhat run scripts/rebalance-loot.ts --network sepolia      (DRY=1 to only print)
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import { deployments, ethers } from "hardhat";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fee = { maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 10_000_000n };
const SEED = 300_000n * 1_000_000n;
// Launch tables (the ceiling): duration, difficulty, element, lootBase, lootRoll, consolation
const LAUNCH = [
  { duration: 600, difficulty: 60, element: 0, lootBase: 3_000_000n, lootRoll: 1n << 22n, consolation: 500_000n },
  { duration: 1800, difficulty: 95, element: 1, lootBase: 8_000_000n, lootRoll: 1n << 23n, consolation: 1_000_000n },
  { duration: 3600, difficulty: 130, element: 2, lootBase: 20_000_000n, lootRoll: 1n << 25n, consolation: 2_000_000n },
];

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
  const [owner] = await ethers.getSigners();
  const tdep = await deployments.get("ChimeraTreasury");
  const edep = await deployments.get("ChimeraExpeditions");
  const treasury = new ethers.Contract(tdep.address, tdep.abi, owner);
  const exp = new ethers.Contract(edep.address, edep.abi, owner);

  let h: string = await treasury.reserveHandle();
  if (/^0x0+$/.test(h)) {
    await (await treasury.publishReserve(fee)).wait();
    h = await treasury.reserveHandle();
  }
  const fhe = await retry(() => createInstance({ ...SepoliaConfig, network: RPC }), 20);
  const pd = await retry(() => fhe.publicDecrypt([h]), 20);
  const reserve = BigInt(Object.values(pd.clearValues)[0] as bigint);
  const pct = Number((reserve * 1000n) / SEED) / 10;
  const num = pct >= 50 ? 4n : pct >= 25 ? 3n : 2n;
  console.log(`reserve ${Number(reserve) / 1e6} cZAMA = ${pct}% of seed → loot ${num}/4`);

  for (let z = 0; z < 3; z++) {
    const L = LAUNCH[z];
    const want = {
      ...L,
      lootBase: (L.lootBase * num) / 4n,
      lootRoll: num === 4n ? L.lootRoll : L.lootRoll / 2n,
      consolation: (L.consolation * num) / 4n,
    };
    const cur = await exp.getZone(z);
    const same = cur.lootBase === want.lootBase && cur.lootRoll === want.lootRoll && cur.consolation === want.consolation;
    console.log(`zone ${z}: ${cur.lootBase}/${cur.lootRoll}/${cur.consolation} → ${want.lootBase}/${want.lootRoll}/${want.consolation}${same ? " (unchanged)" : ""}`);
    if (same || process.env.DRY) continue;
    // keep the live duration/difficulty/element, only touch loot
    const z2 = { duration: cur.duration, difficulty: cur.difficulty, element: cur.element, lootBase: want.lootBase, lootRoll: want.lootRoll, consolation: want.consolation };
    const r = await (await exp.setZone(z, z2, fee)).wait();
    console.log(`  set ${r!.hash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
