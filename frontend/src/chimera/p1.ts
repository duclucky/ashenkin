// P1: Ascension altar (sacrifice a spare creature for XP) and the three Season thrones.
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ASCENSION, DEPLOYED, LAB, SEASON, TRAINING, ascensionAbi, labAbi, read, seasonAbi, send } from './chain'
import { xpGrantedFromReceipt } from './game/expedition-progression'
import { economyAbi } from './economy'

type Step = (s: string, hash?: string) => void
const ZERO = '0x0000000000000000000000000000000000000000'
export const P1_LIVE = DEPLOYED && ASCENSION !== ZERO && SEASON !== ZERO

/* ───────────────────────── Ascension ───────────────────────── */

export { ascensionXp } from './game/ascension-preview'

export function useAscensionStats(account?: Address | null) {
  return useQuery({
    queryKey: ['ascension', account],
    queryFn: async () => {
      const [total, mine] = await Promise.all([
        read<bigint>(ASCENSION, ascensionAbi, 'totalAscensions'),
        account ? read<number>(ASCENSION, ascensionAbi, 'ascensions', [account]) : Promise.resolve(0),
      ])
      return { total: Number(total), mine: Number(mine) }
    },
    enabled: P1_LIVE,
    refetchInterval: 30_000,
  })
}

export async function ascend(account: Address, heroId: number, offeringId: number, step: Step) {
  const [approved, all] = await Promise.all([
    read<Address>(LAB, labAbi, 'getApproved', [BigInt(offeringId)]),
    read<boolean>(LAB, labAbi, 'isApprovedForAll', [account, ASCENSION]),
  ])
  if (!all && approved.toLowerCase() !== ASCENSION.toLowerCase()) {
    step('Step 1/2 — let the altar take the offering…')
    await send({ address: LAB, abi: labAbi, functionName: 'approve', args: [ASCENSION, BigInt(offeringId)] })
  }
  step(all || approved.toLowerCase() === ASCENSION.toLowerCase() ? 'Offering the creature at the altar…' : 'Step 2/2 — offering the creature at the altar…')
  const result = await send({ address: ASCENSION, abi: ascensionAbi, functionName: 'ascend', args: [BigInt(heroId), BigInt(offeringId)] })
  return { ...result, xp: xpGrantedFromReceipt(result.events, heroId, TRAINING, ASCENSION) }
}

export async function retireForLineage(account: Address, offeringId: number, step: Step) {
  const [approved, all] = await Promise.all([
    read<Address>(LAB, labAbi, 'getApproved', [BigInt(offeringId)]),
    read<boolean>(LAB, labAbi, 'isApprovedForAll', [account, ASCENSION]),
  ])
  if (!all && approved.toLowerCase() !== ASCENSION.toLowerCase()) {
    step('Approve this one permanent offering in your wallet…')
    await send({ address: LAB, abi: labAbi, functionName: 'approve', args: [ASCENSION, BigInt(offeringId)] })
  }
  step('Retiring the specimen for one lineage charge…')
  return send({ address: ASCENSION, abi: economyAbi, functionName: 'retire', args: [BigInt(offeringId)] })
}

/* ───────────────────────── Season thrones ───────────────────────── */

export const SEAT_NAMES = ['Throne of Flame', 'Throne of Spores', 'Throne of Tides'] as const
export const SEASON_RULES = [
  ['Colosseum win', 3],
  ['Wild capture', 2],
  ['3–0 sweep', 1],
  ['Each new boss you strike', 2],
  ['Killing blow on a boss', 10],
  ['Oracle riddle solved', 5],
] as const

export type SeasonState = {
  season: number
  startedAt: number
  endsAt: number
  players: number
  holders: Address[]
  scores: number[]
  prizes: bigint[]
  me?: { joined: boolean; score: number; crowns: number }
  lastWinners: Address[]
}

export function useSeason(account?: Address | null) {
  return useQuery({
    queryKey: ['season', account],
    queryFn: async (): Promise<SeasonState> => {
      const season = Number(await read<number>(SEASON, seasonAbi, 'season'))
      const [startedAt, endsAt, players, thrones, last, prizes] = await Promise.all([
        read<bigint>(SEASON, seasonAbi, 'startedAt'),
        read<bigint>(SEASON, seasonAbi, 'endsAt'),
        read<number>(SEASON, seasonAbi, 'players', [season]),
        read<[Address[], number[]]>(SEASON, seasonAbi, 'getThrones'),
        season > 1 ? read<Address[]>(SEASON, seasonAbi, 'winnersOf', [season - 1]) : Promise.resolve([] as Address[]),
        Promise.all([0, 1, 2].map(seat => read<bigint>(SEASON, seasonAbi, 'prizes', [BigInt(seat)]))),
      ])
      let me: SeasonState['me']
      if (account) {
        const [base, score, crowns] = await Promise.all([
          read<any>(SEASON, seasonAbi, 'baseOf', [account]),
          read<number>(SEASON, seasonAbi, 'scoreOf', [account]),
          read<number>(SEASON, seasonAbi, 'crowns', [account]),
        ])
        me = { joined: Number(base[0]) === season, score: Number(score), crowns: Number(crowns) }
      }
      return {
        season,
        startedAt: Number(startedAt),
        endsAt: Number(endsAt),
        players: Number(players),
        holders: [...thrones[0]],
        scores: thrones[1].map(Number),
        prizes,
        me,
        lastWinners: [...last],
      }
    },
    enabled: P1_LIVE,
    refetchInterval: 20_000,
  })
}

export async function joinSeason(step: Step) {
  step('Joining the season — your counters are snapshotted now…')
  return send({ address: SEASON, abi: seasonAbi, functionName: 'join' })
}

export async function claimThrone(seat: number, step: Step) {
  step(`Challenging the ${SEAT_NAMES[seat]}…`)
  return send({ address: SEASON, abi: seasonAbi, functionName: 'claimThrone', args: [seat] })
}

export async function endSeason(step: Step) {
  step('Closing the season — paying the three thrones from the Treasury…')
  return send({ address: SEASON, abi: seasonAbi, functionName: 'endSeason' })
}
