import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { closeScene, getSceneSnapshot, openScene, sceneDone, sceneStep } from '../src/chimera/game/store'

afterEach(() => { closeScene(); mock.restore() })

test('receipt confirmation stops the waiting-for-block phase before any follow-up read', () => {
  openScene({ kind: 'battle' }, 'Settle fight')
  sceneStep('Sent — waiting for a Sepolia confirmation…')
  sceneStep('Confirmed on Sepolia — preparing the result…')
  expect(getSceneSnapshot()?.phase).toBe('confirmed')
})

test('current-step timing resets only on a phase transition and keeps total elapsed origin', () => {
  const now = spyOn(Date, 'now').mockReturnValue(1000)
  openScene({ kind: 'battle' }, 'Fight')
  now.mockReturnValue(2000)
  sceneStep('Confirm the transaction in your wallet…')
  now.mockReturnValue(3000)
  sceneStep('Confirm the transaction in your wallet…')
  expect(getSceneSnapshot()).toMatchObject({ startedAt: 1000, phaseStartedAt: 2000, signs: 1 })
  now.mockReturnValue(5000)
  sceneStep('Sent — waiting for confirmation…')
  expect(getSceneSnapshot()).toMatchObject({ startedAt: 1000, phaseStartedAt: 5000 })
  sceneDone({ won: true })
  sceneStep('Sent — late callback')
  expect(getSceneSnapshot()?.phase).toBe('done')
})
