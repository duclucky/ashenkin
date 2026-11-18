import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Droplets, Check, Clock, ExternalLink } from 'lucide-react'
import { ACTIVE_WORLD, EXPLORER, useWallet } from '../chain'
import { keeperRequest } from '../keeper-api'
import { fmtDuration, useNow } from '../hooks'
import { Button, toast } from '../ui'

type Faucet = {
  enabled: boolean
  amount: string
  funded: boolean
  canClaim: boolean
  nextAt: number | null
  claim: {
    id: string
    status: 'queued' | 'signed' | 'confirmed' | 'failed'
    hash: string | null
    issue: string | null
  } | null
}
export function GasFaucet({
  compact = false,
  active = true,
}: {
  compact?: boolean
  active?: boolean
}) {
  const { account, mode } = useWallet()
  const cache = useQueryClient()
  const now = useNow(1000) * 1000
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const requested = useRef<string | null>(null)
  const faucet = useQuery({
    queryKey: ['gas-faucet', account],
    queryFn: () => keeperRequest<Faucet>(`gas-faucet?address=${account}`),
    enabled:
      active && !!account && mode === 'circle' && ACTIVE_WORLD === 'ashenkin',
    refetchInterval: active ? 5000 : false,
    retry: 1,
  })
  const data = faucet.data
  const pending =
    !!data?.claim && ['queued', 'signed'].includes(data.claim.status)
  const cooldown = !!data?.nextAt && data.nextAt > now
  useEffect(() => {
    if (
      data?.claim?.status === 'confirmed' &&
      requested.current === data.claim.id
    ) {
      requested.current = null
      void cache.invalidateQueries({ queryKey: ['eth', account] })
      toast({
        kind: 'ok',
        title: 'Sepolia ETH received',
        detail: `${data.amount} ETH added to your game wallet.`,
      })
    }
  }, [data, account, cache])
  if (
    !account ||
    mode !== 'circle' ||
    ACTIVE_WORLD !== 'ashenkin' ||
    data?.enabled === false
  )
    return null
  async function claim() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await keeperRequest<{ id: string }>('gas-faucet', {
        address: account,
      })
      requested.current = result.id
      await faucet.refetch()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not request Sepolia ETH.',
      )
    } finally {
      setBusy(false)
    }
  }
  const text = pending
    ? 'Sending Sepolia ETH…'
    : cooldown
      ? `Next faucet in ${fmtDuration(Math.ceil((data!.nextAt! - now) / 1000))}`
      : !data
        ? 'Checking Sepolia faucet…'
        : !data.funded
          ? 'Sepolia faucet awaiting funds'
          : `Get ${data.amount} Sepolia ETH`
  return (
    <div
      className={
        compact
          ? 'gas-faucet min-w-0'
          : 'gas-faucet min-w-0 rounded border border-[var(--chm-line)] bg-[var(--chm-yellow-soft)] p-3'
      }
    >
      <Button
        variant="ghost"
        className={compact ? 'chm-wallet-action w-full' : 'w-full'}
        busy={busy}
        disabled={busy || pending || cooldown || !data?.canClaim}
        onClick={claim}
      >
        {cooldown ? (
          <Clock size={16} aria-hidden="true" />
        ) : data?.claim?.status === 'confirmed' && !data.canClaim ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Droplets
            size={16}
            aria-hidden="true"
            className={pending ? 'animate-pulse' : ''}
          />
        )}
        <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
      </Button>
      <p className="mt-1 text-xs leading-relaxed text-[var(--chm-dim)]">
        Once every 24 hours · no wallet signature.
      </p>
      {pending && (
        <p className="mt-1 text-xs" role="status">
          Your request is saved. You can keep playing.
        </p>
      )}
      {(error || data?.claim?.issue) && (
        <p
          role="status"
          className="mt-2 text-xs leading-relaxed [overflow-wrap:anywhere]"
        >
          {error || data?.claim?.issue}
        </p>
      )}
      {faucet.isError && (
        <button
          type="button"
          className="min-h-11 text-xs font-bold underline"
          onClick={() => faucet.refetch()}
        >
          Retry Sepolia faucet
        </button>
      )}
      {data?.claim?.hash && (
        <a
          href={`${EXPLORER}/tx/${data.claim.hash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-1 text-xs underline"
        >
          {data.claim.status === 'confirmed'
            ? 'Transfer received'
            : 'Track transfer'}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      )}
    </div>
  )
}
