// Production QA only. Persist original rules before changing any deadline.
const fs = require('node:fs')
const { createWalletClient, http } = require('viem')
const { privateKeyToAccount, nonceManager } = require('viem/accounts')
const { sepolia } = require('viem/chains')
const h = require('./playtest-keepers')
const d = require(h.directory + '/deployment.json')
const file = h.directory + '/reward-deadlines.json'
const account = privateKeyToAccount(process.env.CHIMERA_SETTLEMENT_PRIVATE_KEY, { nonceManager })
const wallet = createWalletClient({ account, chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') })
let journal = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null
const save = () => fs.writeFileSync(file, JSON.stringify(journal, null, 2), { mode: 0o600 })
const log = row => {
  row.at = new Date().toISOString()
  fs.appendFileSync(h.directory + '/reward-events.jsonl', JSON.stringify(row) + '\n')
  console.log(JSON.stringify(row))
}

async function snapshot() {
  const raffleId = await h.read('ChimeraRaffle', 'currentRound')
  const [raffle] = await h.read('ChimeraRaffle', 'getRound', [raffleId])
  const oracleId = await h.read('ChimeraOracle', 'currentRound')
  const [oracle] = await h.read('ChimeraOracle', 'getRound', [oracleId])
  return {
    observedAt: new Date().toISOString(),
    raffle: { id: Number(raffleId), startedAt: Number(raffle.startedAt), endsAt: Number(raffle.endsAt), duration: Number(await h.read('ChimeraRaffle', 'duration')), done: raffle.done },
    oracle: { id: Number(oracleId), startedAt: Number(oracle.startedAt), roundLength: Number(await h.read('ChimeraOracle', 'roundLength')), dailyGuesses: Number(await h.read('ChimeraOracle', 'dailyGuesses')), ended: oracle.ended },
    season: { id: Number(await h.read('ChimeraSeason', 'season')), startedAt: Number(await h.read('ChimeraSeason', 'startedAt')), endsAt: Number(await h.read('ChimeraSeason', 'endsAt')), length: Number(await h.read('ChimeraSeason', 'length')) },
  }
}

async function send(label, contract, functionName, args) {
  if (journal.actions[label]) {
    const old = await h.publicClient.waitForTransactionReceipt({ hash: journal.actions[label].hash, timeout: 180_000 })
    if (old.status !== 'success') throw new Error('Previous admin action reverted: ' + label)
    return
  }
  const request = { account, address: h.A[contract], abi: d.abis[contract], functionName, args }
  await h.publicClient.simulateContract(request)
  const gas = await h.publicClient.estimateContractGas(request)
  const fees = await h.publicClient.estimateFeesPerGas()
  if (fees.maxFeePerGas > 3_000_000_000n) throw new Error('Admin transaction exceeds the approved QA gas ceiling')
  const hash = await wallet.writeContract({ ...request, gas: gas * 12n / 10n, ...fees })
  journal.actions[label] = { hash, contract, functionName, args: args.map(String) }
  save()
  const receipt = await h.publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
  if (receipt.status !== 'success') throw new Error('Admin action reverted: ' + label)
  Object.assign(journal.actions[label], { status: 'success', gasCostWei: String(receipt.gasUsed * receipt.effectiveGasPrice) })
  save()
  log({ event: label, ...journal.actions[label] })
}

async function main() {
  const mode = process.argv[2] || 'status'
  for (const contract of ['ChimeraRaffle', 'ChimeraOracle', 'ChimeraSeason']) {
    const owner = await h.read(contract, 'owner')
    if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error('QA sponsor does not own ' + contract)
  }
  if (mode === 'shorten') {
    if (!journal) {
      const original = await snapshot()
      const block = await h.publicClient.getBlock()
      journal = { original, target: Number(block.timestamp) + 3600, owner: account.address, actions: {}, restored: false }
      save()
    }
    const o = journal.original
    await send('shorten-raffle', 'ChimeraRaffle', 'setDuration', [BigInt(journal.target - o.raffle.startedAt), true])
    await send('shorten-season', 'ChimeraSeason', 'setLength', [BigInt(journal.target - o.season.startedAt), true])
    await send('shorten-oracle', 'ChimeraOracle', 'setRules', [BigInt(journal.target - o.oracle.startedAt), o.oracle.dailyGuesses])
  }
  if (mode === 'align-oracle') {
    if (!journal || journal.restored) throw new Error('No active QA deadline to align')
    const state = await snapshot()
    if (state.oracle.ended || state.oracle.startedAt >= journal.target) throw new Error('Oracle is not an active round before the QA deadline')
    await send('align-oracle-' + state.oracle.id, 'ChimeraOracle', 'setRules', [BigInt(journal.target - state.oracle.startedAt), journal.original.oracle.dailyGuesses])
  }
  if (mode === 'restore') {
    if (!journal) throw new Error('Original rules have not been journaled')
    await send('restore-raffle', 'ChimeraRaffle', 'setDuration', [BigInt(journal.original.raffle.duration), true])
    await send('restore-season', 'ChimeraSeason', 'setLength', [BigInt(journal.original.season.length), true])
    await send('restore-oracle', 'ChimeraOracle', 'setRules', [BigInt(journal.original.oracle.roundLength), journal.original.oracle.dailyGuesses])
    journal.restored = true
  }
  const state = await snapshot()
  if (journal) {
    journal.latest = state
    save()
  }
  console.log('REWARD_DEADLINES', JSON.stringify({ targetUTC: journal ? new Date(journal.target * 1000).toISOString() : null, restored: journal?.restored, state }))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
