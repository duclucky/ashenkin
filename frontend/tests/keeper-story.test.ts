import { expect, test } from 'bun:test'
import { keeperChapter, type KeeperProgress } from '../src/chimera/game/keeper-story'

const start: KeeperProgress = {
  connected: true,
  practiced: true,
  beaconDone: true,
  hasGas: true,
  specimens: [],
  genesis: 0,
  fights: 0,
  energy: 3,
  sequenced: false,
  claimedExpedition: false,
  expedition: 'none',
}

test('the first chapter hatches a specimen and sends it into a fight before any key or coin setup', () => {
  expect(keeperChapter({ ...start, connected: false, practiced: false })).toBe('hatch')
  expect(keeperChapter(start)).toBe('hatch')
  expect(keeperChapter({ ...start, specimens: [7], genesis: 1 })).toBe('fight')
})

test('even a returning guest must own a real specimen before the trial and the Beacon', () => {
  expect(keeperChapter({ ...start, connected: false, beaconDone: false })).toBe('hatch')
  expect(keeperChapter({ ...start, connected: false })).toBe('hatch')
  expect(keeperChapter({ ...start, practiced: false, hasGas: false })).toBe('hatch')
  const owner = { ...start, specimens: [7], genesis: 1, hasGas: false }
  expect(keeperChapter({ ...owner, practiced: false })).toBe('prologue')
  expect(keeperChapter({ ...owner, beaconDone: false })).toBe('beacon')
  expect(keeperChapter({ ...owner, hasGas: null })).toBe('loading')
  expect(keeperChapter(owner)).toBe('gas')
})

test('a pending or settled battle takes precedence over the trial', () => {
  const afterHatch = { ...start, practiced: false, specimens: [7], genesis: 1 }
  expect(keeperChapter(afterHatch)).toBe('prologue')
  expect(keeperChapter({ ...afterHatch, pendingFight: true })).toBe('settle')
  expect(keeperChapter({ ...afterHatch, fights: 1 })).toBe('sequence')
})

test('the campaign uses actual settlement, sends an available specimen to the lab, then follows its expedition', () => {
  const firstFight = { ...start, specimens: [7], genesis: 1, fights: 1 }
  expect(keeperChapter(firstFight)).toBe('sequence')
  expect(keeperChapter({ ...firstFight, sequenced: true })).toBe('dispatch')
  expect(keeperChapter({ ...start, specimens: [7], pendingFight: true })).toBe('settle')
  expect(keeperChapter({ ...firstFight, expedition: 'ready', specimens: [] })).toBe('return')
  expect(keeperChapter({ ...firstFight, sequenced: true, claimedExpedition: true })).toBe('choose')
})

test('a settled hunt advances the story whether or not the keeper opens the proof', () => {
  const firstHunt = { ...start, specimens: [7], genesis: 1, fights: 1, starterHunt: 32 }
  expect(keeperChapter(firstHunt)).toBe('sequence')
  expect(keeperChapter({ ...firstHunt, hasGas: false })).toBe('gas')
  expect(keeperChapter({ ...firstHunt, verifiedStarterHunt: 32 })).toBe('sequence')
  expect(keeperChapter({ ...firstHunt, verifiedStarterHunt: 33 })).toBe('sequence')
  expect(keeperChapter({ ...firstHunt, sequenced: true })).toBe('dispatch')
  expect(keeperChapter({ ...firstHunt, fights: 2 })).toBe('sequence')
})

test('recovery avoids sending a player to an empty lab with no free embryos or energy', () => {
  expect(keeperChapter({ ...start, genesis: 3 })).toBe('recover')
  expect(keeperChapter({ ...start, specimens: [7], fights: 1, energy: 0 })).toBe('dispatch')
  expect(keeperChapter({ ...start, hasGas: false })).toBe('hatch')
})
