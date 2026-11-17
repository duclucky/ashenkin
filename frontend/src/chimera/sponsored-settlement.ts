import type { Address, Hex } from 'viem'
import { api } from '../lib/api'
import { ACTIVE_WORLD, readSentReceipt, type Sent } from './chain'

type Kind = 'battle' | 'egg' | 'training'
type Step = (text: string, hash?: string) => void

export async function sponsoredSettlement(kind: Kind, id: number, handles: Hex[], step: Step): Promise<Sent | null> {
  if (typeof window === 'undefined') return null
  step('Checking the Zama proof for automatic settlement…')
  let response: Response
  try {
    const request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ world: ACTIVE_WORLD, kind, id, handles }),
      signal: AbortSignal.timeout(70_000),
    }
    const url = api('settlement')
    response = await fetch(url, request)
    if (response.status === 409 && kind === 'battle') {
      // The browser and sponsor can briefly see different heads after the hunt is mined.
      step('Sepolia is syncing your fight…')
      await new Promise(resolve => setTimeout(resolve, 1500))
      response = await fetch(url, request)
    }
  } catch {
    throw new Error('Automatic settlement could not be reached. Check the Inbox for the current status.')
  }
  if (response.status === 404 || response.status === 501) return null
  if (response.status === 409) throw new Error('The pending action changed on Sepolia. Check the Inbox for the current status.')
  if (!response.ok) throw new Error('Automatic settlement is unavailable. You can finish this action manually from the Inbox.')
  const data = await response.json() as { hash?: Hex }
  if (!data.hash || !/^0x[0-9a-f]{64}$/i.test(data.hash)) throw new Error('The settlement response did not contain a transaction. Check the Inbox.')
  step('Sent — automatic settlement is waiting for Sepolia…', data.hash)
  return readSentReceipt(data.hash)
}

export function settlementEvent(sent: Sent, address: Address, id: number, choices: Record<string, string>) {
  const event = sent.events.find(entry => (
    entry.address.toLowerCase() === address.toLowerCase()
    && Object.prototype.hasOwnProperty.call(choices, entry.eventName)
    && entry.args?.[choices[entry.eventName]] === BigInt(id)
  ))
  if (!event) throw new Error('Sepolia did not confirm the expected settlement. Check the Inbox.')
  return event
}
