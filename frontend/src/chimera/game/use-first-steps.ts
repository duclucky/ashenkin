import { useQuery } from '@tanstack/react-query'
import { ACTIVE_WORLD, useWallet } from '../chain'
import { keeperRequest } from '../keeper-api'
import { useAccountStats, useEthBalance, useMyCreatures } from '../hooks'
import { useTStats, useKeeperBattles } from '../season'
import { firstStep } from './first-steps'
export type Journey = { enabled: boolean; lifeIntroduced: boolean }
export type LifeRoster = {
  enabled: boolean
  specimens: number[]
  nextOffset?: number
  unread?: {
    count: number
    wins: number
    items: number
    latest: { nft: number; day: number; code: number; at: number } | null
  }
}
export function useJourney() {
  const { account, mode } = useWallet()
  return useQuery({
    queryKey: ['keeper-journey', account],
    queryFn: () => keeperRequest<Journey>(`journey?address=${account}`),
    enabled: !!account && mode === 'circle' && ACTIVE_WORLD === 'ashenkin',
    staleTime: 30000,
    retry: 1,
  })
}
export function useLifeRoster() {
  const { account, mode } = useWallet()
  return useQuery({
    queryKey: ['life-roster', account],
    queryFn: () => keeperRequest<LifeRoster>(`life?address=${account}`),
    enabled: !!account && mode === 'circle' && ACTIVE_WORLD === 'ashenkin',
    refetchInterval: 30000,
    retry: 1,
  })
}
export function useFirstSteps() {
  const { account, mode } = useWallet()
  const mine = useMyCreatures(account),
    stats = useAccountStats(account),
    eth = useEthBalance(account),
    combat = useTStats(account),
    battles = useKeeperBattles(account)
  const journey = useJourney()
  const stage = firstStep({
    owned: mine.data?.length,
    genesis: stats.data?.genesis,
    fights: combat.data ? combat.data.wins + combat.data.losses : undefined,
    hasGas: eth == null ? null : eth > 0n,
    lifeIntroduced: journey.data?.lifeIntroduced,
  })
  const active =
    !!account &&
    mode === 'circle' &&
    ACTIVE_WORLD === 'ashenkin' &&
    journey.data?.enabled !== false &&
    stage !== 'complete'
  const pending =
    !!account &&
    battles.data?.some(
      (b) =>
        b.status === 1 &&
        (b.challenger.toLowerCase() === account.toLowerCase() ||
          b.opponent.toLowerCase() === account.toLowerCase()),
    )
  return { stage, active, pending, journey }
}
