// Run inside the release container. Keys and sessions stay in the private audit directory.
const fs = require('node:fs')
const path = require('node:path')
const { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi, parseEventLogs, parseEther, formatEther } = require('viem')
const { generatePrivateKey, privateKeyToAccount, nonceManager } = require('viem/accounts')
const { sepolia } = require('viem/chains')
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node')

const directory = process.env.PLAYTEST_DIR || '/app/backend/db/playtest-20261118'
fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
const deployment = JSON.parse(fs.readFileSync(path.join(directory, 'deployment.json'), 'utf8'))
const privateFile = path.join(directory, 'private.json')
const reportFile = path.join(directory, 'report.json')
const logFile = path.join(directory, 'events.jsonl')
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)
const secret = fs.existsSync(privateFile) ? JSON.parse(fs.readFileSync(privateFile, 'utf8')) : { players: Array.from({ length: 10 }, () => ({ pk: generatePrivateKey() })) }
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : { startedAt: new Date().toISOString(), origin: 'https://ashenkin.xyz', players: Array.from({ length: 10 }, (_, index) => ({ player: index + 1, steps: {} })) }
const A = deployment.addresses
const CZ = deployment.cZAMA
const ZAMA = deployment.zamaMock
const tokenAbi = parseAbi(['function mint(address,uint256)', 'function approve(address,uint256)', 'function wrap(address,uint256)', 'function setOperator(address,uint48)', 'function isOperator(address,address) view returns(bool)', 'function confidentialBalanceOf(address) view returns(bytes32)'])
const publicClient = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 15_000, retryCount: 1 }), pollingInterval: 2500 })
const payer = privateKeyToAccount(process.env.CHIMERA_SETTLEMENT_PRIVATE_KEY, { nonceManager })
const payerWallet = createWalletClient({ account: payer, chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') })
const abiOf = contract => deployment.abis[contract] || tokenAbi
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let fhePromise
const fhe = () => fhePromise ??= createInstance({ ...SepoliaConfig, network: 'https://ethereum-sepolia-rpc.publicnode.com' })
let fundingQueue = Promise.resolve()

function save() {
  fs.writeFileSync(privateFile, stringify(secret), { mode: 0o600 })
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
}
function log(player, step, details) {
  const item = { at: new Date().toISOString(), player: player + 1, step, ...details }
  fs.appendFileSync(logFile, stringify(item) + '\n')
  console.log(stringify(item))
}
save()

async function api(index, route, body, timeout = 90_000) {
  const response = await fetch('https://ashenkin.xyz/api/' + route, {
    headers: { 'User-Agent': 'Mozilla/5.0 AshenkinPlaytest', Origin: 'https://ashenkin.xyz', 'Content-Type': 'application/json', ...(secret.players[index].cookie ? { Cookie: secret.players[index].cookie } : {}) },
    ...(body !== undefined ? { method: 'POST', body: stringify(body) } : {}),
    signal: AbortSignal.timeout(timeout),
  })
  const cookie = response.headers.get('set-cookie')
  if (cookie) { secret.players[index].cookie = cookie.split(';', 1)[0]; save() }
  const result = await response.json()
  if (!response.ok) {
    log(index, route, { type: 'api-error', status: response.status, error: result.error || result.code })
    throw new Error('HTTP ' + response.status + ': ' + (result.error || result.code))
  }
  return result
}

async function login(index) {
  if (secret.players[index].cookie) {
    const current = await api(index, 'keeper')
    if (current.address && current.address === report.players[index].address) return
  }
  const account = privateKeyToAccount(secret.players[index].pk)
  const challenge = await api(index, 'keeper/wallet/start', { address: account.address })
  const signature = await account.signMessage({ message: challenge.message })
  const start = performance.now()
  let keeper = await api(index, 'keeper/wallet/finish', { id: challenge.id, signature })
  if (!keeper.address) keeper = await api(index, 'keeper/provision', {})
  const old = report.players[index].address
  if (old && old.toLowerCase() !== keeper.address.toLowerCase()) throw new Error('Wallet recovery mismatch')
  report.players[index].address = keeper.address
  report.players[index].identity = account.address
  log(index, 'wallet-login', { status: 'passed', elapsedMs: Math.round(performance.now() - start), signature: 'SIWE', wallet: keeper.address, restored: !!old })
  save()
}

async function step(index, name, work) {
  const previous = report.players[index].steps[name]
  if (previous?.status === 'passed') return previous
  const started = performance.now()
  log(index, name, { status: 'started' })
  try {
    const result = await work(previous) || {}
    const record = { ...result, status: 'passed', elapsedMs: Math.round(performance.now() - started), finishedAt: new Date().toISOString() }
    report.players[index].steps[name] = record
    save()
    log(index, name, record)
    return record
  } catch (error) {
    const record = { ...report.players[index].steps[name], status: 'failed', error: error.shortMessage || error.message, elapsedMs: Math.round(performance.now() - started) }
    report.players[index].steps[name] = record
    save()
    log(index, name, record)
    throw error
  }
}

async function fund(index, target = '0.01') {
  const address = report.players[index].address
  const current = await publicClient.getBalance({ address })
  if (current >= parseEther(target) / 2n) return
  const work = async () => {
    const balance = await publicClient.getBalance({ address })
    if (balance >= parseEther(target) / 2n) return
    const given = BigInt(report.players[index].manualFundingWei || '0')
    const value = parseEther(target) - balance
    if (given + value > parseEther('0.05')) throw new Error('Playtest account funding cap reached')
    const fees = await publicClient.estimateFeesPerGas()
    if (fees.maxFeePerGas > 3_000_000_000n) throw new Error('Sepolia fee exceeds playtest cap')
    const estimate = await publicClient.estimateGas({ account: payer.address, to: address, value })
    const hash = await payerWallet.sendTransaction({ to: address, value, gas: estimate * 12n / 10n, ...fees })
    report.players[index].manualFundingWei = (given + value).toString()
    report.players[index].fundingHashes ??= []
    report.players[index].fundingHashes.push(hash)
    save()
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
    if (receipt.status !== 'success') throw new Error('Funding reverted')
    log(index, 'deployer-funding', { status: 'passed', amount: formatEther(value), hash })
  }
  const job = fundingQueue.then(work)
  fundingQueue = job.catch(() => {})
  await job
}

async function finishTx(index, name, submitted) {
  let hash = submitted.hash
  if (!hash) {
    const until = Date.now() + 240_000
    let prior
    while (Date.now() < until) {
      const info = await api(index, 'keeper/transactions/' + submitted.id + '?address=' + report.players[index].address)
      if (info.state !== prior) { log(index, name, { circleState: info.state, hash: info.hash }); prior = info.state }
      if (info.failed) throw new Error('Circle transaction failed: ' + info.state)
      if (info.hash) { hash = info.hash; break }
      await delay(2300)
    }
  }
  if (!hash) throw new Error('Transaction hash not ready after 4 minutes')
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
  if (receipt.status !== 'success') {
    const tx = await publicClient.getTransaction({ hash })
    log(index, name, { type: 'revert', hash, gasUsed: String(receipt.gasUsed), gasLimit: String(tx.gas) })
    throw new Error('Sepolia transaction reverted: ' + hash)
  }
  return { hash, gasUsed: String(receipt.gasUsed), gasCostWei: String(receipt.gasUsed * receipt.effectiveGasPrice) }
}

async function tx(index, name, contract, functionName, args = []) {
  return step(index, name, async previous => {
    const address = contract.startsWith('0x') ? contract : A[contract]
    const data = encodeFunctionData({ abi: abiOf(contract), functionName, args })
    if (previous?.hash) {
      const receipt = await publicClient.getTransactionReceipt({ hash: previous.hash }).catch(() => null)
      if (receipt?.status === 'success') return { ...previous, ...await finishTx(index, name, { hash: previous.hash }) }
    }
    await fund(index)
    let request = previous?.request
    if (request) {
      const status = await api(index, 'keeper/transactions/' + request.id + '?address=' + report.players[index].address)
      if (status.failed) request = null
    }
    request ??= await api(index, 'keeper/transactions', { address: report.players[index].address, destination: address, data })
    report.players[index].steps[name] = { request, status: 'pending' }
    save()
    return { request, ...await finishTx(index, name, request) }
  })
}

async function read(contract, functionName, args = []) {
  return publicClient.readContract({ address: contract.startsWith('0x') ? contract : A[contract], abi: abiOf(contract), functionName, args })
}
async function events(record, contract, eventName) {
  const receipt = await publicClient.getTransactionReceipt({ hash: record.hash })
  return parseEventLogs({ abi: abiOf(contract), eventName, logs: receipt.logs, strict: false }).filter(item => item.address.toLowerCase() === A[contract].toLowerCase()).map(item => item.args)
}
async function seal(index, contract, values) {
  const input = (await fhe()).createEncryptedInput(A[contract], report.players[index].address)
  for (const [bits, value] of values) input['add' + bits](value)
  const encrypted = await input.encrypt()
  return { handles: encrypted.handles.map(handle => typeof handle === 'string' ? handle : '0x' + Buffer.from(handle).toString('hex')), proof: typeof encrypted.inputProof === 'string' ? encrypted.inputProof : '0x' + Buffer.from(encrypted.inputProof).toString('hex') }
}
async function decrypt(handles) {
  let error
  for (let attempt = 0; attempt < 14; attempt++) {
    try { return await (await fhe()).publicDecrypt(handles) } catch (caught) { error = caught; await delay(3000) }
  }
  throw error
}
async function operator(index, contract) {
  const address = report.players[index].address
  if (await read(CZ, 'isOperator', [address, A[contract]])) return
  return tx(index, 'allow-' + contract, CZ, 'setOperator', [A[contract], BigInt(Math.floor(Date.now() / 1000) + 30 * 86400)])
}
async function settle(index, name, kind, id, handles, contract, method) {
  return step(index, name, async () => {
    const sponsored = ['battle', 'egg', 'training'].includes(kind)
    if (sponsored) {
      const result = await api(index, 'settlement', { world: 'ashenkin', kind, id: Number(id), handles }, 110_000)
      return finishTx(index, name, result)
    }
    const proof = await decrypt(handles)
    return tx(index, name + '-transaction', contract, method, [BigInt(id), proof.abiEncodedClearValues, proof.decryptionProof])
  })
}

async function setup(index) {
  await login(index)
  await step(index, 'starter-mint', async previous => {
    const ids = await read('ChimeraLab', 'creaturesOf', [report.players[index].address])
    if (ids.length) return { nftId: Number(ids[0]), alreadyOwned: true }
    let request = previous?.request
    if (request) {
      const status = await api(index, 'keeper/transactions/' + request.id + '?address=' + report.players[index].address)
      if (status.failed) request = null
    }
    if (!request) {
      try { request = await api(index, 'keeper/starter', { address: report.players[index].address }) }
      catch (error) {
        if (!/budget|funding|sponsor/i.test(error.message)) throw error
        await fund(index)
        request = await api(index, 'keeper/starter', { address: report.players[index].address })
      }
    }
    report.players[index].steps['starter-mint'] = { status: 'pending', request }
    save()
    const result = await finishTx(index, 'starter-mint', request)
    const owned = await read('ChimeraLab', 'creaturesOf', [report.players[index].address])
    if (!owned.length) throw new Error('Mint confirmed but no owned NFT')
    return { ...result, nftId: Number(owned[0]) }
  })
  report.players[index].nftId = report.players[index].steps['starter-mint'].nftId
  save()
}

async function baseline(index) {
  await login(index)
  const id = BigInt(report.players[index].nftId)
  await tx(index, 'season-join', 'ChimeraSeason', 'join')
  await tx(index, 'daily-check-in', 'ChimeraQuests', 'checkIn')
  await tx(index, 'sequence-gene', 'ChimeraLab', 'sequence', [id, 0])
  await step(index, 'private-lab-key', async () => {
    const inst = await fhe()
    const kp = inst.generateKeypair()
    const start = Math.floor(Date.now() / 1000) - 60
    const signature = (await api(index, 'keeper/lab-key', { address: report.players[index].address, publicKey: kp.publicKey, start, days: 7 })).signature
    const contracts = [A.ChimeraLab, A.ChimeraRaid, A.ChimeraExpeditions, A.ChimeraTraining, CZ, A.ChimeraColosseum, A.ChimeraRelics, A.ChimeraOracle, A.ChimeraRaffle, A.ChimeraDepths].map(x => x.toLowerCase())
    secret.players[index].fhe = { ...kp, signature, start, days: 7, contracts }
    save()
    const pheno = await read('ChimeraLab', 'getPhenotypeHandles', [id])
    const result = await inst.userDecrypt([{ handle: pheno[7], contractAddress: A.ChimeraLab }], kp.privateKey, kp.publicKey, signature.replace(/^0x/, ''), contracts, report.players[index].address, start, 7)
    if (!Object.keys(result).length) throw new Error('Private element could not be read')
    return { noExternalSignature: true, privateElementVerified: true }
  })
  await step(index, 'hunt-start', async () => {
    const encrypted = await seal(index, 'ChimeraColosseum', [[8, (index % 3) | ((index + 1) % 3) << 2 | ((index + 2) % 3) << 4]])
    const result = await tx(index, 'hunt-submit', 'ChimeraColosseum', 'explore', [id, encrypted.handles[0], encrypted.proof])
    const [event] = await events(result, 'ChimeraColosseum', 'BattleStarted')
    if (!event) throw new Error('BattleStarted event missing')
    return { battleId: Number(event.battleId), handles: event.roundHandles }
  })
  const hunt = report.players[index].steps['hunt-start']
  const result = await settle(index, 'hunt-settle', 'battle', hunt.battleId, hunt.handles, 'ChimeraColosseum', 'settle')
  await step(index, 'hunt-proof', async () => {
    const proof = await decrypt(hunt.handles)
    const record = await read('ChimeraColosseum', 'getBattle', [BigInt(hunt.battleId)])
    const [battle] = record
    const rounds = hunt.handles.map(handle => proof.clearValues[handle.toLowerCase()] ?? proof.clearValues[handle])
    if (!rounds.every(value => typeof value === 'boolean')) throw new Error('Round proof incomplete')
    if (Number(battle.status) !== 2 || rounds.filter(Boolean).length >= 2 !== battle.challengerWon) throw new Error('Public proof disagrees with settled winner')
    return { battleId: hunt.battleId, rounds, won: battle.challengerWon, settlement: result.hash, verified: true }
  })
}

async function pool(work, indexes, concurrency = 3) {
  let next = 0
  const failures = []
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < indexes.length) {
      const index = indexes[next++]
      try { await work(index) } catch (error) { failures.push({ player: index + 1, error: error.shortMessage || error.message }) }
    }
  }))
  return failures
}

async function main() {
  const command = process.argv[2] || 'setup'
  const indexes = process.env.PLAYTEST_PLAYERS ? process.env.PLAYTEST_PLAYERS.split(',').map(n => Number(n) - 1) : Array.from({ length: 10 }, (_, i) => i)
  report.payer = payer.address
  report.initialPayerBalance ??= formatEther(await publicClient.getBalance({ address: payer.address }))
  save()
  const failures = await pool(command === 'setup' ? setup : command === 'fund' ? index => fund(index, '0.03') : baseline, indexes)
  report.lastRun = { command, finishedAt: new Date().toISOString(), failures }
  report.payerBalance = formatEther(await publicClient.getBalance({ address: payer.address }))
  save()
  console.log('PLAYTEST_FINISHED', stringify(report.lastRun))
  if (failures.length) process.exitCode = 1
}

if (require.main === module) main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
module.exports = { directory, report, secret, save, log, api, login, step, tx, read, events, seal, decrypt, operator, settle, fund, pool, fhe, publicClient, A, CZ, ZAMA, tokenAbi }
