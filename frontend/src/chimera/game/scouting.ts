/** Only the public Colosseum result is allowed into the scout model. */
export type PublicEncounter = {
  id: number
  kind: 0 | 1
  status: 0 | 1 | 2
  challengerId: number
  opponentId: number
  challenger: string
  opponent: string
  startedAt: number
  rounds: number
  challengerWon: boolean
}

export type ScoutEncounter = { battleId: number; kind: 0 | 1; opponentId: number; startedAt: number; won: boolean; rounds: boolean[] }
export type ScoutReport = { windowSize: number; fights: number; wins: number; losses: number; roundWins: number[]; recent: ScoutEncounter[] }
export const SCOUT_WINDOW = 30

const positiveId = (value: number) => Number.isSafeInteger(value) && value > 0

export function scoutEncounters(specimen: number, battles: readonly PublicEncounter[], keeper?: string): ScoutReport {
  const unique = new Map<number, PublicEncounter>()
  for (const battle of battles) if (positiveId(battle.id) && !unique.has(battle.id)) unique.set(battle.id, battle)
  const window = [...unique.values()].sort((a, b) => b.id - a.id).slice(0, SCOUT_WINDOW)
  const encounters: ScoutEncounter[] = []
  const currentKeeper = keeper?.toLowerCase()

  for (const battle of window) {
    if (!positiveId(specimen) || battle.status !== 2 || (battle.kind !== 0 && battle.kind !== 1)) continue
    if (!positiveId(battle.challengerId) || !positiveId(battle.opponentId) || battle.challengerId === battle.opponentId) continue
    if (!Number.isSafeInteger(battle.startedAt) || battle.startedAt < 0 || !Number.isInteger(battle.rounds) || battle.rounds < 0 || battle.rounds > 7) continue
    const challengerRounds = [0, 1, 2].map(round => !!(battle.rounds & (1 << round)))
    if (typeof battle.challengerWon !== 'boolean' || battle.challengerWon !== (challengerRounds.filter(Boolean).length >= 2)) continue
    const asChallenger = battle.challengerId === specimen
    if (!asChallenger && battle.opponentId !== specimen) continue
    const owner = asChallenger ? battle.challenger : battle.opponent
    if (currentKeeper && (typeof owner !== 'string' || owner.toLowerCase() !== currentKeeper)) continue

    // Explicit projection: never copy ciphertexts, private reads or local plans.
    encounters.push({
      battleId: battle.id,
      kind: battle.kind,
      opponentId: asChallenger ? battle.opponentId : battle.challengerId,
      startedAt: battle.startedAt,
      won: asChallenger ? battle.challengerWon : !battle.challengerWon,
      rounds: challengerRounds.map(won => asChallenger ? won : !won),
    })
  }

  const wins = encounters.filter(row => row.won).length
  return {
    windowSize: window.length,
    fights: encounters.length,
    wins,
    losses: encounters.length - wins,
    roundWins: [0, 1, 2].map(round => encounters.filter(row => row.rounds[round]).length),
    recent: encounters.slice(0, 5),
  }
}
