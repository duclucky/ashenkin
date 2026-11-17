import { expect, test } from 'bun:test'
import { closeScene, openScene, sceneActive, sceneDone, sceneFail, sceneStep } from '../src/chimera/game/store'

test('late wallet progress cannot reopen a completed scene', () => {
  openScene({ kind: 'battle' }, 'Fight')
  try {
    sceneDone({ rounds: [true, false, true] })
    sceneStep('Confirm the transaction in your wallet…')
    expect(sceneActive()).toBe(false)
  } finally { closeScene() }
})

test('a failed scene stays terminal when an old network callback arrives', () => {
  openScene({ kind: 'hatch' }, 'Hatch')
  try {
    sceneFail('Request rejected')
    sceneStep('Sent — waiting for Sepolia…')
    expect(sceneActive()).toBe(false)
  } finally { closeScene() }
})

test('a new action still opens normally after a terminal scene', () => {
  openScene({ kind: 'battle' }, 'Fight')
  sceneDone({})
  openScene({ kind: 'train' }, 'Train')
  try { expect(sceneActive()).toBe(true) }
  finally { closeScene() }
})
