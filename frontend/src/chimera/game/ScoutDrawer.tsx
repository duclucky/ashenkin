import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Lock, Play, X } from 'lucide-react'
import CreatureArt from '../CreatureArt'
import { speciesName } from '../genetics'
import { useCreature, useTraits, useTraining } from '../hooks'
import { useTBattles } from '../season'
import { Addr, Button, toast } from '../ui'
import { RoundPips } from './Tactics'
import { SCOUT_WINDOW, scoutEncounters, type ScoutEncounter } from './scouting'
import { openScene, sceneActive, sceneDone } from './store'

type Target = { id: number; keeper?: `0x${string}`; replans?: number }

export function ScoutButton(target: Target) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return <>
    <button type="button" className="chm-scout-trigger" aria-label={`Scout specimen #${target.id}`} onClick={() => setOpen(true)}><Eye size={14} aria-hidden="true" /> Scout</button>
    {open && <ScoutDrawer target={target} close={close} />}
  </>
}

function ScoutDrawer({ target, close }: { target: Target; close: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  // This shared public query is only mounted while a scouting drawer is open.
  const battles = useTBattles(SCOUT_WINDOW)
  const creature = useCreature(target.id)
  const traits = useTraits(creature.data)
  const training = useTraining(target.id)
  const report = scoutEncounters(target.id, battles.data ?? [], target.keeper)
  const host = document.querySelector('.chm-root')
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])

  function trapKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? [])]
    const first = items[0], last = items.at(-1)
    if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
      event.preventDefault()
      ;(event.shiftKey ? last : first)?.focus()
    }
  }

  function replay(encounter: ScoutEncounter) {
    if (sceneActive()) {
      toast({ kind: 'err', title: 'An action is still running', detail: 'Finish the current scene before opening a scout replay.' })
      return
    }
    close()
    openScene({ kind: 'battle', me: target.id, foe: encounter.opponentId, mode: encounter.kind, replay: true, replayOrigin: 'scout' }, `Scout #${target.id} · fight #${encounter.battleId}`)
    sceneDone({ battleId: encounter.battleId, won: encounter.won, rounds: [...encounter.rounds] })
  }

  if (!host) return null
  return createPortal(<div className="chm-scout-overlay fixed inset-0 z-[60]" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={`Scout specimen #${target.id}`} className="chm-scout-drawer" onKeyDown={trapKeys}>
      <header><div><span>PUBLIC SCOUTING</span><h2>Specimen #{target.id}</h2></div><button type="button" aria-label="Close scouting" onClick={close}><X size={20} /></button></header>
      <div className="chm-scout-content">
        <section className="chm-scout-profile">
          <CreatureArt traits={traits.data} seed={target.id} stage={training.data?.stage ?? 0} size={88} />
          <div><h3>{traits.data ? speciesName(traits.data) : `Specimen #${target.id}`}</h3>{target.keeper && <p>Keeper <Addr a={target.keeper} /></p>}<p><Lock size={12} aria-hidden="true" /> Power and commands sealed</p></div>
        </section>
        {battles.isPending ? <p role="status" className="chm-scout-note">Reading public fights…</p> : battles.isError ? <div className="chm-scout-note"><p>Public history is unavailable.</p><Button variant="ghost" onClick={() => battles.refetch()}>Try again</Button></div> : <>
          <p className="chm-scout-note">{report.fights} observed {report.fights === 1 ? 'encounter' : 'encounters'} in the latest {report.windowSize} Colosseum fights.{target.keeper ? ' With this keeper.' : ''}</p>
          {report.fights === 0 ? <div className="chm-scout-empty"><Eye size={24} aria-hidden="true" /><h3>No encounters in this window</h3><p>This is an unknown opponent, not an unbeaten one.</p></div> : <>
            <div className="chm-scout-record"><b>{report.wins}<small>wins</small></b><b>{report.losses}<small>losses</small></b></div>
            <section className="chm-scout-rounds" aria-label="Public round record"><h3>Rounds won in observed fights</h3>{report.roundWins.map((wins, round) => <div key={round}><span>R{round + 1}</span><i aria-hidden="true"><i style={{ width: `${wins / report.fights * 100}%` }} /></i><b>{wins} / {report.fights}</b></div>)}</section>
            <section className="chm-scout-replays" aria-label="Recent observed encounters"><h3>Recent encounters · from #{target.id}’s side</h3>{report.recent.map(row => <article key={row.battleId}><div><span>Fight #{row.battleId} · vs #{row.opponentId}</span><button type="button" aria-label={`Scout replay fight #${row.battleId}`} onClick={() => replay(row)}><Play size={13} aria-hidden="true" /> Replay</button></div><div><RoundPips rounds={row.rounds} /><b>{row.rounds.filter(Boolean).length}–{row.rounds.filter(won => !won).length} <small>{row.won ? 'WIN' : 'LOSS'}</small></b></div></article>)}</section>
          </>}
          <p className="chm-scout-note"><Lock size={13} aria-hidden="true" /> Past results reveal neither a current plan nor the next Zama roll.{!!target.replans && ` This defender has replanned ${target.replans} ${target.replans === 1 ? 'time' : 'times'}.`}</p>
        </>}
        <Button className="w-full" onClick={close}>Back to planning</Button>
      </div>
    </div>
  </div>, host)
}
