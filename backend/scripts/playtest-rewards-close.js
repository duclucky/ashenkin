const fs = require('node:fs')
const h = require('./playtest-keepers')
const a = require('./playtest-activities')
const d = require(h.directory + '/deployment.json')
const journal = require(h.directory + '/reward-deadlines.json')
const oracleRun = require(h.directory + '/reward-oracle-result.json')
const file = h.directory + '/reward-settlement-result.json'
const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}
const save = () => fs.writeFileSync(file, JSON.stringify(result, null, 2))
const who = i => h.report.players[i].address
const indexOf = address => h.report.players.findIndex(p => p.address.toLowerCase() === address.toLowerCase())
const zero = address => /^0x0{40}$/i.test(address)
const clear = async handle => BigInt(Object.values((await h.decrypt([handle])).clearValues)[0])
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function readAt(contract, functionName, args, blockNumber) {
  const address = contract.startsWith('0x') ? contract : h.A[contract]
  const abi = d.abis[contract] || h.tokenAbi
  for (let attempt = 0; ; attempt++) {
    try { return await h.publicClient.readContract({ address, abi, functionName, args, blockNumber }) } catch (error) {
      if (attempt >= 4 || !/block.*not found|header.*not found|unknown block/i.test(error.message)) throw error
      await sleep(2000)
    }
  }
}

async function balance(index, blockNumber) {
  const handle = blockNumber === undefined ? await h.read(h.CZ, 'confidentialBalanceOf', [who(index)])
    : await readAt(h.CZ, 'confidentialBalanceOf', [who(index)], blockNumber)
  return BigInt(Object.values(await a.privateRead(index, [handle], h.CZ))[0])
}
async function reserve(label) {
  const sent = await h.tx(6, label, 'ChimeraTreasury', 'publishReserve')
  const [event] = await h.events(sent, 'ChimeraTreasury', 'ReservePublished')
  return clear(event.handle)
}
async function denied(index, contract, method, args, reason, blockNumber) {
  try {
    await h.publicClient.simulateContract({ account: who(index), address: h.A[contract], abi: d.abis[contract], functionName: method, args, blockNumber })
  } catch (error) {
    if (error.message.includes(reason)) return true
    throw error
  }
  throw new Error('Replay or premature action was unexpectedly accepted: ' + method)
}

async function raffle() {
  if (result.raffle?.status === 'passed') return
  const id = journal.original.raffle.id
  result.raffle ??= {}
  if (!result.raffle.before) {
    const participants = []
    for (let i = 0; i < 10; i++) if (await h.read('ChimeraRaffle', 'entered', [id, who(i)])) participants.push({ index: i, address: who(i), balance: String(await balance(i)), wins: Number(await h.read('ChimeraRaffle', 'wins', [who(i)])) })
    result.raffle.before = { participants, reserve: String(await reserve('reward-raffle-reserve-before')) }
    save()
  }
  const before = result.raffle.before
  await h.tx(6, 'reward-raffle-draw', 'ChimeraRaffle', 'draw')
  const [, winnerHandle, potHandle] = await h.read('ChimeraRaffle', 'getRound', [id])
  const proof = await h.decrypt([winnerHandle, potHandle])
  const winner = proof.clearValues[winnerHandle.toLowerCase()] ?? proof.clearValues[winnerHandle]
  const pot = BigInt(proof.clearValues[potHandle.toLowerCase()] ?? proof.clearValues[potHandle])
  const sent = await h.tx(6, 'reward-raffle-finalize', 'ChimeraRaffle', 'finalize', [proof.abiEncodedClearValues, proof.decryptionProof])
  const receipt = await h.publicClient.getTransactionReceipt({ hash: sent.hash })
  const [round] = await readAt('ChimeraRaffle', 'getRound', [id], receipt.blockNumber)
  const account = before.participants.find(p => p.address.toLowerCase() === winner.toLowerCase())
  if (!account) throw new Error('Raffle winner was not one of the controlled paid participants')
  const rake = pot * 10n / 100n
  const gain = await balance(account.index, receipt.blockNumber) - BigInt(account.balance)
  const reserveGain = await reserve('reward-raffle-reserve-after') - BigInt(before.reserve)
  const [relic] = await readAt('ChimeraRelics', 'getRelic', [round.relicId], receipt.blockNumber)
  if (!round.done || round.winner.toLowerCase() !== winner.toLowerCase() || BigInt(round.pot) !== pot || gain !== pot - rake || reserveGain !== rake || relic.keeper.toLowerCase() !== winner.toLowerCase()) throw new Error('Raffle payout, rake or Relic recipient differs from verified draw')
  if (Number(await readAt('ChimeraRaffle', 'wins', [winner], receipt.blockNumber)) !== account.wins + 1 || Number(await readAt('ChimeraRaffle', 'currentRound', [], receipt.blockNumber)) !== id + 1) throw new Error('Raffle counters or next round mismatch')
  await denied(6, 'ChimeraRaffle', 'finalize', [proof.abiEncodedClearValues, proof.decryptionProof], 'NotDrawing', receipt.blockNumber)
  Object.assign(result.raffle, { status: 'passed', round: id, winner, potBaseUnits: String(pot), prizeBaseUnits: String(gain), treasuryIncreaseBaseUnits: String(reserveGain), relicId: Number(round.relicId), replayBlocked: true, hash: sent.hash })
  save()
  h.log(account.index, 'reward-raffle-payout-verified', result.raffle)
}

async function season() {
  if (result.season?.status === 'passed') return
  const id = journal.original.season.id
  result.season ??= {}
  if (!result.season.before) {
    const [holders, scores] = await h.read('ChimeraSeason', 'getThrones')
    if (holders.some(zero)) throw new Error('The three test season seats are not all occupied')
    const winners = []
    for (let seat = 0; seat < 3; seat++) {
      const index = indexOf(holders[seat])
      if (index < 0) throw new Error('Season holder is not a QA account; balance verification unavailable')
      winners.push({ index, address: who(index), balance: String(await balance(index)), crowns: Number(await h.read('ChimeraSeason', 'crowns', [who(index)])), weight: String(await h.read('ChimeraSeason', 'prizes', [seat])) })
    }
    const available = await reserve('reward-season-reserve-before')
    const block = await h.publicClient.getBlock()
    const day = block.timestamp / 86400n
    const budgetDay = BigInt(await h.read('ChimeraTreasury', 'budgetDay'))
    let budget
    if (day !== budgetDay) {
      const cap = BigInt(await h.read('ChimeraTreasury', 'DAILY_BUDGET_CAP'))
      budget = available / 100n < cap ? available / 100n : cap
    } else {
      const [, remaining] = await h.read('ChimeraTreasury', 'budgetHandles')
      budget = await clear(remaining)
    }
    const requested = winners.reduce((sum, p) => sum + BigInt(p.weight), 0n)
    const pool = [requested, available, budget].reduce((min, n) => n < min ? n : min)
    result.season.before = { winners, scores: scores.map(Number), reserve: String(available), budget: String(budget), requested: String(requested), funded: String(pool), relics: String(await h.read('ChimeraRelics', 'totalRelics')) }
    save()
  }
  const before = result.season.before
  const sent = await h.tx(6, 'reward-season-end', 'ChimeraSeason', 'endSeason')
  const receipt = await h.publicClient.getTransactionReceipt({ hash: sent.hash })
  const stored = await readAt('ChimeraSeason', 'winnersOf', [id], receipt.blockNumber)
  const pool = BigInt(before.funded)
  const requested = BigInt(before.requested)
  let remaining = pool
  const paid = []
  for (let seat = 0; seat < 3; seat++) {
    const p = before.winners[seat]
    const expected = seat === 2 ? remaining : pool * BigInt(p.weight) / requested
    const increase = await balance(p.index, receipt.blockNumber) - BigInt(p.balance)
    const handle = await readAt('ChimeraSeason', 'prizePaid', [id, p.address], receipt.blockNumber)
    // prizePaid is a transfer result created by cZAMA, not by the Season contract.
    const amount = BigInt(Object.values(await a.privateRead(p.index, [handle], h.CZ))[0])
    if (increase !== expected || amount !== expected || stored[seat].toLowerCase() !== p.address.toLowerCase()) throw new Error('Season prize or rounding differs at seat ' + seat)
    if (Number(await readAt('ChimeraSeason', 'rankIn', [id, p.address], receipt.blockNumber)) !== seat + 1 || Number(await readAt('ChimeraSeason', 'crowns', [p.address], receipt.blockNumber)) !== p.crowns + 1) throw new Error('Season crown or rank missing')
    remaining -= expected
    paid.push({ address: p.address, rank: seat + 1, paidBaseUnits: String(amount) })
  }
  const caches = await h.events(sent, 'ChimeraRelics', 'CacheOpened')
  if (caches.length !== 3 || !before.winners.every(p => caches.some(cache => cache.keeper.toLowerCase() === p.address.toLowerCase()))) throw new Error('Season Relic cache recipients mismatch')
  if (Number(await readAt('ChimeraSeason', 'season', [], receipt.blockNumber)) !== id + 1 || !(await readAt('ChimeraSeason', 'getThrones', [], receipt.blockNumber))[0].every(zero)) throw new Error('Next season was not reset')
  await denied(6, 'ChimeraSeason', 'endSeason', [], 'SeasonRunning', receipt.blockNumber)
  await h.tx(0, 'reward-season-rejoin', 'ChimeraSeason', 'join')
  if (Number(await h.read('ChimeraSeason', 'scoreOf', [who(0)])) !== 0) throw new Error('New season inherited an old score')
  Object.assign(result.season, { status: 'passed', season: id, fundedPoolBaseUnits: String(pool), prizes: paid, threeRelicCachesGranted: true, nextSeason: id + 1, replayBlocked: true, rejoinVerified: true, hash: sent.hash })
  save()
  h.log(6, 'reward-season-payouts-verified', result.season)
}

async function oracleExpiry() {
  if (result.oracleExpiry?.status === 'passed') return
  const id = oracleRun.nextRound.id
  result.oracleExpiry ??= {}
  if (!result.oracleExpiry.before) {
    const [round] = await h.read('ChimeraOracle', 'getRound', [id])
    const potHandle = await h.read('ChimeraOracle', 'potHandle')
    result.oracleExpiry.before = { pot: String(await clear(potHandle)), potHandle, startedAt: Number(round.startedAt), length: Number(await h.read('ChimeraOracle', 'roundLength')) }
    save()
  }
  const sent = await h.tx(0, 'reward-oracle-expire', 'ChimeraOracle', 'expire')
  const [round, handles] = await h.read('ChimeraOracle', 'getRound', [id])
  const proof = await h.decrypt(handles)
  const answer = handles.map(handle => Number(proof.clearValues[handle.toLowerCase()] ?? proof.clearValues[handle]))
  const receipt = await h.publicClient.getTransactionReceipt({ hash: sent.hash })
  const expiredPot = await h.publicClient.readContract({ address: h.A.ChimeraOracle, abi: d.abis.ChimeraOracle, functionName: 'potHandle', blockNumber: receipt.blockNumber })
  const after = await clear(expiredPot)
  if (!round.ended || !zero(round.solver) || Number(round.endedAt) < journal.target || String(after) !== result.oracleExpiry.before.pot || !answer.every(n => n >= 0 && n < 16)) throw new Error('Oracle expiry, public answer or rollover failed')
  await denied(oracleRun.nextRound.player - 1, 'ChimeraOracle', 'claim', [BigInt(oracleRun.nextRound.guessId)], 'StaleGuess')
  const input = await h.seal(0, 'ChimeraOracle', [[16, 0x5432]])
  const next = await h.tx(0, 'reward-oracle-open-post-expiry-round', 'ChimeraOracle', 'guess', [input.handles[0], input.proof])
  const nextReceipt = await h.publicClient.getTransactionReceipt({ hash: next.hash })
  const nextPot = await h.publicClient.readContract({ address: h.A.ChimeraOracle, abi: d.abis.ChimeraOracle, functionName: 'potHandle', blockNumber: nextReceipt.blockNumber })
  const newPot = await clear(nextPot)
  if (Number(await h.read('ChimeraOracle', 'currentRound')) !== id + 1 || newPot !== after + 2_000_000n) throw new Error('Jackpot did not roll into the next paid round')
  Object.assign(result.oracleExpiry, { status: 'passed', round: id, potPreservedBaseUnits: String(after), answerPublicAfterExpiry: answer, nextRound: id + 1, nextPotBaseUnits: String(newPot), staleClaimBlocked: true, hash: sent.hash, nextRoundHash: next.hash })
  save()
  h.log(0, 'reward-oracle-expiry-verified', result.oracleExpiry)
}

async function main() {
  const until = Date.now() + 180_000
  while (Number((await h.publicClient.getBlock()).timestamp) < journal.target) {
    if (Date.now() > until) throw new Error('Sepolia block timestamp has not reached the QA deadline')
    await sleep(3000)
  }
  const failures = []
  for (const [label, action] of [['raffle', raffle], ['season', season], ['oracleExpiry', oracleExpiry]]) {
    try {
      for (let attempt = 0; ; attempt++) {
        try { await action(); break } catch (error) {
          let safe = /HTTP 409|not authorized|not allowed/i.test(error.message)
          if (/Circle transaction failed/.test(error.message)) {
            for (const p of h.report.players) for (const [key, value] of Object.entries(p.steps)) {
              if (!key.startsWith('reward-') || value.status !== 'failed' || !value.request) continue
              const inScope = label === 'oracleExpiry' ? /reward-oracle-(?:expire|open-post-expiry-round)/.test(key) : key.startsWith('reward-' + label + '-')
              if (!inScope) continue
              const info = await h.api(p.player - 1, 'keeper/transactions/' + value.request.id)
              if (info.retryable && !info.hash) safe = true
            }
          }
          if (!safe || attempt >= 2) throw error
          console.warn(JSON.stringify({ event: 'reward-safe-retry', label, attempt: attempt + 1 }))
          await sleep(12_000)
        }
      }
    } catch (error) {
      const message = error.shortMessage || error.message
      result[label] = { ...result[label], status: 'failed', error: message }
      save()
      failures.push({ label, error: message })
      console.error(JSON.stringify({ event: 'reward-close-error', label, error: message }))
    }
  }
  result.finishedAt = new Date().toISOString()
  result.failures = failures
  save()
  console.log('REWARD_SETTLEMENT_RESULT', JSON.stringify({ failures, finishedAt: result.finishedAt }))
  if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
