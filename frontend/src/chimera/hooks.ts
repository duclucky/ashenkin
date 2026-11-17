import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { ARENA, CZAMA, DEPLOYED, EXPEDITIONS, LAB, MARKET, QUESTS, RAID, TRAINING, TREASURY, arenaAbi, czamaAbi, expeditionsAbi, labAbi, marketAbi, questsAbi, raidAbi, trainingAbi, treasuryAbi, publicClient, read } from './chain'
import { privateValues, publicValues, storedLabKey, isZero } from './fhe'

export type CreatureInfo = {
  parentA: number
  parentB: number
  generation: number
  bornAt: bigint
  cooldownUntil: bigint
  sequencedMask: number
  certified: boolean
  chimera: boolean
  wild: boolean
  breeds: number
}
export type CreatureBase = { id: number; owner: Address; info: CreatureInfo; pheno: Hex[]; genome: Hex[] }

const n = (x: unknown) => Number(x as bigint)

/* ───────────────────────── creature reads ───────────────────────── */

export async function fetchCreature(id: number): Promise<CreatureBase> {
  const [owner, info, pheno, genome] = await Promise.all([
    read<Address>(LAB, labAbi, 'ownerOf', [BigInt(id)]),
    read<any>(LAB, labAbi, 'getCreature', [BigInt(id)]),
    read<Hex[]>(LAB, labAbi, 'getPhenotypeHandles', [BigInt(id)]),
    read<Hex[]>(LAB, labAbi, 'getGenomeHandles', [BigInt(id)]),
  ])
  return {
    id,
    owner,
    info: {
      parentA: n(info.parentA),
      parentB: n(info.parentB),
      generation: n(info.generation),
      bornAt: info.bornAt,
      cooldownUntil: info.cooldownUntil,
      sequencedMask: n(info.sequencedMask),
      certified: info.certified,
      chimera: info.chimera,
      wild: info.wild,
      breeds: n(info.breeds ?? 0),
    },
    pheno: [...pheno],
    genome: [...genome],
  }
}

export function useCreature(id?: number | null) {
  return useQuery({
    queryKey: ['creature', id],
    queryFn: () => fetchCreature(id!),
    enabled: DEPLOYED && id != null && id > 0,
    staleTime: 15_000,
    // a missing token reverts: no point retrying that
    retry: (n, e) => n < 2 && !/revert|nonexistent/i.test(String((e as any)?.message ?? e)),
  })
}

/** The 7 visible traits, publicly decrypted through the Zama relayer (cached forever). */
export function useTraits(base?: CreatureBase) {
  const handles = base?.pheno.slice(0, 7) ?? []
  return useQuery({
    queryKey: ['traits', base?.id, handles.join()],
    queryFn: async () => {
      const v = await publicValues(handles)
      return handles.map((h) => Number(v[h.toLowerCase()] as bigint))
    },
    enabled: handles.length === 7 && !handles.some(isZero),
    staleTime: Infinity,
    retry: 6,
    retryDelay: (a) => Math.min(3000 * 2 ** a, 20_000),
  })
}

/** Full genome when certified (anyone can see it). */
export function useCertifiedGenome(base?: CreatureBase) {
  return useQuery({
    queryKey: ['certified', base?.id],
    queryFn: async () => {
      const handles = [...base!.genome, base!.pheno[7]]
      const v = await publicValues(handles)
      return { loci: base!.genome.map((h) => Number(v[h.toLowerCase()] as bigint)), element: Number(v[base!.pheno[7].toLowerCase()] as bigint) }
    },
    enabled: !!base?.info.certified,
    staleTime: Infinity,
    retry: 6,
  })
}

/* ───────────────────────── lab key ───────────────────────── */

export function useLabKeyReady(account?: Address | null) {
  const [ready, setReady] = useState(() => !!(account && storedLabKey(account)))
  useEffect(() => {
    const f = () => setReady(!!(account && storedLabKey(account)))
    f()
    window.addEventListener('chm:labkey', f)
    return () => window.removeEventListener('chm:labkey', f)
  }, [account])
  return ready
}

/** Owner-only secrets: the element and every sequenced locus (both alleles). */
export function usePrivateGenes(base: CreatureBase | undefined, account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  const mine = !!(base && account && base.owner.toLowerCase() === account.toLowerCase())
  return useQuery({
    queryKey: ['private', base?.id, account, base?.info.sequencedMask],
    queryFn: async () => {
      const pairs: { handle: string; contract: Address }[] = [{ handle: base!.pheno[7], contract: LAB }]
      const seq: number[] = []
      for (let i = 0; i < 8; i++) if (base!.info.sequencedMask & (1 << i)) {
        pairs.push({ handle: base!.genome[i], contract: LAB })
        seq.push(i)
      }
      const v = await privateValues(account!, pairs)
      const loci: Record<number, number> = {}
      for (const i of seq) loci[i] = Number(v[base!.genome[i].toLowerCase()] as bigint)
      return { element: Number(v[base!.pheno[7].toLowerCase()] as bigint), loci }
    },
    enabled: mine && keyReady,
    staleTime: Infinity,
    retry: 2,
  })
}

/* ───────────────────────── account reads ───────────────────────── */

export function useMyCreatures(account?: Address | null) {
  return useQuery({
    queryKey: ['mine', account],
    queryFn: async () => (await read<bigint[]>(LAB, labAbi, 'creaturesOf', [account])).map(Number).sort((a, b) => b - a),
    enabled: DEPLOYED && !!account,
    refetchInterval: 20_000,
  })
}

export function useAccountStats(account?: Address | null) {
  return useQuery({
    queryKey: ['account', account],
    queryFn: async () => {
      const [energy, refill, genesis, wins, losses, captures] = await Promise.all([
        read<number>(LAB, labAbi, 'energyOf', [account]),
        read<bigint>(LAB, labAbi, 'nextEnergyRefill', [account]),
        read<bigint>(LAB, labAbi, 'genesisClaimed', [account]),
        read<number>(ARENA, arenaAbi, 'wins', [account]),
        read<number>(ARENA, arenaAbi, 'losses', [account]),
        read<number>(ARENA, arenaAbi, 'captures', [account]),
      ])
      return { energy: Number(energy), refill: Number(refill), genesis: Number(genesis), wins: Number(wins), losses: Number(losses), captures: Number(captures) }
    },
    enabled: DEPLOYED && !!account,
    refetchInterval: 30_000,
  })
}

export function useWorld() {
  return useQuery({
    queryKey: ['world'],
    queryFn: async () => {
      const [creatures, chimeras, battles] = await Promise.all([
        read<bigint>(LAB, labAbi, 'totalCreatures'),
        read<bigint>(LAB, labAbi, 'chimeraCount'),
        read<bigint>(ARENA, arenaAbi, 'totalBattles'),
      ])
      return { creatures: Number(creatures), chimeras: Number(chimeras), battles: Number(battles) }
    },
    enabled: DEPLOYED,
    refetchInterval: 30_000,
  })
}

/** Confidential cZAMA balance — only the holder can decrypt it. */
/** Plain Sepolia ETH (gas money). null = not loaded yet. */
export function useEthBalance(account?: Address | null) {
  const q = useQuery({
    queryKey: ['eth', account],
    queryFn: () => publicClient.getBalance({ address: account! }),
    enabled: !!account,
    refetchInterval: 20_000,
  })
  return q.data ?? null
}

export function useBalance(account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  const handle = useQuery({
    queryKey: ['balHandle', account],
    queryFn: () => read<Hex>(CZAMA, czamaAbi, 'confidentialBalanceOf', [account]),
    enabled: !!account,
    refetchInterval: 20_000,
  })
  const value = useQuery({
    queryKey: ['bal', account, handle.data],
    queryFn: async () => {
      if (isZero(handle.data)) return 0n
      const v = await privateValues(account!, [{ handle: handle.data!, contract: CZAMA }])
      return v[handle.data!.toLowerCase()] as bigint
    },
    enabled: !!account && keyReady && !!handle.data,
    staleTime: Infinity,
  })
  return { handle: handle.data, value: value.data, loading: value.isLoading, error: value.error, keyReady }
}

export function useOperator(account: Address | null | undefined, spender: Address) {
  return useQuery({
    queryKey: ['operator', account, spender],
    queryFn: () => read<boolean>(CZAMA, czamaAbi, 'isOperator', [account, spender]),
    enabled: !!account && DEPLOYED,
  })
}

/* ───────────────────────── arena ───────────────────────── */

export type Battle = {
  id: number
  kind: 0 | 1
  status: 0 | 1 | 2
  challengerWon: boolean
  challengerId: number
  opponentId: number
  challenger: Address
  opponent: Address
  startedAt: number
  outcome: Hex
}

export async function fetchBattle(id: number): Promise<Battle> {
  const [b, outcome] = await read<[any, Hex]>(ARENA, arenaAbi, 'getBattle', [BigInt(id)])
  return {
    id,
    kind: Number(b.kind) as 0 | 1,
    status: Number(b.status) as 0 | 1 | 2,
    challengerWon: b.challengerWon,
    challengerId: Number(b.challengerId),
    opponentId: Number(b.opponentId),
    challenger: b.challenger,
    opponent: b.opponent,
    startedAt: Number(b.startedAt),
    outcome,
  }
}

export function useRecentBattles(limit = 30) {
  return useQuery({
    queryKey: ['battles', limit],
    queryFn: async () => {
      const total = Number(await read<bigint>(ARENA, arenaAbi, 'totalBattles'))
      const ids = Array.from({ length: Math.min(limit, total) }, (_, i) => total - i)
      return Promise.all(ids.map(fetchBattle))
    },
    enabled: DEPLOYED,
    refetchInterval: 15_000,
  })
}

export function useRoaming() {
  return useQuery({
    queryKey: ['roaming'],
    queryFn: async () => {
      const ids = (await read<bigint[]>(ARENA, arenaAbi, 'roamingWilds')).map(Number)
      const engaged = await Promise.all(ids.map((id) => read<boolean>(ARENA, arenaAbi, 'wildEngaged', [BigInt(id)])))
      return ids.map((id, i) => ({ id, engaged: engaged[i] })).sort((a, b) => b.id - a.id)
    },
    enabled: DEPLOYED,
    refetchInterval: 15_000,
  })
}

export function useDefenders() {
  return useQuery({
    queryKey: ['defenders'],
    queryFn: async () => {
      const ids = (await read<bigint[]>(ARENA, arenaAbi, 'activeDefenders')).map(Number)
      const ds = await Promise.all(ids.map((id) => read<[Address, bigint, boolean, Hex]>(ARENA, arenaAbi, 'getDefender', [BigInt(id)])))
      const owners = await Promise.all(ids.map((id) => read<Address>(LAB, labAbi, 'ownerOf', [BigInt(id)]).catch(() => null)))
      return ids
        .map((id, i) => ({ id, keeper: ds[i][0], since: Number(ds[i][1]), active: ds[i][2], stake: ds[i][3], valid: owners[i]?.toLowerCase() === ds[i][0].toLowerCase() }))
        .sort((a, b) => b.since - a.since)
    },
    enabled: DEPLOYED,
    refetchInterval: 15_000,
  })
}

export function useReadyAt(id?: number | null) {
  return useQuery({
    queryKey: ['readyAt', id],
    queryFn: async () => Number(await read<bigint>(ARENA, arenaAbi, 'readyAt', [BigInt(id!)])),
    enabled: DEPLOYED && !!id,
    refetchInterval: 20_000,
  })
}

/* ───────────────────────── market ───────────────────────── */

export type Listing = { id: number; creatureId: number; status: number; seller: Address; buyer: Address; price: bigint; listedAt: number; paid: Hex }

export async function fetchListing(id: number): Promise<Listing> {
  const [l, paid] = await read<[any, Hex]>(MARKET, marketAbi, 'getListing', [BigInt(id)])
  return { id, creatureId: Number(l.creatureId), status: Number(l.status), seller: l.seller, buyer: l.buyer, price: l.price, listedAt: Number(l.listedAt), paid }
}

export function useListings(enabled = true) {
  return useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      const ids = (await read<bigint[]>(MARKET, marketAbi, 'openListings', [40n])).map(Number)
      return Promise.all(ids.map(fetchListing))
    },
    enabled: DEPLOYED && enabled,
    refetchInterval: 15_000,
  })
}

export function useListingOf(creatureId?: number | null) {
  return useQuery({
    queryKey: ['listingOf', creatureId],
    queryFn: async () => {
      const id = Number(await read<bigint>(MARKET, marketAbi, 'activeListingOf', [BigInt(creatureId!)]))
      return id ? fetchListing(id) : null
    },
    enabled: DEPLOYED && !!creatureId,
  })
}

/* ───────────────────────── misc ───────────────────────── */

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function useRefresh() {
  const qc = useQueryClient()
  return async (...keys: string[]): Promise<void> => {
    if (!keys.length) return qc.invalidateQueries()
    await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })))
  }
}

export async function blockTime() {
  const b = await publicClient.getBlock()
  return Number(b.timestamp)
}

export const fmtDuration = (s: number) => {
  if (s <= 0) return 'ready'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`
}

export const fmtZama = (v?: bigint | null) => (v == null ? '—' : (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }))

/* ───────────────────────── economy ───────────────────────── */

export const MAX_BREEDS = 7
export const BREED_FEES = [5, 8, 12, 18, 26, 38, 55]
export const feeFor = (breeds: number) => BREED_FEES[Math.min(breeds, MAX_BREEDS - 1)]

export type Egg = { id: number; keeper: Address; parentA: number; parentB: number; generation: number; status: number; fee: bigint; laidAt: number; paid: Hex }

/** Eggs whose hidden fee has not been proven yet (e.g. the tab closed mid-breed). */
export function usePendingEggs(account?: Address | null) {
  return useQuery({
    queryKey: ['eggs', account],
    queryFn: async () => {
      const ids = (await read<bigint[]>(LAB, labAbi, 'eggsOf', [account])).map(Number).slice(-12)
      const eggs = await Promise.all(
        ids.map(async (id): Promise<Egg> => {
          const [e, paid] = await read<[any, Hex]>(LAB, labAbi, 'getEgg', [BigInt(id)])
          return { id, keeper: e.keeper, parentA: Number(e.parentA), parentB: Number(e.parentB), generation: Number(e.generation), status: Number(e.status), fee: e.fee, laidAt: Number(e.laidAt), paid }
        }),
      )
      return eggs.filter((e) => e.status === 1)
    },
    enabled: DEPLOYED && !!account,
    refetchInterval: 30_000,
  })
}

/** Publicly decrypted value of a handle the contract made public (pot, reserve, health band). */
export function usePublicHandle(key: string, handle?: Hex) {
  return useQuery({
    queryKey: ['pub', key, handle],
    queryFn: async () => {
      const v = await publicValues([handle!])
      return v[handle!.toLowerCase()] as bigint
    },
    enabled: !!handle && !isZero(handle),
    staleTime: Infinity,
    retry: 6,
    retryDelay: (a) => Math.min(3000 * 2 ** a, 20_000),
  })
}

export function useEconomy() {
  const q = useQuery({
    queryKey: ['economy'],
    queryFn: async () => {
      const [fees, volume, reserve, reserveAt, payouts, pot, expeditions, strikes, level, trainFees, levels, xp] = await Promise.all([
        read<bigint>(LAB, labAbi, 'feesCollected'),
        read<bigint>(MARKET, marketAbi, 'volume'),
        read<Hex>(TREASURY, treasuryAbi, 'reserveHandle'),
        read<bigint>(TREASURY, treasuryAbi, 'reservePublishedAt'),
        read<bigint>(TREASURY, treasuryAbi, 'payouts').catch(() => 0n),
        read<Hex>(RAID, raidAbi, 'potHandle'),
        read<bigint>(EXPEDITIONS, expeditionsAbi, 'totalExpeditions'),
        read<bigint>(RAID, raidAbi, 'totalStrikes'),
        read<number>(RAID, raidAbi, 'currentLevel'),
        read<bigint>(TRAINING, trainingAbi, 'feesCollected').catch(() => 0n),
        read<number>(TRAINING, trainingAbi, 'totalLevels').catch(() => 0),
        read<bigint>(TRAINING, trainingAbi, 'totalXp').catch(() => 0n),
      ])
      return { trainFees, levels: Number(levels), xp: Number(xp), fees, volume, reserveHandle: reserve, reserveAt: Number(reserveAt), payouts: Number(payouts), potHandle: pot, expeditions: Number(expeditions), strikes: Number(strikes), level: Number(level) }
    },
    enabled: DEPLOYED,
    refetchInterval: 30_000,
  })
  const reserve = usePublicHandle('reserve', q.data?.reserveHandle)
  const pot = usePublicHandle('pot', q.data?.potHandle)
  return { ...q, reserve: reserve.data, pot: pot.data, reserveLoading: reserve.isLoading, potLoading: pot.isLoading }
}

/* ───────────────────────── world boss ───────────────────────── */

export type Boss = { level: number; element: number; maxHp: number; raiders: number; strikes: number; spawnedAt: number; slainAt: number; killer: Address; band: Hex; share: Hex }

export async function fetchBoss(level: number): Promise<Boss> {
  const [b, band, share] = await read<[any, Hex, Hex]>(RAID, raidAbi, 'getBoss', [level])
  return { level, element: Number(b.element), maxHp: Number(b.maxHp), raiders: Number(b.raiders), strikes: Number(b.strikes), spawnedAt: Number(b.spawnedAt), slainAt: Number(b.slainAt), killer: b.killer, band, share }
}

export function useRaid(account?: Address | null, enabled = true) {
  const q = useQuery({
    queryKey: ['raid', account],
    queryFn: async () => {
      const level = Number(await read<number>(RAID, raidAbi, 'currentLevel'))
      const levels = Array.from({ length: Math.min(level, 6) }, (_, i) => level - i)
      const [bosses, pot, strikeCooldown] = await Promise.all([Promise.all(levels.map(fetchBoss)), read<Hex>(RAID, raidAbi, 'potHandle'), read<bigint>(RAID, raidAbi, 'strikeCooldown')])
      const mine = account
        ? await Promise.all(
            levels.map(async (l) => {
              const [joined, claimed, canClaim] = await Promise.all([
                read<boolean>(RAID, raidAbi, 'joined', [l, account]),
                read<boolean>(RAID, raidAbi, 'claimed', [l, account]),
                read<boolean>(RAID, raidAbi, 'canClaim', [l, account]),
              ])
              return { level: l, joined, claimed, canClaim }
            }),
          )
        : []
      return { level, boss: bosses[0], past: bosses.slice(1), potHandle: pot, mine, strikeCooldown: Number(strikeCooldown) }
    },
    enabled: DEPLOYED && enabled,
    refetchInterval: 15_000,
  })
  const band = usePublicHandle('band', enabled ? q.data?.boss.band : undefined)
  const pot = usePublicHandle('pot', enabled ? q.data?.potHandle : undefined)
  return { ...q, band: band.data == null ? undefined : Number(band.data), bandLoading: band.isLoading && !!q.data?.boss.band && !isZero(q.data?.boss.band), pot: pot.data }
}

export function useMyDamage(level?: number, account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  return useQuery({
    queryKey: ['damage', level, account],
    queryFn: async () => {
      const h = await read<Hex>(RAID, raidAbi, 'damageOf', [level, account])
      if (isZero(h)) return 0
      const v = await privateValues(account!, [{ handle: h, contract: RAID }])
      return Number(v[h.toLowerCase()] as bigint)
    },
    enabled: DEPLOYED && !!account && !!level && keyReady,
    refetchInterval: 30_000,
  })
}

export function useRaidReady(ids: number[]) {
  return useQuery({
    queryKey: ['raidReady', ids.join()],
    queryFn: async () => {
      const r = await Promise.all(ids.map((id) => read<bigint>(RAID, raidAbi, 'readyAt', [BigInt(id)])))
      return Object.fromEntries(ids.map((id, i) => [id, Number(r[i])])) as Record<number, number>
    },
    enabled: DEPLOYED && ids.length > 0,
    refetchInterval: 20_000,
  })
}

/* ───────────────────────── expeditions ───────────────────────── */

export type Zone = { id: number; duration: number; difficulty: number; element: number; lootBase: bigint; lootRoll: bigint; consolation: bigint; xp: number }
export type Expedition = { id: number; creatureId: number; zone: number; claimed: boolean; keeper: Address; startedAt: number; endsAt: number; success: Hex; loot: Hex; sent: Hex }

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: async () =>
      Promise.all(
        [0, 1, 2].map(async (id): Promise<Zone> => {
          const [z, xp] = await Promise.all([
            read<Omit<Zone, 'id' | 'xp'>>(EXPEDITIONS, expeditionsAbi, 'getZone', [id]),
            read<number>(EXPEDITIONS, expeditionsAbi, 'xpFor', [id]),
          ])
          return { ...z, id, xp }
        }),
      ),
    enabled: DEPLOYED,
    staleTime: 5 * 60_000,
  })
}

export function useExpeditions(account?: Address | null) {
  return useQuery({
    queryKey: ['expeditions', account],
    queryFn: async () => {
      const [ids, runs, max] = await Promise.all([
        read<bigint[]>(EXPEDITIONS, expeditionsAbi, 'expeditionsOf', [account]),
        read<number>(EXPEDITIONS, expeditionsAbi, 'runsToday', [account]),
        read<number>(EXPEDITIONS, expeditionsAbi, 'maxDailyRuns'),
      ])
      const list = await Promise.all(
        ids.map(Number).slice(-20).reverse().map(async (id): Promise<Expedition> => {
          const [e, success, loot, sent] = await read<[any, Hex, Hex, Hex]>(EXPEDITIONS, expeditionsAbi, 'getExpedition', [BigInt(id)])
          return { id, creatureId: Number(e.creatureId), zone: Number(e.zone), claimed: e.claimed, keeper: e.keeper, startedAt: Number(e.startedAt), endsAt: Number(e.endsAt), success, loot, sent }
        }),
      )
      return { list, runs: Number(runs), max: Number(max) }
    },
    enabled: DEPLOYED && !!account,
    refetchInterval: 20_000,
  })
}

/** Decrypt an expedition report (success + loot) — only the keeper can, and only after claiming. */
export function useReport(e: Expedition | undefined, account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  return useQuery({
    queryKey: ['report', e?.id, account],
    queryFn: async () => {
      const v = await privateValues(account!, [
        { handle: e!.success, contract: EXPEDITIONS },
        { handle: e!.loot, contract: EXPEDITIONS },
        { handle: e!.sent, contract: CZAMA },
      ])
      const success = v[e!.success.toLowerCase()]
      const loot = v[e!.loot.toLowerCase()]
      const sent = v[e!.sent.toLowerCase()]
      if (typeof success !== 'boolean' || typeof loot !== 'bigint' || typeof sent !== 'bigint') throw new Error('Expedition report is incomplete.')
      return { success, loot, sent }
    },
    enabled: !!e?.claimed && !!account && keyReady,
    staleTime: Infinity,
    retry: 3,
  })
}

/* ───────────────────────── quests ───────────────────────── */

export type QuestStatus = { streak: number; lastCheckIn: number; bestStreak: number; done: number; claimedMask: number; chestClaimed: boolean; earned: bigint; multiplier: number; today: number; checkedIn: boolean }

export function useQuests(account?: Address | null) {
  return useQuery({
    queryKey: ['quests', account],
    queryFn: async (): Promise<QuestStatus> => {
      const [p, multiplier, today] = await read<[any, number, number]>(QUESTS, questsAbi, 'status', [account])
      return {
        streak: Number(p.streak),
        lastCheckIn: Number(p.lastCheckIn),
        bestStreak: Number(p.bestStreak),
        done: Number(p.done),
        claimedMask: Number(p.claimedMask),
        chestClaimed: p.chestClaimed,
        earned: p.earned,
        multiplier: Number(multiplier),
        today: Number(today),
        checkedIn: Number(p.lastCheckIn) === Number(today) && Number(p.streak) > 0,
      }
    },
    enabled: DEPLOYED && !!account,
    refetchInterval: 20_000,
  })
}

/* ───────────────────────── training ───────────────────────── */

export const MAX_LEVEL = 10
export const xpToNext = (level: number) => (level + 1) * 10
export const trainFee = (level: number) => 3 + 2 * level
export const stageOf = (level: number) => (level >= 10 ? 2 : level >= 5 ? 1 : 0)
export const TRAIN_XP = { expedition: [10, 25, 50], raid: 12, arenaWin: 15, arenaLoss: 8 }

export type TrainingProfile = { id: number; xp: number; level: number; pending: boolean; trainings: number; trainedAt: number; keeper: Address; fee: bigint; stage: number; paid: Hex; bonus: Hex }

export async function fetchTraining(id: number): Promise<TrainingProfile> {
  const [p, stage, paid, bonus] = await read<[any, number, Hex, Hex]>(TRAINING, trainingAbi, 'getProfile', [BigInt(id)])
  return {
    id,
    xp: Number(p.xp),
    level: Number(p.level),
    pending: p.pending,
    trainings: Number(p.trainings),
    trainedAt: Number(p.trainedAt),
    keeper: p.keeper,
    fee: p.fee,
    stage: Number(stage),
    paid,
    bonus,
  }
}

export function useTraining(id?: number | null) {
  return useQuery({
    queryKey: ['training', id],
    queryFn: () => fetchTraining(id!),
    enabled: DEPLOYED && id != null && id > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

/** The owner's private view of a creature's trained combat bonus. */
export function useTrainedBonus(t: TrainingProfile | undefined, owner: Address | undefined, account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  const mine = !!account && !!owner && owner.toLowerCase() === account.toLowerCase()
  return useQuery({
    queryKey: ['bonus', t?.bonus, account],
    queryFn: async () => {
      const v = await privateValues(account!, [{ handle: t!.bonus, contract: TRAINING }])
      return Number(v[t!.bonus.toLowerCase()] as bigint)
    },
    enabled: !!t && !isZero(t.bonus) && mine && keyReady,
    staleTime: Infinity,
    retry: false,
  })
}
