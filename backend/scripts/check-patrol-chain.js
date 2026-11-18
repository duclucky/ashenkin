// Read-only adapter verification against already-confirmed audit transactions.
// No Circle credentials, signatures, transfers or new transactions are used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parseEventLogs } = require('viem')
const { patrolChain } = require('../lib/patrol-chain')
const { addresses: A } = require('../lib/ashenkin.json')
const abi = require('../lib/patrol-abi.json')

async function main() {
  const root = path.resolve(__dirname, '../..')
  const lines = fs.readFileSync(path.join(root, 'docs/qa-2026-11-18/transactions.csv'), 'utf8').trim().split(/\r?\n/)
  const fields = lines.shift().split(',')
  const rows = lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [fields[i], v])))
    .filter(row => row.to.toLowerCase() === A.ChimeraExpeditions.toLowerCase())
  const start = rows.find(row => row.action === 'start')
  const keeper = { address: start.from }
  const chain = patrolChain()
  const receipt = await chain.receipt(start.hash, keeper)
  assert.equal(receipt.status, 'success')
  const event = parseEventLogs({ abi: abi.ChimeraExpeditions, logs: receipt.logs, eventName: 'ExpeditionStarted' })[0]
  const job = { creatureId: Number(event.args.creatureId), zone: Number(event.args.zone) }
  const departure = await chain.started(receipt, keeper, job)
  job.expeditionId = departure.id
  assert.ok(departure.endsAt > departure.startedAt)
  const exp = await chain.expedition(departure.id)
  assert.equal(exp.claimed, true)
  const claim = rows.find(row => row.action === 'claim' && row.from.toLowerCase() === start.from.toLowerCase())
  const returned = await chain.receipt(claim.hash, keeper)
  assert.equal(chain.returned(returned, keeper, job), true)
  for (const kind of ['approve', 'start', 'claim']) assert.ok(chain.call(kind, job).data.startsWith('0x'))
  const available = await chain.check({ address: '0x8fA7cBB2B6641F6AA6Afe9705D981f510Da483fC' }, 13, 0)
  assert.equal(available.duration, 600)
  const result = {
    at: new Date().toISOString(), status: 'passed', mutations: 0,
    checks: ['verified departure receipt and event', 'verified expedition state and timestamps', 'verified return receipt and event', 'all three worker calls pass gameplay allowlist', 'live ownership/training/defence/Depths/quota checks'],
    start: start.hash, claim: claim.hash, expeditionId: departure.id,
  }
  fs.writeFileSync(path.join(root, 'uploads/patrol-chain-check.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
