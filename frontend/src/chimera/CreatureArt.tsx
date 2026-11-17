import { useMemo } from 'react'
import { N, INK, GLYPHS, Grid, toPaths, buildCreature, buildEgg, buildEvolution } from './sprite'

export { STAGE_NAMES } from './sprite'

function Pixels({ g, className, style }: { g: Grid; className?: string; style?: React.CSSProperties }) {
  return (
    <g className={className} style={style}>
      {toPaths(g).map(([c, d]) => (
        <path key={c} d={d} fill={c} />
      ))}
    </g>
  )
}

/* ───────────── components ───────────── */

export interface CreatureArtProps {
  /** 7 visible phenotype values (0..15). Undefined → sealed egg. */
  traits?: number[] | null
  /** private element phenotype (0..15) if the viewer knows it */
  element?: number | null
  seed?: number
  size?: number
  animate?: boolean
  className?: string
  /** draw the cracked egg in "decrypting" state */
  hatching?: boolean
  /** evolution stage from training: 0 none, 1 Ascended (Lv 5), 2 Sovereign (Lv 10) */
  stage?: number
}

const SVG_STYLE: React.CSSProperties = { imageRendering: 'pixelated', overflow: 'visible' }

export default function CreatureArt({ traits, element, seed = 1, size = 220, animate = true, className, hatching, stage = 0 }: CreatureArtProps) {
  const ready = !!traits && traits.length >= 7
  const key = ready ? traits!.slice(0, 7).join(',') : ''
  const built = useMemo(() => (ready ? buildCreature(traits!.slice(0, 7), seed, element) : null), [key, seed, element, ready])
  const evo = useMemo(() => (built && stage ? buildEvolution(built.body, stage) : null), [built, stage])
  const egg = useMemo(() => (ready ? null : buildEgg(seed, hatching)), [ready, seed, hatching])
  const shadow = (
    <g fill={INK} opacity={0.16}>
      <rect x={9} y={30} width={14} height={1} />
      <rect x={11} y={31} width={10} height={1} />
    </g>
  )
  if (!built)
    return (
      <svg viewBox={`0 0 ${N} ${N}`} width={size} height={size} className={className} shapeRendering="crispEdges" style={SVG_STYLE} role="img" aria-label="Sealed embryo" data-animate={animate ? 1 : 0}>
        {shadow}
        <Pixels g={egg!} className={hatching ? 'chm-pxshake' : 'chm-pxbob-slow'} />
      </svg>
    )
  return (
    <svg viewBox={`0 0 ${N} ${N}`} width={size} height={size} className={className} shapeRendering="crispEdges" style={SVG_STYLE} role="img" aria-label="Pixel monster" data-animate={animate ? 1 : 0}>
      <Pixels g={built.aura} className="chm-pxtwinkle" />
      <Pixels g={built.auraB} className="chm-pxtwinkle-b" />
      {shadow}
      <g className="chm-pxbob" style={{ animationDelay: `${-(seed % 7) * 0.13}s` }}>
        {evo && <Pixels g={evo} />}
        <Pixels g={built.body} />
        <Pixels g={built.blink} className="chm-pxblink" style={{ animationDelay: `${-(seed % 11) * 0.41}s` }} />
      </g>
      {built.badge && <Pixels g={built.badge} />}
    </svg>
  )
}

/** Pixel element badge, for use inside an existing <svg>. Centred at (x,y), r = half its width. */
export function ElementSigil({ glyph, color, x = 170, y = 30, r = 13 }: { glyph: string; color: string; x?: number; y?: number; r?: number }) {
  const cell = (2 * r) / 9
  const rows = GLYPHS[glyph] ?? GLYPHS.void
  const ink = glyph === 'tide' || glyph === 'void' ? '#ffffff' : INK
  const x0 = x - r
  const y0 = y - r
  return (
    <g shapeRendering="crispEdges">
      <rect x={x0 + cell} y={y0 + cell} width={2 * r} height={2 * r} fill={INK} />
      <rect x={x0} y={y0} width={2 * r} height={2 * r} fill={INK} />
      <rect x={x0 + cell} y={y0 + cell} width={cell * 7} height={cell * 7} fill={color} />
      {rows.map((row, j) =>
        [...row].map((ch, i) => (ch === '#' ? <rect key={`${i}-${j}`} x={x0 + cell * (2 + i)} y={y0 + cell * (2 + j)} width={cell} height={cell} fill={ink} /> : null)),
      )}
    </g>
  )
}
