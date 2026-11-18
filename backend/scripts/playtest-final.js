const h = require('./playtest-keepers')
const a = require('./playtest-activities')
const { keccak256, concat, formatEther } = require('viem')
const deployment = require(h.directory + '/deployment.json')
const who = i => h.report.players[i].address
const nft = i => BigInt(h.report.players[i].nftId)

async function blocked(i, name, contract, method, args, reason) {
  return h.step(i, name, async () => {
    try {
      await h.publicClient.simulateContract({ account: who(i), address: h.A[contract], abi: deployment.abis[contract], functionName: method, args })
    } catch (error) {
      if (error.message.includes(reason)) return { expectedRevert: reason, verifiedOnSepolia: true }
      throw error
    }
    throw new Error('Expected ' + reason + ' but simulation succeeded')
  })
}

async function main() {
  await h.step(0, 'training-and-ascension-state', async () => {
    const [profile] = await h.read('ChimeraTraining', 'getProfile', [nft(0)])
    const made = h.report.players[0].steps['ascension-new-offering']
    const [offering] = await h.events(made, 'ChimeraLab', 'Hatched')
    const owner = await h.read('ChimeraLab', 'ownerOf', [offering.id])
    if (profile.level < 1 || profile.pending || owner.toLowerCase() !== h.A.ChimeraAscension.toLowerCase()) throw new Error('Training or offering state mismatch')
    return { level: Number(profile.level), trainings: Number(profile.trainings), offeringPermanentlyVaulted: true }
  })
  const wilds = await h.read('ChimeraColosseum', 'roamingWilds')
  if (wilds.length && h.report.players[0].steps['challenge-wild-proof']?.status !== 'passed') {
    const input = await h.seal(0, 'ChimeraColosseum', [[8, 0b100100]])
    const sent = await h.tx(0, 'challenge-roaming-wild', 'ChimeraColosseum', 'challengeWild', [nft(0), wilds[0], input.handles[0], input.proof])
    const [battle] = await h.events(sent, 'ChimeraColosseum', 'BattleStarted')
    await h.settle(0, 'challenge-wild-settle', 'battle', battle.battleId, battle.roundHandles, 'ChimeraColosseum', 'settle')
    await h.step(0, 'challenge-wild-proof', async () => {
      const [value] = await h.read('ChimeraColosseum', 'getBattle', [battle.battleId])
      const proof = await h.decrypt(battle.roundHandles)
      const rounds = battle.roundHandles.map(handle => proof.clearValues[handle.toLowerCase()] ?? proof.clearValues[handle])
      if (Number(value.status) !== 2 || rounds.filter(Boolean).length >= 2 !== value.challengerWon) throw new Error('Wild battle proof mismatch')
      return { battleId: Number(battle.battleId), rounds, won: value.challengerWon, verified: true }
    })
  }
  await blocked(0, 'season-early-end-gate', 'ChimeraSeason', 'endSeason', [], 'SeasonRunning')
  await blocked(4, 'oracle-early-expiry-gate', 'ChimeraOracle', 'expire', [], 'RoundLive')
  for (const i of [0, 3, 4]) {
    const old = h.report.players[i].steps['season-claim-throne']
    if (old?.status !== 'failed' || !old.request) continue
    const info = await h.api(i, 'keeper/transactions/' + old.request.id)
    if (!info.hash) throw new Error('Missing contested-throne receipt')
    const receipt = await h.publicClient.getTransactionReceipt({ hash: info.hash })
    const transaction = await h.publicClient.getTransaction({ hash: info.hash })
    const contract = { address: h.A.ChimeraSeason, abi: deployment.abis.ChimeraSeason, blockNumber: receipt.blockNumber }
    const [mine, [holders, scores]] = await Promise.all([
      h.publicClient.readContract({ ...contract, functionName: 'scoreOf', args: [who(i)] }),
      h.publicClient.readContract({ ...contract, functionName: 'getThrones' }),
    ])
    const seat = Number(require('viem').decodeFunctionData({ abi: deployment.abis.ChimeraSeason, data: transaction.input }).args[0])
    const ruleVerified = receipt.status === 'reverted' && holders[seat].toLowerCase() !== who(i).toLowerCase() && mine <= scores[seat]
    if (!ruleVerified) throw new Error('Could not verify contested throne rule')
    old.status = 'expected-revert'
    old.reason = 'Another keeper claimed the same throne first; historical Sepolia scores verify NotEnough.'
    old.mineAtBlock = String(mine)
    old.holderScoreAtBlock = String(scores[seat])
    old.hash = info.hash
    old.gasCostWei = String(receipt.gasUsed * receipt.effectiveGasPrice)
    h.log(i, 'season-claim-throne', old)
    h.save()
  }
  const failures = await h.pool(async i => {
    await h.step(i, 'nft-genome-commitment', async () => {
      const handles = await h.read('ChimeraLab', 'getGenomeHandles', [nft(i)])
      const mint = h.report.players[i].steps['starter-mint']
      const [birth] = await h.events(mint, 'ChimeraLab', 'Hatched')
      const commitment = keccak256(concat(handles))
      if (commitment.toLowerCase() !== birth.genomeCommitment.toLowerCase()) throw new Error('Genome commitment mismatch')
      return { commitment, verified: true }
    })
    await h.step(i, 'nft-metadata-and-image', async () => {
      const response = await fetch('https://ashenkin.xyz/api/ashenkin-nft/' + nft(i))
      const metadata = await response.json()
      if (!response.ok || !metadata.name || !metadata.image || !Array.isArray(metadata.attributes)) throw new Error('NFT metadata unavailable')
      const image = await fetch(metadata.image)
      if (!image.ok || !(await image.text()).includes('<svg')) throw new Error('NFT image unavailable')
      return { name: metadata.name, image: metadata.image, verified: true }
    })
    h.report.players[i].finalEth = formatEther(await h.publicClient.getBalance({ address: who(i) }))
  }, Array.from({ length: 10 }, (_, i) => i), 2)
  const run = h.report.players[5].steps['depths-repeat-final-state']
  if (run?.status === 'passed') await h.step(5, 'depths-private-floor-log', async () => {
    const hashes = [0, 1, 2].map(i => h.report.players[5].steps['depths-repeat-open-' + i].hash)
    if (new Set(hashes).size !== 3) throw new Error('Distinct floor actions shared a receipt')
    const [, content, damage, loot] = await h.read('ChimeraDepths', 'floorLog', [BigInt(run.runId), 1])
    const values = await a.privateRead(5, [content, damage, loot], 'ChimeraDepths')
    return { distinctTransactions: 3, privateFloorReadVerified: Object.keys(values).length === 3 }
  })
  h.report.payerBalance = formatEther(await h.publicClient.getBalance({ address: h.report.payer }))
  h.report.finalVerification = { at: new Date().toISOString(), failures }
  h.save()
  console.log('FINAL_CHECKS', JSON.stringify(h.report.finalVerification))
  if (failures.length) process.exitCode = 1
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
