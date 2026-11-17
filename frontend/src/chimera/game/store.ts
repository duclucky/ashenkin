import { useSyncExternalStore } from 'react'
import { sfx, unlockAudio } from './sfx'

/* Global "cutscene" state: every onchain action can play as an animated pixel scene.
   Phases follow the real transaction lifecycle: sign → chain → Zama → result. */

export type CreatureAction = 'sequence' | 'certify' | 'chimera' | 'list' | 'buy' | 'cancelListing' | 'equip' | 'unequip' | 'appraiseEquipped' | 'ascend' | 'defend' | 'replan' | 'recall' | 'unsealPlan' | 'descend' | 'openDoor' | 'climb' | 'depthRecord' | 'revealPower' | 'walletCollect' | 'bossFinish' | 'bossReward' | 'unlockSpecimen' | 'expeditionReport' | 'depthLantern' | 'raidReport'
export type SceneKind = 'hatch' | 'breed' | 'hatchEgg' | 'strike' | 'train' | 'finishTraining' | 'expedition' | 'claim' | 'battle' | 'faucet' | CreatureAction
export type Phase = 'prep' | 'wallet' | 'chain' | 'confirmed' | 'fhe' | 'done' | 'fail'

export type SceneSpec = {
  kind: SceneKind
  /** my creature */
  me?: number
  /** opponent / partner creature */
  foe?: number
  /** training: level before; strike: boss level */
  level?: number
  /** strike: boss element; expedition: zone */
  element?: number
  zone?: number
  /** battle: 0 hunt, 1 duel */
  mode?: 0 | 1
  starterHunt?: boolean
  firstHatch?: boolean
  /** Battle log replay, with no new rewards. */
  replay?: boolean
  /** Where a public replay was opened; changes only the return label. */
  replayOrigin?: 'scout' | 'log'
  /** health band 0..10 for the boss */
  band?: number | null
  detail?: string
  door?: number
}

export type SceneState = SceneSpec & {
  open: boolean
  minimized: boolean
  title: string
  phase: Phase
  text: string
  hash?: string
  /** how many wallet signatures have been requested so far */
  signs: number
  /** phases visited so far (for the progress pips) */
  seen: Phase[]
  result?: any
  error?: string
  completedText?: string
  startedAt: number
  phaseStartedAt: number
  nonce: number
  presented?: boolean
}

let state: SceneState | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
let nonce = 0
export const getSceneSnapshot = () => state

export function useScene() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    getSceneSnapshot,
    () => null,
  )
}
export const sceneActive = () => !!state && state.open && state.phase !== 'done' && state.phase !== 'fail'

export function openScene(spec: SceneSpec, title: string) {
  unlockAudio()
  sfx.select()
  const startedAt = Date.now()
  state = { ...spec, open: true, minimized: false, title, phase: 'prep', text: 'Preparing…', signs: 0, seen: ['prep'], startedAt, phaseStartedAt: startedAt, nonce: ++nonce }
  emit()
  return state.nonce
}

function classify(text: string, prev: Phase): Phase {
  if (/^confirmed on Sepolia\b/i.test(text)) return 'confirmed'
  if (/confirm.*wallet|sign /i.test(text)) return 'wallet'
  if (/^sent\b/i.test(text)) return 'chain'
  if (/zama|kms|decrypt|proof|checking|revealing|reveal the/i.test(text)) return 'fhe'
  return prev
}

export function sceneStep(text: string, hash?: string) {
  if (!state || state.phase === 'done' || state.phase === 'fail') return
  const phase = classify(text, state.phase)
  const changed = phase !== state.phase
  state = {
    ...state,
    text,
    hash: hash ?? state.hash,
    phase,
    phaseStartedAt: changed ? Date.now() : state.phaseStartedAt,
    signs: state.signs + (phase === 'wallet' && changed ? 1 : 0),
    seen: state.seen.includes(phase) ? state.seen : [...state.seen, phase],
  }
  if (changed) {
    if (phase === 'wallet') sfx.wallet()
    else if (phase === 'chain') sfx.sent()
    else if (phase === 'fhe') sfx.cipher()
  }
  emit()
}

export function sceneDone(result: any, completedText?: string) {
  if (!state || state.phase === 'done' || state.phase === 'fail') return
  state = { ...state, phase: 'done', phaseStartedAt: Date.now(), result, completedText, seen: [...state.seen, 'done'] }
  emit()
}

export function sceneFail(error: string) {
  if (!state || state.phase === 'done' || state.phase === 'fail') return
  sfx.error()
  state = { ...state, phase: 'fail', phaseStartedAt: Date.now(), error }
  emit()
}

export function sceneMinimize(m: boolean) {
  if (!state) return
  state = { ...state, minimized: m }
  emit()
}

/** The scene has reached its result, including any replay that leads to it. */
export function scenePresented(expectedNonce: number) {
  if (state?.nonce !== expectedNonce || state.presented || (state.phase !== 'done' && state.phase !== 'fail')) return
  state = { ...state, presented: true }
  emit()
}

/** In a batch, give each result time on screen before the next step starts. */
export function waitForSceneResult(expectedNonce: number) {
  return new Promise<void>((resolve) => {
    let hold: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      clearTimeout(hold)
      subs.delete(check)
      resolve()
    }
    const check = () => {
      if (state?.nonce !== expectedNonce || state.minimized) return finish()
      if (state.presented && hold === undefined) hold = setTimeout(finish, 950)
    }
    subs.add(check)
    check()
  })
}

export function closeScene(expectedNonce?: number) {
  if (expectedNonce !== undefined && state?.nonce !== expectedNonce) return
  state = null
  emit()
}

export const getSceneOpen = () => !!state && state.open

export function sceneUpdate(patch: Partial<SceneSpec>) {
  if (!state) return
  state = { ...state, ...patch }
  emit()
}
