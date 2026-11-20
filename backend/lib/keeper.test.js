const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { once } = require('node:events')
const { test } = require('node:test')
const express = require('express')
const { encodeFunctionData, parseAbi, verifyMessage } = require('viem')
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts')
const { keeperRouter } = require('../routes/keeper')
const { keeperStore } = require('./keeper-store')
const { gameCall, labKeyData, lab, hatchData, keeperChain } = require('./keeper-chain')
const { circleKeepers } = require('./circle-keepers')

const origin = 'http://localhost:5173'
const address = '0x7777777777777777777777777777777777777777'
const hash = `0x${'42'.repeat(32)}`
const seq = encodeFunctionData({ abi: parseAbi(['function sequence(uint256,uint8)']), functionName: 'sequence', args: [1n, 0] })

async function fixture(exercise) {
  const app = express()
  const store = keeperStore(':memory:', randomUUID())
  const codes = new Map()
  const wallets = new Map()
  const transactions = new Map()
  const owned = new Set()
  let grants = 0
  let creates = 0
  const circle = {
    async create(keeper) {
      creates++
      const wallet = { id: randomUUID(), address: `0x${String(creates).padStart(40, '0')}` }
      wallets.set(keeper.identity, wallet)
      return wallet
    },
    async execute(keeper, request, call) {
      assert.equal(keeper.address, wallets.get(keeper.identity).address)
      const result = { circleId: randomUUID(), status: 'INITIATED' }
      transactions.set(result.circleId, { keeper: keeper.id, request: request.id, call, address: keeper.address })
      return result
    },
    async status(keeper, circleId) {
      const tx = transactions.get(circleId)
      assert.equal(tx.keeper, keeper.id)
      if (tx.call.data === hatchData) owned.add(tx.address)
      return { status: 'CONFIRMED', hash, done: true, failed: false }
    },
  }
  const chain = {
    sponsored: true, verifyMessage, metrics: async address => owned.has(address) ? [1n, 1n] : [0n, 0n],
    fund: async () => { grants++ }, starterFee: () => undefined,
  }
  app.use('/api/keeper', keeperRouter({ store, circle, chain, origin, sendCode: async (email, code) => codes.set(email, code) }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  async function request(route = '', { body, cookie = '', from = origin } = {}) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/keeper${route ? `/${route}` : ''}`, {
      headers: { origin: from, cookie, 'content-type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    await exercise({ request, codes, store, circle, stats: () => ({ creates, grants, transactions: transactions.size }) })
  } finally {
    await new Promise(resolve => server.close(resolve))
    store.close()
  }
}

test('wallet login verifies the challenge once and restores the same Circle wallet on a fresh session', async () => fixture(async ({ request, stats }) => {
  const player = privateKeyToAccount(generatePrivateKey())
  const attacker = privateKeyToAccount(generatePrivateKey())
  const challenge = async () => (await request('wallet/start', { body: { address: player.address } })).data
  const one = await challenge()
  assert.match(one.message, /localhost:5173/)
  const forged = await attacker.signMessage({ message: one.message })
  assert.equal((await request('wallet/finish', { body: { id: one.id, signature: forged } })).status, 401)
  const proof = { id: one.id, signature: await player.signMessage({ message: one.message }) }
  const login = await request('wallet/finish', { body: proof })
  assert.equal(login.status, 200)
  assert.equal((await request('wallet/finish', { body: proof })).status, 401)
  const [first, again] = await Promise.all([0, 1].map(() => request('provision', { body: {}, cookie: login.cookie })))
  assert.ok(first.data.address)
  assert.notEqual(first.data.address.toLowerCase(), player.address.toLowerCase())
  assert.equal(first.data.address, again.data.address)

  await request('logout', { body: {}, cookie: login.cookie })
  assert.equal((await request('', { cookie: login.cookie })).data.signedIn, false)
  const two = await challenge()
  const returning = await request('wallet/finish', { body: { id: two.id, signature: await player.signMessage({ message: two.message }) } })
  assert.equal(returning.data.address, first.data.address)
  assert.equal(stats().creates, 1)
}))

test('email proof, starter mint and wallet isolation are enforced on the API', async () => fixture(async ({ request, codes, stats }) => {
  assert.equal((await request('provision', { body: {} })).status, 401)
  assert.equal((await request('starter', { body: {} })).status, 401)
  assert.equal((await request('email/start', { body: { email: 'alpha@example.com' }, from: 'https://example.com' })).status, 403)
  async function emailLogin(email) {
    const { data } = await request('email/start', { body: { email } })
    const address = email.trim().toLowerCase()
    const wrong = codes.get(address) === '00000000' ? '11111111' : '00000000'
    assert.equal((await request('email/finish', { body: { id: data.id, code: wrong } })).status, 401)
    const signIn = await request('email/finish', { body: { id: data.id, code: codes.get(address) } })
    assert.equal(signIn.status, 200)
    const wallet = await request('provision', { body: {}, cookie: signIn.cookie })
    return { cookie: signIn.cookie, address: wallet.data.address }
  }
  const one = await emailLogin('Alpha@Example.com')
  const two = await emailLogin('beta@example.com')
  assert.notEqual(one.address, two.address)
  const again = await emailLogin('alpha@example.com')
  assert.equal(again.address, one.address)
  assert.equal(stats().creates, 2)
  const mint = { body: { address: one.address }, cookie: one.cookie }
  assert.equal((await request('transactions', { body: { address: one.address, destination: lab, data: seq }, cookie: one.cookie })).status, 403)
  assert.equal((await request('starter', { ...mint, cookie: two.cookie })).status, 409)
  const attempts = await Promise.all([request('starter', mint), request('starter', mint)])
  assert.equal(attempts[0].status, 200)
  assert.equal(attempts[0].data.id, attempts[1].data.id)
  assert.equal(stats().grants, 1)
  const path = `transactions/${attempts[0].data.id}`
  assert.equal((await request(path, { cookie: two.cookie })).status, 404)
  assert.equal((await request(path, { cookie: one.cookie })).data.hash, hash)
  assert.equal((await request('starter', mint)).data.owned, true)
  const action = await request('transactions', { body: { address: one.address, destination: lab, data: seq }, cookie: one.cookie })
  assert.equal(action.status, 200)
  assert.equal(stats().transactions, 2)
}))

test('a Circle wallet accepts only allowlisted gameplay calldata and Zama Lab keys', () => {
  assert.equal(gameCall(address, lab, seq).name, 'sequence')
  assert.throws(() => gameCall(address, address, seq), { status: 400 })
  const unsafe = encodeFunctionData({ abi: parseAbi(['function approve(address,uint256)']), functionName: 'approve', args: [address, 1n] })
  assert.throws(() => gameCall(address, lab, unsafe), { status: 400 })
  assert.throws(() => gameCall(address, lab, seq + '00'), { status: 400 })
  const key = labKeyData({ publicKey: '0x1234', start: Math.floor(Date.now() / 1000), days: 7 })
  assert.equal(key.domain.chainId, 11155111)
  assert.equal(key.primaryType, 'UserDecryptRequestVerification')
  assert.equal(key.message.contractAddresses.length, 10)
  assert.ok(key.message.contractAddresses.includes(lab.toLowerCase()))
  assert.throws(() => labKeyData({ publicKey: '0x1234', start: 0, days: 7 }), { status: 400 })
})

test('the Circle adapter provisions stable Sepolia EOA wallets and submits signed calldata using the stored wallet ID', async () => {
  const circleId = randomUUID()
  const requestId = randomUUID()
  const keeper = { id: randomUUID(), circle_id: circleId, address }
  const env = { CIRCLE_WALLET_SET_ID: randomUUID() }
  const client = {
    async estimateContractExecutionFee(input) {
      assert.equal(input.source.walletId, circleId)
      assert.equal(input.contractAddress, lab)
      assert.equal(input.callData, hatchData)
      return { data: { medium: { priorityFee: '0.02', maxFee: '0.03' }, high: { priorityFee: '0.04', maxFee: '0.05' } } }
    },
    async listWallets(input) { assert.equal(input.refId, keeper.id); return { data: { wallets: [] } } },
    async createWallets(input) {
      assert.equal(input.idempotencyKey, keeper.id)
      assert.equal(input.accountType, 'EOA')
      assert.deepEqual(input.blockchains, ['ETH-SEPOLIA'])
      return { data: { wallets: [{ id: circleId, address, blockchain: 'ETH-SEPOLIA', custodyType: 'DEVELOPER' }] } }
    },
    async createContractExecutionTransaction(input) {
      assert.equal(input.walletId, circleId)
      assert.equal(input.idempotencyKey, requestId)
      assert.equal(input.contractAddress, lab)
      assert.equal(input.callData, hatchData)
      assert.equal(input.fee.config.gasLimit, '150000')
      if (input.fee.type === 'absolute') {
        assert.equal(input.fee.config.priorityFee, '0.024')
        assert.equal(input.fee.config.maxFee, '0.036')
      }
      return { data: { id: requestId, state: 'INITIATED' } }
    },
    async getTransaction({ id }) {
      assert.equal(id, requestId)
      return { data: { transaction: { id, walletId: circleId, blockchain: 'ETH-SEPOLIA', state: 'CONFIRMED', txHash: hash } } }
    },
  }
  const adapter = circleKeepers(env, client, { estimateGas: async () => 100000n, getBalance: async () => 10n ** 18n })
  assert.deepEqual(await adapter.create(keeper), { id: circleId, address })
  assert.equal((await adapter.execute(keeper, { id: requestId }, { address: lab, data: hatchData })).circleId, requestId)
  assert.equal((await adapter.execute(keeper, { id: requestId }, { address: lab, data: hatchData }, {
    type: 'absolute', config: { gasLimit: '9388470', priorityFee: '0.001', maxFee: '0.002' },
  })).circleId, requestId)
  assert.deepEqual(await adapter.status(keeper, requestId), { status: 'CONFIRMED', hash, done: true, failed: false })
})

test('starter funding estimates new-account gas and retries a reverted grant without paying twice', async () => {
  const store = keeperStore(':memory:', randomUUID())
  const keeper = store.openSession('wallet:' + address).keeper
  keeper.address = address
  const payer = '0x8888888888888888888888888888888888888888'
  const failedHash = '0x' + '13'.repeat(32)
  let sent = 0
  let funded = false
  const chain = {
    getBalance: async ({ address: who }) => who === payer || funded ? 10n ** 18n : 0n,
    estimateFeesPerGas: async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
    estimateGas: async () => 207391n,
    estimateContractGas: async () => 6258980n,
    waitForTransactionReceipt: async ({ hash: h }) => {
      if (h === failedHash) return { status: 'reverted' }
      funded = true
      return { status: 'success' }
    },
  }
  const sponsor = {
    account: { address: payer }, maxFee: 3_000_000_000n,
    wallet: { sendTransaction: async tx => {
      assert.equal(tx.gas, 248869n)
      assert.equal(tx.to, address)
      assert.equal(tx.value, 10n ** 16n)
      sent++
      return hash
    } },
  }
  try {
    assert.equal(store.reserveFunding(keeper, 1), true)
    store.saveFunding(keeper, failedHash)
    const service = keeperChain(store, { ASHENKIN_CIRCLE_STARTER_ETH: '0.01', ASHENKIN_STARTER_MINT_LIMIT: '1' }, { chain, sponsor })
    await service.fund(keeper)
    assert.equal(store.starterFunding(keeper).hash, hash)
    await service.fund(keeper)
    assert.equal(sent, 1)
    assert.deepEqual(await service.starterFee(keeper), {
      type: 'absolute',
      config: { gasLimit: '9388470', maxFee: '0.002', priorityFee: '0.001' },
    })
  } finally {
    store.close()
  }
})

test('a mined receipt completes the request even while Circle still reports SENT or CLEARED', async () => {
  const keeper = { id: randomUUID(), circle_id: randomUUID(), address }
  const txId = randomUUID()
  let state = 'SENT'
  const circle = {
    getTransaction: async () => ({ data: { transaction: {
      id: txId, walletId: keeper.circle_id, blockchain: 'ETH-SEPOLIA', state, txHash: hash,
    } } }),
  }
  const chain = { getTransactionReceipt: async ({ hash: requested }) => {
    assert.equal(requested, hash)
    return { status: 'success' }
  } }
  const adapter = circleKeepers({}, circle, chain)
  assert.deepEqual(await adapter.status(keeper, txId), { status: 'CONFIRMED', hash, done: true, failed: false })
  state = 'CLEARED'
  assert.deepEqual(await adapter.status(keeper, txId), { status: 'CONFIRMED', hash, done: true, failed: false })
})


test('Circle CLEARED does not finish an unmined transaction', async () => {
  const keeper = { id: randomUUID(), circle_id: randomUUID(), address }
  const txId = randomUUID()
  const circle = { getTransaction: async () => ({ data: { transaction: {
    id: txId, walletId: keeper.circle_id, blockchain: 'ETH-SEPOLIA', state: 'CLEARED', txHash: hash,
  } } }) }
  const chain = { getTransactionReceipt: async () => {
    const error = new Error('Not mined')
    error.name = 'TransactionReceiptNotFoundError'
    throw error
  } }
  assert.deepEqual(await circleKeepers({}, circle, chain).status(keeper, txId), { status: 'CLEARED', hash, done: false, failed: false })
})


test('only a Circle estimation failure without a broadcast hash is retryable', async () => {
  const keeper = { id: randomUUID(), circle_id: randomUUID(), address }
  const txId = randomUUID()
  const transaction = { id: txId, walletId: keeper.circle_id, blockchain: 'ETH-SEPOLIA', state: 'FAILED', errorReason: 'ESTIMATION_ERROR', contractAddress: lab, callData: hatchData }
  const circle = { getTransaction: async () => ({ data: { transaction } }) }
  const adapter = circleKeepers({}, circle, { call: async () => ({ data: '0x' }) })
  assert.equal((await adapter.status(keeper, txId)).retryable, true)
  transaction.txHash = hash
  assert.notEqual((await adapter.status(keeper, txId)).retryable, true)
  delete transaction.txHash
  transaction.errorReason = 'INSUFFICIENT_FUNDS'
  assert.notEqual((await adapter.status(keeper, txId)).retryable, true)
})

async function signedInFixture(request) {
  const player = privateKeyToAccount(generatePrivateKey())
  const { data } = await request('wallet/start', { body: { address: player.address } })
  const login = await request('wallet/finish', { body: { id: data.id, signature: await player.signMessage({ message: data.message }) } })
  await request('provision', { body: {}, cookie: login.cookie })
  return login.cookie
}

test('an unacknowledged starter request remains recoverable and is never blindly submitted again', async () => fixture(async ({ request, store, circle, stats }) => {
  const cookie = await signedInFixture(request)
  circle.find = async () => null
  circle.execute = async () => { throw new Error('ambiguous network failure') }
  assert.equal((await request('starter', { body: {}, cookie })).status, 503)
  const keeper = store.session(cookie.split('=')[1])
  const pending = store.pending(keeper, `${lab.toLowerCase()}:${hatchData}`)
  assert.ok(pending)
  assert.equal(pending.done, 0)
  circle.execute = async () => { throw new Error('must not be called') }
  assert.deepEqual((await request('starter', { body: {}, cookie })).data, { id: pending.id })
  const unresolved = await request(`transactions/${pending.id}`, { cookie })
  assert.equal(unresolved.status, 200)
  assert.equal(unresolved.data.state, 'RECONCILING')
  assert.equal(unresolved.data.failed, false)
  assert.equal(stats().grants, 1)
  assert.equal((await request(`transactions/${pending.id}`)).status, 401)
  const another = await signedInFixture(request)
  assert.equal((await request(`transactions/${pending.id}`, { cookie: another })).status, 404)

  circle.find = async () => ({ circleId: 'recovered', status: 'SENT' })
  circle.status = async () => ({ status: 'CONFIRMED', hash, done: true, failed: false })
  const recovered = await request(`transactions/${pending.id}`, { cookie })
  assert.equal(recovered.data.hash, hash)
  assert.equal(store.tx(keeper, pending.id).circle_id, 'recovered')
  assert.equal(store.tx(keeper, pending.id).done, 1)
}))

test('a proven pre-submission error closes only its unsent intent so a later retry can proceed', async () => fixture(async ({ request, store, circle }) => {
  const cookie = await signedInFixture(request)
  const original = circle.execute
  circle.execute = async () => { throw Object.assign(new Error('unavailable estimate'), { notSubmitted: true, status: 503 }) }
  assert.equal((await request('starter', { body: {}, cookie })).status, 503)
  const keeper = store.session(cookie.split('=')[1])
  const fingerprint = `${lab.toLowerCase()}:${hatchData}`
  assert.equal(store.latest(keeper, fingerprint).done, 1)
  circle.execute = original
  const next = await request('starter', { body: {}, cookie })
  assert.equal(next.status, 200)
  assert.ok(store.pending(keeper, fingerprint).circle_id)
}))

test('a permanent contract revert and an unavailable RPC are never treated as safe Circle estimation retries',async()=>{
 const keeper={id:randomUUID(),circle_id:randomUUID(),address},txId=randomUUID();const transaction={id:txId,walletId:keeper.circle_id,blockchain:'ETH-SEPOLIA',state:'FAILED',errorReason:'ESTIMATION_ERROR',contractAddress:lab,callData:hatchData};const circle={getTransaction:async()=>({data:{transaction}})},chain={call:async()=>{throw Error('Still reverts or provider unavailable')}};const adapter=circleKeepers({},circle,chain);
 assert.notEqual((await adapter.status(keeper,txId)).retryable,true);
 chain.call=async()=>({data:'0x'});transaction.state='DENIED';assert.notEqual((await adapter.status(keeper,txId)).retryable,true);
 transaction.state='FAILED';transaction.contractAddress=address;assert.notEqual((await adapter.status(keeper,txId)).retryable,true);
});
