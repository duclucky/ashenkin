import { Location, LocationNotes } from '../game/Location'
import { useEffect, useState } from 'react'
import { ArrowDownToLine, Backpack, EyeOff, Flame, Gem, Heart, KeyRound, Lamp, Lock, LogOut, Medal, ShieldCheck, Skull, Swords } from 'lucide-react'
import { Button, BusyNote, CreatureCard, Empty, Label, Panel, toast, useAction } from '../ui'
import { DEPLOYED, DEPTHS, EXPLORER, useWallet } from '../chain'
import { labKey, storedLabKey } from '../fhe'
import { fmtZama, useBalance, useLabKeyReady, useMyCreatures, useRefresh } from '../hooks'
import { GuestGate } from '../game/GuestGate'
import { ProofButton } from '../game/ProofDrawer'
import { doorFromByte } from '../game/depths-floor'
import { DepthDoorArt } from '../game/DepthDoorArt'
import {
  DEPTHS_LIVE,
  DOOR,
  ENTRY_FEE,
  MAX_FLOOR,
  RELIC_DEPTH,
  XP_PER_FLOOR,
  depthsEnter,
  depthsLeave,
  depthsOpen,
  depthsProve,
  doorOdds,
  lootFor,
  monsterPower,
  readFloor,
  trapDamage,
  useDepths,
  useRunSecrets,
  type DepthsRun,
  type FloorLog,
} from '../depths'

const ICON = [ArrowDownToLine, Swords, Gem, Flame]
const pct = (x: number) => `${Math.round(x * 100)}%`

export default function Depths() {
  const { account } = useWallet()
  const d = useDepths(account)
  const refresh = useRefresh()
  const after = () => refresh('depths', 'depthsSecrets', 'balHandle', 'bal', 'relics', 'chronicle', 'training')

  if (!DEPLOYED || !DEPTHS_LIVE) return <Empty title="Arkhive Depths opens once its contract is live" />
  const active = d.data?.active ?? null
  const floor = active ? active.floor : 1

  return (
    <div className="space-y-8">
      <Location place="depths">
        <span>{active ? `Floor ${floor} of ${MAX_FLOOR}` : `${ENTRY_FEE} cZAMA per dive`}</span>
        {!!d.data?.deepest && <span>Record: floor {d.data.deepest}</span>}
      </Location>

      {!account ? (
        <>
          <LanternTrial />
          <GuestGate place="depths" />
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {d.isError && !d.data ? <Empty title="Could not read your dungeon state"><Button variant="ghost" onClick={() => d.refetch()}>Retry dungeon</Button></Empty>
              : !d.data ? <Panel className="p-6"><p role="status">Reading your current dive and daily allowance…</p></Panel>
              : active ? <RunPanel run={active} after={after} /> : <EnterPanel today={d.data.today} maxDaily={d.data.maxDaily} after={after} />}
            <Panel className="p-6">
              <Label className="mb-3">Your past dives</Label>
              {!d.data?.past.length ? (
                <div className="text-sm text-[var(--chm-dim)]">No finished dives yet.</div>
              ) : (
                <div className="space-y-3">
                  {d.data.past.map((r) => (
                    <PastRun key={r.id} run={r} after={after} />
                  ))}
                </div>
              )}
            </Panel>
          </div>
          <div className="space-y-6">
            <OddsPanel floor={floor} />
            <LocationNotes title="How the dungeon works">
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" /> All three doors are rolled with encrypted randomness. Only the lit door is shared with you, nobody else can read it.
                </li>
                <li className="flex gap-2">
                  <Swords className="mt-0.5 h-4 w-4 shrink-0" /> Fights compare your creature’s hidden power with a hidden monster on ciphertext. Neither number is ever revealed.
                </li>
                <li className="flex gap-2">
                  <Heart className="mt-0.5 h-4 w-4 shrink-0" /> Health and loot are encrypted. Death is just “health = 0” inside the ciphertext: the contract keeps running, the sack quietly stays empty.
                </li>
                <li className="flex gap-2">
                  <Medal className="mt-0.5 h-4 w-4 shrink-0" /> To post a record you unseal one bit, “survived”, with a Zama proof. Survive {RELIC_DEPTH}+ floors and you get a free relic cache.
                </li>
              </ul>
              <a className="mt-3 inline-block font-mono text-[11px] underline" href={`${EXPLORER}/address/${DEPTHS}`} target="_blank" rel="noreferrer">
                contract on Etherscan ↗
              </a>
            </LocationNotes>
          </div>
        </div>
      )}
    </div>
  )
}

function LanternTrial() {
  const [doors, setDoors] = useState(rollTrialDoors)
  const [picked, setPicked] = useState<number | null>(null)
  const [exposed, setExposed] = useState(false)
  const [publicPick, setPublicPick] = useState<number | null>(null)
  const selected = exposed ? publicPick : picked
  const result = selected == null ? null : DOOR[doors[selected]]
  const odds = doorOdds(1)

  return (
    <section className="chm-panel grid min-w-0 gap-5 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-6" aria-labelledby="lantern-trial-title">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold"><Lamp className="h-4 w-4" aria-hidden="true" /> Browser practice</div>
        <h2 id="lantern-trial-title" className="mt-2 font-display text-2xl">The lantern trial</h2>
        <p className="mt-2 text-sm">Your lantern shows one door. Take the known route or risk one of the sealed doors.</p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {doors.map((content, index) => (
            <DoorButton key={index} n={index} lit={index === 0} content={index === 0 || selected === index || exposed ? content : null} opened={selected === index} busy={false} disabled={selected != null} onClick={() => exposed ? setPublicPick(index) : setPicked(index)} />
          ))}
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="border-2 border-[#111] bg-[#f3eaff] p-3 text-sm" role="status">
          {result ? <><strong>{result.name}</strong> · {result.note}.</> : exposed ? 'Same floor, all doors visible. Pick again.' : <>The floor is set. Each sealed door has a {pct(odds.trap)} chance of a trap and a {pct(odds.treasure)} chance of treasure.</>}
        </div>
        {result && !exposed && <Button variant="ghost" onClick={() => setExposed(true)}>Show what a public chain would expose</Button>}
        {exposed && publicPick != null && picked != null && <p className="text-sm">One door visible: <b>{DOOR[doors[picked]].name}</b>. All doors visible: <b>{DOOR[doors[publicPick]].name}</b>.</p>}
        {picked != null && <Button variant="ghost" onClick={() => { setDoors(rollTrialDoors()); setPicked(null); setPublicPick(null); setExposed(false) }}>Roll a new floor</Button>}
        <p className="text-xs text-[var(--chm-dim)]">In a Sepolia dive, Zama rolls each door in the transaction and the contract grants the delver access to one door.</p>
        <ProofButton spec={{ mode: 'depths' }} label="What Sepolia reveals" />
      </div>
    </section>
  )
}

function rollTrialDoors() {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)), (roll) => doorFromByte(1, roll))
}

/* ───────────────────────── entering ───────────────────────── */

function EnterPanel({ today, maxDaily, after }: { today: number; maxDaily: number; after: () => void }) {
  const { account } = useWallet()
  const mine = useMyCreatures(account)
  const bal = useBalance(account)
  const { busy, run, status } = useAction()
  const [pick, setPick] = useState<number | null>(null)
  useEffect(() => {
    if (pick == null && mine.data?.length) setPick(mine.data[0])
  }, [mine.data, pick])
  const short = bal.value != null && bal.value < BigInt(ENTRY_FEE) * 1_000_000n
  const full = today >= maxDaily

  async function enter() {
    if (pick == null) return
    const r = await run('Enter the Depths', (st) => depthsEnter(account!, pick, st), 'You are on floor 1', { spec: { kind: 'descend', me: pick } })
    if (r) after()
  }

  return (
    <Panel className="p-6">
      <div className="font-display text-2xl">Choose your delver</div>
      <p className="text-sm text-[var(--chm-dim)]">Stronger creatures start with more hidden health (60 + half their power) and beat deeper monsters. Training and relics count.</p>
      {!mine.data?.length ? (
        <p className="mt-4 text-sm">You need a creature first. Hatch one in the Lab.</p>
      ) : (
        <div className="mt-4 grid max-h-[340px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
          {mine.data.map((id) => (
            <CreatureCard key={id} id={id} compact selected={id === pick} onClick={() => setPick(id)} />
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={enter} busy={busy === 'Enter the Depths'} disabled={!!busy || pick == null || full}>
          <ArrowDownToLine className="h-4 w-4" /> Descend with #{pick ?? '—'} · {ENTRY_FEE} cZAMA
        </Button>
        <BusyNote status={busy ? status : null} />
      </div>
      {full && <p className="mt-3 text-sm font-bold">You have used all {maxDaily} dives for today. The gate reopens at 00:00 UTC.</p>}
      {short && <p className="mt-3 border-2 border-[#E5341D] bg-[#fff0ee] p-2 text-xs">Your purse looks short. An unpaid entry still opens a dive, but you start with 0 health and can never bring loot back. The chain can’t refuse it without revealing your balance.</p>}
    </Panel>
  )
}

/* ───────────────────────── the run ───────────────────────── */

function RunPanel({ run: r, after }: { run: DepthsRun; after: () => void }) {
  const { account } = useWallet()
  const keyReady = useLabKeyReady(account)
  const s = useRunSecrets(account, r)
  const { busy, run, status } = useAction()
  const sec = s.data
  const dead = sec?.hp === 0n
  const bottom = r.cleared >= MAX_FLOOR

  async function open(door: number) {
    const f = r.floor
    const res = await run(`Open door ${door + 1}`, async (st) => {
      const tx = await depthsOpen(r.id, door, st)
      if (!storedLabKey(account!)) return { ...tx, log: null }
      st('Decrypting what happened, privately…')
      const log = await readFloor(account!, r.id, f).catch(() => null)
      return { ...tx, log }
    }, `Floor ${f} cleared`, {
      spec: { kind: 'openDoor', me: r.creatureId, door: door + 1, detail: `Floor ${f}` },
      map: (result) => {
        const outcome = result.log && floorToast(result.log)
        return { ...result, summary: outcome ? `${outcome.title}. ${outcome.detail}` : undefined }
      },
    })
    if (!res) return
    after()
  }
  async function leave() {
    const res = await run('Climb out', (st) => depthsLeave(r.id, st), 'Your specimen climbed out', { spec: { kind: 'climb', me: r.creatureId } })
    if (res) after()
  }

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-black uppercase text-[var(--chm-dim)]">
            dive #{r.id} · creature #{r.creatureId}
          </div>
          <div className="font-display text-3xl">{bottom ? 'The bottom of the Arkhive' : `Floor ${r.floor} of ${MAX_FLOOR}`}</div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: MAX_FLOOR }, (_, i) => (
            <span key={i} className="h-4 w-3 border-2 border-[#111]" style={{ background: i < r.cleared ? '#B66DFF' : i === r.cleared && !bottom ? '#FFDD00' : '#f7f5ee' }} title={`floor ${i + 1}`} />
          ))}
        </div>
      </div>

      {!keyReady ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-[3px] border-[#111] bg-[#f3eaff] p-4">
          <Lamp className="h-6 w-6" />
          <span className="flex-1 text-sm">Your health, your loot and the lantern’s secret are encrypted for you. Unlock your lab key to read them.</span>
          <Button variant="ghost" className="!py-1 text-xs" busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', (step) => { step('Sign for your lab key…'); return labKey(account!) }, 'Lantern unlocked. The floor log is yours to read.', { spec: { kind: 'depthLantern', me: r.creatureId } })}>
            <KeyRound className="h-3.5 w-3.5" /> Unlock lab key
          </Button>
        </div>
      ) : s.isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-2 border-[#111] bg-[#f3eaff] p-3">
          <p className="flex-1 text-sm" role="status">The private read is unavailable. Retry to see the lantern, health and loot.</p>
          <Button variant="ghost" onClick={() => void s.refetch()}>Retry private read</Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="border-[3px] border-[#111] bg-white p-3">
            <div className="flex items-center justify-between font-mono text-xs font-black">
              <span className="flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" /> HEALTH
              </span>
              <span>{sec ? `${sec.hp ?? 0} / ${sec.max ?? 0}` : '…'}</span>
            </div>
            <div className="mt-2 h-4 border-2 border-[#111] bg-[#eee]">
              <div className="h-full transition-all" style={{ width: sec?.max ? `${(Number(sec.hp ?? 0) / Number(sec.max)) * 100}%` : '0%', background: dead ? '#111' : Number(sec?.hp ?? 0) < Number(sec?.max ?? 1) * 0.35 ? '#E5341D' : '#3DDC97' }} />
            </div>
          </div>
          <div className="border-[3px] border-[#111] bg-white p-3">
            <div className="flex items-center justify-between font-mono text-xs font-black">
              <span className="flex items-center gap-1">
                <Backpack className="h-3.5 w-3.5" /> LOOT SACK
              </span>
              <span>only you see this</span>
            </div>
            <div className="mt-1 font-display text-3xl leading-none">{sec ? `${fmtZama(sec.sack)} cZAMA` : '…'}</div>
          </div>
        </div>
      )}

      {dead ? (
        <div className="mt-5 flex items-start gap-3 border-[3px] border-[#111] bg-[#111] p-4 text-white">
          <Skull className="h-8 w-8 shrink-0 text-[#E5341D]" />
          <div className="text-sm">
            <div className="font-display text-2xl">Your creature fell</div>
            The dungeon doesn’t know. Only you can read this. Your sack is empty and stays empty. Climb out to end the dive. You still earn {XP_PER_FLOOR} XP per floor cleared.
          </div>
        </div>
      ) : bottom ? (
        <div className="mt-5 border-[3px] border-[#111] bg-[var(--chm-yellow)] p-4 text-sm">
          <div className="font-display text-2xl">You reached floor {MAX_FLOOR}</div>
          Nothing deeper exists. Climb out with your loot, then post your depth record.
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 font-mono text-xs font-black">
            <Lamp className="h-4 w-4" /> Your lantern lights door {r.lit + 1}
            {keyReady && sec?.lit != null ? `: ${DOOR[sec.lit].name.toLowerCase()} behind it.` : '.'} Pick any door.
          </div>
          <p className="mb-3 text-xs text-[var(--chm-dim)]">Zama rolled all three doors when this floor was created. The lantern lets your wallet read one.</p>
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            {[0, 1, 2].map((i) => (
              <DoorButton key={i} n={i} lit={i === r.lit} content={i === r.lit && keyReady ? sec?.lit ?? null : null} busy={busy === `Open door ${i + 1}`} disabled={!!busy} hint={keyReady ? 'reading' : 'unlock key'} onClick={() => open(i)} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="gold" onClick={leave} busy={busy === 'Climb out'} disabled={!!busy}>
          <LogOut className="h-4 w-4" /> {dead ? 'Climb out (empty-handed)' : sec ? `Climb out with ${fmtZama(sec.sack)} cZAMA` : 'Climb out with the sack'}
        </Button>
        <BusyNote status={busy && busy !== 'Unlock lab key' ? status : null} />
      </div>

      {keyReady && !!sec?.log.length && (
        <div className="mt-6">
          <Label className="mb-2">Floor log (private)</Label>
          <FloorLogList log={sec.log} />
        </div>
      )}
    </Panel>
  )
}

function floorToast(l: FloorLog) {
  const n = DOOR[l.content]?.name ?? 'Door'
  if (l.content === 3) return { kind: 'err' as const, title: `Floor ${l.floor}: a trap!`, detail: `−${l.damage} health, no loot.` }
  if (l.loot === 0n) return { kind: 'err' as const, title: `Floor ${l.floor}: ${n.toLowerCase()}, and you fell`, detail: 'Your sack is empty now. Only you know.' }
  if (l.content === 1 && l.damage > 4) return { kind: 'err' as const, title: `Floor ${l.floor}: the monster won`, detail: `−${l.damage} health, you slipped past with +${fmtZama(l.loot)} cZAMA.` }
  if (l.content === 1) return { kind: 'ok' as const, title: `Floor ${l.floor}: monster beaten!`, detail: `−${l.damage} health, +${fmtZama(l.loot)} cZAMA in the sack.` }
  return { kind: 'ok' as const, title: `Floor ${l.floor}: ${n}`, detail: `${l.damage ? `−${l.damage} health, ` : ''}+${fmtZama(l.loot)} cZAMA in the sack.` }
}

function FloorLogList({ log }: { log: FloorLog[] }) {
  return (
    <div className="space-y-1.5">
      {[...log].reverse().map((l) => {
        const I = ICON[l.content] ?? Lock
        const died = l.loot === 0n && l.content !== 3
        return (
          <div key={l.floor} className="flex items-center gap-3 border-2 border-[#111] bg-white px-3 py-1.5 text-sm">
            <span className="w-14 font-mono text-xs font-black">F{l.floor}</span>
            <span className="flex h-6 w-6 items-center justify-center border-2 border-[#111]" style={{ background: DOOR[l.content]?.color }}>
              <I className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1">
              door {l.door + 1}: <b>{DOOR[l.content]?.name ?? '?'}</b>
            </span>
            <span className="font-mono text-xs">{l.damage ? `−${l.damage} hp` : 'no harm'}</span>
            <span className="w-24 text-right font-mono text-xs font-black">{died ? '☠ 0' : `+${fmtZama(l.loot)}`}</span>
          </div>
        )
      })}
    </div>
  )
}

/** A pixel dungeon door. The lit one glows and (once your key is unlocked) shows what is behind it. */
function DoorButton({ n, lit, content, busy, disabled, hint, opened, onClick }: { n: number; lit: boolean; content: number | null; busy: boolean; disabled: boolean; hint?: string; opened?: boolean; onClick: () => void }) {
  const info = content != null ? DOOR[content] : null
  const I = content != null ? ICON[content] : null
  return (
    <button onClick={onClick} disabled={disabled} className={`group min-w-0 relative flex flex-col items-center border-[3px] border-[#111] p-2 shadow-[4px_4px_0_#111] transition-transform enabled:hover:-translate-y-1 ${lit ? 'bg-[#2a2148]' : 'bg-[#1b1530]'}`} aria-label={`Open door ${n + 1}, ${info?.name ?? (lit ? hint ?? 'lit' : 'sealed')}`}>
      {lit && <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 18%, rgba(255,221,0,0.45), transparent 60%)' }} />}
      <DepthDoorArt lit={lit} opened={opened} tone={info?.color} className={`relative w-full max-w-[120px] ${busy ? 'animate-pulse' : ''}`} />
      <div className="relative mt-2 flex min-h-[44px] flex-col items-center justify-center text-center">
        {info && I ? (
          <>
            <span className="flex items-center gap-1 border-2 border-[#111] px-1.5 py-0.5 font-mono text-[11px] font-black" style={{ background: info.color }}>
              <I className="h-3 w-3" /> {info.name.toUpperCase()}
            </span>
            <span className="mt-0.5 hidden text-[10px] text-white/70 sm:block">{info.note}</span>
          </>
        ) : (
          <span className="flex items-center gap-1 font-mono text-[11px] font-black text-white/80">
            {lit ? <EyeOff className="h-3 w-3 shrink-0" /> : <Lock className="h-3 w-3 shrink-0" />} {lit ? hint ?? 'lit' : 'sealed'}
          </span>
        )}
        <span className="mt-1 font-mono text-[10px] font-black text-[var(--chm-yellow)]">DOOR {n + 1}</span>
      </div>
    </button>
  )
}

/* ───────────────────────── after the run ───────────────────────── */

function PastRun({ run: r, after }: { run: DepthsRun; after: () => void }) {
  const { account } = useWallet()
  const keyReady = useLabKeyReady(account)
  const s = useRunSecrets(account, r)
  const { busy, run, status } = useAction()
  const survived = s.data?.survived

  async function prove() {
    const res = await run('Post depth record', (st) => depthsProve(r.id, st), 'Depth record posted', { spec: { kind: 'depthRecord', me: r.creatureId, detail: `Floor ${r.cleared}` } })
    if (!res) return
    after()
    toast(
      res.survived
        ? { kind: 'ok', title: `Proven: survived ${res.depth} floor${res.depth === 1 ? '' : 's'}`, detail: res.depth >= RELIC_DEPTH ? 'A free relic cache is waiting in the Relic Forge.' : `Survive ${RELIC_DEPTH}+ floors to earn a relic cache.` }
        : { kind: 'err', title: 'The proof says you fell', detail: 'Nothing is posted for a dive you did not survive.' },
      10000,
    )
  }

  return (
    <div className="border-2 border-[#111] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs font-black">
        <span>
          dive #{r.id} · creature #{r.creatureId}
        </span>
        <span>
          {r.cleared} floor{r.cleared === 1 ? '' : 's'} cleared
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        {!keyReady ? (
          <span className="flex items-center gap-1 text-[var(--chm-dim)]">
            <Lock className="h-3.5 w-3.5" /> outcome sealed
          </span>
        ) : !s.data ? (
          <span>…</span>
        ) : (
          <>
            <span className="flex items-center gap-1">{survived ? <ShieldCheck className="h-4 w-4 text-[#2a9d5c]" /> : <Skull className="h-4 w-4 text-[#E5341D]" />} {survived ? 'made it out' : 'fell down there'}</span>
            <span className="font-display text-xl">+{fmtZama(s.data.paid ?? 0n)} cZAMA</span>
          </>
        )}
        <span className="flex-1" />
        {r.recorded ? (
          <ProofButton spec={{ mode: 'depths', id: r.id, title: `Dive #${r.id}` }} label="Verify survival proof" />
        ) : r.cleared > 0 && survived !== false ? (
          <Button variant="ghost" className="!py-1 text-xs" onClick={prove} busy={busy === 'Post depth record'} disabled={!!busy} title="Unseals only one bit: did you survive?">
            <Medal className="h-3.5 w-3.5" /> {r.revealing ? 'Finish posting the record' : 'Prove my depth'}
          </Button>
        ) : null}
      </div>
      <BusyNote status={busy ? status : null} />
    </div>
  )
}

/* ───────────────────────── side panels ───────────────────────── */

function OddsPanel({ floor }: { floor: number }) {
  const o = doorOdds(floor)
  const l = lootFor(floor)
  const [lo, hi] = monsterPower(floor)
  const rows = [
    { i: 0, p: o.stairs, what: `+${l.stairs.toFixed(1)} cZAMA` },
    { i: 1, p: o.monster, what: `power ${lo}–${hi} · win +${l.monster.toFixed(1)}` },
    { i: 2, p: o.treasure, what: `+${l.treasure.toFixed(1)} cZAMA` },
    { i: 3, p: o.trap, what: `−${trapDamage(floor)} health` },
  ]
  return (
    <Panel className="p-5">
      <Label className="mb-3">Behind any door on floor {floor}</Label>
      <div className="space-y-2">
        {rows.map((r) => {
          const I = ICON[r.i]
          return (
            <div key={r.i} className="flex items-center gap-2 text-sm">
              <span className="flex h-6 w-6 items-center justify-center border-2 border-[#111]" style={{ background: DOOR[r.i].color }}>
                <I className="h-3.5 w-3.5" />
              </span>
              <span className="w-20 font-bold">{DOOR[r.i].name}</span>
              <span className="w-10 font-mono text-xs font-black">{pct(r.p)}</span>
              <span className="flex-1 text-right font-mono text-[11px] text-[var(--chm-dim)]">{r.what}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-[var(--chm-dim)]">Deeper floors hide more traps and stronger monsters, but loot grows with every floor. Losing a fight costs 4 + half the power gap; winning still costs 4.</p>
    </Panel>
  )
}
