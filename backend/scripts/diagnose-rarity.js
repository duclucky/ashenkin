// Read-only diagnosis: public phenotypes, already-published genomes and runtime code.
const fs = require('node:fs')
const { createPublicClient, http, keccak256 } = require('viem')
const { sepolia } = require('viem/chains')
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node')
const dir = '/app/backend/db/playtest-20261118'
const d = require(dir + '/deployment.json')
const client = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 15_000, retryCount: 1 }) })
const read = (functionName, args = []) => client.readContract({ address: d.addresses.ChimeraLab, abi: d.abis.ChimeraLab, functionName, args })

async function main() {
  const result = { observedAt: new Date().toISOString(), contract: d.addresses.ChimeraLab, chainId: 11155111, mutationsOrSignatures: 0 }
  result.constants = { rareThreshold: Number(await read('RARE_THRESHOLD')), requiredTraits: Number(await read('CHIMERA_RARE_TRAITS')), visibleTraits: Number(await read('VISIBLE_LOCI')), populationLimit: Number(await read('populationLimit')) }
  result.totalCreatures = Number(await read('totalCreatures'))
  result.claimedTitles = Number(await read('chimeraCount'))
  if (result.totalCreatures > 100) throw new Error('Read-only scan limit reached')
  const fingerprint = require(dir + '/rarity-runtime.json')
  const live = await client.getCode({ address: d.addresses.ChimeraLab })
  const normalize = code => {
    const bytes = Buffer.from(code.slice(2), 'hex')
    for (const range of fingerprint.immutableRanges) bytes.fill(0, range.start, range.start + range.length)
    return '0x' + bytes.toString('hex')
  }
  result.runtime = { bytes: (live.length - 2) / 2, immutableRanges: fingerprint.immutableRanges.length, normalizedLiveHash: keccak256(normalize(live)), normalizedLocalHash: keccak256(normalize(fingerprint.runtime)) }
  result.runtime.matchesLocalBuild = result.runtime.normalizedLiveHash === result.runtime.normalizedLocalHash
  const fhe = await createInstance({ ...SepoliaConfig, network: 'https://ethereum-sepolia-rpc.publicnode.com' })
  const rows = []
  for (let id = 1; id <= result.totalCreatures; id++) {
    const info = await read('getCreature', [BigInt(id)])
    if (!info.bornAt) continue
    const handles = (await read('getPhenotypeHandles', [BigInt(id)])).slice(0, 7)
    const proof = await fhe.publicDecrypt(handles)
    const traits = handles.map(handle => Number(proof.clearValues[handle.toLowerCase()] ?? proof.clearValues[handle]))
    const row = { nftId: id, generation: Number(info.generation), wild: info.wild, rareTraits: traits.filter(value => value >= result.constants.rareThreshold).length, traits }
    if (info.certified) {
      const genome = (await read('getGenomeHandles', [BigInt(id)])).slice(0, 7)
      const opened = await fhe.publicDecrypt(genome)
      const expressed = genome.map(handle => {
        const value = Number(opened.clearValues[handle.toLowerCase()] ?? opened.clearValues[handle])
        return Math.min(value >> 4, value & 15)
      })
      row.alreadyPublicGenomeControl = { publicBecauseCertified: true, minimumAllelesMatchPhenotype: expressed.every((value, i) => value === traits[i]) }
    }
    rows.push(row)
  }
  result.rows = rows
  result.rareHistogram = Object.fromEntries(Array.from({ length: 8 }, (_, count) => [count, rows.filter(row => row.rareTraits === count).length]))
  result.independentRandomBirths = rows.filter(row => row.generation === 0).length
  result.bredBirths = rows.filter(row => row.generation > 0).length
  result.eligible = rows.filter(row => row.rareTraits >= result.constants.requiredTraits).map(row => row.nftId)
  result.certifiedGenomeControls = rows.filter(row => row.alreadyPublicGenomeControl).map(row => ({ nftId: row.nftId, ...row.alreadyPublicGenomeControl }))
  fs.writeFileSync(dir + '/rarity-diagnosis.json', JSON.stringify(result, null, 2))
  console.log('RARITY_DIAGNOSIS', JSON.stringify({ constants: result.constants, runtimeMatches: result.runtime.matchesLocalBuild, scanned: rows.length, random: result.independentRandomBirths, bred: result.bredBirths, rareHistogram: result.rareHistogram, eligible: result.eligible, claimedTitles: result.claimedTitles, controls: result.certifiedGenomeControls }))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
