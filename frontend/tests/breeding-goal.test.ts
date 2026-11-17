import { expect, test } from 'bun:test'
import { breedingGoalOdds } from '../src/chimera/game/breeding-goal'
import { childExpressed, passedAllele, pAtLeast } from '../src/chimera/genetics'

test('fully read parents use the deployed inheritance and mutation probabilities', () => {
  const odds = breedingGoalOdds({ expressed: 12, locus: 0xcf }, { expressed: 12, locus: 0xfc }, 15)
  expect(odds).toEqual({ min: 0.2431640625, max: 0.2431640625, knownParents: 2, certain: true })
  expect(breedingGoalOdds({ expressed: 12, locus: 0xcf }, { expressed: 12, locus: 0xfc }, 12)?.min).toBe(0.9765625)
})

test('unknown genes are bounded over every consistent genotype without a genesis prior', () => {
  const bounds = breedingGoalOdds({ expressed: 3 }, { expressed: 4 }, 12)!
  expect([bounds.min, bounds.max, bounds.knownParents, bounds.certain]).toEqual([0, 0.24609375, 0, false])
  for (let highA = 3; highA < 16; highA++) for (let highB = 4; highB < 16; highB++) {
    const exact = pAtLeast(childExpressed(passedAllele(3, (3 << 4) | highA), passedAllele(4, (4 << 4) | highB)), 12)
    expect(exact).toBeGreaterThanOrEqual(bounds.min)
    expect(exact).toBeLessThanOrEqual(bounds.max)
  }
})

test('knowledge narrows the interval while visible traits can already determine a threshold probability', () => {
  const unknown = breedingGoalOdds({ expressed: 3 }, { expressed: 4 }, 12)!
  const oneRead = breedingGoalOdds({ expressed: 3, locus: 0x3f }, { expressed: 4 }, 12)!
  const bothRead = breedingGoalOdds({ expressed: 3, locus: 0x3f }, { expressed: 4, locus: 0x44 }, 12)!
  expect(oneRead.knownParents).toBe(1)
  expect(bothRead).toEqual({ min: 0, max: 0, knownParents: 2, certain: true })
  expect(oneRead.min).toBeGreaterThanOrEqual(unknown.min)
  expect(oneRead.max).toBeLessThanOrEqual(unknown.max)
  const visible = breedingGoalOdds({ expressed: 15 }, { expressed: 15 }, 15)!
  expect(visible).toEqual({ min: 0.970703125, max: 0.970703125, knownParents: 0, certain: true })
})

test('swapping parents matters because only the allele from parent A can mutate', () => {
  const common = { expressed: 3, locus: 0x33 }
  const mythic = { expressed: 15, locus: 0xff }
  expect(breedingGoalOdds(common, mythic, 15)?.min).toBe(1 / 512)
  expect(breedingGoalOdds(mythic, common, 15)?.max).toBe(0)
})

test('invalid or contradictory public/private inputs cannot produce a forecast', () => {
  for (const parent of [{ expressed: -1 }, { expressed: 16 }, { expressed: NaN }, { expressed: 3, locus: 256 }, { expressed: 3, locus: 0x44 }]) {
    expect(breedingGoalOdds(parent, { expressed: 4 }, 12)).toBeNull()
  }
  expect(breedingGoalOdds({ expressed: 3 }, { expressed: 4 }, 11)).toBeNull()
})
