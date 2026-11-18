import { isAddressEqual } from 'viem'
import { LAB, getWallet, labAbi, read, readSentReceipt } from './chain'
import { actionHash, keeperRequest } from './keeper-api'
import { withKeeperRetry } from './keeper-retry'

export async function mintStarter(step: (message: string, hash?: string) => void) {
  return withKeeperRetry(() => mintStarterAttempt(step), () => step('Synchronizing your game wallet with Sepolia…'))
}

async function mintStarterAttempt(step: (message: string, hash?: string) => void) {
  const { account: owner, mode } = getWallet()
  if (mode !== 'circle' || !owner) throw new Error('Sign in before minting your starter.')
  step('Preparing your starter mint…')
  const request = await keeperRequest<{ id?: string; owned?: boolean }>('starter', { address: owner }, 55_000)
  if (request.owned) {
    const ids = await read<bigint[]>(LAB, labAbi, 'creaturesOf', [owner])
    if (!ids.length) throw new Error('Your starter has not been confirmed yet.')
    return { owner, id: Number(ids[0]) }
  }
  if (!request.id) throw new Error('The starter mint is temporarily unavailable.')
  step('Circle is sending the mint to Sepolia…')
  const hash = await actionHash(request.id, owner)
  step('Sent — waiting for Sepolia to confirm your NFT…', hash)
  const sent = await readSentReceipt(hash)
  const event = sent.events.find(item => item.eventName === 'Hatched' && isAddressEqual(item.address, LAB) && isAddressEqual(item.args.owner, owner))
  if (!event) throw new Error('Sepolia did not confirm a starter NFT. Check your Lab before retrying.')
  return { owner, id: Number(event.args.id), hash }
}
