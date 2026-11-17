import { useState } from 'react'
import { ArrowRight, Footprints, Lamp, Undo2, Crown } from 'lucide-react'
import { Button, Link } from '../ui'
import { Backdrop } from './art'
import { BeaconScout } from './BeaconScout'
import { BeaconTower } from './BeaconTower'
import { beaconRouteMatches, beaconStep, loadBeacon, resolveBeacon, saveBeacon, type BeaconEnding, type BeaconEvidence, type BeaconRecord, type BeaconRune } from './beacon'

const RUNES = [
  { id: 'crest', label: 'Crest', Icon: Crown },
  { id: 'paw', label: 'Tracks', Icon: Footprints },
  { id: 'lantern', label: 'Lantern', Icon: Lamp },
] as const
const ENDINGS = {
  shelter: { title: 'Light for the Nursery', text: 'Lumen turns the lens inward. Hatchlings can now find their way back to the warm stone. She leaves you the old keepers’ work: raise a bloodline they would have protected.', action: 'Visit the Nursery', to: 'breed' },
  wayfinding: { title: 'Light for the road', text: 'Sable turns the lens toward the dunes. For the first time in years the scouts can mark a road home. He points to the Spore Hollows, where the old road once continued.', action: 'Scout the next route', to: 'expeditions' },
} as const

export function BeaconChapter({ scope, guestScope, evidence, specimen, connected }: {
  scope: string; guestScope: string; evidence: BeaconEvidence; specimen: number | null; connected: boolean
}) {
  const [record, setRecord] = useState(() => loadBeacon(scope) ?? loadBeacon(guestScope))
  const [route, setRoute] = useState<BeaconRune[]>([])
  const step = beaconStep(evidence, record)
  const tuned = beaconRouteMatches(route)

  function remember(next: BeaconRecord) {
    saveBeacon(scope, next)
    setRecord(next)
  }

  function commit(ending: BeaconEnding) {
    const next = record && resolveBeacon(evidence, record, route, ending)
    if (next) remember(next)
  }

  const ending = record?.ending && ENDINGS[record.ending]
  const archiveAvailable = connected && specimen != null
  return <section className="chm-beacon" aria-labelledby="chm-beacon-title">
    <div className="chm-beacon-scene" data-lit={step === 'finished' || (step === 'relay' && tuned)}>
      <Backdrop theme="zone" zone={0} moving={step === 'field'} />
      <BeaconTower />
      <div className="chm-beacon-title"><span>Keeper’s Journal</span><h2 id="chm-beacon-title">The Silent Beacon</h2></div>
    </div>
    <div className="chm-beacon-body">
      {step === 'locked' && <>
        <p><b>Lumen</b> “The watchtower has been dark for years. Last night its bell rang, and the wilds came to the wall.”</p>
        <Link to="arena/trial/start" className="chm-btn chm-btn-primary">Practice with Lumen<ArrowRight size={17} aria-hidden="true" /></Link>
        <p className="chm-beacon-note">One practice match opens the investigation. No wallet needed.</p>
      </>}

      {step === 'choose-lead' && <>
        <p><b>Lumen</b> “After your fight, the bell called again. There was no light in the tower. We need to know what the old keepers built it for.”</p>
        <div className="chm-beacon-options">
          <button type="button" onClick={() => remember({ lead: 'field' })}><Footprints size={20} aria-hidden="true" /><span><b>Follow the tracks</b><small>Scout Ashen Dunes with Sable. No wallet needed.</small></span><ArrowRight size={17} aria-hidden="true" /></button>
          {archiveAvailable && <button type="button" onClick={() => remember({ lead: 'archive' })}><Lamp size={20} aria-hidden="true" /><span><b>Read the old records</b><small>Use a sequenced gene or read a new one on Sepolia.</small></span><ArrowRight size={17} aria-hidden="true" /></button>}
        </div>
      </>}

      {step === 'archive' && <>
        <p><b>Lumen</b> “The old keepers drew their trail marks from creatures they raised. Sequence a gene and compare what you find with my records. The allele stays yours to share.”</p>
        <Link to={specimen != null ? `creature/${specimen}/genome` : 'lab'} className="chm-btn chm-btn-primary">{specimen != null ? 'Open the Genome tab' : 'Visit the Lab'}<ArrowRight size={17} aria-hidden="true" /></Link>
        <Button variant="ghost" onClick={() => remember({ lead: 'field' })}>Follow the tracks</Button>
      </>}

      {step === 'field' && <>
        <BeaconScout onFound={() => remember({ lead: 'field', scouted: true })} />
        {archiveAvailable && <Button variant="ghost" onClick={() => remember({ lead: 'archive' })}>Read the old records</Button>}
      </>}

      {step === 'relay' && <>
        <p><b>{record?.lead === 'archive' ? 'Lumen' : 'Sable'}</b> {record?.lead === 'archive'
          ? '“The old diagram shows a keeper lifting a lantern over fresh tracks. There’s a crest in the margin: their mark for the end of the trail.”'
          : '“Our scout found fresh pawprints at the trailhead and a lamp post farther on. The stone at the end bears a crest. The road stones match these switches.”'}</p>
        <div className="chm-beacon-relay">
          <h3>Restore the relay</h3>
          <ol aria-label="Selected relay marks">{[0, 1, 2].map(i => {
            const mark = RUNES.find(rune => rune.id === route[i])
            return <li key={i}>{mark ? <><mark.Icon size={18} aria-hidden="true" />{mark.label}</> : '·'}</li>
          })}</ol>
          <div className="chm-beacon-runes" aria-label="Relay marks">{RUNES.map(({ id, Icon, label }) => <Button key={id} variant="ghost" disabled={route.includes(id)} onClick={() => setRoute([...route, id])}><Icon size={17} aria-hidden="true" />{label}</Button>)}</div>
          {route.length > 0 && !tuned && <Button variant="ghost" onClick={() => setRoute(route.slice(0, -1))}><Undo2 size={16} aria-hidden="true" />Undo last mark</Button>}
          {route.length === 3 && <p role="status">{tuned ? 'The beacon answers.' : 'The beacon flickers and goes dark. Try another order.'}</p>}
        </div>
        {tuned && <>
          <p><b>Lumen</b> “The bell was calling creatures home. The lens is cracked and can face only one way. Turn it in to guide the hatchlings, or out to light the scouts’ road.”</p>
          <div className="chm-beacon-options">
            <button type="button" onClick={() => commit('shelter')}><Lamp size={20} aria-hidden="true" /><span><b>Guide the hatchlings</b><small>Turn the lens toward the Nursery.</small></span></button>
            <button type="button" onClick={() => commit('wayfinding')}><Footprints size={20} aria-hidden="true" /><span><b>Guide the scouts</b><small>Turn the lens toward the road.</small></span></button>
          </div>
        </>}
      </>}

      {step === 'finished' && ending && <>
        <h3>{ending.title}</h3><p>{ending.text}</p>
        <Link to={archiveAvailable ? ending.to : 'lab'} className="chm-btn chm-btn-primary">{archiveAvailable ? ending.action : 'Meet your own specimen'}<ArrowRight size={17} aria-hidden="true" /></Link>
        {!archiveAvailable && <p className="chm-beacon-note">Chapter complete. When you’re ready, hatch a specimen on Sepolia.</p>}
      </>}
    </div>
  </section>
}
