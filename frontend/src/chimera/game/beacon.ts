export type BeaconLead = 'archive' | 'field'
export type BeaconEnding = 'shelter' | 'wayfinding'
export type BeaconRecord = { lead: BeaconLead; scouted?: boolean; ending?: BeaconEnding }
export type BeaconRune = 'paw' | 'lantern' | 'crest'
export type BeaconEvidence = {
  fight: boolean | null
  practiced?: boolean
  genome: boolean | null
  field: 'unread' | 'home' | 'away' | 'returned'
}

export function fieldEvidence(trips?: readonly { zone: number; claimed: boolean }[]): BeaconEvidence['field'] {
  if (!trips) return 'unread'
  if (trips.some(trip => trip.zone === 0 && trip.claimed)) return 'returned'
  return trips.some(trip => trip.zone === 0) ? 'away' : 'home'
}

export function beaconStep(evidence: BeaconEvidence, record: BeaconRecord | null) {
  if (record?.ending) return 'finished'
  if (!evidence.fight && !evidence.practiced) return 'locked'
  if (!record) return 'choose-lead'
  if (record.lead === 'archive' ? evidence.genome : record.scouted || evidence.field === 'returned') return 'relay'
  return record.lead
}

export function beaconRouteMatches(route: readonly BeaconRune[]) {
  return route.length === 3 && route[0] === 'paw' && route[1] === 'lantern' && route[2] === 'crest'
}

export function resolveBeacon(evidence: BeaconEvidence, record: BeaconRecord, route: readonly BeaconRune[], ending: BeaconEnding): BeaconRecord | null {
  if (beaconStep(evidence, record) !== 'relay' || !beaconRouteMatches(route)) return null
  return { ...record, ending }
}

export function beaconScope(chain: number, lab: string, account?: string | null) {
  return `${chain}:${lab.toLowerCase()}:${account?.toLowerCase() ?? 'guest'}`
}

export function loadBeacon(scope: string): BeaconRecord | null {
  try {
    const value = JSON.parse(localStorage.getItem(`chm:beacon:${scope}`) ?? 'null')
    if (value?.lead !== 'archive' && value?.lead !== 'field') return null
    const ending = value.ending === 'shelter' || value.ending === 'wayfinding' ? value.ending : undefined
    const scouted = value.lead === 'field' && value.scouted === true
    return { lead: value.lead, scouted, ending }
  } catch { return null }
}

export function saveBeacon(scope: string, record: BeaconRecord) {
  try { localStorage.setItem(`chm:beacon:${scope}`, JSON.stringify(record)) } catch { /* Current scene remains playable if storage is blocked. */ }
}
