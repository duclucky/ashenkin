import { useQuery } from '@tanstack/react-query'
import { parseAbi, type Address, type Hex } from 'viem'
import { ASCENSION, CZAMA, DEPLOYED, LAB, QUESTS, TREASURY, questBatchAbi, read } from './chain'
import { useLabKeyReady, usePublicHandle } from './hooks'
import { isZero, privateValues } from './fhe'
import type { LineageRules } from './game/economy-rules'
import { detectEconomyVersion, missingContractFunction } from './economy-version'

export const economyAbi = parseAbi([
  'function economyVersion() view returns (uint8)',
  'function lineageCharges(address keeper) view returns (uint256)',
  'function introBreedUsed(address keeper) view returns (bool)',
  'function circulatingPopulation() view returns (uint256)',
  'function populationLimit() view returns (uint256)',
  'function retirementVault() view returns (address)',
  'function budgetDay() view returns (uint64)',
  'function budgetHandles() view returns (bytes32 opening, bytes32 remaining)',
  'function retire(uint256 offeringId)',
  'function lastRewardSent(address keeper) view returns (bytes32)',
])

const version = (address: Address) => detectEconomyVersion(() => read<number>(address, economyAbi, 'economyVersion'))

export function useQuestBatchAvailable(enabled: boolean) {
  return useQuery({
    queryKey: ['questBatchAvailable', QUESTS],
    queryFn: async () => {
      try { return await read<boolean>(QUESTS, questBatchAbi, 'supportsClaimAll') }
      catch (error) {
        if (missingContractFunction(error)) return false
        throw error
      }
    },
    enabled: DEPLOYED && enabled,
    staleTime: Infinity,
    retry: 1,
  })
}

export function useLineageEconomy(account?: Address | null) {
  return useQuery<LineageRules>({
    queryKey: ['lineageEconomy', account],
    queryFn: async () => {
      if (await version(LAB) === 1) return { version: 1 }
      const [charges, introUsed, population, limit, vault] = await Promise.all([
        account ? read<bigint>(LAB, economyAbi, 'lineageCharges', [account]) : 0n,
        account ? read<boolean>(LAB, economyAbi, 'introBreedUsed', [account]) : false,
        read<bigint>(LAB, economyAbi, 'circulatingPopulation'),
        read<bigint>(LAB, economyAbi, 'populationLimit'),
        read<Address>(LAB, economyAbi, 'retirementVault'),
      ])
      return { version: 2, charges, introUsed, population, limit, altarReady: vault.toLowerCase() === ASCENSION.toLowerCase() }
    },
    enabled: DEPLOYED,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useRewardBudget() {
  const policy = useQuery({
    queryKey: ['rewardBudget'],
    queryFn: async () => {
      if (await version(TREASURY) === 1) return { version: 1 as const }
      const [day, handles] = await Promise.all([
        read<bigint>(TREASURY, economyAbi, 'budgetDay'),
        read<readonly [Hex, Hex]>(TREASURY, economyAbi, 'budgetHandles'),
      ])
      return { version: 2 as const, day: Number(day), openingHandle: handles[0], remainingHandle: handles[1] }
    },
    enabled: DEPLOYED,
    refetchInterval: 30_000,
  })
  const opening = usePublicHandle('dailyBudget', policy.data?.openingHandle)
  const remaining = usePublicHandle('remainingBudget', policy.data?.remainingHandle)
  return { ...policy, opening: opening.data, remaining: remaining.data, valuesError: opening.isError || remaining.isError }
}

/** Optional receipt read, outside the wallet/transaction completion path. */
export function useQuestPaid(account?: Address | null) {
  const keyReady = useLabKeyReady(account)
  const receipt = useQuery({
    queryKey: ['questPaidHandle', account],
    queryFn: async () => await version(QUESTS) === 1 ? null : read<Hex>(QUESTS, economyAbi, 'lastRewardSent', [account]),
    enabled: DEPLOYED && !!account,
    refetchInterval: 30_000,
  })
  const value = useQuery({
    queryKey: ['questPaid', account, receipt.data],
    queryFn: async () => {
      const values = await privateValues(account!, [{ handle: receipt.data!, contract: CZAMA }])
      return values[receipt.data!.toLowerCase()] as bigint
    },
    enabled: !!account && keyReady && !!receipt.data && !isZero(receipt.data),
    staleTime: Infinity,
  })
  return { value: value.data, keyReady, exists: !!receipt.data && !isZero(receipt.data), error: receipt.isError || value.isError }
}
