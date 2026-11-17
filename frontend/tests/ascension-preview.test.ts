import { expect, test } from 'bun:test'
import { ascensionPreview } from '../src/chimera/game/ascension-preview'

test('a charge-only offering can retire a spare at the XP cap while ownership and relic checks remain mandatory', () => {
  const state = { picked: true, generation: 1, room: 0, owned: true, defending: false, slots: [0, 0], chargeOnly: true }
  expect(ascensionPreview(state)).toMatchObject({ gained: 0, blocker: null })
  expect(ascensionPreview({ ...state, slots: [1, 0] }).blocker).not.toBeNull()
  expect(ascensionPreview({ ...state, owned: false }).blocker).not.toBeNull()
  expect(ascensionPreview({ ...state, room: undefined }).blocker).toBeNull()
})

const ready = { picked: true, generation: 2, room: 105, owned: true, defending: false, slots: [0, 0] }

test('unknown XP allowance is not shown as zero and cannot authorize an offering', () => {
  const preview = ascensionPreview({ ...ready, room: undefined })
  expect(preview.gained).toBeUndefined()
  expect(preview.blocker).not.toBeNull()
  expect(preview.blocker).not.toBe('No XP room left today')
})

test('an offering waits until relics, defender status, ownership and generation are verified', () => {
  for (const missing of ['slots', 'defending', 'owned', 'generation'] as const) {
    expect(ascensionPreview({ ...ready, [missing]: undefined }).blocker).not.toBeNull()
  }
  expect(ascensionPreview({ ...ready, unavailable: true }).blocker).not.toBeNull()
  expect(ascensionPreview({ ...ready, owned: false }).blocker).not.toBeNull()
})

test('the preview respects the cap and refuses relic-bearing or defending offerings', () => {
  expect(ascensionPreview(ready)).toEqual({ xp: 50, gained: 50, blocker: null })
  expect(ascensionPreview({ ...ready, room: 7 }).gained).toBe(7)
  expect(ascensionPreview({ ...ready, room: 0 }).blocker).toBe('No XP room left today')
  expect(ascensionPreview({ ...ready, slots: [1, 0] }).blocker).toBe('Unequip its relics first')
  expect(ascensionPreview({ ...ready, defending: true }).blocker).toBe('Guarding the Colosseum')
})
