import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Lock, RotateCcw, Swords } from 'lucide-react'
import { MOVES } from '../season'
import { MOVE_BONUS, ROLL_BOUND } from './tactics-rules'
import { Button, Link } from '../ui'
import { MOVE_ICON, PlanPicker, RoundPips } from './Tactics'
import { cipherTrialView, continueCipherTrial, fightCipherTrial, retryCipherTrial, startCipherTrial, TRAINING_POWER, type TrialView } from './cipher-trial'
import { finishStarterPractice } from './keeper-story'
import { getWallet } from '../chain'
import { useCreature, useTraits } from '../hooks'
import { speciesName } from '../genetics'
import { saveStarterPracticePlan } from './practice-draft'
import { ARENA_TIMING, ArenaStage } from './ArenaStage'
import { sfx, unlockAudio } from './sfx'

const RIVAL = { name: 'Training rival', traits: [7, 2, 12, 8, 5, 7, 11], seed: 9 }
const STEPS = [
  { key: 'blind', title: 'Blind encounter', task: 'Choose three commands. Your rival’s plan and local rolls are concealed.' },
  { key: 'exposed', title: 'The leaked plan', task: 'Same rival, same rolls. Counter all three exposed commands to advance.' },
  { key: 'replanned', title: 'Behind the mask', task: 'The rival has changed its plan. Fresh local rolls. Its old record is not a prediction.' },
] as const
type Replay = { round: number; beat: 'moves' | 'verdict' }

export function PracticeBattle({ specimen, onReady, starter = false }: { specimen: number; onReady: (moves: number[]) => void; starter?: boolean }) {
  const creature = useCreature(specimen)
  const traits = useTraits(creature.data).data
  const player = { name: traits ? speciesName(traits) : `Specimen #${specimen}`, traits: traits ?? null, seed: specimen }
  const [plan, setPlan] = useState([0, 1, 2])
  const [pickedRounds, setPickedRounds] = useState<number[]>([])
  const [trial, setTrial] = useState(() => startCipherTrial())
  const [replay, setReplay] = useState<Replay | null>(null)
  const view = cipherTrialView(trial)
  const completed = trial.step === 'complete'
  const finished = completed || replay?.round === 3
  const firstLesson = starter && trial.step === 'blind'
  const commandsReady = pickedRounds.length === 3
  const fighting = !!trial.result && !finished
  const stepIndex = Math.max(0, STEPS.findIndex(step => step.key === trial.step))
  const instruction = STEPS[stepIndex]
  const stage = useRef<HTMLDivElement>(null)
  const commands = useRef<HTMLDivElement>(null)
  const fightAction = useRef<HTMLDivElement>(null)
  const summary = useRef<HTMLHeadingElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (finished) summary.current?.focus()
  }, [finished, completed])

  useEffect(() => {
    if (!finished || trial.step !== 'blind') return
    finishStarterPractice()
    if (starter && trial.result) saveStarterPracticePlan(trial.result.mine, getWallet().account)
  }, [finished, starter, trial])

  useEffect(() => {
    if (!firstLesson || !commandsReady || trial.result) return
    const button = fightAction.current?.querySelector('button')
    button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: 'nearest' })
  }, [firstLesson, commandsReady, trial.result])

  useEffect(() => {
    if (!fighting) return
    const timeout = window.setTimeout(() => {
      if (!replay) setReplay({ round: 0, beat: 'moves' })
      else if (replay.beat === 'moves') {
        const current = view.rows[replay.round]
        sfx.arenaHit(current.won ? current.mine : current.rival, replay.round === 2)
        setReplay({ round: replay.round, beat: 'verdict' })
      } else {
        if (replay.round === 2) (view.wins ?? 0) >= 2 ? sfx.win() : sfx.lose()
        setReplay({ round: replay.round + 1, beat: 'moves' })
      }
    }, replay ? (replay.beat === 'moves' ? ARENA_TIMING.moves : ARENA_TIMING.impact) : ARENA_TIMING.intro)
    return () => window.clearTimeout(timeout)
  }, [fighting, replay, trial.result, view.wins])

  function fight() {
    if (trial.result) return
    unlockAudio()
    setTrial(fightCipherTrial(trial, plan))
    setReplay(null)
    stage.current?.focus({ preventScroll: true })
    stage.current?.scrollIntoView({ block: 'nearest' })
  }
  function choosePlan(next: number[], round?: number) {
    setPlan(next)
    setPickedRounds(picked => round == null ? [0, 1, 2] : picked.includes(round) ? picked : [...picked, round])
  }
  function jumpToCommands() {
    const picker = commands.current?.querySelector('fieldset')
    picker?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true })
    picker?.scrollIntoView({ block: 'center' })
  }
  function advance() {
    setTrial(continueCipherTrial(trial))
    setReplay(null)
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'nearest' })
  }
  function retry() {
    setTrial(retryCipherTrial(trial))
    setReplay(null)
    heading.current?.focus()
  }
  function restart() {
    setTrial(startCipherTrial())
    setPlan([0, 1, 2])
    setPickedRounds([])
    setReplay(null)
    heading.current?.focus()
  }

  const live = fighting && replay ? replay : null
  const current = live ? view.rows[live.round] : null
  const visible = live ? live.round + (live.beat === 'verdict' ? 1 : 0) : finished ? 3 : 0
  const caption = live && current ? `Round ${live.round + 1}: ${MOVES[current.mine].name} vs ${current.rival == null ? 'concealed command' : MOVES[current.rival].name}${live.beat === 'verdict' ? ` · ${current.won ? 'Win' : 'Loss'}` : ''}` : 'Ready'

  return <section aria-labelledby="practice-title" className="chm-cipher-trial" data-starter={firstLesson || undefined}>
    <header className="chm-trial-header">
      <span>LUMEN’S FIELD TRIAL</span>
      <h2 ref={heading} tabIndex={-1} id="practice-title">{completed ? 'Cipher trial complete' : instruction.title}</h2>
      <ol aria-label="Field trial progress">{STEPS.map((step, index) => <li key={step.key} aria-current={!completed && index === stepIndex ? 'step' : undefined} data-done={completed || index < stepIndex}><span>{completed || index < stepIndex ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{['Blind', 'Exposed', 'Replanned'][index]}</li>)}</ol>
    </header>
    <div className="chm-trial-body">
      <p className="chm-trial-boundary"><Lock size={13} aria-hidden="true" /> Local training · no encryption, gas or rewards</p>
      <div ref={stage} tabIndex={-1} aria-label="Practice arena" role="group" className="chm-practice-stage">
        <ArenaStage fighters={[player, RIVAL]} beat={finished ? 'result' : live?.beat === 'verdict' ? 'impact' : live ? 'moves' : fighting ? 'intro' : 'idle'}
          round={live?.round} scores={view.rows.slice(0, visible).map(row => row.won)}
          commands={current ? [current.mine, current.rival] : undefined} winner={finished ? (view.wins ?? 0) >= 2 : live?.beat === 'verdict' ? current?.won : undefined} />
      </div>
      {firstLesson && !trial.result && !commandsReady && <Button className="chm-quest-target w-full" onClick={jumpToCommands}>Choose moves <ArrowRight size={16} aria-hidden="true" /></Button>}
      {completed ? <div className="chm-trial-result">
        <h3 ref={summary} tabIndex={-1}><Check size={20} aria-hidden="true" /> Three encounters completed</h3>
        <ol className="chm-trial-tally" aria-label="Your field trial results">{[{ label: 'Blind', bout: trial.blind }, { label: 'Exposed', bout: trial.exposed }, { label: 'Replanned', bout: trial.result }].map(row => <li key={row.label}><span>{row.label}</span><b>{row.bout?.wins ?? 0}–{3 - (row.bout?.wins ?? 0)}</b></li>)}</ol>
        <p>Leaked commands let you choose three counters. A past win record cannot tell you a new plan or its next roll.</p>
        <p>On Sepolia, FHE keeps plans, power and Zama rolls encrypted during scoring. The public proof reveals round winners.</p>
        <Button className="w-full" onClick={() => onReady([...trial.result!.mine])}>Take plan to Colosseum <ArrowRight size={16} aria-hidden="true" /></Button>
        <Link to="fairness" className="chm-trial-link">How to verify a Sepolia fight</Link>
        <Button variant="ghost" onClick={restart}><RotateCcw size={14} aria-hidden="true" /> New field trial</Button>
      </div> : finished ? <div className="chm-trial-result">
        <h3 ref={summary} tabIndex={-1}>Encounter complete · {view.wins}–{3 - (view.wins ?? 0)}</h3>
        <TrialRounds view={view} />
        {firstLesson ? <>
          <p>A bell rings beyond the arena. Lumen reaches for her journal.</p>
          <Link to="journal" className="chm-btn chm-btn-primary chm-quest-target w-full">Investigate the beacon <ArrowRight size={16} aria-hidden="true" /></Link>
        </> : trial.step === 'blind' ? <p>Only round winners are shown. Next, expose this training rival’s plan and see what that changes.</p> : trial.step === 'exposed' ? <>
          <p><b>{trial.result!.counters}/3 commands countered.</b> {view.canAdvance ? `Blind: ${trial.blind!.wins} wins. Exposed: ${view.wins} wins, with the same rolls. The +30 bonus helps; it never guarantees victory.` : 'Choose Guard against Strike, Feint against Guard, and Strike against Feint.'}</p>
          <details className="chm-trial-math"><summary>Training score breakdown</summary>{view.rows.map((row, index) => <div key={index}><b>Round {index + 1}</b><span>You: {TRAINING_POWER} + {row.edge! > 0 ? MOVE_BONUS : 0} counter + {row.rollMe} roll = {row.scoreMe}</span><span>Rival: {TRAINING_POWER} + {row.edge! < 0 ? MOVE_BONUS : 0} counter + {row.rollRival} roll = {row.scoreRival}</span></div>)}<p>Equal scores go to the rival, as to a Sepolia defender. This uses equal training power, not an NFT’s real power.</p></details>
        </> : <p>New plan, fresh local rolls. These round winners do not disclose the rival’s commands or roll values.</p>}
        {view.canAdvance ? <Button variant={firstLesson ? 'ghost' : 'primary'} className="w-full" onClick={advance}>{trial.step === 'blind' ? 'Expose training plan' : trial.step === 'exposed' ? 'Face the replanned rival' : 'Finish field trial'}<ArrowRight size={16} aria-hidden="true" /></Button> : <Button className="w-full" onClick={retry}>Adjust counters</Button>}
      </div> : fighting ? <div className="chm-trial-live" role="status" aria-atomic="true">{caption}</div> : <div className="chm-trial-prep">
        <p>{firstLesson ? 'Choose a move for each round. Use the matchup hints, then fight three rounds.' : instruction.task}</p>
        <div className="chm-trial-rival" aria-label={trial.step === 'exposed' ? 'Exposed training commands' : 'Concealed training commands'}>{view.rival.map((move, round) => { const Icon = move == null ? Lock : MOVE_ICON[move]; return <div key={round}><small>R{round + 1}</small><Icon size={19} aria-hidden="true" /><span>{move == null ? 'Concealed' : MOVES[move].name}</span></div> })}</div>
        {trial.step === 'replanned' && <details className="chm-trial-history"><summary>Rival’s public record · 2 encounters</summary><p>Previous round winners from the rival’s side. Its current plan has changed.</p>{view.history.map(row => <div key={row.label}><span>{row.label}</span><RoundPips rounds={row.rounds} /></div>)}</details>}
        <div ref={commands}><PlanPicker plan={plan} onChange={choosePlan} label="Your training plan" practice guided={firstLesson && !commandsReady} /></div>
        <div ref={fightAction}><Button className={`w-full${firstLesson && commandsReady ? ' chm-quest-target' : ''}`} onClick={fight}><Swords size={16} aria-hidden="true" /> Fight three rounds</Button></div>
      </div>}
      <p className="chm-trial-footnote">Your NFT trains at equal practice power {TRAINING_POWER}. Counter +{MOVE_BONUS} · browser rolls 0–{ROLL_BOUND - 1}.</p>
    </div>
  </section>
}

function TrialRounds({ view }: { view: TrialView }) {
  return <ol className="chm-trial-rounds" aria-label="Training encounter rounds">{view.rows.map((row, round) => <li key={round}>
    <span>R{round + 1}</span><div><b>{MOVES[row.mine].name}</b><small>vs {row.rival == null ? 'concealed command' : MOVES[row.rival].name}</small></div><strong data-won={row.won}>{row.won ? 'Win' : 'Loss'}</strong>
  </li>)}</ol>
}
