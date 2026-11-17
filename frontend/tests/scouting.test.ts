import { expect, test } from 'bun:test'
import { scoutEncounters, type PublicEncounter } from '../src/chimera/game/scouting'

const keeper = `0x${'a'.repeat(40)}`
const other = `0x${'b'.repeat(40)}`
const fight = (overrides: Partial<PublicEncounter> = {}): PublicEncounter => ({ id: 1, kind: 1, status: 2, challengerId: 7, opponentId: 11, challenger: keeper, opponent: other, startedAt: 100, rounds: 5, challengerWon: true, ...overrides })

test('scouting flips all three public rounds for the defender', () => {
  const attacker = scoutEncounters(7, [fight()])
  const defender = scoutEncounters(11, [fight()])
  expect([attacker.wins, attacker.losses, attacker.roundWins]).toEqual([1, 0, [1, 0, 1]])
  expect([defender.wins, defender.losses, defender.roundWins]).toEqual([0, 1, [0, 1, 0]])
  expect(defender.recent[0]).toMatchObject({ opponentId: 7, won: false, rounds: [false, true, false] })
})

test('a roaming wild is scouted from its own perspective', () => {
  expect(scoutEncounters(29, [fight({ kind: 0, opponentId: 29, rounds: 0, challengerWon: false })])).toMatchObject({ fights: 1, wins: 1, roundWins: [1, 1, 1] })
})

test('pending, invalid or contradictory results never become apparent losses', () => {
  const result = scoutEncounters(7, [fight({ id: 4, status: 1 }), fight({ id: 3, rounds: 8 }), fight({ id: 2, rounds: 7, challengerWon: false }), fight({ id: 1, challengerId: 7, opponentId: 7 })])
  expect(result.fights).toBe(0)
  expect(result.recent).toEqual([])
})

test('keeper scoping excludes records belonging to a previous owner', () => {
  const result = scoutEncounters(11, [fight(), fight({ id: 2, opponent: keeper }), fight({ id: 3, challengerId: 11, opponentId: 12, challenger: keeper })], keeper.toUpperCase())
  expect(result.recent.map(row => row.battleId)).toEqual([3, 2])
  expect(result.fights).toBe(2)
})

test('duplicate and unordered records produce one deterministic recent record per battle', () => {
  const rows = [fight({ id: 2 }), fight({ id: 7 }), fight({ id: 2 }), fight({ id: 5 })]
  const report = scoutEncounters(7, rows)
  expect(report.fights).toBe(3)
  expect(report.recent.map(row => row.battleId)).toEqual([7, 5, 2])
})

test('the global observation window is applied before selecting specimen encounters', () => {
  const rows = Array.from({ length: 35 }, (_, index) => fight({ id: index + 1, challengerId: index < 5 ? 7 : 12 }))
  expect(scoutEncounters(7, rows)).toMatchObject({ windowSize: 30, fights: 0, recent: [] })
})

test('the report does not copy plans, stakes or other private fields into its public projection', () => {
  const withSecrets = { ...fight(), plan: 'private-plan-marker', stake: 'private-stake-marker', handles: ['private-handle-marker'] }
  const report = scoutEncounters(7, [withSecrets])
  expect(report.fights).toBe(1)
  expect(JSON.stringify(report)).not.toContain('private-')
  expect(Object.keys(report.recent[0]).sort()).toEqual(['battleId', 'kind', 'opponentId', 'rounds', 'startedAt', 'won'])
})

test('all observed fights contribute to form while only five recent replays are listed', () => {
  const report = scoutEncounters(7, Array.from({ length: 8 }, (_, index) => fight({ id: index + 1 })))
  expect(report.fights).toBe(8)
  expect(report.wins).toBe(8)
  expect(report.recent).toHaveLength(5)
})
