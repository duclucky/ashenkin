import CreatureArt from '../CreatureArt'
import { speciesName } from '../genetics'
import { useCreature, useTraits, useTraining } from '../hooks'

function RosterEntry({ id, badge }: { id: number; badge?: string }) {
  const creature = useCreature(id)
  const traits = useTraits(creature.data)
  const training = useTraining(id)
  return <>
    <CreatureArt traits={traits.data} seed={id} stage={training.data?.stage ?? 0} size={48} />
    <span className="chm-roster-name"><b>{traits.data ? speciesName(traits.data) : `Specimen #${id}`}</b><small>#{id} · LV {training.data?.level ?? 0}</small></span>
    {badge && <span className="chm-roster-badge">{badge}</span>}
  </>
}

export function SpecimenRoster({ ids, selected, onSelect, label = 'Your specimens', selectionLabel = 'Choose specimen', badges }: {
  ids: number[]
  selected: number[]
  onSelect: (id: number) => void
  label?: string
  selectionLabel?: string
  badges?: Record<number, string>
}) {
  return <div className="chm-specimen-roster" role="group" aria-label={label}>
    {ids.map(id => <button key={id} type="button" aria-label={`${selectionLabel} #${id}${badges?.[id] ? `: Parent ${badges[id]}` : ''}`} aria-pressed={selected.includes(id)} onClick={() => onSelect(id)}><RosterEntry id={id} badge={badges?.[id]} /></button>)}
  </div>
}
