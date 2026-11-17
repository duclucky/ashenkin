const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { settlementRouter } = require('../routes/settlement')

const handles = [1, 2, 3].map(n => `0x${String(n).repeat(64)}`)
const hash = `0x${'a'.repeat(64)}`
const body = { world: 'v2', kind: 'battle', id: 7, handles }

async function withServer(sponsor, exercise) {
  const app = express()
  app.use('/api/settlement', settlementRouter(sponsor))
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  const submit = data => fetch(`http://127.0.0.1:${server.address().port}/api/settlement`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })
  try { await exercise(submit) } finally { await new Promise(resolve => server.close(resolve)) }
}

test('an unfunded server returns an explicit disabled response', async () => {
  await withServer(null, async submit => assert.equal((await submit(body)).status, 501))
})

test('uses only the deployed contract and chain handles, and shares a single in-flight submission', async () => {
  let reads = 0
  let proofs = 0
  let writes = 0
  await withServer({
    read: async call => {
      reads++
      assert.equal(call.address, require('./chimera.v2.json').addresses.ChimeraColosseum)
      assert.deepEqual(call.args, [7n])
      return [{ status: 1 }, handles]
    },
    prove: async values => {
      proofs++
      assert.deepEqual(values, handles)
      return { abiEncodedClearValues: '0x01', decryptionProof: '0x02' }
    },
    send: async call => {
      writes++
      assert.equal(call.functionName, 'settle')
      assert.deepEqual(call.args, [7n, '0x01', '0x02'])
      await new Promise(resolve => setTimeout(resolve, 30))
      return hash
    },
  }, async submit => {
    const otherHandles = [hash, ...handles.slice(1)]
    assert.equal((await submit({ ...body, handles: otherHandles })).status, 409)
    assert.equal(proofs, 0)
    const response = await Promise.all([submit(body), submit(body)])
    for (const r of response) assert.deepEqual(await r.json(), { hash })
    assert.equal((await submit({ ...body, address: hash })).status, 400)
    assert.equal(proofs, 1)
    assert.equal(writes, 1)
    assert.ok(reads >= 2)
  })
})

test('a stale training round cannot spend the sponsor budget after a new round starts', async () => {
  let reads = 0
  let writes = 0
  await withServer({
    read: async () => [{ pending: true }, 0, reads++ === 0 ? handles[0] : handles[1]],
    prove: async () => ({ abiEncodedClearValues: '0x01', decryptionProof: '0x02' }),
    send: async () => { writes++; return hash },
  }, async submit => {
    assert.equal((await submit({ ...body, kind: 'training', handles: handles.slice(0, 1) })).status, 409)
    assert.equal(writes, 0)
  })
})

test('a temporary proof failure can recover without a second signed transaction', async () => {
  let requests = 0
  let writes = 0
  await withServer({
    read: async () => [{ status: 1 }, handles],
    prove: async () => {
      if (++requests === 1) throw Object.assign(new Error('Proof temporarily unavailable'), { status: 503 })
      return { abiEncodedClearValues: '0x01', decryptionProof: '0x02' }
    },
    send: async () => { writes++; return hash },
  }, async submit => {
    const result = await submit(body)
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), { hash })
    assert.equal(requests, 2)
    assert.equal(writes, 1)
  })
})
