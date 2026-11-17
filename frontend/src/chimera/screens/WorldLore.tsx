import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import CreatureArt from '../CreatureArt'
import { Backdrop, Px, type Theme } from '../game/art'
import { BeaconTower } from '../game/BeaconTower'
import { DepthDoorArt } from '../game/DepthDoorArt'
import { PxIcon, type PxIconName } from '../game/hud'
import { PROF, PROF_PAL, SABLE, SABLE_PAL } from '../game/map-art'
import { Link } from '../ui'
import './world-lore.css'

const SCOUT_COMPANION = [3, 6, 7, 5, 8, 11, 5]
const RING_RIVAL = [7, 2, 12, 8, 5, 7, 11]

const REGIONS = [
  {
    id: 'lab', name: 'Lab', theme: 'lab', icon: 'egg', title: 'Where a Xeno begins', action: 'Visit the Lab',
    text: 'The first archivists read genomes to cure sick Xenos. Then the hunters came asking which eggs would grow into weapons. The archivists left the Vault with one last oath to keep. A Xeno’s shape was for anyone to see. Its hidden genes belonged to its Keeper.',
  },
  {
    id: 'arena', name: 'Colosseum', theme: 'arena', icon: 'sword', title: 'The oath in the ring', action: 'Enter the Colosseum',
    text: 'The Colosseum kept the oath after the archivists disappeared. Each side seals three commands before the gates open. The crowd learns who won each round. It leaves knowing as little about the loser’s bloodline as it did on the way in.',
  },
  {
    id: 'dunes', name: 'Ashen Dunes', theme: 'zone', icon: 'flag', title: 'The road beneath the sand', action: 'Visit the Expedition Gate',
    text: 'The old road crossed these flats before the storms buried its markers. Sable scouts the ridges now, reading wind, prints and the marks cut into waystones. On the morning the bell rang, the wilds were already at the city wall. Their tracks led straight to the tower.',
  },
  {
    id: 'depths', name: 'Depths', theme: 'lair', icon: 'skull', title: 'What the city buried', action: 'Enter the Depths',
    text: 'The oldest passages run beneath the Vault. A lantern lets you read one of three doors. The other two could hide supplies or a trap. Few Keepers agree on who sealed them. They agree on carrying a lantern.',
  },
] as const satisfies readonly { id: string; name: string; theme: Theme; icon: PxIconName; title: string; action: string; text: string }[]

const KEEPERS = [
  {
    name: 'Professor Lumen', role: 'The Lab', rows: PROF, palette: PROF_PAL,
    line: '“They wanted a ledger of weapons. The Vault kept a record of living things.”',
    text: 'She teaches new Keepers how to read a gene. When the beacon calls, she goes to the old records first.',
  },
  {
    name: 'Sable', role: 'Ashen Dunes', rows: SABLE, palette: SABLE_PAL,
    line: '“A print across yesterday’s drift tells me someone passed after the storm.”',
    text: 'He scouts the approaches to the city. He trusts a print in the sand more than a line in a ledger.',
  },
] as const

export default function WorldLore() {
  const [region, setRegion] = useState<(typeof REGIONS)[number]>(REGIONS[0])

  return (
    <article className="chm-lore" aria-labelledby="lore-title">
      <header className="chm-lore-hero">
        <div className="chm-lore-dunes" role="img" aria-label="Lumen and Sable stand with a specimen below the unlit watchtower in Ashen Dunes">
          <div className="chm-lore-sky" aria-hidden="true"><Backdrop theme="zone" zone={0} /></div>
          <div className="chm-lore-skyshade" aria-hidden="true" />
          <div className="chm-lore-haze" aria-hidden="true" />
          <BeaconTower className="chm-lore-tower" />
          <span className="chm-lore-hero-lumen" aria-hidden="true"><Px rows={PROF} pal={PROF_PAL} /></span>
          <span className="chm-lore-hero-sable" aria-hidden="true"><Px rows={SABLE} pal={SABLE_PAL} /></span>
          <span className="chm-lore-hero-specimen" aria-hidden="true"><CreatureArt traits={SCOUT_COMPANION} seed={3} size={120} /></span>
        </div>
        <div className="chm-lore-opening">
          <h1 id="lore-title" className="font-display">The Arkhive</h1>
          <p className="chm-lore-hook">The bell rang. The tower stayed dark.</p>
          <p>For a hundred years the Vault has hatched Xenos and guarded their secrets. Then a bell rang from a watchtower with no light, and the wild Xenos gathered at the wall.</p>
          <p>Lumen finds the tower in the old records. Sable finds fresh tracks in the dunes. As a Keeper, you decide what to do with what they uncover.</p>
          <Link to="journal" className="chm-btn chm-btn-primary">Play The Silent Beacon<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </header>

      <section className="chm-lore-section" aria-labelledby="lore-regions">
        <h2 id="lore-regions" className="font-display">Explore the Arkhive</h2>
        <div className="chm-lore-regions" role="group" aria-label="Places in the Arkhive">
          {REGIONS.map(place => <button key={place.id} type="button" aria-pressed={region.id === place.id} aria-controls="lore-region" onClick={() => setRegion(place)}>
            <PxIcon name={place.icon} size={17} /><span>{place.name}</span>
          </button>)}
        </div>
        <div id="lore-region" className="chm-lore-region" aria-live="polite">
          <div key={region.id} className="chm-lore-region-art" aria-hidden="true">
            <Backdrop theme={region.theme} zone={0} />
            {region.id === 'lab' && <div className="chm-lore-art-solo"><CreatureArt seed={17} size={112} /></div>}
            {region.id === 'arena' && <div className="chm-lore-art-pair">
              <CreatureArt traits={SCOUT_COMPANION} seed={3} size={104} />
              <CreatureArt traits={RING_RIVAL} seed={9} size={104} />
            </div>}
            {region.id === 'dunes' && <div className="chm-lore-art-scout"><Px rows={SABLE} pal={SABLE_PAL} /></div>}
            {region.id === 'depths' && <div className="chm-lore-art-doors"><DepthDoorArt /><DepthDoorArt lit /><DepthDoorArt /></div>}
          </div>
          <div className="chm-lore-region-copy">
            <h3 className="font-display">{region.title}</h3>
            <p>{region.text}</p>
            <Link to={region.id === 'dunes' ? 'expeditions' : region.id} className="chm-lore-region-link">{region.action}<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className="chm-lore-section" aria-labelledby="lore-keepers">
        <h2 id="lore-keepers" className="font-display">Meet your guides</h2>
        <div className="chm-lore-guides">
          {KEEPERS.map(({ name, role, rows, palette, line, text }) => <article className="chm-lore-guide" key={name}>
            <div className="chm-lore-portrait" aria-hidden="true"><Px rows={rows} pal={palette} /></div>
            <div>
              <p className="chm-lore-guide-role">{role}</p>
              <h3 className="font-display">{name}</h3>
              <blockquote>{line}</blockquote>
              <p>{text}</p>
            </div>
          </article>)}
        </div>
      </section>
    </article>
  )
}
