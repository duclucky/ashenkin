const assert = require('node:assert/strict')
const { test } = require('node:test')
const { sponsorLane, blockSponsor } = require('./sponsor-lane')

test('living-world reservation blocks interactive sponsorship until its durable transaction is resolved', async () => {
  const address = '0x7777777777777777777777777777777777777777'
  let pending = false
  blockSponsor(address, () => pending)
  const order = []
  await Promise.allSettled([
    sponsorLane(address, async () => { order.push('prepare'); await Promise.resolve(); pending = true; order.push('persist') }, { living: true }),
    sponsorLane(address, async () => { order.push('interactive') }),
  ])
  assert.deepEqual(order, ['prepare', 'persist'])
  await assert.rejects(sponsorLane(address, async () => {}), /reconciling/)
  pending = false
  await sponsorLane(address, async () => { order.push('interactive') })
  assert.equal(order.at(-1), 'interactive')
})
