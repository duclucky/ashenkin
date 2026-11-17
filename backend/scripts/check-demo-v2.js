const assert = require('node:assert/strict')
const { createPublicClient, encodeFunctionData, http, isAddressEqual, parseAbi } = require('viem')
const { sepolia } = require('viem/chains')
const abi = parseAbi([
  'function tokenURI(uint256 id) view returns (string)',
  'function owner() view returns (address)',
  'function training() view returns (address)',
  'function setTraining(address training_, string baseURI_)',
])

async function get(url, mime, method = 'GET') {
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200, `${url.pathname} returned ${response.status}`)
  assert.ok(response.headers.get('content-type')?.startsWith(mime), `${url.pathname} must serve ${mime}`)
  return response
}

async function main() {
  const args = process.argv.slice(2)
  const flags = args.filter(arg => arg.startsWith('--'))
  assert.ok(flags.every(flag => ['--release', '--world=v1', '--prepare-uri', '--require-uri'].includes(flag)), 'Unknown option.')
  const release = flags.includes('--release')
  const legacy = flags.includes('--world=v1')
  assert.ok(!(release && legacy), 'Select one deployment.')
  const [site = 'http://127.0.0.1:4173', specimen = release || legacy ? '1' : '7', ...extra] = args.filter(arg => !arg.startsWith('--'))
  assert.equal(extra.length, 0, 'Pass only the demo origin and specimen ID.')
  const prepare = flags.includes('--prepare-uri')
  const requireUri = flags.includes('--require-uri')
  const { addresses } = release ? require('../lib/ashenkin.json') : legacy ? require('../lib/chimera.json') : require('../lib/chimera.v2.json')
  const lab = addresses.ChimeraLab
  const origin = new URL(site)
  assert.ok(['https:', 'http:'].includes(origin.protocol) && origin.href === `${origin.origin}/`, 'Pass the demo origin without a path or query.')
  assert.match(specimen, /^[1-9]\d*$/, 'Pass an existing specimen ID.')
  if (prepare || requireUri) assert.equal(origin.protocol, 'https:', 'Use the public HTTPS demo origin for a metadata URI on Sepolia.')

  const entryPath = release ? '/' : legacy ? '/?world=original' : '/?world=v2'
  const metadataBase = new URL(release ? '/api/ashenkin-nft/' : legacy ? '/api/nft/' : '/api/nft-v2/', origin)
  const metadataUrl = new URL(specimen, metadataBase)
  const [index, health, specimenMetadata] = await Promise.all([
    get(new URL(entryPath, origin), 'text/html'),
    get(new URL('/api/health', origin), 'application/json'),
    get(metadataUrl, 'application/json'),
    get(new URL('/fhe/tfhe_bg.wasm', origin), 'application/wasm', 'HEAD'),
    get(new URL('/fhe/kms_lib_bg.wasm', origin), 'application/wasm', 'HEAD'),
  ])
  assert.deepEqual(await health.json(), { status: 'ok' })
  const entry = (await index.text()).match(/<script\b[^>]*src="([^"\s]+\.js)"/i)
  assert.ok(entry, 'The demo must serve the built frontend entry.')
  await get(new URL(entry[1], origin), 'application/javascript', 'HEAD')

  const metadata = await specimenMetadata.json()
  assert.equal(metadata.image, `${metadataUrl.href}/image.svg`)
  assert.equal(metadata.external_url, `${origin.origin}${entryPath}#/creature/${specimen}`)
  assert.ok(metadata.name.endsWith(' #' + specimen) && !metadata.name.startsWith('Specimen #'), 'The public species name must be available.')
  assert.ok(typeof metadata.description === 'string' && metadata.description.length > 0)
  const attributes = Object.fromEntries(metadata.attributes.map(({ trait_type, value }) => [trait_type, value]))
  assert.ok(Number.isSafeInteger(attributes.Hatched) && attributes.Hatched > 0)
  assert.ok(Number.isSafeInteger(attributes.Level) && attributes.Level >= 0)
  assert.ok(['Bred', 'Lab-hatched', 'Wild-born'].includes(attributes.Origin))
  if (attributes.Origin === 'Bred') {
    assert.ok(attributes['Parent A'] > 0 && attributes['Parent B'] > 0, 'Bred specimens must show both parents.')
  }
  const svg = await get(new URL(metadata.image), 'image/svg+xml')
  assert.match(await svg.text(), /<svg\b[^>]*width="512"[^>]*height="512"/)
  console.log(`Demo and metadata OK: ${metadata.name} · ${metadataUrl.href}`)

  const rpc = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com', { timeout: 8_000 }),
  })
  const current = await rpc.readContract({ address: lab, abi, functionName: 'tokenURI', args: [BigInt(specimen)] })
  console.log(`Sepolia tokenURI: ${current || '(empty)'}`)
  if (requireUri) assert.equal(current, metadataUrl.href, 'Lab tokenURI must point to the validated HTTPS metadata.')
  if (!prepare || current === metadataUrl.href) return

  const [owner, training] = await Promise.all([
    rpc.readContract({ address: lab, abi, functionName: 'owner' }),
    rpc.readContract({ address: lab, abi, functionName: 'training' }),
  ])
  assert.ok(isAddressEqual(training, addresses.ChimeraTraining), 'The active Training contract differs from the selected deployment record.')
  const trainingArgs = [training, metadataBase.href]
  await rpc.simulateContract({ account: owner, address: lab, abi, functionName: 'setTraining', args: trainingArgs })
  const data = encodeFunctionData({ abi, functionName: 'setTraining', args: trainingArgs })
  console.log(JSON.stringify({ chainId: sepolia.id, from: owner, to: lab, value: '0x0', data, metadataBase: metadataBase.href }, null, 2))
}

main().catch(error => {
  console.error(error.shortMessage || error.message)
  process.exitCode = 1
})
