const assert = require('node:assert/strict')
const { once } = require('node:events')
const { test } = require('node:test')
const express = require('express')
const { keeperStore } = require('./keeper-store')
const { keeperRouter } = require('../routes/keeper')
const { lifeService } = require('./life')
test('new-story summary and acknowledgement require the current NFT owner and cannot grant a reward', async () => {
  const origin = 'http://localhost:5191',
    store = keeperStore(':memory:', 'test-secret')
  const one = store.openSession('email:one@example.com'),
    two = store.openSession('email:two@example.com')
  const a = store.setWallet(one.keeper, {
    id: 'c1',
    address: '0x7777777777777777777777777777777777777777',
  })
  const b = store.setWallet(two.keeper, {
    id: 'c2',
    address: '0x8888888888888888888888888888888888888888',
  })
  let owner = a.address
  const life = {
    ...lifeService({
      store,
      chain: { address: 'contract' },
      world: 'test',
      dailyBudgetWei: 1n,
    }),
    chain: {
      owner: async () => owner,
      owned: async (who) => (who === owner ? [1] : []),
    },
  }
  store.life.record('test', {
    day: 20,
    nft: 1,
    code: 304,
    at: 100,
    hash: 'h',
    handle: 'x',
    proof: {},
  })
  const app = express()
  app.use(
    '/api/keeper',
    keeperRouter({ store, circle: {}, chain: {}, life, origin }),
  )
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const request = async (route, token, body, from = origin) => {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/api/keeper/${route}`,
      {
        headers: {
          origin: from,
          cookie: token ? `ash-keeper-local=${token}` : '',
          'content-type': 'application/json',
        },
        ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      },
    )
    return { status: res.status, data: await res.json() }
  }
  try {
    assert.equal((await request('journey')).status, 401)
    assert.equal((await request('life', one.token)).data.unread.count, 1)
    assert.equal(
      (await request('life/1', one.token)).data.history[0].seen,
      false,
    )
    assert.equal((await request('life', one.token)).data.unread.count, 1)
    assert.equal(
      (await request('life/1/seen', two.token, { day: 20 })).status,
      403,
    )
    assert.equal(
      (
        await request(
          'life/1/seen',
          one.token,
          { day: 20 },
          'https://attacker.test',
        )
      ).status,
      403,
    )
    assert.equal(
      (await request('life/1/seen', one.token, { day: 21 })).status,
      404,
    )
    assert.equal(
      (await request('life/1/seen', one.token, { day: 20 })).status,
      200,
    )
    assert.equal(
      (await request('life/1', one.token)).data.history[0].seen,
      true,
    )
    assert.equal((await request('life', one.token)).data.unread.count, 0)
    assert.equal((await request('journey/life', one.token, {})).status, 200)
    assert.equal(
      (await request('journey', one.token)).data.lifeIntroduced,
      true,
    )
    owner = b.address
    assert.equal((await request('life', two.token)).data.unread.count, 1)
    assert.equal(
      (await request('life/1/seen', one.token, { day: 20 })).status,
      403,
    )
    assert.equal(store.life.view('test', 1).inventory[0].quantity, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    store.close()
  }
})
