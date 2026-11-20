import { isAddress, type Address, type Hex } from 'viem'
import { api } from '@/lib/api'
import { failedKeeperAction, KeeperEstimateRetry } from './keeper-retry'

export type KeeperSession = {
  enabled: boolean
  email: boolean
  sponsored: boolean
  signedIn?: boolean
  address?: Address | null
  method?: 'wallet' | 'email' | null
}

export async function keeperRequest<T>(route = '', body?: object, timeout = 15_000): Promise<T> {
  const response = await fetch(api(`keeper${route ? `/${route}` : ''}`), {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeout),
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok && response.status === 429 && data.code === 'CIRCLE_GAS_RESERVED' && data.notSubmitted === true) throw new KeeperEstimateRetry(data.error ?? 'Synchronizing the gas reserved by your previous action…')
  if (!response.ok) throw new Error(data.error ?? 'Ashenkin could not complete this request.')
  return data as T
}

export async function readKeeperSession() {
  const session = await keeperRequest<KeeperSession>()
  if (session.address && !isAddress(session.address)) throw new Error('Invalid game wallet.')
  return session
}

export async function actionHash(id: string, address: Address) {
  const end = Date.now() + 160_000
  while (Date.now() < end) {
    const result = await keeperRequest<{ hash?: Hex; state: string; failed: boolean; retryable?: boolean }>(`transactions/${encodeURIComponent(id)}?address=${address}`)
    failedKeeperAction(result)
    if (result.hash && /^0x[0-9a-f]{64}$/i.test(result.hash)) return result.hash
    await new Promise(resolve => window.setTimeout(resolve, 2200))
  }
  throw new Error('Circle is still processing the transaction. Retry the same action to check its status.')
}
