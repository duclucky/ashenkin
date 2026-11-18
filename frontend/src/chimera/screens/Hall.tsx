import { Location } from '../game/Location'
import { useState } from 'react'
import { addrUrl, short, useWallet, DEPLOYED } from '../chain'
import { Empty, Link, Panel, Label } from '../ui'
import { SCORE_RULES, useChronicle, type Keeper } from '../chronicle'
import { ChronicleFeed } from '../game/ChronicleFeed'
import { PxIcon, type PxIconName } from '../game/hud'
import { SeasonThrones } from '../game/SeasonThrones'
import { P1_LIVE } from '../p1'
import { TOURNAMENT } from '../tournament'

type Board = { id: string; label: string; icon: PxIconName; value: (k: Keeper) => number; show: (k: Keeper) => string; blurb: string }
const BOARDS: Board[] = [
  { id: 'overall', label: 'Overall', icon: 'star', value: (k) => k.score, show: (k) => `${k.score} pts`, blurb: 'Points from everything a keeper has done in the open.' },
  { id: 'fighters', label: 'Fighters', icon: 'sword', value: (k) => k.wins, show: (k) => `${k.wins}W · ${k.losses}L`, blurb: 'Colosseum wins: wild hunts and blind duels. Only the round results are ever decrypted, never the stats.' },
  { id: 'hunters', label: 'Hunters', icon: 'paw', value: (k) => k.captures, show: (k) => `${k.captures} caught`, blurb: 'Wild creatures captured in the Colosseum.' },
  { id: 'raiders', label: 'Raiders', icon: 'skull', value: (k) => k.kills * 10 + k.strikes, show: (k) => `${k.strikes} strikes${k.kills ? ` · ${k.kills} kill${k.kills > 1 ? 's' : ''}` : ''}`, blurb: 'World Boss strikes, with killing blows worth 10. Damage itself stays sealed.' },
  { id: 'trainers', label: 'Trainers', icon: 'bolt', value: (k) => k.topLevel, show: (k) => `best LV ${k.topLevel}`, blurb: 'Highest level reached by one of their creatures. Levels are public; the power they add is not.' },
  { id: 'seers', label: 'Seers', icon: 'eye', value: (k) => k.solves * 1000 + k.relics, show: (k) => `${k.solves} riddle${k.solves === 1 ? '' : 's'} · ${k.relics} relic${k.relics === 1 ? '' : 's'}`, blurb: "Oracle's Riddle solves, then relics forged. Relic tiers stay sealed unless the keeper makes them public." },
  { id: 'breeders', label: 'Breeders', icon: 'egg', value: (k) => k.births * 100 + k.verified, show: (k) => `${k.births} born${k.verified ? ` · ${k.verified} verified` : ''}`, blurb: 'Xenos hatched or bred. Verified rare lineages break ties.' },
]

const MEDAL = ['#FFDD00', '#c9c4b5', '#FF7020']

export default function Hall() {
  const { account } = useWallet()
  const q = useChronicle()
  const [tab, setTab] = useState(P1_LIVE ? 'season' : 'overall')
  if (!DEPLOYED) return <Empty title="The Hall opens once the contracts are live" />
  const board = BOARDS.find((b) => b.id === tab) ?? BOARDS[0]
  const ranked = (q.data?.keepers ?? []).filter((k) => board.value(k) > 0).sort((a, b) => board.value(b) - board.value(a) || b.score - a.score)
  const meIdx = account ? ranked.findIndex((k) => k.addr.toLowerCase() === account.toLowerCase()) : -1
  const me = meIdx >= 0 ? ranked[meIdx] : account ? q.data?.keepers.find((k) => k.addr.toLowerCase() === account.toLowerCase()) : undefined

  return (
    <div className="space-y-8">
      <Location place="hall" />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2" role="tablist">
            {P1_LIVE && (
              <button
                role="tab"
                aria-selected={tab === 'season'}
                onClick={() => setTab('season')}
                className="font-pixel flex items-center gap-1.5 border-[3px] border-[#111] px-2.5 py-1.5 text-[9px] shadow-[3px_3px_0_#111]"
                style={{ background: tab === 'season' ? '#FFDD00' : '#111', color: tab === 'season' ? '#111' : '#FFDD00' }}
              >
                <PxIcon name="flag" size={12} /> SEASON THRONES
              </button>
            )}
            {BOARDS.map((b) => (
              <button
                key={b.id}
                role="tab"
                aria-selected={tab === b.id}
                onClick={() => setTab(b.id)}
                className="font-pixel flex items-center gap-1.5 border-[3px] border-[#111] px-2.5 py-1.5 text-[9px] shadow-[3px_3px_0_#111]"
                style={{ background: tab === b.id ? '#FFDD00' : '#fff' }}
              >
                <PxIcon name={b.icon} size={12} /> {b.label.toUpperCase()}
              </button>
            ))}
          </div>
          {tab === 'season' ? (
            <>
              {!!TOURNAMENT && <Link to="arena/tournament" className="chm-btn chm-btn-ghost min-h-11"><PxIcon name="flag" size={14} /> Colosseum Cup</Link>}
              <SeasonThrones />
            </>
          ) : (
          <>
          <p className="text-sm text-[var(--chm-dim)]">{board.blurb}</p>

          {q.isLoading ? (
            <div className="chm-panel h-72 animate-pulse" />
          ) : q.isError ? (
            <Empty title="The public RPC is busy">It will retry in a few seconds.</Empty>
          ) : !ranked.length ? (
            <Empty title="No one on this board yet">Be the first: the board fills in as soon as someone plays.</Empty>
          ) : (
            <>
              <Podium top={ranked.slice(0, 3)} board={board} you={account} />
              <Panel className="!p-0">
                <ol className="divide-y-2 divide-[#111]">
                  {ranked.slice(0, 50).map((k, i) => {
                    const you = !!account && k.addr.toLowerCase() === account.toLowerCase()
                    return (
                      <li key={k.addr} className="flex items-center gap-3 px-4 py-2.5" style={{ background: you ? '#FFF6B8' : undefined }}>
                        <span className="font-pixel w-8 text-[10px]">#{i + 1}</span>
                        <a href={addrUrl(k.addr)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono font-bold underline decoration-2 underline-offset-2">
                          {you ? 'You' : short(k.addr)}
                        </a>
                        <span className="hidden font-mono text-xs text-[var(--chm-dim)] sm:inline">
                          {k.wins}W · {k.captures} caught · {k.strikes} strikes · LV {k.topLevel}
                        </span>
                        <span className="font-pixel shrink-0 text-[9px]">{board.show(k)}</span>
                      </li>
                    )
                  })}
                </ol>
              </Panel>
            </>
          )}
          </>
          )}
        </div>

        <div className="space-y-6">
          {tab !== 'season' && (
          <>
          <Panel className="p-5">
            <Label>Your standing</Label>
            {!account ? (
              <p className="mt-2 text-sm text-[var(--chm-dim)]">Sign in to see your rank.</p>
            ) : !me ? (
              <p className="mt-2 text-sm text-[var(--chm-dim)]">You are not on the board yet. Hatch, fight, strike the boss or run an expedition to get in.</p>
            ) : (
              <>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="font-display text-4xl">{meIdx >= 0 ? `#${meIdx + 1}` : '—'}</span>
                  <span className="font-mono text-sm text-[var(--chm-dim)]">{meIdx >= 0 ? `of ${ranked.length} · ${board.label.toLowerCase()}` : `not ranked in ${board.label.toLowerCase()} yet`}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
                  {SCORE_RULES.map(([f, w, label]) => (
                    <div key={f} className="flex justify-between border-2 border-[#111] px-2 py-1">
                      <span className="truncate">{label.split(' ').slice(0, 2).join(' ')}</span>
                      <b>{(me[f] as number) * w}</b>
                    </div>
                  ))}
                </div>
                <div className="font-pixel mt-3 text-[10px]">TOTAL {me.score} PTS</div>
              </>
            )}
          </Panel>
          <Panel className="p-5">
            <Label>How points are earned</Label>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {SCORE_RULES.map(([f, w, label]) => (
                <li key={f} className="flex justify-between gap-3">
                  <span>{label}</span>
                  <b>+{w}</b>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--chm-dim)]">Cancelled, failed or private actions do not count. Anyone can rebuild this table from the contracts' events.</p>
          </Panel>
          </>
          )}
          <ChronicleFeed limit={25} title="CHRONICLE" more={false} filterable />
        </div>
      </div>
    </div>
  )
}

function Podium({ top, board, you }: { top: Keeper[]; board: Board; you?: string | null }) {
  const order = [1, 0, 2].filter((i) => top[i])
  const height = [132, 96, 72]
  return (
    <div className="flex items-end justify-center gap-3 pt-4 sm:gap-5">
      {order.map((i) => {
        const k = top[i]
        const isYou = !!you && k.addr.toLowerCase() === you.toLowerCase()
        return (
          <div key={k.addr} className="flex w-[30%] max-w-[180px] flex-col items-center">
            {i === 0 && <PxIcon name="star" size={22} className="chm-pip-on mb-1" />}
            <div className="font-mono text-xs font-bold">{isYou ? 'You' : short(k.addr)}</div>
            <div className="font-pixel mb-2 mt-1 text-center text-[8px]">{board.show(k)}</div>
            <div className="chm-pxbox-sm flex w-full items-start justify-center pt-2" style={{ height: height[i], background: MEDAL[i] }}>
              <span className="font-pixel text-lg">{i + 1}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
