const h = require('./playtest-keepers')
const { encodeFunctionData, parseAbi } = require('viem')
const { step, tx, read, events, seal, decrypt, operator, settle, login, report, secret, pool, fhe, A, CZ, ZAMA, publicClient } = h
const id = index => BigInt(report.players[index].nftId)
const who = index => report.players[index].address
const rec = (index, key) => report.players[index].steps[key]
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function coins(index) {
  await login(index)
  const amount = 1000n * 10n ** 18n
  await tx(index, 'faucet-mint', ZAMA, 'mint', [who(index), amount])
  await tx(index, 'faucet-approve', ZAMA, 'approve', [CZ, amount])
  await tx(index, 'faucet-wrap', CZ, 'wrap', [who(index), amount])
}

async function privateRead(index, handles, contract) {
  const key = secret.players[index].fhe
  if (!key) throw new Error('Complete the baseline Lab-key step first')
  return (await fhe()).userDecrypt(handles.map(handle => ({ handle, contractAddress: A[contract] || contract })),
    key.privateKey, key.publicKey, key.signature.replace(/^0x/, ''), key.contracts, who(index), key.start, key.days)
}

async function expedition(index) {
  await tx(index, 'expedition-approve', 'ChimeraLab', 'setApprovalForAll', [A.ChimeraExpeditions, true])
  await step(index, 'expedition-start', async () => {
    const sent = await tx(index, 'expedition-dispatch', 'ChimeraExpeditions', 'start', [id(index), 0])
    const [event] = await events(sent, 'ChimeraExpeditions', 'ExpeditionStarted')
    if (!event) throw new Error('Missing expedition start event')
    return { expeditionId: Number(event.expeditionId), endsAt: Number(event.endsAt), nftId: Number(id(index)) }
  })
}

async function claimExpedition(index) {
  const run = rec(index, 'expedition-start')
  if (!run) throw new Error('Expedition has not started')
  const wait = run.endsAt * 1000 - Date.now()
  if (wait > 0) {
    h.log(index, 'expedition-return', { waitingSeconds: Math.ceil(wait / 1000) })
    while (Date.now() < run.endsAt * 1000) await pause(Math.min(20_000, run.endsAt * 1000 - Date.now()))
  }
  const result = await tx(index, 'expedition-claim', 'ChimeraExpeditions', 'claim', [BigInt(run.expeditionId)])
  await step(index, 'expedition-loot', async () => {
    const [event] = await events(result, 'ChimeraExpeditions', 'ExpeditionReturned')
    const values = await privateRead(index, [event.successHandle, event.lootHandle], 'ChimeraExpeditions')
    // Payment handles belong to the confidential token, not the expedition.
    const sent = await privateRead(index, [event.sentHandle], CZ)
    const owner = await read('ChimeraLab', 'ownerOf', [id(index)])
    if (owner.toLowerCase() !== who(index).toLowerCase()) throw new Error('Specimen did not return from escrow')
    return { privateReportVerified: true, values: Object.values(values).map(String), sent: Object.values(sent).map(String), specimenReturned: true }
  })
}

async function breed(index) {
  const second = await tx(index, 'second-genesis', 'ChimeraLab', 'hatchGenesis')
  const [hatched] = await events(second, 'ChimeraLab', 'Hatched')
  const secondId = BigInt(hatched.id)
  const parents = await Promise.all([id(index), secondId].map(n => read('ChimeraLab', 'getCreature', [n])))
  const readyAt = Math.max(...parents.map(p => Number(p.cooldownUntil)))
  if (readyAt * 1000 > Date.now()) {
    h.log(index, 'breed-cooldown', { readyAt: new Date(readyAt * 1000).toISOString() })
    while (Date.now() < readyAt * 1000) await pause(Math.min(20_000, readyAt * 1000 - Date.now()))
  }
  await operator(index, 'ChimeraLab')
  const result = await tx(index, 'breed-parents', 'ChimeraLab', 'breed', [id(index), secondId])
  const [egg] = await events(result, 'ChimeraLab', 'EggLaid')
  await settle(index, 'breed-hatch', 'egg', egg.eggId, [egg.paidHandle], 'ChimeraLab', 'hatchEgg')
  await step(index, 'breed-lineage', async () => {
    const childId = BigInt(egg.eggId)
    const owner = await read('ChimeraLab', 'ownerOf', [childId])
    const info = await read('ChimeraLab', 'getCreature', [childId])
    if (owner.toLowerCase() !== who(index).toLowerCase() || !info.parentA || !info.parentB) throw new Error('Bred NFT or lineage missing')
    return { childId: Number(childId), parents: [Number(info.parentA), Number(info.parentB)], generation: Number(info.generation) }
  })
}

async function relics(index) {
  await operator(index, 'ChimeraRelics')
  const ids = []
  for (let n = 0; n < 3; n++) {
    const opened = await tx(index, 'relic-cache-' + n, 'ChimeraRelics', 'openCache')
    const [event] = await events(opened, 'ChimeraRelics', 'CacheOpened')
    ids.push(BigInt(event.relicId))
    if (n === 0) {
      await step(index, 'relic-private-report', async () => {
        const values = await privateRead(index, [event.tierHandle, event.powerHandle], 'ChimeraRelics')
        return { privateValuesVerified: Object.keys(values).length === 2 }
      })
      await tx(index, 'relic-equip', 'ChimeraRelics', 'equip', [ids[0], id(index), 0])
      await tx(index, 'relic-unequip', 'ChimeraRelics', 'unequip', [ids[0]])
    }
  }
  const fused = await tx(index, 'relic-fuse', 'ChimeraRelics', 'fuse', ids)
  const [result] = await events(fused, 'ChimeraRelics', 'CacheOpened')
  const fusedId = BigInt(result.relicId)
  await tx(index, 'relic-appraise', 'ChimeraRelics', 'appraise', [fusedId])
  await settle(index, 'relic-publish-appraisal', 'appraisal', fusedId, [result.tierHandle, result.powerHandle], 'ChimeraRelics', 'publishAppraisal')
}

async function oracle(index) {
  await operator(index, 'ChimeraOracle')
  await step(index, 'oracle-guess', async () => {
    const input = await seal(index, 'ChimeraOracle', [[16, 0x3210]])
    const sent = await tx(index, 'oracle-submit', 'ChimeraOracle', 'guess', [input.handles[0], input.proof])
    const [event] = await events(sent, 'ChimeraOracle', 'Guessed')
    const hints = await privateRead(index, [event.feedbackHandle], 'ChimeraOracle')
    return { guessId: Number(event.guessId), privateHintVerified: true, feedback: String(Object.values(hints)[0]) }
  })
  const guessId = BigInt(rec(index, 'oracle-guess').guessId)
  const claim = await tx(index, 'oracle-claim-proof', 'ChimeraOracle', 'claim', [guessId])
  const [event] = await events(claim, 'ChimeraOracle', 'ClaimRequested')
  const done = await settle(index, 'oracle-finalize', 'oracle', guessId, [event.solvedHandle], 'ChimeraOracle', 'finalize')
  return done
}

async function depths(index, prefix = 'depths') {
  await operator(index, 'ChimeraDepths')
  const started = await tx(index, prefix + '-enter', 'ChimeraDepths', 'enter', [id(index)])
  const [run] = await events(started, 'ChimeraDepths', 'RunStarted')
  const runId = BigInt(run.runId)
  // The lantern gives a player one observable door to choose on each floor.
  for (let floor = 0; floor < 3; floor++) {
    const [current] = await read('ChimeraDepths', 'getRun', [runId])
    if (current.over) break
    await tx(index, prefix + '-open-' + floor, 'ChimeraDepths', 'open', [runId, Number(current.lit)])
  }
  const [current] = await read('ChimeraDepths', 'getRun', [runId])
  if (!current.over) await tx(index, prefix + '-leave', 'ChimeraDepths', 'leave', [runId])
  const reveal = await tx(index, prefix + '-reveal-survival', 'ChimeraDepths', 'revealSurvival', [runId])
  const [event] = await events(reveal, 'ChimeraDepths', 'SurvivalRevealed')
  await settle(index, prefix + '-record', 'depths', runId, [event.survivedHandle], 'ChimeraDepths', 'recordDepth')
  await step(index, prefix + '-final-state', async () => {
    const [value] = await read('ChimeraDepths', 'getRun', [runId])
    if (!value.over || !value.recorded || Number(value.cleared) !== 3) throw new Error('Depths run was not recorded')
    return { runId: Number(runId), floors: Number(value.cleared), exited: true, recorded: true }
  })
}

async function raffle(index) {
  const roundId = await read('ChimeraRaffle', 'currentRound')
  let [round] = await read('ChimeraRaffle', 'getRound', [roundId])
  if (Number(round.endsAt) * 1000 <= Date.now() && !round.entries) {
    await tx(index, 'raffle-roll-empty-round', 'ChimeraRaffle', 'draw')
    ;[round] = await read('ChimeraRaffle', 'getRound', [roundId])
  }
  if (Number(round.endsAt) * 1000 > Date.now()) {
    await operator(index, 'ChimeraRaffle')
    const input = await seal(index, 'ChimeraRaffle', [[16, 2]])
    await tx(index, 'raffle-buy-tickets', 'ChimeraRaffle', 'buy', [input.handles[0], input.proof])
    await step(index, 'raffle-private-tickets', async () => {
      const handle = await read('ChimeraRaffle', 'ticketsHandle', [roundId, who(index)])
      const result = await privateRead(index, [handle], 'ChimeraRaffle')
      if (Number(Object.values(result)[0]) !== 2) throw new Error('Ticket count differs from purchase')
      return { round: Number(roundId), tickets: 2, drawAvailableAt: new Date(Number(round.endsAt) * 1000).toISOString() }
    })
  }
  await step(index, 'raffle-draw-gate', async () => {
    try {
      await publicClient.simulateContract({ account: who(index), address: A.ChimeraRaffle, abi: require(h.directory + '/deployment.json').abis.ChimeraRaffle, functionName: 'draw' })
    } catch (error) {
      if (/RoundOpen/.test(error.message)) return { correctlyBlockedUntil: new Date(Number(round.endsAt) * 1000).toISOString() }
      throw error
    }
    throw new Error('Raffle allowed an early draw')
  })
}

async function raid(index, prefix = 'boss') {
  const available = await read('ChimeraLab', 'creaturesOf', [who(index)])
  const creatureId = available.find(value => value === id(index)) ?? available[0]
  if (!creatureId) throw new Error('All specimens are currently held by another activity')
  const attack = await tx(index, prefix + '-strike', 'ChimeraRaid', 'strike', [creatureId])
  const [event] = await events(attack, 'ChimeraRaid', 'Struck')
  const strikeId = BigInt(event.strikeId)
  const [, killing] = await read('ChimeraRaid', 'getStrike', [strikeId])
  const proof = await decrypt([killing])
  if (Object.values(proof.clearValues)[0] === true) await tx(index, prefix + '-finalize-kill', 'ChimeraRaid', 'finalizeKill', [strikeId, proof.abiEncodedClearValues, proof.decryptionProof])
  await step(index, prefix + '-proof', async () => ({ strikeId: Number(strikeId), killed: Object.values(proof.clearValues)[0] === true }))
}

async function market(seller = 6, buyer = 7) {
  const fresh = await tx(seller, 'market-new-specimen', 'ChimeraLab', 'hatchGenesis')
  const [birth] = await events(fresh, 'ChimeraLab', 'Hatched')
  const nft = BigInt(birth.id)
  await tx(seller, 'market-approve', 'ChimeraLab', 'approve', [A.ChimeraMarket, nft])
  const listed = await tx(seller, 'market-list', 'ChimeraMarket', 'list', [nft, 2_000_000n])
  const [sale] = await events(listed, 'ChimeraMarket', 'Listed')
  await tx(seller, 'market-cancel', 'ChimeraMarket', 'cancel', [sale.listingId])
  await tx(seller, 'market-approve-sale', 'ChimeraLab', 'approve', [A.ChimeraMarket, nft])
  const relisted = await tx(seller, 'market-relist', 'ChimeraMarket', 'list', [nft, 2_000_000n])
  const [listing] = await events(relisted, 'ChimeraMarket', 'Listed')
  await operator(buyer, 'ChimeraMarket')
  const purchase = await tx(buyer, 'market-buy', 'ChimeraMarket', 'buy', [listing.listingId])
  const [paid] = await events(purchase, 'ChimeraMarket', 'PurchaseStarted')
  await settle(buyer, 'market-finalize', 'market', listing.listingId, [paid.paidHandle], 'ChimeraMarket', 'finalize')
  await step(buyer, 'market-ownership', async () => {
    const owner = await read('ChimeraLab', 'ownerOf', [nft])
    if (owner.toLowerCase() !== who(buyer).toLowerCase()) throw new Error('Bought NFT did not reach buyer')
    return { nftId: Number(nft), seller: who(seller), buyer: owner }
  })
}

async function pvp(defender = 8, challenger = 9) {
  await operator(defender, 'ChimeraColosseum')
  await operator(challenger, 'ChimeraColosseum')
  const input = await seal(defender, 'ChimeraColosseum', [[64, 1_000_000n], [8, 0b100100]])
  await tx(defender, 'pvp-post-defender', 'ChimeraColosseum', 'registerDefender', [id(defender), input.handles[0], input.handles[1], input.proof])
  const next = await seal(defender, 'ChimeraColosseum', [[8, 0b000110]])
  await tx(defender, 'pvp-change-plan', 'ChimeraColosseum', 'replan', [id(defender), next.handles[0], next.proof])
  const challenge = await seal(challenger, 'ChimeraColosseum', [[64, 1_000_000n], [8, 0b100001]])
  const bout = await tx(challenger, 'pvp-duel', 'ChimeraColosseum', 'duel', [id(challenger), id(defender), challenge.handles[0], challenge.handles[1], challenge.proof])
  const [event] = await events(bout, 'ChimeraColosseum', 'BattleStarted')
  await settle(challenger, 'pvp-settle', 'battle', event.battleId, event.roundHandles, 'ChimeraColosseum', 'settle')
  await step(defender, 'pvp-defender-consumed', async () => {
    const [, , active] = await read('ChimeraColosseum', 'getDefender', [id(defender)])
    if (active) throw new Error('Duel did not consume the defender registration')
    return { inactiveAfterDuel: true }
  })
  const again = await seal(defender, 'ChimeraColosseum', [[64, 1_000_000n], [8, 0b100100]])
  await tx(defender, 'pvp-register-to-withdraw', 'ChimeraColosseum', 'registerDefender', [id(defender), again.handles[0], again.handles[1], again.proof])
  await tx(defender, 'pvp-withdraw', 'ChimeraColosseum', 'withdrawDefender', [id(defender)])
}

async function training(index = 1) {
  const made = await tx(index, 'ascension-new-offering', 'ChimeraLab', 'hatchGenesis')
  const [offering] = await events(made, 'ChimeraLab', 'Hatched')
  await tx(index, 'ascension-approve', 'ChimeraLab', 'approve', [A.ChimeraAscension, offering.id])
  await tx(index, 'ascension-offer', 'ChimeraAscension', 'ascend', [id(index), offering.id])
  await operator(index, 'ChimeraTraining')
  const start = await tx(index, 'training-start', 'ChimeraTraining', 'train', [id(index)])
  const [event] = await events(start, 'ChimeraTraining', 'TrainingStarted')
  await settle(index, 'training-complete', 'training', id(index), [event.paidHandle], 'ChimeraTraining', 'completeTraining')
  await tx(index, 'training-reveal-bonus', 'ChimeraTraining', 'reveal', [id(index)])
}

async function main() {
  const mode = process.argv[2] || 'coins'
  const all = Array.from({ length: 10 }, (_, i) => i)
  let failures = []
  if (mode === 'coins') failures = await pool(coins, all)
  if (mode === 'expedition') failures = await pool(expedition, [0, 1], 2)
  if (mode === 'raid') failures = await pool(index => raid(index), all, 2)
  if (mode === 'raid-finish') {
    const level = await read('ChimeraRaid', 'currentLevel')
    for (const index of all) {
      if (await read('ChimeraRaid', 'currentLevel') !== level) break
      await raid(index, 'boss-wave2')
    }
    if (await read('ChimeraRaid', 'currentLevel') === level) throw new Error('Boss still alive after second wave')
    failures = await pool(async index => {
      if (await read('ChimeraRaid', 'canClaim', [level, who(index)])) await tx(index, 'boss-share-claim', 'ChimeraRaid', 'claimShare', [level])
    }, all, 2)
  }
  if (mode === 'retest') {
    const jobs = [() => relics(3), () => raffle(6), () => market(), () => pvp(), () => depths(5, 'depths-repeat')];
    failures = await pool(index => jobs[index](), jobs.map((_, i) => i), 2)
  }
  if (mode === 'activities') {
    const jobs = [() => breed(2), () => relics(3), () => oracle(4), () => depths(5), () => raffle(6), () => market(), () => pvp()]
    failures = await pool(index => jobs[index](), jobs.map((_, i) => i), 3)
  }
  if (mode === 'claim') failures = await pool(claimExpedition, [0, 1], 2)
  if (mode === 'training') {
    await training(0)
    const offering = await tx(8, 'retire-new-offering', 'ChimeraLab', 'hatchGenesis')
    const [birth] = await events(offering, 'ChimeraLab', 'Hatched')
    await tx(8, 'retire-approve', 'ChimeraLab', 'approve', [A.ChimeraAscension, birth.id])
    await tx(8, 'retire-specimen', 'ChimeraAscension', 'retire', [birth.id])
    await step(8, 'retire-lineage-charge', async () => {
      const charge = await read('ChimeraLab', 'lineageCharges', [who(8)])
      if (!charge) throw new Error('Retirement did not produce a lineage charge')
      return { charges: Number(charge), retiredNft: Number(birth.id) }
    })
  }
  if (mode === 'rewards') {
    await tx(0, 'quest-single-task', 'ChimeraQuests', 'claimTask', [0])
    await tx(0, 'quest-daily-chest', 'ChimeraQuests', 'claimChest')
    failures = await pool(async index => {
      const [, , today] = await read('ChimeraQuests', 'status', [who(index)])
      await tx(index, 'quest-claim-all', 'ChimeraQuests', 'claimAll', [today])
      const score = await read('ChimeraSeason', 'scoreOf', [who(index)])
      if (score > 0) {
        const [holders, scores] = await read('ChimeraSeason', 'getThrones')
        const seat = scores.findIndex(value => Number(value) < Number(score))
        if (seat >= 0 && !holders.some(value => value.toLowerCase() === who(index).toLowerCase())) {
          await tx(index, 'season-claim-throne', 'ChimeraSeason', 'claimThrone', [seat])
        }
      }
    }, all, 2)
    await tx(9, 'certify-public-genome', 'ChimeraLab', 'certify', [id(9)])
    await tx(7, 'treasury-publish-reserve', 'ChimeraTreasury', 'publishReserve')
    await tx(7, 'boss-publish-pot', 'ChimeraRaid', 'publishPot')
  }
  report.activityRuns ??= []
  report.activityRuns.push({ mode, at: new Date().toISOString(), failures })
  h.save()
  console.log('ACTIVITIES_FINISHED', JSON.stringify({ mode, failures }))
  if (failures.length) process.exitCode = 1
}
if (require.main === module) main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })

module.exports = { relics, raffle, market, pvp, depths, raid, claimExpedition, training, privateRead }
