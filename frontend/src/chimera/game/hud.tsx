import type { CSSProperties } from 'react'
import { Px } from './art'

/** Tiny pixel sprites for HUD chips and toasts. 'k' outline, others are fills. */
const SPRITES: Record<string, string[]> = {
  bolt: ['....kkk', '...kyyk', '..kyyk.', '.kyyyk.', 'kyyyyyk', '.kkyyk.', '..kyk..', '.kyk...', '.kk....'],
  check: ['.......kk', '......kgk', '.kk..kgk.', 'kgk.kgk..', '.kgkgk...', '..kgk....', '...k.....'],
  cross: ['kk...kk', 'krk.krk', '.krkrk.', '..krk..', '.krkrk.', 'krk.krk', 'kk...kk'],
  hourglass: ['kkkkkkk', 'kwwwwwk', '.kyyyk.', '..kyk..', '...k...', '..kwk..', '.kwyyk.', 'kyyyyyk', 'kkkkkkk'],
  paw: ['.k...k.', 'kpk.kpk', '.k.k.k.', '..kpk..', '.kpppk.', 'kpppppk', '.kkkkk.'],
  info: ['.kkkkk.', 'kbbwbbk', 'kbbbbbk', 'kbbwbbk', 'kbbwbbk', 'kbbwbbk', '.kkkkk.'],
  egg: ['..kkk..', '.kwwwk.', 'kwwpwwk', 'kwwwwwk', 'kwpwwpk', 'kwwwwwk', '.kkkkk.'],
  sword: ['......k', '.....kw', '....kwk', 'k..kwk.', '.kkwk..', '.kok...', 'kk.kk..'],
  skull: ['.kkkkk.', 'kwwwwwk', 'kwkwkwk', 'kwwwwwk', '.kwkwk.', '.kkkkk.'],
  star: ['...k...', '..kyk..', 'kkkyykk', 'kyyyyyk', '.kyyyk.', 'kyk.kyk', 'kk...kk'],
  coin: ['.kkkkk.', 'kyyyyyk', 'kyykyyk', 'kykkkyk', 'kyykyyk', 'kyyyyyk', '.kkkkk.'],
  eye: ['.kkkkk.', 'kwwkwwk', 'kwkbkwk', 'kwwkwwk', '.kkkkk.'],
  gem: ['.kkkkk.', 'kwvvvvk', 'kkkkkkk', 'kvvvvvk', '.kvvvk.', '..kvk..', '...k...'],
  flag: ['kkkkk..', 'kgggkk.', 'kggggk.', 'kgggkk.', 'kkkk...', 'k......', 'k......'],
}
const PAL: Record<string, string> = { k: '#111', y: '#FFDD00', g: '#3DDC97', r: '#FF4D4D', w: '#fff', p: '#FF8FC7', b: '#2B50F5', o: '#FF7020', v: '#B06CFF' }
const DIM: Record<string, string> = { k: '#8a877d', y: '#e4e1d6' }

export type PxIconName = keyof typeof SPRITES

export function PxIcon({ name, size = 14, dim, className, style }: { name: PxIconName; size?: number; dim?: boolean; className?: string; style?: CSSProperties }) {
  const rows = SPRITES[name]
  const w = Math.max(...rows.map((r) => r.length))
  return (
    <span className={`inline-block shrink-0 ${className ?? ''}`} style={{ width: (size * w) / rows.length, height: size, ...style }}>
      <Px rows={rows} pal={dim ? { ...PAL, ...DIM } : PAL} />
    </span>
  )
}

/** Energy as pixel lightning pips: lit ones bob, spent ones are greyed. */
export function EnergyPips({ value, max = 3, size = 14, className = '' }: { value?: number | null; max?: number; size?: number; className?: string }) {
  const v = value ?? 0
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} role="img" aria-label={value == null ? 'energy loading' : `${v} of ${max} energy`}>
      {Array.from({ length: max }, (_, i) => (
        <PxIcon key={i} name="bolt" size={size} dim={value == null || i >= v} className={i < v ? 'chm-pip-on' : ''} style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  )
}
