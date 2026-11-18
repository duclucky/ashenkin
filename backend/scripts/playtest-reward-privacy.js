const fs = require('node:fs')
const h = require('./playtest-keepers')
const a = require('./playtest-activities')
const result = { at: new Date().toISOString(), checks: [] }
async function deny(name, action) {
  let rejected = false
  try { await action() } catch (error) {
    if (!/not authorized|not allowed|not.*public|unauthorized|not.*decryptable/i.test(error.message)) throw error
    rejected = true
  }
  if (!rejected) throw new Error('Confidential state leaked: ' + name)
  result.checks.push({ name, status: 'passed', reason: 'ACL_DENIED' })
}
async function main() {
  const oracleId = await h.read('ChimeraOracle', 'currentRound')
  const [round, answerHandles] = await h.read('ChimeraOracle', 'getRound', [oracleId])
  if (round.ended) throw new Error('A live Oracle round is required for this check')
  const instance = await h.fhe()
  await deny('live Oracle answer cannot be public-decrypted', () => instance.publicDecrypt([...answerHandles]))
  await deny('live Oracle answer cannot be privately decrypted by a player', () => a.privateRead(0, [...answerHandles], 'ChimeraOracle'))
  const run = require(h.directory + '/reward-oracle-result.json')
  const [, ownHint] = await h.read('ChimeraOracle', 'getGuess', [run.nextRound.guessId])
  await deny('Oracle private hint cannot be read by another QA wallet', () => a.privateRead(1, [ownHint], 'ChimeraOracle'))
  const own = await a.privateRead(run.nextRound.player - 1, [ownHint], 'ChimeraOracle')
  if (Object.keys(own).length !== 1) throw new Error('Positive hint read was not verified')
  result.checks.push({ name: 'the same hint is readable by its owner', status: 'passed' })
  const raffleId = await h.read('ChimeraRaffle', 'currentRound')
  const [, winner, pot] = await h.read('ChimeraRaffle', 'getRound', [raffleId])
  if (!/^0x0{64}$/i.test(winner) || !/^0x0{64}$/i.test(pot)) throw new Error('Raffle disclosed winner or pot before draw')
  result.checks.push({ name: 'raffle winner and pot handles are hidden before draw', status: 'passed' })
  const tickets = await h.read('ChimeraRaffle', 'ticketsHandle', [raffleId, h.report.players[2].address])
  await deny('raffle tickets cannot be public-decrypted', () => instance.publicDecrypt([tickets]))
  await deny('raffle tickets cannot be privately read by a different keeper', () => a.privateRead(5, [tickets], 'ChimeraRaffle'))
  const privateCount = await a.privateRead(2, [tickets], 'ChimeraRaffle')
  if (Number(Object.values(privateCount)[0]) !== 5) throw new Error('Positive private ticket read failed')
  result.checks.push({ name: 'owner can read their paid raffle tickets', status: 'passed' })
  const potHandle = await h.read('ChimeraOracle', 'potHandle')
  await instance.publicDecrypt([potHandle])
  result.checks.push({ name: 'public Oracle pot remains decryptable: relayer is healthy', status: 'passed' })
  result.status = 'passed'
  fs.writeFileSync(h.directory + '/reward-privacy.json', JSON.stringify(result, null, 2))
  console.log('REWARD_PRIVACY', JSON.stringify(result))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
