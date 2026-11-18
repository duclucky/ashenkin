const fs = require('node:fs')
const h = require('./playtest-keepers')
const a = require('./playtest-activities')
const privateFile = h.directory + '/reward-oracle-private.json'
const resultFile = h.directory + '/reward-oracle-result.json'
const outcome = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile)) : {}
let state = fs.existsSync(privateFile) ? JSON.parse(fs.readFileSync(privateFile)) : null
const persist = () => fs.writeFileSync(privateFile, JSON.stringify(state), { mode: 0o600 })
const saveOutcome = () => fs.writeFileSync(resultFile, JSON.stringify(outcome, null, 2))
const who = i => h.report.players[i].address
const code = (guess, answer) => guess === answer ? 2 : Math.abs(guess - answer) <= 2 ? 1 : 0

function probe(candidates) {
  if (candidates.length === 1) return candidates[0]
  const options = Array.from({ length: 16 }, (_, q) => {
    const buckets = [0, 0, 0]
    for (const answer of candidates) buckets[code(q, answer)]++
    return { q, worst: Math.max(...buckets), expected: buckets.reduce((sum, n) => sum + n * n, 0), exact: candidates.includes(q) ? 1 : 0 }
  })
  options.sort((x, y) => x.worst - y.worst || x.expected - y.expected || y.exact - x.exact || x.q - y.q)
  return options[0].q
}

async function guess(index, genes, label) {
  await h.operator(index, 'ChimeraOracle')
  const packed = genes.reduce((sum, value, i) => sum | value << (4 * i), 0)
  const input = await h.seal(index, 'ChimeraOracle', [[16, packed]])
  const sent = await h.tx(index, label, 'ChimeraOracle', 'guess', [input.handles[0], input.proof])
  const [event] = await h.events(sent, 'ChimeraOracle', 'Guessed')
  const values = await a.privateRead(index, [event.feedbackHandle], 'ChimeraOracle')
  const feedback = Number(Object.values(values)[0])
  if (feedback === 255) throw new Error('Oracle rejected payment; no useful private feedback')
  return { index, id: Number(event.guessId), round: Number(event.round), feedback, genes, hash: sent.hash }
}

async function balance(index) {
  const handle = await h.read(h.CZ, 'confidentialBalanceOf', [who(index)])
  return BigInt(Object.values(await a.privateRead(index, [handle], h.CZ))[0])
}

async function main() {
  const current = Number(await h.read('ChimeraOracle', 'currentRound'))
  if (!state) {
    state = { round: current, candidates: Array.from({ length: 4 }, () => Array.from({ length: 16 }, (_, n) => n)), probes: [], iteration: 0 }
    const prior = h.report.players[4].steps['oracle-guess']
    if (prior?.guessId && prior.feedback !== undefined) {
      const [value] = await h.read('ChimeraOracle', 'getGuess', [BigInt(prior.guessId)])
      if (Number(value.round) === current) {
        const genes = [0, 1, 2, 3]
        for (let i = 0; i < 4; i++) state.candidates[i] = state.candidates[i].filter(v => code(genes[i], v) === (Number(prior.feedback) >> (2 * i) & 3))
      }
    }
    persist()
  }
  if (!outcome.jackpot) {
    let solved = state.solved
    for (; !solved && state.iteration < 16;) {
      const [round] = await h.read('ChimeraOracle', 'getRound', [state.round])
      if (round.ended || current !== state.round) throw new Error('Oracle round changed before QA could solve it')
      let index
      for (const i of [4, 0, 1, 2, 3, 5, 6, 7, 8, 9]) if (Number(await h.read('ChimeraOracle', 'guessesLeft', [who(i)])) > 0) { index = i; break }
      if (index === undefined) throw new Error('All QA accounts reached the unchanged daily guess limit')
      const genes = state.pending?.genes || state.candidates.map(probe)
      index = state.pending?.index ?? index
      state.pending = { genes, index }
      persist()
      const result = await guess(index, genes, 'reward-oracle-probe-' + state.iteration)
      if (result.round !== state.round) throw new Error('Probe entered a different Oracle round')
      const codes = genes.map((_, i) => result.feedback >> (2 * i) & 3)
      for (let i = 0; i < 4; i++) {
        state.candidates[i] = state.candidates[i].filter(v => code(genes[i], v) === codes[i])
        if (!state.candidates[i].length) throw new Error('Oracle private feedback contradicts an earlier hint')
      }
      state.probes.push(result)
      state.iteration++
      delete state.pending
      if (codes.every(v => v === 2)) state.solved = solved = result
      persist()
      h.log(index, 'reward-oracle-private-search', { guessId: result.id, iteration: state.iteration, privateFeedbackVerified: true, remainingCandidates: state.candidates.map(v => v.length) })
    }
    if (!solved) throw new Error('Bounded Oracle search did not find an exact guess')
    const index = solved.index
    await h.tx(index, 'reward-oracle-claim', 'ChimeraOracle', 'claim', [BigInt(solved.id)])
    const [, , handle] = await h.read('ChimeraOracle', 'getGuess', [BigInt(solved.id)])
    const proof = await h.decrypt([handle])
    if (Object.values(proof.clearValues)[0] !== true) throw new Error('KMS did not confirm the exact guess')
    if (!outcome.before) {
      const potHandle = await h.read('ChimeraOracle', 'potHandle')
      const pot = BigInt(Object.values((await h.decrypt([potHandle])).clearValues)[0])
      const before = await balance(index)
      outcome.before = { balance: String(before), pot: String(pot), solves: Number(await h.read('ChimeraOracle', 'solves', [who(index)])) }
      saveOutcome()
    }
    const pot = BigInt(outcome.before.pot)
    const before = BigInt(outcome.before.balance)
    const sent = await h.tx(index, 'reward-oracle-jackpot-finalize', 'ChimeraOracle', 'finalize', [BigInt(solved.id), proof.abiEncodedClearValues, proof.decryptionProof])
    const after = await balance(index)
    const [event] = await h.events(sent, 'ChimeraOracle', 'Solved')
    const [round, answers] = await h.read('ChimeraOracle', 'getRound', [state.round])
    const revealed = await h.decrypt(answers)
    const answer = answers.map(handle => Number(revealed.clearValues[handle.toLowerCase()] ?? revealed.clearValues[handle]))
    if (!round.ended || round.solver.toLowerCase() !== who(index).toLowerCase() || after - before !== pot || !event.relicId) throw new Error('Jackpot payout, solver or Relic reward mismatch')
    if (Number(await h.read('ChimeraOracle', 'solves', [who(index)])) !== outcome.before.solves + 1) throw new Error('Oracle solve count mismatch')
    if (answer.some((v, i) => v !== solved.genes[i])) throw new Error('Revealed answer differs from the winning guess')
    outcome.jackpot = { status: 'passed', round: state.round, guessId: solved.id, player: index + 1, winner: who(index), hash: sent.hash, potBaseUnits: String(pot), balanceIncreaseBaseUnits: String(after - before), relicId: Number(event.relicId), answerPublicAfterRoundEnded: answer, solvedUsingPrivateHintsOnly: true, probes: state.probes.length }
    saveOutcome()
    h.log(index, 'reward-oracle-jackpot-verified', outcome.jackpot)
  }
  if (!outcome.nextRound) {
    let index
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8, 9, 4]) if (Number(await h.read('ChimeraOracle', 'guessesLeft', [who(i)])) > 0) { index = i; break }
    if (index === undefined) throw new Error('No remaining QA guesses to open the expiry test round')
    const result = await guess(index, [1, 2, 3, 4], 'reward-oracle-open-expiry-round')
    outcome.nextRound = { id: result.round, player: index + 1, guessId: result.id, hash: result.hash }
    saveOutcome()
  }
  console.log('ORACLE_REWARD_RESULT', JSON.stringify(outcome))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
