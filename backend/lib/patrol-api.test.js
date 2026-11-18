const assert = require('node:assert/strict')
const { once } = require('node:events')
const { test } = require('node:test')
const express = require('express')
const { keeperStore } = require('./keeper-store')
const { keeperRouter } = require('../routes/keeper')
const { patrolService, CONSENT } = require('./patrol')

test('patrol endpoints require same-origin consent, owner session and an owned available NFT', async () => {
  const origin = 'http://localhost:5173', store = keeperStore(':memory:', 'test-secret')
  const first = store.openSession('email:one@example.com'), second = store.openSession('email:two@example.com')
  const keeper = store.setWallet(first.keeper, { id: 'circle-1', address: '0x7777777777777777777777777777777777777777' })
  store.setWallet(second.keeper, { id: 'circle-2', address: '0x8888888888888888888888888888888888888888' })
  const circle = {}, chain = { sponsored: false }, patrolChain = {
    check: async (who, id) => {
      if (id !== 12 || who.id !== keeper.id) throw Object.assign(new Error('Not your NFT'), { status: 409 })
      return { runs: 0, max: 6, duration: 600, approved: false }
    },
  }
  const patrol = patrolService({ store, circle, patrolChain })
  const app = express()
  app.use('/api/keeper', keeperRouter({ store, circle, chain, patrol, origin }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const request = async (route, token, body, from = origin) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/keeper/${route}`, {
      headers: { cookie: token ? `ash-keeper-local=${token}` : '', origin: from, 'content-type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, data: await res.json() }
  }
  const input = { creatureId: 12, zone: 0, trips: 1, budget: '0.01', consent: CONSENT }
  try {
    assert.equal((await request('patrols')).status, 401)
    assert.equal((await request('patrols', first.token, input, 'https://attacker.test')).status, 403)
    assert.equal((await request('patrols', first.token, { ...input, consent: null })).status, 400)
    assert.equal((await request('patrols', second.token, input)).status, 409)
    const started = await request('patrols', first.token, input)
    assert.equal(started.status, 200)
    assert.equal((await request('patrols', second.token)).data.jobs.length, 0)
    assert.equal((await request(`patrols/${started.data.id}/stop`, second.token, {})).status, 404)
    assert.equal((await request('patrols', first.token, input)).status, 409)
    assert.equal((await request(`patrols/${started.data.id}/stop`, first.token, {})).data.stopped, true)
    store.logout(first.token)
    assert.equal(patrol.list(keeper)[0].active, true)
    await patrol.tick()
    assert.equal(patrol.list(keeper)[0].active, false)
  } finally { await new Promise(resolve => server.close(resolve)); store.close() }
})
