const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { createNftRouter } = require('../routes/nft')
const v2Lab = require('./chimera.v2.json').addresses.ChimeraLab

const handles = Array.from({ length: 8 }, (_, i) => `0x${String(i + 1).repeat(64)}`)
const traits = [12, 4, 12, 3, 8, 0, 15]
const origin = 'https://chimera.example'

async function withApi(decrypt, inspect, creature = {}) {
  const reader = {
    async readContract({ address, functionName }) {
      switch (functionName) {
        case 'getCreature':
          return { parentA: address === v2Lab ? 2 : 0, parentB: address === v2Lab ? 5 : 0, generation: address === v2Lab ? 1 : 0, wild: false, bornAt: 1735689600n, breeds: 1, certified: false, chimera: false, ...creature }
        case 'getPhenotypeHandles': return handles
        case 'getProfile': return [{ level: 5, xp: 12 }, 1]
        default: throw new Error(`Unexpected read ${functionName}`)
      }
    },
  }
  const app = express()
  const router = createNftRouter({ reader, decrypt, origin })
  app.use('/api/ashenkin-nft', router)
  app.use('/api/nft', router)
  app.use('/api/nft-v2', router)
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  try {
    await inspect(path => fetch(`http://127.0.0.1:${server.address().port}${path}`))
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('metadata distinguishes worlds, shows parents and requests only the seven public phenotype values', async () => {
  let decryptions = 0
  await withApi(async requested => {
    decryptions++
    assert.deepEqual(requested, handles.slice(0, 7))
    return traits
  }, async get => {
    const [response, image, legacy, release] = await Promise.all([
      get('/api/nft-v2/7.json'), get('/api/nft-v2/7/image.svg'), get('/api/nft/7'), get('/api/ashenkin-nft/7'),
    ])
    assert.equal(response.status, 200)
    assert.equal(image.status, 200)
    const nft = await response.json()
    const old = await legacy.json()
    const current = await release.json()
    const fields = Object.fromEntries(nft.attributes.map(({ trait_type, value }) => [trait_type, value]))
    assert.equal(fields['Parent A'], 2)
    assert.equal(fields['Parent B'], 5)
    assert.equal(fields['Hatched'], 1735689600)
    assert.equal(fields.Origin, 'Bred')
    assert.equal(fields.Element, 'Sealed')
    assert.equal(fields['Hidden alleles'], 'Sealed')
    assert.equal(fields.Evolution, 'Ascended')
    assert.equal(fields.Level, 5)
    assert.equal(nft.image, `${origin}/api/nft-v2/7/image.svg`)
    assert.equal(nft.external_url, `${origin}/?world=v2#/creature/7`)
    assert.equal(old.image, `${origin}/api/nft/7/image.svg`)
    assert.equal(old.external_url, `${origin}/?world=original#/creature/7`)
    assert.equal(current.image, `${origin}/api/ashenkin-nft/7/image.svg`)
    assert.equal(current.external_url, `${origin}/#/creature/7`)
    assert.ok(old.attributes.every(field => field.trait_type !== 'Parent A'))
    assert.equal(nft.image_data, await image.text())
    assert.equal(decryptions, 3)
  })
})

test('a transient Zama error signals retry instead of serving and caching an egg', async () => {
  let attempts = 0
  await withApi(async () => {
    if (++attempts === 1) throw new Error('KMS is temporarily unavailable')
    return traits
  }, async get => {
    const first = await get('/api/nft-v2/7')
    assert.equal(first.status, 503)
    assert.equal(first.headers.get('cache-control'), 'no-store')
    assert.ok(first.headers.get('retry-after'))
    const next = await get('/api/nft-v2/7')
    assert.equal(next.status, 200)
    assert.notEqual((await next.json()).name, 'Specimen #7')
  })
})

test('an earned rare title appears in metadata while genome and element stay sealed', async () => {
  await withApi(async requested => {
    assert.deepEqual(requested, handles.slice(0, 7))
    return [12, 13, 14, 15, 12, 11, 0]
  }, async get => {
    const response = await get('/api/ashenkin-nft/7')
    assert.equal(response.status, 200)
    const nft = await response.json()
    const fields = Object.fromEntries(nft.attributes.map(({ trait_type, value }) => [trait_type, value]))
    assert.equal(fields['Rare lineage'], 'Verified')
    assert.equal(fields.Element, 'Sealed')
    assert.equal(fields['Hidden alleles'], 'Sealed')
  }, { chimera: true })
})

test('five rare looks without an onchain claim never advertise a verified title', async () => {
  await withApi(async () => [12, 13, 14, 15, 12, 11, 0], async get => {
    const response = await get('/api/ashenkin-nft/7')
    const nft = await response.json()
    assert.equal(response.status, 200)
    assert.equal(nft.attributes.some(field => field.trait_type === 'Rare lineage'), false)
  })
})
