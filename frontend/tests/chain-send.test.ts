import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import type { TransactionReceipt } from 'viem'
import * as chain from '../src/chimera/chain'
import { ReplacedActionError } from '../src/chimera/transaction-receipt'

// Exercise the actual send path with an in-memory provider: no wallet or RPC traffic.
const account = '0x0000000000000000000000000000000000000001'
const hash = ('0x' + '1'.repeat(64)) as `0x${string}`
const call = { address: chain.LAB, abi: chain.labAbi, functionName: 'hatchGenesis' }
const receipt = { status: 'success', logs: [] } as unknown as TransactionReceipt
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const provider = mock(async ({ method }: { method: string }) => {
  if (method === 'eth_requestAccounts') return [account]
  if (method === 'eth_chainId') return '0xaa36a7'
  if (method === 'eth_sendTransaction') return hash
  throw new Error(`Unexpected provider request: ${method}`)
})
const walletPrompts = () => provider.mock.calls.filter(([request]) => request.method === 'eth_sendTransaction')

beforeEach(async () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { ethereum: { request: provider } } })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() {}, removeItem() {} } })
  provider.mockClear()
  await chain.connect()
  spyOn(chain.publicClient, 'simulateContract').mockResolvedValue({ request: call } as any)
  spyOn(chain.publicClient, 'estimateContractGas').mockResolvedValue(100_000n)
  spyOn(chain.publicClient, 'waitForTransactionReceipt').mockResolvedValue(receipt)
  spyOn(chain.receiptMirror, 'waitForTransactionReceipt').mockResolvedValue(receipt)
})

afterEach(() => {
  chain.disconnect()
  mock.restore()
})

afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('starts gas estimation without waiting for the simulation round trip', async () => {
  let finishSimulation!: (value: any) => void
  spyOn(chain.publicClient, 'simulateContract').mockImplementation(() => new Promise((resolve) => { finishSimulation = resolve }) as any)
  const sending = chain.send(call)
  await new Promise((resolve) => setTimeout(resolve, 0))
  try {
    expect(chain.publicClient.estimateContractGas).toHaveBeenCalledTimes(1)
  } finally {
    finishSimulation({ request: call })
    await sending
  }
  expect(walletPrompts()).toHaveLength(1)
})

test('opens the next wallet prompt without a fixed post-confirmation delay', async () => {
  const schedule = globalThis.setTimeout
  const waits: number[] = []
  spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
    waits.push(Number(ms))
    return schedule(fn, 0)
  })
  await chain.send(call)
  waits.length = 0
  await chain.send(call)
  expect(walletPrompts()).toHaveLength(2)
  expect(waits.filter((ms) => ms >= 1000)).toEqual([])
})

test('a refused simulation never opens a transaction prompt', async () => {
  const schedule = globalThis.setTimeout
  spyOn(globalThis, 'setTimeout').mockImplementation((fn) => schedule(fn, 0))
  spyOn(chain.publicClient, 'simulateContract').mockRejectedValue(new Error('Contract refused'))
  await expect(chain.send(call)).rejects.toThrow('Contract refused')
  expect(walletPrompts()).toHaveLength(0)
})

test('a transaction bound to a wallet stops if the account changes during preflight', async () => {
  let finishSimulation!: (value: any) => void
  spyOn(chain.publicClient, 'simulateContract').mockImplementation(() => new Promise(resolve => { finishSimulation = resolve }) as any)
  const sending = chain.send({ ...call, expectedAccount: account } as chain.Call)
  await new Promise(resolve => setTimeout(resolve, 0))
  chain.disconnect()
  finishSimulation({ request: call })
  await expect(sending).rejects.toThrow('Wallet changed')
  expect(walletPrompts()).toHaveLength(0)
})

test('one signed submission uses the first available RPC receipt and stops other polling', async () => {
  let primarySignal!: AbortSignal
  spyOn(chain.publicClient, 'waitForTransactionReceipt').mockImplementation(({ signal }: any) => { primarySignal = signal; return new Promise(() => {}) })
  const result = await chain.send(call)
  expect(result.receipt.status).toBe('success')
  expect(walletPrompts()).toHaveLength(1)
  expect(primarySignal.aborted).toBe(true)
  expect(chain.receiptMirror.waitForTransactionReceipt).toHaveBeenCalledTimes(1)
})

test('a reverted receipt cannot be reported as a successful action', async () => {
  const reverted = { ...receipt, status: 'reverted' } as TransactionReceipt
  spyOn(chain.publicClient, 'waitForTransactionReceipt').mockResolvedValue(reverted)
  spyOn(chain.receiptMirror, 'waitForTransactionReceipt').mockResolvedValue(reverted)
  await expect(chain.send(call)).rejects.toThrow('reverted')
})

test('a cancelled or different replacement transaction cannot complete the original game action', async () => {
  const cancelled = async ({ onReplaced }: any) => {
    onReplaced({ reason: 'cancelled', transaction: { hash } })
    return receipt
  }
  spyOn(chain.publicClient, 'waitForTransactionReceipt').mockImplementation(cancelled as any)
  spyOn(chain.receiptMirror, 'waitForTransactionReceipt').mockImplementation(cancelled as any)
  await expect(chain.send(call)).rejects.toThrow(ReplacedActionError)
})

test('a wallet fee replacement keeps its confirmed hash and reports confirmation before returning', async () => {
  const replacementHash = (`0x${'2'.repeat(64)}`) as `0x${string}`
  const steps: { text: string; hash?: string }[] = []
  chain.setTxStep((text, hash) => steps.push({ text, hash }))
  const repriced = async ({ onReplaced }: any) => {
    onReplaced({ reason: 'repriced', transaction: { hash: replacementHash } })
    return { ...receipt, transactionHash: replacementHash }
  }
  spyOn(chain.publicClient, 'waitForTransactionReceipt').mockImplementation(repriced as any)
  spyOn(chain.receiptMirror, 'waitForTransactionReceipt').mockImplementation(repriced as any)
  try {
    const result = await chain.send(call)
    expect(result.hash).toBe(replacementHash)
    expect(steps.at(-1)).toMatchObject({ text: 'Confirmed on Sepolia — preparing the result…', hash: replacementHash })
    expect(walletPrompts()).toHaveLength(1)
  } finally { chain.setTxStep(null) }
})
