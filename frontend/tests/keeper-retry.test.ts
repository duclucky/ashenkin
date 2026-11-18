import { expect, test } from 'bun:test'
import { failedKeeperAction, KeeperEstimateRetry, withKeeperRetry } from '../src/chimera/keeper-retry'

test('only an explicit estimation failure without a hash permits a retry', () => {
  expect(() => failedKeeperAction({ failed: true, retryable: true })).toThrow(KeeperEstimateRetry)
  expect(() => failedKeeperAction({ failed: true, retryable: true, hash: '0x1234' })).not.toThrow(KeeperEstimateRetry)
  expect(() => failedKeeperAction({ failed: true })).not.toThrow(KeeperEstimateRetry)
  expect(() => failedKeeperAction({ failed: false, retryable: true })).not.toThrow()
})

test('a pre-broadcast estimation failure recovers with one replacement submission', async () => {
  let attempts = 0
  let retries = 0
  const value = await withKeeperRetry(async () => {
    if (++attempts === 1) failedKeeperAction({ failed: true, retryable: true })
    return 'confirmed-hash'
  }, () => retries++, async () => {})
  expect(value).toBe('confirmed-hash')
  expect(attempts).toBe(2)
  expect(retries).toBe(1)
})

test('ambiguous network errors and already broadcast actions are never resubmitted', async () => {
  for (const failure of [new Error('timeout'), new Error('reverted transaction')]) {
    let attempts = 0
    await expect(withKeeperRetry(async () => { attempts++; throw failure }, () => {}, async () => {})).rejects.toBe(failure)
    expect(attempts).toBe(1)
  }
})

test('recovery is bounded to three attempts', async () => {
  let attempts = 0
  await expect(withKeeperRetry(async () => {
    attempts++
    throw new KeeperEstimateRetry('behind')
  }, () => {}, async () => {})).rejects.toBeInstanceOf(KeeperEstimateRetry)
  expect(attempts).toBe(3)
})
