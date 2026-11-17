import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'

/* Pixel scenery for the game stage. Everything is drawn on a 160×90 grid. */

export type Theme = 'lab' | 'lair' | 'dojo' | 'arena' | 'zone' | 'vault' | 'meadow'

function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stepped mountain/dune silhouette as a single path. */
function ridge(seed: number, base: number, amp: number, step = 4, width = 160) {
  const r = rng(seed)
  let d = ''
  let h = r() * amp
  for (let x = 0; x < width; x += step) {
    h = Math.max(0, Math.min(amp, h + (r() - 0.5) * amp * 0.7))
    const y = Math.round(base - h)
    d += `M${x} ${y}h${step}V90H${x}Z`
  }
  return d
}

function Dots({ seed, n, x0, x1, y0, y1, colors, size = 1, twinkle }: { seed: number; n: number; x0: number; x1: number; y0: number; y1: number; colors: string[]; size?: number; twinkle?: boolean }) {
  const pts = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: n }, () => ({ x: Math.round(x0 + r() * (x1 - x0)), y: Math.round(y0 + r() * (y1 - y0)), c: colors[Math.floor(r() * colors.length)], d: -r() * 1.4 }))
  }, [seed, n, x0, x1, y0, y1, colors.join()])
  return (
    <g>
      {pts.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={size} height={size} fill={p.c} className={twinkle ? 'chm-pxtwinkle' : undefined} style={twinkle ? { animationDelay: `${p.d}s` } : undefined} />
      ))}
    </g>
  )
}

const SVG: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }

export const ZONE_SKY = [
  { sky: ['#FFE680', '#FFD24D', '#FFB347'], far: '#E59A4A', mid: '#FF7020', floor: '#c24d0c', speck: '#FFDD00' },
  { sky: ['#B8F5D8', '#8BE8BF', '#5FD3A2'], far: '#2E9C6C', mid: '#1FA46A', floor: '#0f6a43', speck: '#B9F27C' },
  { sky: ['#9EDCFA', '#5AC8FA', '#2A8FC4'], far: '#2563c9', mid: '#2B50F5', floor: '#1a33b0', speck: '#A8E4FF' },
]

/** Full-stage background. `moving` scrolls the parallax layers (zones and meadow). */
export function Backdrop({ theme, zone = 0, tint, moving }: { theme: Theme; zone?: number; tint?: string; moving?: boolean }) {
  if (theme === 'zone' || theme === 'meadow') return <Parallax theme={theme} zone={zone} moving={!!moving} />
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="none" shapeRendering="crispEdges" style={SVG} aria-hidden>
      {theme === 'lab' && <Lab />}
      {theme === 'lair' && <Lair tint={tint} />}
      {theme === 'dojo' && <Dojo />}
      {theme === 'arena' && <ArenaBg />}
      {theme === 'vault' && <Vault />}
    </svg>
  )
}

function Lab() {
  const light = useId()
  return (
    <>
      <defs><radialGradient id={light}><stop stopColor="#477f79" stopOpacity=".43" /><stop offset="1" stopColor="#18242d" stopOpacity="0" /></radialGradient></defs>
      <rect width="160" height="66" fill="#1c2b36" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} transform={`translate(${i * 20} 0)`}>
          <path d="M0 0h3v62H0zM4 11h14v2H4zM4 51h14v1H4z" fill="#293d47" />
          <path d="M3 12h1v42H3zM4 52h14v1H4z" fill="#172733" />
        </g>
      ))}
      <rect y="7" width="160" height="4" fill="#405260" />
      <rect y="7" width="160" height="1" fill="#64747a" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={i * 24 + 6} y="5" width="3" height="8" fill="#2a3160" />
      ))}
      {[8, 124].map((x) => (
        <g key={x}>
          <rect x={x} y="18" width="28" height="20" fill="#0d1022" />
          <rect x={x + 2} y="20" width="24" height="16" fill="#0b3a2e" />
          {[0, 1, 2, 3].map((j) => (
            <rect key={j} x={x + 4} y={22 + j * 4} width={8 + ((j * 7 + x) % 12)} height="1" fill="#3DDC97" className="chm-pxtwinkle" style={{ animationDelay: `${-j * 0.35}s` }} />
          ))}
          <rect x={x + 12} y="38" width="4" height="6" fill="#0d1022" />
        </g>
      ))}
      <ellipse cx="80" cy="41" rx="66" ry="33" fill={`url(#${light})`} />
      <path d="M54 63V24h3v-6h46v6h3v39M58 63V26h3v-5h38v5h3v37" fill="none" stroke="#587577" />
      <path d="M66 20h28M54 62h52M18 57h24m76 0h24" stroke="#7eb2a0" strokeOpacity=".55" />
      <Dots seed={7} n={8} x0={42} x1={118} y0={16} y1={36} colors={['#83a99c', '#bfa778']} twinkle />
      <rect y="66" width="160" height="24" fill="#293843" />
      {Array.from({ length: 20 }, (_, i) =>
        [0, 1, 2, 3].map((j) => ((i + j) % 2 ? <rect key={`${i}-${j}`} x={i * 8} y={66 + j * 6} width="8" height="6" fill="#31434b" /> : null)),
      )}
      <rect y="66" width="160" height="1" fill="#678184" />
    </>
  )
}

function Lair({ tint = '#FF7020' }: { tint?: string }) {
  return (
    <>
      <rect width="160" height="20" fill="#1a0606" />
      <rect y="20" width="160" height="18" fill="#3a0c08" />
      <rect y="38" width="160" height="14" fill="#6a1a0e" />
      <rect y="52" width="160" height="14" fill="#a8321a" />
      <g fill={tint} opacity="0.85">
        <rect x="114" y="10" width="12" height="16" />
        <rect x="110" y="13" width="20" height="10" />
        <rect x="112" y="11" width="16" height="14" />
      </g>
      <Dots seed={3} n={20} x0={0} x1={160} y0={2} y1={30} colors={['#ff9a6b', '#ffd0a0']} twinkle />
      <path d={ridge(11, 46, 20, 5)} fill="#2a0a06" />
      <path d={ridge(23, 62, 12, 4)} fill="#160403" />
      <rect y="66" width="160" height="24" fill="#2b0b06" />
      <rect y="66" width="160" height="1" fill="#5a1a0c" />
      {[
        [8, 72, 14],
        [30, 80, 10],
        [58, 74, 18],
        [92, 84, 12],
        [118, 76, 16],
        [140, 70, 12],
      ].map(([x, y, w], i) => (
        <g key={i} className="chm-pxtwinkle" style={{ animationDelay: `${-i * 0.3}s` }}>
          <rect x={x} y={y} width={w} height="1" fill="#FF7020" />
          <rect x={x + 3} y={y + 1} width={w - 6} height="1" fill="#FFDD00" />
        </g>
      ))}
    </>
  )
}

function Dojo() {
  return (
    <>
      <rect width="160" height="66" fill="#f1d6a0" />
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} x={i * 8} y="13" width="1" height="37" fill="#dcbd84" />
      ))}
      {[22, 31, 40].map((y) => (
        <rect key={y} y={y} width="160" height="1" fill="#dcbd84" />
      ))}
      {[0, 52, 105, 157].map((x) => (
        <rect key={x} x={x} y="0" width="3" height="66" fill="#8e5a28" />
      ))}
      <rect y="10" width="160" height="3" fill="#8e5a28" />
      <rect y="50" width="160" height="3" fill="#8e5a28" />
      <rect x="70" y="18" width="20" height="20" fill="#8e5a28" />
      <rect x="72" y="20" width="16" height="16" fill="#FFDD00" />
      <rect x="76" y="24" width="8" height="8" fill="#FF7020" />
      {[18, 132].map((x) => (
        <g key={x}>
          <rect x={x} y="14" width="10" height="28" fill="#E5341D" />
          <rect x={x} y="14" width="10" height="2" fill="#a51f10" />
          <rect x={x + 3} y="22" width="4" height="4" fill="#FFDD00" />
          <rect x={x + 4} y="28" width="2" height="8" fill="#FFDD00" />
          <rect x={x} y="42" width="2" height="3" fill="#E5341D" />
          <rect x={x + 8} y="42" width="2" height="3" fill="#E5341D" />
        </g>
      ))}
      <rect y="66" width="160" height="24" fill="#c08443" />
      {[70, 75, 80, 85].map((y, j) => (
        <g key={y}>
          <rect y={y} width="160" height="1" fill="#9b6630" />
          {Array.from({ length: 5 }, (_, i) => (
            <rect key={i} x={((i * 37 + j * 19) % 160) + 4} y={y - 4} width="1" height="4" fill="#9b6630" />
          ))}
        </g>
      ))}
      <rect y="66" width="160" height="2" fill="#7a4a22" />
    </>
  )
}

function ArenaBg() {
  const dusk = useId()
  return (
    <>
      <defs><linearGradient id={dusk} x2="0" y2="1"><stop stopColor="#253443" /><stop offset="1" stopColor="#bd8c76" /></linearGradient></defs>
      <rect width="160" height="42" fill={`url(#${dusk})`} />
      <path d={ridge(27, 34, 16, 4)} fill="#635969" />
      <path d={ridge(38, 37, 10, 3)} fill="#434c56" />
      <path d="M0 24h15v3h14v3h16v3h20v2h30v-2h20v-3h16v-3h14v-3h15v37H0z" fill="#675851" />
      <path d="M0 26h15v3h14v3h16v3h20v2h30v-2h20v-3h16v-3h14v-3h15" fill="none" stroke="#bc9e7c" />
      <path d="M0 36h15v2h17v2h17v2h62v-2h17v-2h17v-2h15v28H0z" fill="#907867" />
      <path d="M0 45h160M0 52h160M0 58h160" stroke="#766459" />
      <Dots seed={5} n={28} x0={0} x1={158} y0={33} y1={42} colors={['#b9a181', '#a78167', '#615d61']} />
      {[10, 33, 56, 79, 102, 125, 148].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <path d="M-8 64V51h2v-4h3v-2h6v2h3v4h2v13z" fill="#493e39" />
          <path d="M-6 64V52h2v-4h8v4h2v12z" fill="#262c32" />
          <path d="M-9 56h2v8h-2zm16 0h2v8H7z" fill="#b08d6c" />
          <rect x="-1" y="53" width="2" height="4" fill="#e0ae74" className="chm-pxtwinkle" />
        </g>
      ))}
      <rect y="64" width="160" height="26" fill="#ad8b65" />
      <path d="M0 64h160v2H0zM0 85h160v5H0z" fill="#876f5b" />
      <path d="M21 74h18v-2h82v2h18v6h-21v2H42v-2H21z" fill="#bfa079" />
      <path d="M68 74h24v2h4v2h-4v2H68v-2h-4v-2h4z" fill="none" stroke="#937556" />
      <Dots seed={9} n={36} x0={0} x1={160} y0={66} y1={89} colors={['#947856', '#c7aa82']} />
    </>
  )
}

function Vault() {
  return (
    <>
      <rect width="160" height="66" fill="#2a2010" />
      {Array.from({ length: 11 }, (_, j) =>
        Array.from({ length: 11 }, (_, i) => <rect key={`${i}-${j}`} x={i * 16 + (j % 2 ? 8 : 0)} y={j * 6} width="15" height="5" fill="#3a2c16" />),
      )}
      <path d={ridge(31, 64, 8, 3)} fill="#FFDD00" />
      <path d={ridge(37, 66, 4, 2)} fill="#e0b400" />
      <Dots seed={13} n={26} x0={0} x1={160} y0={56} y1={64} colors={['#fff6b0', '#ffffff']} twinkle />
      <rect y="66" width="160" height="24" fill="#1a140a" />
      <rect y="66" width="160" height="1" fill="#4a3a1c" />
    </>
  )
}

function Parallax({ theme, zone, moving }: { theme: 'zone' | 'meadow'; zone: number; moving: boolean }) {
  const z = theme === 'meadow' ? { sky: ['#CFEFFF', '#A8E4FF', '#8fd3f7'], far: '#7cc79a', mid: '#3DDC97', floor: '#1FA46A', speck: '#FFDD00' } : ZONE_SKY[zone] ?? ZONE_SKY[0]
  const far = useMemo(() => ridge(41 + zone, 50, 14, 6), [zone])
  const mid = useMemo(() => ridge(53 + zone, 62, 10, 4), [zone])
  const pause = moving ? '' : ' chm-g-paused'
  const layer = (d: string, fill: string, cls: string, extra?: ReactNode) => (
    <div className={`absolute inset-y-0 left-0 w-[200%] ${cls}${pause}`}>
      <svg viewBox="0 0 320 90" preserveAspectRatio="none" shapeRendering="crispEdges" style={SVG} aria-hidden>
        <path d={d} fill={fill} />
        <path d={d} fill={fill} transform="translate(160 0)" />
        {extra}
      </svg>
    </div>
  )
  return (
    <>
      <svg viewBox="0 0 160 90" preserveAspectRatio="none" shapeRendering="crispEdges" style={SVG} aria-hidden>
        <rect width="160" height="30" fill={z.sky[0]} />
        <rect y="30" width="160" height="16" fill={z.sky[1]} />
        <rect y="46" width="160" height="20" fill={z.sky[2]} />
        {theme === 'meadow' || zone === 0 ? (
          <g fill="#FFF6B0">
            <rect x="128" y="8" width="12" height="12" />
            <rect x="126" y="10" width="16" height="8" />
          </g>
        ) : zone === 2 ? (
          <Dots seed={17} n={18} x0={0} x1={160} y0={4} y1={40} colors={['#ffffff', '#d6f3ff']} twinkle />
        ) : (
          <Dots seed={19} n={22} x0={0} x1={160} y0={10} y1={60} colors={['#FFF6B0', '#ffffff']} size={1} twinkle />
        )}
      </svg>
      {layer(
        '',
        'none',
        'chm-g-scroll',
        <g fill="#ffffff" opacity="0.85">
          {[12, 70, 130, 190, 250, 300].map((x, i) => (
            <g key={i}>
              <rect x={x} y={8 + (i % 3) * 6} width="18" height="4" />
              <rect x={x + 4} y={5 + (i % 3) * 6} width="9" height="3" />
            </g>
          ))}
        </g>,
      )}
      {layer(far, z.far, 'chm-g-scroll')}
      {layer(mid, z.mid, 'chm-g-scroll-mid')}
      {layer(
        'M0 66h320V90H0Z',
        z.floor,
        'chm-g-scroll-fast',
        <>
          <rect y="66" width="320" height="1" fill={z.speck} opacity="0.6" />
          {Array.from({ length: 40 }, (_, i) => (
            <rect key={i} x={(i * 41) % 320} y={70 + ((i * 7) % 18)} width={i % 3 ? 2 : 4} height="1" fill={z.speck} opacity="0.45" />
          ))}
        </>,
      )}
    </>
  )
}

/* ───────────── props (tiny sprites) ───────────── */

export function Px({ rows, pal, className, style }: { rows: string[]; pal: Record<string, string>; className?: string; style?: CSSProperties }) {
  const w = Math.max(...rows.map((r) => r.length))
  const rects = useMemo(() => {
    const out: { x: number; y: number; w: number; c: string }[] = []
    rows.forEach((row, y) => {
      let x = 0
      while (x < row.length) {
        const ch = row[x]
        if (!pal[ch]) {
          x++
          continue
        }
        let e = x
        while (e < row.length && row[e] === ch) e++
        out.push({ x, y, w: e - x, c: pal[ch] })
        x = e
      }
    })
    return out
  }, [rows.join('|'), JSON.stringify(pal)])
  return (
    <svg viewBox={`0 0 ${w} ${rows.length}`} shapeRendering="crispEdges" className={className} style={{ width: '100%', height: '100%', overflow: 'visible', ...style }} aria-hidden>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />
      ))}
    </svg>
  )
}

export const DUMMY = [
  '....kkkkk....',
  '...kyyyyyk...',
  '..kyyyyyyyk..',
  '..kyyrrryyk..',
  '..kyrwwwryk..',
  '..kyrwrwryk..',
  '..kyrwwwryk..',
  '..kyyrrryyk..',
  'kkkkyyyyykkkk',
  'kbbbbbbbbbbbk',
  'kkkkyyyyykkkk',
  '..kyyyyyyyk..',
  '..kyyyyyyyk..',
  '...kyyyyyk...',
  '....kbbbk....',
  '....kbbbk....',
  '....kbbbk....',
  '....kbbbk....',
  '..kkkbbbkkk..',
  '.kbbbbbbbbbk.',
  'kkkkkkkkkkkkk',
]
export const DUMMY_PAL = { k: '#111111', y: '#e0b860', r: '#E5341D', w: '#ffffff', b: '#8e5a28' }

export const CHEST_CLOSED = [
  '..kkkkkkkkkkkk..',
  '.kooooooooooook.',
  'kooyyyyyyyyyyook',
  'kooyooooooooyook',
  'kkkkkkkkkkkkkkkk',
  'kyyyyyykkyyyyyyk',
  'kooooookyykooook',
  'kooooookkkkooook',
  'kooooooooooooook',
  'kyyyyyyyyyyyyyyk',
  'kooooooooooooook',
  'kkkkkkkkkkkkkkkk',
]
export const CHEST_OPEN = [
  '..kkkkkkkkkkkk..',
  '.kooooooooooook.',
  'kooyyyyyyyyyyook',
  'kkkkkkkkkkkkkkkk',
  'kwyywwyyyywwyywk',
  'kyywyyyywyyyywyk',
  'kkkkkkkkkkkkkkkk',
  'kooooookyykooook',
  'kooooooooooooook',
  'kyyyyyyyyyyyyyyk',
  'kooooooooooooook',
  'kkkkkkkkkkkkkkkk',
]
export const CHEST_PAL = { k: '#111111', o: '#a0602a', y: '#FFDD00', w: '#ffffff' }

export const COIN = ['.kkkk.', 'kyyyyk', 'kywyyk', 'kywyyk', 'kyyyyk', '.kkkk.']
export const COIN_PAL = { k: '#111111', y: '#FFDD00', w: '#fff6b0' }

export const HEART = ['.kk.kk.', 'kppkppk', 'kpwpppk', 'kpppppk', '.kpppk.', '..kpk..', '...k...']
export const HEART_PAL = { k: '#111111', p: '#FF8FC7', w: '#ffffff' }

export const LOCK = ['..kkk..', '.k...k.', '.k...k.', 'kkkkkkk', 'kyyyyyk', 'kyykyyk', 'kyykyyk', 'kyyyyyk', 'kkkkkkk']
export const LOCK_PAL = { k: '#111111', y: '#FFDD00' }

export const ALERT = ['kkk', 'kyk', 'kyk', 'kyk', 'kkk', '...', 'kkk', 'kyk', 'kkk']
export const ALERT_PAL = { k: '#111111', y: '#FFDD00' }
