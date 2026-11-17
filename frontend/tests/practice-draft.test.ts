import { expect, test } from 'bun:test'
import { clearStarterPracticePlan, saveStarterPracticePlan, stagePracticeDraft, starterPracticePlan, takePracticeDraft } from '../src/chimera/game/practice-draft'

const keeper = `0x${'ab'.repeat(20)}`
const other = `0x${'cd'.repeat(20)}`

test('the final practice plan crosses the route once, with a copy and normalized wallet identity', () => {
  const moves = [1, 0, 2]
  stagePracticeDraft(keeper, moves)
  moves[0] = 0
  expect(takePracticeDraft(keeper.toUpperCase())).toEqual([1, 0, 2])
  expect(takePracticeDraft(keeper)).toBeNull()
})

test('a changed or disconnected wallet discards the handoff rather than exposing another account’s draft', () => {
  stagePracticeDraft(keeper, [0, 1, 2])
  expect(takePracticeDraft(other)).toBeNull()
  expect(takePracticeDraft(keeper)).toBeNull()
  stagePracticeDraft(keeper, [0, 1, 2])
  expect(takePracticeDraft(null)).toBeNull()
  expect(takePracticeDraft(keeper)).toBeNull()
})

test('a malformed handoff cannot replace a staged valid plan', () => {
  stagePracticeDraft(keeper, [0, 1, 2])
  expect(() => stagePracticeDraft(keeper, [0, 1, 3])).toThrow()
  expect(() => stagePracticeDraft('not-a-wallet', [1, 1, 1])).toThrow()
  expect(takePracticeDraft(keeper)).toEqual([0, 1, 2])
})

test('a guest plan survives navigation, binds on first use, and clears after that wallet hunts', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true })
  try {
    saveStarterPracticePlan([1, 2, 0], null)
    expect(starterPracticePlan(keeper)).toEqual([1, 2, 0])
    expect(starterPracticePlan(other)).toBeNull()
    clearStarterPracticePlan(other)
    expect(starterPracticePlan(keeper)).toEqual([1, 2, 0])
    clearStarterPracticePlan(keeper)
    expect(starterPracticePlan(keeper)).toBeNull()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})
