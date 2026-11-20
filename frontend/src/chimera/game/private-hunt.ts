export type HuntEncounter = { id: string; world: string; creatureId: number; targetId: number | null; kind: 'explore' | 'challengeWild'; expires: number }
export function validHuntEncounter(value: unknown, creatureId: number, world: string, now = Date.now()): HuntEncounter {
  const h = value as HuntEncounter | null
  if (!h || typeof h.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(h.id) || h.world !== world || h.creatureId !== creatureId || !Number.isFinite(h.expires) || h.expires <= now
    || !((h.kind === 'explore' && h.targetId === null) || (h.kind === 'challengeWild' && Number.isSafeInteger(h.targetId) && h.targetId! > 0))) {
    throw new Error('The hunt encounter changed. Start a new hunt before signing.')
  }
  return h
}
