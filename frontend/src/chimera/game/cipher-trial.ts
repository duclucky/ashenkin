import { duelOf, MOVE_BONUS, ROLL_BOUND } from './tactics-rules'

/** Browser teaching model, not encrypted state or a source of on-chain rewards. */

export type TrialPlan = [number, number, number]
export type TrialStep = 'blind' | 'exposed' | 'replanned' | 'complete'
export type TrialRound = { mine: number; rival: number; rollMe: number; rollRival: number; bonusMe: number; bonusRival: number; scoreMe: number; scoreRival: number; edge: number; won: boolean }
export type TrialBout = { mine: TrialPlan; rounds: TrialRound[]; wins: number; counters: number }
export type TrialScenario = { rival: TrialPlan; rolls: [number, number][] }
export type CipherTrial = { step: TrialStep; scenario: TrialScenario; result: TrialBout | null; blind: TrialBout | null; exposed: TrialBout | null }
export type TrialView = { step: TrialStep; rival: (number | null)[]; rows: { mine: number; rival: number | null; won: boolean; edge: number | null; rollMe: number | null; rollRival: number | null; scoreMe: number | null; scoreRival: number | null }[]; history: { label: string; rounds: boolean[] }[]; wins: number | null; canAdvance: boolean }

export const TRAINING_POWER = 100

function sample(draw: () => number, bound: number): number {
  const value = draw()
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Local training randomness is unavailable.')
  return Math.floor(value * bound)
}

function scenario(draw: () => number): TrialScenario {
  return {
    rival: [sample(draw, 3), sample(draw, 3), sample(draw, 3)],
    rolls: Array.from({ length: 3 }, () => [sample(draw, ROLL_BOUND), sample(draw, ROLL_BOUND)]),
  }
}

export function startCipherTrial(draw: () => number = Math.random): CipherTrial {
  return { step: 'blind', scenario: scenario(draw), result: null, blind: null, exposed: null }
}

export function fightCipherTrial(trial: CipherTrial, plan: readonly number[]): CipherTrial {
  if (trial.step === 'complete' || trial.result) throw new Error('Finish the current encounter before starting another.')
  if (plan.length !== 3 || !plan.every(move => Number.isInteger(move) && move >= 0 && move <= 2)) throw new Error('Choose three valid commands.')
  const rounds = plan.map((mine, index) => {
    const rival = trial.scenario.rival[index]
    const [rollMe, rollRival] = trial.scenario.rolls[index]
    const edge = duelOf(mine, rival)
    const bonusMe = edge > 0 ? MOVE_BONUS : 0
    const bonusRival = edge < 0 ? MOVE_BONUS : 0
    const scoreMe = TRAINING_POWER + bonusMe + rollMe
    const scoreRival = TRAINING_POWER + bonusRival + rollRival
    return { mine, rival, rollMe, rollRival, bonusMe, bonusRival, scoreMe, scoreRival, edge, won: scoreMe > scoreRival }
  })
  return { ...trial, result: { mine: [plan[0], plan[1], plan[2]], rounds, wins: rounds.filter(row => row.won).length, counters: rounds.filter(row => row.edge > 0).length } }
}

export function continueCipherTrial(trial: CipherTrial, draw: () => number = Math.random): CipherTrial {
  if (!trial.result || trial.step === 'complete') throw new Error('Play the encounter before continuing.')
  switch (trial.step) {
    case 'blind': return { ...trial, step: 'exposed', blind: trial.result, result: null }
    case 'exposed': {
      if (trial.result.counters !== 3) throw new Error('Counter all three exposed commands to continue.')
      const next = scenario(draw)
      // This scripted lesson must actually change plans, even on repeated local draws.
      if (next.rival.every((move, index) => move === trial.scenario.rival[index])) next.rival[0] = (next.rival[0] + 1) % 3
      return { ...trial, step: 'replanned', scenario: next, exposed: trial.result, result: null }
    }
    case 'replanned': return { ...trial, step: 'complete' }
  }
}

export function retryCipherTrial(trial: CipherTrial): CipherTrial {
  if (trial.step !== 'exposed' || !trial.result) throw new Error('Only the exposed rematch can be retried.')
  return { ...trial, result: null }
}

/** Explicit player projection: hidden actions never enter animation or report props. */
export function cipherTrialView(trial: CipherTrial): TrialView {
  const exposed = trial.step === 'exposed'
  const history = [
    ...(trial.blind ? [{ label: 'Blind encounter', rounds: trial.blind.rounds.map(row => !row.won) }] : []),
    ...(trial.exposed ? [{ label: 'Exposed rematch', rounds: trial.exposed.rounds.map(row => !row.won) }] : []),
  ]
  return {
    step: trial.step,
    rival: trial.scenario.rival.map(move => exposed ? move : null),
    rows: trial.result?.rounds.map(row => ({
      mine: row.mine, rival: exposed ? row.rival : null, won: row.won,
      edge: exposed ? row.edge : null,
      rollMe: exposed ? row.rollMe : null, rollRival: exposed ? row.rollRival : null,
      scoreMe: exposed ? row.scoreMe : null, scoreRival: exposed ? row.scoreRival : null,
    })) ?? [],
    history,
    wins: trial.result?.wins ?? null,
    canAdvance: !!trial.result && trial.step !== 'complete' && (!exposed || trial.result.counters === 3),
  }
}
