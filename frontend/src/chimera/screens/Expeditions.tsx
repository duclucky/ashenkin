import { Location } from '../game/Location'
import { useEffect, useState } from 'react'
import { GuestGate } from '../game/GuestGate'
import { Clock, Map as MapIcon, PackageOpen, Lock, Trophy, Skull, Dumbbell } from 'lucide-react'
import { Button, CreatureCard, Empty, Label, Link, Panel, useAction } from '../ui'
import { DEPLOYED, useWallet } from '../chain'
import { useExpeditions, useLabKeyReady, useMyCreatures, useNow, useRefresh, useReport, useTraining, useZones, fmtDuration, fmtZama, MAX_LEVEL, trainFee, xpToNext, type Expedition, type Zone } from '../hooks'
import { claimExpedition, startExpedition } from '../actions'
import { labKey } from '../fhe'
import { ELEMENTS } from '../genetics'
import { useXpRoom } from '../season'
import { expeditionXpPreview } from '../game/expedition-progression'
import { BeaconReturn } from '../game/BeaconReturn'

import { ZONE_META } from '../game/world-encounters'

export default function Expeditions() {
  const { account } = useWallet()
  const zones = useZones()
  const mine = useMyCreatures(account)
  const exp = useExpeditions(account)
  const [pick, setPick] = useState<number | null>(null)
  const active = pick != null && mine.data?.includes(pick) ? pick : null
  const training = useTraining(active)
  const room = useXpRoom(active)
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const now = useNow(1000)

  useEffect(() => {
    if (pick == null && mine.data?.length) setPick(mine.data[0])
    if (pick != null && mine.data && !mine.data.includes(pick)) setPick(mine.data[0] ?? null)
  }, [mine.data, pick])

  if (!DEPLOYED) return <Empty title="Expeditions open once the contracts are live" />

  const runs = exp.data?.runs ?? 0
  const max = exp.data?.max ?? 6
  const away = exp.data?.list.filter((e) => !e.claimed) ?? []
  const done = exp.data?.list.filter((e) => e.claimed) ?? []
  const resetIn = 86400 - (now % 86400)

  async function send(zone: number) {
    if (active == null || !account) return
    await run('Expedition', (s) => startExpedition(account, active, zone, s), `${ZONE_META[zone].name}: your creature set out`, { spec: { kind: 'expedition', me: active, zone } })
    refresh('mine', 'expeditions', 'quests', 'economy')
  }

  async function claim(e: Expedition) {
    await run('Claim expedition', (s) => claimExpedition(e.id, e.creatureId, s), 'Specimen back at camp', { spec: { kind: 'claim', me: e.creatureId, zone: e.zone } })
    refresh('mine', 'expeditions', 'bal', 'balHandle', 'economy', 'report', 'training', 'xpRoom')
  }

  return (
    <div className="space-y-8">
      <Location place="expeditions">{exp.data && <span>{runs}/{max} runs today · resets in {fmtDuration(resetIn)}</span>}</Location>
      <BeaconReturn account={account} lead="field" />

      {!account ? (
        <GuestGate place="expeditions" />
      ) : (
        <>
          {!!away.length && (
            <div>
              <Label className="mb-3">Out in the field</Label>
              <div className="grid gap-4 md:grid-cols-2">
                {away.map((e) => (
                  <AwayCard key={e.id} e={e} zone={zones.data?.[e.zone]} now={now} busy={busy === 'Claim expedition'} onClaim={() => claim(e)} />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex items-end justify-between">
              <Label>Choose who goes</Label>
              <span className="font-mono text-xs text-[var(--chm-dim)]">creatures already on a run or listed for sale are not shown</span>
            </div>
            {!mine.data?.length ? (
              <Empty title={away.length ? 'Everyone is out exploring' : 'No specimens yet'}>{away.length ? 'Claim a returning creature to send it out again.' : 'Hatch embryos in your lab first.'}</Empty>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {mine.data.map((id) => (
                  <div key={id} className="w-[150px] shrink-0">
                    <CreatureCard id={id} compact selected={id === pick} onClick={() => setPick(id)} />
                  </div>
                ))}
              </div>
            )}
          </div>

        </>
      )}

      <section aria-labelledby="expedition-routes">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="expedition-routes" className="font-display text-2xl">Choose a route</h2>
          {active != null && training.data && <span className="text-sm font-bold">
            #{active} · {training.data.level >= MAX_LEVEL
              ? 'Max level'
              : `${training.data.xp}/${xpToNext(training.data.level)} XP · ${trainFee(training.data.level)} cZAMA to train`}
          </span>}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {zones.data?.map((z) => (
            <ZoneCard key={z.id} z={z} room={room.data?.room} disabled={active == null || !exp.data || runs >= max} busy={busy === 'Expedition'} onSend={account ? () => send(z.id) : undefined} />
          ))}
          {!zones.data && zones.isPending && [0, 1, 2].map((i) => <div key={i} className="chm-panel h-[420px] animate-pulse" />)}
        </div>
        {zones.isError && !zones.data && <Empty title="The route board is unavailable"><Button variant="ghost" onClick={() => zones.refetch()}>Reload routes</Button></Empty>}
        {exp.isError && !exp.data && <p className="mt-3 text-sm font-bold">Could not read your expedition allowance. <button type="button" className="min-h-11 underline" onClick={() => exp.refetch()}>Try again</button></p>}
        {exp.data && runs >= max && <div className="mt-3 border-[3px] border-[#111] bg-[#FF7020] px-4 py-2 font-bold">All {max} runs used today. The camp reopens in {fmtDuration(resetIn)} (00:00 UTC).</div>}
        <p className="mt-4 text-sm text-[var(--chm-dim)]">Pick a route, then bring your specimen home to collect its rewards and read its report.</p>
      </section>

      {!!done.length && (
        <div>
          <Label className="mb-3">Field reports</Label>
          <Panel className="divide-y-[3px] divide-[#111] !p-0">
            {done.map((e) => <ReportRow key={e.id} e={e} atHome={mine.data?.includes(e.creatureId) ?? false} />)}
          </Panel>
        </div>
      )}
    </div>
  )
}

function ZoneCard({ z, room, disabled, busy, onSend }: { z: Zone; room?: number; disabled: boolean; busy: boolean; onSend?: () => void }) {
  const m = ZONE_META[z.id]
  const el = ELEMENTS[z.element]
  const counter = ELEMENTS[(z.element + 2) % 3]
  const xp = expeditionXpPreview(z.xp, room)
  const loot = z.lootRoll > 0n ? `${fmtZama(z.lootBase)}–${fmtZama(z.lootBase + z.lootRoll - 1n)} cZAMA` : 'Unavailable'
  return (
    <div className="chm-panel flex flex-col">
      <div className="border-b border-[var(--chm-line)]">
        <ZoneArt zone={z.id} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="font-display text-2xl">{m.name}</div>
          <span className="border border-[#aaa894] px-2 py-0.5 font-mono text-[11px] font-bold uppercase" style={{ background: m.sky }}>
            {m.tier}
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--chm-dim)]">{m.blurb}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs">
          <Cell k="Duration" v={fmtDuration(z.duration)} />
          <Cell k="XP on return" v={`+${xp.base} XP`} strong />
          <Cell k="Success loot" v={loot} />
          <Cell k="If it fails" v={`${fmtZama(z.consolation)} cZAMA`} />
        </div>
        <div className="mt-3 text-xs">
          Difficulty {z.difficulty} · <b style={{ color: el.ink }}>{el.name}</b> zone · <b style={{ color: counter.ink }}>{counter.name}</b> creatures get +20
        </div>
        {xp.today != null && xp.today < xp.base && <p className="mt-2 text-xs font-bold">Claim today for up to +{xp.today} XP. The cap resets at 00:00 UTC.</p>}
        {onSend && <div className="mt-auto pt-5">
          <Button className="w-full" onClick={onSend} busy={busy} disabled={disabled} aria-label={`Send on expedition to ${m.name}`}>
            <MapIcon className="h-4 w-4" /> Send on expedition
          </Button>
        </div>}
      </div>
    </div>
  )
}

function Cell({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`border border-[#c9c5b7] px-2 py-1.5 ${strong ? 'bg-[#e1e8d9]' : 'bg-[#eeeadf]'}`}>
      <div className="text-[10px] uppercase text-[var(--chm-dim)]">{k}</div>
      <div className="font-bold text-[#111]">{v}</div>
    </div>
  )
}

function AwayCard({ e, zone, now, busy, onClaim }: { e: Expedition; zone?: Zone; now: number; busy: boolean; onClaim: () => void }) {
  const m = ZONE_META[e.zone]
  const total = Math.max(1, e.endsAt - e.startedAt)
  const left = e.endsAt - now
  const p = Math.min(1, Math.max(0, 1 - left / total))
  const back = left <= 0
  return (
    <Panel className="flex gap-4 p-4">
      <div className="w-[120px] shrink-0">
        <CreatureCard id={e.creatureId} compact />
      </div>
      <div className="min-w-0 flex-1">
        <Label>Expedition #{e.id}</Label>
        <div className="mt-1 font-display text-xl">{m.name}</div>
        <div className="mt-3 flex h-6 border-[3px] border-[#111] bg-white">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex-1 border-r-2 border-[#111] last:border-r-0" style={{ background: i < Math.round(p * 12) ? m.ground : 'transparent' }} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 font-mono text-xs font-bold">
          <Clock className="h-3.5 w-3.5" /> {back ? 'Back at camp' : `returns in ${fmtDuration(left)}`}
          {zone && <span className="font-normal text-[var(--chm-dim)]">· {fmtDuration(zone.duration)} trip</span>}
        </div>
        <Button className="mt-3" variant={back ? 'primary' : 'ghost'} disabled={!back} busy={busy} onClick={onClaim}>
          <PackageOpen className="h-4 w-4" /> {back ? 'Bring it home + loot' : 'Still exploring'}
        </Button>
      </div>
    </Panel>
  )
}

function ReportRow({ e, atHome }: { e: Expedition; atHome: boolean }) {
  const { account } = useWallet()
  const keyReady = useLabKeyReady(account)
  const r = useReport(e, account)
  const { busy, run } = useAction()
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="w-24 font-mono text-xs text-[var(--chm-dim)]">#{e.id}</div>
      <div className="min-w-[140px] flex-1 font-bold">
        {ZONE_META[e.zone].name} <span className="font-mono text-xs font-normal text-[var(--chm-dim)]">· specimen #{e.creatureId}</span>
      </div>
      {!keyReady ? (
        <Button variant="ghost" className="!py-1 text-xs" busy={busy === 'Open the sealed report'} onClick={() => account && run('Open the sealed report', (step) => { step('Sign for your lab key…'); return labKey(account) }, 'Report unlocked. Read it at the expedition camp.', { spec: { kind: 'expeditionReport', me: e.creatureId, zone: e.zone } })}>
          <Lock className="h-3.5 w-3.5" /> Open the sealed report
        </Button>
      ) : r.isLoading ? (
        <span className="font-mono text-xs">decrypting…</span>
      ) : r.data ? (
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 border-2 border-[#111] px-2 py-0.5 font-mono text-xs font-bold ${r.data.success ? 'bg-[#3DDC97]' : 'bg-[#FF8FC7]'}`}>
            {r.data.success ? <Trophy className="h-3.5 w-3.5" /> : <Skull className="h-3.5 w-3.5" />}
            {r.data.success ? 'Found a cache' : 'Consolation loot'}
          </span>
          <span className="font-display text-lg">{fmtZama(r.data.sent)} cZAMA paid</span>
          {r.data.sent !== r.data.loot && <span className="text-xs text-[var(--chm-dim)]">The report rolled {fmtZama(r.data.loot)} cZAMA. The Treasury could only pay {fmtZama(r.data.sent)}.</span>}
        </div>
      ) : (
        <span className="font-mono text-xs text-[var(--chm-dim)]">report unavailable</span>
      )}
      {atHome && <Link to={`training/${e.creatureId}`} className="inline-flex min-h-11 items-center gap-1.5 font-bold underline"><Dumbbell className="h-4 w-4" aria-hidden="true" /> Train #{e.creatureId}</Link>}
    </div>
  )
}

/* ───────────── pixel landscapes (48×20) ───────────── */

export function ZoneArt({ zone, className = '' }: { zone: number; className?: string }) {
  const m = ZONE_META[zone]
  const W = 48
  const H = 20
  const px: { x: number; y: number; c: string }[] = []
  const put = (x: number, y: number, c: string) => x >= 0 && x < W && y >= 0 && y < H && px.push({ x, y, c })
  // ground line
  for (let x = 0; x < W; x++) {
    const h = zone === 0 ? 13 + Math.round(Math.sin(x / 5) * 1.6) : zone === 1 ? 14 + Math.round(Math.sin(x / 3) * 0.8) : 15 + Math.round(Math.sin(x / 4 + 1) * 1.2)
    for (let y = h; y < H; y++) put(x, y, (x + y) % 2 === 0 && y > h + 1 ? m.deep : m.ground)
    put(x, h, '#111')
  }
  if (zone === 0) {
    // sun + cacti-like spires
    for (let y = 2; y < 7; y++) for (let x = 36; x < 41; x++) if ((x - 38) ** 2 + (y - 4) ** 2 <= 5) put(x, y, '#fff')
    for (const sx of [8, 21, 30]) for (let y = 7; y < 13; y++) { put(sx, y, '#111'); if (y === 9) { put(sx - 1, y, '#111'); put(sx + 1, y - 1, '#111') } }
  } else if (zone === 1) {
    // mushrooms
    for (const [sx, s] of [[7, 3], [19, 4], [33, 3], [42, 2]] as const) {
      for (let y = 13 - s * 2; y < 14; y++) put(sx, y, '#f7f5ee')
      for (let x = sx - s; x <= sx + s; x++) { put(x, 13 - s * 2, '#FF4D4D'); put(x, 12 - s * 2, '#111') }
      put(sx - 1, 13 - s * 2, '#fff')
    }
    for (let i = 0; i < 14; i++) put((i * 17) % W, (i * 7) % 10, '#FFDD00')
  } else {
    // bubbles + sunken pillar
    for (let i = 0; i < 12; i++) put((i * 11 + 3) % W, (i * 5) % 12, '#fff')
    for (let y = 6; y < 15; y++) { put(24, y, '#111'); put(26, y, '#111'); put(25, y, y % 3 ? '#f7f5ee' : '#111') }
    for (let x = 22; x < 29; x++) put(x, 5, '#111')
    for (let x = 4; x < 12; x++) put(x, 9 + (x % 2), '#111')
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block w-full ${className}`} shapeRendering="crispEdges" style={{ imageRendering: 'pixelated', background: m.sky }}>
      {px.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  )
}
