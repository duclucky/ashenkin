import { addrUrl, short, useWallet } from '../chain'
import { BusyNote, Button, Empty, Label, Panel, Tag, useAction } from '../ui'
import { fmtZama, useNow, useRefresh } from '../hooks'
import { SEASON_RULES, SEAT_NAMES, claimThrone, endSeason, joinSeason, useSeason } from '../p1'
import { PxIcon } from './hud'

const SEAT_COLOR = ['#FF7020', '#3DDC97', '#4DA3FF']
const ZERO = '0x0000000000000000000000000000000000000000'

export const fmtLeft = (s: number) => {
  if (s <= 0) return 'ended'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

/** Pixel throne: back, seat and a crown when it is occupied. */
function ThroneArt({ color, taken }: { color: string; taken: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width={96} height={96} shapeRendering="crispEdges" aria-hidden>
      {taken && (
        <g fill="#FFDD00" stroke="#111" strokeWidth={1}>
          <path d="M10 6 L12 1 L14 5 L16 0 L18 5 L20 1 L22 6 Z" />
        </g>
      )}
      <rect x={8} y={7} width={16} height={14} fill={color} stroke="#111" strokeWidth={2} />
      <rect x={11} y={10} width={10} height={8} fill="#111" opacity={0.18} />
      <rect x={5} y={19} width={22} height={5} fill={color} stroke="#111" strokeWidth={2} />
      <rect x={6} y={24} width={3} height={7} fill="#111" />
      <rect x={23} y={24} width={3} height={7} fill="#111" />
      <rect x={4} y={15} width={4} height={6} fill={color} stroke="#111" strokeWidth={2} />
      <rect x={24} y={15} width={4} height={6} fill={color} stroke="#111" strokeWidth={2} />
    </svg>
  )
}

export function SeasonThrones() {
  const { account } = useWallet()
  const q = useSeason(account)
  const now = useNow()
  const refresh = useRefresh()
  const { busy, run, status } = useAction()
  const s = q.data

  if (q.isLoading) return <div className="chm-panel h-80 animate-pulse" />
  if (!s) return <Empty title="The public RPC is busy">It will retry in a few seconds.</Empty>

  const left = s.endsAt - now
  const over = left <= 0
  const me = s.me
  const mySeat = account ? s.holders.findIndex((h) => h.toLowerCase() === account.toLowerCase()) : -1
  const pct = Math.min(100, Math.max(0, ((now - s.startedAt) / (s.endsAt - s.startedAt)) * 100))
  const after = () => refresh('season', 'bal', 'balHandle', 'myRelics', 'economy', 'rewardBudget')

  return (
    <div className="space-y-6">
      <Panel className="relative overflow-hidden p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Tag color="ink">SEASON {s.season}</Tag>
          <span className="font-pixel text-[10px]">{over ? 'SEASON OVER' : `ENDS IN ${fmtLeft(left).toUpperCase()}`}</span>
          <span className="ml-auto font-mono text-xs text-[var(--chm-dim)]">
            {s.players} keeper{s.players === 1 ? '' : 's'} joined
          </span>
        </div>
        <div className="mt-3 h-3 border-2 border-[#111] bg-white">
          <div className="h-full bg-[var(--chm-yellow)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm text-[#222]">
          Out-score a throne’s keeper to take their seat. At the end of the season, holders earn a crown and a Relic Cache. cZAMA prizes depend on Treasury funding.
        </p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        {SEAT_NAMES.map((name, i) => {
          const holder = s.holders[i]
          const taken = holder && holder !== ZERO
          const isMe = !!account && taken && holder.toLowerCase() === account.toLowerCase()
          const canTake = !!me?.joined && !over && !isMe && me.score > (s.scores[i] ?? 0)
          return (
            <div key={name} className="chm-pxbox flex flex-col items-center p-4 text-center" style={{ background: isMe ? '#FFF6B8' : '#fff' }}>
              <ThroneArt color={SEAT_COLOR[i]} taken={!!taken} />
              <div className="font-pixel mt-2 text-[10px]">{name.toUpperCase()}</div>
              <div className="mt-1 font-mono text-xs font-bold">Up to {fmtZama(s.prizes[i])} cZAMA</div>
              <div className="mt-3 min-h-[40px] text-sm">
                {taken ? (
                  <>
                    <a href={addrUrl(holder)} target="_blank" rel="noreferrer" className="font-mono font-bold underline decoration-2 underline-offset-2">
                      {isMe ? 'You' : short(holder)}
                    </a>
                    <div className="font-mono text-xs text-[var(--chm-dim)]">{s.scores[i]} season pts</div>
                  </>
                ) : (
                  <span className="font-mono text-xs text-[var(--chm-dim)]">Empty — any score above 0 takes it</span>
                )}
              </div>
              <Button
                className="mt-3 w-full"
                variant={canTake ? 'gold' : 'ghost'}
                disabled={!canTake || !!busy}
                busy={busy === `throne${i}`}
                title={!me?.joined ? 'Join the season first' : isMe ? 'You hold this throne' : canTake ? '' : 'You need a higher season score than the holder'}
                onClick={() => run(`throne${i}`, (st) => claimThrone(i, st), `You took the ${name}!`).then(after)}
              >
                {isMe ? 'Yours' : canTake ? 'Take the throne' : 'Out-score to take'}
              </Button>
            </div>
          )
        })}
      </div>
      <BusyNote status={status} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="p-5">
          <Label>Your season</Label>
          {!account ? (
            <p className="mt-2 text-sm text-[var(--chm-dim)]">Sign in to join the season.</p>
          ) : !me?.joined ? (
            <>
              <p className="mt-2 text-sm">Joining is free. Only what you do <b>after</b> joining counts toward your season score.</p>
              <Button className="mt-3" disabled={over || !!busy} busy={busy === 'join'} onClick={() => run('join', joinSeason, `Joined season ${s.season}`).then(after)}>
                Join season {s.season}
              </Button>
            </>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-display text-4xl">{me.score}</span>
                <span className="font-mono text-sm text-[var(--chm-dim)]">season pts{mySeat >= 0 ? ` · on the ${SEAT_NAMES[mySeat]}` : ''}</span>
              </div>
              <p className="mt-2 text-xs text-[var(--chm-dim)]">
                {mySeat >= 0
                  ? 'Hold on: anyone who passes your score can take your seat until the season ends.'
                  : me.score === 0
                    ? 'Win in the Colosseum, strike the World Boss or solve the riddle to score.'
                    : 'Beat a holder’s score and press "Take the throne".'}
              </p>
              <p className="mt-1 text-xs text-[var(--chm-dim)]">A boss you already hit before joining does not count again; the next boss does.</p>
            </>
          )}
          {!!me?.crowns && (
            <div className="font-pixel mt-3 flex items-center gap-1.5 text-[10px]">
              <PxIcon name="star" size={12} /> {me.crowns} CROWN{me.crowns > 1 ? 'S' : ''} WON
            </div>
          )}
          {over && (
            <div className="mt-4 border-t-2 border-[#111] pt-3">
              <p className="text-sm">Closing the season distributes available prizes and starts season {s.season + 1}.</p>
              <Button className="mt-2" variant="gold" disabled={!account || !!busy} busy={busy === 'end'} onClick={() => run('end', endSeason, 'Season closed, prizes processed').then(after)}>
                Close season
              </Button>
            </div>
          )}
        </Panel>
        <Panel className="p-5">
          <Label>Season points</Label>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {SEASON_RULES.map(([label, w]) => (
              <li key={label} className="flex justify-between gap-3">
                <span>{label}</span>
                <b>+{w}</b>
              </li>
            ))}
          </ul>
          {s.lastWinners.some((a) => a !== ZERO) && (
            <div className="mt-4 border-t-2 border-[#111] pt-3">
              <Label>Season {s.season - 1} crowns</Label>
              <ol className="mt-1 space-y-0.5 font-mono text-xs">
                {s.lastWinners.map((a, i) =>
                  a === ZERO ? null : (
                    <li key={a + i}>
                      {SEAT_NAMES[i]} · {short(a)}
                    </li>
                  ),
                )}
              </ol>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
