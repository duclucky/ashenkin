export class KeeperEstimateRetry extends Error {}

export function failedKeeperAction(result: { failed: boolean; hash?: string | null; retryable?: boolean }) {
  if (!result.failed) return
  if (!result.hash && result.retryable === true) throw new KeeperEstimateRetry('Circle is catching up with Sepolia.')
  throw new Error('Circle could not execute this action. Check your Sepolia ETH and try again.')
}

export async function withKeeperRetry<T>(
  action: () => Promise<T>,
  onRetry: () => void,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 3000)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await action() } catch (error) {
      if (!(error instanceof KeeperEstimateRetry) || attempt >= 2) throw error
      onRetry()
      await pause()
    }
  }
}
