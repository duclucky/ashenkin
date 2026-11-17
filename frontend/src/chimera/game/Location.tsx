import type { CSSProperties, ReactNode } from 'react'
import { Backdrop, CHEST_CLOSED, CHEST_PAL, LOCK, LOCK_PAL, Px, type Theme } from './art'
import { BUILDINGS, PROF, PROF_PAL } from './map-art'

type Place = { title: string; theme: Theme; sprite?: string; accent: string; item?: 'chest' | 'lock' | 'guide' | 'creature'; zone?: number }

const places = {
  map: { title: 'The Arkhive', theme: 'meadow', sprite: 'lab', accent: '#ffdd00', item: 'creature' },
  lab: { title: 'Lab', theme: 'lab', sprite: 'lab', accent: '#72e4bd', item: 'creature' },
  creature: { title: 'Specimen file', theme: 'lab', sprite: 'lab', accent: '#72e4bd', item: 'creature' },
  breed: { title: 'Nursery', theme: 'lab', sprite: 'breed', accent: '#ff9bca', item: 'creature' },
  arena: { title: 'Colosseum', theme: 'arena', sprite: 'arena', accent: '#ffbe72', item: 'creature' },
  expeditions: { title: 'Expedition Gate', theme: 'zone', zone: 1, sprite: 'expeditions', accent: '#a4f0cf', item: 'chest' },
  raid: { title: 'Boss Lair', theme: 'lair', sprite: 'raid', accent: '#ff946f', item: 'creature' },
  training: { title: 'Dojo', theme: 'dojo', sprite: 'training', accent: '#ffcf85', item: 'creature' },
  relics: { title: 'Relic Forge', theme: 'vault', sprite: 'relics', accent: '#d3a9ff', item: 'chest' },
  oracle: { title: 'Oracle', theme: 'vault', sprite: 'oracle', accent: '#a4f0cf', item: 'guide' },
  raffle: { title: 'Raffle Tent', theme: 'arena', sprite: 'raffle', accent: '#ff9bca', item: 'chest' },
  depths: { title: 'Arkhive Depths', theme: 'lair', sprite: 'depths', accent: '#d3a9ff', item: 'chest' },
  quests: { title: 'Quest Board', theme: 'meadow', sprite: 'quests', accent: '#ffdd00', item: 'guide' },
  market: { title: 'Market', theme: 'meadow', sprite: 'market', accent: '#ffbe72', item: 'chest' },
  economy: { title: 'Treasury', theme: 'vault', sprite: 'economy', accent: '#ffdd00', item: 'chest' },
  hall: { title: 'Hall of Keepers', theme: 'dojo', sprite: 'arena', accent: '#ffdd00', item: 'guide' },
  journal: { title: 'Keeper’s Journal', theme: 'meadow', sprite: 'quests', accent: '#a4f0cf', item: 'guide' },
  fairness: { title: 'Proof Center', theme: 'vault', sprite: 'lab', accent: '#b5cbff', item: 'lock' },
  verify: { title: 'Genome Verifier', theme: 'lab', sprite: 'lab', accent: '#b5cbff', item: 'lock' },
  about: { title: 'Arkhive Archives', theme: 'meadow', sprite: 'lab', accent: '#ffdd00', item: 'guide' },
  guide: { title: 'How to Play', theme: 'meadow', sprite: 'lab', accent: '#ffdd00', item: 'guide' },
} satisfies Record<string, Place>

export type LocationId = keyof typeof places

export function Location({ place, children, actions, foreground }: { place: LocationId; children?: ReactNode; actions?: ReactNode; foreground?: ReactNode }) {
  const location: Place = places[place]
  const sprite = location.sprite && BUILDINGS[location.sprite]
  return (
    <section className={`chm-location${place === 'creature' ? ' chm-location-file' : ''}`} aria-labelledby="location-title" style={{ '--place-accent': location.accent } as CSSProperties}>
      <div className="chm-location-art" aria-hidden="true">
        <Backdrop theme={location.theme} zone={location.zone} tint={location.accent} />
        {sprite && <svg className="chm-location-building" viewBox={`0 0 ${sprite.w} ${sprite.h}`} shapeRendering="crispEdges">{sprite.draw()}</svg>}
        <div className="chm-location-item">
          {foreground ?? (location.item === 'chest' && <Px rows={CHEST_CLOSED} pal={CHEST_PAL} />)}
          {location.item === 'lock' && <Px rows={LOCK} pal={LOCK_PAL} />}
          {location.item === 'guide' && <Px rows={PROF} pal={PROF_PAL} />}
        </div>
      </div>
      <div className="chm-location-copy">
        <h1 id="location-title" className="font-display">{location.title}</h1>
        {children && <div className="chm-location-status">{children}</div>}
        {actions && <div className="chm-location-actions">{actions}</div>}
      </div>
    </section>
  )
}

export function LocationNotes({ title = 'How to play', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="chm-panel px-4">
      <summary className="min-h-11 cursor-pointer py-3 font-bold">{title}</summary>
      <div className="border-t border-[var(--chm-line)] py-3 text-sm leading-relaxed">{children}</div>
    </details>
  )
}
