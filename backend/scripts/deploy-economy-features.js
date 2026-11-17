const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  bytesToHex, createPublicClient, createWalletClient, encodeDeployData, encodeFunctionData, fallback, formatEther, getAddress,
  http, isAddressEqual, parseAbi, parseEventLogs, parseEther, zeroAddress,
} = require('viem')
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts')
const { sepolia } = require('viem/chains')
const { SepoliaConfig } = require('@zama-fhe/relayer-sdk/node')
const deployment = require('../../frontend/src/chimera/contracts.v2.json')
const { RPC, zama } = require('../lib/zama')

const root = path.resolve(__dirname, '../..')
const file = name => path.join(root, name)
let saved = file('contracts/deployments-v2/economy-features.sepolia.json')
const testKeys = file('contracts/tmp/economy-cup-wallets.json')
const configFile = file('frontend/src/chimera/economy-features.v2.json')
const artifact = name => require(file(`contracts/artifacts/contracts/${name}.sol/${name}.json`))
const cup = artifact('ChimeraTournament')
const badge = artifact('ChimeraMarketBadge')
const lab = deployment.addresses.ChimeraLab
const market = deployment.addresses.ChimeraMarket
const prizeToken = deployment.zamaMock
const labAbi = deployment.abis.ChimeraLab
const marketAbi = deployment.abis.ChimeraMarket
const colosseum = deployment.addresses.ChimeraColosseum
const colosseumAbi = deployment.abis.ChimeraColosseum
const czama = getAddress(deployment.cZAMA.toLowerCase())
const confidentialAbi = parseAbi([
  'function wrap(address to,uint256 amount)', 'function setOperator(address operator,uint48 until)',
  'function confidentialBalanceOf(address account) view returns (bytes32)',
  'event ConfidentialTransfer(address indexed from,address indexed to,bytes32 indexed amount)',
])
const aclAbi = parseAbi(['function isAllowedForDecryption(bytes32 handle) view returns(bool)'])
const tokenAbi = parseAbi([
  'function mint(address to,uint256 amount)', 'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address who) view returns (uint256)', 'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])
const readTransport = fallback([
  http('https://sepolia.gateway.tenderly.co', { timeout: 8000, retryCount: 0 }),
  http(RPC, { timeout: 8000, retryCount: 0 }),
], { retryCount: 1 })
const reader = createPublicClient({ chain: sepolia, transport: readTransport, pollingInterval: 1800 })
const submitTransport = http(RPC, { timeout: 10000, retryCount: 1 })
const deployer = signer(JSON.parse(fs.readFileSync(file('contracts/tmp/e2e-wallet.json'), 'utf8')).pk)
let state
let prize
const active = new Map()

function signer(privateKey) {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({ chain: sepolia, account, transport: submitTransport })
}

function write(filePath, value) {
  fs.writeFileSync(`${filePath}.next`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(`${filePath}.next`, filePath)
}

function read(address, abi, functionName, args = [], blockNumber) {
  return reader.readContract({ address, abi, functionName, args, blockNumber })
}

async function transact(label, wallet, tx) {
  if (active.has(label)) return active.get(label)
  const promise = submit(label, wallet, tx).finally(() => active.delete(label))
  active.set(label, promise)
  return promise
}

async function submit(label, wallet, tx) {
  let sentAt
  if (!state.transactions[label]) {
    const from = wallet.account.address
    const [estimated, nonce] = await Promise.all([
      reader.estimateGas({ account: from, ...tx }),
      wallet.request({ method: 'eth_getTransactionCount', params: [from, 'pending'] }),
    ])
    const gas = estimated * 125n / 100n + 5_000n
    assert(gas <= 35_000_000n, `Estimated gas for ${label} exceeds the deployment budget: ${gas}`)
    sentAt = Date.now()
    const hash = await wallet.sendTransaction({ ...tx, gas, nonce: Number(nonce), maxFeePerGas: 50_000_000n, maxPriorityFeePerGas: 1_000_000n })
    state.transactions[label] = { hash }
    write(saved, state)
    console.log(`${label} submitted ${hash}`)
  }
  const entry = state.transactions[label]
  const receipt = await reader.waitForTransactionReceipt({ hash: entry.hash, timeout: 150_000, checkReplacement: false })
  assert.equal(receipt.status, 'success', `${label} reverted: ${entry.hash}`)
  if (!entry.block) {
    entry.block = Number(receipt.blockNumber)
    entry.gasPaidWei = String(receipt.gasUsed * receipt.effectiveGasPrice)
    if (state.audit && sentAt != null) entry.confirmationMs = Date.now() - sentAt
    if (receipt.contractAddress) entry.address = receipt.contractAddress
    write(saved, state)
    console.log(`${label} confirmed at ${entry.block}${entry.address ? ` · ${entry.address}` : ''}`)
  }
  return receipt
}

function call(label, wallet, to, abi, functionName, args = []) {
  return transact(label, wallet, { to, data: encodeFunctionData({ abi, functionName, args }) })
}

async function prepare(keepers) {
  assert.equal(await reader.getChainId(), sepolia.id)
  assert.equal(Number(await deployer.request({ method: 'eth_chainId' })), sepolia.id)
  const owner = await read(lab, labAbi, 'owner')
  assert(isAddressEqual(owner, deployer.account.address), 'Wrong Lab owner')
  assert(isAddressEqual(await read(market, marketAbi, 'lab'), lab), 'Market does not use the v2 Lab')
  assert.equal(await read(prizeToken, tokenAbi, 'symbol'), 'ZAMAMock')
  assert.equal(await read(prizeToken, tokenAbi, 'decimals'), 18)
  const roster = keepers.map(keeper => keeper.account.address)
  if (fs.existsSync(saved)) state = JSON.parse(fs.readFileSync(saved, 'utf8'))
  else {
    const { timestamp } = await reader.getBlock()
    state = { chainId: sepolia.id, deployer: owner, lab, market, prizeToken, prize: '100',
      registrationEndsAt: Number(timestamp) + 7 * 86400, windowSeconds: 86400, roster, transactions: {} }
    write(saved, state)
  }
  assert.equal(state.chainId, sepolia.id)
  assert(isAddressEqual(state.deployer, owner))
  assert.deepEqual(state.roster, roster, 'Test roster does not match this Cup')
  prize = parseEther(state.prize)
}

async function deploy() {
  const seal = (await transact('deployBadge', deployer, { data: encodeDeployData({ abi: badge.abi, bytecode: badge.bytecode, args: [market] }) })).contractAddress
  const tournament = (await transact('deployCup', deployer, { data: encodeDeployData({ abi: cup.abi, bytecode: cup.bytecode, args: [lab, prizeToken, prize, BigInt(state.registrationEndsAt), BigInt(state.windowSeconds), state.roster] }) })).contractAddress
  assert(seal && tournament)
  await call('badgeCombat', deployer, lab, labAbi, 'setCombat', [seal, true])
  await call('cupCombat', deployer, lab, labAbi, 'setCombat', [tournament, true])
  await call('mintTestPrize', deployer, prizeToken, tokenAbi, 'mint', [deployer.account.address, prize])
  await call('approveTestPrize', deployer, prizeToken, tokenAbi, 'approve', [tournament, prize])
  await call('fundCup', deployer, tournament, cup.abi, 'fund')
  assert(isAddressEqual(await read(seal, badge.abi, 'market'), market))
  assert(isAddressEqual(await read(tournament, cup.abi, 'lab'), lab))
  for (const address of [seal, tournament]) assert.equal(await read(lab, labAbi, 'isCombat', [address]), true)
  assert.equal(await read(tournament, cup.abi, 'prize'), prize)
  assert.equal(await read(tournament, cup.abi, 'registrationEndsAt'), BigInt(state.registrationEndsAt))
  const roster = await Promise.all(state.roster.map((_, index) => read(tournament, cup.abi, 'roster', [BigInt(index)])))
  assert.deepEqual(roster, state.roster)
  if (!state.transactions.startCup) assert.equal(await read(prizeToken, tokenAbi, 'balanceOf', [tournament]), prize)
  write(configFile, { chainId: sepolia.id, tournament, marketBadge: seal })
  console.log(`Cup funded · ${state.prize} ZAMAMock · ${tournament} · badge ${seal}`)
  return { tournament, seal }
}

async function retryProof(fetchProof) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetchProof() } catch (error) {
      if (attempt >= 8 || /address is not a valid address/i.test(error.message)) throw error
      await new Promise(resolve => setTimeout(resolve, Math.min(2000 * 2 ** attempt, 12000)))
    }
  }
}

function logged(receipt, address, abi, eventName) {
  const logs = receipt.logs.filter(log => isAddressEqual(log.address, address))
  return parseEventLogs({ abi, logs, eventName }).map(event => event.args)
}

function checkAddress(actual, expected) {
  assert(isAddressEqual(actual, expected), `Unexpected address ${actual}, expected ${expected}`)
}

function publicAccess(handle) {
  return read(SepoliaConfig.aclContractAddress, aclAbi, 'isAllowedForDecryption', [handle])
}

function unpack(proof, handle) {
  return proof.clearValues[handle] ?? proof.clearValues[handle.toLowerCase()]
}

async function readPrivateAmounts(sdk, wallet, handles) {
  const unique = [...new Set(handles.filter(handle => !/^0x0+$/.test(handle)))]
  if (!unique.length) return handles.map(() => 0n)
  const keys = sdk.generateKeypair()
  const start = Math.floor(Date.now() / 1000) - 60
  const scope = [czama]
  const typed = sdk.createEIP712(keys.publicKey, scope, start, 1)
  const signature = await wallet.signTypedData({ ...typed, primaryType: 'UserDecryptRequestVerification' })
  const clear = await retryProof(() => sdk.userDecrypt(unique.map(handle => ({ handle, contractAddress: czama })),
    keys.privateKey, keys.publicKey, signature.slice(2), scope, wallet.account.address, start, 1))
  return handles.map(handle => /^0x0+$/.test(handle) ? 0n : BigInt(clear[handle] ?? clear[handle.toLowerCase()]))
}

function balanceHandleAt(account, blockNumber) {
  return reader.readContract({ address: czama, abi: confidentialAbi, functionName: 'confidentialBalanceOf', args: [account], blockNumber })
}

async function auditMarket(keepers, seal) {
  if (state.market) return
  const [seller, buyer, underfunded] = keepers
  const specimenOwner = seller.account.address
  const buyerAddress = buyer.account.address
  const unfundedAddress = underfunded.account.address
  const price = 10_000_000n
  const buyerSeed = parseEther('12')
  checkAddress(await read(market, marketAbi, 'token'), czama)
  checkAddress(await read(seal, badge.abi, 'market'), market)
  const raid = await read(market, marketAbi, 'raid')
  assert(!isAddressEqual(raid, zeroAddress), 'Live Market has no fee recipient')
  const fee = price * (await read(market, marketAbi, 'FEE_BPS')) / 10_000n
  const sdk = await zama()
  const hatch = await call('hatchMarketSpecimen', seller, lab, labAbi, 'hatchGenesis')
  const [{ id: specimen }] = logged(hatch, lab, labAbi, 'Hatched')
  await call('approveMarketSpecimen', seller, lab, labAbi, 'approve', [market, specimen])
  const listed = await call('listMarketSpecimen', seller, market, marketAbi, 'list', [specimen, price])
  const [{ listingId: listing }] = logged(listed, market, marketAbi, 'Listed')
  await call('requestBadge', seller, seal, badge.abi, 'request', [listing])
  const [,, badgeHandle] = await read(seal, badge.abi, 'badges', [listing])
  const badgeProof = await retryProof(() => sdk.publicDecrypt([badgeHandle]))
  await call('publishBadge', deployer, seal, badge.abi, 'publish', [listing, badgeProof.abiEncodedClearValues, badgeProof.decryptionProof])
  const [tier, published] = await read(seal, badge.abi, 'badges', [listing])
  assert(published && tier === Number(unpack(badgeProof, badgeHandle)))

  const sponsor = deployer.account.address
  await call('mintBuyerTestFunds', deployer, prizeToken, tokenAbi, 'mint', [sponsor, buyerSeed])
  await call('approveTestWrapper', deployer, prizeToken, tokenAbi, 'approve', [czama, buyerSeed])
  await call('wrapTestBuyerFunds', deployer, czama, confidentialAbi, 'wrap', [buyerAddress, buyerSeed])
  const until = (await reader.getBlock()).timestamp + 86_400n
  await Promise.all([buyer, underfunded].map((wallet, i) => call(`marketOperator${i}`, wallet, czama, confidentialAbi, 'setOperator', [market, until])))

  async function purchase(wallet, paid) {
    const label = paid ? 'Paid' : 'Unfunded'
    const bought = await call(`buy${label}`, wallet, market, marketAbi, 'buy', [listing])
    const [{ paidHandle }] = logged(bought, market, marketAbi, 'PurchaseStarted')
    assert.equal(await publicAccess(paidHandle), true)
    const proof = await retryProof(() => sdk.publicDecrypt([paidHandle]))
    assert.equal(unpack(proof, paidHandle), paid)
    const settled = await call(`finalize${label}`, deployer, market, marketAbi, 'finalize', [listing, proof.abiEncodedClearValues, proof.decryptionProof])
    assert.equal(logged(settled, market, marketAbi, paid ? 'Sold' : 'PurchaseFailed').length, 1)
    return { bought, settled }
  }

  const failed = await purchase(underfunded, false)
  const [reopened] = await read(market, marketAbi, 'getListing', [listing], failed.settled.blockNumber)
  assert.equal(reopened.status, 1)
  checkAddress(reopened.buyer, zeroAddress)
  checkAddress(await read(lab, labAbi, 'ownerOf', [specimen], failed.settled.blockNumber), market)
  const beforeSale = failed.settled.blockNumber
  const [unfundedBefore, unfundedAfter] = await Promise.all([
    balanceHandleAt(unfundedAddress, failed.bought.blockNumber - 1n), balanceHandleAt(unfundedAddress, beforeSale),
  ])
  assert.deepEqual(await readPrivateAmounts(sdk, underfunded, [unfundedBefore, unfundedAfter]), [0n, 0n])

  const paid = await purchase(buyer, true)
  const [sold] = await read(market, marketAbi, 'getListing', [listing])
  assert.equal(sold.status, 3)
  checkAddress(sold.buyer, buyerAddress)
  checkAddress(await read(lab, labAbi, 'ownerOf', [specimen]), buyerAddress)
  const transfers = logged(paid.settled, czama, confidentialAbi, 'ConfidentialTransfer')
  assert.equal(transfers.length, 2)
  for (const transfer of transfers) checkAddress(transfer.from, market)
  const sellerTransfer = transfers.find(transfer => isAddressEqual(transfer.to, specimenOwner))
  const raidTransfer = transfers.find(transfer => isAddressEqual(transfer.to, raid))
  assert(sellerTransfer && raidTransfer)
  const afterSale = paid.settled.blockNumber
  const [buyerBefore, buyerAfter, sellerBefore, sellerAfter, raidBefore, raidAfter, genes] = await Promise.all([
    balanceHandleAt(buyerAddress, beforeSale), balanceHandleAt(buyerAddress, afterSale),
    balanceHandleAt(specimenOwner, beforeSale), balanceHandleAt(specimenOwner, afterSale),
    balanceHandleAt(raid, beforeSale), balanceHandleAt(raid, afterSale),
    read(lab, labAbi, 'getGenomeHandles', [specimen]),
  ])
  assert.notEqual(raidBefore, raidAfter)
  const [[buyerStart, buyerEnd], [sellerStart, sellerEnd, sellerReceipt]] = await Promise.all([
    readPrivateAmounts(sdk, buyer, [buyerBefore, buyerAfter]),
    readPrivateAmounts(sdk, seller, [sellerBefore, sellerAfter, sellerTransfer.amount]),
  ])
  assert.equal(buyerStart - buyerEnd, price)
  assert.equal(sellerEnd - sellerStart, price - fee)
  assert.equal(sellerReceipt, price - fee)
  const privateHandles = [buyerAfter, sellerAfter, raidAfter, raidTransfer.amount, sellerTransfer.amount, ...genes]
  assert((await Promise.all(privateHandles.map(publicAccess))).every(allowed => !allowed))
  state.market = { listingId: Number(listing), specimenId: Number(specimen), tier, buyer: buyerAddress, seller: specimenOwner,
    raid, price: String(price), sellerDelta: String(sellerEnd - sellerStart), feeByDifference: String(fee),
    insufficientFundsReopened: true, nftTransferred: true, balancesAndGenomePublic: false }
  write(saved, state)
  console.log(`Market listing #${listing} sold after a verified failed purchase; private balance deltas and raid transfer checked.`)
}

async function encryptPlan(sdk, contract, wallet, plan = 36) {
  const input = await retryProof(() => sdk.createEncryptedInput(getAddress(contract), wallet.account.address).add8(plan).encrypt())
  return [input.handles[0], input.inputProof].map(value => typeof value === 'string' ? value : bytesToHex(value))
}

async function waitForChainTime(timestamp) {
  while ((await reader.getBlock()).timestamp < timestamp) await new Promise(resolve => setTimeout(resolve, 5000))
}

async function auditForfeit(keepers, original) {
  if (state.forfeit) return
  const sdk = await zama()
  const sponsor = deployer.account.address
  const total = parseEther('100')
  if (!state.forfeitSettings) {
    state.forfeitSettings = { registrationEndsAt: Number((await reader.getBlock()).timestamp) + 7200, windowSeconds: 120 }
    write(saved, state)
  }
  const { registrationEndsAt, windowSeconds } = state.forfeitSettings
  const { contractAddress: address } = await transact('deployForfeitCup', deployer, { data: encodeDeployData({ abi: cup.abi, bytecode: cup.bytecode,
    args: [lab, prizeToken, total, BigInt(registrationEndsAt), BigInt(windowSeconds), state.roster] }) })
  assert(address)
  await call('authorizeForfeitCup', deployer, lab, labAbi, 'setCombat', [address, true])
  await call('mintForfeitPrize', deployer, prizeToken, tokenAbi, 'mint', [sponsor, total])
  await call('approveForfeitPrize', deployer, prizeToken, tokenAbi, 'approve', [address, total])
  await call('fundForfeitCup', deployer, address, cup.abi, 'fund')
  if (!state.transactions.startForfeitCup) assert.equal(await read(prizeToken, tokenAbi, 'balanceOf', [address]), total)
  await Promise.all(keepers.map(async (wallet, i) => {
    const old = await reader.getTransactionReceipt({ hash: original.transactions[`hatchKeeper${i + 1}`].hash })
    const [{ id }] = logged(old, lab, labAbi, 'Hatched')
    await call(`joinForfeit${i}`, wallet, address, cup.abi, 'join', [id])
  }))
  assert.equal(await read(address, cup.abi, 'joined'), 8)

  const plans = await Promise.all([[0, 0], [2, 4], [6, 0]].map(async ([id, i]) => ({ id, wallet: keepers[i],
    args: state.transactions[`forfeitSeal${id}`] ? [] : await encryptPlan(sdk, address, keepers[i]) })))
  const [openingLeft, openingRight, finalPlan] = plans
  const seal = ({ id, wallet, args }) => state.transactions[`forfeitSeal${id}`]
    ? transact(`forfeitSeal${id}`, wallet, {}) : call(`forfeitSeal${id}`, wallet, address, cup.abi, 'sealPlan', [id, ...args])
  const match = id => read(address, cup.abi, 'matches', [BigInt(id)])
  await call('startForfeitCup', deployer, address, cup.abi, 'start')
  await Promise.all([seal(openingLeft), seal(openingRight)])
  const deadline = (await match(0))[3]
  console.log(`Forfeit Cup ${address} · one-plan and zero-plan matches expire at ${new Date(Number(deadline) * 1000).toISOString()}`)
  await waitForChainTime(deadline)
  for (const id of [0, 1, 2, 3]) await call(`resolveForfeit${id}`, deployer, address, cup.abi, 'resolveNoShow', [id])
  const expected = [state.roster[0], zeroAddress, state.roster[4], zeroAddress, state.roster[0], state.roster[4], state.roster[0]]
  const final = await match(6)
  checkAddress(final[0], state.roster[0])
  checkAddress(final[1], state.roster[4])
  await seal(finalPlan)
  await waitForChainTime(final[3])
  await call('resolveForfeit6', deployer, address, cup.abi, 'resolveNoShow', [6])
  assert.equal(await read(address, cup.abi, 'status'), 3)
  for (const [id, winner] of expected.entries()) {
    const result = await match(id)
    checkAddress(result[2], winner)
    assert.deepEqual(result.slice(5), [0, true, true])
  }
  const awards = [[state.roster[0], '60'], [state.roster[4], '20'], [sponsor, '20']]
  for (const [i, [keeper, amount]] of awards.entries()) {
    const label = `claimForfeit${i}`
    if (!state.transactions[label]) assert.equal(await read(address, cup.abi, 'claimable', [keeper]), parseEther(amount))
    const receipt = await call(label, deployer, address, cup.abi, 'claim', [keeper])
    const [claim] = logged(receipt, address, cup.abi, 'PrizeClaimed')
    checkAddress(claim.keeper, keeper)
    assert.equal(claim.amount, parseEther(amount))
    const delta = await read(prizeToken, tokenAbi, 'balanceOf', [keeper], receipt.blockNumber) -
      await read(prizeToken, tokenAbi, 'balanceOf', [keeper], receipt.blockNumber - 1n)
    assert.equal(delta, claim.amount)
  }
  const recipients = [...state.roster, sponsor]
  assert((await Promise.all(recipients.map(keeper => read(address, cup.abi, 'claimable', [keeper])))).every(value => value === 0n))
  assert.equal(await read(prizeToken, tokenAbi, 'balanceOf', [address]), 0n)
  state.forfeit = { address, winners: expected, awards: Object.fromEntries(awards), remaining: '0' }
  write(saved, state)
  console.log('All seven forfeit results verified, including both empty matches; 60/20 awarded and 20 returned.')
}

async function auditFirstHunt(keepers, original, repeat = false) {
  const field = repeat ? 'firstHuntRetest' : 'firstHunt'
  if (state[field]) return
  const keeperIndex = repeat ? 7 : 6
  const startLabel = repeat ? 'startHuntRetest' : 'startFirstHunt'
  const settleLabel = repeat ? 'sponsorHuntRetest' : 'sponsorHunt'
  const encryptionField = repeat ? 'huntRetestEncryptionMs' : 'huntEncryptionMs'
  const wallet = keepers[keeperIndex]
  const account = wallet.account.address
  const birth = await reader.getTransactionReceipt({ hash: original.transactions[`hatchKeeper${keeperIndex + 1}`].hash })
  const [{ id: specimen }] = logged(birth, lab, labAbi, 'Hatched')
  const sdk = await zama()
  const prefix = `http://127.0.0.1:${repeat ? 4174 : 4173}/api/settlement`
  const post = (body, timeout) => fetch(prefix, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
  const probe = await post({}, 5000)
  assert.equal(probe.status, 400, `Expected an enabled local settlement sponsor, received ${probe.status}`)
  if (!state.transactions[startLabel]) {
    checkAddress(await read(lab, labAbi, 'ownerOf', [specimen]), account)
    for (const field of ['wins', 'losses']) assert.equal(await read(colosseum, colosseumAbi, field, [account]), 0)
    const [roaming, maxRoaming] = await Promise.all([
      read(colosseum, colosseumAbi, 'roamingWilds'), read(colosseum, colosseumAbi, 'maxRoaming'),
    ])
    const idle = await Promise.all(roaming.map(id => read(colosseum, colosseumAbi, 'wildEngaged', [id])))
    const target = roaming.find((_, i) => !idle[i])
    assert(target != null || roaming.length < maxRoaming, 'There is no wild creature available')
    const startEncryption = performance.now()
    const input = await encryptPlan(sdk, colosseum, wallet)
    state[encryptionField] = Math.round(performance.now() - startEncryption)
    await call(startLabel, wallet, colosseum, colosseumAbi, target == null ? 'explore' : 'challengeWild',
      target == null ? [specimen, ...input] : [specimen, target, ...input])
  }
  const startedTx = await transact(startLabel, wallet, {})
  const [started] = logged(startedTx, colosseum, colosseumAbi, 'BattleStarted')
  assert.equal(started.kind, 0)
  checkAddress(started.challenger, account)
  const { battleId, roundHandles: handles } = started
  let settledTx
  if (!state.transactions[settleLabel]) {
    const startApi = performance.now()
    const response = await post({ world: 'v2', kind: 'battle', id: Number(battleId), handles }, 70_000)
    const value = await response.json()
    assert(response.ok && /^0x[0-9a-f]{64}$/i.test(value.hash), `Settlement API returned ${response.status} ${value.code ?? ''}`)
    state.transactions[settleLabel] = { hash: value.hash, apiMs: Math.round(performance.now() - startApi) }
    write(saved, state)
    const waitStart = performance.now()
    settledTx = await transact(settleLabel, deployer, {})
    state.transactions[settleLabel].confirmationMs = Math.round(performance.now() - waitStart)
  } else settledTx = await transact(settleLabel, deployer, {})
  const [settled] = logged(settledTx, colosseum, colosseumAbi, 'BattleSettled')
  assert.equal(settled.battleId, battleId)
  checkAddress(startedTx.from, account)
  assert(!isAddressEqual(settledTx.from, account))
  const [result] = await read(colosseum, colosseumAbi, 'getBattle', [battleId])
  assert.equal(result.status, 2)
  const verifyStart = performance.now()
  const proof = await retryProof(() => sdk.publicDecrypt([...handles]))
  const bits = handles.map(handle => unpack(proof, handle))
  assert(bits.every(bit => typeof bit === 'boolean'))
  const mask = bits.reduce((value, won, index) => value | (won ? 1 << index : 0), 0)
  assert.equal(settled.rounds, mask)
  assert.equal(result.rounds, mask)
  assert.equal(result.challengerWon, bits.filter(Boolean).length >= 2)
  assert.equal(settled.challengerWon, result.challengerWon)
  const wildPlan = await read(colosseum, colosseumAbi, 'wildPlanHandle', [battleId])
  assert.equal(await publicAccess(wildPlan), false)
  state[field] = { id: Number(battleId), keeper: account, specimenId: Number(specimen), rounds: mask,
    playerSignatures: 1, verificationSignatures: 0, verificationMs: Math.round(performance.now() - verifyStart) }
  write(saved, state)
  console.log(`First Hunt #${battleId} finished through the settlement API; all rounds verified with one player signature.`)
}

async function play(keepers, { tournament, seal }) {
  for (const [i, keeper] of keepers.entries()) {
    await transact(`gasKeeper${i + 1}`, deployer, { to: keeper.account.address, value: parseEther('0.002') })
  }
  const specimens = await Promise.all(keepers.map(async (keeper, i) => {
    const receipt = await call(`hatchKeeper${i + 1}`, keeper, lab, labAbi, 'hatchGenesis')
    const birth = parseEventLogs({ abi: labAbi, logs: receipt.logs, eventName: 'Hatched' })[0]
    assert(isAddressEqual(birth.args.owner, keeper.account.address))
    return birth.args.id
  }))
  await Promise.all(keepers.map((keeper, i) => call(`joinKeeper${i + 1}`, keeper, tournament, cup.abi, 'join', [specimens[i]])))
  assert.equal(await read(tournament, cup.abi, 'joined'), 8)
  await call('startCup', deployer, tournament, cup.abi, 'start')
  const sdk = await zama()
  const keepersByAddress = new Map(keepers.map((keeper, i) => [keeper.account.address.toLowerCase(), { keeper, i }]))
  async function playMatch(id) {
    const [left, right] = await read(tournament, cup.abi, 'matches', [BigInt(id)])
    for (const [seat, address] of [left, right].entries()) {
      const label = `match${id + 1}Plan${seat + 1}`
      const { keeper, i } = keepersByAddress.get(address.toLowerCase())
      if (state.transactions[label]) {
        await transact(label, keeper, {})
        continue
      }
      const plan = ((i + id) % 3) | (((i + id + 1) % 3) << 2) | (((i + 2) % 3) << 4)
      const input = await retryProof(() => sdk.createEncryptedInput(getAddress(tournament), getAddress(address)).add8(plan).encrypt())
      const hex = value => typeof value === 'string' ? value : bytesToHex(value)
      await call(label, keeper, tournament, cup.abi, 'sealPlan', [id, hex(input.handles[0]), hex(input.inputProof)])
    }
    const handles = await read(tournament, cup.abi, 'roundHandles', [id])
    const proof = await retryProof(() => sdk.publicDecrypt([...handles]))
    const bits = handles.map(handle => proof.clearValues[handle] ?? proof.clearValues[handle.toLowerCase()])
    assert(bits.every(bit => typeof bit === 'boolean'))
    const expectedMask = bits.reduce((mask, bit, i) => mask | (bit ? 1 << i : 0), 0)
    return { id, left, right, expectedMask, proof }
  }
  state.matches ??= {}
  for (const ids of [[0, 1, 2, 3], [4, 5], [6]]) {
    const matches = await Promise.all(ids.filter(id => !state.matches[id + 1]).map(playMatch))
    for (const { id, left, right, expectedMask, proof } of matches) {
      const receipt = await call(`match${id + 1}Settle`, deployer, tournament, cup.abi, 'settle', [id, proof.abiEncodedClearValues, proof.decryptionProof])
      const resolved = parseEventLogs({ abi: cup.abi, logs: receipt.logs, eventName: 'MatchResolved' })
        .find(event => event.args.matchId === id)
      assert(resolved && !resolved.args.forfeit)
      assert.equal(resolved.args.rounds, expectedMask)
      const wins = [0, 1, 2].filter(i => (expectedMask & (1 << i)) !== 0).length
      assert(isAddressEqual(resolved.args.winner, wins >= 2 ? left : right))
      state.matches[id + 1] = { rounds: expectedMask, winner: resolved.args.winner }
      write(saved, state)
    }
  }
  assert.equal(await read(tournament, cup.abi, 'status'), 3)
  const finalRecord = await read(tournament, cup.abi, 'matches', [6n])
  assert(!isAddressEqual(finalRecord[2], zeroAddress))
  const loser = ([left, right, winner]) => isAddressEqual(left, winner) ? right : left
  const semis = await Promise.all([4n, 5n].map(id => read(tournament, cup.abi, 'matches', [id])))
  const expectedAwards = new Map([
    [finalRecord[2], parseEther('60')], [loser(finalRecord), parseEther('20')],
    ...semis.map(semi => [loser(semi), parseEther('10')]),
  ])
  for (const [i, address] of state.roster.entries()) {
    const pending = await read(tournament, cup.abi, 'claimable', [address])
    if (pending > 0n) await call(`claimKeeper${i + 1}`, deployer, tournament, cup.abi, 'claim', [address])
  }
  const awards = await Promise.all(state.roster.map(address => read(prizeToken, tokenAbi, 'balanceOf', [address])))
  assert.deepEqual(awards, state.roster.map(address => expectedAwards.get(address) ?? 0n))
  assert.equal(await read(prizeToken, tokenAbi, 'balanceOf', [tournament]), 0n)
  state.awards = Object.fromEntries(state.roster.flatMap((address, index) => awards[index] > 0n ? [[address, formatEther(awards[index])]] : []))
  write(saved, state)
  console.log('All seven Cup proofs and four exact prize transfers verified.')

  const seller = keepers[0]
  await call('testMarketApprove', seller, lab, labAbi, 'approve', [market, specimens[0]])
  const listingTx = await call('testMarketList', seller, market, marketAbi, 'list', [specimens[0], 10_000_000n])
  const listing = parseEventLogs({ abi: marketAbi, logs: listingTx.logs, eventName: 'Listed' })[0].args.listingId
  await call('testBadgeRequest', seller, seal, badge.abi, 'request', [listing])
  const [,, handle] = await read(seal, badge.abi, 'badges', [listing])
  const proof = await retryProof(() => sdk.publicDecrypt([handle]))
  await call('testBadgePublish', deployer, seal, badge.abi, 'publish', [listing, proof.abiEncodedClearValues, proof.decryptionProof])
  const [tier, published] = await read(seal, badge.abi, 'badges', [listing])
  assert.equal(published, true)
  assert.equal(tier, Number(proof.clearValues[handle] ?? proof.clearValues[handle.toLowerCase()]))
  assert.equal((await read(lab, labAbi, 'getCreature', [specimens[0]])).certified, false)
  const aclAbi = parseAbi(['function isAllowedForDecryption(bytes32 handle) view returns(bool)'])
  const genome = await read(lab, labAbi, 'getGenomeHandles', [specimens[0]])
  const publicGenes = await Promise.all(genome.map(gene => read(SepoliaConfig.aclContractAddress, aclAbi, 'isAllowedForDecryption', [gene])))
  assert.deepEqual(publicGenes, [false, false, false, false, false, false, false, false])
  await call('testMarketCancel', seller, market, marketAbi, 'cancel', [listing])
  assert(isAddressEqual(await read(lab, labAbi, 'ownerOf', [specimens[0]]), seller.account.address))
  state.marketSmoke = { listingId: Number(listing), specimenId: Number(specimens[0]), tier, publicGenomeLoci: 0, nftReturned: true }
  write(saved, state)
  console.log(`Test listing #${listing} · badge tier ${tier} verified · NFT returned`)
}

async function main() {
  const mode = process.argv[2]
  assert(['deploy', 'play', 'audit-market', 'audit-forfeit', 'audit-hunt', 'audit-hunt-retest'].includes(mode), 'Specify deploy, play, audit-market, audit-forfeit, audit-hunt, or audit-hunt-retest')
  if (!fs.existsSync(testKeys)) write(testKeys, Array.from({ length: 8 }, generatePrivateKey))
  const keepers = JSON.parse(fs.readFileSync(testKeys, 'utf8')).map(signer)
  if (mode.startsWith('audit-')) {
    const original = JSON.parse(fs.readFileSync(saved, 'utf8'))
    const addresses = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    saved = file('contracts/deployments-v2/economy-audit.sepolia.json')
    const roster = keepers.map(keeper => keeper.account.address)
    assert.deepEqual(original.roster, roster)
    checkAddress(addresses.marketBadge, original.transactions.deployBadge.address)
    assert.equal(await reader.getChainId(), sepolia.id)
    assert.equal(Number(await deployer.request({ method: 'eth_chainId' })), sepolia.id)
    state = fs.existsSync(saved) ? JSON.parse(fs.readFileSync(saved, 'utf8')) : {
      audit: true, chainId: sepolia.id, roster, transactions: {}, contracts: { lab, market, czama, colosseum, marketBadge: addresses.marketBadge },
    }
    assert.deepEqual(state.roster, roster)
    checkAddress(await read(lab, labAbi, 'owner'), deployer.account.address)
    if (mode === 'audit-market') await auditMarket(keepers, addresses.marketBadge)
    else if (mode === 'audit-forfeit') await auditForfeit(keepers, original)
    else await auditFirstHunt(keepers, original, mode === 'audit-hunt-retest')
    return
  }
  await prepare(keepers)
  if (mode === 'deploy') await deploy()
  else {
    const { tournament, marketBadge: seal } = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    assert(isAddressEqual(state.transactions.deployCup.address, tournament) && isAddressEqual(state.transactions.deployBadge.address, seal))
    await play(keepers, { tournament, seal })
  }
}

main().catch(error => {
  console.error((error.shortMessage ?? error.message).split('\n')[0])
  process.exitCode = 1
})
