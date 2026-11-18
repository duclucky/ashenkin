const assert = require('node:assert/strict')
const { test } = require('node:test')
const { privateKeyToAccount } = require('viem/accounts')
const { parseGwei, parseEther, keccak256, parseTransaction } = require('viem')
const { keeperStore } = require('./keeper-store')
const { livingChain, productionLife } = require('./life-chain')
const { addresses: A } = require('./ashenkin.json')

test('sponsor signs bounded calldata and persists it before release; a fee cap rejection signs nothing', async () => {
  const store = keeperStore(':memory:', 'test-secret'), world = 'test-chain'
  // Public Anvil/Hardhat fixture account; never a production key.
  const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
  let fees = { maxFeePerGas: parseGwei('0.03'), maxPriorityFeePerGas: parseGwei('0.01') }
  let networkSent = 0
  const client = {
    readContract: async ({ functionName }) => functionName === 'lab' ? A.ChimeraLab : functionName === 'RULES' ? 1 : true,
    getTransactionCount: async () => 7,
    estimateFeesPerGas: async () => fees,
    getBalance: async () => parseEther('1'),
    estimateContractGas: async () => 2_000_000n,
    sendRawTransaction: async () => { networkSent++ },
  }
  const wallet = { prepareTransactionRequest: async request => ({ ...request, type: 'eip1559', chainId: 11155111 }) }
  try {
    const chain = livingChain({ address: A.ChimeraExpeditions, clients: { account, client, wallet }, maxFee: parseGwei('0.1'), store, world })
    let committed = false
    const op = await chain.prepare([1], parseEther('0.005'), () => {}, input => { committed = true; assert.equal(keccak256(input.raw), input.hash) })
    assert.equal(committed, true)
    assert.equal(networkSent, 0)
    const decoded = parseTransaction(op.raw)
    assert.equal(decoded.chainId, 11155111)
    assert.equal(decoded.nonce, 7)
    assert.equal(decoded.gas, 2_600_000n)
    assert.equal(decoded.to.toLowerCase(), A.ChimeraExpeditions.toLowerCase())
    fees = { ...fees, maxFeePerGas: parseGwei('1') }
    await assert.rejects(chain.prepare([1], parseEther('0.005'), () => {}, () => { throw new Error('Should not commit') }), /cap/)
  } finally { store.close() }
})

test('the new worker is disabled without a deployed contract; invalid deployment input is rejected', () => {
  assert.equal(productionLife({}, {}), null)
  assert.throws(() => productionLife({}, { ASHENKIN_ENCOUNTERS_ADDRESS: 'wrong' }), /address/)
})
