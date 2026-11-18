import { expect, test } from 'bun:test'
import { firstStep, firstTarget } from '../src/chimera/game/first-steps'
const newbie = {
  owned: 0,
  genesis: 0,
  fights: 0,
  hasGas: false,
  lifeIntroduced: false,
}
test('a new account follows gas → NFT → settled first battle → Living Xenos', () => {
  expect(firstStep(newbie)).toBe('gas')
  expect(firstStep({ ...newbie, hasGas: true })).toBe('hatch')
  expect(firstStep({ ...newbie, hasGas: true, owned: 1, genesis: 1 })).toBe(
    'fight',
  )
  expect(
    firstStep({ ...newbie, hasGas: true, owned: 1, genesis: 1, fights: 1 }),
  ).toBe('life')
  expect(
    firstStep({
      ...newbie,
      owned: 1,
      genesis: 1,
      fights: 1,
      lifeIntroduced: true,
    }),
  ).toBe('complete')
})
test('loading, escrow and an unfinished battle cannot fake a completed step', () => {
  expect(firstStep({ ...newbie, owned: undefined })).toBe('loading')
  expect(
    firstStep({
      ...newbie,
      owned: 1,
      genesis: 1,
      hasGas: true,
      fights: undefined,
    }),
  ).toBe('loading')
  expect(firstStep({ ...newbie, genesis: 3 })).toBe('recover')
  expect(firstTarget('fight', true)).toBe('arena/log')
  expect(firstTarget('gas')).toBe('lab/gas')
})
test('an already funded account skips the faucet; an experienced player can reach Living Xenos without gas', () => {
  expect(firstStep({ ...newbie, hasGas: true })).toBe('hatch')
  expect(
    firstStep({ ...newbie, owned: 1, genesis: 1, fights: 2, hasGas: false }),
  ).toBe('life')
})
