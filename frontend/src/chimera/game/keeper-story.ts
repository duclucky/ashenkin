export type KeeperProgress = {
  connected: boolean
  practiced: boolean
  beaconDone: boolean
  hasGas: boolean | null
  specimens?: number[]
  genesis?: number
  fights?: number
  pendingFight?: boolean
  energy?: number
  sequenced?: boolean
  claimedExpedition?: boolean
  expedition?: 'none' | 'away' | 'ready'
}

export type KeeperChapter = 'prologue' | 'beacon' | 'connect' | 'gas' | 'hatch' | 'fight' | 'settle' | 'sequence' | 'dispatch' | 'away' | 'return' | 'choose' | 'recover' | 'loading'

const PRACTICE_KEY = 'chm:starter-practice'

export function hasPracticed() {
  return localStorage.getItem(PRACTICE_KEY) === 'done'
}

export function finishStarterPractice() {
  localStorage.setItem(PRACTICE_KEY, 'done')
}

export function keeperGuideEnabled() {
  return localStorage.getItem('chm:guide') !== 'off'
}

export function keeperChapter(progress: KeeperProgress): KeeperChapter {
  if (!progress.connected) {
    if (!progress.practiced) return 'prologue'
    return progress.beaconDone ? 'connect' : 'beacon'
  }
  const newKeeper = progress.genesis === 0 && progress.specimens?.length === 0 && progress.fights === 0 && progress.expedition === 'none' && !progress.pendingFight
  if (newKeeper && !progress.practiced) return 'prologue'
  if (newKeeper && !progress.beaconDone) return 'beacon'
  if (newKeeper && progress.hasGas == null) return 'loading'
  if (progress.hasGas === false) return 'gas'
  if (progress.pendingFight) return 'settle'
  if (progress.expedition === 'ready') return 'return'
  if (!progress.specimens || progress.genesis == null || progress.fights == null) return 'loading'
  if (!progress.specimens.length) {
    if (progress.expedition === 'away') return 'away'
    return progress.genesis < 3 ? 'hatch' : 'recover'
  }
  if (progress.fights === 0) return 'fight'
  if (progress.claimedExpedition) return 'choose'
  if (progress.expedition === 'away') return 'away'
  if (progress.expedition == null || progress.sequenced == null) return 'loading'
  if (!progress.sequenced && (progress.energy ?? 0) > 0) return 'sequence'
  return 'dispatch'
}
