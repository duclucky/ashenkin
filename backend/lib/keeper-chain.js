const { createPublicClient, decodeFunctionData, encodeFunctionData, formatGwei, getAddress, http, isAddress, isAddressEqual, parseAbi, parseEther } = require('viem')
const { sepolia } = require('viem/chains')
const { problem } = require('./keeper-store')
const { sponsorClients } = require('./settlement-sponsor')
const { RPC } = require('./zama')
const { addresses: A } = require('./ashenkin.json')
const { waitForApproval } = require('./approval-sync')

// Sepolia contracts in the release. Browser input cannot add a target or a method to this list.
const CZAMA = '0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB'
const ZAMA = '0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57'
const actions = {
  ChimeraLab: 'hatchGenesis() breed(uint256,uint256) hatchEgg(uint256,bytes,bytes) sequence(uint256,uint8) certify(uint256) claimChimera(uint256,bytes,bytes) approve(address,uint256) setApprovalForAll(address,bool)',
  ChimeraArena: 'explore(uint256) challengeWild(uint256,uint256) registerDefender(uint256,bytes32,bytes) withdrawDefender(uint256) duel(uint256,uint256,bytes32,bytes) settle(uint256,bytes,bytes)',
  ChimeraColosseum: 'explore(uint256,bytes32,bytes) challengeWild(uint256,uint256,bytes32,bytes) duel(uint256,uint256,bytes32,bytes32,bytes) registerDefender(uint256,bytes32,bytes32,bytes) replan(uint256,bytes32,bytes) withdrawDefender(uint256) settle(uint256,bytes,bytes)',
  ChimeraMarket: 'list(uint256,uint64) cancel(uint256) buy(uint256) finalize(uint256,bytes,bytes)',
  ChimeraExpeditions: 'start(uint256,uint8) claim(uint256)',
  ChimeraRaid: 'strike(uint256) finalizeKill(uint256,bytes,bytes) claimShare(uint32) publishPot()',
  ChimeraQuests: 'checkIn() claimAll(uint32) claimTask(uint8) claimChest()',
  ChimeraTreasury: 'publishReserve()',
  ChimeraTraining: 'train(uint256) completeTraining(uint256,bytes,bytes) reveal(uint256)',
  ChimeraAscension: 'ascend(uint256,uint256) retire(uint256)',
  ChimeraSeason: 'join() claimThrone(uint8) endSeason()',
  ChimeraDepths: 'enter(uint256) open(uint256,uint8) leave(uint256) revealSurvival(uint256) recordDepth(uint256,bytes,bytes)',
  ChimeraRaffle: 'buy(bytes32,bytes) draw() finalize(bytes,bytes)',
  ChimeraRelics: 'openCache() equip(uint256,uint256,uint8) unequip(uint256) fuse(uint256,uint256,uint256) appraise(uint256) publishAppraisal(uint256,bytes,bytes)',
  ChimeraOracle: 'guess(bytes32,bytes) claim(uint256) finalize(uint256,bytes,bytes) expire()',
}
const schemas = new Map([
  ...Object.entries(actions).map(([contract, methods]) => [A[contract].toLowerCase(), methods]),
  [ZAMA.toLowerCase(), 'mint(address,uint256) approve(address,uint256)'],
  [CZAMA.toLowerCase(), 'setOperator(address,uint48) wrap(address,uint256)'],
].map(([address, methods]) => [address, parseAbi(methods.split(' ').map(method => `function ${method}`))]))
const labAbi = parseAbi([
  'function hatchGenesis() returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function genesisClaimed(address) view returns (uint256)',
])
const hatchData = encodeFunctionData({ abi: labAbi, functionName: 'hatchGenesis' })
const tokenCap = 1000n * 10n ** 18n
const nowSeconds = () => Math.floor(Date.now() / 1000)
const same = (address, expected) => isAddressEqual(address, expected)
const allowedOperator = address => [
  A.ChimeraLab, A.ChimeraArena, A.ChimeraColosseum, A.ChimeraMarket, A.ChimeraTraining,
  A.ChimeraOracle, A.ChimeraRelics, A.ChimeraRaffle, A.ChimeraDepths,
].some(expected => same(address, expected))
const digest = /^(?:0x)?[0-9a-f]+$/i
const hexData = /^0x(?:[0-9a-f]{2}){4,8192}$/i

function gameCall(player, destination, data) {
  const address = typeof destination === 'string' && isAddress(destination) && getAddress(destination)
  const abi = address && schemas.get(address.toLowerCase())
  if (!abi || typeof data !== 'string' || !hexData.test(data)) throw problem(400, 'This game action is unavailable.')

  let decoded
  try {
    decoded = decodeFunctionData({ abi, data })
    if (encodeFunctionData({ abi, ...decoded }).toLowerCase() !== data.toLowerCase()) throw new Error()
  } catch {
    throw problem(400, 'This game action is unavailable.')
  }
  const { functionName: name, args = [] } = decoded
  let permitted = true
  if (same(address, ZAMA)) permitted = (name === 'mint' ? same(args[0], player) : same(args[0], CZAMA)) && args[1] > 0n && args[1] <= tokenCap
  if (same(address, CZAMA)) {
    permitted = name === 'wrap' ? same(args[0], player) && args[1] > 0n && args[1] <= tokenCap :
      allowedOperator(args[0]) && Number(args[1]) <= nowSeconds() + 31 * 86400
  }
  if (same(address, A.ChimeraLab) && name === 'approve') permitted = [A.ChimeraMarket, A.ChimeraAscension].some(expected => same(args[0], expected))
  if (same(address, A.ChimeraLab) && name === 'setApprovalForAll') permitted = same(args[0], A.ChimeraExpeditions)
  if (!permitted) throw problem(400, 'This game action is unavailable.')
  return { address, data: data.toLowerCase(), name, abi, args }
}

function labKeyData({ publicKey, start, days } = {}) {
  if (typeof publicKey !== 'string' || publicKey.length > 2048 || !digest.test(publicKey) ||
      publicKey.replace(/^0x/i, '').length % 2 !== 0 ||
      !Number.isSafeInteger(start) || Math.abs(nowSeconds() - start) > 300 || days !== 7) {
    throw problem(400, 'Invalid Lab key request.')
  }
  const { verifyingContractAddressDecryption } = require('@zama-fhe/relayer-sdk/node').SepoliaConfig
  const types = {
    EIP712Domain: [['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address']],
    UserDecryptRequestVerification: [['publicKey', 'bytes'], ['contractAddresses', 'address[]'], ['startTimestamp', 'uint256'], ['durationDays', 'uint256'], ['extraData', 'bytes']],
  }
  return {
    types: Object.fromEntries(Object.entries(types).map(([name, fields]) => [name, fields.map(([name, type]) => ({ name, type }))])),
    primaryType: 'UserDecryptRequestVerification',
    domain: { name: 'Decryption', version: '1', chainId: sepolia.id, verifyingContract: verifyingContractAddressDecryption },
    message: {
      publicKey: `0x${publicKey.replace(/^0x/i, '')}`,
      contractAddresses: [A.ChimeraLab, A.ChimeraRaid, A.ChimeraExpeditions, A.ChimeraTraining, CZAMA, A.ChimeraColosseum, A.ChimeraRelics, A.ChimeraOracle, A.ChimeraRaffle, A.ChimeraDepths].map(address => address.toLowerCase()),
      startTimestamp: String(start),
      durationDays: String(days),
      extraData: '0x00',
    },
  }
}

function keeperChain(store, env, clients = {}) {
  const chain = clients.chain ?? createPublicClient({ chain: sepolia, transport: http(RPC, { timeout: 8000, retryCount: 1 }) })
  const enabled = !!env.ASHENKIN_CIRCLE_STARTER_ETH
  const amount = enabled ? parseEther(env.ASHENKIN_CIRCLE_STARTER_ETH) : 0n
  const limit = Number(env.ASHENKIN_STARTER_MINT_LIMIT || 0)
  const sponsor = enabled ? clients.sponsor ?? sponsorClients(env) : null
  if (enabled && (!sponsor || amount <= 0n || amount > parseEther('0.02') || !Number.isSafeInteger(limit) || limit < 1)) {
    throw new Error('Starter sponsorship requires the Sepolia sponsor, gas allowance and a positive account limit.')
  }
  const metrics = address => Promise.all(['balanceOf', 'genesisClaimed'].map(functionName => chain.readContract({
    address: A.ChimeraLab, abi: labAbi, functionName, args: [address],
  })))
  async function starterFee(keeper) {
    if (!enabled) return undefined
    const [fees, estimate, balance] = await Promise.all([
      chain.estimateFeesPerGas(),
      chain.estimateContractGas({ account: keeper.address, address: A.ChimeraLab, abi: labAbi, functionName: 'hatchGenesis' }),
      chain.getBalance({ address: keeper.address }),
    ])
    const gas = estimate * 15n / 10n
    const minimumTip = 1_000_000n
    const priorityFee = fees.maxPriorityFeePerGas > minimumTip ? fees.maxPriorityFeePerGas : minimumTip
    const maxFee = fees.maxFeePerGas > priorityFee ? fees.maxFeePerGas : priorityFee * 2n
    if (gas > 16_000_000n || maxFee > sponsor.maxFee) throw problem(503, 'Starter sponsorship is temporarily unavailable.')
    if (gas * maxFee > balance) throw problem(409, 'Your game wallet needs more Sepolia ETH to mint.')
    return {
      type: 'absolute',
      config: { gasLimit: String(gas), maxFee: formatGwei(maxFee), priorityFee: formatGwei(priorityFee) },
    }
  }

  async function verifyFunding(hash) {
    const receipt = await chain.waitForTransactionReceipt({ hash, timeout: 25_000 })
    return receipt.status === 'success'
  }

  async function fund(keeper) {
    if (!sponsor) return
    const [balance, mintFees, mintEstimate] = await Promise.all([
      chain.getBalance({ address: keeper.address }),
      chain.estimateFeesPerGas(),
      chain.estimateContractGas({ account: keeper.address, address: A.ChimeraLab, abi: labAbi, functionName: 'hatchGenesis' }),
    ])
    const mintGas = mintEstimate * 15n / 10n
    const minimumFee = 1_000_000n
    const mintMaxFee = mintFees.maxFeePerGas > minimumFee ? mintFees.maxFeePerGas : minimumFee
    if (mintGas > 16_000_000n || mintMaxFee > sponsor.maxFee) throw problem(503, 'Starter sponsorship is temporarily unavailable.')
    const needed = mintGas * mintMaxFee
    if (balance >= needed) return
    const prior = store.starterFunding(keeper)
    let failedHash
    if (prior?.hash) {
      if (await verifyFunding(prior.hash)) {
        if (await chain.getBalance({ address: keeper.address }) >= needed) return
        throw problem(409, 'Your game wallet needs more Sepolia ETH to mint.')
      }
      failedHash = prior.hash
    }
    if (amount + balance < needed) throw problem(503, 'Starter sponsorship does not cover the configured gas limit.')
    const [fees, payerBalance, estimate] = await Promise.all([
      chain.estimateFeesPerGas(),
      chain.getBalance({ address: sponsor.account.address, blockTag: 'pending' }),
      chain.estimateGas({ account: sponsor.account.address, to: keeper.address, value: amount }),
    ])
    const gas = estimate * 12n / 10n
    if (gas > 500_000n || fees.maxFeePerGas > sponsor.maxFee || payerBalance < amount + fees.maxFeePerGas * gas) {
      throw problem(503, 'Starter sponsorship is temporarily unavailable.')
    }
    const reserved = failedHash ? store.retryFunding(keeper, failedHash) : store.reserveFunding(keeper, limit)
    if (!reserved) throw problem(429, 'Starter funding is pending or its budget has been reached.')
    const hash = await sponsor.wallet.sendTransaction({ to: keeper.address, value: amount, gas, ...fees })
    store.saveFunding(keeper, hash)
    if (!await verifyFunding(hash)) throw problem(503, 'Starter gas could not be sent. Try the mint again.')
  }

  return { metrics, fund, starterFee, waitForDependencies: (keeper, call) => waitForApproval({store,chain,keeper,call,czama:CZAMA,zama:ZAMA}), sponsored: enabled, verifyMessage: params => chain.verifyMessage(params) }
}

module.exports = { gameCall, labKeyData, keeperChain, lab: A.ChimeraLab, hatchData }
