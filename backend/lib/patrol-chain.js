const { createPublicClient, encodeFunctionData, http, parseEventLogs } = require('viem')
const { sepolia } = require('viem/chains')
const { RPC } = require('./zama')
const { problem } = require('./keeper-store')
const { gameCall } = require('./keeper-chain')
const deployment = require('./ashenkin.json')
const abi = require('./patrol-abi.json')

function patrolChain(client) {
  client ??= createPublicClient({ chain: sepolia, transport: http(RPC, { timeout: 8000, retryCount: 1 }) })
  const A = deployment.addresses
  const read = (contract, functionName, args = []) => client.readContract({ address: A[contract], abi: abi[contract], functionName, args })
  const mine = (a, b) => a.toLowerCase() === b.toLowerCase()
  return {
    async check(keeper, creatureId, zone) {
      const id = BigInt(creatureId)
      const [owner, approved, profile, defender, oldDefender, runId, z, runs, max] = await Promise.all([
        read('ChimeraLab', 'ownerOf', [id]),
        read('ChimeraLab', 'isApprovedForAll', [keeper.address, A.ChimeraExpeditions]),
        read('ChimeraTraining', 'getProfile', [id]),
        read('ChimeraColosseum', 'getDefender', [id]),
        read('ChimeraArena', 'getDefender', [id]),
        read('ChimeraDepths', 'activeRun', [keeper.address]),
        read('ChimeraExpeditions', 'getZone', [zone]),
        read('ChimeraExpeditions', 'runsToday', [keeper.address]),
        read('ChimeraExpeditions', 'maxDailyRuns'),
      ])
      if (!mine(owner, keeper.address)) throw problem(409, 'This NFT must be in your game wallet before patrol.')
      if (profile[0].pending) throw problem(409, 'Complete this specimen’s training first.')
      if (defender[2] || oldDefender[2]) throw problem(409, 'Withdraw this specimen from defence first.')
      if (runId > 0n) {
        const run = (await read('ChimeraDepths', 'getRun', [runId]))[0]
        if (!run.over && Number(run.creatureId) === creatureId) throw problem(409, 'Return this specimen from the Depths first.')
      }
      return { approved, runs: Number(runs), max: Number(max), duration: Number(z.duration) }
    },
    call(kind, job) {
      const contract = kind === 'approve' ? 'ChimeraLab' : 'ChimeraExpeditions'
      const functionName = kind === 'approve' ? 'setApprovalForAll' : kind
      const args = kind === 'approve' ? [A.ChimeraExpeditions, true] : kind === 'start' ? [BigInt(job.creatureId), job.zone] : [BigInt(job.expeditionId)]
      const data = encodeFunctionData({ abi: abi[contract], functionName, args })
      // The offline worker has no broader target/method privilege than the UI.
      return gameCall(null, A[contract], data)
    },
    async expedition(id) { return (await read('ChimeraExpeditions', 'getExpedition', [BigInt(id)]))[0] },
    async receipt(hash, keeper) {
      const receipt = await client.getTransactionReceipt({ hash }).catch(error => {
        if (error.name === 'TransactionReceiptNotFoundError') return null
        throw error
      })
      if (!receipt || await client.getBlockNumber({ cacheTime: 0 }) <= receipt.blockNumber) return null
      if (!mine(receipt.from, keeper.address)) throw new Error('Unexpected patrol receipt sender')
      if (!mine(receipt.to, A.ChimeraLab) && !mine(receipt.to, A.ChimeraExpeditions)) throw new Error('Unexpected patrol receipt target')
      return { ...receipt, cost: receipt.gasUsed * receipt.effectiveGasPrice }
    },
    async started(receipt, keeper, job) {
      const events = parseEventLogs({ abi: abi.ChimeraExpeditions, logs: receipt.logs, eventName: 'ExpeditionStarted' })
      const event = events.find(e => mine(e.address, A.ChimeraExpeditions) && mine(e.args.keeper, keeper.address) && Number(e.args.creatureId) === job.creatureId && Number(e.args.zone) === job.zone)
      if (!event) throw new Error('Missing patrol departure event')
      const exp = (await read('ChimeraExpeditions', 'getExpedition', [event.args.expeditionId]))[0]
      if (!mine(exp.keeper, keeper.address) || Number(exp.creatureId) !== job.creatureId ||
          Number(exp.zone) !== job.zone || Number(exp.endsAt) !== Number(event.args.endsAt) || Number(exp.startedAt) <= 0) {
        throw new Error('Departure state has not caught up with its receipt')
      }
      return { id: Number(event.args.expeditionId), endsAt: Number(exp.endsAt), startedAt: Number(exp.startedAt) }
    },
    returned(receipt, keeper, job) {
      return parseEventLogs({ abi: abi.ChimeraExpeditions, logs: receipt.logs, eventName: 'ExpeditionReturned' })
        .some(e => mine(e.address, A.ChimeraExpeditions) && mine(e.args.keeper, keeper.address) && Number(e.args.expeditionId) === job.expeditionId)
    },
  }
}

module.exports = { patrolChain }
