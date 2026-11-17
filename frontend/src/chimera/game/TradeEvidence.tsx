import { useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { useCreature } from '../hooks'
import { useTBCreatureRecord } from '../season'
import { MARKET_BADGE, publishMarketBadge, requestMarketBadge, useMarketBadge } from '../tournament'
import { Button, useAction } from '../ui'
import { SpecimenLink } from './Transition'

const TIERS = ['Field · under 60', 'Vanguard · 60–89', 'Elite · 90+']

export function TradeEvidence({ id, listingId, seller = false }: { id: number; listingId?: number; seller?: boolean }) {
  const creature = useCreature(id)
  const history = useTBCreatureRecord(id)
  const badge = useMarketBadge(listingId)
  const { busy, run } = useAction()
  const [permission, setPermission] = useState(false)
  const info = creature.data?.info
  const [tier, published, handle] = badge.data ?? []
  const pending = !!handle && !/^0x0+$/.test(handle) && !published

  return <div className="space-y-2 border-t border-[var(--chm-line)] pt-2 text-xs">
    {info && <div>
      {info.parentA && info.parentB ? <>
        Gen {info.generation} · parents <SpecimenLink id={info.parentA} className="underline">#{info.parentA}</SpecimenLink> × <SpecimenLink id={info.parentB} className="underline">#{info.parentB}</SpecimenLink>
      </> : <>{info.wild ? 'Wild-born' : 'Genesis'} · Gen {info.generation}</>}
    </div>}
    <div>{history.isPending ? 'Reading Colosseum wins…' : history.isError ? 'Colosseum record unavailable' : `${history.data} specimen wins on Sepolia`}</div>
    {published && tier != null ? <div className="flex items-start gap-1 font-bold"><ShieldCheck size={14} aria-hidden="true" /> {TIERS[tier]} · listed snapshot</div> : <div className="flex items-start gap-1"><Lock size={13} aria-hidden="true" /> {pending ? 'Public tier proof pending' : info?.certified ? 'Genome certified' : 'Power sealed'}</div>}
    {!!MARKET_BADGE && seller && !!listingId && badge.data && !published && <div className="space-y-2">
      {!pending && !permission && <Button variant="ghost" className="min-h-11 w-full text-xs" onClick={() => setPermission(true)}>Share power tier</Button>}
      {!pending && permission && <>
        <p>The tier becomes public permanently. It includes training when you request it and excludes gear.</p>
        <Button className="min-h-11 w-full text-xs" busy={busy === 'Share power tier'} onClick={async () => {
          const result = await run('Share power tier', () => requestMarketBadge(listingId), 'Tier ready for Zama verification')
          if (result) await badge.refetch()
        }}>Publish tier permanently</Button>
      </>}
      {pending && handle && <Button variant="ghost" className="min-h-11 w-full text-xs" busy={busy === 'Verify power tier'} onClick={async () => {
        const result = await run('Verify power tier', step => publishMarketBadge(listingId, handle, step), 'Power tier verified')
        if (result) await badge.refetch()
      }}>Verify power tier</Button>}
    </div>}
  </div>
}
