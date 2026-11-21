import { useFirstSteps, useLifeRoster } from '../game/use-first-steps'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ChevronDown } from 'lucide-react'
import { CHAIN_ID, DEPLOYED, LAB, useWallet } from '../chain'
import { isZero } from '../fhe'
import { faucet, FAUCET_AMOUNT } from '../actions'
import {
  fetchTraining,
  fetchCreature,
  useAccountStats,
  useBalance,
  useCreature,
  useEthBalance,
  useExpeditions,
  useListings,
  useMyCreatures,
  useNow,
  usePendingEggs,
  useQuests,
  useRaid,
  useRaidReady,
  useRefresh,
  useTraining,
  useTraits,
  xpToNext,
  MAX_LEVEL,
  fmtZama,
} from '../hooks'
import { Link, toast, useAction } from '../ui'
import { useKeeperBattles, useMyGuesses, useMyRelics, useOracle, useTStats } from '../season'
import { useRaffle } from '../raffle'
import { useDepths } from '../depths'
import CreatureArt from '../CreatureArt'
import { speciesName } from '../genetics'
import { Px, ALERT, ALERT_PAL } from '../game/art'
import { EnergyPips, PxIcon } from '../game/hud'
import { ChronicleFeed } from '../game/ChronicleFeed'
import { JudgeButton } from '../game/JudgeTour'
import { BUILDINGS, PROF, PROF_PAL, Tree } from '../game/map-art'
import { sfx, unlockAudio } from '../game/sfx'
import { travel } from '../game/Transition'
import { getSceneOpen } from '../game/store'
import { fullGameMotion } from '../game/motion'
import { KeeperBriefing, keeperMission } from '../game/KeeperBriefing'
import { hasPracticed, keeperGuideEnabled, type KeeperProgress } from '../game/keeper-story'
import { beaconScope, loadBeacon } from '../game/beacon'

/* The Arkhive overworld: every game system is a building you walk into. */

const MW = 240
const MH = 184
const PLAZA_Y = 94

type Key = 'lab' | 'breed' | 'arena' | 'expeditions' | 'raid' | 'training' | 'relics' | 'oracle' | 'quests' | 'well' | 'market' | 'economy' | 'raffle' | 'depths'
type Place = { key: Key; label: string; short?: string; x: number; y: number; blurb: string }

const PLACES: Place[] = [
  { key: 'raid', label: 'BOSS LAIR', x: 15, y: 7, blurb: 'Team up against a world boss' },
  { key: 'arena', label: 'COLOSSEUM', x: 84, y: 11, blurb: 'Hunt wild specimens and duel other keepers' },
  { key: 'depths', label: 'DEPTHS', x: 146, y: 19, blurb: 'Explore ten floors and find your way back' },
  { key: 'expeditions', label: 'EXPEDITION GATE', short: 'GATE', x: 192, y: 7, blurb: 'Send a creature out for XP and loot' },
  { key: 'training', label: 'DOJO', x: 24, y: 57, blurb: 'Spend XP to level up and evolve' },
  { key: 'lab', label: 'LAB', x: 91, y: 52, blurb: 'Hatch embryos and meet your creatures' },
  { key: 'breed', label: 'NURSERY', x: 186, y: 59, blurb: 'Mix two hidden genomes into a new creature' },
  { key: 'relics', label: 'RELIC FORGE', short: 'FORGE', x: 24, y: 106, blurb: 'Find and equip relics' },
  { key: 'oracle', label: 'ORACLE', x: 71, y: 104, blurb: 'Guess the secret genome, win the jackpot' },
  { key: 'market', label: 'MARKET', x: 188, y: 104, blurb: 'Buy and sell creatures' },
  { key: 'quests', label: 'QUEST BOARD', short: 'QUESTS', x: 24, y: 144, blurb: 'Daily check-in, tasks and a streak chest' },
  { key: 'raffle', label: 'RAFFLE', x: 74, y: 147, blurb: 'Enter the prize draw' },
  { key: 'well', label: 'WISHING WELL', short: 'WELL', x: 135, y: 145, blurb: `Draw ${FAUCET_AMOUNT.toLocaleString()} test cZAMA` },
  { key: 'economy', label: 'TREASURY', x: 187, y: 139, blurb: 'See where cZAMA fees flow' },
]

type Status = { line: string; alert?: string | null; timer?: string | null }

const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : s >= 60 ? `${Math.floor(s / 60)}m` : `${Math.max(0, s)}s`)

/* ───────────────────────── live state ───────────────────────── */

function useWorldState(account?: Address | null) {
  const now = useNow(1000)
  const mine = useMyCreatures(account)
  const ids = mine.data ?? []
  const stats = useAccountStats(account)
  const bal = useBalance(account)
  const eth = useEthBalance(account)
  const eggs = usePendingEggs(account)
  const raid = useRaid(account, !!account)
  const raidReady = useRaidReady(ids)
  const exp = useExpeditions(account)
  const quests = useQuests(account)
  const listings = useListings(!!account)
  const tstats = useTStats(account)
  const battles = useKeeperBattles(account)
  const relics = useMyRelics(account)
  const oracle = useOracle(!!account)
  const guesses = useMyGuesses(account)
  const raffle = useRaffle(account, !!account)
  const depths = useDepths(account, !!account)
  const trainAll = useQuery({
    queryKey: ['training', 'all', ids.join()],
    queryFn: () => Promise.all(ids.slice(0, 16).map(fetchTraining)),
    enabled: DEPLOYED && ids.length > 0,
    refetchInterval: 30_000,
  })
  const specimens = useQuery({
    queryKey: ['creature', 'story', ids.join()],
    queryFn: () => Promise.all(ids.slice(0, 16).map(fetchCreature)),
    enabled: DEPLOYED && ids.length > 0,
    staleTime: 30_000,
  })

  const st: Partial<Record<Key, Status>> = {}
  const genesisLeft = stats.data ? 3 - stats.data.genesis : 0
  st.lab = {
    line: account ? `${ids.length} creature${ids.length === 1 ? '' : 's'} in your lab` : 'Your creatures live here',
    alert: account && stats.data && genesisLeft > 0 ? `${genesisLeft} free embryo${genesisLeft > 1 ? 's' : ''} to hatch` : null,
  }
  st.breed = {
    line: ids.length >= 2 ? 'Pick two parents and breed' : 'Needs two creatures',
    alert: eggs.data?.length ? `${eggs.data.length} egg${eggs.data.length > 1 ? 's' : ''} waiting to hatch` : null,
  }
  const ts = tstats.data
  st.arena = {
    line: ts ? `${ts.wins} wins · ${ts.losses} losses · ${ts.captures} captured` : 'Pick three moves and win two rounds',
  }
  const rl = relics.data
  const loose = rl ? rl.filter((r) => !r.equippedTo).length : 0
  st.relics = {
    line: rl ? `${rl.length} relic${rl.length === 1 ? '' : 's'} · ${rl.length - loose} equipped` : 'Open relic caches',
    alert: rl && loose > 0 && ids.length > 0 ? `${loose} relic${loose > 1 ? 's' : ''} not equipped` : null,
  }
  const og = guesses.data
  const claimOpen = og?.guesses.find((g) => g.claimed && !g.finalized)
  st.oracle = {
    line: oracle.data ? `Jackpot ${oracle.data.pot != null ? fmtZama(oracle.data.pot) : '?'} cZAMA${og ? ` · ${og.left} guesses left` : ''}` : 'Guess the sealed genome',
    alert: claimOpen ? 'Jackpot claim to finish' : null,
  }
  const list = exp.data?.list ?? []
  const back = list.filter((e) => !e.claimed && e.endsAt <= now)
  const out = list.filter((e) => !e.claimed && e.endsAt > now)
  const nextBack = out.length ? Math.min(...out.map((e) => e.endsAt)) - now : null
  st.expeditions = {
    line: exp.data ? `${exp.data.runs}/${exp.data.max} runs today${out.length ? ` · ${out.length} out` : ''}` : 'Three zones, hidden loot',
    alert: back.length ? `${back.length} creature${back.length > 1 ? 's' : ''} back with loot` : null,
    timer: !back.length && nextBack != null ? dur(nextBack) : null,
  }
  const boss = raid.data?.boss
  const alive = !!boss && !boss.slainAt
  const band = boss && (boss.strikes === 0 ? 10 : raid.band)
  const canStrike = alive && ids.length > 0 && !!raidReady.data && ids.some((id) => (raidReady.data![id] ?? 0) <= now)
  const shares = (raid.data?.past ?? []).filter((b) => b.slainAt > 0 && raid.data!.mine.some((m) => m.level === b.level && m.canClaim))
  st.raid = {
    line: boss ? `Boss LV ${boss.level} · health ${band == null ? '?' : `${band * 10}%`}` : 'A boss is waiting',
    alert: shares.length ? 'Raider share to claim' : canStrike ? 'Your creatures can strike' : null,
  }
  const profiles = trainAll.data ?? []
  const pending = profiles.filter((t) => t.pending)
  const canLevel = profiles.filter((t) => !t.pending && t.level < MAX_LEVEL && t.xp >= xpToNext(t.level))
  const best = profiles.reduce((m, t) => Math.max(m, t.level), 0)
  st.training = {
    line: profiles.length ? `Best creature LV ${best}` : 'Level 5 evolves, level 10 is Sovereign',
    alert: pending.length ? 'Training to finish' : canLevel.length ? `${canLevel.length} can level up` : null,
  }
  const q = quests.data
  const unclaimed = q ? [0, 1, 2, 3].filter((i) => q.done & (1 << i) && !(q.claimedMask & (1 << i))).length : 0
  st.quests = {
    line: q ? `Streak ${q.streak} · ${(q.multiplier / 100).toFixed(1)}× rewards` : 'Daily rewards',
    alert: q ? (!q.checkedIn ? 'Daily check-in open' : unclaimed ? `${unclaimed} task reward${unclaimed > 1 ? 's' : ''}` : q.done === 15 && !q.chestClaimed ? 'Chest ready to open' : null) : null,
  }
  const broke = !!account && bal.handle !== undefined && isZero(bal.handle)
  st.well = { line: 'Click to mint free test cZAMA', alert: broke ? 'Your purse is empty' : null }
  st.market = { line: listings.data ? `${listings.data.length} creature${listings.data.length === 1 ? '' : 's'} for sale` : 'Creatures for sale' }
  st.economy = { line: 'Raid pot, reserve and fees' }
  const rr = raffle.data?.round
  st.raffle = {
    line: rr ? `Round #${rr.id} · ${rr.players} player${rr.players === 1 ? '' : 's'}${!rr.drawing && now < rr.endsAt ? ` · draw in ${dur(rr.endsAt - now)}` : ''}` : 'A chance at the prize pot',
    alert: rr && (rr.drawing || (rr.entries > 0 && now >= rr.endsAt)) ? 'Raffle ready to draw' : null,
  }
  const dv = depths.data
  st.depths = {
    line: dv?.active ? `You are on floor ${dv.active.floor} of 10` : dv ? `${dv.today}/${dv.maxDaily} dives today${dv.deepest ? ` · record floor ${dv.deepest}` : ''}` : 'Ten floors beneath the Arkhive',
    alert: dv?.active ? 'You are still down in the Depths' : null,
  }

  const guestStory = loadBeacon(beaconScope(CHAIN_ID, LAB))
  const story = account ? loadBeacon(beaconScope(CHAIN_ID, LAB, account)) ?? guestStory : guestStory
  const progress: KeeperProgress = {
    connected: !!account,
    practiced: hasPracticed(),
    beaconDone: !!story?.ending,
    hasGas: eth == null ? null : eth > 0n,
    specimens: mine.data,
    genesis: stats.data?.genesis,
    fights: ts ? ts.wins + ts.losses : undefined,
    pendingFight: !!account && battles.data?.some((battle) => battle.status === 1 &&
      (battle.challenger.toLowerCase() === account.toLowerCase() || battle.opponent.toLowerCase() === account.toLowerCase())),
    energy: stats.data?.energy,
    sequenced: specimens.data?.some((creature) => creature.info.sequencedMask !== 0 || creature.info.certified),
    claimedExpedition: exp.data?.list.some((trip) => trip.claimed),
    expedition: back.length ? 'ready' : out.length ? 'away' : exp.data ? 'none' : undefined,
  }
  return { st, ids, stats: stats.data, progress, noGas: eth === 0n }
}

/* ───────────────────────── map pieces ───────────────────────── */

const ARROW = ['kkkkkkk', 'kyyyyyk', '.kyyyk.', '..kyk..', '...k...']

function Building({ p, u, s, guided, selected, onEnter, onHover, onFocus }: { p: Place; u: number; s?: Status; guided: boolean; selected: boolean; onEnter: (p: Place) => void; onHover: (k: Key | null) => void; onFocus: (k: Key) => void }) {
  const art = BUILDINGS[p.key]
  const hopEl = useRef<HTMLDivElement>(null)
  const hop = useRef<Animation | null>(null)
  // Web Animations: restart the hop without remounting (a remount between mousedown/up swallows taps).
  const doHop = () => {
    if (!fullGameMotion()) return
    hop.current?.cancel()
    hop.current = hopEl.current?.animate(
      [
        { transform: 'translateY(0) scale(1.06,.94)' },
        { transform: 'translateY(-16%) scale(.96,1.04)' },
        { transform: 'translateY(0) scale(1.06,.94)' },
        { transform: 'none' },
      ],
      { duration: 450, easing: 'cubic-bezier(.3,0,.3,1)' },
    ) ?? null
  }
  const font = Math.max(6, Math.min(10, u * 2.6))
  return (
    <button
      className="chm-m-bld absolute block border-0 bg-transparent p-0"
      type="button"
      style={{ left: `${(p.x / MW) * 100}%`, top: `${(p.y / MH) * 100}%`, width: `${(art.w / MW) * 100}%`, zIndex: selected ? 30 : guided ? 29 : 5 + Math.round(p.y / 10) }}
      data-place={p.key}
      onMouseEnter={() => {
        onHover(p.key)
        doHop()
        sfx.hop()
      }}
      onMouseLeave={() => onHover(null)}
      onFocus={(event) => {
        onFocus(p.key)
        if (event.currentTarget.matches(':focus-visible')) doHop()
      }}
      onClick={() => {
        doHop()
        onEnter(p)
      }}
      aria-label={`${p.label}: ${s?.alert ?? s?.line ?? p.blurb}`}
      aria-describedby={guided ? 'keeper-mission-title' : undefined}
      data-active={selected || undefined}
      data-guided={guided || undefined}
    >
      <div ref={hopEl}>
        <svg viewBox={`0 0 ${art.w} ${art.h}`} shapeRendering="crispEdges" style={{ width: '100%', display: 'block', overflow: 'visible' }}>
          {art.draw()}
        </svg>
      </div>
      <div className="chm-m-plate font-mono font-bold pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 leading-tight" style={{ fontSize: font + 2 }}>
        {u < 3 ? p.short ?? p.label : p.label}
      </div>
      {guided ? (
        <div className="chm-m-arrow pointer-events-none absolute left-1/2" style={{ top: -u * 4, width: u * 5 }}>
          <Px rows={ARROW} pal={ALERT_PAL} />
        </div>
      ) : (
        s?.alert && (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2" style={{ top: -u * 9, width: u * 2.6 }}>
            <div className="chm-g-alert">
              <Px rows={ALERT} pal={ALERT_PAL} />
            </div>
          </div>
        )
      )}
    </button>
  )
}

function MapPet({ id, i, u }: { id: number; i: number; u: number }) {
  const c = useCreature(id)
  const t = useTraits(c.data)
  const tr = useTraining(id)
  const size = Math.round(u * 11)
  const r = (k: number) => {
    const x = Math.sin(id * 91.7 + k * 17.3) * 43758.5453
    return x - Math.floor(x)
  }
  const x0 = 89 + i * 12 + r(1) * 3
  const timing = { ['--d' as string]: `${10 + r(2) * 8}s`, ['--dl' as string]: `${-r(3) * 15}s`, ['--dist' as string]: `${Math.round(u * (6 + r(4) * 10))}px` } as CSSProperties
  const name = t.data ? speciesName(t.data) : `#${id}`
  return (
    <button
      type="button"
      className="absolute cursor-pointer border-0 bg-transparent p-0"
      style={{ left: `${(x0 / MW) * 100}%`, top: `calc(${((PLAZA_Y + 9) / MH) * 100}% - ${size}px)`, width: size, zIndex: 20 }}
      title={`${name} · LV ${tr.data?.level ?? 0}`}
      onClick={() => {
        unlockAudio()
        sfx.select()
        travel(`creature/${id}`)
      }}
    >
      <div className="chm-g-roamx" style={timing}>
        <div className="chm-g-flipx" style={timing}>
          <div className="chm-g-steps" style={{ animationDuration: '.5s' }}>
            <CreatureArt traits={t.data} seed={id} size={size} stage={tr.data?.stage ?? 0} />
          </div>
        </div>
      </div>
    </button>
  )
}

function Ground() {
  const tufts = useMemo(() => {
    let a = 7
    const r = () => {
      a = (a * 16807) % 2147483647
      return a / 2147483647
    }
    return Array.from({ length: 550 }, () => ({ x: Math.floor(r() * MW), y: Math.floor(r() * MH), c: r() < 0.62 ? '#52825a' : r() < 0.8 ? '#82a766' : r() < 0.9 ? '#c99893' : '#ddc57b' }))
  }, [])
  const road = '#d1b88b'
  const edge = '#8b744e'
  const H = (x: number, y: number, w: number) => (
    <>
      <rect x={x} y={y} width={w} height={5} fill={road} />
      <rect x={x} y={y + 5} width={w} height={1} fill={edge} />
    </>
  )
  const V = (x: number, y: number, h: number) => (
    <>
      <rect x={x} y={y} width={5} height={h} fill={road} />
      <rect x={x + 5} y={y} width={1} height={h} fill={edge} />
    </>
  )
  return (
    <svg viewBox={`0 0 ${MW} ${MH}`} preserveAspectRatio="none" shapeRendering="crispEdges" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <pattern id="chm-grass" width="16" height="12" patternUnits="userSpaceOnUse">
          <path d="M1 3h2v1H1zM3 2h1v1H3zM10 9h3v1h-3zM13 8h1v1h-1z" fill="#426d51" opacity=".55" />
        </pattern>
        <pattern id="chm-shallows" width="13" height="9" patternUnits="userSpaceOnUse">
          <path d="M1 2h4v1H1zM8 6h3v1H8z" fill="#75beb1" opacity=".48" />
        </pattern>
      </defs>
      <rect width={MW} height={MH} fill="#719b62" />
      <path d="M0 0h240v51h-9v-9h-57v8h-55v-6H64v8H0zM0 99h15v53h33v26h35v6H0zM156 86h84v98h-72v-8h57v-61h-69z" fill="#5d8c60" />
      <rect width={MW} height={MH} fill="url(#chm-grass)" />
      {tufts.map((t, i) => (
        <rect key={i} x={t.x} y={t.y} width={1} height={1} fill={t.c} />
      ))}
      {/* The quarry, the northern gate and the river are landmarks. */}
      <path d="M0 0h70v12h-5v24h-5v11H15v-5H0z" fill="#827b73" />
      <path d="M0 0h63v9h-5v14h-7v-9h-9v-5H0z" fill="#635f5b" />
      {[
        [8, 40, 9],
        [36, 42, 6],
        [48, 14, 5],
        [2, 30, 4],
      ].map(([x, y, w], i) => (
        <rect key={i} x={x} y={y} width={w} height={1} fill="#E5341D" opacity={0.6} />
      ))}
      {/* arena sands */}
      <path d="M82 5h48v4h5v32h-6v8H78V12h4z" fill="#b59365" />
      <path d="M84 8h44v5h5v26h-6v8H81V14h3z" fill="#cfac73" />
      {/* mossy ground at the gate */}
      <path d="M176 0h58v40h-4v9h-57V13h3z" fill="#507f74" />
      <path d="M181 0h48v39h-5v6h-47V14h4z" fill="#6caa88" />
      {/* roads */}
      {H(34, 46, 178)}
      {H(35, PLAZA_Y, 172)}
      {H(35, 134, 172)}
      {V(34, 42, 105)}
      {V(105, 40, 59)}
      {V(155, 39, 12)}
      {V(204, 39, 108)}
      {V(80, PLAZA_Y + 4, 54)}
      {V(143, 134, 16)}
      <path d="M39 48h43m47 0h22m10 0h40M39 96h47m65 0h49M39 136h39m8 0h54m9 0h51" fill="none" stroke="#ead6a0" strokeOpacity=".5" strokeDasharray="2 3" />
      {/* plaza */}
      <rect x={88} y={PLAZA_Y - 6} width={60} height={20} fill="#bdab80" />
      {Array.from({ length: 15 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => ((i + j) % 2 ? <rect key={`${i}-${j}`} x={88 + i * 4} y={PLAZA_Y - 6 + j * 4} width={4} height={4} fill="#ae9a71" /> : null)),
      )}
      <rect x={88} y={PLAZA_Y + 14} width={60} height={1} fill={edge} />
      {/* pond */}
      <g transform="translate(30 12)">
        <path d="M83 103h24v2h6v11h-5v3H88v-3h-7v-11h2Z" fill="#355b56" />
        <path d="M85 105h22v2h4v8h-5v2H90v-2h-7v-8h2Z" fill="#4e9d9e" />
        <rect x={90} y={108} width={5} height={1} fill="#A8E4FF" />
        <rect x={96} y={109} width={6} height={4} fill="none" stroke="#A8E4FF" strokeWidth={0.6} className="chm-m-ripple" />
        <rect x={103} y={112} width={4} height={2} fill="none" stroke="#A8E4FF" strokeWidth={0.5} className="chm-m-ripple" style={{ animationDelay: '-1.2s' }} />
      </g>
      <path d="M232 0h8v184h-18v-10h6v-31h4v-21h-4V91h4V74h-5V43h5z" fill="#2c6368" />
      <path d="M235 0h5v184h-14v-9h6v-31h4v-23h-4V92h4V73h-5V44h4z" fill="url(#chm-shallows)" />
      <path d="M231 43h-4v30h5m-1 20h-4v26h4m-2 26v26h-7" fill="none" stroke="#9ab49b" strokeOpacity=".55" />
      <path d="M4 134h18v6H4z" fill="#805e49" />
      <path d="M5 134h2v7H5zM10 134h2v7h-2zM15 134h2v7h-2zM20 134h2v7h-2z" fill="#b38f66" />
      {/* trees */}
      {[
        [68, 3], [65, 24], [4, 49], [10, 72], [67, 56], [77, 70], [133, 50], [150, 63], [167, 53],
        [176, 79], [6, 95], [57, 113], [102, 119], [149, 112], [170, 111], [224, 87],
        [57, 151], [101, 154], [119, 158], [165, 150], [223, 145], [7, 159], [11, 172], [55, 172], [177, 170], [214, 171],
      ].map(([x, y], i) => (
        <Tree key={i} x={x} y={y} s={i} />
      ))}
      {/* clouds */}
      {[
        [4, 40, 0],
        [16, 55, -22],
        [9, 70, -44],
      ].map(([y, d, dl], i) => (
        <g key={i} className="chm-m-cloud" style={{ ['--d' as string]: `${d}s`, ['--dl' as string]: `${dl}s` } as CSSProperties}>
          <rect x={0} y={y + 2} width={22} height={4} fill="#e2efda" opacity={0.28} />
          <rect x={5} y={y} width={11} height={2} fill="#e2efda" opacity={0.28} />
        </g>
      ))}
    </svg>
  )
}

/* ───────────────────────── screen ───────────────────────── */

export default function WorldMap() {
  const { account } = useWallet()
  const w = useWorldState(account)
  const firstSteps = useFirstSteps()
  const livingRoster = useLifeRoster()
  const refresh = useRefresh()
  const { run } = useAction()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1000)
  const [hidden, setHidden] = useState(() => !keeperGuideEnabled())
  const [activityOpen, setActivityOpen] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const u = width / MW

  const quest = keeperMission(w.progress)
  const guided = hidden ? null : firstSteps.active ? (['gas','hatch'].includes(firstSteps.stage) ? 'lab' : firstSteps.stage === 'fight' ? 'arena' : null) : quest.landmark
  const guidedRef = useRef<Key | null>(null)
  guidedRef.current = guided

  async function drawWell() {
    if (!account || (!w.progress.specimens?.length && !w.progress.genesis)) return travel('lab')
    if (w.noGas) return void toast({ kind: 'err', title: 'Your wallet has no gas', detail: 'Drawing from the well is a transaction, so you need a little test ETH first. Grab some free from a Sepolia faucet, then try again.' })
    await run(
      'Faucet',
      async (step) => {
        const r = await faucet(account, step)
        refresh('balHandle', 'bal')
        return r
      },
      `${FAUCET_AMOUNT.toLocaleString()} cZAMA added to your wallet`,
      { spec: { kind: 'faucet' } },
    )
  }
  function enter(p: Place) {
    unlockAudio()
    sfx.select()
    if (p.key === 'well') return void setTimeout(drawWell, 200)
    const route = guided === p.key && quest.step ? quest.target : p.key
    travel(route)
  }

  // Keyboard: arrows / WASD walk the cursor between buildings, Enter goes in.
  const [sel, setSel] = useState<Key | null>(null)
  const selRef = useRef<Key | null>(null)
  selRef.current = sel
  useEffect(() => {
    const centre = (k: Key) => {
      const p = PLACES.find((x) => x.key === k)!
      const a = BUILDINGS[k]
      return { x: p.x + a.w / 2, y: p.y + a.h / 2 }
    }
    const DIRS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] }
    const map = box.current
    if (!map) return
    const select = (key: Key) => {
      setSel(key)
      const target = map.querySelector<HTMLButtonElement>(`[data-place="${key}"]`)
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'nearest' })
    }
    const onKey = (e: KeyboardEvent) => {
      if (getSceneOpen() || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      const dir = DIRS[e.key.length === 1 ? e.key.toLowerCase() : e.key]
      const cur = (t?.closest<HTMLElement>('[data-place]')?.dataset.place as Key | undefined) ?? selRef.current
      if (dir) {
        e.preventDefault()
        unlockAudio()
        if (!cur) return select(guidedRef.current ?? 'lab')
        const c = centre(cur)
        let best: Key | null = null
        let bestScore = Infinity
        for (const p of PLACES) {
          if (p.key === cur) continue
          const o = centre(p.key)
          const dx = o.x - c.x
          const dy = o.y - c.y
          const along = dx * dir[0] + dy * dir[1]
          if (along <= 4) continue
          const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0])
          const score = along + across * 2
          if (score < bestScore) {
            bestScore = score
            best = p.key
          }
        }
        if (best) {
          select(best)
          sfx.blip()
        }
      } else if ((e.key === 'Enter' || e.key === ' ') && cur && !(t && /^(BUTTON|A)$/.test(t.tagName))) {
        e.preventDefault()
        enterRef.current(PLACES.find((p) => p.key === cur)!)
      }
    }
    map.addEventListener('keydown', onKey)
    return () => map.removeEventListener('keydown', onKey)
  }, [])
  const enterRef = useRef(enter)
  enterRef.current = enter
  function setGuide(off: boolean) {
    setHidden(off)
    localStorage.setItem('chm:guide', off ? 'off' : 'on')
  }

  const [hovered, setHovered] = useState<Key | null>(null)
  const landmark = PLACES.find((p) => p.key === (hovered ?? sel ?? guided)) ?? PLACES.find((p) => p.key === 'lab')!
  const activity = w.st[landmark.key]
  const todo = PLACES.filter((p) => w.st[p.key]?.alert)

  return (
    <div className="chm-overworld">
      <div className="chm-world-title">
        <h1 className="font-display">The Arkhive</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-sm font-bold text-[var(--chm-black)]">
          <Link to="lore" className="inline-flex min-h-11 items-center px-1 underline underline-offset-4">Lore</Link>
          <Link to="guide" className="inline-flex min-h-11 items-center px-1 underline underline-offset-4">Guide</Link>
        </div>
        {account && <div className="chm-world-resources" aria-label="Keeper supplies">
          <span title="Creatures"><PxIcon name="paw" size={14} /> {w.ids.length}</span>
          <span title="Lab energy"><EnergyPips value={w.stats?.energy} size={14} /></span>
        </div>}
      </div>
      {account && <Link to={livingRoster.data?.unread?.latest ? `life/${livingRoster.data.unread.latest.nft}` : 'life'} className={livingRoster.data?.unread?.count ? 'returning-story' : 'living-world-link'}>
        <span><PxIcon name={livingRoster.data?.unread?.count ? 'star' : 'paw'} size={22} /></span>
        <span><strong>{livingRoster.data?.unread?.count ? `${livingRoster.data.unread.count} new ${livingRoster.data.unread.count === 1 ? 'story' : 'stories'} from your Xenos` : 'Your Xenos have a life here'}</strong>
        <small>{livingRoster.data?.unread?.count ? livingRoster.data.unread.items ? `${livingRoster.data.unread.items} ${livingRoster.data.unread.items === 1 ? 'item' : 'items'} earned · already in their bags` : 'They returned safely. See what happened.' : 'Encounters, discoveries and their field bags'}</small></span><span aria-hidden="true">→</span>
      </Link>}
      {!firstSteps.active && <aside className="chm-world-guide" aria-label="Keeper guide">
        {hidden ? (
          <button type="button" onClick={() => setGuide(false)} className="chm-guide-toggle">
            <span className="w-7 shrink-0" aria-hidden="true"><Px rows={PROF} pal={PROF_PAL} /></span>
            Talk to Professor Lumen
          </button>
        ) : (
          <KeeperBriefing quest={quest} hide={() => setGuide(true)} enter={travel} />
        )}
      </aside>}
      <div className="chm-world-board">
        <div ref={box} role="region" aria-label="Interactive world map" aria-describedby="map-controls" tabIndex={0} data-motion="full" className="chm-world-map" style={{ aspectRatio: `${MW} / ${MH}` }}>
          <Ground />
          {PLACES.map((p) => (
            <Building key={p.key} p={p} u={u} s={w.st[p.key]} guided={guided === p.key} selected={landmark.key === p.key} onEnter={enter} onHover={setHovered} onFocus={setSel} />
          ))}
          {w.ids.slice(0, 3).map((id, i) => <MapPet key={id} id={id} i={i} u={u} />)}
          <button
            type="button"
            className="chm-world-lumen"
            style={{ left: `${(132 / MW) * 100}%`, top: `${((PLAZA_Y - 7) / MH) * 100}%`, width: Math.max(32, u * 9) }}
            onClick={() => {
              unlockAudio()
              sfx.blip()
              setGuide(false)
            }}
            title="Talk to Professor Lumen"
            aria-label="Talk to Professor Lumen"
          >
            <span className="chm-m-bob mx-auto block w-[65%]"><Px rows={PROF} pal={PROF_PAL} /></span>
          </button>
          {!DEPLOYED && <p className="chm-world-offline">Contracts not live</p>}
        </div>
        <div className="chm-world-status">
          <div className="min-w-0">
            <strong>{landmark.label}</strong>
            <p>{activity?.alert ?? activity?.line ?? landmark.blurb}{activity?.timer ? ` · ${activity.timer}` : ''}</p>
          </div>
          <span id="map-controls" className="chm-world-controls">Arrow keys to move · Enter to visit</span>
        </div>
        <details className="chm-world-directory">
          <summary>Browse destinations <ChevronDown className="h-4 w-4" aria-hidden="true" /></summary>
          <ul>
            {PLACES.map((p) => {
              const art = BUILDINGS[p.key]
              return <li key={p.key}>
                <button type="button" onClick={() => enter(p)}>
                  <svg viewBox={`0 0 ${art.w} ${art.h}`} shapeRendering="crispEdges" aria-hidden="true">{art.draw()}</svg>
                  <span>{p.label}{w.st[p.key]?.alert && <span aria-label="Action available"> · !</span>}</span>
                </button>
              </li>
            })}
          </ul>
        </details>
      </div>
      <aside className="chm-world-journal" aria-label="World activity">
        {account && (todo.length > 0 || w.st.expeditions?.timer) && <details className="chm-world-disclosure">
          <summary>Ready to act <span>{todo.length}</span></summary>
          <ul>
            {todo.map((p) => <li key={p.key}><button type="button" onClick={() => enter(p)}>{w.st[p.key]?.alert}</button></li>)}
          </ul>
          {w.st.expeditions?.timer && <p>Next expedition back in {w.st.expeditions.timer}</p>}
        </details>}
        <details className="chm-world-disclosure" onToggle={event => setActivityOpen(event.currentTarget.open)}>
          <summary>Arkhive activity <ChevronDown className="h-4 w-4" aria-hidden="true" /></summary>
          {activityOpen && <ChronicleFeed limit={5} dark />}
        </details>
        <JudgeButton className="chm-world-judge" />
      </aside>
    </div>
  )
}
