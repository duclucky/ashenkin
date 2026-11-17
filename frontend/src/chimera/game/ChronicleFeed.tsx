import { useState } from 'react'
import { short, useWallet } from '../chain'
import { go } from '../ui'
import { ago, useBlockTimes, useChronicle, type ChronicleKind } from '../chronicle'
import { PxIcon, type PxIconName } from './hud'

const ICON: Record<ChronicleKind, PxIconName> = {
  hatch: 'egg',
  breed: 'egg',
  wild: 'paw',
  sequence: 'eye',
  verify: 'star',
  win: 'sword',
  duel: 'sword',
  loss: 'cross',
  capture: 'paw',
  expedition: 'flag',
  level: 'bolt',
  evolve: 'star',
  strike: 'sword',
  slain: 'skull',
  listed: 'coin',
  sold: 'coin',
  relic: 'gem',
  fuse: 'gem',
  oracle: 'eye',
  solve: 'star',
  ascend: 'bolt',
  throne: 'flag',
  raffle: 'coin',
  depths: 'skull',
}

/** A live, pixel-styled ticker of what every keeper is doing. Built only from public events. */
export function ChronicleFeed({ limit = 8, dark = false, title = 'LIVE IN THE ARKHIVE', more = true, filterable = false, kinds, creature, empty }: { limit?: number; dark?: boolean; title?: string; more?: boolean; filterable?: boolean; kinds?: ChronicleKind[]; creature?: number; empty?: string }) {
  const { account } = useWallet()
  const q = useChronicle()
  const [mine, setMine] = useState(false)
  const all = (q.data?.items ?? []).filter((i) => (!kinds || kinds.includes(i.kind)) && (creature == null || i.creature === creature || i.text.includes(`#${creature} `) || i.text.endsWith(`#${creature}`)))
  const items = (mine && account ? all.filter((i) => i.who.toLowerCase() === account.toLowerCase()) : all).slice(0, limit)
  const times = useBlockTimes(items.map((i) => i.block))
  const ink = dark ? '#f7f5ee' : '#111'
  const dim = dark ? '#cfcab9' : 'var(--chm-dim)'

  return (
    <div className={dark ? 'border-[4px] border-[#111] bg-[#1b2a1b] p-4 text-[#f7f5ee] shadow-[6px_6px_0_#3DDC97]' : 'chm-pxbox bg-white p-4'}>
      <div className="flex items-center gap-2">
        <span className="chm-m-blink inline-block h-2 w-2 bg-[#FF4D4D]" style={{ animationDuration: '1.4s' }} aria-hidden />
        <div className="font-pixel flex-1 text-[10px]" style={{ color: dark ? '#3DDC97' : ink }}>
          {title}
        </div>
        {filterable && account && (
          <button onClick={() => setMine((m) => !m)} className="font-pixel border-2 px-1.5 py-0.5 text-[8px]" style={{ borderColor: ink, background: mine ? '#FFDD00' : 'transparent', color: mine ? '#111' : ink }} aria-pressed={mine}>
            {mine ? 'ONLY ME' : 'EVERYONE'}
          </button>
        )}
      </div>
      {q.isLoading ? (
        <p className="mt-3 text-sm" style={{ color: dim }}>
          Reading the chain…
        </p>
      ) : q.isError ? (
        <p className="mt-3 text-sm" style={{ color: dim }}>
          The public RPC is busy. The chronicle will retry in a moment.
        </p>
      ) : !items.length ? (
        <p className="mt-3 text-sm" style={{ color: dim }}>
          {mine ? 'Nothing from you yet. Go make some history!' : empty ?? 'Quiet so far. Be the first to make history.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((i) => {
            const you = !!account && i.who.toLowerCase() === account.toLowerCase()
            const t = times.data?.[String(i.block)]
            return (
              <li key={i.key}>
                <button
                  onClick={() => { if (i.to) go(i.to) }}
                  className={`flex min-h-11 w-full min-w-0 items-start gap-2 px-1.5 py-2 text-left text-[13px] leading-snug ${dark ? 'hover:bg-[var(--chm-gray)]/10' : 'hover:bg-[var(--chm-yellow)]/40'}`}
                >
                  <PxIcon name={ICON[i.kind]} size={14} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {i.kind !== 'wild' && (
                      <span className="mr-1 font-mono font-bold" style={{ color: you ? (dark ? '#FFDD00' : '#2B50F5') : ink }}>
                        {you ? 'You' : short(i.who)}
                      </span>
                    )}
                    <span style={{ color: dark ? '#e9e5d8' : '#222' }}>{i.text}</span>
                  </span>
                  <span className="shrink-0 pt-0.5 font-mono text-[11px]" style={{ color: dim }}>
                    {ago(t)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {more && (
        <button onClick={() => go('hall')} className="font-pixel mt-3 text-[8px] underline underline-offset-4" style={{ color: dark ? '#FFDD00' : '#2B50F5' }}>
          HALL OF KEEPERS ▶
        </button>
      )}
    </div>
  )
}
