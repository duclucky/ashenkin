const assert = require('node:assert/strict')
const { test } = require('node:test')
const { randomUUID } = require('node:crypto')
const { keeperStore } = require('./keeper-store')
const { keeperReconciler } = require('./keeper-reconcile')
const hash = `0x${'42'.repeat(32)}`

function fixture(t, circle, options = {}) {
  const store = keeperStore(':memory:', randomUUID())
  t.after(() => store.close())
  const session = store.openSession('wallet:test')
  const keeper = store.setWallet(session.keeper, { id: randomUUID(), address: '0x7777777777777777777777777777777777777777' })
  let now = Date.now() + 60_000
  const logs = []
  const reconcile = keeperReconciler({ store, circle, now: () => now, log: entry => logs.push(entry), ...options })
  return { store, keeper, reconcile, logs, advance: ms => { now += ms } }
}

test('background reconciliation finishes abandoned successful and reverted transactions without sending', async t => {
  let reads = 0
  const f = fixture(t, { status: async (_keeper, id) => {
    reads++
    return { status: id === 'ok' ? 'CONFIRMED' : 'FAILED', hash, done: true, failed: id !== 'ok' }
  } })
  const ok = f.store.beginTx(f.keeper, 'one'), failed = f.store.beginTx(f.keeper, 'two')
  f.store.updateTx(ok.id, { circleId: 'ok', status: 'SENT', hash })
  f.store.updateTx(failed.id, { circleId: 'reverted', status: 'SENT', hash })
  assert.deepEqual(await f.reconcile.tick(), { checked: 2, completed: 2, waiting: 0, errors: 0 })
  assert.equal(f.store.tx(f.keeper, ok.id).done, 1)
  assert.equal(f.store.tx(f.keeper, failed.id).status, 'FAILED')
  await f.reconcile.tick()
  assert.equal(reads, 2)
})

test('a missing Circle acknowledgement is recovered by refId and completed in the same pass', async t => {
  const f = fixture(t, {
    find: async (keeper, refId, created) => {
      assert.equal(keeper.id, f.keeper.id); assert.equal(refId, tx.id); assert.equal(created, tx.created)
      return { circleId: 'recovered', status: 'SENT' }
    },
    status: async (_keeper, id) => {
      assert.equal(id, 'recovered')
      return { status: 'CONFIRMED', hash, done: true, failed: false }
    },
  })
  const tx = f.store.beginTx(f.keeper, 'orphan')
  await f.reconcile.tick()
  assert.equal(f.store.tx(f.keeper, tx.id).circle_id, 'recovered')
  assert.equal(f.store.tx(f.keeper, tx.id).done, 1)
})

test('absence and provider errors preserve the intent, back off, and do not starve later requests', async t => {
  let reads = 0
  const f = fixture(t, {
    find: async () => { reads++; return null },
    status: async () => { reads++; throw new Error('sensitive provider response') },
  }, { batchSize: 1 })
  const unknown = f.store.beginTx(f.keeper, 'unknown'), unavailable = f.store.beginTx(f.keeper, 'unavailable')
  f.store.updateTx(unavailable.id, { circleId: 'circle', status: 'SENT' })
  await f.reconcile.tick()
  await f.reconcile.tick()
  await f.reconcile.tick()
  assert.equal(reads, 2)
  assert.equal(f.store.tx(f.keeper, unknown.id).done, 0)
  assert.equal(f.store.tx(f.keeper, unavailable.id).done, 0)
  assert.doesNotMatch(JSON.stringify(f.logs), /sensitive provider response/)
  f.advance(61_000)
  await f.reconcile.tick()
  assert.equal(reads, 3)
})

test('new submissions are left alone during the acknowledgement grace period', async t => {
  const f = fixture(t, { find: async () => { throw new Error('too soon') } }, { graceMs: 120_000 })
  f.store.beginTx(f.keeper, 'new')
  assert.equal((await f.reconcile.tick()).checked, 0)
})

test('overlapping ticks share a single reconciliation run', async t => {
  let release, reads = 0
  const f = fixture(t, { status: async () => {
    reads++; await new Promise(resolve => { release = resolve })
    return { status: 'CONFIRMED', hash, done: true, failed: false }
  } })
  const tx = f.store.beginTx(f.keeper, 'one')
  f.store.updateTx(tx.id, { circleId: 'circle', status: 'SENT' })
  const first = f.reconcile.tick(), second = f.reconcile.tick()
  await new Promise(resolve => setImmediate(resolve))
  release()
  await Promise.all([first, second])
  assert.equal(reads, 1)
})

test('completed records cannot be downgraded by a late pending response', async t => {
  const f = fixture(t, {})
  const tx = f.store.beginTx(f.keeper, 'complete')
  f.store.updateTx(tx.id, { circleId: 'circle', status: 'CONFIRMED', hash, done: true })
  f.store.updateTx(tx.id, { status: 'SENT', done: false })
  assert.equal(f.store.tx(f.keeper, tx.id).status, 'CONFIRMED')
  assert.equal(f.store.tx(f.keeper, tx.id).done, 1)
})

test('a provider cannot replace an already recorded transaction hash', async t => {
  const f = fixture(t, { status: async () => ({ status: 'CONFIRMED', hash: `0x${'99'.repeat(32)}`, done: true, failed: false }) })
  const tx = f.store.beginTx(f.keeper, 'bound-hash')
  f.store.updateTx(tx.id, { circleId: 'circle', status: 'SENT', hash })
  assert.equal((await f.reconcile.tick()).errors, 1)
  assert.equal(f.store.tx(f.keeper, tx.id).hash, hash)
  assert.equal(f.store.tx(f.keeper, tx.id).done, 0)
})
