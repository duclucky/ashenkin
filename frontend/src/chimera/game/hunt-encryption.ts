import { encryptMany } from '../fhe'
import type { HuntPlan, HuntProof } from './hunt-plan'
import type { HuntWorkerRequest, HuntWorkerResponse } from './hunt-proof.worker'

class WorkerUnavailable extends Error {}
type Request = { resolve: (proof?: HuntProof) => void; reject: (error: Error) => void }
let worker: Worker | undefined
let id = 0
const pending = new Map<number, Request>()

function getWorker() {
  if (worker) return worker
  try {
    const current = new Worker(new URL('./hunt-proof.worker.ts', import.meta.url), { type: 'module' })
    current.addEventListener('message', ({ data }: MessageEvent<HuntWorkerResponse>) => {
      const request = pending.get(data.id)
      if (data.error) request?.reject(new Error(data.error))
      else request?.resolve(data.proof)
    })
    current.addEventListener('error', () => {
      if (worker !== current) return
      worker = undefined
      current.terminate()
      for (const request of pending.values()) request.reject(new WorkerUnavailable('The hunt encryption worker could not start.'))
    })
    return worker = current
  } catch {
    throw new WorkerUnavailable('This browser could not create a hunt encryption worker.')
  }
}

async function askWorker(plan?: HuntPlan, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const current = getWorker()
  const requestId = ++id
  const abort = () => {
    pending.get(requestId)?.reject(new DOMException('Hunt plan replaced.', 'AbortError'))
    current.postMessage({ id: requestId, cancel: true } satisfies HuntWorkerRequest)
  }
  try {
    return await new Promise<HuntProof | undefined>((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      signal?.addEventListener('abort', abort, { once: true })
      current.postMessage({ id: requestId, plan } satisfies HuntWorkerRequest)
    })
  } finally {
    signal?.removeEventListener('abort', abort)
    pending.delete(requestId)
  }
}

export async function preloadHuntEncryption() { await askWorker() }

export async function sealHuntPlan(plan: HuntPlan, signal?: AbortSignal): Promise<HuntProof> {
  try {
    const proof = await askWorker(plan, signal)
    if (!proof) throw new Error('The hunt encryption worker did not return a proof.')
    return proof
  } catch (error) {
    // Older browsers can still open a hunt through the existing foreground path.
    if (signal || !(error instanceof WorkerUnavailable)) throw error
    const { handles, proof } = await encryptMany(plan.colosseum, plan.account, [{ bits: 8, value: plan.moves }])
    return { handle: handles[0], proof }
  }
}
