import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import CreatureArt from '../CreatureArt'
import { useCreature, useTraits, useTraining } from '../hooks'
import { speciesName } from '../genetics'
import { travel } from './Transition'
import { Backdrop } from './art'
import { sfx, unlockAudio } from './sfx'

/** A pixel meadow where the keeper's creatures wander around. Click one to open it. */
export default function Habitat({ ids }: { ids: number[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const shown = ids.slice(0, 12)
  const h = Math.round(Math.min(320, Math.max(200, w * 0.3)))
  const size = Math.round(Math.max(64, Math.min(112, h * 0.36)))
  return (
    <div ref={box} className="chm-habitat relative overflow-hidden border border-[var(--chm-line)]" style={{ height: h }}>
      <Backdrop theme="meadow" />
      <div className="absolute left-4 top-4 z-20 bg-[#000000] px-3 py-2 font-mono text-[11px] tracking-wider text-[#FFD209]">HABITAT · {ids.length}</div>
      {shown.map((id, i) => (
        <Roamer key={id} id={id} i={i} n={shown.length} w={w} h={h} size={size} />
      ))}
    </div>
  )
}

function Roamer({ id, i, n, w, h, size }: { id: number; i: number; n: number; w: number; h: number; size: number }) {
  const c = useCreature(id)
  const t = useTraits(c.data)
  const tr = useTraining(id)
  const [hop, setHop] = useState(0)
  const p = useMemo(() => {
    const r = (k: number) => {
      const x = Math.sin(id * 97.13 + k * 13.7) * 43758.5453
      return x - Math.floor(x)
    }
    return { lane: r(1), start: r(2), dist: 0.12 + r(3) * 0.22, d: 9 + r(4) * 10, dl: -r(5) * 18 }
  }, [id])
  const slot = (i + 0.5) / Math.max(1, n)
  const left = Math.max(0, Math.min(w - size, (slot * 0.8 + p.start * 0.12) * w - size / 2))
  const dist = Math.min(p.dist * w, Math.max(30, w - left - size))
  // creatures further back are a bit smaller and drawn behind
  const depth = p.lane
  const s = Math.round(size * (0.82 + depth * 0.18))
  const bottom = Math.round(h * 0.06 + (1 - depth) * h * 0.14)
  const name = t.data ? speciesName(t.data) : `#${id}`
  const timing = { ['--d' as string]: `${p.d}s`, ['--dl' as string]: `${p.dl}s` } as CSSProperties
  return (
    <button
      type="button"
      className="absolute cursor-pointer border-0 bg-transparent p-0"
      style={{ left, bottom, width: s, zIndex: 2 + Math.round(depth * 10) }}
      onClick={() => {
        unlockAudio()
        sfx.select()
        setHop((x) => x + 1)
        travel(`creature/${id}`)
      }}
      onMouseEnter={() => {
        setHop((x) => x + 1)
        sfx.hop()
      }}
      title={`${name}: open`}
    >
      <div className="chm-g-roamx relative" style={{ ...timing, ['--dist' as string]: `${dist}px` } as CSSProperties}>
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap bg-[#000000] px-2 py-1 font-mono text-[10px] text-[#f5f5e9]">
          {name.toUpperCase()} · LV{tr.data?.level ?? 0}
        </div>
        <div className="chm-g-flipx" style={timing}>
          <div key={hop} className={hop ? 'chm-g-hop' : undefined} style={hop ? { animationIterationCount: 2 } : undefined}>
            <div className="chm-g-steps" style={{ animationDuration: '.5s' }}>
              <CreatureArt traits={t.data} seed={id} size={s} stage={tr.data?.stage ?? 0} />
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}
