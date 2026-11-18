const fs = require('node:fs')
const path = require('node:path')
const { privateKeyToAccount } = require('viem/accounts')
const { createPublicClient, http, encodeFunctionData, parseAbi } = require('viem')
const { sepolia } = require('viem/chains')
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node')
const directory = '/app/backend/db/playtest-20261118'
const players = JSON.parse(fs.readFileSync(path.join(directory, 'private.json'), 'utf8')).players
const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'))
const deployment = JSON.parse(fs.readFileSync(path.join(directory, 'deployment.json'), 'utf8'))
const results = []

async function request(route, { body, cookie, origin = 'https://ashenkin.xyz' } = {}) {
  const response = await fetch('https://ashenkin.xyz/api/keeper/' + route, {
    headers: { Origin: origin, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  })
  return { status: response.status, value: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
async function check(name, run) {
  await run()
  const result = { name, status: 'passed', at: new Date().toISOString() }
  results.push(result)
  console.log(JSON.stringify(result))
}
function expect(actual, desired) {
  if (actual !== desired) throw new Error('Expected ' + desired + ', got ' + actual)
}

async function main() {
  await check('unauthenticated-mint-is-blocked', async () => expect((await request('starter', { body: {} })).status, 401))
  await check('another-wallet-cannot-operate-my-account', async () => expect((await request('starter', { cookie: players[1].cookie, body: { address: report.players[0].address } })).status, 409))
  await check('foreign-origin-is-blocked', async () => expect((await request('provision', { cookie: players[0].cookie, body: {}, origin: 'https://example.com' })).status, 403))
  await check('arbitrary-nft-approval-is-blocked', async () => {
    const data = encodeFunctionData({ abi: parseAbi(['function approve(address,uint256)']), functionName: 'approve', args: [report.players[1].address, BigInt(report.players[0].nftId)] })
    const result = await request('transactions', { cookie: players[0].cookie, body: { address: report.players[0].address, destination: deployment.addresses.ChimeraLab, data } })
    expect(result.status, 400)
  })
  await check('another-account-cannot-read-my-transaction', async () => {
    const transaction = report.players[0].steps['hunt-submit'].request.id
    expect((await request('transactions/' + transaction, { cookie: players[1].cookie })).status, 404)
  })
  await check('wrong-signature-and-replayed-login-are-blocked', async () => {
    const account = privateKeyToAccount(players[0].pk)
    const other = privateKeyToAccount(players[1].pk)
    const challenge = (await request('wallet/start', { body: { address: account.address } })).value
    const wrong = await other.signMessage({ message: challenge.message })
    expect((await request('wallet/finish', { body: { id: challenge.id, signature: wrong } })).status, 401)
    const proof = { id: challenge.id, signature: await account.signMessage({ message: challenge.message }) }
    const good = await request('wallet/finish', { body: proof })
    expect(good.status, 200)
    expect(good.value.address, report.players[0].address)
    expect((await request('wallet/finish', { body: proof })).status, 401)
    expect((await request('logout', { cookie: good.cookie, body: {} })).status, 200)
  })
  await check('zama-rejects-decrypting-another-keepers-element', async () => {
    const chain = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') })
    const lab = deployment.addresses.ChimeraLab
    const handles = await chain.readContract({ address: lab, abi: deployment.abis.ChimeraLab, functionName: 'getPhenotypeHandles', args: [BigInt(report.players[4].nftId)] })
    const key = players[5].fhe
    const fhe = await createInstance({ ...SepoliaConfig, network: 'https://ethereum-sepolia-rpc.publicnode.com' })
    let rejected = false
    try {
      await fhe.userDecrypt([{ handle: handles[7], contractAddress: lab }], key.privateKey, key.publicKey, key.signature.replace(/^0x/, ''), key.contracts, report.players[5].address, key.start, 7)
    } catch { rejected = true }
    if (!rejected) throw new Error('Unauthorized decryption succeeded')
  })
  fs.writeFileSync(path.join(directory, 'isolation.json'), JSON.stringify(results, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
