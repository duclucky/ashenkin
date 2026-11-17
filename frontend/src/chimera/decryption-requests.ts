import { keccak256, stringToHex } from 'viem'

export type DecryptionIdentity = { account: string; publicKey: string; signature: string; start: number; days: number; contracts: readonly string[] }
export type DecryptionPair = { handle: string; contractAddress: string }
export const publicDecryptionKey = (handles: readonly string[]) => `public:${handles.map(handle => handle.toLowerCase()).join(',')}`
export const privateDecryptionKey = (identity: DecryptionIdentity, pairs: readonly DecryptionPair[]) => `private:${keccak256(stringToHex(JSON.stringify([
  identity.account.toLowerCase(), identity.publicKey, identity.signature, identity.start, identity.days,
  identity.contracts.map(contract => contract.toLowerCase()),
  pairs.map(pair => [pair.handle.toLowerCase(), pair.contractAddress.toLowerCase()]),
])))}`

export class DecryptionFlights {
  private readonly pending = new Map<string, Promise<unknown>>()
  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key)
    if (existing) return existing as Promise<T>
    const request = Promise.resolve().then(operation).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key) })
    this.pending.set(key, request)
    return request
  }
}

const permanentNames = new Set(['AddressError', 'ChecksummedAddressError', 'FhevmHandleError', 'FhevmConfigError', 'InvalidTypeError', 'InvalidPropertyError', 'RelayerInvalidProofError', 'RelayerV2ResponseInputProofRejectedError', 'AbortError', 'RelayerV2AbortError'])
export function transientDecryptionError(error: unknown): boolean {
  const visited = new Set<unknown>()
  let current = error
  for (let depth = 0; depth < 8 && current && typeof current === 'object' && !visited.has(current); depth++) {
    visited.add(current)
    const details = current as { name?: string; message?: string; status?: number; statusCode?: number; code?: number; cause?: unknown }
    const status = details.status ?? details.statusCode
    if (permanentNames.has(details.name ?? '') || [400, 401, 403, 422].includes(status ?? 0) || details.code === 4001 || /(?:invalid|expired) signature|signature (?:has expired|is invalid)|user rejected/i.test(details.message ?? '')) return false
    current = details.cause
  }
  return true
}
export async function retryDecryption<T>(operation: () => Promise<T>, options: { attempts: number; cap?: number; wait?: (ms: number) => Promise<void> }): Promise<T> {
  if (!Number.isSafeInteger(options.attempts) || options.attempts < 1 || options.attempts > 30) throw new Error('Invalid decryption retry limit.')
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  for (let i = 0; i < options.attempts; i++) {
    try { return await operation() } catch (error) {
      if (!transientDecryptionError(error) || i + 1 === options.attempts) throw error
      await wait(Math.min(2500 * 1.4 ** i, options.cap ?? 12_000))
    }
  }
  throw new Error('Decryption attempts exhausted.')
}

