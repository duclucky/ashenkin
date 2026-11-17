import { useId, useState } from 'react'
import { ArrowRight, Lock, Shield, Shuffle, Swords, Wind } from 'lucide-react'
import { MOVES, duelOf, randomPlan } from '../season'

export const MOVE_ICON = [Swords, Shield, Wind] as const

export function MoveChip({ m, size = 'md', dim, hidden }: { m?: number | null; size?: 'sm' | 'md'; dim?: boolean; hidden?: boolean }) {
  const s = size === 'sm' ? 'h-7 min-w-7 px-1.5 text-[10px]' : 'h-9 min-w-9 px-2 text-xs'
  if (hidden || m == null)
    return <span className={`inline-flex items-center justify-center border-2 border-[#111] bg-[#111] font-mono font-black text-[var(--chm-yellow)] ${s}`}>?</span>
  const mv = MOVES[m]
  const Icon = MOVE_ICON[m]
  return (
    <span className={`inline-flex items-center justify-center gap-1 border-2 border-[var(--chm-black)] bg-[var(--chm-gray)] font-mono font-black text-[var(--chm-black)] shadow-[2px_2px_0_#111] ${s}`} style={{ opacity: dim ? 0.45 : 1 }}>
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {mv.short}
    </span>
  )
}

/** Three-round move picker. Nothing leaves the browser unencrypted. */
export function PlanPicker({ plan, onChange, label = 'Your sealed plan', compact, practice = false, guided = false, prepare = false }: { plan: number[]; onChange: (plan: number[], editedRound?: number) => void; label?: string; compact?: boolean; practice?: boolean; guided?: boolean; prepare?: boolean }) {
  const [active, setActive] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const hint = useId()
  function choose(move: number) {
    onChange(plan.map((value, round) => round === active ? move : value), active)
    const next = Math.min(active + 1, 2)
    setActive(next)
    setAnnouncement(`Round ${active + 1}: ${MOVES[move].name}. ${next !== active ? `Editing round ${next + 1}.` : 'Your three commands are ready.'}`)
  }
  return (
    <div className="chm-tactics chm-command-board p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="font-mono text-[11px] font-black uppercase tracking-wider text-[#111]">{label}</div>
        <button type="button" className="chm-btn chm-btn-ghost !px-2.5 !text-xs" onClick={() => { onChange(randomPlan()); setActive(0); setAnnouncement('New three-round plan. Editing round 1.') }}>
          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Shuffle
        </button>
      </div>
      <div className="chm-command-rounds" role="group" aria-label="Three-round command queue">
        {[0, 1, 2].map((r) => {
          const Icon = MOVE_ICON[plan[r]]
          return <button key={r} type="button" className="chm-command-round" data-active={r === active} aria-pressed={r === active} aria-label={`Edit round ${r + 1}: ${MOVES[plan[r]].name}`} onClick={() => setActive(r)}>
            <span className="font-mono text-[11px] uppercase">Round {r + 1}</span>
            <span key={plan[r]} className="chm-command-pose" data-move={MOVES[plan[r]].key}><Icon aria-hidden="true" /></span>
            <b>{MOVES[plan[r]].name}</b>
            {r < 2 && <ArrowRight className="chm-command-link" aria-hidden="true" />}
          </button>
        })}
      </div>
      <fieldset className={`mt-4 min-w-0${guided ? ' chm-quest-target' : ''}`} aria-describedby={hint}>
        <legend className="mb-2 font-mono text-xs font-bold text-[var(--chm-dim)]">Set round {active + 1}</legend>
        <div className="grid grid-cols-3 gap-2">
          {MOVES.map((move, index) => {
            const Icon = MOVE_ICON[index]
            return <button key={move.key} type="button" title={move.blurb} aria-label={`Round ${active + 1}: ${move.name}`} aria-pressed={plan[active] === index} className="chm-tactic-move chm-command-choice" data-move={move.key} onClick={() => choose(index)}>
              <Icon aria-hidden="true" />
              <b>{compact ? move.short : move.name}</b>
              <small>beats {MOVES[(index + 2) % 3].short}</small>
            </button>
          })}
        </div>
      </fieldset>
      <p id={hint} className="mt-3 flex items-center gap-1.5 text-xs text-[var(--chm-dim)]">{practice ? <Swords className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />}{practice ? 'Local practice · learn the matchups before entering Sepolia.' : prepare ? 'Your browser seals your moves as you plan.' : 'Encrypted when you enter. Power and rolls stay hidden.'}</p>
      <span className="sr-only" role="status" aria-atomic="true">{announcement}</span>
    </div>
  )
}

/** The rock-paper-scissors triangle, as a legend. */
export function MoveTriangle() {
  return (
    <div className="flex flex-wrap gap-2 font-mono text-xs font-bold">
      {MOVES.map((m, i) => (
        <span key={m.key} className="flex items-center gap-1.5 border-2 border-[#111] bg-white px-2 py-1 shadow-[2px_2px_0_#111]">
          <MoveChip m={i} size="sm" /> beats <MoveChip m={(i + 2) % 3} size="sm" />
        </span>
      ))}
    </div>
  )
}

/** Three round pips from the challenger's (or my) point of view. */
export function RoundPips({ rounds, mine, theirs }: { rounds: (boolean | null)[]; mine?: number[] | null; theirs?: number[] | null }) {
  return (
    <div className="flex items-center gap-2">
      {rounds.map((r, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span className={`flex h-6 w-6 items-center justify-center border-2 border-[#111] font-mono text-[11px] font-black ${r == null ? 'bg-[#ddd] text-[#777]' : r ? 'bg-[#3DDC97] text-[#111]' : 'bg-[#E5341D] text-white'}`}>{r == null ? '?' : r ? 'W' : 'L'}</span>
          {(mine || theirs) && (
            <div className="flex flex-col items-center gap-0.5">
              <MoveChip m={mine?.[i]} size="sm" hidden={!mine} />
              <MoveChip m={theirs?.[i]} size="sm" hidden={!theirs} dim={!!mine && !!theirs && duelOf(mine[i], theirs[i]) > 0} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
