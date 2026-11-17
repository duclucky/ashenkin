export const LOCI = [
  { key: 'body', name: 'Body', stat: 'Vitality', blurb: 'Silhouette and mass' },
  { key: 'pattern', name: 'Pattern', stat: null, blurb: 'Markings on the skin' },
  { key: 'hue', name: 'Pigment', stat: null, blurb: 'Colour of the flesh' },
  { key: 'eyes', name: 'Eyes', stat: 'Accuracy', blurb: 'Count and shape of eyes' },
  { key: 'crest', name: 'Crest', stat: 'Attack', blurb: 'Horns, antennae, crowns' },
  { key: 'limbs', name: 'Limbs', stat: 'Agility', blurb: 'Fins, tentacles, wings' },
  { key: 'aura', name: 'Aura', stat: 'Spirit', blurb: 'Light it gives off' },
  { key: 'element', name: 'Element', stat: 'Affinity', blurb: 'Private — only the keeper sees it' },
] as const

export const COMBAT_LOCI = [0, 3, 4, 5, 6]
export const RARE = 12
export const CHIMERA_TRAITS = 5

export type Tier = 0 | 1 | 2 | 3
export const tierOf = (v: number): Tier => (v >= 15 ? 3 : v >= 12 ? 2 : v >= 8 ? 1 : 0)
export const TIERS = [
  { name: 'Common', color: '#D9D4C3', glow: 'rgba(17,17,17,0.08)', ink: '#5c5a52', on: '#111111' },
  { name: 'Uncommon', color: '#3DDC97', glow: 'rgba(61,220,151,0.25)', ink: '#0f8a56', on: '#111111' },
  { name: 'Rare', color: '#8B5CF6', glow: 'rgba(139,92,246,0.25)', ink: '#6a35e8', on: '#ffffff' },
  { name: 'Mythic', color: '#FFDD00', glow: 'rgba(255,221,0,0.35)', ink: '#a67c00', on: '#111111' },
] as const

/** Element type used by the arena: 0 Ember, 1 Spore, 2 Tide, 3 Void (expressed allele 15). */
export const elementOf = (expressed: number) => (expressed === 15 ? 3 : expressed % 3)
export const ELEMENTS = [
  { name: 'Ember', color: '#FF7020', ink: '#d14f00', beats: 'Spore', glyph: 'ember' },
  { name: 'Spore', color: '#3DDC97', ink: '#0f8a56', beats: 'Tide', glyph: 'spore' },
  { name: 'Tide', color: '#2B50F5', ink: '#2B50F5', beats: 'Ember', glyph: 'tide' },
  { name: 'Void', color: '#8B5CF6', ink: '#6a35e8', beats: 'nothing — and nothing beats it', glyph: 'void' },
] as const

export const hiAllele = (locus: number) => locus >> 4
export const loAllele = (locus: number) => locus & 15

export function rareCount(traits: number[]) {
  return traits.slice(0, 7).filter((v) => v >= RARE).length
}

/** Species name — deterministic from the phenotype, so everyone sees the same name. */
const SYL_A = ['Ash', 'Bryo', 'Cael', 'Drev', 'Eon', 'Fen', 'Gal', 'Hex', 'Iri', 'Jun', 'Kel', 'Lum', 'Myr', 'Nox', 'Ori', 'Pyr']
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'yo', 'ei', 'au', 'ou', 'ya', 'io', 'ue', 'oa', 'ai']
const SYL_C = ['th', 'ra', 'lis', 'mon', 'dra', 'vex', 'rin', 'sel', 'kor', 'phis', 'tal', 'quen', 'zar', 'nyx', 'lume', 'thar']
export function speciesName(traits: number[]) {
  const [b, p, h, e, c, l, a] = traits
  const first = SYL_A[(b + h) & 15] + SYL_B[(p + e) & 15] + SYL_C[(c + l + a) & 15]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export function rarityScore(traits: number[]) {
  return traits.slice(0, 7).reduce((s, v) => s + v, 0)
}

/* ───────────────────────── breeding odds ───────────────────────── */

export const MUTATION_P = 8 / 256

/** Distribution (16 entries) of the allele a parent passes on at one locus.
 *  Known locus → exact 50/50 between the two alleles.
 *  Only the expressed value v known → posterior assuming uniform genesis alleles. */
export function passedAllele(expressed: number, locus?: number): number[] {
  const d = new Array(16).fill(0)
  if (locus != null) {
    d[hiAllele(locus)] += 0.5
    d[loAllele(locus)] += 0.5
    return d
  }
  const v = expressed
  const pairs = 2 * (15 - v) + 1
  d[v] = (16 - v) / pairs
  for (let u = v + 1; u < 16; u++) d[u] = 1 / pairs
  return d
}

/** Distribution of the child's expressed value at one locus (A's allele may mutate). */
export function childExpressed(fromA: number[], fromB: number[]): number[] {
  const a = fromA.map((p) => p * (1 - MUTATION_P) + MUTATION_P / 16)
  const out = new Array(16).fill(0)
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) out[Math.min(x, y)] += a[x] * fromB[y]
  return out
}

export const pAtLeast = (dist: number[], t: number) => dist.slice(t).reduce((s, p) => s + p, 0)

/** P(at least k of the given independent events). */
export function pAtLeastK(ps: number[], k: number) {
  let dp = [1]
  for (const p of ps) {
    const nx = new Array(dp.length + 1).fill(0)
    dp.forEach((v, i) => {
      nx[i] += v * (1 - p)
      nx[i + 1] += v * p
    })
    dp = nx
  }
  return dp.slice(k).reduce((s, v) => s + v, 0)
}

export const pct = (p: number) => (p >= 0.995 ? '>99%' : p < 0.005 ? (p > 0 ? '<1%' : '0%') : `${Math.round(p * 100)}%`)
