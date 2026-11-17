const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { beaconScout } = require('../routes/beacon')

test('only a viable Ashen Dunes route finds the clue, without creating a reward', async () => {
  const app = express()
  app.use('/api/beacon/scout', beaconScout)
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  const submit = (route) => fetch(`http://127.0.0.1:${server.address().port}/api/beacon/scout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route }),
  })
  try {
    const [wrong, right, invalid] = await Promise.all([
      submit(['tracks', 'road']),
      submit(['tracks', 'ridge']),
      submit(['ridge', 'tracks']),
    ])
    assert.equal(wrong.status, 200)
    assert.deepEqual(await wrong.json(), { found: false })
    assert.equal(right.status, 200)
    assert.deepEqual(await right.json(), { found: true })
    assert.equal(invalid.status, 400)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
