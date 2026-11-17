import { useQuery } from '@tanstack/react-query'
import { isAddress, isAddressEqual, parseAbi, type Address, type Hex, zeroAddress } from 'viem'
import { ACTIVE_WORLD, LAB, MARKET, read, send } from './chain'
import { encryptMany, publicDecryptWithProof } from './fhe'
import { packPlan } from './season'
import deployedEconomy from './economy-features.v2.json'

type Step = (status: string, hash?: string) => void

function v2Address(value?: string): Address | undefined {
  return ACTIVE_WORLD === 'v2' && value && isAddress(value) && !isAddressEqual(value, zeroAddress) ? value : undefined
}

export const TOURNAMENT = v2Address(import.meta.env.VITE_CHIMERA_TOURNAMENT || deployedEconomy.tournament)
export const MARKET_BADGE = v2Address(import.meta.env.VITE_CHIMERA_MARKET_BADGE || deployedEconomy.marketBadge)

export const tournamentAbi = parseAbi([
  'function lab() view returns (address)',
  'function sponsor() view returns (address)',
  'function prizeToken() view returns (address)',
  'function prize() view returns (uint128)',
  'function status() view returns (uint8)',
  'function registrationEndsAt() view returns (uint64)',
  'function joined() view returns (uint8)',
  'function invited(address) view returns (bool)',
  'function specimenOf(address) view returns (uint256)',
  'function claimable(address) view returns (uint256)',
  'function matches(uint256) view returns (address left,address right,address winner,uint64 deadline,uint8 sealedPlans,uint8 rounds,bool done,bool forfeit)',
  'function roundHandles(uint8 id) view returns (bytes32[3])',
  'function join(uint256 specimen)',
  'function start()',
  'function sealPlan(uint8 id,bytes32 plan,bytes inputProof)',
  'function resolveNoShow(uint8 id)',
  'function settle(uint8 id,bytes cleartexts,bytes proof)',
  'function claim(address keeper)',
])

const prizeAbi = parseAbi(['function decimals() view returns (uint8)', 'function symbol() view returns (string)'])

export function useTournament(account?: Address | null) {
  const info = useQuery({
    queryKey: ['tournament-info', TOURNAMENT],
    enabled: !!TOURNAMENT,
    async queryFn() {
      const [lab, token, prize, endsAt] = await Promise.all([
        read<Address>(TOURNAMENT!, tournamentAbi, 'lab'), read<Address>(TOURNAMENT!, tournamentAbi, 'prizeToken'),
        read<bigint>(TOURNAMENT!, tournamentAbi, 'prize'), read<bigint>(TOURNAMENT!, tournamentAbi, 'registrationEndsAt'),
      ])
      if (!isAddressEqual(lab, LAB)) throw new Error('This tournament belongs to a different Lab.')
      const [symbol, decimals] = await Promise.all([
        read<string>(token, prizeAbi, 'symbol'), read<number>(token, prizeAbi, 'decimals'),
      ])
      return { token, prize, endsAt: Number(endsAt), symbol, decimals }
    },
    staleTime: Infinity,
  })
  const state = useQuery({
    queryKey: ['tournament', TOURNAMENT, account],
    enabled: !!info.data,
    async queryFn() {
      const [status, joined, invited, entered, claimable, matches] = await Promise.all([
        read<number>(TOURNAMENT!, tournamentAbi, 'status'), read<number>(TOURNAMENT!, tournamentAbi, 'joined'),
        account ? read<boolean>(TOURNAMENT!, tournamentAbi, 'invited', [account]) : false,
        account ? read<bigint>(TOURNAMENT!, tournamentAbi, 'specimenOf', [account]) : 0n,
        account ? read<bigint>(TOURNAMENT!, tournamentAbi, 'claimable', [account]) : 0n,
        Promise.all(Array.from({ length: 7 }, async (_, id) => {
          const [left, right, winner, deadline, sealed, rounds, done, forfeit] = await read<readonly [Address, Address, Address, bigint, number, number, boolean, boolean]>(TOURNAMENT!, tournamentAbi, 'matches', [BigInt(id)])
          return { id, left, right, winner, deadline: Number(deadline), sealed, rounds, done, forfeit }
        })),
      ])
      return { status, joined, invited, entered: Number(entered), claimable, matches }
    },
    refetchInterval: 10_000,
  })
  return { info, state }
}

export function tournamentWrite(action: 'join' | 'start' | 'resolveNoShow' | 'claim', args: readonly unknown[] = []) {
  return send({ address: TOURNAMENT!, abi: tournamentAbi, functionName: action, args })
}

export async function sealTournamentPlan(account: Address, id: number, plan: number[], step: Step) {
  step('Encrypting your three commands with Zama…')
  const input = await encryptMany(TOURNAMENT!, account, [{ bits: 8, value: packPlan(plan) }])
  return send({ address: TOURNAMENT!, abi: tournamentAbi, functionName: 'sealPlan', args: [id, input.handles[0], input.proof] })
}

export async function settleTournamentMatch(id: number, step: Step) {
  const handles = await read<Hex[]>(TOURNAMENT!, tournamentAbi, 'roundHandles', [id])
  step('Reading Zama’s proof for the three rounds…')
  const proof = await publicDecryptWithProof(handles)
  return send({ address: TOURNAMENT!, abi: tournamentAbi, functionName: 'settle', args: [id, proof.abiEncodedClearValues, proof.decryptionProof] })
}

export async function verifyTournamentRounds(id: number, mask: number) {
  const handles = await read<Hex[]>(TOURNAMENT!, tournamentAbi, 'roundHandles', [id])
  const proof = await publicDecryptWithProof(handles, { tries: 3 })
  const values = new Map(Object.entries(proof.clearValues).map(([handle, value]) => [handle.toLowerCase(), value]))
  if (!handles.every((handle, i) => values.get(handle.toLowerCase()) === !!(mask & (1 << i)))) {
    throw new Error('Zama and Sepolia disagree on the recorded rounds.')
  }
  return proof
}

const badgeAbi = parseAbi([
  'function market() view returns (address)',
  'function badges(uint256 id) view returns (uint8 tier,bool published,bytes32 handle,uint64 observedAt)',
  'function request(uint256 id)',
  'function publish(uint256 id,bytes cleartexts,bytes proof)',
])

export function useMarketBadge(id?: number) {
  const binding = useQuery({
    queryKey: ['badge-market', MARKET_BADGE],
    enabled: !!MARKET_BADGE && !!id,
    queryFn: async () => isAddressEqual(await read<Address>(MARKET_BADGE!, badgeAbi, 'market'), MARKET),
    staleTime: Infinity,
  })
  return useQuery({
    queryKey: ['market-badge', MARKET_BADGE, id],
    enabled: !!binding.data && !!id,
    queryFn: () => read<readonly [number, boolean, Hex, bigint]>(MARKET_BADGE!, badgeAbi, 'badges', [BigInt(id!)]),
    refetchInterval: 20_000,
  })
}

export function requestMarketBadge(id: number) {
  return send({ address: MARKET_BADGE!, abi: badgeAbi, functionName: 'request', args: [BigInt(id)] })
}

export async function publishMarketBadge(id: number, handle: Hex, step: Step) {
  step('Reading the public tier proof from Zama…')
  const proof = await publicDecryptWithProof([handle])
  return send({ address: MARKET_BADGE!, abi: badgeAbi, functionName: 'publish', args: [BigInt(id), proof.abiEncodedClearValues, proof.decryptionProof] })
}
