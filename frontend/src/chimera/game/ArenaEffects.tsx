import type { CSSProperties } from 'react'

export type ArenaMove = 'strike' | 'guard' | 'feint' | 'sealed'

export function arenaMove(value?: number | null): ArenaMove {
  return value === 0 ? 'strike' : value === 1 ? 'guard' : value === 2 ? 'feint' : 'sealed'
}

const fragments = [
  [-29,-11],[-22,-24],[-16,16],[-9,-31],[-3,24],[7,-22],
  [12,17],[21,-15],[28,3],[30,13],[34,-7],[18,27],
]

export function MoveImpact({ move, last }: { move: ArenaMove; last: boolean }) {
  return <div className="chm-arena-impact" data-impact={move} data-final-round={last} aria-hidden="true">
    <div className="chm-arena-impact-light" />
    <div className="chm-arena-impact-lines"><i/><i/><i/><i/></div>
    <svg className="chm-arena-impact-art" viewBox="0 0 192 118">
      {move === 'strike' ? <>
        <path className="chm-fx-secondary" fill="#fc8138" d="M7 103 40 85l30-10 33-23L160 4l27 3-14 16-36 16-35 33-39 24-31 6-29 9Z" />
        <path className="chm-fx-primary" fill="#ffc64a" d="M12 101 43 81l31-9 33-24 55-45 19 3-13 13-38 17-23 27-38 24-28 8-19 11Z" />
        <path className="chm-fx-core" fill="#fff4cd" d="M27 95 70 76l44-35 44-27 18-4-29 22-26 11-25 26-25 13-21 5Z" />
        <path className="chm-fx-secondary" fill="none" stroke="#ffdc83" strokeWidth="2" d="m28 109 35-10 37-24 24-20m25-27 27-18M8 95l34-17" />
      </> : move === 'guard' ? <>
        <path className="chm-fx-secondary" fill="#50adf260" stroke="#79caff" strokeWidth="2" d="M96 7 141 23v31l-8 23-17 16-20 14-20-14-17-16-8-23V23Z" />
        <path className="chm-fx-primary" fill="#459de85e" stroke="#c5f6ff" strokeWidth="3" d="M96 17 130 29v27l-7 17-12 13-15 11-15-11-12-13-7-17V29Z" />
        <path className="chm-fx-core" fill="#e1ffff" d="m96 33 4 18 18 5-18 5-4 20-4-20-18-5 18-5z" />
        <path className="chm-fx-secondary" stroke="#aeebff" strokeWidth="2" fill="none" d="m57 31-13 9-2 21 9 12m90-45 15 14v24l-10 12M32 50l-13 8 13 7m129-15 13 8-13 7" />
      </> : move === 'feint' ? <>
        <path className="chm-fx-secondary" fill="#8a72fb" fillOpacity=".75" d="M3 76 56 55l40-2 30-17 58-15-36 15-42 23-49 6Z" />
        <path className="chm-fx-secondary" fill="#b184ff" fillOpacity=".85" d="M16 96 65 67l30-6 38-23 57-12-42 18-45 23-34 5Z" />
        <path className="chm-fx-primary" fill="#d5acff" d="M24 101 68 72l37-7 40-28 44-6-35 15-43 25-35 7Z" />
        <path className="chm-fx-core" fill="#fff0ff" d="m66 83 43-16 39-29 26-3-21 10-46 25z" />
        <path className="chm-fx-secondary" fill="none" stroke="#dca6ff" strokeWidth="2" strokeDasharray="8 5" d="M13 100q49-15 83-26t72-30M6 78q52-22 89-22t81-35" />
      </> : <>
        <path className="chm-fx-secondary" fill="none" stroke="#e7b576" strokeWidth="2" d="M96 15 163 59 96 103 29 59Z" />
        <path className="chm-fx-primary" fill="none" stroke="#ffdc95" strokeWidth="3" d="M96 29 145 59 96 89 47 59Z" />
        <path className="chm-fx-core" fill="#fff2cf" d="m96 37 6 17 23 5-23 6-6 17-6-17-23-6 23-5z" />
      </>}
    </svg>
    <div className="chm-arena-kick-dust"><i/><i/><i/><i/></div>
    {fragments.map(([x,y],i) => <b key={i} className="chm-arena-fragment" style={{ '--fx-x': x, '--fx-y': y, '--fx-turn': `${i * 41}deg` } as CSSProperties} />)}
  </div>
}

export function MoveWindup({ move }: { move: Exclude<ArenaMove, 'sealed'> }) {
  return <div className="chm-arena-windup" data-move={move}>
    <i/><i/><i/>
    {move === 'guard' && <svg viewBox="0 0 80 80"><path d="m40 6 28 10v25L58 60 40 74 22 60 12 41V16Z" fill="#6bd0ff48" stroke="#9cdfff" strokeWidth="2"/><path d="m40 17 18 7v15L51 52 40 61 29 52l-7-13V24Z" fill="none" stroke="#dbf7ff" strokeWidth="2"/></svg>}
  </div>
}
