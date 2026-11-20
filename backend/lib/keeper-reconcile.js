const { problem } = require('./keeper-store')

// Read-only provider operations: no signing, funding, execution or automatic resend.
async function refreshKeeperTransaction(store, circle, keeper, request) {
  if(request.done && !request.circle_id)return {status:request.status,hash:request.hash||null,done:true,failed:request.status==='FAILED',...(request.status==='FAILED'&&!request.hash?{notSubmitted:true}:{})}
  let circleId = request.circle_id
  if (!circleId) {
    const found = await circle.find(keeper, request.id, request.created)
    if (!found) {
      const info = { status: request.status || 'RECONCILING', hash: request.hash || null, done: false, failed: false, unresolved: true }
      store.updateTx(request.id, info)
      return info
    }
    circleId = found.circleId
    store.updateTx(request.id, found)
  }
  const info = await circle.status(keeper, circleId)
  if (request.hash && info.hash && request.hash.toLowerCase() !== info.hash.toLowerCase()) {
    throw problem(503, 'Circle returned a different transaction hash.')
  }
  store.updateTx(request.id, info)
  return info
}

function keeperReconciler({ store, circle, now = Date.now, batchSize = 10, graceMs = 30_000,
  log = entry => console.info(JSON.stringify(entry)) }) {
  let running
  async function run() {
    const summary = { checked: 0, completed: 0, waiting: 0, errors: 0 }
    for (const candidate of store.dueTransactions(now(), graceMs, batchSize)) {
      const keeper = store.keeper(candidate.keeper_id)
      await store.exclusive(keeper, async () => {
        const request = store.tx(keeper, candidate.id)
        if (!request || request.done) return
        summary.checked++
        let result
        try {
          const info = await refreshKeeperTransaction(store, circle, keeper, request)
          result = info.done ? 'completed' : info.unresolved ? 'unresolved' : 'pending'
          if (info.done) summary.completed++
          else summary.waiting++
          log({ event: 'keeper-transaction-reconciled', at: new Date(now()).toISOString(),
            requestId: request.id, circleId: store.tx(keeper, request.id).circle_id, state: info.status, hash: info.hash, result })
        } catch {
          summary.errors++
          result = 'provider-error'
          // SDK errors can contain Authorization headers; never serialize them.
          log({ event: 'keeper-transaction-reconcile-waiting', at: new Date(now()).toISOString(), requestId: request.id, result })
        }
        const retryMs = result === 'pending' ? 30_000 : Math.min(900_000, 60_000 * 2 ** Math.min(candidate.check_attempts, 4))
        store.scheduleTxCheck(request.id, now() + retryMs, result)
      })
    }
    return summary
  }
  return {
    tick() {
      if (!running) running = run().finally(() => { running = null })
      return running
    },
  }
}

module.exports = { keeperReconciler, refreshKeeperTransaction }
