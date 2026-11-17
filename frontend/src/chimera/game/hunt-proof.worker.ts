import { bytesToHex, createPublicClient, fallback, getAddress, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createInstance, initSDK, SepoliaConfig } from '@zama-fhe/relayer-sdk/web'
import type { HuntPlan, HuntProof } from './hunt-plan'

export type HuntWorkerRequest = { id: number; plan?: HuntPlan; cancel?: true }
export type HuntWorkerResponse = { id: number; proof?: HuntProof; error?: string }

const client = createPublicClient({ chain: sepolia, transport: fallback([
  http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 4000, retryCount: 0 }),
  http('https://sepolia.gateway.tenderly.co', { timeout: 4000, retryCount: 0 }),
]) })
const active = new Map<number, AbortController>()
let instance: ReturnType<typeof createInstance> | undefined

function sdk() {
  if (!instance) {
    const root = new URL(import.meta.env.BASE_URL, self.location.href)
    instance = initSDK({
      tfheParams: new URL('fhe/tfhe_bg.wasm', root).href,
      kmsParams: new URL('fhe/kms_lib_bg.wasm', root).href,
    }).then(() => createInstance({ ...SepoliaConfig, network: { request: request => client.request(request as Parameters<typeof client.request>[0]) } }))
      .catch(error => { instance = undefined; throw error })
  }
  return instance
}

self.addEventListener('message', async ({ data }: MessageEvent<HuntWorkerRequest>) => {
  const { id, plan, cancel } = data
  if (cancel) { active.get(id)?.abort(); return }
  const controller = new AbortController()
  active.set(id, controller)
  try {
    const zama = await sdk()
    const signal = controller.signal
    signal.throwIfAborted()
    if (!plan) { self.postMessage({ id } satisfies HuntWorkerResponse); return }
    if (plan.chainId !== sepolia.id) throw new Error('Switch to Sepolia before starting a hunt.')
    const input = zama.createEncryptedInput(getAddress(plan.colosseum), getAddress(plan.account))
    const { handles, inputProof } = await input.add8(plan.moves).encrypt({ signal })
    signal.throwIfAborted()
    self.postMessage({ id, proof: { handle: bytesToHex(handles[0]), proof: bytesToHex(inputProof) } } satisfies HuntWorkerResponse)
  } catch (error) {
    if (!controller.signal.aborted) self.postMessage({ id, error: error instanceof Error ? error.message : 'Could not seal the hunt plan.' } satisfies HuntWorkerResponse)
  } finally { active.delete(id) }
})
