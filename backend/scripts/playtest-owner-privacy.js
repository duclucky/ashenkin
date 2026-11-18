const fs = require('node:fs')
const path = require('node:path')
const { privateKeyToAccount } = require('viem/accounts')
const { recoverTypedDataAddress } = require('viem')
const h = require('./playtest-keepers')
const { labKeyData } = require(path.join(process.cwd(), 'lib/keeper-chain'))

async function main() {
  const owner = privateKeyToAccount(process.env.CHIMERA_SETTLEMENT_PRIVATE_KEY)
  if ((await h.read('ChimeraOracle', 'owner')).toLowerCase() !== owner.address.toLowerCase()) throw new Error('Incorrect admin identity')
  const instance = await h.fhe()
  const key = instance.generateKeypair()
  const start = Math.floor(Date.now() / 1000) - 60
  const typed = labKeyData({ publicKey: key.publicKey, start, days: 7 })
  const signature = await owner.signTypedData(typed)
  const recovered = await recoverTypedDataAddress({ ...typed, signature })
  if (recovered.toLowerCase() !== owner.address.toLowerCase()) throw new Error('Admin Lab-key signature verification failed')
  const roundId = await h.read('ChimeraOracle', 'currentRound')
  const [round, handles] = await h.read('ChimeraOracle', 'getRound', [roundId])
  if (round.ended) throw new Error('An active Oracle round is required')
  let denied = false
  try {
    await instance.userDecrypt(handles.map(handle => ({ handle, contractAddress: h.A.ChimeraOracle })), key.privateKey, key.publicKey, signature.slice(2), typed.message.contractAddresses, owner.address, start, 7)
  } catch (error) {
    if (!/not authorized|not allowed|unauthorized/i.test(error.message)) throw error
    denied = true
  }
  if (!denied) throw new Error('Admin could privately decrypt the live Oracle answer')
  const result = { at: new Date().toISOString(), owner: owner.address, round: Number(roundId), signatureVerified: true, liveAnswerDeniedByACL: true, status: 'passed' }
  fs.writeFileSync(h.directory + '/reward-owner-privacy.json', JSON.stringify(result, null, 2))
  console.log('OWNER_PRIVACY', JSON.stringify(result))
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1 })
