const assert = require('node:assert/strict')
const { test } = require('node:test')
const { randomUUID } = require('node:crypto')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { keeperStore } = require('./keeper-store')
const { patrolService, CONSENT, RETURN_RESERVE } = require('./patrol')

function fixture(file = ':memory:', options = {}) {
  const store = keeperStore(file, 'test-secret')
  const login = store.openSession('email:patrol@example.com')
  const keeper = login.keeper.address ? login.keeper : store.setWallet(login.keeper, { id: randomUUID(), address: '0x7777777777777777777777777777777777777777' })
  let now = 1_800_000_000_000
  const receipts = new Map(), sent = [], expeditions = new Map()
  let approved = false
  const chain = {
    check: async () => ({ approved, runs: 0, max: 6, duration: 600 }),
    call: (kind, job) => ({ address: keeper.address, data: '0x', name: kind, job }),
    expedition: async id => expeditions.get(id),
    receipt: async hash => receipts.get(hash),
    started: () => ({ id: 1, startedAt: now / 1000, endsAt: now / 1000 + 600 }),
    returned: () => true,
  }
  const circle = {
    execute: async (who, intent, call, fee, limits) => {
      assert.equal(who.id, keeper.id)
      const out = { circleId: intent.id, status: 'INITIATED' }
      sent.push({ ...out, kind: call.name, limits, intent: intent.id })
      return out
    },
    status: async (who, id) => ({ done: true, failed: false, hash: id, status: 'CONFIRMED' }),
    find: async (who, id) => { const tx = sent.find(s => s.intent === id); return tx ? { circleId: tx.circleId, status: tx.status } : null },
  }
  const service = () => patrolService({ store, circle, patrolChain: chain, clock: () => now, ...options })
  const input = { creatureId: 12, zone: 0, trips: 2, budget: '0.01', consent: CONSENT }
  async function confirm(kind, cost = 100n) {
    const tx = sent.at(-1)
    assert.equal(tx.kind, kind)
    receipts.set(tx.circleId, { status: 'success', cost, logs: [] })
    if (kind === 'approve') approved = true
    if (kind === 'start') expeditions.set(1, { creatureId: 12, keeper: keeper.address, zone: 0, claimed: false, startedAt: now / 1000, endsAt: now / 1000 + 600 })
  }
  return { store, keeper, login, service, input, sent, receipts, expeditions, confirm, chain, circle, advance: ms => { now += ms }, close: () => store.close() }
}

test('a patrol is opt-in, bounded and validates the NFT before spending', async () => {
  const f = fixture()
  try {
    const s = f.service()
    assert.deepEqual(s.list(f.keeper), [])
    await assert.rejects(s.start(f.keeper, { ...f.input, consent: undefined }), { status: 400 })
    for (const extra of [{ trips: 7 }, { zone: 3 }, { budget: '1' }, { creatureId: -1 }]) await assert.rejects(s.start(f.keeper, { ...f.input, ...extra }), { status: 400 })
    await s.start(f.keeper, f.input)
    await assert.rejects(s.start(f.keeper, f.input), { status: 409 })
    assert.equal(f.sent.length, 0)
  } finally { f.close() }
})

test('closing the session and restarting the server still returns the NFT; stopping prevents another trip', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ash-patrol-'))
  const f = fixture(path.join(dir, 'keepers.sqlite'))
  try {
    let s = f.service()
    const job = await s.start(f.keeper, f.input)
    await s.tick(); await f.confirm('approve'); await s.tick()
    await s.tick(); await f.confirm('start'); await s.tick()
    f.store.logout(f.login.token)
    assert.equal(f.store.session(f.login.token), undefined)
    s = f.service() // scheduler holds no session or in-memory journey state
    s.stop(f.keeper, job.id)
    f.advance(610_000)
    await s.tick(); await f.confirm('claim'); await s.tick(); await s.tick()
    const done = s.list(f.keeper)[0]
    assert.equal(done.active, false)
    assert.equal(done.completed, 1)
    assert.equal(done.spentWei, '300')
    assert.deepEqual(f.sent.map(s => s.kind), ['approve', 'start', 'claim'])
  } finally { f.close(); rmSync(dir, { recursive: true }) }
})

test('two workers cannot submit the same step and an ambiguous send is never repeated', async () => {
  const f = fixture()
  try {
    const s = f.service()
    await s.start(f.keeper, f.input)
    await Promise.all([s.tick(), f.service().tick()])
    assert.equal(f.sent.length, 1)
    await s.tick()
    assert.equal(f.sent.length, 1)
  } finally { f.close() }
})

test('every launch reserves return gas and exhausted budgets never start another trip', async () => {
  const f = fixture()
  try {
    const s = f.service()
    await s.start(f.keeper, { ...f.input, budget: '0.004' })
    await s.tick()
    assert.equal(f.sent[0].limits.maxCostWei, 4_000_000_000_000_000n - RETURN_RESERVE)
    await f.confirm('approve', 3_000_000_000_000_000n); await s.tick(); await s.tick()
    assert.equal(f.sent.length, 1)
    assert.equal(s.list(f.keeper)[0].phase, 'paused')
  } finally { f.close() }
})

test('a committed mandate and in-flight transaction survive closing and reopening SQLite', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ash-patrol-restart-'))
  const file = path.join(dir, 'keepers.sqlite')
  const f = fixture(file)
  let reopened
  try {
    const job = await f.service().start(f.keeper, f.input)
    await f.service().tick()
    f.close()
    reopened = keeperStore(file, 'test-secret')
    const service = patrolService({ store: reopened, circle: f.circle, patrolChain: f.chain, clock: () => 1_800_000_001_000 })
    assert.equal(service.list(f.keeper)[0].id, job.id)
    await f.confirm('approve')
    await service.tick()
    assert.equal(service.list(f.keeper)[0].phase, 'ready')
    assert.equal(f.sent.length, 1)
  } finally { reopened?.close(); rmSync(dir, { recursive: true }) }
})

test('an accepted Circle action with a lost response recovers by refId without paying again', async () => {
  const f = fixture()
  try {
    const execute = f.circle.execute
    f.circle.execute = async (...args) => { await execute(...args); throw new Error('network timeout') }
    const s = f.service()
    await s.start(f.keeper, f.input); await s.tick()
    await f.confirm('approve')
    await f.service().tick()
    assert.equal(f.sent.length, 1)
    assert.equal(s.list(f.keeper)[0].phase, 'ready')
    assert.equal(s.list(f.keeper)[0].spentWei, '100')
  } finally { f.close() }
})

test('unknown submissions and receipt-less success never trigger further spending', async () => {
  const f = fixture()
  try {
    f.circle.execute = async () => { throw new Error('lost connection') }
    const s = f.service()
    await s.start(f.keeper, f.input); await s.tick()
    await s.tick(); await s.tick()
    assert.ok(s.list(f.keeper)[0].step)
    assert.equal(s.list(f.keeper)[0].spentWei, '0')
    assert.equal(f.sent.length, 0)
  } finally { f.close() }
})

test('stop before the first departure and expiry cause no new transactions', async () => {
  for (const stopped of [true, false]) {
    const f = fixture()
    try {
      const s = f.service(), job = await s.start(f.keeper, f.input)
      if (stopped) s.stop(f.keeper, job.id)
      else f.advance(8 * 3600_000)
      await s.tick()
      assert.equal(s.list(f.keeper)[0].active, false)
      assert.equal(f.sent.length, 0)
    } finally { f.close() }
  }
})

test('expiry still returns an away NFT and leaves no repeat mandate', async () => {
  const f = fixture()
  try {
    const s = f.service()
    await s.start(f.keeper, f.input)
    await s.tick(); await f.confirm('approve'); await s.tick()
    await s.tick(); await f.confirm('start'); await s.tick()
    f.advance(9 * 3600_000)
    await s.tick(); await f.confirm('claim'); await s.tick(); await s.tick()
    assert.equal(s.list(f.keeper)[0].active, false)
    assert.deepEqual(f.sent.map(s => s.kind), ['approve', 'start', 'claim'])
  } finally { f.close() }
})

test('conflicting manual NFT operations are blocked but other NFTs remain playable', async () => {
  const f = fixture()
  const { addresses: A } = require('./ashenkin.json')
  const { gameCall } = require('./keeper-chain')
  const { parseAbi, encodeFunctionData } = require('viem')
  try {
    const s = f.service()
    await s.start(f.keeper, f.input)
    const abi = parseAbi(['function breed(uint256,uint256)'])
    const call = (a, b) => gameCall(f.keeper.address, A.ChimeraLab, encodeFunctionData({ abi, functionName: 'breed', args: [a, b] }))
    assert.throws(() => s.guard(f.keeper, call(12n, 3n)), { status: 409 })
    assert.throws(() => s.guard(f.keeper, call(3n, 12n)), { status: 409 })
    assert.doesNotThrow(() => s.guard(f.keeper, call(3n, 4n)))
    const other = f.store.openSession('email:other@example.com').keeper
    assert.throws(() => s.stop(other, s.list(f.keeper)[0].id), { status: 404 })
  } finally { f.close() }
})

test('reverted transactions count gas once and pause without retrying', async () => {
  const f = fixture()
  try {
    const s = f.service()
    await s.start(f.keeper, f.input); await s.tick()
    await f.confirm('approve', 99n)
    f.receipts.get(f.sent[0].circleId).status = 'reverted'
    await s.tick(); await s.tick()
    assert.equal(s.list(f.keeper)[0].phase, 'paused')
    assert.equal(s.list(f.keeper)[0].spentWei, '99')
    assert.equal(f.sent.length, 1)
  } finally { f.close() }
})

test('a temporary event verification failure cannot count the same gas twice', async () => {
  const f = fixture()
  try {
    const s = f.service()
    await s.start(f.keeper, f.input)
    await s.tick(); await f.confirm('approve'); await s.tick()
    await s.tick(); await f.confirm('start')
    const started = f.chain.started
    f.chain.started = () => { throw new Error('RPC lag') }
    await s.tick(); await s.tick()
    assert.equal(s.list(f.keeper)[0].spentWei, '100')
    f.chain.started = started
    await s.tick()
    assert.equal(s.list(f.keeper)[0].spentWei, '200')
  } finally { f.close() }
})

test('abandoned leases expire and fence out a stale worker before it can save', async () => {
  const f = fixture()
  try {
    const s = f.service(), job = await s.start(f.keeper, f.input)
    const first = f.store.patrols.acquire(job.id, 1_800_000_000_000)
    assert.equal(f.store.patrols.acquire(job.id, 1_800_000_000_001), null)
    const next = f.store.patrols.acquire(job.id, 1_800_000_121_000)
    assert.ok(next)
    assert.equal(f.store.patrols.owns(job.id, first.lease, 1_800_000_121_001), false)
    assert.throws(() => f.store.patrols.save(first.job, first.lease, 1_800_000_121_001), { status: 409 })
  } finally { f.close() }
})

test('waiting and paused patrols cannot starve newer keepers after the scheduler batch limit', () => {
  const f = fixture()
  try {
    for (let i = 0; i < 51; i++) {
      const keeper = f.store.openSession(`email:batch-${i}@example.com`).keeper
      f.store.patrols.create(keeper, { phase: 'paused' }, 1000 + i)
    }
    const first = f.store.patrols.due(10000)
    assert.equal(first.length, 50)
    for (const row of first) {
      const held = f.store.patrols.acquire(row.id, 10000)
      f.store.patrols.release(row.id, held.lease)
    }
    assert.ok(!first.some(row => row.id === f.store.patrols.due(10001)[0].id))
  } finally { f.close() }
})
