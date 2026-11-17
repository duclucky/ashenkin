import { hiAllele, loAllele, MUTATION_P } from '../genetics'

export type GoalParent = { expressed: number; locus?: number }
export type GoalOdds = { min: number; max: number; knownParents: number; certain: boolean }

/** Bounds over possible genotypes, not a guess about a parent's unseen allele. */
export function breedingGoalOdds(a: GoalParent, b: GoalParent, threshold: number): GoalOdds | null {
  if (threshold !== 12 && threshold !== 15) return null
  const left = passingRange(a, threshold), right = passingRange(b, threshold)
  if (!left || !right) return null
  const mutated = (p: number) => p * (1 - MUTATION_P) + MUTATION_P * (16 - threshold) / 16
  const min = mutated(left[0]) * right[0]
  const max = mutated(left[1]) * right[1]
  return { min, max, knownParents: Number(a.locus != null) + Number(b.locus != null), certain: min === max }
}

function passingRange(parent: GoalParent, threshold: number): [number, number] | null {
  const { expressed, locus } = parent
  if (!Number.isInteger(expressed) || expressed < 0 || expressed > 15) return null
  if (locus != null) {
    if (!Number.isInteger(locus) || locus < 0 || locus > 255 || Math.min(hiAllele(locus), loAllele(locus)) !== expressed) return null
    const p = (Number(hiAllele(locus) >= threshold) + Number(loAllele(locus) >= threshold)) / 2
    return [p, p]
  }
  // The expressed allele is min(x,y). The second may equal it or be higher.
  return expressed >= threshold ? [1, 1] : [0, 0.5]
}
