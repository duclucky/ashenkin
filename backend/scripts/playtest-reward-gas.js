// Read-only future-block simulation; never sends a transaction or changes Sepolia.
const fs = require('node:fs')
const { createPublicClient, http, encodeFunctionData, toHex } = require('viem')
const { sepolia } = require('viem/chains')
const directory = '/app/backend/db/playtest-20261118'
const d = require(directory + '/deployment.json')
const report = require(directory + '/report.json')
const journal = require(directory + '/reward-deadlines.json')
const client = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 30_000, retryCount: 1 }) })

async function main() {
  const result = { at: new Date().toISOString(), method: 'eth_simulateV1', changesRealChain: false }
  try {
    const blocks = await client.request({ method: 'eth_simulateV1', params: [{
      blockStateCalls: [{ blockOverrides: { time: toHex(journal.target + 5) }, calls: [{
        from: report.players[6].address, to: d.addresses.ChimeraSeason,
        data: encodeFunctionData({ abi: d.abis.ChimeraSeason, functionName: 'endSeason' }),
        gas: toHex(16_000_000n), gasPrice: toHex(500_000_000n),
      }] }], validation: false, traceTransfers: false,
    }, 'latest'] })
    const call = blocks[0].calls[0]
    Object.assign(result, { supported: true, status: call.status, gasUsed: call.gasUsed ? String(BigInt(call.gasUsed)) : null, error: call.error || null })
  } catch (error) {
    Object.assign(result, { supported: false, reason: error.shortMessage || error.message.slice(0, 200) })
  }
  fs.writeFileSync(directory + '/reward-gas-preflight.json', JSON.stringify(result, null, 2))
  console.log('REWARD_GAS_PREFLIGHT', JSON.stringify(result))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
