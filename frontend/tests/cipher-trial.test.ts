import { expect, test } from 'bun:test'
import { cipherTrialView, continueCipherTrial, fightCipherTrial, retryCipherTrial, startCipherTrial, type CipherTrial } from '../src/chimera/game/cipher-trial'

const start = (): CipherTrial => ({ ...startCipherTrial(() => 0), scenario: { rival: [0, 1, 2], rolls: [[0, 0], [0, 31], [31, 0]] } })

test('training follows the contract: +30 counters, d32 rolls, and equal scores go to the rival', () => {
  const fought = fightCipherTrial(start(), [0, 2, 0])
  expect(fought.result?.rounds.map(row => [row.scoreMe, row.scoreRival, row.won])).toEqual([[100, 100, false], [130, 131, false], [161, 100, true]])
  expect([fought.result?.wins, fought.result?.counters]).toEqual([1, 2])
})

test('the exposed rematch preserves both sides of every roll and the original rival plan', () => {
  const blind = fightCipherTrial(start(), [0, 1, 2])
  const exposed = continueCipherTrial(blind, () => { throw Error('No fresh draws in the rematch') })
  expect(exposed.step).toBe('exposed')
  expect(exposed.scenario).toEqual(blind.scenario)
  expect(exposed.blind?.wins).toBe(1)
  const incorrect = fightCipherTrial(exposed, [0, 0, 0])
  expect(() => continueCipherTrial(incorrect)).toThrow()
  const retry = retryCipherTrial(incorrect)
  expect(retry.result).toBeNull()
  expect(retry.scenario).toEqual(blind.scenario)
})

test('correct counters unlock a fresh encounter even when a maximum roll beats a counter', () => {
  const exposed = continueCipherTrial(fightCipherTrial(start(), [0, 1, 2]))
  const countered = fightCipherTrial(exposed, [1, 2, 0])
  expect(countered.result?.wins).toBe(2)
  expect(cipherTrialView(countered).canAdvance).toBe(true)
  let draws = 0
  const fresh = continueCipherTrial(countered, () => { draws++; return 0.999999 })
  expect(draws).toBe(9)
  expect(fresh.step).toBe('replanned')
  expect(fresh.scenario).toEqual({ rival: [2, 2, 2], rolls: [[31, 31], [31, 31], [31, 31]] })
  const last = fightCipherTrial(fresh, [0, 1, 2])
  const done = continueCipherTrial(last)
  expect(done.step).toBe('complete')
  expect(done.result).toEqual(last.result)
  expect(() => fightCipherTrial(done, [0, 1, 2])).toThrow()
})

test('concealed reports project winners only, while the explicitly exposed drill may show the arithmetic', () => {
  const blind = fightCipherTrial(start(), [0, 1, 2])
  const view = cipherTrialView(blind)
  expect(view.rival).toEqual([null, null, null])
  expect(view.rows.map(row => [row.rival, row.rollMe, row.rollRival, row.scoreMe, row.scoreRival, row.edge])).toEqual(Array.from({ length: 3 }, () => [null, null, null, null, null, null]))
  expect(view.rows.map(row => row.won)).toEqual([false, false, true])
  const exposed = fightCipherTrial(continueCipherTrial(blind), [1, 2, 0])
  expect(cipherTrialView(exposed).rival).toEqual([0, 1, 2])
  expect(cipherTrialView(exposed).rows[1]).toMatchObject({ rival: 1, rollMe: 0, rollRival: 31, scoreMe: 130, scoreRival: 131, edge: 1 })
  const fresh = continueCipherTrial(exposed, () => 0.5)
  expect(cipherTrialView(fresh).rival).toEqual([null, null, null])
  expect(cipherTrialView(fresh).history).toEqual([
    { label: 'Blind encounter', rounds: [true, true, false] },
    { label: 'Exposed rematch', rounds: [false, true, false] },
  ])
  const completed = continueCipherTrial(fightCipherTrial(fresh, [0, 1, 2]))
  expect(cipherTrialView(completed).rows.every(row => row.rival === null && row.rollRival === null)).toBe(true)
})

test('invalid commands, invalid local entropy and invalid phase transitions fail without altering the run', () => {
  const trial = start()
  const snapshot = JSON.stringify(trial)
  for (const moves of [[0, 1], [0, 1, 3], [0, -1, 2], [0, 1, NaN]]) expect(() => fightCipherTrial(trial, moves)).toThrow()
  for (const value of [-0.01, 1, NaN, Infinity]) expect(() => startCipherTrial(() => value)).toThrow()
  expect(() => continueCipherTrial(trial)).toThrow()
  expect(() => retryCipherTrial(trial)).toThrow()
  expect(JSON.stringify(trial)).toBe(snapshot)
  const plan = [1, 2, 0]
  const fought = fightCipherTrial(trial, plan)
  plan[0] = 2
  expect(fought.result?.mine).toEqual([1, 2, 0])
  expect(() => fightCipherTrial(fought, [0, 1, 2])).toThrow()
})

test('the last drill always changes the rival plan even when browser draws repeat', () => {
  const initial = startCipherTrial(() => 0)
  const exposed = continueCipherTrial(fightCipherTrial(initial, [0, 1, 2]))
  const fresh = continueCipherTrial(fightCipherTrial(exposed, [1, 1, 1]), () => 0)
  expect(fresh.scenario.rival).not.toEqual(initial.scenario.rival)
  expect(fresh.scenario.rolls).toEqual([[0, 0], [0, 0], [0, 0]])
})
