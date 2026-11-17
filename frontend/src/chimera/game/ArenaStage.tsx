import { useId, type CSSProperties } from 'react'
import CreatureArt from '../CreatureArt'
import { arenaMove, MoveImpact, MoveWindup } from './ArenaEffects'
import './arena-stage.css'

export const ARENA_TIMING = { intro: 420, moves: 570, impact: 580, finish: 480 }
export type ArenaBeat = 'idle' | 'intro' | 'waiting' | 'moves' | 'impact' | 'result'
type Fighter = { name: string; traits: number[] | null; seed: number; stage?: number }
const silhouettes = [[3, 2, 11, 5, 7, 2, 4], [8, 5, 13, 2, 6, 15, 11]]
const timing = { '--arena-moves': `${ARENA_TIMING.moves}ms`, '--arena-impact': `${ARENA_TIMING.impact}ms` } as CSSProperties
const embers = [[12,75],[34,128],[48,59],[67,152],[89,106],[110,62],[132,137],[153,99],[186,143],[213,77],[225,121],[242,49],[265,155],[282,94],[304,128],[311,55]]

function ColosseumSet() {
  const sunset = useId()
  const light = useId()
  return <svg className="chm-arena-set" viewBox="0 0 320 180" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
    <defs>
      <linearGradient id={sunset} x2="0" y2="1"><stop stopColor="#101422" /><stop offset=".65" stopColor="#33243d" /><stop offset="1" stopColor="#89534a" /></linearGradient>
      <radialGradient id={light}><stop stopColor="#e9a458" stopOpacity=".45" /><stop offset="1" stopColor="#e9a458" stopOpacity="0" /></radialGradient>
    </defs>
    <path d="M0 0h320v180H0z" fill={`url(#${sunset})`} />
    <path d="M0 65h12V54h10V38h3v16h10v9h18V48h11v-7h10v7h17v11h17V45h8v-9h4v9h10v8h13v7h30v-7h13V37h8v-8h4v8h9v12h14v11h9V48h20v-9h10v9h10v14h26V47h12v-7h8v7h7v14h17v63H0z" fill="#211c2d" />
    <path d="M0 64h320v6H0zm0 10h320v4H0z" fill="#413044" />
    <path d="M0 83h320v49H0z" fill="#493346" />
    {Array.from({ length: 10 }, (_, i) => <g key={i} transform={`translate(${i * 34 - 7} 0)`}>
      <path d="M3 132V96h4v-6h4v-4h14v4h4v6h4v36z" fill="#78554d" />
      <path d="M7 132V98h4v-6h4v-3h7v3h4v6h3v34z" fill="#271f31" />
      <path d="M8 128V99h3v29zm3-31v-4h4v4zm-8 31V97h2v31z" fill="#ad7651" opacity=".5" />
    </g>)}
    <path d="M0 72h320v4H0zm0 53h320v5H0z" fill="#b48557" opacity=".45" />
    <path d="M0 129h320v14H0z" fill="#5c403d" /><path d="M0 139h320v41H0z" fill="#392938" />
    <path d="M86 133h148v6h25v8h22v12h21v21H18v-21h21v-12h22v-8h25z" fill="#624346" />
    <ellipse cx="160" cy="140" rx="146" ry="58" fill={`url(#${light})`} />
    <path d="M0 141h320m-320 15h320m-320 18h320M61 180l55-51m144 51-56-51m-44 0v51" fill="none" stroke="#d19c62" strokeOpacity=".20" />
    <path d="M0 0h23v114H0zm297 0h23v114h-23z" fill="#151722" />
    <path d="M18 0h5v117h-5zm279 0h5v117h-5z" fill="#4c3842" />
    {[30, 271].map(x => <g key={x} transform={`translate(${x} 0)`}>
      <path d="M0 50h19v38h-4v5h-4v4H8v-4H4v-5H0z" fill="#684239" />
      <path d="M2 51h15v3H2zm4 11h2v4h3v-4h2v3h-1v4h-2v7H9v-7H7v-4H6z" fill="#ebaf64" />
      <ellipse cx="9" cy="113" rx="18" ry="24" fill={`url(#${light})`} />
      <path d="M6 116h7v4H6zm3 2h2v9H9z" fill="#bc8952" />
      <path className="chm-arena-flame" d="M5 114v-4h2v-6h2v4h2v-7h2v6h2v7z" fill="#f7a450" />
      <path d="M8 114v-4h2v-3h2v7z" fill="#ffdf8b" />
    </g>)}
    {embers.map(([x,y], i) => <rect className="chm-arena-ember" key={x} x={x} y={y} width={i % 4 === 0 ? 2 : 1} height={1} fill={i % 3 === 0 ? '#ffd489' : '#b8805e'} style={{ animationDelay: `${-i * .38}s` }} />)}
  </svg>
}

export function ArenaStage({ fighters, beat, scores, commands, winner, round = 0, status }: {
  fighters: readonly [Fighter, Fighter]; beat: ArenaBeat; scores: readonly boolean[];
  commands?: readonly [number | null, number | null]; winner?: boolean; round?: number; status?: string
}) {
  const hit = beat === 'impact' && winner !== undefined
  const finish = beat === 'result' && winner !== undefined
  const winningMove = arenaMove(commands?.[winner ? 0 : 1])
  return <div className="chm-arena-shot" data-beat={beat} data-round={round + 1} data-winner={winner === undefined ? undefined : winner ? 'left' : 'right'} style={timing}>
    <div className="chm-arena-camera" data-contact={hit ? winningMove : undefined}>
    <ColosseumSet />
    <div className="chm-arena-vignette" aria-hidden="true" />
    {fighters.map((fighter, i) => {
      const move = arenaMove(commands?.[i])
      const won = winner === (i === 0)
      const art = <CreatureArt traits={fighter.traits ?? silhouettes[i]} seed={fighter.seed} stage={fighter.traits ? fighter.stage : 0} size={160} animate={false} />
      const pose = finish ? won ? 'victory' : 'down' : hit ? won ? 'finish-hit' : 'recoil' : beat === 'moves' ? move : 'ready'
      return <div key={i} className="chm-arena-player" data-side={i === 0 ? 'left' : 'right'}>
        <div className="chm-arena-platform" aria-hidden="true" />
        <div className="chm-arena-facing" aria-hidden="true">
          {beat === 'moves' && move === 'feint' && <div key={`echo:${round}`} className="chm-arena-echo">{art}</div>}
          <div className="chm-arena-sprite" key={`${beat}:${round}`} data-pose={pose} data-move={move} data-hidden={!fighter.traits}>{art}</div>
          {beat === 'moves' && move !== 'sealed' && <MoveWindup key={`move:${round}`} move={move} />}
        </div>
      </div>
    })}
    {hit && <MoveImpact move={winningMove} last={round === 2} />}
    {finish && <div className="chm-arena-finale" aria-hidden="true"><i/><i/><i/></div>}
    </div>
    {beat === 'intro' && <div className="chm-arena-curtain" aria-hidden="true"><i/><i/></div>}
    <div className="chm-arena-score" role="group" aria-label="Round results">
      {[0,1,2].map(i => <span key={i} role="img" data-score={i < scores.length ? scores[i] ? 'win' : 'loss' : beat === 'moves' && i === round ? 'active' : 'open'}
        aria-label={`Round ${i + 1}: ${i < scores.length ? scores[i] ? 'win' : 'loss' : 'unplayed'}`}>
        {i < scores.length ? scores[i] ? 'W' : 'L' : i + 1}
      </span>)}
    </div>
    {fighters.map((fighter, i) => <span key={i} className="chm-arena-name" data-side={i === 0 ? 'left' : 'right'} title={fighter.name}>{fighter.name}</span>)}
    <div className="chm-arena-call" key={`${beat}:${round}`} data-result={finish || hit ? winner ? 'win' : 'loss' : undefined}>
      {finish ? <><strong>{winner ? 'Victory' : 'Defeat'}</strong><small>{scores.filter(Boolean).length}–{scores.filter(won => !won).length}</small></>
        : hit ? <span>{winner ? 'Round won' : 'Round lost'}</span>
          : beat === 'moves' ? <span>Round {round + 1}</span>
            : beat === 'waiting' && status ? <span>{status}</span>
              : beat === 'intro' ? <strong>Ready</strong> : <strong>VS</strong>}
    </div>
  </div>
}
