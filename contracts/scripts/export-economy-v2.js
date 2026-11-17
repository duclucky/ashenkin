const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const load = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
const old = load('frontend/src/chimera/contracts.json')
const release = process.env.ASHENKIN_RELEASE === '1'
const world = load(release ? 'contracts/deployments-ashenkin/sepolia.json' : 'contracts/deployments-v2/sepolia.json')
assert(world.ready && world.chainId === 11155111)
if (release) {
  assert(world.steps['ChimeraLab.hatchGenesis()']?.block > 0, 'Complete the Ashenkin NFT check first')
} else {
  const smoke = load('contracts/deployments-v2/smoke.json')
  assert(smoke.result && smoke.lab === world.steps.ChimeraLab.address, 'Complete the live v2 checks first')
}
const addresses = {}, abis = {}
const otherAddresses = release ? [...Object.values(old.addresses), ...Object.values(load('frontend/src/chimera/contracts.v2.json').addresses)] : Object.values(old.addresses)
const legacy = new Set(otherAddresses.map(address => address.toLowerCase()))
for (const name of Object.keys(old.addresses)) {
  const step = world.steps[name]
  assert(step.block > 0 && /^0x[0-9a-f]{40}$/i.test(step.address) && !legacy.has(step.address.toLowerCase()))
  addresses[name] = step.address
  abis[name] = load(`contracts/artifacts/contracts/${name}.sol/${name}.json`).abi
}
const config = { network: 'sepolia', chainId: 11155111, cZAMA: old.cZAMA, zamaMock: old.zamaMock, addresses, abis,
  deployBlock: world.steps.ChimeraLab.block, seasonBlock: world.steps.ChimeraColosseum.block,
  p1Block: world.steps.ChimeraSeason.block, raffleBlock: world.steps.ChimeraRaffle.block, depthsBlock: world.steps.ChimeraDepths.block }
function write(name, value) {
  const target = path.join(root, name)
  fs.writeFileSync(`${target}.next`, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(`${target}.next`, target)
}
write(release ? 'backend/lib/ashenkin.json' : 'backend/lib/chimera.v2.json', { network: config.network, chainId: config.chainId, addresses })
write(release ? 'frontend/src/chimera/contracts.ashenkin.json' : 'frontend/src/chimera/contracts.v2.json', config)
console.log(`Exported ${release ? 'Ashenkin' : 'world v2'}: Lab ${addresses.ChimeraLab}, Treasury ${addresses.ChimeraTreasury}`)
