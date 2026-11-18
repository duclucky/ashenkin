const assert = require('node:assert/strict')
const { test } = require('node:test')
const { keeperStore } = require('./keeper-store')
test('stories stay new until a real result is acknowledged, and reads are scoped to keeper and world', () => {
  const store = keeperStore(':memory:', 'test-secret')
  try {
    const one = store.openSession('email:one@example.com').keeper,
      two = store.openSession('email:two@example.com').keeper
    const j = store.journey
    assert.deepEqual(j.state(one), { lifeIntroduced: false })
    assert.throws(() => j.mark(one, 'test', 1, 20), { status: 404 })
    store.life.record('test', {
      day: 20,
      nft: 1,
      code: 304,
      at: 100,
      hash: 'h',
      handle: 'x',
      proof: {},
    })
    store.life.record('test', {
      day: 20,
      nft: 2,
      code: 0,
      at: 101,
      hash: 'h2',
      handle: 'y',
      proof: {},
    })
    assert.deepEqual(j.summary(one, 'test', [1, 2]), {
      count: 2,
      wins: 1,
      items: 1,
      latest: { nft: 2, day: 20, at: 101, code: 0 },
    })
    assert.equal(j.summary(one, 'test', [3]).count, 0)
    j.mark(one, 'test', 1, 20)
    j.mark(one, 'test', 1, 20)
    assert.equal(j.summary(one, 'test', [1, 2]).count, 1)
    assert.equal(j.summary(two, 'test', [1, 2]).count, 2)
    assert.equal(j.seen(one, 'other', 1, 20), false)
    j.introduce(one)
    assert.equal(j.state(one).lifeIntroduced, true)
    assert.equal(j.state(two).lifeIntroduced, false)
    assert.equal(store.life.view('test', 1).inventory[0].quantity, 1)
  } finally {
    store.close()
  }
})
