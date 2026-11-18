const fs = require('node:fs')
const path = require('node:path')
const {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  parseGwei,
  keccak256,
  isAddressEqual,
} = require('viem')
const { privateKeyToAccount } = require('viem/accounts')
const { sepolia } = require('viem/chains')
const { RPC } = require('./zama')
const { problem } = require('./keeper-store')
const { DAY } = require('./gas-faucet-store')

function faucetService({
  store,
  chain,
  amount = parseEther('0.002'),
  clock = Date.now,
}) {
  const db = store.faucet
  const view = async (keeper) => {
    const row = db.latest(keeper)
    const funded = await chain.funded(amount)
    const nextAt = row?.status === 'confirmed' ? row.confirmed + DAY : null
    const pending = row && ['queued', 'signed'].includes(row.status)
    return {
      enabled: true,
      amount: formatEther(amount),
      fundingAddress: chain.address,
      funded,
      canClaim: funded && !pending && (!nextAt || nextAt <= clock()),
      nextAt,
      claim: row
        ? {
            id: row.id,
            status: row.status,
            hash: row.hash,
            issue: row.issue,
            confirmedAt: row.confirmed,
          }
        : null,
    }
  }
  return {
    view,
    async claim(keeper) {
      const prior = db.latest(keeper)
      if (prior && ['queued', 'signed'].includes(prior.status))
        return { id: prior.id }
      if (!(await chain.funded(amount)))
        throw problem(
          409,
          'The Sepolia faucet is awaiting funds. Try again after it is topped up.',
        )
      const row = db.reserve(keeper, amount, clock())
      return { id: row.id }
    },
    async tick() {
      const lease = db.acquire(clock())
      if (!lease) return
      const renew = setInterval(() => db.renew(lease, clock()), 20000)
      renew.unref()
      let job
      try {
        job = db.pending()
        if (!job) return
        if (!job.raw) {
          const commit = (op) =>
            db.update(job.id, lease, clock(), {
              ...op,
              status: 'signed',
              issue: null,
            })
          await chain.prepare(
            job.address,
            BigInt(job.amount),
            () => {
              if (!db.owns(lease, clock()))
                throw new Error('Faucet lease expired')
            },
            commit,
          )
          job = db.pending()
          console.info(
            JSON.stringify({
              event: 'gas-faucet-prepared',
              claimId: job.id,
              hash: job.hash,
              address: job.address,
              amountWei: job.amount,
            }),
          )
        }
        const receipt = await chain.receipt(
          job.hash,
          job.address,
          BigInt(job.amount),
        )
        if (!receipt) {
          await chain.broadcast(job.raw, job.hash)
          return
        }
        db.update(job.id, lease, clock(), {
          status: receipt.failed ? 'failed' : 'confirmed',
          confirmed: receipt.failed ? null : clock(),
          raw: null,
          cost: String(receipt.cost),
          issue: receipt.failed
            ? 'The transfer reverted. You may retry without waiting 24 hours.'
            : null,
        })
        console.info(
          JSON.stringify({
            event: 'gas-faucet-finished',
            claimId: job.id,
            hash: job.hash,
            failed: !!receipt.failed,
            costWei: String(receipt.cost),
          }),
        )
      } catch {
        if (job)
          try {
            db.update(job.id, lease, clock(), {
              issue:
                'Waiting for faucet funding or a verified Sepolia response. Your request will not be sent twice.',
            })
          } catch {}
        console.warn(
          JSON.stringify({ event: 'gas-faucet-waiting', claimId: job?.id }),
        )
      } finally {
        clearInterval(renew)
        db.release(lease)
      }
    },
  }
}

function faucetChain(
  account,
  { client, wallet, maxFee = parseGwei('0.1') } = {},
) {
  client ??= createPublicClient({
    chain: sepolia,
    transport: http(RPC, { timeout: 8000, retryCount: 1 }),
  })
  wallet ??= createWalletClient({
    chain: sepolia,
    account,
    transport: http(RPC, { timeout: 8000, retryCount: 1 }),
  })
  return {
    address: account.address,
    async funded(amount) {
      return (
        (await client.getBalance({
          address: account.address,
          blockTag: 'pending',
        })) >=
        amount + 500000n * maxFee
      )
    },
    async prepare(to, value, authorize, commit) {
      const [nonce, latest, fees, balance, estimate] = await Promise.all([
        client.getTransactionCount({
          address: account.address,
          blockTag: 'pending',
        }),
        client.getTransactionCount({
          address: account.address,
          blockTag: 'latest',
        }),
        client.estimateFeesPerGas(),
        client.getBalance({ address: account.address, blockTag: 'pending' }),
        client.estimateGas({ account: account.address, to, value }),
      ])
      const gas = (estimate * 12n) / 10n
      if (
        nonce !== latest ||
        gas > 500000n ||
        fees.maxFeePerGas > maxFee ||
        balance < value + gas * fees.maxFeePerGas
      )
        throw new Error('Faucet funding or fees unavailable')
      if (isAddressEqual(to, account.address))
        throw new Error('Faucet cannot pay itself')
      authorize()
      const req = await wallet.prepareTransactionRequest({
        account,
        chain: sepolia,
        to,
        value,
        nonce,
        gas,
        ...fees,
      })
      const raw = await account.signTransaction(req)
      commit({ raw, hash: keccak256(raw) })
    },
    async broadcast(raw, hash) {
      const known = await client.getTransaction({ hash }).catch((e) => {
        if (e.name === 'TransactionNotFoundError') return null
        throw e
      })
      if (known) return
      try {
        if (
          (await client.sendRawTransaction({ serializedTransaction: raw })) !==
          hash
        )
          throw new Error('Wrong faucet hash')
      } catch (e) {
        if (!/already known/i.test(e.shortMessage || e.message)) throw e
      }
    },
    async receipt(hash, to, value) {
      const r = await client.getTransactionReceipt({ hash }).catch((e) => {
        if (e.name === 'TransactionReceiptNotFoundError') return null
        throw e
      })
      if (
        !r ||
        (await client.getBlockNumber({ cacheTime: 0 })) < r.blockNumber + 2n
      )
        return null
      const tx = await client.getTransaction({ hash })
      if (
        !isAddressEqual(tx.from, account.address) ||
        !tx.to ||
        !isAddressEqual(tx.to, to) ||
        tx.value !== value ||
        tx.input !== '0x'
      )
        throw new Error('Faucet transfer does not match its claim')
      return {
        failed: r.status !== 'success',
        cost: r.gasUsed * r.effectiveGasPrice,
      }
    },
  }
}
function productionFaucet(store, env = process.env) {
  if (env.ASHENKIN_GAS_FAUCET_ENABLED !== 'true') return null
  if (!env.ASHENKIN_GAS_FAUCET_KEY_FILE)
    throw new Error('The dedicated faucet wallet is missing')
  const file = path.resolve(__dirname, '..', env.ASHENKIN_GAS_FAUCET_KEY_FILE)
  const key = JSON.parse(fs.readFileSync(file, 'utf8')).privateKey
  const account = privateKeyToAccount(key)
  if (env.ASHENKIN_GAS_FAUCET_EXPECTED_ADDRESS && !isAddressEqual(account.address, env.ASHENKIN_GAS_FAUCET_EXPECTED_ADDRESS)) throw new Error('Unexpected faucet wallet')
  const amount = parseEther(env.ASHENKIN_GAS_FAUCET_AMOUNT || '0.002')
  if (amount <= 0n || amount > parseEther('0.005'))
    throw new Error('Invalid daily faucet amount')
  if (
    env.CHIMERA_SETTLEMENT_EXPECTED_ADDRESS &&
    isAddressEqual(account.address, env.CHIMERA_SETTLEMENT_EXPECTED_ADDRESS)
  )
    throw new Error('Faucet must use its dedicated wallet')
  return faucetService({ store, chain: faucetChain(account), amount })
}
module.exports = { faucetService, faucetChain, productionFaucet }
