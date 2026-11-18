const { getAddress, isAddress, isAddressEqual, parseGwei, formatGwei, createPublicClient, http } = require('viem')
const { sepolia } = require('viem/chains')
const { RPC } = require('./zama')
const { setTimeout: delay } = require('node:timers/promises')
const { problem } = require('./keeper-store')

function circleKeepers(env, client, chainClient) {
  const { CIRCLE_API_KEY: apiKey, CIRCLE_ENTITY_SECRET: entitySecret, CIRCLE_WALLET_SET_ID: walletSetId } = env
  if (!client && (!apiKey || !entitySecret || !walletSetId)) return null
  const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets')
  client ??= initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  const chain = chainClient ?? createPublicClient({ chain: sepolia, transport: http(RPC, { timeout: 8000, retryCount: 1 }) })
  return {
    async create(keeper) {
      const existing = await client.listWallets({ blockchain: 'ETH-SEPOLIA', refId: keeper.id, walletSetId })
      const wallets = existing.data?.wallets ?? []
      if (wallets.length > 1) throw problem(503, 'Ashenkin could not resolve the game wallet.')
      const wallet = wallets[0] ?? (await client.createWallets({
        accountType: 'EOA', blockchains: ['ETH-SEPOLIA'], count: 1, walletSetId,
        metadata: [{ refId: keeper.id }], idempotencyKey: keeper.id,
      })).data?.wallets?.[0]
      if (!wallet?.id || !isAddress(wallet.address) || wallet.blockchain !== 'ETH-SEPOLIA' || wallet.custodyType !== 'DEVELOPER') {
        throw problem(503, 'Circle could not create a Sepolia game wallet.')
      }
      return { id: wallet.id, address: getAddress(wallet.address) }
    },
    async execute(keeper, request, call, fee, limits) {
      let attempted = false
      try {
        // Circle's internal estimation can lag behind a just-confirmed approval.
        // An explicit limit uses the same Sepolia state the game has confirmed.
        const [estimate, ratesResponse, balance] = await Promise.all([
          chain.estimateGas({ account: keeper.address, to: call.address, data: call.data }),
          estimateCircleCall(keeper, call, request.id),
          chain.getBalance({ address: keeper.address, blockTag: 'pending' }),
        ])
        const gas = estimate * 15n / 10n
        if (estimate > 16_000_000n) throw problem(409, 'This action exceeds the Sepolia transaction gas limit.')
        const gasLimit = gas > 16_000_000n ? 16_000_000n : gas
        const quotes = [ratesResponse.data?.medium, ratesResponse.data?.high]
        for (let attempt = 0; attempt < quotes.length; attempt++) {
          const quoted = quotes[attempt]
          if (!quoted?.priorityFee || !quoted?.maxFee) throw problem(503, 'Circle fee estimates are temporarily unavailable.')
          const priorityFee = parseGwei(quoted.priorityFee) * 12n / 10n
          const quotedMax = parseGwei(quoted.maxFee) * 12n / 10n
          const maxFee = quotedMax > priorityFee ? quotedMax : priorityFee
          if (maxFee > parseGwei(env.CHIMERA_SETTLEMENT_MAX_GWEI || '3')) {
            throw problem(503, 'Starter sponsorship is temporarily unavailable.')
          }
          if (gasLimit * maxFee > balance) throw problem(409, 'Your game wallet needs more Sepolia ETH for this action.')
          if (limits && (maxFee > limits.maxFeePerGas || gasLimit * maxFee > limits.maxCostWei ||
              gasLimit * maxFee + limits.balanceReserveWei > balance)) {
            throw problem(409, 'The patrol gas cap or reserved return allowance would be exceeded.')
          }
          fee = { type: 'absolute', config: { gasLimit: String(gasLimit), priorityFee: formatGwei(priorityFee), maxFee: formatGwei(maxFee) } }
          try {
            limits?.authorize?.()
            attempted = true
            const { data } = await client.createContractExecutionTransaction({
              walletId: keeper.circle_id, contractAddress: call.address, callData: call.data,
              fee, idempotencyKey: request.id, refId: request.id,
            })
            if (!data?.id) throw problem(503, 'Circle did not acknowledge the game transaction.')
            return { circleId: data.id, status: data.state }
          } catch (error) {
            const body = error.error?.response?.data ?? error.response?.data
            const feeRejected = body?.errors?.some(item => item.error === 'min_value' && /priorityFee/.test(item.message))
            if (attempt !== 0 || !feeRejected) throw error
            attempted = false // Circle explicitly rejected this quote before acceptance.
          }
        }
      } catch (error) {
        if (!attempted) error.notSubmitted = true
        throw error
      }
    },
    async find(keeper, refId, created) {
      let pageAfter
      // A missing acknowledgement is not a license to resubmit. Find its refId
      // across every page of this wallet's transactions in the relevant window.
      do {
        const { data } = await client.listTransactions({
          blockchain: 'ETH-SEPOLIA', walletIds: [keeper.circle_id],
          from: new Date(created - 60_000).toISOString(), pageSize: 50, pageAfter,
        })
        const transactions = data?.transactions ?? []
        const tx = transactions.find(tx => tx.refId === refId && tx.walletId === keeper.circle_id && tx.blockchain === 'ETH-SEPOLIA')
        if (tx) return { circleId: tx.id, status: tx.state }
        const next = data?.nextPageAfter || (transactions.length === 50 ? transactions.at(-1).id : undefined)
        if (next === pageAfter) throw problem(503, 'Circle pagination did not advance.')
        pageAfter = next
      } while (pageAfter)
      return null
    },
    async status(keeper, circleId) {
      const { data } = await client.getTransaction({ id: circleId })
      const tx = data?.transaction
      if (tx?.id !== circleId || tx.walletId !== keeper.circle_id || tx.blockchain !== 'ETH-SEPOLIA' ||
          (tx.sourceAddress && !isAddressEqual(tx.sourceAddress, keeper.address))) {
        throw problem(503, 'Circle could not verify this game transaction.')
      }
      const failed = ['CANCELLED', 'DENIED', 'FAILED'].includes(tx.state)
      const hash = /^0x[0-9a-f]{64}$/i.test(tx.txHash ?? '') ? tx.txHash : null
      let state = tx.state
      let chainFailed = failed
      let confirmed = !!hash && ['CONFIRMED', 'COMPLETE'].includes(state)
      if (hash && !failed && !confirmed) {
        const receipt = await chain.getTransactionReceipt({ hash }).catch(error => {
          if (error.name === 'TransactionReceiptNotFoundError') return null
          throw error
        })
        if (receipt) {
          chainFailed = receipt.status !== 'success'
          confirmed = !chainFailed
          state = confirmed ? 'CONFIRMED' : 'FAILED'
        }
      }
      if (chainFailed) {
        console.error(JSON.stringify({
          event: 'keeper-circle-transaction-failed', at: new Date().toISOString(),
          keeperId: keeper.id, wallet: keeper.address, circleId, hash,
          state,
          reason: typeof tx.errorReason === 'string' && /^[A-Z_]+$/.test(tx.errorReason) ? tx.errorReason : 'UNKNOWN',
        }))
      }
      return {
        status: state, hash, done: chainFailed || confirmed, failed: chainFailed,
        ...(chainFailed && !hash && tx.errorReason === 'ESTIMATION_ERROR' ? { retryable: true } : {}),
      }
    },
    async signLabKey(keeper, typedData) {
      const { data } = await client.signTypedData({
        walletId: keeper.circle_id, data: JSON.stringify(typedData), memo: 'Ashenkin Lab decryption key',
      })
      if (!/^0x[0-9a-f]{130}$/i.test(data?.signature ?? '')) throw problem(503, 'Circle could not sign the Lab key.')
      return data.signature
    },
  }

  async function estimateCircleCall(keeper, call, requestId) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.estimateContractExecutionFee({
          source: { walletId: keeper.circle_id }, contractAddress: call.address, callData: call.data,
        })
      } catch (error) {
        const status = error.status ?? error.error?.response?.status ?? error.response?.status
        if (status !== 400 || attempt >= 5) throw error
        console.warn(JSON.stringify({
          event: 'keeper-circle-estimate-retry', at: new Date().toISOString(),
          requestId, wallet: keeper.address, attempt: attempt + 1,
        }))
        await delay(3000)
      }
    }
  }
}

module.exports = { circleKeepers }
