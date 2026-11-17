import { useState } from 'react'
import { ArrowRight, Check, Dna, HeartHandshake, Lock, Swords } from 'lucide-react'
import CreatureArt from '../CreatureArt'
import { useCreature, useTraits } from '../hooks'
import { Button, Link } from '../ui'
import { Backdrop, Px } from './art'
import { PROF, PROF_PAL } from './map-art'
import type { CampaignEvidence, CampaignProgress } from './campaign'

const ACTS = [
  { title: 'Keeper’s pact', short: 'Pact', Icon: Swords, theme: 'arena', line: 'The vault has chosen no champion for you. Bring a living specimen through the blind gates. Victory is welcome; a completed fight is what proves you answered.', objectives: ['own', 'fight'] },
  { title: 'Reading the dark', short: 'Research', Icon: Dna, theme: 'lab', line: 'Looks are only half a bloodline. Read a gene with your own key, then bring two specimens to the Nursery. What you learn stays yours until you choose to disclose it.', objectives: ['read', 'pair'] },
  { title: 'Blood of two lines', short: 'Lineage', Icon: HeartHandshake, theme: 'lab', line: 'Restore a rare crest in the next generation. Raise a specimen with two recorded parents, then find the crest in its public looks. The vault chooses inheritance in secret; you choose the bloodlines.', objectives: ['bred', 'crest'] },
] as const
type Objective = keyof CampaignProgress
const LABELS: Record<Objective, string> = { own: 'Keep a living specimen', fight: 'Settle a Colosseum fight', read: 'Read a locus', pair: 'Bring two bloodlines', bred: 'Raise a bred specimen', crest: 'Restore a Rare Crest' }

function route(key: Objective, evidence: CampaignEvidence) {
  if (key === 'own') return 'lab'
  if (key === 'fight') return 'arena'
  if (key === 'read') return evidence.specimen ? `creature/${evidence.specimen}/genome` : 'lab'
  return 'breed'
}

export function CampaignBoard({ connected, progress }: { connected: boolean; progress: CampaignProgress }) {
  const [selected, setSelected] = useState<number | null>(null)
  const nextAct = ACTS.findIndex(act => act.objectives.some(key => progress[key].done !== true))
  const index = selected ?? (nextAct < 0 ? 2 : nextAct)
  const act = ACTS[index]
  const done = Object.values(progress).filter(row => row.done === true).length
  const next = act.objectives.find(key => progress[key].done !== true)
  const witness = act.objectives.map(key => progress[key].specimen).find(id => id != null) ?? progress.own.specimen
  const creature = useCreature(witness)
  const traits = useTraits(creature.data)

  return <section className="chm-campaign" aria-label="Keeper campaign">
    <nav aria-label="Story acts">{ACTS.map((entry, current) => <button key={entry.short} type="button" aria-pressed={current === index} onClick={() => setSelected(current)}><entry.Icon size={17} aria-hidden="true" /><span>{entry.short}</span><small>{entry.objectives.filter(key => progress[key].done === true).length}/2</small></button>)}</nav>
    <div className="chm-campaign-scene">
      <Backdrop theme={act.theme} />
      <div className="chm-campaign-actors" aria-hidden="true"><div className="chm-g-bob"><Px rows={PROF} pal={PROF_PAL} /></div>{witness && <CreatureArt traits={traits.data} seed={witness} size={150} />}</div>
      <div className="chm-campaign-title"><span>ACT {index + 1} · {connected ? `${done}/6 objectives confirmed` : 'A keeper’s story'}</span><h2>{act.title}</h2></div>
    </div>
    <div className="chm-campaign-body"><p><b>Professor Lumen</b>{act.line}</p>
      <ol aria-label={`${act.short} objectives`}>{act.objectives.map(key => {
        const evidence = progress[key]
        return <li key={key} data-done={evidence.done === true}><span>{evidence.done ? <Check size={16} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}</span><div><b>{LABELS[key]}</b><small>{evidence.done === null ? connected ? 'Checking Sepolia evidence…' : 'Your record starts with a wallet' : evidence.done ? evidence.specimen ? `Observed on specimen #${evidence.specimen}` : `${evidence.count} settled ${evidence.count === 1 ? 'fight' : 'fights'}` : 'Not yet observed in your current record'}</small></div>{evidence.done && evidence.specimen && <Link to={`creature/${evidence.specimen}`} className="chm-campaign-proof">View</Link>}</li>
      })}</ol>
      {!connected ? <Link to="arena/trial" className="chm-btn chm-btn-primary w-full">Begin with Lumen’s trial <ArrowRight size={15} aria-hidden="true" /></Link> : next ? progress[next].done === null ? <Button className="w-full" disabled>Reading Sepolia record…</Button> : <Link to={route(next, progress[next])} className="chm-btn chm-btn-primary w-full">{next === 'own' ? 'Visit the Lab' : next === 'fight' ? 'Enter the Colosseum' : next === 'read' ? 'Inspect a genome' : next === 'pair' ? 'Choose parents' : 'Plan a Rare Crest'}<ArrowRight size={15} aria-hidden="true" /></Link> : index < ACTS.length - 1 ? <Button className="w-full" onClick={() => setSelected(index + 1)}>Continue the story <ArrowRight size={15} aria-hidden="true" /></Button> : <Link to="breed" className="chm-btn chm-btn-primary w-full">Grow the next bloodline <ArrowRight size={15} aria-hidden="true" /></Link>}
      <small className="chm-campaign-note">Story progress reflects your current on-chain record. It grants no extra tokens or XP. <Link to="quests">Daily rewards · Quest Board</Link></small>
    </div>
  </section>
}
