import type { TransactionReceipt } from 'viem'

export type ReceiptObserver = (signal: AbortSignal) => Promise<TransactionReceipt>

export class ReplacedActionError extends Error {
  constructor() { super('This transaction was cancelled or replaced with a different action. Check your wallet before trying again.'); this.name = 'ReplacedActionError' }
}

/** One transaction, multiple read-only observers. First available receipt wins. */
export async function firstReceipt(observers: readonly ReceiptObserver[]): Promise<TransactionReceipt> {
  if (!observers.length) throw new Error('No receipt observers are configured.')
  const controller = new AbortController()
  try {
    return await new Promise<TransactionReceipt>((resolve, reject) => {
      const errors: unknown[] = []
      let remaining = observers.length
      observers.forEach((observe, index) => {
        Promise.resolve().then(() => observe(controller.signal)).then(resolve, error => {
          errors[index] = error
          if (--remaining === 0) reject(errors[0])
        })
      })
    })
  } finally {
    controller.abort()
  }
}
