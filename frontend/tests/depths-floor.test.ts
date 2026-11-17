import { expect, test } from 'bun:test'
import { decodeFloorLog, doorFromByte } from '../src/chimera/game/depths-floor'

test('the trial keeps the contract’s floor 1 and floor 10 odds, including the final stairs roll', () => {
  const counts = (floor: number) => {
    const result = [0, 0, 0, 0]
    for (let roll = 0; roll < 256; roll++) result[doorFromByte(floor, roll)]++
    return result
  }
  expect(counts(1)).toEqual([89, 95, 38, 34])
  expect(counts(10)).toEqual([1, 140, 9, 106])
})

test('an unavailable private read never appears as stairs or an empty payout', () => {
  expect(() => decodeFloorLog(1, 0, undefined, 0n, 0n)).toThrow('not been decrypted')
  expect(() => decodeFloorLog(1, 0, 0n, 0n, undefined)).toThrow('not been decrypted')
  expect(decodeFloorLog(1, 0, 0n, 0n, 0n)).toEqual({ floor: 1, door: 0, content: 0, damage: 0, loot: 0n })
})
