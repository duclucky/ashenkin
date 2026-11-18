const {
  createPublicClient,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseEventLogs,
  decodeAbiParameters,
  parseGwei,
  parseEther,
} = require('viem')
const { sepolia } = require('viem/chains')
const { sponsorClients } = require('./settlement-sponsor')
const { sponsorLane, blockSponsor } = require('./sponsor-lane')
const { RPC, zama } = require('./zama')
const { addresses: A } = require('./ashenkin.json')
const { lifeService } = require('./life')
const ABI = parseAbi([
  'function lab() view returns (address)',
  'function RULES() view returns (uint8)',
  'function epochs(uint256) view returns (uint64 openedAt,uint64 population)',
  'function encounter(uint256,uint256) view returns ((address holder,uint64 occurredAt,bytes32 result))',
  'function draw(uint256[])',
  'function verify(uint256,uint256,bytes,bytes) view returns (bool)',
  'event EncounterSealed(uint256 indexed day,uint256 indexed creatureId,address indexed holder,bytes32 result)',
])
const LAB_ABI = parseAbi([
  'error ERC721NonexistentToken(uint256 tokenId)',
  'function ownerOf(uint256) view returns (address)',
  'function totalCreatures() view returns (uint256)',
  'function creaturesOf(address) view returns (uint256[])',
  'function isCombat(address) view returns (bool)',
])
const EMPTY = /^0x0+$/i
function livingChain({
  address,
  clients,
  maxFee,
  store,
  world,
  reader,
  network = sepolia,
  labAddress = A.ChimeraLab,
}) {
  const { client, wallet, account } = clients || {}
  const readClient =
    reader ||
    client ||
    createPublicClient({
      chain: sepolia,
      transport: http(RPC, { timeout: 8000, retryCount: 1 }),
    })
  const read = (functionName, args = []) =>
    readClient.readContract({ address, abi: ABI, functionName, args })
  const labRead = (functionName, args = []) =>
    readClient.readContract({
      address: labAddress,
      abi: LAB_ABI,
      functionName,
      args,
    })
  const excluded = new Set(Object.values(A).map((a) => a.toLowerCase()))
  if (account)
    blockSponsor(account.address, () => !!store.life.state(world).operation)
  let checked = false
  async function checkDeployment() {
    if (checked) return
    const [lab, rules, allowed] = await Promise.all([
      read('lab'),
      read('RULES'),
      labRead('isCombat', [address]),
    ])
    if (
      lab.toLowerCase() !== labAddress.toLowerCase() ||
      rules !== 1 ||
      !allowed
    )
      throw new Error('Invalid living-world deployment or Lab ACL')
    checked = true
  }
  return {
    address,
    async owned(who) {
      return (await labRead('creaturesOf', [who])).map(Number)
    },
    async owner(nft) {
      return labRead('ownerOf', [BigInt(nft)])
    },
    async eligible(nft) {
      const owner = await labRead('ownerOf', [BigInt(nft)]).catch((error) => {
        // A retired NFT can be skipped; transport errors must abort the scan.
        if (/ERC721NonexistentToken/.test(error.shortMessage || error.message))
          return null
        throw error
      })
      return !!owner && !excluded.has(owner.toLowerCase()) && !EMPTY.test(owner)
    },
    async population(day) {
      await checkDeployment()
      const epoch = await read('epochs', [BigInt(day)])
      return Number(epoch[0] ? epoch[1] : await labRead('totalCreatures'))
    },
    async encounter(day, nft) {
      const e = await read('encounter', [BigInt(day), BigInt(nft)])
      if (EMPTY.test(e.result)) return null
      // Recover external-sponsored draws from logs; no backend-only reroll.
      const block = await readClient.getBlockNumber({ cacheTime: 0 })
      // Daily blocks are bounded; use chunks to respect public RPC log limits.
      for (let to = block; to > 0n;) {
        const from = to > 999n ? to - 999n : 0n
        const logs = await readClient.getLogs({
          address,
          event: ABI.find((a) => a.type === 'event'),
          args: { day: BigInt(day), creatureId: BigInt(nft) },
          fromBlock: from,
          toBlock: to,
        })
        if (logs.length) {
          if (block < logs[0].blockNumber + 2n)
            throw new Error('Waiting for encounter confirmations')
          return {
            day,
            nft,
            at: Number(e.occurredAt) * 1000,
            handle: e.result,
            hash: logs[0].transactionHash,
          }
        }
        if (from === 0n || block - from > 10_000n) break
        to = from - 1n
      }
      throw new Error('Encounter exists but its receipt has not been recovered')
    },
    async prepare(ids, remaining, authorize, commit) {
      if (!account) throw new Error('Living-world sponsorship is unavailable')
      return sponsorLane(
        account.address,
        async () => {
          await checkDeployment()
          const [pending, latest, fees, balance, gasEstimate] =
            await Promise.all([
              client.getTransactionCount({
                address: account.address,
                blockTag: 'pending',
              }),
              client.getTransactionCount({
                address: account.address,
                blockTag: 'latest',
              }),
              client.estimateFeesPerGas(),
              client.getBalance({
                address: account.address,
                blockTag: 'pending',
              }),
              client.estimateContractGas({
                address,
                abi: ABI,
                functionName: 'draw',
                args: [ids.map(BigInt)],
                account: account.address,
              }),
            ])
          if (pending !== latest)
            throw new Error('Wait for pending sponsor transactions')
          const gas = (gasEstimate * 13n) / 10n
          const cost = gas * fees.maxFeePerGas
          if (
            gas > 16_000_000n ||
            fees.maxFeePerGas > maxFee ||
            cost > remaining ||
            cost > balance
          )
            throw new Error('Living-world sponsorship cap reached')
          authorize()
          const request = await wallet.prepareTransactionRequest({
            account,
            to: address,
            data: require('viem').encodeFunctionData({
              abi: ABI,
              functionName: 'draw',
              args: [ids.map(BigInt)],
            }),
            chain: network,
            nonce: pending,
            gas,
            ...fees,
          })
          const raw = await account.signTransaction(request)
          // Reserve while still inside the shared signing lane. The worker saves
          // before broadcast. Other sponsor sends also check the pending nonce.
          const op = { raw, hash: keccak256(raw), maxCost: String(cost) }
          commit(op)
          return op
        },
        { living: true },
      )
    },
    async broadcast(raw, hash) {
      const found = await readClient.getTransaction({ hash }).catch((error) => {
        if (error.name === 'TransactionNotFoundError') return null
        throw error
      })
      if (found) return
      try {
        const actual = await readClient.sendRawTransaction({
          serializedTransaction: raw,
        })
        if (actual !== hash) throw new Error('Unexpected sponsored hash')
      } catch (error) {
        if (!/already known/i.test(error.shortMessage || error.message))
          throw error
      }
    },
    async receipt(hash) {
      const r = await readClient
        .getTransactionReceipt({ hash })
        .catch((error) => {
          if (error.name === 'TransactionReceiptNotFoundError') return null
          throw error
        })
      if (
        !r ||
        (await readClient.getBlockNumber({ cacheTime: 0 })) < r.blockNumber + 2n
      )
        return null
      if (
        r.to?.toLowerCase() !== address.toLowerCase() ||
        (account && r.from.toLowerCase() !== account.address.toLowerCase())
      )
        throw new Error('Unexpected living-world receipt')
      const block = await readClient.getBlock({ blockNumber: r.blockNumber })
      return {
        cost: String(r.gasUsed * r.effectiveGasPrice),
        day: Math.floor(Number(block.timestamp) / 86400),
        failed: r.status !== 'success',
        results: parseEventLogs({
          abi: ABI,
          logs: r.logs,
          eventName: 'EncounterSealed',
        })
          .filter((e) => e.address.toLowerCase() === address.toLowerCase())
          .map((e) => ({
            day: Number(e.args.day),
            nft: Number(e.args.creatureId),
            at: Number(block.timestamp) * 1000,
            hash,
            handle: e.args.result,
          })),
      }
    },
    async decrypt(handle) {
      const result = await (await zama()).publicDecrypt([handle])
      const [value] = decodeAbiParameters(
        [{ type: 'uint16' }],
        result.abiEncodedClearValues,
      )
      return {
        value: Number(value),
        cleartexts: result.abiEncodedClearValues,
        proof: result.decryptionProof,
      }
    },
    async verify(day, nft, proof) {
      const [value] = decodeAbiParameters(
        [{ type: 'uint16' }],
        proof.cleartexts,
      )
      if (Number(value) !== proof.value) return false
      return read('verify', [
        BigInt(day),
        BigInt(nft),
        proof.cleartexts,
        proof.proof,
      ])
    },
  }
}

function productionLife(store, env = process.env) {
  const address = env.ASHENKIN_ENCOUNTERS_ADDRESS
  if (!address) return null
  if (!isAddress(address) || EMPTY.test(address))
    throw new Error('Invalid encounter contract address')
  const world = `11155111:${address.toLowerCase()}`
  const clients =
    env.ASHENKIN_LIFE_WORKER === 'true' ? sponsorClients(env) : null
  if (env.ASHENKIN_LIFE_WORKER === 'true' && !clients)
    throw new Error('Living-world sponsorship needs a configured server signer')
  const chain = livingChain({
    address,
    clients,
    store,
    world,
    maxFee: parseGwei(env.ASHENKIN_LIFE_MAX_GWEI || '0.1'),
  })
  const service = lifeService({
    store,
    chain,
    world,
    dailyBudgetWei: parseEther(env.ASHENKIN_LIFE_DAILY_ETH || '0.005'),
  })
  return { ...service, chain, runWorker: !!clients }
}
module.exports = { livingChain, productionLife, ABI }
