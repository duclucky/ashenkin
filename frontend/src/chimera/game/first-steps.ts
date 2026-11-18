export type FirstStep =
  'loading' | 'gas' | 'hatch' | 'fight' | 'life' | 'complete' | 'recover'
export type FirstEvidence = {
  owned?: number
  genesis?: number
  fights?: number
  hasGas: boolean | null
  lifeIntroduced?: boolean
}
export function firstStep(e: FirstEvidence): FirstStep {
  if (e.fights != null && e.fights > 0 && e.lifeIntroduced === true)
    return 'complete'
  if (e.owned == null || e.genesis == null) return 'loading'
  if (e.owned === 0 && e.genesis >= 3) return 'recover'
  if (e.owned > 0 && e.fights != null && e.fights > 0)
    return e.lifeIntroduced == null ? 'loading' : 'life'
  if (e.hasGas == null) return 'loading'
  if (!e.hasGas) return 'gas'
  if (e.owned === 0) return 'hatch'
  if (e.fights == null) return 'loading'
  return 'fight'
}
export function firstTarget(step: FirstStep, pending = false) {
  if (step === 'gas') return 'lab/gas'
  if (step === 'hatch' || step === 'loading') return 'lab'
  if (step === 'fight') return pending ? 'arena/log' : 'arena'
  if (step === 'recover') return 'lab'
  return 'life'
}
