import { Location, LocationNotes } from '../game/Location'
import { Addr, Button, CreatureCard, Empty, Label, Panel, go, useAction } from '../ui'
import { DEPLOYED, useWallet, errorText } from '../chain'
import { useListings, useRefresh, fmtZama } from '../hooks'
import { buy, cancelListing, finalize } from '../actions'
import { SpecimenLink } from '../game/Transition'
import { TradeEvidence } from '../game/TradeEvidence'

export default function Market() {
  const { account } = useWallet()
  const listings = useListings()
  const refresh = useRefresh()
  const { busy, run } = useAction()

  if (!DEPLOYED) return <Empty title="The market opens once the contracts are live" />

  const after = () => refresh('listings', 'listingOf', 'mine', 'creature', 'balHandle')

  async function doBuy(id: number, creatureId: number) {
    const r = await run('Buy', (s) => buy(account!, id, s), 'Payment escrowed', { spec: { kind: 'buy', me: creatureId }, final: false })
    if (!r) return
    after()
    const f = await run('Finalize purchase', (s) => finalize(id, r.paid, s), 'Specimen transferred to your wallet', { cont: true })
    after()
    if (f?.ok) {
      const l = listings.data?.find((x) => x.id === id)
      if (l) go(`creature/${l.creatureId}`)
    }
  }

  return (
    <div className="space-y-8">
      <Location place="market" />
      <LocationNotes title="Market rules">Prices are public. The Market checks the confidential cZAMA payment before releasing the specimen. A 5% fee goes to the World Boss pot.</LocationNotes>

      {listings.isLoading ? (
        <div className="chm-panel h-60 animate-pulse" />
      ) : listings.error ? (
        <Empty title="Could not load the market">{errorText(listings.error)}</Empty>
      ) : !listings.data?.length ? (
        <Empty title="Nothing for sale yet">List a specimen from its Trade tab. Buyers can inspect its lineage and verified Colosseum wins.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {listings.data.map((l) => {
            const mine = !!account && l.seller.toLowerCase() === account.toLowerCase()
            const pending = l.status === 2
            return (
              <CreatureCard
                key={l.id}
                id={l.creatureId}
                footer={
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-lg">{fmtZama(l.price)}</span>
                      <span className="font-mono text-[11px] text-[var(--chm-dim)]">
                        <Addr a={l.seller} you={account} /> ·{' '}
                        <SpecimenLink id={l.creatureId} className="text-[var(--chm-teal)] hover:underline">
                          view
                        </SpecimenLink>
                      </span>
                    </div>
                    <TradeEvidence key={l.id} id={l.creatureId} listingId={l.id} seller={mine && !pending} />
                    {pending ? (
                      <Button variant="ghost" className="w-full !py-1.5 text-xs" disabled={!!busy} onClick={() => run('Finalize purchase', (s) => finalize(l.id, l.paid, s), 'Specimen transferred to the buyer', { spec: { kind: 'buy', me: l.creatureId } }).then(after)}>
                        Finalize pending purchase
                      </Button>
                    ) : mine ? (
                      <Button variant="danger" className="w-full !py-1.5 text-xs" disabled={!!busy} onClick={() => run('Cancel listing', (s) => cancelListing(l.id, s), 'Specimen returned', { spec: { kind: 'cancelListing', me: l.creatureId } }).then(after)}>
                        Cancel listing
                      </Button>
                    ) : (
                      <Button className="w-full !py-1.5 text-xs" disabled={!account || !!busy} busy={busy === 'Buy'} onClick={() => doBuy(l.id, l.creatureId)}>
                        Buy with cZAMA
                      </Button>
                    )}
                  </div>
                }
              />
            )
          })}
        </div>
      )}

      <Panel className="p-5 text-sm text-[var(--chm-dim)]">
        <Label className="mb-2">Before you buy</Label>
        Draw free test cZAMA at the Wishing Well on the map, or with the droplet button up top. The first purchase asks you to approve the market as an operator for 30 days. Every gene the seller sequenced becomes readable by the new keeper too. Decryption rights cannot be revoked, so the seller can still read those same genes.
      </Panel>
    </div>
  )
}
