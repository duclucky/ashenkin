import { expect, test } from 'bun:test'
import type { TransactionReceipt } from 'viem'
import { firstReceipt } from '../src/chimera/transaction-receipt'

const receipt = { status: 'success', transactionHash: `0x${'12'.repeat(32)}` } as TransactionReceipt

test('a responsive RPC completes confirmation while another RPC is still stalled', async () => {
  let release!: (value: TransactionReceipt) => void
  const signals: AbortSignal[] = []
  let completed = false
  const waiting = firstReceipt([
    signal => { signals.push(signal); return new Promise(resolve => { release = resolve }) },
    async signal => { signals.push(signal); return receipt },
  ]).then(value => { completed = true; return value })
  await new Promise(resolve => setTimeout(resolve, 0))
  try {
    expect(completed).toBe(true)
    expect(signals).toHaveLength(2)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  } finally { release?.(receipt); await waiting }
  expect(await waiting).toBe(receipt)
})

test('an RPC error cannot hide a successful receipt from the other observer', async () => {
  const actual = await firstReceipt([
    async () => { throw Error('RPC unavailable') },
    async () => receipt,
  ])
  expect(actual).toBe(receipt)
})

test('all failed observers reject without converting unavailable data into success', async () => {
  const failure = new Error('No receipt provider is reachable')
  const signals: AbortSignal[] = []
  await expect(firstReceipt([
    async signal => { signals.push(signal); throw failure },
    async signal => { signals.push(signal); throw Error('Second RPC failed') },
  ])).rejects.toBe(failure)
  expect(signals).toHaveLength(2)
  expect(signals.every(signal => signal.aborted)).toBe(true)
})

test('a reverted receipt is returned as reverted for the transaction layer to reject', async () => {
  const reverted = { ...receipt, status: 'reverted' } as TransactionReceipt
  expect((await firstReceipt([async () => reverted])).status).toBe('reverted')
})
