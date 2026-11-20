const { Router, json } = require('express')
const { setTimeout: delay } = require('node:timers/promises')
const { parseAbi } = require('viem')
const { SponsorBusyError } = require('../lib/sponsor-lane')
const worlds = {
  ashenkin: require('../lib/ashenkin.json').addresses,
  v1: require('../lib/chimera.json').addresses,
  v2: require('../lib/chimera.v2.json').addresses,
}
const definitions = {
  battle: {
    contract: 'ChimeraColosseum', view: 'getBattle', write: 'settle', count: 3,
    abi: parseAbi([
      'struct Battle { uint8 kind; uint8 status; bool challengerWon; uint8 rounds; uint32 challengerId; uint32 opponentId; address challenger; address opponent; uint64 startedAt; }',
      'function getBattle(uint256 battleId) view returns (Battle, bytes32[3])',
      'function settle(uint256 battleId, bytes cleartexts, bytes proof)',
    ]),
    pending: ([record, handles]) => record.status === 1 ? handles : [],
  },
  egg: {
    contract: 'ChimeraLab', view: 'getEgg', write: 'hatchEgg', count: 1,
    abi: parseAbi([
      'struct Egg { address keeper; uint32 parentA; uint32 parentB; uint16 generation; uint8 status; uint64 fee; uint64 laidAt; }',
      'function getEgg(uint256 eggId) view returns (Egg, bytes32)',
      'function hatchEgg(uint256 eggId, bytes cleartexts, bytes proof)',
    ]),
    pending: ([record, handle]) => record.status === 1 ? [handle] : [],
  },
  training: {
    contract: 'ChimeraTraining', view: 'getProfile', write: 'completeTraining', count: 1,
    abi: parseAbi([
      'struct Profile { uint32 xp; uint8 level; bool pending; uint16 trainings; uint64 trainedAt; address keeper; uint32 spentXp; uint64 fee; }',
      'function getProfile(uint256 id) view returns (Profile, uint8, bytes32, bytes32)',
      'function completeTraining(uint256 creatureId, bytes cleartexts, bytes proof)',
    ]),
    pending: ([record, , handle]) => record.pending ? [handle] : [],
  },
}

const MAX_ACTIVE = 4
const MAX_RECENT = 128
const RETAIN_MS = 5 * 60_000
const HANDLE = /^0x(?!0{64}$)[0-9a-f]{64}$/i
const PROOF_TIMEOUT_MS = 50_000

function mayRetryProof(error) {
  for (let cause = error, depth = 0; cause && depth < 5; cause = cause.cause, depth++) {
    const status = cause.status ?? cause.statusCode
    if ([400, 401, 403, 422].includes(status) || /InvalidProof|InvalidType|HandleError|AbortError/.test(cause.name ?? '')) return false
  }
  return true
}

async function proveWithRetry(prove, signal) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try { return await prove() } catch (error) {
      if (attempt >= 2 || !mayRetryProof(error)) throw error
      await delay(1000 * (attempt + 1), undefined, { signal })
    }
  }
}

function failureReason(error) {
  for (let cause = error, depth = 0; cause && depth < 8; cause = cause.cause, depth++) {
    const message = String(cause.shortMessage || cause.message || '')
    if (/replacement transaction underpriced|replacement fee too low/i.test(message)) return 'nonce-replacement-underpriced'
    if (/nonce too low/i.test(message)) return 'nonce-too-low'
    if (/outside the sponsor budget/i.test(message)) return 'sponsor-budget'
  }
  return 'submission-unknown'
}

function settlementRouter(sponsor) {
  const router = Router()
  const active = new Map()
  const recent = new Map()

  router.post('/', json({ limit: '1kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store')
    if (!sponsor) return res.status(501).json({ code: 'DISABLED' })
    const { world, kind, id, handles, ...extra } = req.body || {}
    if (typeof world !== 'string' || !Object.hasOwn(worlds, world) || typeof kind !== 'string' || !Object.hasOwn(definitions, kind)
      || !Number.isSafeInteger(id) || id < 1 || Object.keys(extra).length) {
      return res.status(400).json({ code: 'INVALID_JOB' })
    }
    const definition = definitions[kind]
    if (!Array.isArray(handles) || handles.length !== definition.count || !handles.every(h => typeof h === 'string' && HANDLE.test(h))) {
      return res.status(400).json({ code: 'INVALID_HANDLES' })
    }
    const expected = handles.map(h => h.toLowerCase())
    const address = worlds[world][definition.contract]
    const key = `${address}:${kind}:${id}:${expected.join(',')}`
    const cached = recent.get(key)
    if (cached?.until > Date.now()) return res.json({ hash: cached.hash })
    recent.delete(key)
    if (!active.has(key)) {
      if (active.size >= MAX_ACTIVE) return res.status(429).json({ code: 'BUSY' })
      const pending = submit(address, definition, BigInt(id), expected).then(hash => {
        if (!hash) return null
        if (recent.size >= MAX_RECENT) recent.delete(recent.keys().next().value)
        recent.set(key, { hash, until: Date.now() + RETAIN_MS })
        if (sponsor.wait) void sponsor.wait(hash).then(status => {
          if (status === 'reverted' && recent.get(key)?.hash === hash) recent.delete(key)
        }).catch(() => {})
        return hash
      }).finally(() => active.delete(key))
      active.set(key, pending)
    }
    try {
      const hash = await active.get(key)
      return hash ? res.json({ hash }) : res.status(409).json({ code: 'CHANGED' })
    } catch (error) {
      const busy = error instanceof SponsorBusyError
      // Keep provider payloads, proofs and credentials out of operational logs.
      console.warn(JSON.stringify({ event: 'settlement-refused', world, kind, id,
        reason: busy ? 'sponsor-busy-before-signing' : failureReason(error) }))
      if (busy) return res.set('Retry-After', '15').status(429).json({ code: 'SPONSOR_BUSY' })
      return res.status(503).json({ code: 'UNAVAILABLE' })
    }
  })

  async function submit(address, definition, id, expected) {
    const { abi, view, write, pending } = definition
    const input = { address, abi, functionName: view, args: [id] }
    const current = async () => pending(await sponsor.read(input)).map(h => h.toLowerCase())
    const matches = handles => handles.length === expected.length && handles.every((h, index) => h === expected[index])
    const handles = await current()
    if (!matches(handles)) return null
    const deadline = new AbortController()
    let timer
    let proof
    try {
      proof = await Promise.race([
        proveWithRetry(() => sponsor.prove(handles), deadline.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error('Zama proof timed out.')
            deadline.abort(error)
            reject(error)
          }, PROOF_TIMEOUT_MS)
        }),
      ])
    } finally { clearTimeout(timer) }
    if (!matches(await current())) return null
    return sponsor.send({ address, abi, functionName: write, args: [id, proof.abiEncodedClearValues, proof.decryptionProof] })
  }

  return router
}

module.exports = { settlementRouter }
