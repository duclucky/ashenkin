import { expect, test } from 'bun:test'
import { closeScene, openScene, sceneDone, sceneMinimize, scenePresented, waitForSceneResult } from '../src/chimera/game/store'

test('a completed transaction does not advance the batch while its replay is still running', async () => {
  const fight = openScene({ kind: 'battle' }, 'Fight')
  try {
    let advanced = false
    const waiting = waitForSceneResult(fight).then(() => { advanced = true })
    sceneDone({ rounds: [true, false, true] })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(advanced).toBe(false)
    scenePresented(fight)
    await waiting
    expect(advanced).toBe(true)
  } finally {
    closeScene(fight)
  }
})

test('a minimized scene does not hold up the remaining batch', async () => {
  const training = openScene({ kind: 'finishTraining' }, 'Finish training')
  try {
    const waiting = waitForSceneResult(training)
    sceneDone({ ok: true })
    sceneMinimize(true)
    await waiting
  } finally {
    closeScene(training)
  }
}, 1500)
