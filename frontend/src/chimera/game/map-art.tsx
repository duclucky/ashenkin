import type { ReactNode } from 'react'

/* Pixel buildings for the world map. Each one is drawn on its own small grid. */

const K = '#243033'
const W = '#e8e1cd'
const Y = '#FFD209'
const B = '#496982'
const O = '#d78b59'
const RD = '#ab574d'
const P = '#bf8292'
const M = '#79bd9d'
const C = '#86bdc8'
const BR = '#75573d'
const BL = '#ae8057'
const ST = '#bbb5a5'
const SD = '#817d73'

type RP = { x: number; y: number; w?: number; h?: number; c: string; cls?: string; delay?: number }
function R({ x, y, w = 1, h = 1, c, cls, delay }: RP) {
  return <rect x={x} y={y} width={w} height={h} fill={c} className={cls} style={delay != null ? { animationDelay: `${delay}s` } : undefined} />
}
/** filled box with a 1px ink outline */
function Box({ x, y, w, h, c }: { x: number; y: number; w: number; h: number; c: string }) {
  return (
    <>
      <R x={x} y={y} w={w} h={h} c={K} />
      <R x={x + 1} y={y + 1} w={w - 2} h={h - 2} c={c} />
    </>
  )
}
/** stepped triangle roof, apex at (cx, top), widening by `step` each row */
function Roof({ cx, top, rows, step = 2, c, edge = K }: { cx: number; top: number; rows: number; step?: number; c: string; edge?: string }) {
  const out: ReactNode[] = []
  for (let i = 0; i < rows; i++) {
    const half = 1 + i * step
    out.push(<R key={`e${i}`} x={cx - half - 1} y={top + i} w={half * 2 + 2} c={edge} />)
    if (i > 0 && i < rows - 1) out.push(<R key={`f${i}`} x={cx - half + 1} y={top + i} w={half * 2 - 2} c={c} />)
  }
  return <>{out}</>
}
function Shadow({ w, y }: { w: number; y: number }) {
  return <rect x={2} y={y} width={w - 4} height={2} fill="#000" opacity={0.18} />
}

export type BuildingArt = { w: number; h: number; draw: () => ReactNode }

export const BUILDINGS: Record<string, BuildingArt> = {
  lab: {
    w: 36,
    h: 34,
    draw: () => (
      <>
        <Shadow w={36} y={32} />
        {/* antenna */}
        <R x={17} y={0} w={2} h={4} c={K} />
        <R x={16} y={0} w={4} h={2} c={RD} />
        <R x={16} y={0} w={4} h={2} c="#ffb088" cls="chm-m-glow" />
        {/* dome */}
        <R x={9} y={4} w={18} h={8} c={K} />
        <R x={10} y={5} w={16} h={7} c={B} />
        <R x={12} y={6} w={4} h={2} c="#A8E4FF" />
        <R x={7} y={11} w={22} h={2} c={K} />
        {/* body */}
        <Box x={2} y={12} w={32} h={21} c={W} />
        <R x={3} y={13} w={30} h={2} c={Y} />
        <R x={3} y={15} w={30} h={1} c={SD} />
        <R x={3} y={24} w={30} h={1} c={ST} />
        <R x={3} y={29} w={30} h={3} c={ST} />
        {[5, 25].map((x) => (
          <g key={x}>
            <Box x={x} y={17} w={7} h={6} c={C} />
            <R x={x + 1} y={18} w={2} h={1} c="#fff" />
          </g>
        ))}
        {/* tube in the middle window: green liquid + bubbles */}
        <Box x={14} y={16} w={8} h={7} c="#B8F5D8" />
        <R x={15} y={19} w={6} h={3} c={M} />
        <R x={15} y={19} w={6} h={2} c="#b8f5d8" cls="chm-m-glow" />
        <R x={16} y={20} w={1} h={1} c="#fff" cls="chm-m-particle" />
        <R x={19} y={21} w={2} h={1} c="#fff" cls="chm-m-particle" delay={-0.6} />
        {/* door */}
        <R x={14} y={24} w={8} h={9} c={K} />
        <R x={15} y={25} w={6} h={8} c={Y} />
        <R x={19} y={28} w={1} h={1} c={K} />
        {/* steps */}
        <R x={12} y={32} w={12} h={1} c={SD} />
      </>
    ),
  },
  breed: {
    w: 32,
    h: 28,
    draw: () => (
      <>
        <Shadow w={32} y={26} />
        <Roof cx={16} top={0} rows={9} step={2} c={RD} />
        <Box x={3} y={8} w={26} h={19} c={P} />
        <R x={4} y={9} w={24} h={1} c="#ffc2e0" />
        {/* heart sign */}
        <g className="chm-m-anim chm-m-bob">
          <R x={12} y={11} w={3} h={1} c={K} />
          <R x={17} y={11} w={3} h={1} c={K} />
          <R x={11} y={12} w={10} h={3} c={K} />
          <R x={12} y={12} w={2} h={2} c={RD} />
          <R x={18} y={12} w={2} h={2} c={RD} />
          <R x={14} y={13} w={4} h={2} c={RD} />
          <R x={12} y={14} w={8} h={1} c={RD} />
          <R x={12} y={15} w={8} h={1} c={K} />
          <R x={13} y={16} w={6} h={1} c={K} />
          <R x={14} y={17} w={4} h={1} c={K} />
          <R x={15} y={18} w={2} h={1} c={K} />
          <R x={13} y={13} w={6} h={2} c="#ffb4ad" cls="chm-m-glow" />
        </g>
        {/* round windows */}
        <Box x={5} y={18} w={5} h={5} c={C} />
        <Box x={22} y={18} w={5} h={5} c={C} />
        {/* door */}
        <R x={12} y={20} w={8} h={7} c={K} />
        <R x={13} y={21} w={6} h={6} c={W} />
        <R x={15} y={21} w={2} h={6} c={P} />
      </>
    ),
  },
  arena: {
    w: 44,
    h: 30,
    draw: () => (
      <>
        <Shadow w={44} y={28} />
        {/* flags */}
        {[6, 21, 36].map((x, i) => (
          <g key={x}>
            <R x={x} y={0} w={1} h={8} c={K} />
            <g className="chm-m-flag" style={{ animationDelay: `${-i * 0.25}s` }}>
              <R x={x + 1} y={0} w={5} h={3} c={i === 1 ? RD : O} />
            </g>
          </g>
        ))}
        {/* tiered colosseum */}
        <R x={3} y={7} w={38} h={22} c={K} />
        <R x={4} y={8} w={36} h={6} c="#c5a483" />
        <R x={4} y={14} w={36} h={1} c={K} />
        <R x={4} y={15} w={36} h={13} c="#ab896b" />
        <R x={4} y={24} w={36} h={1} c="#826d60" />
        <R x={4} y={26} w={36} h={2} c="#937760" />
        {/* arches */}
        {[6, 13, 27, 34].map((x) => (
          <g key={x}>
            <R x={x} y={9} w={4} h={4} c={K} />
            <R x={x + 1} y={10} w={2} h={3} c={O} />
            <R x={x} y={17} w={4} h={6} c={K} />
            <R x={x + 1} y={18} w={2} h={5} c="#5a2a10" />
          </g>
        ))}
        {/* gate */}
        <R x={18} y={15} w={8} h={13} c={K} />
        <R x={19} y={16} w={6} h={12} c="#3a1a08" />
        {[20, 22, 24].map((x) => (
          <R key={x} x={x} y={16} w={1} h={12} c={SD} />
        ))}
        {/* torches */}
        <R x={16} y={18} w={1} h={3} c={K} />
        <R x={15} y={16} w={3} h={2} c={Y} cls="chm-m-glow" />
        <R x={27} y={18} w={1} h={3} c={K} />
        <R x={26} y={16} w={3} h={2} c={Y} cls="chm-m-glow" delay={-1.5} />
      </>
    ),
  },
  expeditions: {
    w: 34,
    h: 34,
    draw: () => (
      <>
        <Shadow w={34} y={32} />
        {/* lintel */}
        <Box x={1} y={2} w={32} h={6} c={ST} />
        <R x={2} y={3} w={30} h={1} c="#e5e1d5" />
        <R x={14} y={0} w={6} h={3} c={K} />
        <R x={15} y={1} w={4} h={2} c={Y} />
        {/* pillars */}
        <Box x={3} y={7} w={7} h={26} c={ST} />
        <Box x={24} y={7} w={7} h={26} c={ST} />
        {[12, 19, 26].map((y) => (
          <g key={y}>
            <R x={4} y={y} w={5} h={1} c={SD} />
            <R x={25} y={y} w={5} h={1} c={SD} />
          </g>
        ))}
        {/* portal */}
        <R x={10} y={8} w={14} h={25} c="#0d3b2a" />
        <R x={11} y={10} w={12} h={21} c={M} cls="chm-m-swirl" />
        <R x={13} y={13} w={8} h={15} c={C} cls="chm-m-swirl" delay={-0.4} />
        <R x={15} y={13} w={4} h={15} c="#d2fff0" cls="chm-m-glow" delay={-0.8} />
        <R x={12} y={24} w={10} h={2} c="#e0fff6" cls="chm-m-current" />
        <R x={13} y={28} w={8} h={1} c="#e0fff6" cls="chm-m-current" delay={-0.9} />
        {[
          [12, 11],
          [21, 15],
          [13, 24],
          [20, 28],
        ].map(([x, y], i) => (
          <R key={i} x={x} y={y} c="#fff" cls="chm-m-blink" delay={-i * 0.3} />
        ))}
      </>
    ),
  },
  raid: {
    w: 44,
    h: 36,
    draw: () => (
      <>
        <Shadow w={44} y={34} />
        {/* smoke */}
        {[0, 1, 2].map((i) => (
          <rect key={i} x={19 + i * 2} y={4} width={3} height={3} fill="#6b6560" className="chm-m-smoke" style={{ animationDelay: `${-i * 1.05}s` }} />
        ))}
        {/* stepped volcano */}
        {Array.from({ length: 26 }, (_, i) => {
          const half = 5 + Math.round(i * 0.8)
          return (
            <g key={i}>
              <R x={22 - half - 1} y={8 + i} w={half * 2 + 2} c={K} />
              <R x={22 - half} y={8 + i} w={half * 2} c={i < 3 ? O : i % 7 === 3 ? '#4a4440' : '#3a3532'} />
            </g>
          )
        })}
        {/* lava drips */}
        <R x={18} y={10} w={2} h={6} c={O} />
        <R x={26} y={10} w={1} h={9} c={RD} />
        <R x={17} y={8} w={10} h={2} c={Y} cls="chm-m-glow" />
        {/* cave mouth */}
        <R x={14} y={22} w={16} h={12} c={K} />
        <R x={13} y={25} w={18} h={9} c={K} />
        <R x={16} y={23} w={12} h={11} c="#000" />
        {/* eyes */}
        <R x={18} y={27} w={2} h={1} c={RD} cls="chm-m-blink" />
        <R x={24} y={27} w={2} h={1} c={RD} cls="chm-m-blink" />
        {/* teeth */}
        {[15, 18, 21, 24, 27].map((x) => (
          <R key={x} x={x} y={23} w={1} h={2} c={W} />
        ))}
      </>
    ),
  },
  training: {
    w: 36,
    h: 32,
    draw: () => (
      <>
        <Shadow w={36} y={30} />
        {/* top roof */}
        <R x={16} y={0} w={4} h={2} c={Y} />
        <R x={8} y={2} w={20} h={2} c={K} />
        <R x={6} y={4} w={24} h={3} c={K} />
        <R x={7} y={4} w={22} h={2} c={RD} />
        <R x={4} y={5} w={3} h={2} c={K} />
        <R x={29} y={5} w={3} h={2} c={K} />
        {/* upper floor */}
        <Box x={10} y={7} w={16} h={6} c={W} />
        <R x={14} y={9} w={8} h={3} c={BR} />
        {/* lower roof */}
        <R x={3} y={13} w={30} h={3} c={K} />
        <R x={4} y={13} w={28} h={2} c={RD} />
        <R x={0} y={14} w={4} h={2} c={K} />
        <R x={32} y={14} w={4} h={2} c={K} />
        {/* hall */}
        <Box x={5} y={16} w={26} h={15} c={W} />
        <R x={6} y={17} w={24} h={1} c="#e8dfc8" />
        {[6, 28].map((x) => (
          <R key={x} x={x} y={17} w={2} h={13} c={BR} />
        ))}
        {/* sliding door + windows */}
        <R x={14} y={20} w={8} h={11} c={K} />
        <R x={15} y={21} w={3} h={10} c="#f3e6c0" />
        <R x={18} y={21} w={3} h={10} c="#f3e6c0" />
        <R x={9} y={20} w={4} h={4} c={K} />
        <R x={10} y={21} w={2} h={2} c={Y} cls="chm-m-glow" />
        <R x={23} y={20} w={4} h={4} c={K} />
        <R x={24} y={21} w={2} h={2} c={Y} cls="chm-m-glow" delay={-1.2} />
        {[9, 24].map((x) => <g key={x} className="chm-m-lantern">
          <R x={x + 1} y={14} h={2} c={K} />
          <Box x={x} y={16} w={4} h={4} c={O} />
          <R x={x + 1} y={17} w={2} h={2} c={Y} cls="chm-m-glow" />
        </g>)}
      </>
    ),
  },
  relics: {
    w: 26,
    h: 24,
    draw: () => (
      <>
        <Shadow w={26} y={22} />
        {/* chimney + smoke */}
        <Box x={18} y={0} w={5} h={9} c={SD} />
        <R x={19} y={0} w={3} h={1} c={K} />
        <R x={20} y={-2} w={3} h={2} c="#d8d8d8" cls="chm-m-smoke" />
        {/* stone hall */}
        <Roof cx={11} top={3} rows={6} step={2} c={RD} />
        <Box x={2} y={8} w={20} h={15} c={ST} />
        {[4, 10, 16].map((x) => (
          <R key={x} x={x} y={11} w={3} h={1} c={SD} />
        ))}
        <R x={7} y={13} w={3} h={1} c={SD} />
        <R x={14} y={13} w={3} h={1} c={SD} />
        {/* furnace mouth */}
        <R x={7} y={15} w={10} h={8} c={K} />
        <R x={8} y={16} w={8} h={7} c={O} />
        <R x={9} y={18} w={6} h={5} c={Y} cls="chm-m-glow" />
        <R x={12} y={19} w={2} h={2} c="#ffe9a7" cls="chm-m-particle" />
        {/* anvil outside */}
        <R x={21} y={17} w={5} h={2} c={K} />
        <R x={22} y={19} w={2} h={3} c={K} />
        <R x={21} y={22} w={4} h={1} c={K} />
        {/* gem sign */}
        <R x={10} y={4} w={4} h={1} c={K} />
        <R x={9} y={5} w={6} h={2} c={K} />
        <R x={10} y={5} w={4} h={1} c="#B06CFF" />
        <R x={11} y={6} w={2} h={1} c="#B06CFF" />
        <R x={10} y={5} w={1} h={1} c={W} cls="chm-m-blink" delay={-0.4} />
      </>
    ),
  },
  oracle: {
    w: 24,
    h: 26,
    draw: () => (
      <>
        <Shadow w={24} y={24} />
        {/* dome */}
        <R x={8} y={0} w={8} h={1} c={K} />
        <R x={6} y={1} w={12} h={1} c={K} />
        <R x={4} y={2} w={16} h={5} c={K} />
        <R x={7} y={1} w={10} h={1} c="#7a3fd0" />
        <R x={5} y={2} w={14} h={4} c="#7a3fd0" />
        <R x={6} y={2} w={3} h={1} c="#B06CFF" />
        {/* the eye */}
        <R x={9} y={3} w={6} h={3} c={W} />
        <R x={11} y={3} w={2} h={3} c={K} cls="chm-m-blink" />
        {/* lintel */}
        <Box x={2} y={7} w={20} h={3} c={Y} />
        {/* columns */}
        {[3, 9, 15, 19].map((x) => (
          <g key={x}>
            <R x={x} y={10} w={3} h={11} c={K} />
            <R x={x + 1} y={10} w={1} h={11} c={W} />
          </g>
        ))}
        <R x={6} y={10} w={3} h={11} c="#2a1747" />
        <R x={12} y={10} w={3} h={11} c="#2a1747" />
        <R x={16} y={10} w={3} h={11} c="#2a1747" />
        {/* glowing orb */}
        <g className="chm-m-anim chm-m-bob">
          <R x={10} y={14} w={5} h={5} c="#6685b5" cls="chm-m-glow" />
          <R x={11} y={15} w={3} h={3} c={C} />
          <R x={12} y={15} c="#ecffff" />
        </g>
        {/* steps */}
        <Box x={1} y={21} w={22} h={3} c={ST} />
        <R x={0} y={23} w={24} h={2} c={K} />
        <R x={1} y={23} w={22} h={1} c={SD} />
      </>
    ),
  },
  raffle: {
    w: 20,
    h: 22,
    draw: () => (
      <>
        <Shadow w={20} y={20} />
        {/* pennant */}
        <R x={10} y={0} w={1} h={4} c={K} />
        <g className="chm-m-flag">
          <R x={11} y={0} w={4} h={2} c={Y} />
          <R x={11} y={2} w={2} h={1} c={Y} />
        </g>
        {/* striped roof */}
        <Roof cx={10} top={3} rows={8} step={1} c={RD} />
        <R x={10} y={4} w={1} h={6} c={W} />
        <R x={6} y={8} w={1} h={2} c={W} />
        <R x={14} y={8} w={1} h={2} c={W} />
        {/* bulbs */}
        {[3, 7, 12, 16].map((x, i) => (
          <R key={x} x={x} y={10} w={1} h={1} c={Y} cls="chm-m-blink" delay={-i * 0.3} />
        ))}
        {/* booth */}
        <Box x={2} y={11} w={16} h={9} c={W} />
        <R x={4} y={12} w={2} h={7} c={RD} />
        <R x={14} y={12} w={2} h={7} c={RD} />
        <R x={8} y={13} w={4} h={7} c="#2a1747" />
        <R x={7} y={13} w={1} h={7} c={Y} />
        <R x={12} y={13} w={1} h={7} c={Y} />
        {/* the drum inside */}
        <R x={8} y={14} w={4} h={3} c={P} cls="chm-m-glow" delay={-0.5} />
        <R x={0} y={19} w={20} h={2} c={K} />
        <R x={1} y={19} w={18} h={1} c={SD} />
      </>
    ),
  },
  depths: {
    w: 22,
    h: 22,
    draw: () => (
      <>
        <Shadow w={22} y={20} />
        {/* rocky mound */}
        <R x={5} y={3} w={12} h={2} c={K} />
        <R x={3} y={5} w={16} h={2} c={K} />
        <R x={1} y={7} w={20} h={13} c={K} />
        <R x={6} y={4} w={10} h={1} c={SD} />
        <R x={4} y={6} w={14} h={1} c={SD} />
        <R x={2} y={8} w={18} h={11} c={ST} />
        <R x={3} y={9} w={3} h={2} c={SD} />
        <R x={16} y={10} w={3} h={2} c={SD} />
        <R x={4} y={15} w={2} h={2} c={SD} />
        <R x={17} y={15} w={2} h={3} c={SD} />
        {/* the mouth, with stairs going down */}
        <R x={7} y={9} w={8} h={11} c={K} />
        <R x={8} y={10} w={6} h={9} c="#1b1530" />
        <R x={8} y={12} w={6} h={1} c="#3a2d5c" />
        <R x={9} y={14} w={4} h={1} c="#3a2d5c" />
        <R x={10} y={16} w={2} h={1} c="#3a2d5c" />
        {/* purple glow from below */}
        <R x={8} y={16} w={6} h={3} c="#B66DFF" cls="chm-m-glow" delay={-0.4} />
        <R x={11} y={16} w={2} h={1} c="#e0bbff" cls="chm-m-particle" />
        {/* lantern on a post */}
        <R x={18} y={2} w={1} h={8} c={K} />
        <R x={16} y={2} w={3} h={1} c={K} />
        <R x={15} y={3} w={3} h={3} c={K} />
        <R x={16} y={4} w={1} h={1} c={Y} cls="chm-m-blink" />
        {/* skull marker */}
        <R x={2} y={17} w={3} h={2} c={W} />
        <R x={2} y={17} w={1} h={1} c={K} />
        <R x={4} y={17} w={1} h={1} c={K} />
        <R x={0} y={19} w={22} h={2} c={K} />
        <R x={1} y={19} w={20} h={1} c={SD} />
      </>
    ),
  },
  quests: {
    w: 26,
    h: 24,
    draw: () => (
      <>
        <Shadow w={26} y={22} />
        <R x={3} y={4} w={2} h={19} c={K} />
        <R x={21} y={4} w={2} h={19} c={K} />
        <Box x={1} y={1} w={24} h={15} c={BL} />
        <R x={2} y={2} w={22} h={1} c="#d9a26a" />
        <Box x={3} y={4} w={7} h={8} c={W} />
        <R x={4} y={6} w={5} h={1} c={SD} />
        <R x={4} y={8} w={4} h={1} c={SD} />
        <g className="chm-m-awning">
          <Box x={11} y={3} w={6} h={7} c={Y} />
          <R x={12} y={5} w={4} h={1} c={BR} />
          <R x={12} y={7} w={3} h={1} c={BR} />
        </g>
        <Box x={18} y={5} w={6} h={8} c={W} />
        <R x={19} y={7} w={4} h={1} c={SD} />
        <R x={19} y={9} w={4} h={1} c={SD} />
        <R x={6} y={3} w={1} h={1} c={RD} />
        <R x={13} y={2} w={1} h={1} c={RD} />
        <R x={20} y={4} w={1} h={1} c={RD} />
        <R x={11} y={11} w={4} h={4} c={K} />
        <R x={12} y={12} w={2} h={2} c={O} cls="chm-m-glow" />
      </>
    ),
  },
  well: {
    w: 22,
    h: 24,
    draw: () => (
      <>
        <Shadow w={22} y={22} />
        <Roof cx={11} top={0} rows={6} step={2} c={B} />
        <R x={4} y={5} w={2} h={10} c={K} />
        <R x={16} y={5} w={2} h={10} c={K} />
        <R x={6} y={7} w={10} h={1} c={BR} />
        <R x={10} y={8} w={1} h={3} c={K} />
        <R x={9} y={11} w={3} h={2} c={BL} cls="chm-m-lantern" />
        <Box x={2} y={14} w={18} h={9} c={ST} />
        <R x={3} y={15} w={16} h={2} c="#3a7bd5" />
        <R x={6} y={15} w={10} h={1} c="#90e5f7" cls="chm-m-glow" />
        {[5, 10, 15].map((x) => (
          <R key={x} x={x} y={18} w={3} h={1} c={SD} />
        ))}
        <R x={6} y={15} w={1} h={1} c={Y} cls="chm-m-blink" />
        <R x={14} y={16} w={1} h={1} c={Y} cls="chm-m-blink" delay={-0.6} />
      </>
    ),
  },
  market: {
    w: 36,
    h: 26,
    draw: () => (
      <>
        <Shadow w={36} y={24} />
        <R x={4} y={6} w={2} h={18} c={K} />
        <R x={30} y={6} w={2} h={18} c={K} />
        {/* striped awning */}
        <R x={1} y={2} w={34} h={7} c={K} />
        {Array.from({ length: 8 }, (_, i) => (
          <R key={i} x={2 + i * 4} y={3} w={4} h={5} c={i % 2 ? W : RD} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <R key={`s${i}`} x={2 + i * 4} y={8} w={4} h={2} c={K} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <R key={`t${i}`} x={3 + i * 4} y={7} w={3} h={3} c={i % 2 ? W : RD} cls="chm-m-awning" delay={-i * 0.16} />
        ))}
        {/* goods */}
        <R x={8} y={13} w={4} h={3} c={K} />
        <R x={9} y={13} w={2} h={2} c={M} />
        <R x={14} y={12} w={4} h={4} c={K} />
        <R x={15} y={13} w={2} h={2} c={P} />
        <R x={20} y={13} w={4} h={3} c={K} />
        <R x={21} y={13} w={2} h={2} c={C} />
        <R x={25} y={11} w={3} h={5} c={K} />
        <R x={26} y={12} w={1} h={3} c={Y} cls="chm-m-glow" />
        {/* counter */}
        <Box x={3} y={16} w={30} h={8} c={BL} />
        <R x={4} y={17} w={28} h={1} c="#d9a26a" />
        <R x={10} y={19} w={16} h={3} c={BR} />
      </>
    ),
  },
  economy: {
    w: 34,
    h: 30,
    draw: () => (
      <>
        <Shadow w={34} y={28} />
        <Roof cx={17} top={0} rows={8} step={2} c={ST} />
        <Box x={1} y={7} w={32} h={3} c={ST} />
        {/* coin emblem in pediment */}
        <R x={15} y={3} w={4} h={3} c={K} />
        <R x={16} y={3} w={2} h={2} c={Y} cls="chm-m-glow" />
        {/* columns */}
        {[3, 9, 22, 28].map((x) => (
          <g key={x}>
            <R x={x} y={10} w={3} h={16} c={K} />
            <R x={x + 1} y={10} w={1} h={16} c={W} />
          </g>
        ))}
        <R x={2} y={10} w={30} h={1} c={K} />
        {/* vault door */}
        <R x={12} y={11} w={10} h={15} c={K} />
        <R x={13} y={12} w={8} h={14} c={SD} />
        <R x={15} y={15} w={4} h={4} c={K} />
        <R x={16} y={16} w={2} h={2} c={Y} />
        <R x={14} y={21} w={6} h={1} c={K} />
        <Box x={0} y={26} w={34} h={3} c={ST} />
      </>
    ),
  },
}

/** The guide: Professor Lumen, an old keeper in a lab coat. 12×18. */
export const PROF = [
  '....kkkk....',
  '...kwwwwk...',
  '..kwwwwwwk..',
  '..kssssssk..',
  '..kskssksk..',
  '..kssssssk..',
  '..kswwwwsk..',
  '...kwwwwk...',
  '..kkkwwkkk..',
  '.kwwwbbwwwk.',
  'kwwwwbbwwwwk',
  'kwkwwbbwwkwk',
  'kskwwyywwksk',
  'kkkwwwwwwkkk',
  '..kwwwwwwk..',
  '..kwwkkwwk..',
  '..kkk..kkk..',
  '..kbk..kbk..',
]
export const PROF_PAL = { k: '#111111', w: '#ffffff', s: '#f2c49b', b: '#2B50F5', y: '#FFDD00' }

/** Sable, the scout at Ashen Dunes. Same 12×18 grid as Lumen. */
export const SABLE = [
  '....kkkk....',
  '...kggggk...',
  '..kggggggk..',
  '..kgssssgk..',
  '..kgksksgk..',
  '..kgssssgk..',
  '...kssssk...',
  '..kkrrrrkk..',
  '.kgggrrgggk.',
  'kgggggrggggk',
  'kgggtgggrgk.',
  'kgkggtggkgk.',
  'kskgggtyksk.',
  'kkkgggggkkk.',
  '..kttttttk..',
  '..kttkkttk..',
  '..kkk..kkk..',
  '..ktk..ktk..',
]
export const SABLE_PAL = { k: '#111111', g: '#3b7667', r: '#d36b3f', s: '#e3a979', t: '#36352f', y: '#ffdd00' }

/** Pixel tree, 10×12 */
export function Tree({ x, y, s = 0 }: { x: number; y: number; s?: number }) {
  const g = s % 2 ? '#548768' : '#437e69'
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={1} y={10} width={8} height={2} fill="#000" opacity={0.18} />
      <rect x={3} y={0} width={4} height={1} fill={K} />
      <rect x={1} y={1} width={8} height={1} fill={K} />
      <rect x={0} y={2} width={10} height={6} fill={K} />
      <rect x={1} y={8} width={8} height={1} fill={K} />
      <rect x={3} y={1} width={4} height={1} fill={g} />
      <rect x={1} y={2} width={8} height={6} fill={g} />
      <rect x={2} y={8} width={6} height={0.01} fill={g} />
      <rect x={2} y={2} width={3} height={2} fill="#83af89" />
      <rect x={4} y={9} width={2} height={3} fill={K} />
    </g>
  )
}
