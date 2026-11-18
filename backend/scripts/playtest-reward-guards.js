const fs = require('node:fs')
const { encodeFunctionData, encodeAbiParameters, parseAbiParameters, toFunctionSelector } = require('viem')
const h = require('./playtest-keepers')
const d = require(h.directory + '/deployment.json')
const result = { at: new Date().toISOString(), checks: [] }

async function blockAdmin(contract, name, args) {
  const data = encodeFunctionData({ abi: d.abis[contract], functionName: name, args })
  const response = await fetch('https://ashenkin.xyz/api/keeper/transactions', {
    method: 'POST', headers: { Origin: 'https://ashenkin.xyz', 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json', Cookie: h.secret.players[0].cookie },
    body: JSON.stringify({ address: h.report.players[0].address, destination: h.A[contract], data }),
  })
  if (response.status !== 400) throw new Error('Circle game API accepted an admin-only action: ' + name)
  result.checks.push({ name: 'game wallet API refuses ' + name, status: 'passed', httpStatus: 400 })
}

async function main() {
  await blockAdmin('ChimeraRaffle', 'setDuration', [1n, true])
  await blockAdmin('ChimeraOracle', 'setRules', [1n, 1000])
  await blockAdmin('ChimeraSeason', 'setLength', [1n, true])
  const id = BigInt(h.report.players[0].nftId)
  const other = BigInt(h.report.players[1].nftId)
  const handles = (await h.read('ChimeraLab', 'getPhenotypeHandles', [id])).slice(0, 7)
  const proof = await h.decrypt(handles)
  const forged = encodeAbiParameters(parseAbiParameters('uint8[7]'), [[15, 15, 15, 15, 15, 15, 15]])
  for (const [name, target, values, expected] of [
    ['honest non-rare NFT remains ineligible', id, proof.abiEncodedClearValues, 'NotAChimera'],
    ['forged rare traits cannot use an honest NFT proof', id, forged, 'KMS'],
    ['another NFT cannot reuse this phenotype proof', other, proof.abiEncodedClearValues, 'KMS'],
  ]) {
    let reverted = false
    try {
      await h.publicClient.simulateContract({ account: h.report.players[0].address, address: h.A.ChimeraLab, abi: d.abis.ChimeraLab, functionName: 'claimChimera', args: [target, values, proof.decryptionProof] })
    } catch (error) {
      if (expected === 'NotAChimera') reverted = error.message.includes('NotAChimera')
      else {
        const selectors = ['KMSInvalidSigner(address)', 'KMSSignatureThresholdNotReached(uint256)', 'InvalidKMSSignatures()'].map(toFunctionSelector)
        const seen = new Set()
        let cause = error
        while (cause && !seen.has(cause)) {
          seen.add(cause)
          if (selectors.some(selector => String(cause.data || '').toLowerCase().includes(selector.toLowerCase())) || /KMSInvalidSigner|KMSSignatureThreshold|InvalidKMSSignatures/.test(cause.message || '')) reverted = true
          cause = cause.cause
        }
      }
      if (!reverted) throw error
    }
    if (!reverted) throw new Error('Invalid rare-title proof accepted: ' + name)
    result.checks.push({ name, status: 'passed', rejection: expected })
  }
  result.status = 'passed'
  fs.writeFileSync(h.directory + '/reward-guards.json', JSON.stringify(result, null, 2))
  console.log('REWARD_GUARDS', JSON.stringify(result))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
