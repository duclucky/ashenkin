import { expect, test } from 'bun:test'
import { buildBattleReport } from '../src/chimera/game/battle-report'

test('the report preserves settled losses even when a known move had the advantage', () => {
  const report = buildBattleReport({ rounds: [false, true, false], mine: [2, 0, 1], theirs: [1, 2, 0] })!
  expect([report.wins, report.losses]).toEqual([1, 2])
  expect(report.rows.map((row) => row.edge)).toEqual([1, 1, 1])
  expect(report.rows.map((row) => row.won)).toEqual([false, true, false])
})

test('unknown opponent commands remain sealed instead of being inferred from wins', () => {
  const report = buildBattleReport({ rounds: [true, true, true], mine: [0, 1, 2] })!
  expect(report.rows.map((row) => row.right)).toEqual([null, null, null])
  expect(report.rows.map((row) => row.edge)).toEqual([null, null, null])
})

test('a partial result or an invalid command cannot fabricate a round or a tactic', () => {
  expect(buildBattleReport({ rounds: [true, false] })).toBeNull()
  expect(buildBattleReport({ rounds: [true, false, 1] })).toBeNull()
  const report = buildBattleReport({ rounds: [true, false, true], mine: [3, -1, 1.5], theirs: [0, 1, 2] })!
  expect(report.rows.map((row) => row.left)).toEqual([null, null, null])
  expect(report.rows.map((row) => row.edge)).toEqual([null, null, null])
})
