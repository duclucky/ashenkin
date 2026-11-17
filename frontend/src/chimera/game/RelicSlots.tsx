import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { Lock, Gem } from 'lucide-react'
import { Label, Link, Panel } from '../ui'
import { useWallet } from '../chain'
import { RelicGem } from './RelicGem'
import { SECOND_SLOT_LEVEL, TIERS_R, fetchRelic, useRelicSecrets, useSlots } from '../season'

/** The two relic sockets of a creature: what is bound there and how much power it adds. */
export function RelicSlots({ id, owner, level }: { id: number; owner: Address; level: number }) {
  const { account } = useWallet()
  const mine = !!account && owner.toLowerCase() === account.toLowerCase()
  const slots = useSlots(id)
  const ids = (slots.data ?? []).filter((x) => x > 0)
  const relics = useQuery({
    queryKey: ['slotRelics', ids.join()],
    queryFn: () => Promise.all(ids.map(fetchRelic)),
    enabled: ids.length > 0,
    staleTime: 30_000,
  })
  const secrets = useRelicSecrets(mine ? relics.data : undefined, account)
  const total = (relics.data ?? []).reduce((s, r) => s + (secrets.data?.[r.id]?.power ?? (r.appraised ? r.power : 0)), 0)
  const known = relics.data?.length === ids.length && relics.data.every((r) => r.appraised || secrets.data?.[r.id])

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>Relic sockets</Label>
          <p className="mt-1 text-xs text-[var(--chm-dim)]">Bound relics add sealed power in every fight. Socket 2 opens at LV {SECOND_SLOT_LEVEL}.</p>
        </div>
        {ids.length > 0 && (
          <div className="text-right">
            <Label>Relic power</Label>
            <div className="mt-1 font-mono text-lg font-bold">
              {known ? (
                <span className="text-[#1FA46A]">+{total}</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-4 w-4" /> sealed
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[0, 1].map((slot) => {
          const rid = slots.data?.[slot] ?? 0
          const r = relics.data?.find((x) => x.id === rid)
          const s = r ? (r.appraised ? { tier: r.tier, power: r.power } : secrets.data?.[r.id]) : undefined
          const locked = slot === 1 && level < SECOND_SLOT_LEVEL
          return (
            <div key={slot} className={`flex items-center gap-3 border-[3px] border-[#111] p-3 ${locked ? 'bg-[#eee] opacity-70' : rid ? 'bg-[#1c1530] text-[#f7f5ee]' : 'border-dashed bg-white'}`}>
              {rid ? (
                <RelicGem tier={s ? s.tier : null} size={40} glow />
              ) : (
                <div className="flex h-[34px] w-10 items-center justify-center">{locked ? <Lock className="h-5 w-5" /> : <Gem className="h-5 w-5 opacity-40" />}</div>
              )}
              <div className="min-w-0 text-sm">
                <div className="font-mono text-[10px] font-black uppercase tracking-widest opacity-70">Socket {slot + 1}</div>
                {rid ? (
                  <div className="font-bold">
                    Relic #{rid}
                    {s ? (
                      <span className="ml-1" style={{ color: TIERS_R[s.tier].color }}>
                        {TIERS_R[s.tier].name} +{s.power}
                      </span>
                    ) : (
                      <span className="ml-1 opacity-70">sealed</span>
                    )}
                  </div>
                ) : (
                  <div className="font-bold">{locked ? `Opens at LV ${SECOND_SLOT_LEVEL}` : 'Empty'}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {mine && (
        <Link to="relics" className="mt-3 inline-block font-mono text-xs font-bold underline">
          {ids.length ? 'Swap relics in the Relic Forge →' : 'Get a relic in the Relic Forge →'}
        </Link>
      )}
    </Panel>
  )
}
