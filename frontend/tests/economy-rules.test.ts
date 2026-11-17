import { expect, test } from 'bun:test'
import { breedingAccess, dailyRewardBudget, reserveScenario } from '../src/chimera/game/economy-rules'

test('only verified world rules authorize breeding; an old world never pretends to require charges', () => {
  expect(breedingAccess().blocker).not.toBeNull()
  expect(breedingAccess(undefined, true).blocker).not.toBeNull()
  expect(breedingAccess({ version: 1 })).toEqual({ blocker: null, charge: null })
  const rules = { version: 2 as const, charges: 0n, introUsed: false, population: 3n, limit: 10n, altarReady: true }
  expect(breedingAccess(rules)).toEqual({ blocker: null, charge: 0 })
  expect(breedingAccess({ ...rules, introUsed: true }).blocker).not.toBeNull()
  expect(breedingAccess({ ...rules, introUsed: true, charges: 1n })).toEqual({ blocker: null, charge: 1 })
  expect(breedingAccess({ ...rules, population: 10n }).blocker).not.toBeNull()
})

test('a year without deposits cannot create money or overdraw the reserve', () => {
  expect(dailyRewardBudget(0n)).toBe(0n)
  expect(dailyRewardBudget(10_000_000_000n)).toBe(100_000_000n)
  expect(dailyRewardBudget(1_000_000_000_000n)).toBe(3_000_000_000n)
  for (const seed of [0n, 99n, 100n, 300_000_000_000n]) {
    const result = reserveScenario(seed, 0n, 365)
    expect(result.reserve).toBeGreaterThanOrEqual(0n)
    expect(result.reserve + result.paid).toBe(seed)
  }
})

test('fee replenishment is accounted as circulation and never as an assumed token burn', () => {
  const result = reserveScenario(300_000_000_000n, 500_000_000n, 90)
  expect(result.reserve + result.paid).toBe(300_000_000_000n + result.inflow)
  expect(() => dailyRewardBudget(-1n)).toThrow()
  expect(() => reserveScenario(1n, 0n, -1)).toThrow()
})
