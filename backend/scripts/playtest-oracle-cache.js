const fs = require('node:fs')
const h = require('./playtest-keepers')
const a = require('./playtest-activities')
async function main() {
  const run = require(h.directory + '/reward-oracle-result.json')
  const winner = run.jackpot.player - 1
  const [relic, tier, power] = await h.read('ChimeraRelics', 'getRelic', [run.jackpot.relicId])
  if (relic.keeper.toLowerCase() !== run.jackpot.winner.toLowerCase()) throw new Error('Oracle cache did not reach the solver')
  const own = await a.privateRead(winner, [tier, power], 'ChimeraRelics')
  const t = Number(own[tier.toLowerCase()] ?? own[tier])
  const p = BigInt(own[power.toLowerCase()] ?? own[power])
  if (t < 1 || t > 4 || p <= 0n) throw new Error('Paid Oracle reward produced an invalid cache')
  let denied = false
  try { await a.privateRead(1, [tier, power], 'ChimeraRelics') } catch (error) {
    if (!/not authorized|not allowed|unauthorized/i.test(error.message)) throw error
    denied = true
  }
  if (!denied) throw new Error('Another keeper read the solver cache stats')
  const result = { at: new Date().toISOString(), status: 'passed', relicId: run.jackpot.relicId, owner: run.jackpot.winner, privatelyReadableByWinner: true, paidTierAndPowerValid: true, anotherKeeperDenied: true }
  fs.writeFileSync(h.directory + '/reward-oracle-cache.json', JSON.stringify(result, null, 2))
  console.log('ORACLE_CACHE_VERIFIED', JSON.stringify(result))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
