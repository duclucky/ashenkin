import { duelOf } from '../season'

type ReportInput = { rounds: unknown; mine?: readonly number[] | null; theirs?: readonly number[] | null }
const knownMove = (value: unknown): number | null => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2 ? value : null

/** Presentation uses confirmed round bits and only moves the viewer actually knows. */
export function buildBattleReport({ rounds, mine, theirs }: ReportInput) {
  if (!Array.isArray(rounds) || rounds.length !== 3 || !rounds.every((round) => typeof round === 'boolean')) return null
  const rows = rounds.map((won: boolean, round: number) => {
    const left = knownMove(mine?.[round])
    const right = knownMove(theirs?.[round])
    return { round: round + 1, won, left, right, edge: left == null || right == null ? null : duelOf(left, right) }
  })
  const wins = rows.filter((row) => row.won).length
  return { rows, wins, losses: 3 - wins }
}
