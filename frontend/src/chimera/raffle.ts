// P2: the Sealed Raffle. Ticket counts, the pot and the current leader are all encrypted until the draw.
import { useQuery } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { DEPLOYED, RAFFLE, raffleAbi, read, send } from './chain'
import { encryptMany, isZero, privateValues, publicDecryptWithProof } from './fhe'
import { ensureOperator } from './actions'
import { useLabKeyReady } from './hooks'

type Step = (s: string, hash?: string) => void
export const RAFFLE_LIVE = DEPLOYED && !/^0x0+$/.test(RAFFLE)
export const TICKET_PRICE = 1 // cZAMA per ticket
export const MAX_PER_BUY = 50
export const RAKE_PCT = 10

export type RaffleRound = {
  id: number
  startedAt: number
  endsAt: number
  entries: number
  players: number
  drawing: boolean
  done: boolean
  winner: Address
  pot: bigint
  relicId: number
  winnerHandle: Hex
  potHandle: Hex
}

async function fetchRound(id: number): Promise<RaffleRound> {
  const [r, winnerHandle, potHandle] = await read<[any, Hex, Hex]>(RAFFLE, raffleAbi, 'getRound', [id])
  return {
    id,
    startedAt: Number(r.startedAt),
    endsAt: Number(r.endsAt),
    entries: Number(r.entries),
    players: Number(r.players),
    drawing: r.drawing,
    done: r.done,
    winner: r.winner,
    pot: BigInt(r.pot),
    relicId: Number(r.relicId),
    winnerHandle,
    potHandle,
  }
}

export function useRaffle(account?: Address | null, enabled = true) {
  return useQuery({
    queryKey: ['raffle', account],
    queryFn: async () => {
      const cur = Number(await read<number>(RAFFLE, raffleAbi, 'currentRound'))
      const ids = Array.from({ length: Math.min(cur, 6) }, (_, i) => cur - i)
      const [rounds, entered, ticketsHandle, wins] = await Promise.all([
        Promise.all(ids.map(fetchRound)),
        account ? read<boolean>(RAFFLE, raffleAbi, 'entered', [cur, account]) : Promise.resolve(false),
        account ? read<Hex>(RAFFLE, raffleAbi, 'ticketsHandle', [cur, account]) : Promise.resolve(null),
        account ? read<number>(RAFFLE, raffleAbi, 'wins', [account]) : Promise.resolve(0),
      ])
      return { round: rounds[0], past: rounds.slice(1).filter((r) => r.done), entered, ticketsHandle, wins: Number(wins) }
    },
    enabled: RAFFLE_LIVE && enabled,
    refetchInterval: 20_000,
  })
}

/** Your sealed ticket count for the current round, opened with your lab key. */
export function useMyTickets(account?: Address | null, handle?: Hex | null) {
  const keyReady = useLabKeyReady(account)
  return useQuery({
    queryKey: ['raffleTickets', account, handle],
    queryFn: async () => {
      if (isZero(handle)) return 0n
      const v = await privateValues(account!, [{ handle: handle!, contract: RAFFLE }])
      return v[handle!.toLowerCase()] as bigint
    },
    enabled: !!account && keyReady && !!handle,
    staleTime: Infinity,
  })
}

export async function raffleBuy(account: Address, count: number, step: Step) {
  await ensureOperator(account, RAFFLE, step)
  step('Sealing your ticket count in the browser…')
  const { handles, proof } = await encryptMany(RAFFLE, account, [{ bits: 16, value: count }])
  step('Buying sealed tickets…')
  return send({ address: RAFFLE, abi: raffleAbi, functionName: 'buy', args: [handles[0], proof] })
}

/** Draw (open the winner + pot) and finalize with the KMS proof. Safe to call again if it stopped half way. */
export async function raffleDraw(step: Step) {
  const cur = Number(await read<number>(RAFFLE, raffleAbi, 'currentRound'))
  let r = await fetchRound(cur)
  if (!r.drawing) {
    step('Asking the chain to open only the winner and the pot…')
    await send({ address: RAFFLE, abi: raffleAbi, functionName: 'draw' })
    r = await fetchRound(cur)
    if (!r.drawing) return { extended: true as const, round: cur }
  }
  step('Waiting for the Zama network to decrypt the winner…')
  const res = await publicDecryptWithProof([r.winnerHandle, r.potHandle], { tries: 20 })
  step('Paying the winner with the proof…')
  await send({ address: RAFFLE, abi: raffleAbi, functionName: 'finalize', args: [res.abiEncodedClearValues, res.decryptionProof] })
  const done = await fetchRound(cur)
  return { extended: false as const, round: cur, winner: done.winner, pot: done.pot }
}
