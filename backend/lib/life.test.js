const assert = require('node:assert/strict')
const { test } = require('node:test')
const { keeperStore } = require('./keeper-store')
const { lifeService } = require('./life')

function fixture() {
  const store = keeperStore(':memory:', 'test-secret')
  let now = 1800000000000, prepares = 0
  const sent = [], receipts = new Map()
  const chain = {
    address: 'contract', population: async () => 2, eligible: async () => true, encounter: async () => null,
    prepare: async (ids, budget, authorize) => { prepares++; authorize(); return { raw: `raw-${prepares}`, hash: `hash-${prepares}`, maxCost: '100' } },
    broadcast: async (raw, hash) => sent.push(hash), receipt: async hash => receipts.get(hash),
    decrypt: async () => ({ value: 304, cleartexts: '0x', proof: '0x' }), verify: async () => true,
  }
  const config = { store, chain, world: 'test', dailyBudgetWei: 200n, clock: () => now }
  return { store, chain, receipts, sent, config, service: () => lifeService(config), count: () => prepares, advance: ms => { now += ms }, day: () => Math.floor(now / 86400000), close: () => store.close() }
}

test('the worker automatically draws for an NFT without a login, and credits each verified win once', async () => {
  const f = fixture()
  try {
    const s = f.service()
    await s.tick()
    assert.equal(f.count(), 1)
    f.receipts.set('hash-1', { day: f.day(), cost: '60', results: [{ day: f.day(), nft: 1, at: 1, hash: 'hash-1', handle: 'handle1' }] })
    await f.service().tick()
    await f.service().tick()
    assert.deepEqual(f.store.life.view('test', 1).inventory, [{ item: 1, quantity: 1 }])
    assert.equal(f.store.life.view('test', 1).history.length, 1)
  } finally { f.close() }
})

test('a loss never grants or removes items, and fake decryption cannot create a reward', async () => {
  const f = fixture()
  try {
    const s = f.service(); await s.tick()
    f.receipts.set('hash-1', { day: f.day(), cost: '60', results: [{ day: f.day(), nft: 1, at: 1, hash: 'hash-1', handle: 'handle1' }] })
    f.chain.verify = async () => false
    await s.tick()
    assert.equal(f.store.life.view('test', 1).history.length, 0)
    assert.ok(s.pending())
    f.chain.verify = async () => true; f.chain.decrypt = async () => ({ value: 0 })
    await s.tick()
    assert.deepEqual(f.store.life.view('test', 1).inventory, [])
    assert.equal(f.store.life.view('test', 1).history[0].won, false)
    assert.equal(f.store.life.state('test').costs[String(f.day())], '60')
  } finally { f.close() }
})

test('a crash after accepting the raw transaction rebroadcasts the same bytes, never a fresh draw', async () => {
  const f = fixture()
  try {
    f.chain.broadcast = async (raw, hash) => { f.sent.push(hash); throw new Error('timeout') }
    await f.service().tick(); await f.service().tick()
    assert.deepEqual(f.sent, ['hash-1', 'hash-1'])
    assert.equal(f.count(), 1)
  } finally { f.close() }
})

test('crafting consumes both materials atomically and equipment requires the actual item', () => {
  const f = fixture()
  try {
    const db = f.store.life
    assert.throws(() => db.craft('test', 1), { status: 409 })
    assert.throws(() => db.equip('test', 1, 3), { status: 409 })
    for (let day = 1; day <= 5; day++) db.record('test', { day, nft: 1, code: 304, at: 1, hash: 'h', handle: 'x', proof: {} })
    assert.throws(() => db.craft('test', 1), { status: 409 })
    assert.equal(db.view('test', 1).inventory[0].quantity, 5)
    for (let day = 6; day <= 7; day++) db.record('test', { day, nft: 1, code: 336, at: 1, hash: 'h', handle: 'x', proof: {} })
    db.craft('test', 1); db.equip('test', 1, 3)
    assert.deepEqual(db.view('test', 1).inventory, [{ item: 3, quantity: 1 }])
    assert.equal(db.view('test', 1).equipped, 3)
  } finally { f.close() }
})

test('a confirmed result waiting for KMS cannot spend or count its gas twice', async () => {
  const f = fixture()
  try {
    await f.service().tick()
    f.receipts.set('hash-1', { day: f.day(), cost: '60', results: [{ day: f.day(), nft: 1, at: 1, hash: 'hash-1', handle: 'handle1' }] })
    f.chain.verify = async () => false
    await f.service().tick(); await f.service().tick()
    assert.equal(f.count(), 1)
    assert.equal(f.store.life.state('test').costs[String(f.day())], '60')
    f.chain.verify = async () => true
    await f.service().tick()
    assert.equal(f.store.life.view('test', 1).inventory[0].quantity, 1)
  } finally { f.close() }
})

test('the daily fee budget stops additional draws, resets next day, and does not backfill missed days', async () => {
  const f = fixture()
  try {
    const s = f.service(); await s.tick()
    const day = f.day()
    f.receipts.set('hash-1', { day, cost: '200', results: [{ day, nft: 1, at: 1, hash: 'hash-1', handle: 'handle1' }] })
    await s.tick(); await s.tick()
    assert.equal(f.count(), 1)
    f.advance(3 * 86400000)
    await s.tick()
    assert.equal(f.count(), 2)
    assert.equal(f.store.life.state('test').day, day + 3)
  } finally { f.close() }
})

test('escrow specimens are skipped without spinning and revisited when they return', async () => {
  const f = fixture()
  try {
    f.chain.population = async () => 1
    let reads = 0, atHome = false
    f.chain.eligible = async () => { reads++; return atHome }
    await f.service().tick()
    assert.equal(reads, 1)
    assert.equal(f.count(), 0)
    atHome = true
    await f.service().tick()
    assert.equal(f.count(), 1)
  } finally { f.close() }
})

test('a missing expected event cannot create a reward or discard an unresolved transaction', async () => {
  const f = fixture()
  try {
    const s = f.service(); await s.tick()
    f.receipts.set('hash-1', { day: f.day(), cost: '60', results: [] })
    await s.tick()
    assert.ok(s.pending())
    assert.equal(f.store.life.view('test', 1).history.length, 0)
  } finally { f.close() }
})

test('parallel workers cannot sign two transactions for the same world', async () => {
  const f = fixture()
  try {
    await Promise.all([f.service().tick(), f.service().tick()])
    assert.equal(f.count(), 1)
  } finally { f.close() }
})

test('malformed codes and foreign-world rewards cannot alter a specimen’s bag', () => {
  const f = fixture()
  try {
    const db = f.store.life
    for (const code of [-1, 1024, 3, 48, 560]) assert.throws(() => db.record('test', { day: 1, nft: 1, code, at: 1, hash: 'h', handle: 'h', proof: {} }))
    db.record('other', { day: 1, nft: 1, code: 304, at: 1, hash: 'h', handle: 'h', proof: {} })
    assert.equal(db.view('test', 1).inventory.length, 0)
    assert.equal(db.view('other', 1).inventory[0].quantity, 1)
  } finally { f.close() }
})

test('a failed read or KMS response cannot silently skip an NFT for the day', async () => {
  const f = fixture()
  try {
    const calls = []
    const initial = f.chain.encounter
    f.chain.encounter = async (day, id) => { calls.push(id); throw new Error('RPC unavailable') }
    await f.service().tick()
    f.chain.encounter = async (day, id) => { calls.push(id); return initial(day, id) }
    f.chain.population = async () => 1
    await f.service().tick()
    assert.deepEqual(calls, [1, 1])
    assert.equal(f.count(), 1)
  } finally { f.close() }
})
