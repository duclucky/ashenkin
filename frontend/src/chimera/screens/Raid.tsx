import { Location, LocationNotes } from '../game/Location'
import { useEffect, useState } from 'react'
import { ChronicleFeed } from '../game/ChronicleFeed'
import { GuestGate } from '../game/GuestGate'
import { Swords, Crown, Users, Coins, RefreshCw, Lock, X, Skull, Zap } from 'lucide-react'
import CreatureArt from '../CreatureArt'
import { Addr, Button, CreatureCard, Empty, Label, Panel, useAction } from '../ui'
import { DEPLOYED, RAID, useWallet } from '../chain'
import { useLabKeyReady, useMyCreatures, useMyDamage, useNow, useRaid, useRaidReady, useRefresh, fmtDuration, fmtZama, type Boss } from '../hooks'
import { claimShare, publishPot, settleOpenKill, strikeBoss } from '../actions'
import { isZero, labKey, privateValues } from '../fhe'
import { ELEMENTS } from '../genetics'

import { bossName, bossTraits } from '../game/world-encounters'

type Hit = { strikeId: number; killed: boolean; damage: `0x${string}`; before?: `0x${string}`; after?: `0x${string}`; creatureId: number }

export default function Raid() {
  const { account } = useWallet()
  const raid = useRaid(account)
  const mine = useMyCreatures(account)
  const ready = useRaidReady(mine.data ?? [])
  const [champ, setChamp] = useState<number | null>(null)
  const [hit, setHit] = useState<Hit | null>(null)
  const [shake, setShake] = useState(0)
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const now = useNow(1000)
  const dmg = useMyDamage(raid.data?.level, account)

  useEffect(() => {
    if (champ == null && mine.data?.length) setChamp(mine.data[0])
    if (champ != null && mine.data && !mine.data.includes(champ)) setChamp(mine.data[0] ?? null)
  }, [mine.data, champ])

  if (!DEPLOYED) return <Empty title="The World Boss wakes once the contracts are live" />
  const b = raid.data?.boss
  const band = b && (b.strikes === 0 ? 10 : raid.band)
  const down = band === 0 && !!b && !b.slainAt
  const el = b ? ELEMENTS[b.element] : ELEMENTS[0]
  const counter = b ? ELEMENTS[(b.element + 2) % 3] : ELEMENTS[0]
  const cd = champ ? (ready.data?.[champ] ?? 0) - now : 0
  const pot = raid.pot
  const readyKnown = champ != null && ready.data?.[champ] != null && !!mine.data?.includes(champ)

  async function strike() {
    if (!champ || !readyKnown || !b || cd > 0 || down) return
    setShake((x) => x + 1)
    const r = await run('Strike', (s) => strikeBoss(champ, s), 'Strike landed', { spec: { kind: 'strike', me: champ, level: b?.level, element: b?.element, band } })
    refresh('raid', 'raidReady', 'damage', 'quests', 'pub', 'economy', 'bal', 'balHandle', 'training', 'xpRoom')
    if (r) setHit({ strikeId: r.strikeId, killed: r.killed, damage: r.damage, before: r.before, after: r.after, creatureId: champ })
  }

  return (
    <div className="space-y-8">
      <Location place="raid" />
      <div className="chm-panel bg-[#1b2138]! text-white">
        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:p-6">
          <div className="flex items-center justify-center">
            <div key={shake} className={`relative border-[4px] border-[#111] p-4 shadow-[8px_8px_0_#FFDD00] ${shake ? 'chm-pxshake' : ''}`} style={{ background: el.color }}>
              {b ? <CreatureArt traits={bossTraits(b.level, b.element)} element={b.element} seed={b.level * 7919} size={260} /> : <div className="aspect-square w-[200px] animate-pulse sm:w-[260px]" />}
              <div className="absolute -left-3 -top-3 border-[3px] border-[#111] bg-[var(--chm-yellow)] px-2 py-0.5 font-mono text-xs font-bold shadow-[3px_3px_0_#111]">WORLD BOSS</div>
            </div>
          </div>
          <div className="text-[#f7f5ee]">
            <h2 className="font-display text-2xl text-white sm:text-4xl">{b ? bossName(b) : 'Boss waking…'}</h2>

            <div className="mt-6">
              <div className="mb-1.5 flex justify-between font-mono text-xs font-bold uppercase">
                <span>Health band</span>
                <span>{band == null ? (raid.bandLoading ? 'decrypting…' : '—') : `${band * 10}%`}</span>
              </div>
              <div className="flex h-8 gap-1 border-[3px] border-[#f7f5ee] bg-[#222] p-1">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="flex-1 transition-colors" style={{ background: band != null && i < band ? (band <= 3 ? '#FF4D4D' : band <= 6 ? '#FF7020' : '#3DDC97') : '#333' }} />
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DarkStat icon={<Coins className="h-4 w-4" />} k="Pot" v={pot == null ? '…' : `${fmtZama(pot)}`} sub="cZAMA" />
              <DarkStat icon={<Users className="h-4 w-4" />} k="Raiders" v={b ? String(b.raiders) : '…'} />
              <DarkStat icon={<Swords className="h-4 w-4" />} k="Strikes" v={b ? String(b.strikes) : '…'} />
              <DarkStat icon={<Zap className="h-4 w-4" />} k="Max HP" v={b ? b.maxHp.toLocaleString() : '…'} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs font-bold">
              <span className="border-2 border-[#f7f5ee] px-2 py-0.5" style={{ background: el.color, color: el.name === 'Tide' ? '#fff' : '#111' }}>
                Boss element: {el.name}
              </span>
              <span className="border-2 border-[#f7f5ee] px-2 py-0.5" style={{ background: counter.color, color: counter.name === 'Tide' ? '#fff' : '#111' }}>
                {counter.name} hits +25
              </span>
              <span className="border-2 border-[#f7f5ee] bg-[#8B5CF6] px-2 py-0.5 text-white">Void +12</span>
            </div>
          </div>
        </div>
      </div>

      <LocationNotes title="Raid rewards"><div className="grid gap-4 lg:grid-cols-3">
        <PayoutCard pct={25} title="Killing blow" text="The raider whose strike drops it to zero takes a quarter of the pot." color="#FFDD00" icon={<Crown className="h-5 w-5" />} />
        <PayoutCard pct={50} title="Every raider" text="Half the pot is split evenly between every wallet that struck this boss, however hard." color="#3DDC97" icon={<Users className="h-5 w-5" />} />
        <PayoutCard pct={25} title="Next boss" text="The rest rolls over. The next boss has 500 more HP and starts with a fatter pot." color="#FF8FC7" icon={<RefreshCw className="h-5 w-5" />} />
      </div></LocationNotes>

      {!account ? (
        <GuestGate place="raid" />
      ) : (
        <>
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Label>Your raid this level</Label>
                <MyDamage loading={dmg.isLoading} value={dmg.data} boss={b} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {band === 0 && b && !b.slainAt && (
                  <Button variant="gold" busy={busy === 'Settle kill'} onClick={async () => { await run('Settle kill', (s) => settleOpenKill(b.level, s), 'Boss slain · pot split', { spec: { kind: 'bossFinish', level: b.level, element: b.element } }); refresh('raid', 'pub', 'economy') }}>
                    <Skull className="h-4 w-4" /> Settle the killing blow
                  </Button>
                )}
                <Button variant="ghost" busy={busy === 'Refresh pot'} onClick={async () => { await run('Refresh pot', (s) => publishPot(s), 'Pot updated'); refresh('raid', 'pub', 'economy') }} title="Breed fees, market fees and duel rakes flow in between strikes. This publishes the latest total.">
                  <RefreshCw className="h-4 w-4" /> Refresh pot
                </Button>
                <Button onClick={strike} busy={busy === 'Strike'} disabled={!readyKnown || !b || cd > 0 || down} title={down ? 'The boss is already at 0%. Settle the killing blow to split the pot and wake the next boss.' : undefined}>
                  <Swords className="h-4 w-4" /> {down ? 'Boss is down' : !readyKnown ? 'Reading strike cooldown…' : cd > 0 ? `Recovering · ${fmtDuration(cd)}` : 'Strike the boss'}
                </Button>
              </div>
            </div>
            <div className="mt-4">
              {!mine.data?.length ? (
                <Empty title="No specimens yet">Hatch embryos in your lab first.</Empty>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {mine.data.map((id) => {
                    const at = ready.data?.[id]
                    const left = at == null ? null : at - now
                    return (
                      <div key={id} className="w-[150px] shrink-0">
                        <CreatureCard id={id} compact selected={id === champ} onClick={() => setChamp(id)} footer={<div className="mt-1 font-mono text-[10px] font-bold">{left == null ? 'Reading cooldown…' : left > 0 ? `⏳ ${fmtDuration(left)}` : '⚔ ready'}</div>} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--chm-dim)]">{raid.data?.strikeCooldown == null ? 'Reading the on-chain strike cooldown…' : `Each creature can strike once every ${fmtDuration(raid.data.strikeCooldown)}.`} Striking also completes today's Raid quest.</p>
          </Panel>

          <Fallen bosses={raid.data?.past ?? []} mine={raid.data?.mine ?? []} onClaim={async (lvl) => { await run('Claim share', (s) => claimShare(lvl, s), 'Share paid in cZAMA', { spec: { kind: 'bossReward', level: lvl, element: raid.data?.past.find((boss) => boss.level === lvl)?.element } }); refresh('raid', 'pub', 'bal', 'balHandle') }} busy={busy === 'Claim share'} />
        </>
      )}
      <ChronicleFeed kinds={['strike', 'slain']} limit={10} title="RAID LOG" more={false} empty="No strikes yet. Be the first to hit it." />

      {hit && <HitModal hit={hit} onClose={() => setHit(null)} />}
    </div>
  )
}

function DarkStat({ icon, k, v, sub }: { icon: React.ReactNode; k: string; v: string; sub?: string }) {
  return (
    <div className="border-[3px] border-[#f7f5ee] bg-[#1b1b1b] px-3 py-2">
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase text-[#bdb9ad]">
        {icon} {k}
      </div>
      <div className="mt-0.5 font-display text-2xl text-white">
        {v} {sub && <span className="font-mono text-xs text-[var(--chm-yellow)]">{sub}</span>}
      </div>
    </div>
  )
}

function PayoutCard({ pct, title, text, color, icon }: { pct: number; title: string; text: string; color: string; icon: React.ReactNode }) {
  return (
    <Panel className="flex gap-4 p-5">
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center border-[3px] border-[#111] shadow-[3px_3px_0_#111]" style={{ background: color }}>
        <div className="font-display text-2xl">{pct}%</div>
      </div>
      <div>
        <div className="flex items-center gap-2 font-display text-lg">
          {icon} {title}
        </div>
        <p className="mt-1 text-sm text-[var(--chm-dim)]">{text}</p>
      </div>
    </Panel>
  )
}

function MyDamage({ loading, value, boss }: { loading: boolean; value?: number; boss?: Boss }) {
  const { account } = useWallet()
  const keyReady = useLabKeyReady(account)
  const { busy, run } = useAction()
  if (!keyReady)
    return (
      <Button variant="ghost" className="mt-1 !py-1 text-xs" busy={busy === 'Unlock'} onClick={() => account && run('Unlock', (step) => { step('Sign for your lab key…'); return labKey(account) }, 'Raid ledger unlocked', { spec: { kind: 'raidReport', level: boss?.level, element: boss?.element } })}>
        <Lock className="h-3.5 w-3.5" /> Unlock to see your hidden damage
      </Button>
    )
  return (
    <div className="mt-1 font-display text-3xl">
      {loading ? '…' : (value ?? 0).toLocaleString()} <span className="font-mono text-sm text-[var(--chm-dim)]">damage dealt · only you can see this</span>
    </div>
  )
}

function Fallen({ bosses, mine, onClaim, busy }: { bosses: Boss[]; mine: { level: number; joined: boolean; claimed: boolean; canClaim: boolean }[]; onClaim: (lvl: number) => void; busy: boolean }) {
  const { account } = useWallet()
  const slain = bosses.filter((b) => b.slainAt > 0)
  if (!slain.length) return null
  return (
    <div>
      <Label className="mb-3">Fallen bosses</Label>
      <Panel className="divide-y-[3px] divide-[#111] !p-0">
        {slain.map((b) => {
          const me = mine.find((m) => m.level === b.level)
          return (
            <div key={b.level} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="h-14 w-14 border-[3px] border-[#111]" style={{ background: ELEMENTS[b.element].color }}>
                <CreatureArt traits={bossTraits(b.level, b.element)} seed={b.level * 7919} size={48} animate={false} />
              </div>
              <div className="min-w-[160px] flex-1">
                <div className="font-display text-lg">{bossName(b)}</div>
                <div className="font-mono text-xs text-[var(--chm-dim)]">
                  slain by <Addr a={b.killer} you={account} /> · {b.raiders} raiders · {b.strikes} strikes
                </div>
              </div>
              {me?.joined ? (
                me.claimed ? (
                  <span className="border-2 border-[#111] bg-[#3DDC97] px-2 py-1 font-mono text-xs font-bold">Share claimed</span>
                ) : me.canClaim ? (
                  <Button busy={busy} onClick={() => onClaim(b.level)}>
                    <Coins className="h-4 w-4" /> Claim raider share
                  </Button>
                ) : (
                  <span className="font-mono text-xs text-[var(--chm-dim)]" title="Your first strike landed after the killing blow, so you are not on this boss's payout list.">joined after it fell · no share</span>
                )
              ) : (
                <span className="font-mono text-xs text-[var(--chm-dim)]">you did not raid this one</span>
              )}
            </div>
          )
        })}
      </Panel>
    </div>
  )
}

function HitModal({ hit, onClose }: { hit: Hit; onClose: () => void }) {
  const { account } = useWallet()
  const keyReady = useLabKeyReady(account)
  const [dmg, setDmg] = useState<number | null>(null)
  useEffect(() => {
    if (!account || !keyReady || !hit.damage) return
    privateValues(account, [{ handle: hit.damage, contract: RAID }])
      .then((v) => setDmg(Number(v[hit.damage.toLowerCase()] as bigint)))
      .catch(async () => {
        // Fallback: this hit = running total after − running total before (both readable by the striker).
        try {
          if (!hit.after || isZero(hit.after)) throw new Error('no total')
          const hs = [hit.after, ...(hit.before && !isZero(hit.before) ? [hit.before] : [])]
          const v = await privateValues(account, hs.map((h) => ({ handle: h, contract: RAID })))
          const a = Number(v[hit.after.toLowerCase()] as bigint)
          const b = hs.length > 1 ? Number(v[hit.before!.toLowerCase()] as bigint) : 0
          setDmg(a - b)
        } catch {
          setDmg(-1)
        }
      })
  }, [account, keyReady, hit.damage])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111]/70 p-4" onClick={onClose}>
      <div className="chm-panel chm-hatch relative w-full max-w-md p-6 text-center" onClick={(e) => e.stopPropagation()} style={{ background: hit.killed ? '#FFDD00' : '#fff' }}>
        <button className="absolute right-3 top-3" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <Label>Strike #{hit.strikeId}</Label>
        <div className="mt-3 font-display text-4xl">{hit.killed ? 'KILLING BLOW!' : 'HIT!'}</div>
        <div className="mx-auto mt-4 w-fit">
          <CreatureCard id={hit.creatureId} compact />
        </div>
        <div className="mt-4 font-mono text-sm">
          {!keyReady ? 'Unlock your lab key to read the hidden damage.' : dmg == null ? 'Decrypting your damage…' : dmg < 0 ? 'Damage still sealed — try again shortly.' : (
            <>
              You dealt <b className="font-display text-2xl">{dmg}</b> damage
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-[var(--chm-dim)]">{hit.killed ? 'You took 25% of the pot. Every raider can now claim their equal share.' : 'Only you know this number. Others just see the health band move.'}</p>
        <Button className="mt-5" onClick={onClose}>
          Back to the raid
        </Button>
      </div>
    </div>
  )
}
