const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const { decodeFunctionData, formatEther } = require('viem')
const h = require('./playtest-keepers')
const d = require(h.directory + '/deployment.json')

async function main() {
  const db = new DatabaseSync('db/keepers.sqlite', { readOnly: true })
  const rows = db.prepare(`SELECT t.id, t.circle_id, t.hash, t.status, t.done, t.created, t.fingerprint, k.address
    FROM keeper_transactions t JOIN keepers k ON k.id=t.keeper_id ORDER BY t.created`).all()
  db.close()
  const players = new Map(h.report.players.map(p => [p.address.toLowerCase(), p.player]))
  const requests = rows.filter(row => players.has(row.address.toLowerCase())).map(row => {
    const [address, data] = row.fingerprint.split(':')
    const contract = Object.keys(h.A).find(name => h.A[name].toLowerCase() === address.toLowerCase())
    let method = data.slice(0, 10)
    try { method = decodeFunctionData({ abi: d.abis[contract] || h.tokenAbi, data }).functionName } catch {}
    return { player: players.get(row.address.toLowerCase()), requestId: row.id, circleId: row.circle_id, hash: row.hash, databaseState: row.status, databaseDone: !!row.done, created: row.created, destination: address, method }
  })
  fs.writeFileSync(h.directory + '/requests.jsonl', requests.map(row => JSON.stringify(row)).join('\n') + '\n')
  const hashes = new Map()
  const events = fs.readFileSync(h.directory + '/events.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line))
  for (const event of events) if (event.hash) hashes.set(event.hash, { player: event.player, action: event.step })
  for (const p of h.report.players) for (const hash of p.fundingHashes || []) hashes.set(hash, { player: p.player, action: 'deployer-funding', funding: true })
  for (const fund of h.report.funding.starterTransfers) hashes.set(fund.hash, { player: players.get(fund.address.toLowerCase()), action: 'starter-funding', funding: true })
  for (const request of requests) if (request.hash) hashes.set(request.hash, { ...(hashes.get(request.hash) || {}), player: request.player, requestId: request.requestId, circleId: request.circleId, action: request.method })
  const ledger = []
  let cursor = 0
  const entries = [...hashes.entries()]
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (cursor < entries.length) {
      const [hash, details] = entries[cursor++]
      const receipt = await h.publicClient.getTransactionReceipt({ hash })
      ledger.push({ ...details, hash, status: receipt.status, from: receipt.from, to: receipt.to, blockNumber: String(receipt.blockNumber), gasUsed: String(receipt.gasUsed), effectiveGasPriceWei: String(receipt.effectiveGasPrice), gasCostWei: String(receipt.gasUsed * receipt.effectiveGasPrice) })
    }
  }))
  ledger.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)))
  fs.writeFileSync(h.directory + '/transactions.jsonl', ledger.map(row => JSON.stringify(row)).join('\n') + '\n')
  const gas = ledger.reduce((sum, row) => sum + BigInt(row.gasCostWei), 0n)
  const sponsorGas = ledger.filter(row => row.from.toLowerCase() === h.report.payer.toLowerCase()).reduce((sum, row) => sum + BigInt(row.gasCostWei), 0n)
  h.report.chainLedger = { receipts: ledger.length, successful: ledger.filter(row => row.status === 'success').length, reverted: ledger.filter(row => row.status !== 'success').length, gasEth: formatEther(gas), sponsorGasEth: formatEther(sponsorGas), requests: requests.length }
  for (const p of h.report.players) p.finalEth = formatEther(await h.publicClient.getBalance({ address: p.address }))
  h.report.payerBalance = formatEther(await h.publicClient.getBalance({ address: h.report.payer }))
  h.report.completedAt = new Date().toISOString()
  h.save()
  console.log('CHAIN_LEDGER_VERIFIED', JSON.stringify(h.report.chainLedger))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
