/**
 * Off-chain balance simulator for CHIMERA genetics.
 * Mirrors ChimeraLab.sol exactly: genesis allele = min(rand4, rand4),
 * Mendel inheritance, mutation (allele from parent A) with probability MUT/256.
 *
 * Run: npx ts-node scripts/simulate.ts
 */
type Genome = number[]; // 8 loci, each [hi:4][lo:4]

const LOCI = 8;
const VISIBLE = 7;
const r4 = () => Math.floor(Math.random() * 16);
const r8 = () => Math.floor(Math.random() * 256);
const hi = (l: number) => l >> 4;
const lo = (l: number) => l & 15;
const expressed = (l: number) => Math.min(hi(l), lo(l));

const GENESIS_MODE = (process.env.GENESIS ?? "uniform") as "uniform" | "min2";
const allele0 = () => (GENESIS_MODE === "min2" ? Math.min(r4(), r4()) : r4());
function genesis(): Genome {
  return Array.from({ length: LOCI }, () => (allele0() << 4) | allele0());
}

function breed(a: Genome, b: Genome, mut: number): Genome {
  return a.map((la, i) => {
    const lb = b[i];
    let fromA = Math.random() < 0.5 ? hi(la) : lo(la);
    const fromB = Math.random() < 0.5 ? hi(lb) : lo(lb);
    if (r8() < mut) fromA = r4();
    return (fromA << 4) | fromB;
  });
}

const NEED = Number(process.env.NEED ?? VISIBLE); // how many visible traits must be >= t
const isChimera = (g: Genome, t: number) => g.slice(0, VISIBLE).filter((l) => expressed(l) >= t).length >= NEED;

/** score used by a player to choose parents */
function score(g: Genome, knowsGenotype: boolean, t: number): number {
  let s = 0;
  for (let i = 0; i < VISIBLE; i++) {
    const e = expressed(g[i]);
    if (knowsGenotype) {
      // count rare alleles (both copies), strongly reward expressed rare
      s += (hi(g[i]) >= t ? 1 : 0) + (lo(g[i]) >= t ? 1 : 0) + (e >= t ? 2 : 0);
    } else {
      s += e >= t ? 3 : e / 8;
    }
  }
  return s;
}

/** smart breeder: full genotype knowledge, evaluates every pair in the pool */
const rareFrac = (l: number, t: number) => ((hi(l) >= t ? 1 : 0) + (lo(l) >= t ? 1 : 0)) / 2;
function pairValue(a: Genome, b: Genome, t: number) {
  let sum = 0;
  let prod = 1;
  for (let i = 0; i < VISIBLE; i++) {
    const p = rareFrac(a[i], t) * rareFrac(b[i], t);
    sum += p;
    prod *= p;
  }
  return NEED < VISIBLE ? sum : sum + 50 * prod;
}
const indivValue = (g: Genome, t: number) => g.slice(0, VISIBLE).reduce((s, l) => s + rareFrac(l, t) + (expressed(l) >= t ? 0.5 : 0), 0);

function playSmart(opts: { start: number; mut: number; t: number; maxBreeds: number; pool: number }) {
  let pop: Genome[] = Array.from({ length: opts.start }, genesis);
  for (let n = 1; n <= opts.maxBreeds; n++) {
    let best = [0, 1];
    let bestV = -1;
    for (let i = 0; i < pop.length; i++)
      for (let j = i + 1; j < pop.length; j++) {
        const v = pairValue(pop[i], pop[j], opts.t) + Math.random() * 0.01;
        if (v > bestV) [bestV, best] = [v, [i, j]];
      }
    const c = breed(pop[best[0]], pop[best[1]], opts.mut);
    if (isChimera(c, opts.t)) return n;
    pop.push(c);
    if (pop.length > opts.pool) {
      pop.sort((x, y) => indivValue(y, opts.t) - indivValue(x, opts.t));
      pop = pop.slice(0, opts.pool);
    }
  }
  return Infinity;
}

function playToChimera(opts: { start: number; mut: number; t: number; knows: boolean; maxBreeds: number; pool: number }) {
  let pop: Genome[] = Array.from({ length: opts.start }, genesis);
  for (let n = 1; n <= opts.maxBreeds; n++) {
    pop.sort((x, y) => score(y, opts.knows, opts.t) - score(x, opts.knows, opts.t));
    const a = pop[0];
    const b = pop[1 + Math.floor(Math.random() * Math.min(2, pop.length - 1))];
    const c = breed(a, b, opts.mut);
    if (isChimera(c, opts.t)) return n;
    pop.push(c);
    if (pop.length > opts.pool) {
      pop.sort((x, y) => score(y, opts.knows, opts.t) - score(x, opts.knows, opts.t));
      pop = pop.slice(0, opts.pool);
    }
  }
  return Infinity;
}

function stats(xs: number[]) {
  const ok = xs.filter((x) => x !== Infinity).sort((a, b) => a - b);
  const q = (p: number) => (ok.length ? ok[Math.floor(p * (ok.length - 1))] : NaN);
  return { success: `${((100 * ok.length) / xs.length).toFixed(1)}%`, p25: q(0.25), median: q(0.5), p75: q(0.75) };
}

// ── 1. genesis rarity distribution ──
const N = 200_000;
const tierCounts = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
let carriers = 0;
for (let i = 0; i < N; i++) {
  const g = genesis();
  const e = expressed(g[0]);
  if (e <= 7) tierCounts.common++;
  else if (e <= 11) tierCounts.uncommon++;
  else if (e <= 14) tierCounts.rare++;
  else tierCounts.mythic++;
  if (e < 12 && (hi(g[0]) >= 12 || lo(g[0]) >= 12)) carriers++;
}
console.log("\n1) Genesis — expressed tier of one trait");
for (const [k, v] of Object.entries(tierCounts)) console.log(`   ${k.padEnd(9)} ${((100 * v) / N).toFixed(2)}%`);
console.log(`   hidden rare carrier (looks normal, carries rare allele): ${((100 * carriers) / N).toFixed(2)}%`);

// ── 2. breeds needed to reach a Chimera ──
console.log("\n2) Breeds to first Chimera (max 400 breeds, 400 runs each)");
const configs = process.env.QUICK ? [
  { label: "t=12 mut=4  phenotype-only 3 genesis", start: 3, mut: 4, t: 12, knows: false },
  { label: "t=12 mut=4  sequencing     3 genesis", start: 3, mut: 4, t: 12, knows: true },
  { label: "t=12 mut=8  phenotype-only 3 genesis", start: 3, mut: 8, t: 12, knows: false },
  { label: "t=12 mut=8  sequencing     3 genesis", start: 3, mut: 8, t: 12, knows: true },
  { label: "t=12 mut=8  sequencing    12 creatures", start: 12, mut: 8, t: 12, knows: true },
] : [
  { label: "t=12 mut=4  phenotype-only 3 genesis", start: 3, mut: 4, t: 12, knows: false },
  { label: "t=12 mut=4  sequencing     3 genesis", start: 3, mut: 4, t: 12, knows: true },
  { label: "t=12 mut=4  sequencing    12 creatures", start: 12, mut: 4, t: 12, knows: true },
  { label: "t=12 mut=8  sequencing     3 genesis", start: 3, mut: 8, t: 12, knows: true },
  { label: "t=12 mut=8  sequencing    12 creatures", start: 12, mut: 8, t: 12, knows: true },
  { label: "t=12 mut=16 sequencing     3 genesis", start: 3, mut: 16, t: 12, knows: true },
  { label: "t=12 mut=16 phenotype-only 3 genesis", start: 3, mut: 16, t: 12, knows: false },
];
for (const c of configs) {
  const runs = Array.from({ length: 400 }, () => playToChimera({ ...c, maxBreeds: 400, pool: 16 }));
  const s = stats(runs);
  console.log(`   ${c.label.padEnd(40)} success ${s.success.padStart(6)}  p25 ${s.p25}  median ${s.median}  p75 ${s.p75}`);
}

const T = Number(process.env.T ?? 12);
console.log("\n3) Smart breeder (evaluates all pairs, full genotype knowledge)");
for (const c of [
  { label: "mut=4   3 creatures", start: 3, mut: 4, t: T },
  { label: "mut=4   6 creatures", start: 6, mut: 4, t: T },
  { label: "mut=4  12 creatures", start: 12, mut: 4, t: T },
  { label: "mut=8   3 creatures", start: 3, mut: 8, t: T },
  { label: "mut=8   6 creatures", start: 6, mut: 8, t: T },
  { label: "mut=8  12 creatures", start: 12, mut: 8, t: T },
]) {
  const runs = Array.from({ length: 300 }, () => playSmart({ ...c, maxBreeds: 400, pool: 16 }));
  const s = stats(runs);
  console.log(`   ${c.label.padEnd(40)} success ${s.success.padStart(6)}  p25 ${s.p25}  median ${s.median}  p75 ${s.p75}`);
}
