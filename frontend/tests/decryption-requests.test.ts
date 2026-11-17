import { expect, test } from 'bun:test'
import { DecryptionFlights, privateDecryptionKey, publicDecryptionKey, retryDecryption } from '../src/chimera/decryption-requests'

test('identical in-flight decryption calls share one request and release the entry afterwards', async () => {
  const flights = new DecryptionFlights()
  let release!: (value: number) => void
  let calls = 0
  const operation = () => { calls++; return new Promise<number>(resolve => { release = resolve }) }
  const a = flights.run('public:rounds', operation)
  const b = flights.run('public:rounds', operation)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(calls).toBe(1)
  release(7)
  expect(await a).toBe(7)
  expect(await b).toBe(7)
  expect(await flights.run('public:rounds', async () => 8)).toBe(8)
})

test('a rejected request is released so retrying can obtain a new valid proof', async () => {
  const flights = new DecryptionFlights()
  await expect(flights.run('public:rounds', async () => { throw Error('Not ready') })).rejects.toThrow('Not ready')
  expect(await flights.run('public:rounds', async () => 'new proof')).toBe('new proof')
})

test('decryption identity includes wallet, contracts, authorization and exact handle order', () => {
  const identity = { account: '0xabc', publicKey: 'public-key', signature: 'test-signature', start: 100, days: 1, contracts: ['0xdef'] }
  const pairs = [{ handle: '0xaaa', contractAddress: '0xdef' }]
  const key = privateDecryptionKey(identity, pairs)
  expect(privateDecryptionKey({ ...identity, account: '0xABC' }, [{ handle: '0xAAA', contractAddress: '0xDEF' }])).toBe(key)
  for (const change of [{ account: '0x123' }, { signature: 'renewed-authorization' }, { publicKey: 'new-key' }, { start: 101 }, { contracts: ['0x456'] }]) expect(privateDecryptionKey({ ...identity, ...change }, pairs)).not.toBe(key)
  expect(privateDecryptionKey(identity, [{ handle: '0xaaa', contractAddress: '0x456' }])).not.toBe(key)
  expect(publicDecryptionKey(['0xAA', '0xBB'])).toBe(publicDecryptionKey(['0xaa', '0xbb']))
  expect(publicDecryptionKey(['0xaa', '0xbb'])).not.toBe(publicDecryptionKey(['0xbb', '0xaa']))
  expect(key.includes(identity.signature)).toBe(false)
})

test('bounded transient retries sleep between attempts, never after the final failure', async () => {
  const waits: number[] = []
  let calls = 0
  const busy = Object.assign(new Error('Relayer busy'), { status: 503 })
  await expect(retryDecryption(async () => { calls++; throw busy }, { attempts: 3, wait: async ms => { waits.push(ms) } })).rejects.toBe(busy)
  expect(calls).toBe(3)
  expect(waits).toEqual([2500, 3500])
})

test('permanent authorization and invalid input failures stop without retry delays', async () => {
  for (const failure of [Object.assign(new Error('Unauthorized'), { status: 401 }), Object.assign(new Error('Forbidden'), { status: 403 }), Object.assign(new Error('bad handle'), { name: 'FhevmHandleError' }), Object.assign(new Error('invalid signature'), { name: 'SignatureError' })]) {
    let calls = 0
    const waits: number[] = []
    const wrapped = new Error('SDK wrapper', { cause: failure })
    await expect(retryDecryption(async () => { calls++; throw wrapped }, { attempts: 8, wait: async ms => { waits.push(ms) } })).rejects.toBe(wrapped)
    expect([calls, waits.length]).toEqual([1, 0])
  }
})

test('pending ciphertext publication and rate limits remain retryable', async () => {
  for (const status of [404, 429, 500, 503]) {
    let calls = 0
    const actual = await retryDecryption(async () => { if (++calls === 1) throw Object.assign(new Error('Not ready'), { status }); return true }, { attempts: 3, wait: async () => {} })
    expect([actual, calls]).toEqual([true, 2])
  }
})
