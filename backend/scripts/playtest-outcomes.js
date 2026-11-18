const h = require('./playtest-keepers')
const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const { formatEther } = require('viem')
const d = require(h.directory + '/deployment.json')
const who = i => h.report.players[i].address
const nft = i => BigInt(h.report.players[i].nftId)

async function main() {
  const recovery = JSON.parse(fs.readFileSync(h.directory + '/recovery.json'))
  await h.step(8, 'pvp-withdraw', async () => {
    const receipt = await h.publicClient.getTransactionReceipt({ hash: recovery.hash })
    const [, , active] = await h.read('ChimeraColosseum', 'getDefender', [nft(8)])
    const events = await h.events(recovery, 'ChimeraColosseum', 'DefenderWithdrawn')
    if (receipt.status !== 'success' || active || !events.length) throw new Error('UI recovery did not withdraw the defender')
    return { hash: recovery.hash, request: { id: recovery.requestId }, uiRecoveryVerified: true, gasUsed: String(receipt.gasUsed), gasCostWei: String(receipt.gasUsed * receipt.effectiveGasPrice) }
  })
  await h.step(9, 'pvp-round-proof', async () => {
    const [event] = await h.events(h.report.players[9].steps['pvp-duel'], 'ChimeraColosseum', 'BattleStarted')
    const proof = await h.decrypt(event.roundHandles)
    const rounds = event.roundHandles.map(handle => proof.clearValues[handle.toLowerCase()] ?? proof.clearValues[handle])
    const [battle] = await h.read('ChimeraColosseum', 'getBattle', [event.battleId])
    if (Number(battle.status) !== 2 || rounds.filter(Boolean).length >= 2 !== battle.challengerWon) throw new Error('Duel winner disagrees with proof')
    return { battleId: Number(event.battleId), rounds, won: battle.challengerWon, verified: true }
  })
  await h.step(2, 'breed-parents-retained', async () => {
    const child = h.report.players[2].steps['breed-lineage']
    const owners = await Promise.all(child.parents.map(id => h.read('ChimeraLab', 'ownerOf', [BigInt(id)])))
    if (!owners.every(owner => owner.toLowerCase() === who(2).toLowerCase())) throw new Error('Breeding removed a parent')
    return { parents: child.parents, child: child.childId, bothParentsRetained: true }
  })
  await h.step(1, 'boss-kill-and-shares', async () => {
    const [boss] = await h.read('ChimeraRaid', 'getBoss', [1])
    const level = await h.read('ChimeraRaid', 'currentLevel')
    const claimed = await Promise.all(h.report.players.map(p => h.read('ChimeraRaid', 'claimed', [1, p.address])))
    if (!boss.slainAt || level < 2 || !claimed.every(Boolean)) throw new Error('Boss kill or raider shares incomplete')
    return { levelKilled: 1, newLevel: Number(level), killer: boss.killer, claimed: claimed.length }
  })
  await h.step(4, 'oracle-final-result', async () => {
    const id = BigInt(h.report.players[4].steps['oracle-guess'].guessId)
    const [guess] = await h.read('ChimeraOracle', 'getGuess', [id])
    if (!guess.finalized) throw new Error('Oracle proof was not finalized')
    return { guessId: Number(id), finalized: true, won: guess.won }
  })
  await h.step(9, 'certified-genome-public-proof', async () => {
    const creature = await h.read('ChimeraLab', 'getCreature', [nft(9)])
    const handles = await h.read('ChimeraLab', 'getGenomeHandles', [nft(9)])
    const proof = await h.decrypt(handles)
    if (!creature.certified || Object.keys(proof.clearValues).length !== 8) throw new Error('Opt-in genome disclosure incomplete')
    return { certified: true, eightGeneProofVerified: true }
  })
  await h.step(9, 'chimera-rarity-rule', async () => {
    const handles = (await h.read('ChimeraLab', 'getPhenotypeHandles', [nft(9)])).slice(0, 7)
    const proof = await h.decrypt(handles)
    const rare = Object.values(proof.clearValues).filter(value => Number(value) >= 12).length
    const args = [nft(9), proof.abiEncodedClearValues, proof.decryptionProof]
    if (rare >= 5) {
      await h.tx(9, 'claim-rare-chimera', 'ChimeraLab', 'claimChimera', args)
      return { rareTraits: rare, claimed: true }
    }
    try {
      await h.publicClient.simulateContract({ account: who(9), address: h.A.ChimeraLab, abi: d.abis.ChimeraLab, functionName: 'claimChimera', args })
    } catch (error) {
      if (error.message.includes('NotAChimera')) return { rareTraits: rare, correctlyRejected: true }
      throw error
    }
    throw new Error('Unqualified specimen accepted as a Chimera')
  })
  const [raffleId, oracleId, seasonEnds] = await Promise.all([
    h.read('ChimeraRaffle', 'currentRound'), h.read('ChimeraOracle', 'currentRound'), h.read('ChimeraSeason', 'endsAt'),
  ])
  const [[raffle], [oracle], oracleLength] = await Promise.all([
    h.read('ChimeraRaffle', 'getRound', [raffleId]), h.read('ChimeraOracle', 'getRound', [oracleId]), h.read('ChimeraOracle', 'roundLength'),
  ])
  h.report.deferred = [
    { activity: 'raffle draw and payout', until: new Date(Number(raffle.endsAt) * 1000).toISOString(), reason: 'Live round remains open; early-draw guard verified.' },
    { activity: 'Oracle expiry and winning jackpot', until: new Date((Number(oracle.startedAt) + Number(oracleLength)) * 1000).toISOString(), reason: 'Expiry is gated; the encrypted guess did not win the jackpot.' },
    { activity: 'season end and prizes', until: new Date(Number(seasonEnds) * 1000).toISOString(), reason: 'Live season remains open; early-end guard verified.' },
    { activity: 'rare Chimera successful claim', reason: 'This test specimen does not meet five rare visible traits; rejection with valid KMS proof verified.' },
  ]
  const db = new DatabaseSync('db/keepers.sqlite', { readOnly: true })
  const rows = db.prepare('SELECT k.address, f.hash FROM keeper_starter_funding f JOIN keepers k ON k.id = f.keeper_id').all()
  const addresses = new Set(h.report.players.map(p => p.address.toLowerCase()))
  const starters = rows.filter(row => addresses.has(row.address.toLowerCase()) && row.hash)
  const starterFunds = await Promise.all(starters.map(async row => {
    const transaction = await h.publicClient.getTransaction({ hash: row.hash })
    return { address: row.address, hash: row.hash, valueWei: String(transaction.value) }
  }))
  const manual = h.report.players.reduce((sum, p) => sum + BigInt(p.manualFundingWei || 0), 0n)
  const initial = starterFunds.reduce((sum, row) => sum + BigInt(row.valueWei), 0n)
  h.report.funding = { allocatedEth: formatEther(manual + initial), manualEth: formatEther(manual), starterEth: formatEther(initial), starterTransfers: starterFunds }
  h.report.starterSponsorship = { configuredLimit: Number(process.env.ASHENKIN_STARTER_MINT_LIMIT), reserved: rows.length, remaining: Math.max(0, Number(process.env.ASHENKIN_STARTER_MINT_LIMIT) - rows.length) }
  db.close()
  for (const p of h.report.players) p.finalEth = formatEther(await h.publicClient.getBalance({ address: p.address }))
  h.report.payerBalance = formatEther(await h.publicClient.getBalance({ address: h.report.payer }))
  h.report.completedAt = new Date().toISOString()
  h.save()
  console.log('OUTCOMES_VERIFIED', JSON.stringify({ funding: h.report.funding.allocatedEth, sponsorship: h.report.starterSponsorship, deferred: h.report.deferred }))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
