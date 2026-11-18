const assert = require('node:assert/strict')
const { test } = require('node:test')
const { keeperStore } = require('./keeper-store')
const { faucetService } = require('./gas-faucet')
const { parseEther } = require('viem')
function fixture() {
  const store = keeperStore(':memory:', 'test-secret')
  const signed = store.openSession('email:qa@example.com')
  const keeper = store.setWallet(signed.keeper, {
    id: 'circle-test',
    address: '0x7777777777777777777777777777777777777777',
  })
  let now = 1800000000000,
    funded = true,
    prepared = 0
  const sends = [],
    receipts = new Map()
  const chain = {
    address: '0x8888888888888888888888888888888888888888',
    funded: async () => funded,
    prepare: async (to, amount, authorize, commit) => {
      assert.equal(to, keeper.address)
      assert.equal(amount, parseEther('0.002'))
      authorize()
      prepared++
      commit({ raw: 'raw-' + prepared, hash: 'hash-' + prepared })
    },
    broadcast: async (raw, hash) => sends.push({ raw, hash }),
    receipt: async (hash) => receipts.get(hash),
  }
  const service = () => faucetService({ store, chain, clock: () => now })
  return {
    store,
    keeper,
    signed,
    chain,
    service,
    receipts,
    sends,
    count: () => prepared,
    advance: (ms) => (now += ms),
    fund: (value) => (funded = value),
    close: () => store.close(),
  }
}
test('one account gets one confirmed faucet per rolling 24h, including concurrent requests and restart', async () => {
  const f = fixture()
  try {
    const one = await Promise.all([
      f.service().claim(f.keeper),
      f.service().claim(f.keeper),
    ])
    assert.equal(one[0].id, one[1].id)
    await f.service().tick()
    assert.equal(f.count(), 1)
    f.store.logout(f.signed.token)
    await f.service().tick()
    assert.equal(f.count(), 1)
    assert.deepEqual(f.sends, [
      { raw: 'raw-1', hash: 'hash-1' },
      { raw: 'raw-1', hash: 'hash-1' },
    ])
    f.receipts.set('hash-1', { failed: false, cost: 99n })
    await f.service().tick()
    const result = await f.service().view(f.keeper)
    assert.equal(result.claim.status, 'confirmed')
    assert.equal(result.canClaim, false)
    await assert.rejects(f.service().claim(f.keeper), { status: 429 })
    f.advance(86400000 - 1)
    await assert.rejects(f.service().claim(f.keeper), { status: 429 })
    f.advance(1)
    assert.equal((await f.service().view(f.keeper)).canClaim, true)
    assert.notEqual((await f.service().claim(f.keeper)).id, one[0].id)
  } finally {
    f.close()
  }
})
test('the dedicated wallet runs with no server-wide cap; distinct accounts retain independent daily slots', () => {
  const f = fixture()
  try {
    for (let i = 0; i < 40; i++) {
      const login = f.store.openSession('email:account-' + i + '@example.com')
      const k = f.store.setWallet(login.keeper, {
        id: 'circle-' + i,
        address: '0x' + String(i + 1).padStart(40, '0'),
      })
      assert.ok(
        f.store.faucet.reserve(k, parseEther('0.002'), 1800000000000).id,
      )
    }
  } finally {
    f.close()
  }
})
test('an unfunded faucet never consumes the daily slot, and a reverted transfer may be retried', async () => {
  const f = fixture()
  try {
    f.fund(false)
    await assert.rejects(f.service().claim(f.keeper), { status: 409 })
    assert.equal(f.store.faucet.latest(f.keeper), undefined)
    f.fund(true)
    await f.service().claim(f.keeper)
    await f.service().tick()
    f.receipts.set('hash-1', { failed: true, cost: 10n })
    await f.service().tick()
    assert.equal((await f.service().view(f.keeper)).canClaim, true)
    await f.service().claim(f.keeper)
    await f.service().tick()
    assert.equal(f.count(), 2)
  } finally {
    f.close()
  }
})
test('an ambiguous broadcast always retries the committed hash, never a new transfer', async () => {
  const f = fixture()
  try {
    f.chain.broadcast = async (raw, hash) => {
      f.sends.push({ raw, hash })
      throw new Error('timeout')
    }
    await f.service().claim(f.keeper)
    await f.service().tick()
    await f.service().tick()
    assert.equal(f.count(), 1)
    assert.equal(f.sends[0].hash, f.sends[1].hash)
    assert.equal((await f.service().view(f.keeper)).claim.status, 'signed')
  } finally {
    f.close()
  }
})
test('the wallet lease prevents two workers from preparing the same nonce', async () => {
  const f = fixture()
  try {
    await f.service().claim(f.keeper)
    await Promise.all([f.service().tick(), f.service().tick()])
    assert.equal(f.count(), 1)
  } finally {
    f.close()
  }
})


test('a player with their daily faucet can mint without consuming another starter sponsorship slot', async () => {
  const {keeperChain}=require('./keeper-chain')
  const f=fixture()
  try {
    let grants=0
    const chain={getBalance:async()=>parseEther('0.002'),estimateFeesPerGas:async()=>({maxFeePerGas:24n,maxPriorityFeePerGas:1n}),estimateContractGas:async()=>6000000n,estimateGas:async()=>21000n}
    const sponsor={account:{address:'0x8888888888888888888888888888888888888888'},maxFee:3000000000n,wallet:{sendTransaction:async()=>{grants++;throw new Error('Should not fund an already funded player')}}}
    f.store.reserveFunding(f.keeper,1)
    const env={ASHENKIN_CIRCLE_STARTER_ETH:'0.02',ASHENKIN_STARTER_MINT_LIMIT:'1'}
    await keeperChain(f.store,env,{chain,sponsor}).fund(f.keeper)
    assert.equal(grants,0)
  } finally {f.close()}
})
