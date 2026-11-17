export const DAILY_REWARD_CAP = 3_000_000_000n
export function dailyRewardBudget(reserve: bigint) {
  if (reserve < 0n) throw new Error('Reserve cannot be negative')
  const share = reserve / 100n
  return share < DAILY_REWARD_CAP ? share : DAILY_REWARD_CAP
}

export type LineageRules = { version: 1 } | { version: 2; charges: bigint; introUsed: boolean; population: bigint; limit: bigint; altarReady: boolean }
export function breedingAccess(rules?: LineageRules, failed = false) {
  if (failed) return { blocker: 'Could not verify breeding rules', charge: null }
  if (!rules) return { blocker: 'Reading breeding rules…', charge: null }
  if (rules.version === 1) return { blocker: null, charge: null }
  if (rules.population >= rules.limit) return { blocker: 'Population full · offer a spare first', charge: rules.introUsed ? 1 : 0 }
  if (rules.introUsed && rules.charges < 1n) return { blocker: rules.altarReady ? 'Earn a lineage charge at the altar' : 'Lineage altar unavailable', charge: 1 }
  return { blocker: null, charge: rules.introUsed ? 1 : 0 }
}

/** Deterministic stress scenario; payouts use the entire available budget, without new players. */
export function reserveScenario(seed: bigint, dailyFees: bigint, days: number) {
  if (dailyFees < 0n || !Number.isSafeInteger(days) || days < 0 || days > 3650) throw new Error('Invalid scenario')
  let reserve = seed, paid = 0n
  dailyRewardBudget(seed)
  for (let day = 0; day < days; day++) {
    reserve += dailyFees
    const budget = dailyRewardBudget(reserve)
    paid += budget
    reserve -= budget
  }
  return { reserve, paid, inflow: dailyFees * BigInt(days) }
}
