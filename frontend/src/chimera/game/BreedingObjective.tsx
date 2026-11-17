import { useId, useState } from 'react'
import { ArrowLeftRight, Lock, Target } from 'lucide-react'
import { LOCI } from '../genetics'
import { Button, Link } from '../ui'
import { breedingGoalOdds } from './breeding-goal'

type Parent = { id: number | null; traits?: number[]; loci: Record<number, number> }
const chance = (value: number) => value === 0 ? '0%' : value < 0.005 ? '<0.5%' : `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`

export function BreedingObjective({ a, b, swap }: { a: Parent; b: Parent; swap: () => void }) {
  const [locus, setLocus] = useState(4)
  const [threshold, setThreshold] = useState(12)
  const selectId = useId()
  const left = a.traits && { expressed: a.traits[locus], locus: a.loci[locus] }
  const right = b.traits && { expressed: b.traits[locus], locus: b.loci[locus] }
  const odds = left && right ? breedingGoalOdds(left, right, threshold) : null
  const reversed = left && right ? breedingGoalOdds(right, left, threshold) : null
  const goal = `${threshold === 12 ? 'Rare' : 'Mythic'} ${LOCI[locus].name}`
  const range = odds ? odds.certain ? chance(odds.min) : `${chance(odds.min)} – ${chance(odds.max)}` : '—'
  const unavailable = !a.id || !b.id ? 'Choose two parents' : !left || !right ? 'Reading visible parental traits…' : 'Forecast unavailable for these gene reads'

  return <section className="chm-breeding-objective" aria-label="Offspring goal planner">
    <h3><Target size={15} aria-hidden="true" /> Restore a bloodline</h3>
    <div className="chm-goal-controls"><label htmlFor={selectId}>Trait target<select id={selectId} value={locus} onChange={event => setLocus(Number(event.target.value))}>{LOCI.slice(0, 7).map((entry, index) => <option key={entry.key} value={index}>{entry.name}</option>)}</select></label><div role="group" aria-label="Target rarity">{[12, 15].map(value => <button key={value} type="button" aria-pressed={value === threshold} onClick={() => setThreshold(value)}>{value === 12 ? 'Rare+' : 'Mythic'}</button>)}</div></div>
    <div className="chm-goal-odds" role="status" aria-live="polite"><span>{goal}</span><b>{range}</b><small>{odds ? odds.certain ? 'Determined for this trait target' : 'Range across unread alleles' : unavailable}</small></div>
    {odds && <>
      <div className="chm-goal-range" aria-hidden="true"><i style={{ width: `${odds.max * 100}%` }} /><b style={{ width: `${odds.min * 100}%` }} /></div>
      <p>{odds.knownParents}/2 parental loci read. {odds.certain ? 'The target probability is determined; the offspring is still a random on-chain outcome.' : 'This bound covers all compatible hidden alleles. Sequencing can narrow it; no genesis-gene prior is assumed.'}</p>
      {reversed && <div className="chm-goal-swap"><span>Swapped: <b>{reversed.certain ? chance(reversed.min) : `${chance(reversed.min)} – ${chance(reversed.max)}`}</b></span><Button variant="ghost" className="!px-2 !text-xs" onClick={swap}><ArrowLeftRight size={14} aria-hidden="true" /> Swap A / B</Button></div>}
      <p><Lock size={12} aria-hidden="true" /> Zama mutates Parent A’s inherited allele at 1/32. Swapping changes which parent supplies it.</p>
      {[a, b].filter(parent => parent.id && parent.loci[locus] == null).map(parent => <Link key={parent.id} to={`creature/${parent.id}/genome`} className="chm-goal-inspect">Inspect {LOCI[locus].name} · #{parent.id}</Link>)}
    </>}
  </section>
}
