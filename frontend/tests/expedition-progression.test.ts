import { expect, test } from 'bun:test'
import { expeditionXpPreview, expeditionXpFromReceipt, xpGrantedFromReceipt } from '../src/chimera/game/expedition-progression'

const training = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const expeditions = '0x1234123412341234123412341234123412341234'
const xpEvent = (creatureId: bigint, amount: number, address = training, game = expeditions) => ({
  address, eventName: 'XpGranted', args: { creatureId, game, amount },
})

test('the route preview distinguishes base XP from the amount available under today’s cap', () => {
  expect(expeditionXpPreview(25, undefined)).toEqual({ base: 25, today: undefined })
  expect(expeditionXpPreview(25, 40)).toEqual({ base: 25, today: 25 })
  expect(expeditionXpPreview(25, 7)).toEqual({ base: 25, today: 7 })
  expect(expeditionXpPreview(25, 0)).toEqual({ base: 25, today: 0 })
})

test('the return scene uses the actual grant for this creature and this expedition', () => {
  const capped = { address: training, eventName: 'XpCapped', args: { creatureId: 6n, game: expeditions, requested: 25, granted: 7 } }
  const logs = [capped, xpEvent(8n, 50), xpEvent(6n, 99, expeditions), xpEvent(6n, 12, training, training), xpEvent(6n, 7, training.toUpperCase())]
  expect(expeditionXpFromReceipt(logs, 6, training, expeditions)).toBe(7)
  expect(expeditionXpFromReceipt(logs.slice(0, -1), 6, training, expeditions)).toBe(0)
})

test('ascension reports the actual capped grant instead of its requested reward', () => {
  const altar = '0x9999999999999999999999999999999999999999'
  const logs = [
    { address: altar, eventName: 'Ascended', args: { heroId: 6n, xp: 50 } },
    xpEvent(6n, 50),
    { ...xpEvent(6n, 7), args: { creatureId: 6n, game: altar, amount: 7 } },
  ]
  expect(xpGrantedFromReceipt(logs, 6, training, altar)).toBe(7)
  expect(xpGrantedFromReceipt(logs, 7, training, altar)).toBe(0)
})

test('combat rewards distinguish capped XP and a defender with no grant from nominal win XP', () => {
  const arena = '0x8888888888888888888888888888888888888888'
  const logs = [{ ...xpEvent(6n, 3), args: { creatureId: 6n, game: arena, amount: 3 } }]
  expect(xpGrantedFromReceipt(logs, 6, training, arena)).toBe(3)
  expect(xpGrantedFromReceipt(logs, 7, training, arena)).toBe(0)
  expect(xpGrantedFromReceipt(logs, 6, training, expeditions)).toBe(0)
})
