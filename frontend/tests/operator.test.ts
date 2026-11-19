import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import type { Address } from 'viem'

import * as chain from '../src/chimera/chain'
import { ensureOperator } from '../src/chimera/actions'

let read: ReturnType<typeof spyOn<typeof chain, 'read'>>
let send: ReturnType<typeof spyOn<typeof chain, 'send'>>
const keeper = '0x0000000000000000000000000000000000000001' as Address
const step = () => {}

beforeEach(() => {
  // Restorable spies avoid replacing chain exports for every other test file.
  read = spyOn(chain, 'read')
  send = spyOn(chain, 'send')
  const schedule = globalThis.setTimeout
  spyOn(globalThis, 'setTimeout').mockImplementation((fn) => schedule(fn, 0))
})

afterEach(() => {
  read.mockReset()
  send.mockReset()
  mock.restore()
})

test('stops a paid action when the confirmed operator approval is still missing', async () => {
  read.mockResolvedValue(false)
  send.mockResolvedValue(undefined)

  await expect(ensureOperator(keeper, chain.LAB, step)).rejects.toThrow('cZAMA approval is still syncing')
  expect(send).toHaveBeenCalledTimes(1)
})

test('continues when the operator approval becomes visible', async () => {
  read.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('RPC temporarily unavailable')).mockResolvedValue(true)
  send.mockResolvedValue(undefined)

  await ensureOperator(keeper, chain.LAB, step)
  expect(send).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledTimes(3)
})
