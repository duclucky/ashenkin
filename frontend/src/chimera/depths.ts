// P2: Arkhive Depths. Doors, health and the loot sack are encrypted; only the delver can read them.
import { useQuery } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { DEPLOYED, DEPTHS, depthsAbi, read, send } from './chain'
import { isZero, privateValues, publicDecryptWithProof } from './fhe'
import { ensureOperator } from './actions'
import { useLabKeyReady } from './hooks'
import { decodeFloorLog, doorThresholds } from './game/depths-floor'

type Step = (s: string, hash?: string) => void
export const DEPTHS_LIVE = DEPLOYED && !/^0x0+$/.test(DEPTHS)
export const MAX_FLOOR = 10
export const ENTRY_FEE = 2 // cZAMA
export const RELIC_DEPTH = 6
export const XP_PER_FLOOR = 6

export const DOOR = [
  { key: 'stairs', name: 'Stairs', color: '#7FD1FF', note: 'safe, a little loot' },
  { key: 'monster', name: 'Monster', color: '#E5341D', note: 'fight with your hidden power' },
  { key: 'treasure', name: 'Treasure', color: '#FFDD00', note: 'big loot, no harm' },
  { key: 'trap', name: 'Trap', color: '#B66DFF', note: 'damage, no loot' },
] as const

/** Odds behind any single door on floor f, from the contract’s thresholds (out of 256). */
export function doorOdds(f: number) {
  const { trap, monster, treasure } = doorThresholds(f)
  return { stairs: (256 - treasure) / 256, monster: (monster - trap) / 256, treasure: (treasure - monster) / 256, trap: trap / 256 }
}
/** Loot (cZAMA) for clearing floor f: stairs 0.2f, beaten monster 0.6f, treasure 1.5f. */
export const lootFor = (f: number) => ({ stairs: 0.2 * f, monster: 0.6 * f, treasure: 1.5 * f })
export const trapDamage = (f: number) => 12 + 4 * f
export const monsterPower = (f: number) => [25 + 10 * f, 25 + 10 * f + 31] as const

export type DepthsRun = {
  id: number
  keeper: Address
  creatureId: number
  floor: number
  cleared: number
  lit: number
  over: boolean
  revealing: boolean
  recorded: boolean
  startedAt: number
  hpH: Hex
  maxH: Hex
  sackH: Hex
  litH: Hex
  survH: Hex
  paidH: Hex
}

async function fetchRun(id: number): Promise<DepthsRun> {
  const [r, hpH, maxH, sackH, litH, survH, paidH] = await read<[any, Hex, Hex, Hex, Hex, Hex, Hex]>(DEPTHS, depthsAbi, 'getRun', [BigInt(id)])
  return {
    id,
    keeper: r.keeper,
    creatureId: Number(r.creatureId),
    floor: Number(r.floor),
    cleared: Number(r.cleared),
    lit: Number(r.lit),
    over: r.over,
    revealing: r.revealing,
    recorded: r.recorded,
    startedAt: Number(r.startedAt),
    hpH,
    maxH,
    sackH,
    litH,
    survH,
    paidH,
  }
}

export function useDepths(account?: Address | null, enabled = true) {
  return useQuery({
    queryKey: ['depths', account],
    queryFn: async () => {
      const [deepest, deepestKeeper, total, maxDaily] = await Promise.all([
        read<number>(DEPTHS, depthsAbi, 'deepest'),
        read<Address>(DEPTHS, depthsAbi, 'deepestKeeper'),
        read<bigint>(DEPTHS, depthsAbi, 'totalRuns'),
        read<number>(DEPTHS, depthsAbi, 'maxDailyRuns'),
      ])
      let active: DepthsRun | null = null
      let past: DepthsRun[] = []
      let today = 0
      let best = 0
      if (account) {
        const [activeId, ids, t, b] = await Promise.all([
          read<bigint>(DEPTHS, depthsAbi, 'activeRun', [account]),
          read<bigint[]>(DEPTHS, depthsAbi, 'runsOf', [account]),
          read<number>(DEPTHS, depthsAbi, 'runsToday', [account]),
          read<number>(DEPTHS, depthsAbi, 'bestDepth', [account]),
        ])
        today = Number(t)
        best = Number(b)
        if (activeId) active = await fetchRun(Number(activeId))
        const recent = ids.map(Number).filter((x) => x !== Number(activeId)).slice(-6).reverse()
        past = await Promise.all(recent.map(fetchRun))
      }
      return { active, past, today, maxDaily: Number(maxDaily), best, deepest: Number(deepest), deepestKeeper, total: Number(total) }
    },
    enabled: DEPTHS_LIVE && enabled,
    refetchInterval: 20_000,
  })
}

export type FloorLog = { floor: number; door: number; content: number; damage: number; loot: bigint }

/** Everything the delver can privately read about a run: health, sack, the lit door, and the floor log. */
export function useRunSecrets(account?: Address | null, run?: DepthsRun | null) {
  const keyReady = useLabKeyReady(account)
  return useQuery({
    queryKey: ['depthsSecrets', account, run?.id, run?.cleared, run?.hpH, run?.over, run?.paidH, run?.litH],
    queryFn: async () => {
      const r = run!
      const floors = Array.from({ length: r.cleared }, (_, i) => i + 1)
      const logs = await Promise.all(floors.map((f) => read<[number, Hex, Hex, Hex]>(DEPTHS, depthsAbi, 'floorLog', [BigInt(r.id), f])))
      const pairs: { handle: string; contract: Address }[] = [r.hpH, r.maxH, r.sackH, r.litH, r.survH, r.paidH].filter((h) => !isZero(h)).map((handle) => ({ handle, contract: DEPTHS }))
      for (const [, c, d, l] of logs) for (const h of [c, d, l]) if (!isZero(h)) pairs.push({ handle: h, contract: DEPTHS })
      const v = await privateValues(account!, pairs).catch((e) => {
        console.error('depths: private read failed', e)
        throw e
      })
      const g = (h: Hex) => (isZero(h) ? null : v[h.toLowerCase()])
      const hp = g(r.hpH)
      const max = g(r.maxH)
      const sack = g(r.sackH)
      const lit = g(r.litH)
      if (typeof hp !== 'bigint' || typeof max !== 'bigint' || typeof sack !== 'bigint' ||
          (lit !== null && (typeof lit !== 'bigint' || lit < 0n || lit > 3n))) {
        throw new Error('The private run state has not been decrypted yet.')
      }
      return {
        hp,
        max,
        sack,
        lit: lit === null ? null : Number(lit),
        survived: g(r.survH) as boolean | null,
        paid: g(r.paidH) as bigint | null,
        log: logs.map(([door, c, d, l], i) => decodeFloorLog(i + 1, Number(door), g(c), g(d), g(l))),
      }
    },
    enabled: !!account && keyReady && !!run,
    staleTime: Infinity,
  })
}

export async function depthsEnter(account: Address, creatureId: number, step: Step) {
  await ensureOperator(account, DEPTHS, step)
  step('Paying the 2 cZAMA toll and sealing your health from your hidden power…')
  return send({ address: DEPTHS, abi: depthsAbi, functionName: 'enter', args: [BigInt(creatureId)] })
}

export async function depthsOpen(runId: number, door: number, step: Step) {
  step('Opening the door. The fight and the damage are computed on ciphertext…')
  return send({ address: DEPTHS, abi: depthsAbi, functionName: 'open', args: [BigInt(runId), door] })
}

export async function depthsLeave(runId: number, step: Step) {
  step('Climbing out. The sack is paid as an encrypted transfer…')
  return send({ address: DEPTHS, abi: depthsAbi, functionName: 'leave', args: [BigInt(runId)] })
}

/** Open only the “survived” bit with a Zama proof and post the depth record. Resumable. */
export async function depthsProve(runId: number, step: Step) {
  let r = await fetchRun(runId)
  if (!r.revealing) {
    step('Unsealing one bit: did you make it out alive?')
    await send({ address: DEPTHS, abi: depthsAbi, functionName: 'revealSurvival', args: [BigInt(runId)] })
    r = await fetchRun(runId)
  }
  step('Waiting for the Zama network to decrypt that bit…')
  const res = await publicDecryptWithProof([r.survH], { tries: 20 })
  step('Posting your depth with the proof…')
  await send({ address: DEPTHS, abi: depthsAbi, functionName: 'recordDepth', args: [BigInt(runId), res.abiEncodedClearValues, res.decryptionProof] })
  const survived = Object.values(res.clearValues)[0] === true
  return { survived, depth: r.cleared }
}

/** Privately read what happened on one floor (right after opening its door). */
export async function readFloor(account: Address, runId: number, floor: number): Promise<FloorLog> {
  const [door, c, d, l] = await read<[number, Hex, Hex, Hex]>(DEPTHS, depthsAbi, 'floorLog', [BigInt(runId), floor])
  const v = await privateValues(account, [c, d, l].map((handle) => ({ handle, contract: DEPTHS })))
  return decodeFloorLog(floor, Number(door), v[c.toLowerCase()], v[d.toLowerCase()], v[l.toLowerCase()])
}
