const assert = require('node:assert/strict')
const { test } = require('node:test')
const { randomUUID } = require('node:crypto')
const { circleKeepers } = require('./circle-keepers')

test('patrol fee, cost, return balance and revoked authorization are checked before Circle signs', async () => {
  let sends = 0
  const keeper = { id: randomUUID(), circle_id: randomUUID(), address: '0x7777777777777777777777777777777777777777' }
  const client = {
    estimateContractExecutionFee: async () => ({ data: { medium: { priorityFee: '0.02', maxFee: '0.03' } } }),
    createContractExecutionTransaction: async () => { sends++; return { data: { id: randomUUID(), state: 'INITIATED' } } },
  }
  const chain = { estimateGas: async () => 100_000n, getBalance: async () => 100_000_000_000_000n }
  const circle = circleKeepers({}, client, chain)
  const allowed = { maxFeePerGas: 100_000_000n, maxCostWei: 100_000_000_000_000n, balanceReserveWei: 0n }
  for (const extra of [{ maxFeePerGas: 1n }, { maxCostWei: 1n }, { balanceReserveWei: 100_000_000_000_000n }, { authorize: () => { throw Object.assign(new Error('Stopped'), { status: 409 }) } }]) {
    await assert.rejects(circle.execute(keeper, { id: randomUUID() }, { address: keeper.address, data: '0x' }, undefined, { ...allowed, ...extra }), e => e.notSubmitted === true && e.status === 409)
  }
  assert.equal(sends, 0)
  await circle.execute(keeper, { id: randomUUID() }, { address: keeper.address, data: '0x' }, undefined, allowed)
  assert.equal(sends, 1)
})

test('lost acknowledgement lookup scans later pages and filters by wallet and refId', async () => {
  const keeper = { circle_id: randomUUID() }, request = randomUUID()
  const client = {
    listTransactions: async ({ walletIds, pageAfter }) => {
      assert.deepEqual(walletIds, [keeper.circle_id])
      return { data: { transactions: pageAfter ? [{ id: 'found', walletId: keeper.circle_id, blockchain: 'ETH-SEPOLIA', refId: request, state: 'SENT' }] : Array.from({ length: 50 }, (_, i) => ({ id: String(i), refId: 'different' })) } }
    },
  }
  assert.deepEqual(await circleKeepers({}, client, {}).find(keeper, request, Date.now()), { circleId: 'found', status: 'SENT' })
})
