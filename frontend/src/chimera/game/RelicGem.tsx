import { TIERS_R } from '../season'

const GEM = ['...kkkkkk...', '..kwlcccck..', '.kwlcccccdk.', 'kkkkkkkkkkkk', 'kllcccccccdk', '.kllcccccdk.', '..kllcccdk..', '...kllcdk...', '....klck....', '.....kk.....']

/** Pixel gem in the colour of its tier; `null` tier = still sealed. */
export function RelicGem({ tier, size = 64, glow }: { tier: number | null | undefined; size?: number; glow?: boolean }) {
  const sealed = tier == null
  const base = sealed ? '#2b2b2b' : TIERS_R[tier].color
  const pal: Record<string, string> = { k: '#111', w: '#fff', l: sealed ? '#555' : lighten(base), c: base, d: sealed ? '#1a1a1a' : darken(base) }
  const px = size / 12
  return (
    <svg width={size} height={(size * 10) / 12} viewBox="0 0 12 10" shapeRendering="crispEdges" style={{ imageRendering: 'pixelated', filter: glow && !sealed ? `drop-shadow(0 0 ${px * 2}px ${base})` : undefined }}>
      {GEM.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={pal[ch] ?? base} />)),
      )}
      {sealed && (
        <text x="6" y="7" textAnchor="middle" fontSize="4.2" fontWeight="900" fill="#FFDD00" fontFamily="monospace">
          ?
        </text>
      )}
    </svg>
  )
}

function mix(hex: string, t: number, to: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + to * t)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}
const lighten = (h: string) => mix(h, 0.45, 255)
const darken = (h: string) => mix(h, 0.4, 0)
