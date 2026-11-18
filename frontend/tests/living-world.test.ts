import { expect, test } from 'bun:test'
import { residentActivity, validLivingResult, type LivingResult } from '../src/chimera/game/living-world'

const result: LivingResult = { day: 20, nft: 1, kind: 0, tier: 0, won: true, item: 1, quantity: 1, code: 304, at: 1, hash: '0x12', handle: '0x34' }
test('the story accepts only a consistent result code and never invents loot on a loss', () => {
  expect(validLivingResult(result)).toBe(true)
  expect(validLivingResult({ ...result, won: false })).toBe(false)
  expect(validLivingResult({ ...result, code: 0, won: false, item: 0, quantity: 0 })).toBe(true)
  expect(validLivingResult({ ...result, item: 7 })).toBe(false)
  expect(validLivingResult({ ...result, quantity: 3 })).toBe(false)
  expect(validLivingResult({ ...result, kind: -1 })).toBe(false)
})
test('ambient activity is stable across clients and has no reward state', () => {
  expect(residentActivity(3, 7200)).toBe(residentActivity(3, 7201))
  expect(new Set([0, 1, 2].map(i => residentActivity(3, i * 3600))).size).toBe(3)
})
