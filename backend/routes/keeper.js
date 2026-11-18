const { mkdirSync } = require('node:fs')
const path = require('node:path')
const { Router, json } = require('express')
const { getAddress, isAddress, isAddressEqual } = require('viem')
const { createSiweMessage } = require('viem/siwe')
const { sepolia } = require('viem/chains')
const { keeperStore, problem } = require('../lib/keeper-store')
const { circleKeepers } = require('../lib/circle-keepers')
const { keeperChain, gameCall, labKeyData, lab, hatchData } = require('../lib/keeper-chain')
const { CONSENT } = require('../lib/patrol')
const { productionLife } = require('../lib/life-chain')
const { productionFaucet } = require('../lib/gas-faucet')

const MINUTE = 60_000
const EMAIL = /^[^\s@<>]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,187}[a-z0-9])?\.[a-z]{2,24}$/i
const PROOF = /^[a-f0-9]{48}$/
const SIGNATURE = /^0x[0-9a-f]{2,8192}$/i
const UUID = /^[a-f0-9-]{36}$/i

function productionKeeper(env = process.env) {
  const circle = circleKeepers(env)
  if (!circle) return null
  const { ASHENKIN_AUTH_SECRET: secret, ASHENKIN_SMTP_URL: smtpUrl, ASHENKIN_EMAIL_FROM: from } = env
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Ashenkin login needs a server-only authentication secret of at least 32 bytes.')
  const origin = env.ASHENKIN_AUTH_ORIGIN || env.PUBLIC_ORIGIN
  if (!origin) throw new Error('Ashenkin login needs its public origin.')
  const file = path.resolve(__dirname, '..', env.ASHENKIN_KEEPER_DB_FILE || 'db/keepers.sqlite')
  mkdirSync(path.dirname(file), { recursive: true })
  const store = keeperStore(file, secret)
  const chain = keeperChain(store, env)
  let sendCode = null
  if (smtpUrl && from) {
    const transport = require('nodemailer').createTransport(smtpUrl, { connectionTimeout: 10_000, socketTimeout: 15_000 })
    sendCode = (to, code) => transport.sendMail({
      from, to: [{ address: to, name: '' }], subject: 'Your Ashenkin sign-in code',
      text: `Your Ashenkin sign-in code is ${code}. It expires in 5 minutes. If you did not request a code, ignore this email.`,
    })
  }
  const config = { store, circle, chain, origin, sendCode }
  config.life = productionLife(store, env)
  config.faucet = productionFaucet(store, env)
  return config
}

function keeperRouter(config) {
  const router = Router()
  const catchRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next)
  const post = (route, fn) => router.post(route, catchRoute(fn))
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  if (!config) {
    router.get('/', (_req, res) => res.json({ enabled: false, email: false, sponsored: false }))
    router.use((_req, res) => res.status(503).json({ error: 'Ashenkin sign-in is unavailable.' }))
    return router
  }

  const { store, circle, chain, sendCode } = config
  const origin = new URL(config.origin)
  const secure = origin.protocol === 'https:'
  if (!secure && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    throw new Error('Ashenkin sign-in requires HTTPS for a public origin.')
  }
  const cookie = secure ? '__Host-ash-keeper' : 'ash-keeper-local'
  const options = { httpOnly: true, sameSite: 'lax', secure, path: '/' }
  const flights = new Map()
  function share(key, work) {
    if (!flights.has(key)) flights.set(key, Promise.resolve().then(work).finally(() => flights.delete(key)))
    return flights.get(key)
  }
  const token = req => req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookie}=`))?.slice(cookie.length + 1)
  const session = req => store.session(token(req))
  function requireKeeper(req, address = req.body?.address) {
    const keeper = session(req)
    if (!keeper?.address) throw problem(401, 'Sign in to your Ashenkin account.')
    if (address != null && (!isAddress(address) || !isAddressEqual(address, keeper.address))) {
      throw problem(409, 'The active game wallet changed. Refresh and try again.')
    }
    return keeper
  }
  const view = keeper => ({
    enabled: true, email: !!sendCode, sponsored: chain.sponsored,
    signedIn: !!keeper, address: keeper?.address ?? null, method: keeper?.identity.split(':', 1)[0] ?? null,
  })
  const done = (req, res, identity) => {
    store.logout(token(req))
    const created = store.openSession(identity)
    res.cookie(cookie, created.token, { ...options, maxAge: created.maxAge })
    res.json(view(created.keeper))
  }

  router.use((req, _res, next) => {
    if (req.method === 'POST' && req.get('origin') !== origin.origin) return next(problem(403, 'Invalid request origin.'))
    next()
  }, json({ limit: '20kb' }))
  router.get('/', (req, res) => res.json(view(session(req))))

  post('/email/start', async (req, res) => {
    if (!sendCode) throw problem(503, 'Email sign-in is unavailable.')
    const email = typeof req.body?.email === 'string' && req.body.email.trim().toLowerCase()
    if (!email || !EMAIL.test(email) || email.length > 254) throw problem(400, 'Enter a valid email address.')
    store.rate(`email-ip:${req.ip}`, 30, 10 * MINUTE)
    store.rate(`email-address:${email}`, 4, 10 * MINUTE)
    const { id, code } = store.emailChallenge(email)
    await sendCode(email, code)
    res.json({ id })
  })
  post('/email/finish', (req, res) => {
    store.rate(`verify-ip:${req.ip}`, 100, 10 * MINUTE)
    const { id, code } = req.body ?? {}
    const challenge = typeof id === 'string' && PROOF.test(id) && store.getChallenge(id)
    if (!challenge || !challenge.identity.startsWith('email:') || typeof code !== 'string' ||
        !/^\d{8}$/.test(code) || !store.checkEmail(challenge, code) || !store.consume(id)) {
      throw problem(401, 'The email code is invalid or expired.')
    }
    done(req, res, challenge.identity)
  })

  post('/wallet/start', (req, res) => {
    const address = req.body?.address
    if (typeof address !== 'string' || !isAddress(address)) throw problem(400, 'Invalid wallet address.')
    store.rate(`wallet-ip:${req.ip}`, 60, 10 * MINUTE)
    const { id, proof } = store.challenge(`wallet:${address.toLowerCase()}`, (nonce, expires) => createSiweMessage({
      address: getAddress(address), chainId: sepolia.id, domain: origin.host, uri: origin.origin,
      version: '1', nonce, expirationTime: new Date(expires),
      statement: 'Sign in to Ashenkin. This login does not authorize a transaction.',
    }))
    res.json({ id, message: proof })
  })
  post('/wallet/finish', async (req, res) => {
    store.rate(`verify-ip:${req.ip}`, 100, 10 * MINUTE)
    const { id, signature } = req.body ?? {}
    const challenge = typeof id === 'string' && PROOF.test(id) && store.getChallenge(id)
    if (!challenge || !challenge.identity.startsWith('wallet:') || typeof signature !== 'string' || !SIGNATURE.test(signature)) {
      throw problem(401, 'Wallet sign-in expired. Try again.')
    }
    const ok = await chain.verifyMessage({
      address: getAddress(challenge.identity.slice(7)), message: challenge.proof, signature,
    }).catch(() => false)
    if (!ok || !store.consume(id)) throw problem(401, 'Wallet sign-in could not be verified.')
    done(req, res, challenge.identity)
  })

  post('/provision', async (req, res) => {
    const keeper = session(req)
    if (!keeper) throw problem(401, 'Verify your sign-in first.')
    if (keeper.address) return res.json(view(keeper))
    store.rate(`provision:${keeper.id}`, 8, 10 * MINUTE)
    const ready = await share(`keeper:${keeper.id}`, async () => store.setWallet(keeper, await circle.create(keeper)))
    res.json(view(ready))
  })
  post('/logout', (req, res) => {
    store.logout(token(req))
    res.clearCookie(cookie, options).json(view(null))
  })

  async function submit(keeper, call, { starter = false } = {}) {
    const fingerprint = `${call.address.toLowerCase()}:${call.data}`
    return share(`tx:${keeper.id}:${fingerprint}`, () => store.exclusive(keeper, async () => {
      config.patrol?.guard(keeper, call)
      let request = store.pending(keeper, fingerprint)
      if (request?.circle_id) {
        const info = await circle.status(keeper, request.circle_id)
        store.updateTx(request.id, info)
        if (!info.done || (starter && !info.failed)) return { id: request.id }
        request = null
      }
      if (starter) {
        const latest = store.latest(keeper, fingerprint)
        if (latest?.hash && ['CLEARED', 'CONFIRMED', 'COMPLETE'].includes(latest.status)) return { id: latest.id }
        await chain.fund(keeper)
      }
      request ??= store.beginTx(keeper, fingerprint)
      try {
        const result = await circle.execute(keeper, request, call, starter ? await chain.starterFee(keeper) : undefined)
        store.updateTx(request.id, result)
        console.info(JSON.stringify({
          event: 'keeper-transaction-submitted', at: new Date().toISOString(),
          requestId: request.id, wallet: keeper.address, destination: call.address,
          method: call.name ?? 'hatchGenesis', circleId: result.circleId, state: result.status,
        }))
        return { id: request.id }
      } catch (error) {
        const response = error.error?.response?.data ?? error.response?.data
        console.error(JSON.stringify({
          event: 'keeper-transaction-error', at: new Date().toISOString(),
          requestId: request.id, keeperId: keeper.id, wallet: keeper.address,
          destination: call.address, method: call.name ?? (starter ? 'hatchGenesis' : undefined),
          status: error.status ?? error.error?.response?.status ?? error.response?.status, circleCode: response?.code,
          reasons: Array.isArray(response?.errors) ? response.errors.map(item => item.error).filter(item => typeof item === 'string' && /^[a-z_]+$/i.test(item)).slice(0, 5) : undefined,
        }))
        // An ambiguous network error keeps the original idempotency key for retry.
        const status = error.status ?? error.error?.response?.status ?? error.response?.status
        if (status === 400 || status === 422) {
          store.updateTx(request.id, { status: 'FAILED', done: true })
          throw problem(409, 'Circle could not submit this action. Check the game wallet’s Sepolia ETH and try again.')
        }
        throw error
      }
    }))
  }

  post('/starter', async (req, res) => {
    const keeper = requireKeeper(req)
    store.rate(`starter:${keeper.id}`, 10, 10 * MINUTE)
    const [owned, claimed] = await chain.metrics(keeper.address)
    if (owned > 0n) return res.json({ owned: true })
    if (claimed > 0n) throw problem(409, 'You already minted a starter. Check your collection or recover a specimen from the game.')
    res.json(await submit(keeper, { address: lab, data: hatchData }, { starter: true }))
  })
  post('/transactions', async (req, res) => {
    const keeper = requireKeeper(req)
    const call = gameCall(keeper.address, req.body?.destination, req.body?.data)
    store.rate(`tx:${keeper.id}`, 90, 60 * MINUTE)
    const [owned, claimed] = await chain.metrics(keeper.address)
    if (!owned && !claimed) throw problem(403, 'Mint a starter NFT before playing.')
    res.json(await submit(keeper, call))
  })
  router.get('/transactions/:id', catchRoute(async (req, res) => {
    const keeper = requireKeeper(req, req.query.address)
    const tx = UUID.test(req.params.id) && store.tx(keeper, req.params.id)
    if (!tx?.circle_id) throw problem(404, 'Game transaction not found.')
    const info = await circle.status(keeper, tx.circle_id)
    store.updateTx(tx.id, info)
    if (!tx.done && info.done) console.info(JSON.stringify({
      event: 'keeper-transaction-finished', at: new Date().toISOString(),
      requestId: tx.id, wallet: keeper.address, circleId: tx.circle_id,
      hash: info.hash, state: info.status, failed: info.failed,
    }))
    res.json({ hash: info.hash, state: info.status, failed: info.failed, ...(info.retryable ? { retryable: true } : {}) })
  }))
  router.get('/gas-faucet', catchRoute(async (req, res) => {
    const keeper = requireKeeper(req, req.query.address)
    res.json(config.faucet ? await config.faucet.view(keeper) : { enabled: false })
  }))
  post('/gas-faucet', async (req, res) => {
    const keeper = requireKeeper(req)
    if (!config.faucet) throw problem(409, 'The Sepolia faucet is not available yet.')
    store.rate(`gas-faucet:${keeper.id}`, 15, MINUTE)
    res.json(await config.faucet.claim(keeper))
  })

  post('/lab-key', async (req, res) => {
    const keeper = requireKeeper(req)
    store.rate(`lab:${keeper.id}`, 10, 10 * MINUTE)
    res.json({ signature: await circle.signLabKey(keeper, labKeyData(req.body)) })
  })

  router.get('/patrols', catchRoute((req, res) => {
    const keeper = requireKeeper(req, req.query.address)
    res.json({ enabled: !!config.patrol, consent: CONSENT, jobs: config.patrol?.list(keeper) || [] })
  }))
  post('/patrols', async (req, res) => {
    const keeper = requireKeeper(req)
    if (!config.patrol) throw problem(409, 'Offline patrols are not available in this world.')
    store.rate(`patrol:${keeper.id}`, 12, 60 * MINUTE)
    res.json(await config.patrol.start(keeper, req.body))
  })
  post('/patrols/:id/stop', (req, res) => {
    const keeper = requireKeeper(req)
    if (!config.patrol) throw problem(409, 'Offline patrols are not available in this world.')
    res.json(config.patrol.stop(keeper, req.params.id))
  })

  const nftParam = req => {
    const id = Number(req.params.nft)
    if (!/^[1-9]\d*$/.test(req.params.nft) || !Number.isSafeInteger(id)) throw problem(400, 'Invalid specimen.')
    return id
  }
  async function livingOwner(req) {
    const keeper = requireKeeper(req, req.method === 'GET' ? req.query.address : req.body?.address)
    if (!config.life) throw problem(409, 'Living encounters are not active on this server yet.')
    const id = nftParam(req)
    const owner = await config.life.chain.owner(id)
    if (!isAddressEqual(owner, keeper.address)) throw problem(403, 'This specimen is not in your game wallet.')
    return { keeper, id }
  }
  router.get('/journey', catchRoute((req, res) => {
    const keeper = requireKeeper(req, req.query.address)
    res.json({ enabled: !!config.life, ...store.journey.state(keeper) })
  }))
  post('/journey/life', async (req, res) => {
    const keeper = requireKeeper(req)
    if (!config.life) throw problem(409, 'Living Xenos is not open yet.')
    if (!(await config.life.chain.owned(keeper.address)).length) throw problem(409, 'Mint or recover your Xeno first.')
    store.journey.introduce(keeper)
    res.json(store.journey.state(keeper))
  })
  router.get('/life', catchRoute(async (req, res) => {
    const keeper = requireKeeper(req, req.query.address)
    if (!config.life) return res.json({ enabled: false, specimens: [] })
    const ids = await config.life.chain.owned(keeper.address)
    const offset = Number(req.query.offset || 0)
    if (!Number.isSafeInteger(offset) || offset < 0) throw problem(400, 'Invalid collection offset.')
    res.json({ enabled: true, specimens: ids.slice(offset, offset + 100), nextOffset: ids.length > offset + 100 ? offset + 100 : null, unread: store.journey.summary(keeper, config.life.world, ids) })
  }))
  router.get('/life/:nft', catchRoute(async (req, res) => {
    const { keeper, id } = await livingOwner(req)
    const data = await config.life.view(id)
    data.history = data.history.map(row => ({ ...row, seen: store.journey.seen(keeper, config.life.world, id, row.day) }))
    res.json(data)
  }))
  post('/life/:nft/seen', async (req, res) => {
    const { keeper, id } = await livingOwner(req)
    const day = req.body?.day
    if (!Number.isSafeInteger(day) || day < 1) throw problem(400, 'Invalid story day.')
    store.journey.mark(keeper, config.life.world, id, day)
    res.json({ seen: true })
  })
  router.get('/life/:nft/proof/:day', catchRoute(async (req, res) => {
    const { id } = await livingOwner(req)
    const day = Number(req.params.day)
    if (!Number.isSafeInteger(day) || day < 1) throw problem(400, 'Invalid encounter day.')
    const proof = config.life.proof(day, id)
    if (!proof) throw problem(404, 'Encounter proof not found.')
    res.json(proof)
  }))
  for (const action of ['craft', 'equip']) post(`/life/:nft/${action}`, async (req, res) => {
    const { keeper, id } = await livingOwner(req)
    store.rate(`life:${keeper.id}`, 40, MINUTE)
    if (action === 'craft') config.life.craft(id, req.body?.recipe)
    else config.life.equip(id, req.body?.item)
    res.json(await config.life.view(id))
  })

  router.use((error, _req, res, _next) => {
    if (error.status && error.expose !== false && !error.isAxiosError && error.status < 500) {
      return res.status(error.status).json({ error: error.type ? 'Invalid request.' : error.message })
    }
    if (error.status && !error.isAxiosError && error.status === 503 && error.message.startsWith('Starter')) {
      return res.status(503).json({ error: error.message })
    }
    res.status(503).json({ error: 'Ashenkin could not complete this request. Please try again.' })
  })
  return router
}

module.exports = { keeperRouter, productionKeeper }
