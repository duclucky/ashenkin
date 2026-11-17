export type CampaignSpecimen = { id: number; owner: string; info: { generation: number; parentA: number; parentB: number; sequencedMask: number; certified: boolean } }
export type CampaignInput = { account: string | null; specimens?: readonly CampaignSpecimen[]; settledFights?: number; crests?: Record<number, number | undefined> }
export type CampaignEvidence = { done: boolean | null; specimen: number | null; count: number | null }
export type CampaignProgress = Record<'own' | 'fight' | 'read' | 'pair' | 'bred' | 'crest', CampaignEvidence>

/** Current Sepolia evidence only. A local click cannot complete an objective. */
export function campaignProgress(input: CampaignInput): CampaignProgress {
  const unknown = () => ({ done: null, specimen: null, count: null })
  const progress: CampaignProgress = { own: unknown(), fight: unknown(), read: unknown(), pair: unknown(), bred: unknown(), crest: unknown() }
  if (!input.account) return progress
  if (Number.isSafeInteger(input.settledFights) && input.settledFights! >= 0) progress.fight = { done: input.settledFights! > 0, specimen: null, count: input.settledFights! }
  if (!input.specimens) return progress
  const unique = new Map<number, CampaignSpecimen>()
  for (const specimen of input.specimens) {
    if (Number.isSafeInteger(specimen.id) && specimen.id > 0 && specimen.owner.toLowerCase() === input.account.toLowerCase()) unique.set(specimen.id, specimen)
  }
  const owned = [...unique.values()].sort((a, b) => a.id - b.id)
  const first = owned[0]?.id ?? null
  const read = owned.filter(({ info }) => info.certified || Number.isInteger(info.sequencedMask) && info.sequencedMask > 0 && info.sequencedMask <= 255)
  const bred = owned.filter(({ id, info }) => Number.isSafeInteger(info.generation) && info.generation >= 1 && Number.isSafeInteger(info.parentA) && Number.isSafeInteger(info.parentB) && info.parentA > 0 && info.parentB > 0 && info.parentA < id && info.parentB < id && info.parentA !== info.parentB)
  const validCrest = (id: number) => Number.isInteger(input.crests?.[id]) && input.crests![id]! >= 0 && input.crests![id]! <= 15
  const restored = bred.filter(child => validCrest(child.id) && input.crests![child.id]! >= 12)
  progress.own = { done: owned.length > 0, specimen: first, count: owned.length }
  progress.read = { done: read.length > 0, specimen: read[0]?.id ?? first, count: read.length }
  progress.pair = { done: owned.length >= 2, specimen: first, count: owned.length }
  progress.bred = { done: bred.length > 0, specimen: bred[0]?.id ?? null, count: bred.length }
  progress.crest = { done: restored.length > 0 ? true : bred.every(child => validCrest(child.id)) ? false : null, specimen: restored[0]?.id ?? bred[0]?.id ?? null, count: restored.length }
  return progress
}
