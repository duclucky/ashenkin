import CreatureArt from '../CreatureArt'
import { speciesName } from '../genetics'
import { useCreature, useTraits, useTraining } from '../hooks'
import { Backdrop } from './art'
import { SpecimenRoster } from './SpecimenRoster'
import { Lock } from 'lucide-react'

function Champion({ id }: { id: number }) {
  const creature = useCreature(id)
  const traits = useTraits(creature.data)
  const training = useTraining(id)
  const name = traits.data ? speciesName(traits.data) : `Specimen #${id}`
  return <>
    <CreatureArt traits={traits.data} seed={id} stage={training.data?.stage ?? 0} size={190} />
    <span className="chm-prep-name"><b>{name}</b><small>#{id} · LV {training.data?.level ?? 0}</small></span>
  </>
}

export function ArenaPreparation({ ids, selected, onSelect, duel }: { ids: number[]; selected: number | null; onSelect: (id: number) => void; duel: boolean }) {
  return <section className="chm-arena-preview" aria-label="Choose your champion">
    <div className="chm-prep-scene">
      <Backdrop theme="arena" />
      <span className="chm-prep-caption">COLOSSEUM / {duel ? 'KEEPER DUEL' : 'WILD HUNT'}</span>
      <div className="chm-prep-champion">{selected ? <Champion id={selected} /> : <span>Choose a champion below</span>}</div>
      <span className="chm-prep-vs" aria-hidden="true">VS</span>
      <div className="chm-prep-unknown"><div className="chm-prep-silhouette" aria-hidden="true"><CreatureArt seed={7} traits={[8, 4, 3, 9, 6, 5, 2]} size={170} /></div><span className="chm-prep-name"><b>{duel ? 'Keeper opponent' : 'Unknown wild'}</b><small><Lock size={11} /> Power & plan sealed</small></span></div>
    </div>
    <SpecimenRoster ids={ids} selected={selected ? [selected] : []} onSelect={onSelect} label="Your champions" selectionLabel="Choose champion" />
  </section>
}
