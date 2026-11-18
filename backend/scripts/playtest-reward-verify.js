const fs = require('node:fs')
const { formatEther, parseAbi, parseEventLogs } = require('viem')
const h = require('./playtest-keepers')
const a = require('./playtest-activities')
const d = require(h.directory + '/deployment.json')
const journal = require(h.directory + '/reward-deadlines.json')
const outcome = require(h.directory + '/reward-settlement-result.json')
const oracle = require(h.directory + '/reward-oracle-result.json')
const preparation = require(h.directory + '/reward-preparation.json')
const result = { at: new Date().toISOString(), checks: [] }
const check = (condition, name) => {
  if (!condition) throw new Error(name)
  result.checks.push({ name, status: 'passed' })
}
async function transferred(receipt, index, from) {
  const abi = parseAbi(['event ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount)'])
  const events = parseEventLogs({ abi, eventName: 'ConfidentialTransfer', logs: receipt.logs, strict: false }).filter(event => event.address.toLowerCase() === h.CZ.toLowerCase() && event.args.from.toLowerCase() === from.toLowerCase() && event.args.to.toLowerCase() === h.report.players[index].address.toLowerCase())
  if (events.length !== 1) throw new Error('Expected one cZAMA payout event for recipient')
  return BigInt(Object.values(await a.privateRead(index, [events[0].args.amount], h.CZ))[0])
}

async function main() {
  check(journal.restored && !outcome.failures.length, 'worker completed the live settlements and restoration')
  const durations = {
    raffle: Number(await h.read('ChimeraRaffle', 'duration')),
    oracle: Number(await h.read('ChimeraOracle', 'roundLength')),
    dailyGuesses: Number(await h.read('ChimeraOracle', 'dailyGuesses')),
    season: Number(await h.read('ChimeraSeason', 'length')),
  }
  check(durations.raffle === journal.original.raffle.duration && durations.oracle === journal.original.oracle.roundLength && durations.dailyGuesses === journal.original.oracle.dailyGuesses && durations.season === journal.original.season.length, 'live contract rules match the journaled original periods and guess limit')
  result.liveRules = durations
  const hashes = new Map()
  for (const [label, row] of Object.entries(journal.actions)) hashes.set(row.hash, { action: label, role: 'admin' })
  const events = fs.readFileSync(h.directory + '/events.jsonl', 'utf8').trim().split('\n').map(JSON.parse)
  const start = journal.original.observedAt
  for (const row of events) if (row.at >= start && row.hash) hashes.set(row.hash, { action: row.step, player: row.player, role: 'gameplay' })
  const ledger = []
  for (const [hash, label] of hashes) {
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Malformed logged transaction hash for ' + label.action)
    const receipt = await h.publicClient.getTransactionReceipt({ hash })
    check(receipt.status === 'success', 'receipt succeeded: ' + label.action)
    ledger.push({ ...label, hash, status: receipt.status, blockNumber: String(receipt.blockNumber), from: receipt.from, to: receipt.to, gasUsed: String(receipt.gasUsed), gasCostWei: String(receipt.gasUsed * receipt.effectiveGasPrice) })
  }
  for (const [label, row] of [['raffle', outcome.raffle], ['season', outcome.season], ['oracleExpiry', outcome.oracleExpiry]]) check(row.status === 'passed', label + ' live branch passed')
  const raffleReceipt = await h.publicClient.getTransactionReceipt({ hash: outcome.raffle.hash })
  const winner = outcome.raffle.before.participants.find(p => p.address.toLowerCase() === outcome.raffle.winner.toLowerCase())
  const actualGain = await transferred(raffleReceipt, winner.index, h.A.ChimeraRaffle)
  check(actualGain === BigInt(outcome.raffle.prizeBaseUnits), 'fresh FHE decryption of the mined token event confirms the raffle payout')
  const [raffleRound] = await h.read('ChimeraRaffle', 'getRound', [outcome.raffle.round])
  check(raffleRound.done && raffleRound.winner.toLowerCase() === outcome.raffle.winner.toLowerCase(), 'raffle winner remains recorded on Sepolia')
  const seasonReceipt = await h.publicClient.getTransactionReceipt({ hash: outcome.season.hash })
  let paid = 0n
  for (let seat = 0; seat < 3; seat++) {
    const before = outcome.season.before.winners[seat]
    const prize = outcome.season.prizes[seat]
    const gain = await transferred(seasonReceipt, before.index, h.A.ChimeraSeason)
    check(gain === BigInt(prize.paidBaseUnits), 'fresh FHE decryption of the mined token event confirms season seat ' + (seat + 1))
    paid += gain
  }
  check(paid === BigInt(outcome.season.fundedPoolBaseUnits), 'season prizes conserve the entire affordable pool including rounding')
  const jackpotReceipt = await h.publicClient.getTransactionReceipt({ hash: oracle.jackpot.hash })
  const jackpotGain = await transferred(jackpotReceipt, oracle.jackpot.player - 1, h.A.ChimeraOracle)
  check(jackpotGain === BigInt(oracle.jackpot.potBaseUnits), 'fresh FHE decryption of the mined token event confirms the Oracle jackpot')
  const [claim] = await h.read('ChimeraOracle', 'getGuess', [oracle.jackpot.guessId])
  check(claim.won && claim.finalized, 'Oracle winning guess remains finalized')
  const [expired] = await h.read('ChimeraOracle', 'getRound', [outcome.oracleExpiry.round])
  check(expired.ended && /^0x0{40}$/i.test(expired.solver), 'Oracle expiry remains unsolved and closed')
  const total = Number(await h.read('ChimeraLab', 'totalCreatures'))
  const rare = preparation.rareScan.rows.slice()
  const oldTotal = rare.reduce((max, row) => Math.max(max, row.nftId), 0)
  for (let id = oldTotal + 1; id <= total; id++) {
    const creature = await h.read('ChimeraLab', 'getCreature', [id])
    if (!creature.bornAt) continue
    const handles = (await h.read('ChimeraLab', 'getPhenotypeHandles', [id])).slice(0, 7)
    const proof = await h.decrypt(handles)
    const count = handles.filter(handle => Number(proof.clearValues[handle.toLowerCase()] ?? proof.clearValues[handle]) >= 12).length
    rare.push({ nftId: id, rareTraits: count, eligible: count >= 5 })
  }
  result.rareTitle = { scanned: rare.length, eligible: rare.filter(row => row.eligible).map(row => row.nftId), highestRareTraitCount: Math.max(...rare.map(row => row.rareTraits)), naturallyQualifiedSepoliaClaimVerified: false, deterministicLocalBranchTests: 4 }
  const fee = ledger.reduce((sum, row) => sum + BigInt(row.gasCostWei), 0n)
  result.ledger = { transactions: ledger.length, gasEth: formatEther(fee), seasonEndGas: String(seasonReceipt.gasUsed), allReceiptsSuccessful: true }
  result.status = 'passed'
  fs.writeFileSync(h.directory + '/reward-ledger.jsonl', ledger.map(row => JSON.stringify(row)).join('\n') + '\n')
  fs.writeFileSync(h.directory + '/reward-final-verification.json', JSON.stringify(result, null, 2))
  console.log('REWARD_FINAL_VERIFICATION', JSON.stringify({ status: result.status, liveRules: durations, ledger: result.ledger, rareTitle: result.rareTitle, checks: result.checks.length }))
}
main().catch(error => { console.error((error.message || '').slice(0, 1800)); process.exitCode = 1 })
