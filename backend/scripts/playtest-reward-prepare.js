const fs = require('node:fs')
const h = require('./playtest-keepers')
const a = require('./playtest-activities')
const file = h.directory + '/reward-preparation.json'
const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}
const save = () => fs.writeFileSync(file, JSON.stringify(result, null, 2))

async function main() {
  const round = Number(await h.read('ChimeraRaffle', 'currentRound'))
  for (const [index, count] of [[2, 5], [5, 3]]) {
    await h.operator(index, 'ChimeraRaffle')
    const input = await h.seal(index, 'ChimeraRaffle', [[16, count]])
    await h.tx(index, 'reward-raffle-extra-buyer-' + round, 'ChimeraRaffle', 'buy', [input.handles[0], input.proof])
    const handle = await h.read('ChimeraRaffle', 'ticketsHandle', [round, h.report.players[index].address])
    const values = await a.privateRead(index, [handle], 'ChimeraRaffle')
    if (Number(Object.values(values)[0]) !== count) throw new Error('Extra raffle buyer did not receive paid tickets')
  }
  result.raffle = { round, participants: [3, 6, 7], boughtCountsVerifiedPrivately: true }
  save()
  if (!result.season) {
    const scores = []
    for (const p of h.report.players) scores.push({ index: p.player - 1, score: Number(await h.read('ChimeraSeason', 'scoreOf', [p.address])) })
    scores.sort((x, y) => y.score - x.score || x.index - y.index)
    const chosen = new Set()
    for (let seat = 0; seat < 3; seat++) {
      const [holders, points] = await h.read('ChimeraSeason', 'getThrones')
      const candidate = scores.find(row => !chosen.has(row.index) && row.score > 0 && row.score > Number(points[seat]))
      if (candidate) {
        await h.tx(candidate.index, 'reward-season-claim-seat-' + seat, 'ChimeraSeason', 'claimThrone', [seat])
        chosen.add(candidate.index)
      } else {
        const current = h.report.players.findIndex(p => p.address.toLowerCase() === holders[seat].toLowerCase())
        if (current >= 0) chosen.add(current)
      }
    }
    const [holders, points] = await h.read('ChimeraSeason', 'getThrones')
    if (holders.some(address => /^0x0{40}$/i.test(address)) || new Set(holders.map(address => address.toLowerCase())).size !== 3) throw new Error('Three funded season seats were not occupied')
    result.season = { holders, scores: points.map(Number), earnedByNormalGameplay: true }
    save()
  }
  if (!result.rareScan) {
    const total = Number(await h.read('ChimeraLab', 'totalCreatures'))
    if (total > 100) throw new Error('Unexpected population growth; explicit rarity scan limit reached')
    const rows = []
    for (let id = 1; id <= total; id++) {
      const creature = await h.read('ChimeraLab', 'getCreature', [id])
      if (!creature.bornAt) continue
      const handles = (await h.read('ChimeraLab', 'getPhenotypeHandles', [id])).slice(0, 7)
      const proof = await h.decrypt(handles)
      const traits = handles.map(handle => Number(proof.clearValues[handle.toLowerCase()] ?? proof.clearValues[handle]))
      const rareTraits = traits.filter(value => value >= 12).length
      const owner = await h.read('ChimeraLab', 'ownerOf', [id])
      rows.push({ nftId: id, rareTraits, owner, eligible: rareTraits >= 5, alreadyClaimed: creature.chimera })
    }
    result.rareScan = { scanned: rows.length, eligible: rows.filter(row => row.eligible), highestRareTraitCount: Math.max(...rows.map(row => row.rareTraits)), rows }
    save()
    for (const row of result.rareScan.eligible) {
      const index = h.report.players.findIndex(p => p.address.toLowerCase() === row.owner.toLowerCase())
      if (index < 0 || row.alreadyClaimed) continue
      const handles = (await h.read('ChimeraLab', 'getPhenotypeHandles', [row.nftId])).slice(0, 7)
      const proof = await h.decrypt(handles)
      const claim = await h.tx(index, 'reward-natural-rare-title-' + row.nftId, 'ChimeraLab', 'claimChimera', [BigInt(row.nftId), proof.abiEncodedClearValues, proof.decryptionProof])
      row.claimHash = claim.hash
      save()
    }
  }
  console.log('REWARDS_PREPARED', JSON.stringify({ raffle: result.raffle, season: result.season, rareScan: { scanned: result.rareScan.scanned, eligible: result.rareScan.eligible, highestRareTraitCount: result.rareScan.highestRareTraitCount } }))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
