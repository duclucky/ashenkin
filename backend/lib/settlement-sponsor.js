const { readFileSync } = require('node:fs')
const path = require('node:path')
const { createPublicClient, createWalletClient, http, parseGwei } = require('viem')
const { privateKeyToAccount, nonceManager } = require('viem/accounts')
const { sepolia } = require('viem/chains')
const { RPC, zama } = require('./zama')
const { sponsorLane } = require('./sponsor-lane')

function sponsorClients(env = process.env) {
  let key = env.CHIMERA_SETTLEMENT_PRIVATE_KEY
  if (!key && env.CHIMERA_SETTLEMENT_KEY_FILE) {
    try {
      const file = path.resolve(__dirname, '..', env.CHIMERA_SETTLEMENT_KEY_FILE)
      key = JSON.parse(readFileSync(file, 'utf8')).pk
    } catch {
      throw new Error('Could not read the Chimera settlement signer file.')
    }
    if (typeof key !== 'string') throw new Error('The Chimera settlement signer file has no key.')
  }
  if (!key) return null
  if (!/^0x[0-9a-f]{64}$/i.test(key)) throw new Error('Invalid Chimera settlement sponsor key.')
  const maxFee = parseGwei(env.CHIMERA_SETTLEMENT_MAX_GWEI || '3')
  if (maxFee <= 0n) throw new Error('Settlement max fee must be positive.')
  let account
  try { account = privateKeyToAccount(key, { nonceManager }) } catch {
    throw new Error('Invalid Chimera settlement sponsor key.')
  }
  const expected = env.CHIMERA_SETTLEMENT_EXPECTED_ADDRESS
  if (expected && account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('The Chimera settlement signer does not match the configured address.')
  }
  const config = { chain: sepolia, transport: http(RPC, { timeout: 8000, retryCount: 1 }) }
  const client = createPublicClient(config)
  const wallet = createWalletClient({ ...config, account })
  return { account, client, wallet, maxFee }
}

function createSettlementSponsor(env = process.env) {
  const clients = sponsorClients(env)
  if (!clients) return null
  const { account, client, wallet, maxFee } = clients
  return {
    read: call => client.readContract(call),
    async prove(handles) {
      const inst = await zama()
      return inst.publicDecrypt(handles)
    },
    async send(call) {
      return sponsorLane(account.address, async () => {
        const input = { ...call, account: account.address }
        const [fees, balance, simulation, estimate] = await Promise.all([
          client.estimateFeesPerGas(),
          client.getBalance({ address: account.address, blockTag: 'pending' }),
          client.simulateContract(input),
          client.estimateContractGas(input),
        ])
        const gas = estimate * 12n / 10n
        if (gas > 9_000_000n || fees.maxFeePerGas > maxFee || gas * fees.maxFeePerGas > balance) {
          throw new Error('The settlement is outside the sponsor budget.')
        }
        // Living-world raw signing may have consumed a nonce since this manager's
        // previous interactive settlement. Reload its pending nonce inside the lane.
        nonceManager.reset({ address: account.address, chainId: sepolia.id })
        return wallet.writeContract({ ...simulation.request, ...fees, gas, account })
      })
    },
    async wait(hash) {
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 })
      return receipt.status
    },
  }
}

module.exports = { createSettlementSponsor, sponsorClients }
