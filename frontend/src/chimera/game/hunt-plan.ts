import type { Address, Hex } from 'viem'

export type HuntPlan = { chainId: number; colosseum: Address; account: Address; moves: number }
export type HuntProof = { handle: Hex; proof: Hex }
type Encrypt = (plan: HuntPlan, signal?: AbortSignal) => Promise<HuntProof>
type Prepared = { key: string; expires: number; controller: AbortController; proof: Promise<HuntProof> }
const PROOF_LIFETIME_MS = 90_000

const keyOf = (plan: HuntPlan) => `${plan.chainId}:${plan.colosseum.toLowerCase()}:${plan.account.toLowerCase()}:${plan.moves}`

export class HuntPlanPreparation {
  private prepared?: Prepared

  constructor(private readonly encrypt: Encrypt) {}

  warm(plan: HuntPlan) {
    const key = keyOf(plan)
    if (this.prepared?.key === key && this.prepared.expires > Date.now()) return
    this.clear()
    const controller = new AbortController()
    const proof = Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return this.encrypt(plan, controller.signal)
    })
    const prepared = { key, expires: Date.now() + PROOF_LIFETIME_MS, controller, proof }
    this.prepared = prepared
    void proof.catch(() => {
      if (this.prepared === prepared) this.prepared = undefined
    })
  }

  clear() {
    this.prepared?.controller.abort()
    this.prepared = undefined
  }

  async take(plan: HuntPlan): Promise<HuntProof> {
    const prepared = this.prepared
    this.prepared = undefined
    if (prepared?.key === keyOf(plan) && prepared.expires > Date.now()) {
      try { return await prepared.proof } catch { /* A failed background proof gets one foreground retry. */ }
    } else prepared?.controller.abort()
    return this.encrypt(plan)
  }
}
