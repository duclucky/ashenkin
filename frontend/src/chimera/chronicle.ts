import { useQuery } from '@tanstack/react-query'
import { parseEventLogs, zeroAddress, type Abi, type Address, type Log } from 'viem'
import { ASCENSION, DEPTHS, DEPTHS_BLOCK, P1_BLOCK, RAFFLE, RAFFLE_BLOCK, SEASON, ascensionAbi, depthsAbi, raffleAbi, seasonAbi } from './chain'
import { RAFFLE_LIVE } from './raffle'
import { DEPTHS_LIVE } from './depths'
import { P1_LIVE, SEAT_NAMES } from './p1'
import { ARENA, COLOSSEUM, DEPLOYED, EXPEDITIONS, LAB, LEGACY_TRAINING, MARKET, OLD_RAIDS, ORACLE, RAID, RELICS, SEASON_BLOCK, TRAINING, arenaAbi, colosseumAbi, expeditionsAbi, labAbi, marketAbi, oracleAbi, publicClient, raidAbi, relicsAbi, scanLogs, trainingAbi } from './chain'

/** Everything that happened in the Arkhive, rebuilt from public events. Hidden values stay hidden: we only show what the chain already shows. */
export type ChronicleKind = 'hatch' | 'breed' | 'wild' | 'sequence' | 'verify' | 'win' | 'loss' | 'capture' | 'duel' | 'expedition' | 'level' | 'evolve' | 'strike' | 'slain' | 'listed' | 'sold' | 'relic' | 'fuse' | 'oracle' | 'solve' | 'ascend' | 'throne' | 'raffle' | 'depths'
export type ChronicleItem = { key: string; kind: ChronicleKind; block: bigint; who: Address; text: string; to?: string; creature?: number }
export type Keeper = { addr: Address; score: number; wins: number; losses: number; captures: number; strikes: number; kills: number; births: number; verified: number; topLevel: number; expeditions: number; trades: number; relics: number; solves: number; sweeps: number }

export const SCORE_RULES: [keyof Keeper, number, string][] = [
  ['wins', 3, 'Colosseum win'],
  ['sweeps', 2, 'Flawless 3-0 sweep (bonus)'],
  ['solves', 20, "Oracle's Riddle solved"],
  ['relics', 1, 'Relic forged'],
  ['captures', 2, 'Wild capture'],
  ['strikes', 1, 'Boss strike'],
  ['kills', 10, 'Killing blow'],
  ['verified', 15, 'Rare lineage verified'],
  ['topLevel', 2, 'Per level of your best creature'],
  ['births', 1, 'Creature hatched or bred'],
  ['expeditions', 1, 'Expedition run'],
]

const ZONES = ['Ashen Dunes', 'Spore Hollows', 'Abyssal Trench']
const BOSSES = ['Cinder Tyrant', 'Rot Mother', 'Abyss Warden'] // keep in sync with screens/Raid.tsx

type Ev = { eventName: string; args: Record<string, any>; address: Address; blockNumber: bigint; logIndex: number; transactionHash: string }

function decode(logs: Log[], address: Address | Address[], abi: unknown): Ev[] {
  const set = new Set((Array.isArray(address) ? address : [address]).map((a) => a.toLowerCase()))
  const mine = logs.filter((l) => set.has(l.address.toLowerCase()))
  return parseEventLogs({ abi: abi as Abi, logs: mine }) as unknown as Ev[]
}

function build(logs: Log[]) {
  const items: ChronicleItem[] = []
  const keepers = new Map<string, Keeper>()
  const k = (a: Address) => {
    const id = a.toLowerCase()
    if (id === zeroAddress || id === ARENA.toLowerCase() || id === COLOSSEUM.toLowerCase()) return null
    let v = keepers.get(id)
    if (!v) keepers.set(id, (v = { addr: a, score: 0, wins: 0, losses: 0, captures: 0, strikes: 0, kills: 0, births: 0, verified: 0, topLevel: 0, expeditions: 0, trades: 0, relics: 0, solves: 0, sweeps: 0 }))
    return v
  }
  const push = (e: Ev, kind: ChronicleKind, who: Address, text: string, to?: string, creature?: number) =>
    items.push({ key: `${e.transactionHash}:${e.logIndex}`, kind, block: e.blockNumber, who, text, to, creature })

  for (const e of decode(logs, LAB, labAbi)) {
    const a = e.args
    if (e.eventName === 'Hatched') {
      const id = Number(a.id)
      if (a.owner.toLowerCase() === ARENA.toLowerCase() || a.owner.toLowerCase() === COLOSSEUM.toLowerCase()) {
        push(e, 'wild', a.owner, `A wild creature #${id} stalks into the Colosseum`, 'arena', id)
        continue
      }
      const kp = k(a.owner)
      if (kp) kp.births++
      if (Number(a.parentA)) push(e, 'breed', a.owner, `bred #${id} from #${a.parentA} × #${a.parentB}`, `creature/${id}`, id)
      else push(e, 'hatch', a.owner, `hatched genesis specimen #${id}`, `creature/${id}`, id)
    } else if (e.eventName === 'Sequenced') {
      push(e, 'sequence', a.owner, `read a hidden gene of #${a.id} (only they saw it)`, `creature/${a.id}`, Number(a.id))
    } else if (e.eventName === 'ChimeraVerified') {
      const kp = k(a.owner)
      if (kp) kp.verified++
      push(e, 'verify', a.owner, `verified #${a.id}’s rare lineage`, `verify/${a.id}`, Number(a.id))
    }
  }

  const battles = new Map<string, { kind: number; challenger: Address; me: number; foe: number }>()
  for (const e of decode(logs, ARENA, arenaAbi)) {
    const a = e.args
    if (e.eventName === 'BattleStarted') battles.set(String(a.battleId), { kind: Number(a.kind), challenger: a.challenger, me: Number(a.challengerId), foe: Number(a.opponentId) })
    else if (e.eventName === 'BattleSettled') {
      const b = battles.get(String(a.battleId))
      if (!b) continue
      const ch = k(b.challenger)
      if (a.challengerWon) {
        if (ch) ch.wins++
        push(e, b.kind ? 'duel' : 'win', b.challenger, b.kind ? `won a blind duel with #${b.me} against #${b.foe}` : `beat wild #${b.foe} with #${b.me}`, 'arena', b.me)
      } else {
        if (ch) ch.losses++
        if (b.kind) {
          const def = k(a.winner)
          if (def) def.wins++
          push(e, 'duel', a.winner, `defended with #${b.foe}: challenger #${b.me} fell`, 'arena', b.foe)
        } else push(e, 'loss', b.challenger, `lost #${b.me}'s hunt to wild #${b.foe}`, 'arena', b.me)
      }
    } else if (e.eventName === 'WildCaptured') {
      const kp = k(a.hunter)
      if (kp) kp.captures++
      push(e, 'capture', a.hunter, `captured wild #${a.wildId}: fresh genes for the lab`, `creature/${a.wildId}`, Number(a.wildId))
    }
  }

  const tb = new Map<string, { kind: number; challenger: Address; me: number; foe: number }>()
  for (const e of decode(logs, COLOSSEUM, colosseumAbi)) {
    const a = e.args
    if (e.eventName === 'BattleStarted') tb.set(String(a.battleId), { kind: Number(a.kind), challenger: a.challenger, me: Number(a.challengerId), foe: Number(a.opponentId) })
    else if (e.eventName === 'BattleSettled') {
      const b = tb.get(String(a.battleId))
      if (!b) continue
      const ch = k(b.challenger)
      // `rounds` is a bitmask of the rounds the challenger took
      const mask = Number(a.rounds)
      const r = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1)
      const score = `${r}–${3 - r}`
      if (a.challengerWon) {
        if (ch) {
          ch.wins++
          if (r === 3) ch.sweeps++
        }
        push(e, b.kind ? 'duel' : 'win', b.challenger, b.kind ? `out-guessed defender #${b.foe} with #${b.me} (${score} in rounds)` : `beat wild #${b.foe} with #${b.me} (${score} in rounds)`, 'arena', b.me)
      } else {
        if (ch) ch.losses++
        if (b.kind) {
          const def = k(a.winner)
          if (def) {
            def.wins++
            if (r === 0) def.sweeps++
          }
          push(e, 'duel', a.winner, `defended with #${b.foe}: its sealed plan beat #${b.me} (${3 - r}–${r})`, 'arena', b.foe)
        } else push(e, 'loss', b.challenger, `lost #${b.me}'s hunt to wild #${b.foe} (${score})`, 'arena', b.me)
      }
    } else if (e.eventName === 'WildCaptured') {
      const kp = k(a.hunter)
      if (kp) kp.captures++
      push(e, 'capture', a.hunter, `captured wild #${a.wildId}: fresh genes for the lab`, `creature/${a.wildId}`, Number(a.wildId))
    }
  }

  const TIER = ['Dust', 'Common', 'Rare', 'Epic', 'Legendary']
  for (const e of decode(logs, RELICS, relicsAbi)) {
    const a = e.args
    if (e.eventName === 'CacheOpened') {
      const kp = k(a.keeper)
      if (kp) kp.relics++
      const src = Number(a.source)
      if (src === 0) push(e, 'relic', a.keeper, `opened a relic cache: relic #${a.relicId} · tier sealed`, 'relics')
      else if (src === 2) push(e, 'relic', a.keeper, `won relic #${a.relicId} as a prize · tier sealed`, 'relics')
    } else if (e.eventName === 'Fused') {
      push(e, 'fuse', a.keeper, `fused relics #${a.a}, #${a.b}, #${a.c} into #${a.relicId} · result sealed`, 'relics')
    } else if (e.eventName === 'Appraised') {
      push(e, 'relic', a.keeper, `made relic #${a.relicId} public: ${TIER[Number(a.tier)] ?? '?'} +${a.power} power`, 'relics')
    }
  }

  for (const e of decode(logs, ORACLE, oracleAbi)) {
    const a = e.args
    if (e.eventName === 'Solved') {
      const kp = k(a.keeper)
      if (kp) kp.solves++
      push(e, 'solve', a.keeper, `solved the Oracle's Riddle (round ${a.round}) and took the jackpot`, 'oracle')
    } else if (e.eventName === 'RoundEnded' && !a.solved) {
      push(e, 'oracle', ORACLE, `Riddle ${a.round} went unsolved: answer revealed, jackpot rolls over`, 'oracle')
    } else if (e.eventName === 'ClaimRejected') {
      push(e, 'oracle', a.keeper, `claimed the Oracle jackpot, but the proof said no`, 'oracle')
    }
  }

  if (P1_LIVE) {
    for (const e of decode(logs, ASCENSION, ascensionAbi)) {
      const a = e.args
      if (e.eventName === 'Ascended') push(e, 'ascend', a.keeper, `sacrificed #${a.offeringId} at the Ascension altar: #${a.heroId} +${a.xp} XP`, `creature/${a.heroId}`, Number(a.heroId))
    }
    for (const e of decode(logs, SEASON, seasonAbi)) {
      const a = e.args
      if (e.eventName === 'ThroneClaimed')
        push(e, 'throne', a.keeper, `took the ${SEAT_NAMES[Number(a.seat)] ?? 'throne'} with ${a.score} season pts${a.previous !== zeroAddress ? ` from ${String(a.previous).slice(0, 6)}…` : ''}`, 'hall')
      else if (e.eventName === 'SeasonEnded') push(e, 'throne', SEASON, `Season ${a.season} is over: the three thrones were paid`, 'hall')
    }
  }

  if (RAFFLE_LIVE) {
    for (const e of decode(logs, RAFFLE, raffleAbi)) {
      const a = e.args
      if (e.eventName === 'Entered') push(e, 'raffle', a.keeper, `bought sealed tickets in Raffle #${a.round} (how many is secret)`, 'raffle')
      else if (e.eventName === 'Drawn')
        push(e, 'raffle', a.winner, a.winner === zeroAddress ? `Raffle #${a.round} had no paid tickets: the pot went to the Treasury` : `won Raffle #${a.round}: ${(Number(a.prize) / 1e6).toLocaleString()} cZAMA + a relic cache`, 'raffle')
    }
  }

  if (DEPTHS_LIVE) {
    for (const e of decode(logs, DEPTHS, depthsAbi)) {
      const a = e.args
      if (e.eventName === 'RunStarted') push(e, 'depths', a.keeper, `took #${a.creatureId} down into the Arkhive Depths`, 'depths', Number(a.creatureId))
      else if (e.eventName === 'RunEnded') push(e, 'depths', a.keeper, `climbed out of the Depths after ${a.cleared} floor${Number(a.cleared) === 1 ? '' : 's'} (alive or not, the loot is sealed)`, 'depths')
      else if (e.eventName === 'DepthRecorded' && a.survived)
        push(e, 'depths', a.keeper, `proved surviving ${a.depth} floor${Number(a.depth) === 1 ? '' : 's'} of the Depths${Number(a.relicId) ? ` and won relic #${a.relicId}` : ''}`, 'depths')
    }
  }

  const runs = new Map<string, { creature: number; zone: number }>()
  for (const e of decode(logs, EXPEDITIONS, expeditionsAbi)) {
    const a = e.args
    if (e.eventName === 'ExpeditionStarted') runs.set(String(a.expeditionId), { creature: Number(a.creatureId), zone: Number(a.zone) })
    else if (e.eventName === 'ExpeditionReturned') {
      const r = runs.get(String(a.expeditionId))
      const kp = k(a.keeper)
      if (kp) kp.expeditions++
      push(e, 'expedition', a.keeper, `brought #${r?.creature ?? '?'} home from ${ZONES[r?.zone ?? 0] ?? 'the wilds'} · loot sealed`, 'expeditions', r?.creature)
    }
  }

  for (const e of decode(logs, LEGACY_TRAINING ? [TRAINING, LEGACY_TRAINING] : TRAINING, trainingAbi)) {
    if (e.eventName !== 'LevelUp') continue
    const a = e.args
    const lvl = Number(a.level)
    const kp = k(a.keeper)
    if (kp) kp.topLevel = Math.max(kp.topLevel, lvl)
    const evolved = lvl === 5 || lvl === 10
    push(e, evolved ? 'evolve' : 'level', a.keeper, evolved ? `evolved #${a.creatureId} to ${lvl === 10 ? 'SOVEREIGN' : 'ASCENDED'} (LV ${lvl})` : `trained #${a.creatureId} to LV ${lvl} · power sealed`, `creature/${a.creatureId}`, Number(a.creatureId))
  }

  const bossEl = new Map<string, number>()
  for (const e of decode(logs, [RAID, ...OLD_RAIDS], raidAbi)) {
    const a = e.args
    const pre = e.address.toLowerCase() === RAID.toLowerCase() ? '' : 'pre-season '
    if (e.eventName === 'BossSpawned') bossEl.set(pre + a.level, Number(a.element))
    else if (e.eventName === 'Struck') {
      const kp = k(a.attacker)
      if (kp) kp.strikes++
      push(e, 'strike', a.attacker, `struck the ${pre}Lv ${a.level} boss with #${a.creatureId} · damage sealed`, 'raid', Number(a.creatureId))
    } else if (e.eventName === 'BossSlain') {
      const kp = k(a.killer)
      if (kp) kp.kills++
      push(e, 'slain', a.killer, `landed the killing blow on ${pre}${BOSSES[bossEl.get(pre + a.level) ?? 0]} Lv ${a.level} (${a.raiders} raiders share the pot)`, 'raid')
    }
  }

  const listings = new Map<string, number>()
  for (const e of decode(logs, MARKET, marketAbi)) {
    const a = e.args
    if (e.eventName === 'Listed') {
      listings.set(String(a.listingId), Number(a.creatureId))
      push(e, 'listed', a.seller, `listed #${a.creatureId} for ${(Number(a.price) / 1e6).toLocaleString()} cZAMA`, 'market', Number(a.creatureId))
    } else if (e.eventName === 'Sold') {
      const kp = k(a.buyer)
      if (kp) kp.trades++
      push(e, 'sold', a.buyer, `bought #${a.creatureId} for ${(Number(a.price) / 1e6).toLocaleString()} cZAMA`, `creature/${a.creatureId}`, Number(a.creatureId))
    }
  }

  items.sort((x, y) => (x.block === y.block ? (x.key < y.key ? 1 : -1) : x.block < y.block ? 1 : -1))
  const list = [...keepers.values()]
  for (const v of list) v.score = SCORE_RULES.reduce((s, [f, w]) => s + (v[f] as number) * w, 0)
  list.sort((x, y) => y.score - x.score || y.wins - x.wins)
  return { items, keepers: list }
}

export function useChronicle() {
  return useQuery({
    queryKey: ['chronicle'],
    queryFn: async () => {
      const [base, season, p1, p2, p3] = await Promise.all([
        scanLogs('world', [LAB, ARENA, EXPEDITIONS, ...(LEGACY_TRAINING ? [LEGACY_TRAINING] : []), RAID, ...OLD_RAIDS, MARKET]),
        scanLogs('season', [COLOSSEUM, RELICS, ORACLE, TRAINING], SEASON_BLOCK),
        P1_LIVE ? scanLogs('p1', [ASCENSION, SEASON], P1_BLOCK) : Promise.resolve([]),
        RAFFLE_LIVE ? scanLogs('raffle', [RAFFLE], RAFFLE_BLOCK) : Promise.resolve([]),
        DEPTHS_LIVE ? scanLogs('depths', [DEPTHS], DEPTHS_BLOCK) : Promise.resolve([]),
      ])
      return build([...base, ...season, ...p1, ...p2, ...p3])
    },
    enabled: DEPLOYED,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 2,
  })
}

const blockTimes = new Map<string, number>()
/** Unix time of each block, fetched once and cached for the session. */
export function useBlockTimes(blocks: bigint[]) {
  const want = [...new Set(blocks.map(String))]
  return useQuery({
    queryKey: ['blockTimes', want.join(',')],
    queryFn: async () => {
      await Promise.all(
        want.filter((b) => !blockTimes.has(b)).map(async (b) => {
          const blk = await publicClient.getBlock({ blockNumber: BigInt(b) }).catch(() => null)
          if (blk) blockTimes.set(b, Number(blk.timestamp))
        }),
      )
      return Object.fromEntries(want.map((b) => [b, blockTimes.get(b) ?? 0])) as Record<string, number>
    },
    enabled: want.length > 0,
    staleTime: Infinity,
  })
}

export function ago(t?: number) {
  if (!t) return ''
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
