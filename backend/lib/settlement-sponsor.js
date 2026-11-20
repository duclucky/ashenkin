const { readFileSync } = require('node:fs')
const path = require('node:path')
const { createPublicClient, createWalletClient, http, parseGwei } = require('viem')
const { privateKeyToAccount, nonceManager } = require('viem/accounts')
const { sepolia } = require('viem/chains')
const { RPC, zama } = require('./zama')
const { sponsorLane, SponsorBusyError } = require('./sponsor-lane')

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

function interactiveClients(env) {
  if(!env.ASHENKIN_INTERACTIVE_KEY_FILE)return sponsorClients(env)
  const config={...env,CHIMERA_SETTLEMENT_PRIVATE_KEY:undefined,CHIMERA_SETTLEMENT_KEY_FILE:env.ASHENKIN_INTERACTIVE_KEY_FILE,CHIMERA_SETTLEMENT_EXPECTED_ADDRESS:env.ASHENKIN_INTERACTIVE_EXPECTED_ADDRESS}
  const clients=sponsorClients(config)
  if(!config.CHIMERA_SETTLEMENT_EXPECTED_ADDRESS||clients.account.address.toLowerCase()===env.CHIMERA_SETTLEMENT_EXPECTED_ADDRESS?.toLowerCase())throw Error('Interactive settlements need a separate expected signer')
  return clients
}
function createSettlementSponsor(env = process.env, clients = interactiveClients(env), options = {}) {
  if (!clients) return null
  const { account, client, wallet, maxFee } = clients
  const pipeline=options.pipeline||env.ASHENKIN_INTERACTIVE_KEY_FILE
    ? require('./settlement-pipeline').settlementPipeline({account,client,maxFee,
      file:options.journalFile||path.resolve(__dirname,'..','db','settlements.sqlite'),
      maxPending:options.maxPending||8,log:options.log}) : null
  let lastSubmittedNonce = -1
  return {
    read: call => client.readContract(call),
    async prove(handles) {
      const inst = await zama()
      return inst.publicDecrypt(handles)
    },
    ...(pipeline?{getJob:key=>pipeline.getJob(key),tick:()=>pipeline.tick(),close:()=>pipeline.close()}:{}),
    async send(call,job) {
      if(pipeline)return pipeline.send(call,job)
      return sponsorLane(account.address, async () => {
        const input = { ...call, account: account.address }
        const [fees, balance, simulation, estimate, pending, latest] = await Promise.all([
          client.estimateFeesPerGas(),
          client.getBalance({ address: account.address, blockTag: 'pending' }),
          client.simulateContract(input),
          client.estimateContractGas(input),
          client.getTransactionCount({ address: account.address, blockTag: 'pending' }),
          client.getTransactionCount({ address: account.address, blockTag: 'latest' }),
        ])
        const gas = estimate * 12n / 10n
        if (gas > 9_000_000n || fees.maxFeePerGas > maxFee || gas * fees.maxFeePerGas > balance) {
          throw new Error('The settlement is outside the sponsor budget.')
        }
        // A returned hash may precede RPC mempool propagation. Keep its nonce
        // reserved until mined; never reset the nonce manager and reuse it.
        // The living worker uses this signer too, so pending sends also wait.
        if (pending !== latest || latest <= lastSubmittedNonce) throw new SponsorBusyError()
        // Preserve the reservation even if the provider loses the ACK.
        lastSubmittedNonce = pending
        const hash = await wallet.writeContract({ ...simulation.request, ...fees, gas, account, nonce: pending })
        return hash
      })
    },
    async wait(hash) {
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 })
      return receipt.status
    },
  }
}

module.exports = { createSettlementSponsor, sponsorClients, interactiveClients }
