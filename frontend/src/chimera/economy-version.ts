import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from 'viem'

export function missingContractFunction(error: unknown) {
  const cause = error instanceof BaseError ? error.walk(e => e instanceof ContractFunctionRevertedError || e instanceof ContractFunctionZeroDataError) : error
  return cause instanceof ContractFunctionZeroDataError || (cause instanceof ContractFunctionRevertedError && !cause.data)
}

/** A missing selector means v1. Transport errors and unsupported versions stay errors. */
export async function detectEconomyVersion(readVersion: () => Promise<unknown>): Promise<1 | 2> {
  try {
    const result = await readVersion()
    if (result !== 2) throw new Error('Unsupported economy version')
    return 2
  } catch (error) {
    if (missingContractFunction(error)) return 1
    throw error
  }
}
