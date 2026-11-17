import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import * as chain from '../src/chimera/chain'
import * as fhe from '../src/chimera/fhe'
import { tacticsAutoSettle, tacticsSettle } from '../src/chimera/season'
import * as sponsor from '../src/chimera/sponsored-settlement'

const handles = [1, 2, 3].map(n => `0x${n.toString().repeat(64)}` as `0x${string}`)
const account = `0x${'ab'.repeat(20)}` as `0x${string}`
const tx = { hash: handles[0], receipt: { from: account, status: 'success' }, events: [] } as unknown as chain.Sent
beforeEach(() => mock.clearAllMocks())
afterEach(() => mock.restore())

test('a confirmed public battle result never waits for the optional private wild plan', async () => {
  spyOn(fhe, 'publicDecryptWithProof').mockResolvedValue({ clearValues: { [handles[0]]: true, [handles[1]]: true, [handles[2]]: false }, abiEncodedClearValues: '0x00', decryptionProof: '0x01' })
  spyOn(chain, 'send').mockResolvedValue(tx)
  spyOn(chain, 'read').mockResolvedValue(handles[0])
  spyOn(fhe, 'storedLabKey').mockReturnValue({} as any)
  let release!: (value: any) => void
  const privateRead = spyOn(fhe, 'privateValues').mockImplementation(() => new Promise(resolve => { release = resolve }))
  let complete = false
  // Legacy JS callers passed a fourth argument; it must not add private work.
  const settling = (tacticsSettle as (...args: any[]) => ReturnType<typeof tacticsSettle>)(20, handles, () => {}, { wild: true }).then(result => { complete = true; return result })
  await new Promise(resolve => setTimeout(resolve, 0))
  try {
    expect(complete).toBe(true)
    expect(privateRead).not.toHaveBeenCalled()
  } finally { release?.({ [handles[0]]: 0n }); await settling }
  const result = await settling
  expect([result.rounds, result.won, result.hash]).toEqual([[true, true, false], true, tx.hash])
})

test('a missing public round cannot be fabricated into a loss or sent to the wallet', async () => {
  spyOn(fhe, 'publicDecryptWithProof').mockResolvedValue({ clearValues: { [handles[0]]: true }, abiEncodedClearValues: '0x00', decryptionProof: '0x01' })
  const send = spyOn(chain, 'send').mockResolvedValue(tx)
  await expect(tacticsSettle(20, handles, () => {})).rejects.toThrow()
  expect(send).not.toHaveBeenCalled()
})

test('a sponsored battle gets its three rounds from the confirmed event without opening the player wallet', async () => {
  const send = spyOn(chain, 'send')
  const proof = spyOn(fhe, 'publicDecryptWithProof')
  spyOn(sponsor, 'sponsoredSettlement').mockResolvedValue({ ...tx, events: [
    { address: chain.COLOSSEUM, eventName: 'BattleSettled', args: { battleId: 20n, challengerWon: true, rounds: 5 } },
  ] })
  const result = await tacticsAutoSettle(20, handles, () => {})
  expect([result.rounds, result.won, result.hash]).toEqual([[true, false, true], true, tx.hash])
  expect(send).not.toHaveBeenCalled()
  expect(proof).not.toHaveBeenCalled()
})

test('a sponsored receipt for a different fight cannot be shown as a completed result', async () => {
  spyOn(sponsor, 'sponsoredSettlement').mockResolvedValue({ ...tx, events: [
    { address: chain.COLOSSEUM, eventName: 'BattleSettled', args: { battleId: 19n, challengerWon: true, rounds: 7 } },
  ] })
  await expect(tacticsAutoSettle(20, handles, () => {})).rejects.toThrow('expected settlement')
})

test('a freshly confirmed hunt can retry one sponsor read after a temporary conflict, without asking the wallet', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
  const fetchMock = spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(null, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ hash: tx.hash }))
  const wallet = spyOn(chain, 'send')
  const receipt = spyOn(chain, 'readSentReceipt').mockResolvedValue(tx)
  try {
    expect(await sponsor.sponsoredSettlement('battle', 20, handles, () => {})).toBe(tx)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(receipt).toHaveBeenCalledWith(tx.hash)
    expect(wallet).not.toHaveBeenCalled()
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
