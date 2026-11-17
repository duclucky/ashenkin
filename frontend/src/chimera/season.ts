/* Season of Masks — Blind Tactics (Colosseum), Relic caches, Oracle's Riddle.
   Actions (signing) + read hooks for the three new contracts. */
import { useQuery } from '@tanstack/react-query'
import { parseEventLogs, type Abi, type Address, type Hex } from 'viem'
import { CHAIN_ID, COLOSSEUM, DEPLOYED, LAB, ORACLE, RELICS, SEASON_BLOCK, TRAINING, colosseumAbi, getWallet, labAbi, oracleAbi, relicsAbi, trainingAbi, read, scanLogs, send, type Sent } from './chain'
import { encryptMany, isZero, privateValues, publicDecryptWithProof, publicValues } from './fhe'
import { ensureOperator } from './actions'
import { useLabKeyReady } from './hooks'
import { settlementEvent, sponsoredSettlement } from './sponsored-settlement'
import { sealHuntPlan } from './game/hunt-encryption'
import type { HuntPlanPreparation } from './game/hunt-plan'
export { MOVE_BONUS, ROLL_BOUND, duelOf } from './game/tactics-rules'

type Step = (s: string, hash?: string) => void
const evAt = (r: Sent, name: string, at: Address) => r.events.find((e) => e.eventName === name && e.address.toLowerCase() === at.toLowerCase())?.args
const lc = (h: string) => h.toLowerCase()

/* ═════════════════════════════ Blind Tactics ═════════════════════════════ */

export const MOVES = [
  { key: 'strike', name: 'Strike', short: 'STR', beats: 'Feint', color: '#E5341D', blurb: 'Raw force. Breaks a Feint, bounces off a Guard.' },
  { key: 'guard', name: 'Guard', short: 'GRD', beats: 'Strike', color: '#5AC8FA', blurb: 'Brace. Stops a Strike cold, but a Feint slips past.' },
  { key: 'feint', name: 'Feint', short: 'FNT', beats: 'Guard', color: '#B57BFF', blurb: 'Misdirect. Beats a Guard, gets punished by a Strike.' },
] as const

export const packPlan = (m: number[]) => (m[0] & 3) | ((m[1] & 3) << 2) | ((m[2] & 3) << 4)
export const unpackPlan = (p: number) => [p & 3, (p >> 2) & 3, (p >> 4) & 3].map((x) => Math.min(x, 2))
export const randomPlan = () => [0, 1, 2].map(() => Math.floor(Math.random() * 3))

const PLAN = (battleId: number) => `chm:plan:${COLOSSEUM.toLowerCase()}:${battleId}`
export function savePlan(battleId: number, moves: number[]) {
  try {
    localStorage.setItem(PLAN(battleId), moves.join(''))
  } catch {
    /* ignore */
  }
}
export function loadPlan(battleId: number): number[] | null {
  try {
    const s = localStorage.getItem(PLAN(battleId))
    return s && /^[0-2]{3}$/.test(s) ? s.split('').map(Number) : null
  } catch {
    return null
  }
}

export type TacticStarted = Sent & { battleId: number; rounds: Hex[]; wildId?: number }
function started(r: Sent, moves: number[]): TacticStarted {
  const b = evAt(r, 'BattleStarted', COLOSSEUM)
  const w = evAt(r, 'WildSpawned', COLOSSEUM)
  const battleId = Number(b?.battleId)
  savePlan(battleId, moves)
  return { ...r, battleId, rounds: [...(b?.roundHandles ?? [])] as Hex[], wildId: w ? Number(w.wildId) : undefined }
}

async function sealForHunt(account: Address, moves: number[], step: Step, prepared?: HuntPlanPreparation) {
  if (getWallet().account?.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet changed. Select your moves again with the current wallet.')
  step('Sealing your 3 moves in the browser…')
  const plan = { chainId: CHAIN_ID, colosseum: COLOSSEUM, account, moves: packPlan(moves) }
  if (prepared && getWallet().chainId === CHAIN_ID) return prepared.take(plan)
  prepared?.clear()
  return sealHuntPlan(plan)
}

export async function tacticsExplore(account: Address, myId: number, moves: number[], step: Step, prepared?: HuntPlanPreparation) {
  const { handle, proof } = await sealForHunt(account, moves, step, prepared)
  step('Venturing into the Colosseum pits…')
  return started(await send({ address: COLOSSEUM, abi: colosseumAbi, functionName: 'explore', args: [BigInt(myId), handle, proof], expectedAccount: account }), moves)
}

export async function tacticsChallenge(account: Address, myId: number, wildId: number, moves: number[], step: Step, prepared?: HuntPlanPreparation) {
  const { handle, proof } = await sealForHunt(account, moves, step, prepared)
  step('Stalking the wild creature…')
  return started(await send({ address: COLOSSEUM, abi: colosseumAbi, functionName: 'challengeWild', args: [BigInt(myId), BigInt(wildId), handle, proof], expectedAccount: account }), moves)
}

export async function tacticsDuel(account: Address, myId: number, defenderId: number, stake: bigint, moves: number[], step: Step) {
  await ensureOperator(account, COLOSSEUM, step)
  step('Encrypting your stake and your 3 moves together…')
  const e = await encryptMany(COLOSSEUM, account, [
    { bits: 64, value: stake },
    { bits: 8, value: packPlan(moves) },
  ])
  step('Entering the duel…')
  return started(await send({ address: COLOSSEUM, abi: colosseumAbi, functionName: 'duel', args: [BigInt(myId), BigInt(defenderId), e.handles[0], e.handles[1], e.proof] }), moves)
}

export async function tacticsRegister(account: Address, id: number, stake: bigint, moves: number[], step: Step) {
  await ensureOperator(account, COLOSSEUM, step)
  step('Encrypting your stake and your defence plan…')
  const e = await encryptMany(COLOSSEUM, account, [
    { bits: 64, value: stake },
    { bits: 8, value: packPlan(moves) },
  ])
  step('Posting your defender…')
  return send({ address: COLOSSEUM, abi: colosseumAbi, functionName: 'registerDefender', args: [BigInt(id), e.handles[0], e.handles[1], e.proof] })
}

export async function tacticsReplan(account: Address, id: number, moves: number[], step: Step) {
  step('Sealing the new plan…')
  const e = await encryptMany(COLOSSEUM, account, [{ bits: 8, value: packPlan(moves) }])
  step('Swapping your defender’s plan…')
  return send({ address: COLOSSEUM, abi: colosseumAbi, functionName: 'replan', args: [BigInt(id), e.handles[0], e.proof] })
}

export async function tacticsWithdraw(id: number, step: Step) {
  step('Recalling your defender…')
  return send({ address: COLOSSEUM, abi: colosseumAbi, functionName: 'withdrawDefender', args: [BigInt(id)] })
}

export type Settled = Sent & { rounds: boolean[]; won: boolean; theirs?: number[] }
export async function tacticsAutoSettle(battleId: number, handles: Hex[], step: Step): Promise<Settled> {
  const sponsored = await sponsoredSettlement('battle', battleId, handles, step)
  if (!sponsored) return tacticsSettle(battleId, handles, step)
  const event = settlementEvent(sponsored, COLOSSEUM, battleId, { BattleSettled: 'battleId' })
  return { ...sponsored, won: event.args.challengerWon, rounds: roundBits(event.args.rounds) }
}

/** Ask the Zama network for the three round bits (with proof), then settle onchain. */
export async function tacticsSettle(battleId: number, handles: Hex[], step: Step): Promise<Settled> {
  if (handles.length !== 3 || handles.some(isZero)) throw new Error('Three valid round handles are required to settle this fight.')
  step('Asking the Zama network to reveal the 3 rounds…')
  const p = await publicDecryptWithProof(handles, { tries: 20 })
  const val = (h: string) => {
    const hit = Object.entries(p.clearValues).find(([k]) => lc(k) === lc(h))
    if (!hit || typeof hit[1] !== 'boolean') throw new Error('The Zama proof did not contain all three round results. Try reading the proof again.')
    return hit[1]
  }
  const rounds = handles.map(val)
  const won = rounds.filter(Boolean).length >= 2
  step(won ? 'Challenger took the fight — settling onchain…' : 'Defender held — settling onchain…')
  const s = await send({ address: COLOSSEUM, abi: colosseumAbi, functionName: 'settle', args: [BigInt(battleId), p.abiEncodedClearValues, p.decryptionProof] })
  // Reading the wild's private plan is optional and remains available in the log.
  // A relayer timeout must never hold an already confirmed public result here.
  return { ...s, rounds, won }
}

/** The wild creature's random plan — only the hunter can decrypt it. */
export async function wildPlan(account: Address, battleId: number) {
  const h = await read<Hex>(COLOSSEUM, colosseumAbi, 'wildPlanHandle', [BigInt(battleId)])
  if (isZero(h)) return undefined
  const v = await privateValues(account, [{ handle: h, contract: COLOSSEUM }])
  return unpackPlan(Number(v[lc(h)] as bigint))
}

export type TBattle = {
  id: number
  kind: 0 | 1
  status: 0 | 1 | 2
  challengerWon: boolean
  rounds: number
  challengerId: number
  opponentId: number
  challenger: Address
  opponent: Address
  startedAt: number
  handles: Hex[]
}
export async function fetchTBattle(id: number): Promise<TBattle> {
  const [b, hs] = await read<[any, Hex[]]>(COLOSSEUM, colosseumAbi, 'getBattle', [BigInt(id)])
  return {
    id,
    kind: Number(b.kind) as 0 | 1,
    status: Number(b.status) as 0 | 1 | 2,
    challengerWon: b.challengerWon,
    rounds: Number(b.rounds),
    challengerId: Number(b.challengerId),
    opponentId: Number(b.opponentId),
    challenger: b.challenger,
    opponent: b.opponent,
    startedAt: Number(b.startedAt),
    handles: [...hs],
  }
}
export const roundBits = (mask: number) => [0, 1, 2].map((i) => !!(mask & (1 << i)))

type HistoryEvent =
  | { eventName: 'DefenderRegistered'; args: { creatureId: bigint; keeper: Address } }
  | { eventName: 'BattleStarted'; args: { battleId: bigint; kind: number; challenger: Address; opponentId: bigint } }

const settledHistory = new Map<number, TBattle>()

export async function fetchKeeperBattles(account: Address): Promise<TBattle[]> {
  const logs = await scanLogs(`colosseum-history:${lc(COLOSSEUM)}`, COLOSSEUM, SEASON_BLOCK)
  const events = parseEventLogs({ abi: colosseumAbi as Abi, logs, eventName: ['BattleStarted', 'DefenderRegistered'] }) as unknown as HistoryEvent[]
  const keeper = lc(account)
  const defenderIds = new Set<bigint>()
  for (const event of events) {
    if (event.eventName === 'DefenderRegistered' && lc(event.args.keeper) === keeper) defenderIds.add(event.args.creatureId)
  }

  // The start event does not include the defender's address. Check historical
  // registration candidates against the participants saved on the battle itself.
  const ids = new Set<number>()
  for (const event of events) {
    if (event.eventName !== 'BattleStarted') continue
    const { battleId, kind, challenger, opponentId } = event.args
    if (lc(challenger) === keeper || (kind === 1 && defenderIds.has(opponentId))) ids.add(Number(battleId))
  }

  const candidates = [...ids]
  const matches: TBattle[] = []
  for (let i = 0; i < candidates.length; i += 16) {
    const battles = await Promise.all(candidates.slice(i, i + 16).map(async id => {
      const battle = settledHistory.get(id) ?? await fetchTBattle(id)
      if (battle.status === 2) settledHistory.set(id, battle)
      return battle
    }))
    matches.push(...battles.filter(b => b.status !== 0 && (lc(b.challenger) === keeper || (b.kind === 1 && lc(b.opponent) === keeper))))
  }
  return matches.sort((a, b) => b.id - a.id)
}

export function useKeeperBattles(account?: Address | null, enabled = true) {
  return useQuery({
    queryKey: ['tbattles', 'keeper', COLOSSEUM, account?.toLowerCase()],
    queryFn: () => fetchKeeperBattles(account!),
    enabled: DEPLOYED && enabled && !!account,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}

export function battleIdFromInput(value: string | undefined): number | null {
  const id = Number(value)
  return /^\d+$/.test(value ?? '') && Number.isSafeInteger(id) && id > 0 ? id : null
}

export function useTBattle(id: number | null) {
  return useQuery({
    queryKey: ['tbattles', 'battle', COLOSSEUM, id],
    queryFn: () => fetchTBattle(id!),
    enabled: DEPLOYED && id != null,
    refetchInterval: query => query.state.data?.status === 1 ? 15_000 : false,
  })
}

export function useTBattles(limit = 30, enabled = true) {
  return useQuery({
    queryKey: ['tbattles', limit],
    queryFn: async () => {
      const total = Number(await read<bigint>(COLOSSEUM, colosseumAbi, 'totalBattles'))
      const ids = Array.from({ length: Math.min(limit, total) }, (_, i) => total - i)
      return Promise.all(ids.map(fetchTBattle))
    },
    enabled: DEPLOYED && enabled,
    refetchInterval: 15_000,
  })
}

export function useTWilds(enabled = true) {
  return useQuery({
    queryKey: ['twilds'],
    queryFn: async () => {
      const ids = (await read<bigint[]>(COLOSSEUM, colosseumAbi, 'roamingWilds')).map(Number)
      const engaged = await Promise.all(ids.map((id) => read<boolean>(COLOSSEUM, colosseumAbi, 'wildEngaged', [BigInt(id)])))
      return ids.map((id, i) => ({ id, engaged: engaged[i] })).sort((a, b) => b.id - a.id)
    },
    enabled: DEPLOYED && enabled,
    refetchInterval: 15_000,
  })
}

export function useTBCreatureRecord(id: number) {
  return useQuery({
    queryKey: ['tcreature-wins', id],
    queryFn: async () => Number(await read<number>(COLOSSEUM, colosseumAbi, 'creatureWins', [BigInt(id)])),
    enabled: DEPLOYED && Number.isSafeInteger(id) && id > 0,
    refetchInterval: 30_000,
  })
}

export type TDefender = { id: number; keeper: Address; since: number; active: boolean; replans: number; stake: Hex; plan: Hex; valid: boolean }
export function useTDefender(id: number, owner?: Address) {
  return useQuery({
    queryKey: ['tdefenders', id, owner],
    queryFn: async () => {
      const [keeper, , active] = await read<[Address, bigint, boolean]>(COLOSSEUM, colosseumAbi, 'getDefender', [BigInt(id)])
      return active && keeper.toLowerCase() === owner?.toLowerCase()
    },
    enabled: DEPLOYED && Number.isSafeInteger(id) && id > 0 && !!owner,
    refetchInterval: 15_000,
  })
}

export function useTDefenders() {
  return useQuery({
    queryKey: ['tdefenders'],
    queryFn: async (): Promise<TDefender[]> => {
      const ids = (await read<bigint[]>(COLOSSEUM, colosseumAbi, 'activeDefenders')).map(Number)
      const ds = await Promise.all(ids.map((id) => read<any[]>(COLOSSEUM, colosseumAbi, 'getDefender', [BigInt(id)])))
      const owners = await Promise.all(ids.map((id) => read<Address>(LAB, labAbi, 'ownerOf', [BigInt(id)]).catch(() => null)))
      return ids
        .map((id, i) => ({ id, keeper: ds[i][0], since: Number(ds[i][1]), active: ds[i][2], replans: Number(ds[i][3]), stake: ds[i][4], plan: ds[i][5], valid: owners[i]?.toLowerCase() === String(ds[i][0]).toLowerCase() }))
        .sort((a, b) => b.since - a.since)
    },
    enabled: DEPLOYED,
    refetchInterval: 15_000,
  })
}

export function useTReadyAt(id?: number | null) {
  return useQuery({
    queryKey: ['treadyAt', id],
    queryFn: async () => Number(await read<bigint>(COLOSSEUM, colosseumAbi, 'readyAt', [BigInt(id!)])),
    enabled: DEPLOYED && !!id,
    refetchInterval: 20_000,
  })
}

export function useTStats(account?: Address | null) {
  return useQuery({
    queryKey: ['tstats', account],
    queryFn: async () => {
      const a = [account!]
      const [wins, losses, captures, rounds, sweeps] = await Promise.all(['wins', 'losses', 'captures', 'roundsTaken', 'sweeps'].map((f) => read<number>(COLOSSEUM, colosseumAbi, f, a)))
      return { wins: Number(wins), losses: Number(losses), captures: Number(captures), rounds: Number(rounds), sweeps: Number(sweeps) }
    },
    enabled: DEPLOYED && !!account,
    refetchInterval: 30_000,
  })
}

/** The keeper's own sealed defence plan. */
export function useMyDefencePlan(d: TDefender | undefined, account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  const mine = !!d && !!account && d.keeper.toLowerCase() === account.toLowerCase()
  return useQuery({
    queryKey: ['tplan', d?.plan, account],
    queryFn: async () => {
      const v = await privateValues(account!, [{ handle: d!.plan, contract: COLOSSEUM }])
      return unpackPlan(Number(v[lc(d!.plan)] as bigint))
    },
    enabled: mine && keyReady && !!d && !isZero(d.plan),
    staleTime: Infinity,
    retry: 1,
  })
}

/* ═════════════════════════════ Relics ═════════════════════════════ */

export const TIERS_R = [
  { name: 'Dust', color: '#8a8a8a', power: '0', odds: 0 },
  { name: 'Common', color: '#cfcfcf', power: '2–5', odds: 153 },
  { name: 'Rare', color: '#5AC8FA', power: '6–9', odds: 72 },
  { name: 'Epic', color: '#B57BFF', power: '11–18', odds: 26 },
  { name: 'Legendary', color: '#FFDD00', power: '20–27', odds: 5 },
] as const
export const CACHE_PRICE = 25
export const FUSE_PRICE = 5
export const PITY = 20
export const SECOND_SLOT_LEVEL = 5
export const RELIC_SOURCES = ['Cache', 'Fusion', 'Prize']

export type Relic = {
  id: number
  keeper: Address
  equippedTo: number
  slot: number
  burned: boolean
  appraised: boolean
  tier: number
  power: number
  source: number
  createdAt: number
  tierHandle: Hex
  powerHandle: Hex
}
export async function fetchRelic(id: number): Promise<Relic> {
  const [r, th, ph] = await read<[any, Hex, Hex]>(RELICS, relicsAbi, 'getRelic', [BigInt(id)])
  return {
    id,
    keeper: r.keeper,
    equippedTo: Number(r.equippedTo),
    slot: Number(r.slot),
    burned: r.burned,
    appraised: r.appraised,
    tier: Number(r.tier),
    power: Number(r.power),
    source: Number(r.source),
    createdAt: Number(r.createdAt),
    tierHandle: th,
    powerHandle: ph,
  }
}

export function useMyRelics(account?: Address | null) {
  return useQuery({
    queryKey: ['relics', account],
    queryFn: async () => {
      const ids = (await read<bigint[]>(RELICS, relicsAbi, 'relicsOf', [account!])).map(Number)
      const all = await Promise.all(ids.map(fetchRelic))
      return all.filter((r) => !r.burned).sort((a, b) => b.id - a.id)
    },
    enabled: DEPLOYED && !!account,
    refetchInterval: 30_000,
  })
}

/** Private tier/power of the keeper's relics (needs the lab key). Appraised ones are public. */
export function useRelicSecrets(relics: Relic[] | undefined, account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  const key = (relics ?? []).map((r) => r.id).join(',')
  return useQuery({
    queryKey: ['relicSecrets', key, account],
    queryFn: async () => {
      const out: Record<number, { tier: number; power: number }> = {}
      const todo = (relics ?? []).filter((r) => {
        if (r.appraised) out[r.id] = { tier: r.tier, power: r.power }
        return !r.appraised
      })
      if (todo.length) {
        const v = await privateValues(
          account!,
          todo.flatMap((r) => [
            { handle: r.tierHandle, contract: RELICS },
            { handle: r.powerHandle, contract: RELICS },
          ]),
        )
        for (const r of todo) out[r.id] = { tier: Number(v[lc(r.tierHandle)] ?? 0n), power: Number(v[lc(r.powerHandle)] ?? 0n) }
      }
      return out
    },
    enabled: !!relics?.length && !!account && keyReady,
    staleTime: Infinity,
    retry: 1,
  })
}

export function useRelicWorld() {
  return useQuery({
    queryKey: ['relicWorld'],
    queryFn: async () => {
      const [opened, fusions, total, a0, a1, a2, a3, a4] = await Promise.all([
        read<bigint>(RELICS, relicsAbi, 'cachesOpened'),
        read<bigint>(RELICS, relicsAbi, 'fusions'),
        read<bigint>(RELICS, relicsAbi, 'totalRelics'),
        ...[0, 1, 2, 3, 4].map((i) => read<number>(RELICS, relicsAbi, 'appraisedByTier', [BigInt(i)])),
      ])
      return { opened: Number(opened), fusions: Number(fusions), total: Number(total), appraised: [a0, a1, a2, a3, a4].map(Number) }
    },
    enabled: DEPLOYED,
    refetchInterval: 30_000,
  })
}

export function usePity(account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  return useQuery({
    queryKey: ['pity', account],
    queryFn: async () => {
      const h = await read<Hex>(RELICS, relicsAbi, 'pityHandle', [account!])
      if (isZero(h)) return 0
      const v = await privateValues(account!, [{ handle: h, contract: RELICS }])
      return Number(v[lc(h)] as bigint)
    },
    enabled: DEPLOYED && !!account && keyReady,
    staleTime: 10_000,
    retry: 1,
  })
}

export function useSlots(creatureId?: number | null) {
  return useQuery({
    queryKey: ['slots', creatureId],
    queryFn: async () => (await read<bigint[]>(RELICS, relicsAbi, 'slotsOf', [BigInt(creatureId!)])).map(Number),
    enabled: DEPLOYED && !!creatureId,
    refetchInterval: 30_000,
  })
}

export async function openCache(account: Address, step: Step) {
  await ensureOperator(account, RELICS, step)
  step('Paying 25 encrypted cZAMA and rolling a sealed relic…')
  const r = await send({ address: RELICS, abi: relicsAbi, functionName: 'openCache' })
  const e = evAt(r, 'CacheOpened', RELICS)
  const relicId = Number(e?.relicId)
  let tier: number | undefined
  let power: number | undefined
  try {
    step('Decrypting what you pulled — only you can see it…')
    const v = await privateValues(account, [
      { handle: e?.tierHandle, contract: RELICS },
      { handle: e?.powerHandle, contract: RELICS },
    ])
    tier = Number(v[lc(e?.tierHandle)])
    power = Number(v[lc(e?.powerHandle)])
  } catch {
    /* the bag can reveal it later */
  }
  return { ...r, relicId, tier, power }
}

export async function equipRelic(relicId: number, creatureId: number, slot: number, step: Step) {
  step('Binding the relic to your creature…')
  return send({ address: RELICS, abi: relicsAbi, functionName: 'equip', args: [BigInt(relicId), BigInt(creatureId), slot] })
}

export async function unequipRelic(relicId: number, step: Step) {
  step('Returning the relic to your bag…')
  return send({ address: RELICS, abi: relicsAbi, functionName: 'unequip', args: [BigInt(relicId)] })
}

export async function fuseRelics(account: Address, ids: number[], step: Step) {
  await ensureOperator(account, RELICS, step)
  step('Melting three relics into one (5 cZAMA unlocks the upgrade roll)…')
  const r = await send({ address: RELICS, abi: relicsAbi, functionName: 'fuse', args: ids.map(BigInt) })
  const e = evAt(r, 'CacheOpened', RELICS)
  const relicId = Number(e?.relicId)
  let tier: number | undefined
  let power: number | undefined
  try {
    step('Decrypting the fused relic…')
    const v = await privateValues(account, [
      { handle: e?.tierHandle, contract: RELICS },
      { handle: e?.powerHandle, contract: RELICS },
    ])
    tier = Number(v[lc(e?.tierHandle)])
    power = Number(v[lc(e?.powerHandle)])
  } catch {
    /* ignore */
  }
  return { ...r, relicId, tier, power }
}

/** Make a relic public (tier + power) so anyone can verify your pull. */
export async function appraiseRelic(relic: Relic, step: Step) {
  step('Opening the relic to public appraisal…')
  await send({ address: RELICS, abi: relicsAbi, functionName: 'appraise', args: [BigInt(relic.id)] })
  step('Fetching the appraisal proof from the Zama network…')
  const p = await publicDecryptWithProof([relic.tierHandle, relic.powerHandle], { tries: 20 })
  step('Publishing the appraisal onchain…')
  return send({ address: RELICS, abi: relicsAbi, functionName: 'publishAppraisal', args: [BigInt(relic.id), p.abiEncodedClearValues, p.decryptionProof] })
}

/* ═════════════════════════════ Oracle's Riddle ═════════════════════════════ */

export const GUESS_PRICE = 2
export const GENES = ['Body', 'Eyes', 'Crest', 'Aura'] as const
export const packGuess = (g: number[]) => (g[0] & 15) | ((g[1] & 15) << 4) | ((g[2] & 15) << 8) | ((g[3] & 15) << 12)
/** 2 exact · 1 close (±2) · 0 far, per gene. null = fee did not arrive. */
export const decodeHint = (fb: number) => (fb === 255 ? null : [0, 1, 2, 3].map((i) => (fb >> (2 * i)) & 3))

const GKEY = (id: number) => `chm:guess:${ORACLE.toLowerCase()}:${id}`
export function saveGuess(id: number, genes: number[]) {
  try {
    localStorage.setItem(GKEY(id), genes.join(','))
  } catch {
    /* ignore */
  }
}
export function loadGuess(id: number): number[] | null {
  try {
    const s = localStorage.getItem(GKEY(id))
    return s ? s.split(',').map(Number) : null
  } catch {
    return null
  }
}

export type ORound = { id: number; startedAt: number; endedAt: number; guesses: number; solver: Address; ended: boolean; answer: Hex[] }
export type OGuess = { id: number; keeper: Address; round: number; at: number; claimed: boolean; finalized: boolean; won: boolean; feedback: Hex; solved: Hex }

async function fetchRound(rid: number): Promise<ORound> {
  const [r, hs] = await read<[any, Hex[]]>(ORACLE, oracleAbi, 'getRound', [rid])
  return { id: rid, startedAt: Number(r.startedAt), endedAt: Number(r.endedAt), guesses: Number(r.guesses), solver: r.solver, ended: r.ended, answer: [...hs] }
}
async function fetchGuess(id: number): Promise<OGuess> {
  const [g, fb, sv] = await read<[any, Hex, Hex]>(ORACLE, oracleAbi, 'getGuess', [BigInt(id)])
  return { id, keeper: g.keeper, round: Number(g.round), at: Number(g.at), claimed: g.claimed, finalized: g.finalized, won: g.won, feedback: fb, solved: sv }
}

export function useOracle(enabled = true) {
  return useQuery({
    queryKey: ['oracle'],
    queryFn: async () => {
      const [current, roundLength, daily, total, potH] = await Promise.all([
        read<number>(ORACLE, oracleAbi, 'currentRound'),
        read<bigint>(ORACLE, oracleAbi, 'roundLength'),
        read<number>(ORACLE, oracleAbi, 'dailyGuesses'),
        read<bigint>(ORACLE, oracleAbi, 'totalGuesses'),
        read<Hex>(ORACLE, oracleAbi, 'potHandle'),
      ])
      const rid = Number(current)
      const rounds = await Promise.all(Array.from({ length: Math.min(rid, 6) }, (_, i) => fetchRound(rid - i)))
      let pot: bigint | null = null
      try {
        const v = await publicValues([potH], { tries: 4 })
        pot = (v[lc(potH)] as bigint) ?? null
      } catch {
        pot = null
      }
      return { round: rounds[0] ?? null, past: rounds.filter((r) => r.ended), roundLength: Number(roundLength), daily: Number(daily), total: Number(total), pot }
    },
    enabled: DEPLOYED && enabled,
    refetchInterval: 20_000,
  })
}

/** Answers of finished rounds (they become public when a round ends). */
export function useRevealedAnswers(rounds: ORound[] | undefined) {
  const key = (rounds ?? []).map((r) => r.id).join(',')
  return useQuery({
    queryKey: ['oracleAnswers', key],
    queryFn: async () => {
      const hs = (rounds ?? []).flatMap((r) => r.answer).filter((h) => !isZero(h))
      const v = hs.length ? await publicValues(hs, { tries: 6 }) : {}
      const out: Record<number, number[] | null> = {}
      for (const r of rounds ?? []) out[r.id] = r.answer.every((h) => v[lc(h)] !== undefined) ? r.answer.map((h) => Number(v[lc(h)] as bigint)) : null
      return out
    },
    enabled: !!rounds?.length,
    staleTime: Infinity,
    retry: 1,
  })
}

export function useMyGuesses(account?: Address | null) {
  return useQuery({
    queryKey: ['guesses', account],
    queryFn: async () => {
      const [ids, left, solves] = await Promise.all([
        read<bigint[]>(ORACLE, oracleAbi, 'guessesOf', [account!]),
        read<number>(ORACLE, oracleAbi, 'guessesLeft', [account!]),
        read<number>(ORACLE, oracleAbi, 'solves', [account!]),
      ])
      const list = await Promise.all(ids.map(Number).slice(-40).map(fetchGuess))
      return { guesses: list.sort((a, b) => b.id - a.id), left: Number(left), solves: Number(solves) }
    },
    enabled: DEPLOYED && !!account,
    refetchInterval: 20_000,
  })
}

export function useHints(guesses: OGuess[] | undefined, account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  const key = (guesses ?? []).map((g) => g.id).join(',')
  return useQuery({
    queryKey: ['hints', key, account],
    queryFn: async () => {
      const v = await privateValues(
        account!,
        (guesses ?? []).map((g) => ({ handle: g.feedback, contract: ORACLE })),
      )
      const out: Record<number, (number[] | null) | undefined> = {}
      for (const g of guesses ?? []) {
        const x = v[lc(g.feedback)]
        out[g.id] = x === undefined ? undefined : decodeHint(Number(x as bigint))
      }
      return out
    },
    enabled: !!guesses?.length && !!account && keyReady,
    staleTime: Infinity,
    retry: 1,
  })
}

export async function oracleGuess(account: Address, genes: number[], step: Step) {
  await ensureOperator(account, ORACLE, step)
  step('Sealing your 4 gene guesses in the browser…')
  const e = await encryptMany(ORACLE, account, [{ bits: 16, value: packGuess(genes) }])
  step('Paying 2 cZAMA into the jackpot and asking the Oracle…')
  const r = await send({ address: ORACLE, abi: oracleAbi, functionName: 'guess', args: [e.handles[0], e.proof] })
  const g = evAt(r, 'Guessed', ORACLE)
  const guessId = Number(g?.guessId)
  saveGuess(guessId, genes)
  let hint: number[] | null | undefined
  try {
    step('Decrypting the Oracle’s private hint…')
    const v = await privateValues(account, [{ handle: g?.feedbackHandle, contract: ORACLE }])
    hint = decodeHint(Number(v[lc(g?.feedbackHandle)] as bigint))
  } catch {
    hint = undefined
  }
  return { ...r, guessId, hint }
}

/** Prove a 4/4 guess publicly and collect the jackpot + a prize relic. */
export async function oracleClaim(guess: OGuess, step: Step) {
  let solved = guess.solved
  if (!guess.claimed) {
    step('Asking the Oracle to prove your answer…')
    const r = await send({ address: ORACLE, abi: oracleAbi, functionName: 'claim', args: [BigInt(guess.id)] })
    solved = (evAt(r, 'ClaimRequested', ORACLE)?.solvedHandle as Hex) ?? solved
  }
  step('Waiting for the Zama network to sign the result…')
  const p = await publicDecryptWithProof([solved], { tries: 20 })
  step('Collecting the jackpot…')
  const s = await send({ address: ORACLE, abi: oracleAbi, functionName: 'finalize', args: [BigInt(guess.id), p.abiEncodedClearValues, p.decryptionProof] })
  const won = !!evAt(s, 'Solved', ORACLE)
  return { ...s, won, relicId: won ? Number(evAt(s, 'Solved', ORACLE)?.relicId) : undefined }
}

export async function oracleExpire(step: Step) {
  step('Closing the expired round and revealing its answer…')
  return send({ address: ORACLE, abi: oracleAbi, functionName: 'expire' })
}

/* ═════════════════════════════ Training v2 extras ═════════════════════════════ */

export function useXpRoom(id?: number | null) {
  return useQuery({
    queryKey: ['xpRoom', id],
    queryFn: async () => {
      const [room, cap] = await Promise.all([read<number>(TRAINING, trainingAbi, 'xpRoomToday', [BigInt(id!)]), read<number>(TRAINING, trainingAbi, 'dailyXpCap')])
      return { room: Number(room), cap: Number(cap) }
    },
    enabled: DEPLOYED && !!id,
    refetchInterval: 30_000,
  })
}

