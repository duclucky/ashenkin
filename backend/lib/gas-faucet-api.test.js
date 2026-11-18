const assert = require('node:assert/strict')
const { once } = require('node:events')
const { test } = require('node:test')
const express = require('express')
const { keeperStore } = require('./keeper-store')
const { keeperRouter } = require('../routes/keeper')
const { faucetService } = require('./gas-faucet')
test('faucet auth binds destination to the account; cross-origin and cross-wallet requests are denied', async () => {
  const store = keeperStore(':memory:', 'test-secret'),
    origin = 'http://localhost:5190'
  const login = store.openSession('email:qa@example.com')
  const keeper = store.setWallet(login.keeper, {
    id: 'circle-1',
    address: '0x7777777777777777777777777777777777777777',
  })
  const faucet = faucetService({
    store,
    chain: {
      address: '0x8888888888888888888888888888888888888888',
      funded: async () => true,
    },
  })
  const app = express()
  app.use(
    '/api/keeper',
    keeperRouter({ store, circle: {}, chain: {}, faucet, origin }),
  )
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const req = async (token, body, from = origin) => {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/api/keeper/gas-faucet`,
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
    assert.equal((await req(null, {})).status, 401)
    assert.equal(
      (await req(login.token, {}, 'https://attacker.test')).status,
      403,
    )
    assert.equal(
      (
        await req(login.token, {
          address: '0x9999999999999999999999999999999999999999',
        })
      ).status,
      409,
    )
    const allowed = await req(login.token, { address: keeper.address })
    assert.equal(allowed.status, 200)
    assert.equal(store.faucet.latest(keeper).address, keeper.address)
    assert.equal(store.faucet.latest(keeper).amount, '2000000000000000')
    const again = await req(login.token, { address: keeper.address })
    assert.equal(again.data.id, allowed.data.id)
    const view = await req(login.token)
    assert.equal(view.data.claim.status, 'queued')
    assert.ok(!('raw' in view.data.claim))
    assert.ok(!('privateKey' in view.data))
  } finally {
    await new Promise((resolve) => server.close(resolve))
    store.close()
  }
})
