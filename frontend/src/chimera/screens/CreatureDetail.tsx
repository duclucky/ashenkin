import { useState } from 'react'
import { Location } from '../game/Location'
import { SpecimenLink, travel } from '../game/Transition'
import { Microscope, ScrollText, Sparkles, Swords, HeartHandshake, Store, Lock, Shield } from 'lucide-react'
import CreatureArt, { ElementSigil } from '../CreatureArt'
import { Addr, Button, CreatureCard, DnaStrand, Empty, Label, Link, Panel, TraitTable, creatureTitle, go, useAction } from '../ui'
import { DEPLOYED, MARKET, ARENA, COLOSSEUM, EXPEDITIONS, useWallet, errorText } from '../chain'
import { useTDefender, useTReadyAt } from '../season'
import { useCertifiedGenome, useCreature, useListingOf, useNow, usePrivateGenes, useRefresh, useTraits, useAccountStats, fmtDuration, fmtZama, useLabKeyReady, useTraining } from '../hooks'
import { certify, claimChimera, list, sequence, cancelListing } from '../actions'
import { labKey } from '../fhe'
import { NftPanel, TrainingPanel } from './Training'
import { RelicSlots } from '../game/RelicSlots'
import { TradeEvidence } from '../game/TradeEvidence'
import { BeaconReturn } from '../game/BeaconReturn'
import { ChronicleFeed } from '../game/ChronicleFeed'
import { STAGE_NAMES } from '../CreatureArt'
import { COMBAT_LOCI, ELEMENTS, LOCI, elementOf, hiAllele, loAllele, rareCount, CHIMERA_TRAITS } from '../genetics'

export default function CreatureDetail({ id, initialSection = 'overview' }: { id: number; initialSection?: 'overview' | 'genome' }) {
  const { account } = useWallet()
  const c = useCreature(id)
  const traits = useTraits(c.data)
  const priv = usePrivateGenes(c.data, account)
  const cert = useCertifiedGenome(c.data)
  const listing = useListingOf(id)
  const stats = useAccountStats(account)
  const readyAt = useTReadyAt(id)
  const defender = useTDefender(id, c.data?.owner)
  const keyReady = useLabKeyReady(account)
  const training = useTraining(id)
  const now = useNow(1000)
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const [price, setPrice] = useState('25')
  const [section, setSection] = useState<'overview' | 'genome' | 'trade' | 'history'>(initialSection)

  if (!DEPLOYED) return <Empty title="Contracts are not live yet" />
  if (!Number.isFinite(id) || id <= 0) return <Empty title="No such specimen" />
  if (c.isLoading) return <div className="space-y-5"><Location place="creature"><span>Specimen #{id}</span></Location><div className="chm-panel h-48 animate-pulse" /></div>
  if (c.error || !c.data)
    return (
      <Empty title={`Specimen #${id} is not in the Arkhive`}>
        No creature with this number has hatched yet, or the network did not answer.
        <div className="mt-4 flex justify-center gap-3">
          <Button onClick={() => go('lab')}>Open my lab</Button>
          <Button variant="ghost" onClick={() => c.refetch()}>Try again</Button>
        </div>
      </Empty>
    )

  const base = c.data
  const info = base.info
  const t = traits.data
  const mine = !!account && base.owner.toLowerCase() === account.toLowerCase()
  const inMarket = base.owner.toLowerCase() === MARKET.toLowerCase()
  const inArena = base.owner.toLowerCase() === ARENA.toLowerCase() || base.owner.toLowerCase() === COLOSSEUM.toLowerCase()
  const onExpedition = base.owner.toLowerCase() === EXPEDITIONS.toLowerCase()
  const sellerIsMe = !!account && listing.data?.seller.toLowerCase() === account.toLowerCase()

  const alleles: Record<number, number> = { ...(mine ? priv.data?.loci : undefined) }
  if (cert.data) cert.data.loci.forEach((v, i) => (alleles[i] = v))
  const element = (mine ? priv.data?.element : undefined) ?? cert.data?.element ?? null
  const rc = t ? rareCount(t) : 0
  const cooldown = Number(info.cooldownUntil) - now
  const fightCd = (readyAt.data ?? 0) - now
  const defending = defender.data === true

  // power: exact for sequenced loci, range for sealed ones
  let lo = 0
  let hi = 0
  for (const l of COMBAT_LOCI) {
    if (alleles[l] != null) {
      const s = hiAllele(alleles[l]) + loAllele(alleles[l])
      lo += s
      hi += s
    } else if (t) {
      lo += 2 * t[l]
      hi += t[l] + 15
    }
  }

  const done = (keys: string[]) => refresh('creature', ...keys)

  function publishGenome() {
    if (!confirm('Publish this specimen’s alleles and element permanently? Rivals can calculate its base gene power. Training bonuses stay encrypted.')) return
    void run('Certify genome', (s) => certify(id, s), 'Genome certified', { spec: { kind: 'certify', me: id } }).then((r) => r && done(['certified']))
  }

  return (
    <div className="space-y-5 chm-specimen-file" data-section={section}>
      <Location place="creature" actions={mine && <><Button onClick={() => travel(`arena/${id}`)} disabled={fightCd > 0} title={fightCd > 0 ? `Recovering for ${fmtDuration(fightCd)}` : undefined}><Swords className="h-4 w-4" />{fightCd > 0 ? `Resting ${fmtDuration(fightCd)}` : 'Fight'}</Button><Button variant="ghost" onClick={() => travel(`breed/${id}`)}><HeartHandshake className="h-4 w-4" /> Breed</Button></>}><span>Specimen #{id}</span></Location>
      <div className="chm-specimen-tabs flex flex-wrap gap-2" role="group" aria-label="Specimen sections">
        {([['overview', 'Overview'], ['genome', 'Genome'], ['trade', 'Trade'], ['history', 'Life story']] as const).map(([key, label]) => <button key={key} className="chm-mode" aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}
      </div>
      {mine && section === 'genome' && <BeaconReturn account={account} lead="archive" />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="chm-specimen-portrait relative overflow-hidden p-6">
            <div className="relative flex justify-center">
              <div key={t ? 'born' : 'egg'} className={`max-w-full ${t ? 'chm-hatch' : ''}`}>
                <CreatureArt traits={t} seed={id} size={280} hatching={!t} stage={training.data?.stage} className="h-auto max-w-full" />
              </div>
            </div>
            {element != null && (
              <svg className="absolute right-4 top-4" width="44" height="44" viewBox="150 10 40 40">
                <ElementSigil glyph={ELEMENTS[elementOf(element)].glyph} color={ELEMENTS[elementOf(element)].color} x={170} y={30} r={18} />
              </svg>
            )}
            <div className="relative mt-2 text-center">
              {info.chimera && <span className="chm-chimera-tag">Rare lineage verified</span>}
              <h2 className="mt-3 font-display text-3xl sm:text-4xl">{creatureTitle(id, t)}</h2>
              <div className="mt-2 font-mono text-xs text-[#c4d0c7]">
                #{id} · LV {training.data?.level ?? 0} {STAGE_NAMES[training.data?.stage ?? 0]} · generation {info.generation} · {info.wild ? 'wild-born' : info.parentA ? 'bred' : 'genesis'} · bred {info.breeds}/7
                {!t && <span className="chm-flicker"> · decrypting looks…</span>}
              </div>
            </div>
          </Panel>

          {section === 'overview' && <section aria-label="The specimen speaks" className="chm-specimen-voice p-4 sm:p-5">
            <div className="chm-sealed-label mb-2 flex items-center gap-2 font-mono text-xs font-bold uppercase">
              <Lock className="h-4 w-4" aria-hidden="true" />
              {info.certified ? 'Genome public · Training bonuses sealed' : 'NFT on Sepolia · Genome sealed'}
            </div>
            <blockquote className="font-display text-base leading-snug sm:text-xl">
              {info.certified
                ? '“My genome is yours to read. Want to see how I fight? Meet me in the Colosseum.”'
                : '“I live on-chain. Want to know what I’m capable of? Fight me, or wait until I reveal my genes.”'}
            </blockquote>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {defending && !mine && <Link to={`arena/duel/${id}`} className="chm-btn chm-btn-primary"><Swords className="h-4 w-4" aria-hidden="true" /> Challenge me</Link>}
              {mine && !defending && !defender.isPending && <Link to={`arena/defend/${id}`} className="chm-btn chm-btn-ghost"><Shield className="h-4 w-4" aria-hidden="true" /> Post as defender</Link>}
              {!defending && !mine && <span className="text-xs text-[#e4e2ee]">{defender.isPending ? 'Checking the Colosseum…' : defender.isError ? 'Defender status unavailable' : 'Not defending right now'}</span>}
              {mine && defending && <span className="text-xs font-bold text-[#b8f5d8]">Defending the Colosseum</span>}
              {info.certified && <button type="button" onClick={() => {
                setSection('genome')
              }} className="inline-flex min-h-11 items-center text-sm font-bold underline">Read my genome</button>}
            </div>
            <p className="mt-2 text-xs text-[#e4e2ee]">A duel reveals round winners. The keeper can publish the genome. Training bonuses and round rolls stay sealed.</p>
          </section>}

          {section === 'genome' && <Panel className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <div>
              <Label>Keeper</Label>
              <div className="mt-1 text-sm">{inMarket ? 'Market escrow' : inArena ? 'In the Colosseum' : onExpedition ? <Link to="expeditions" className="underline">Away on an expedition</Link> : <Addr a={base.owner} you={account} />}</div>
            </div>
            <div>
              <Label>Rare traits</Label>
              <div className="mt-1 font-mono text-sm">{t ? `${rc} / 7` : '—'}</div>
            </div>
            <div title="Sum of both alleles at Body, Eyes, Crest, Limbs and Aura">
              <Label>Gene power</Label>
              <div className="mt-1 font-mono text-sm">
                {t ? (lo === hi ? lo : `${lo}–${hi}`) : '—'}
                {(training.data?.level ?? 0) > 0 && <span className="text-[#1FA46A]"> + trained</span>}
              </div>
            </div>
            <div>
              <Label>Breeding</Label>
              <div className="mt-1 font-mono text-sm">{cooldown > 0 ? `rests ${fmtDuration(cooldown)}` : 'ready'}</div>
            </div>
          </Panel>}

          {section === 'genome' && (info.parentA > 0 || info.parentB > 0) && (
            <div>
              <Label className="mb-2">Lineage</Label>
              <div className="grid grid-cols-2 gap-3">
                {[info.parentA, info.parentB].map((p, i) => (
                  <div key={i}>
                    <div className="mb-1 font-mono text-[11px] text-[var(--chm-dim)]">{i ? 'Parent B (gives the right allele)' : 'Parent A (gives the left allele)'}</div>
                    <CreatureCard id={p} compact onClick={() => travel(`creature/${p}`)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {section === 'overview' && <>
          <TrainingPanel id={id} owner={base.owner} />
          <RelicSlots id={id} owner={base.owner} level={training.data?.level ?? 0} />
          </>}
          {section === 'genome' && <>
            {mine && <Panel className="p-5"><Label>Read & reveal genes</Label>
              <div className="mt-5 border-t border-[var(--chm-line)] pt-4">
                <div className="flex items-center justify-between">
                  <Label>Sequence a gene · 1 energy each · {stats.data?.energy ?? '·'} left</Label>
                </div>
                  {info.sequencedMask === 0 && <p className="mt-1 text-sm text-[var(--chm-dim)]">A specimen’s looks show one allele. Read a combat gene to see the hidden allele before you choose a parent or a fighter.</p>}
                {!keyReady ? (
                  <div className="mt-3 flex items-center gap-3 text-sm text-[var(--chm-dim)]">
                    Unlock your lab key to read sequenced genes and this creature's element.
                    <Button variant="ghost" busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', (step) => { step('Sign for your lab key…'); return labKey(account!) }, 'Lab key unlocked', { spec: { kind: 'unlockSpecimen', me: id } })}>
                      Unlock
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {LOCI.map((l, i) => {
                      const seqd = (info.sequencedMask & (1 << i)) !== 0 || info.certified
                      return (
                        <button
                          key={l.key}
                          disabled={seqd || !!busy || (stats.data?.energy ?? 0) === 0}
                          onClick={() => run(`Sequence ${l.name}`, (s) => sequence(id, i, s), `${l.name} sequenced`, { spec: { kind: 'sequence', me: id, detail: l.name } }).then((r) => r && done(['private', 'account', 'journal']))}
                          className="border-2 border-[#111] bg-white px-3 py-1.5 text-sm font-bold shadow-[3px_3px_0_#111] transition disabled:cursor-not-allowed"
                          style={{ background: seqd ? '#3DDC97' : undefined, opacity: !seqd && (stats.data?.energy ?? 0) === 0 ? 0.4 : 1 }}
                        >
                          <Microscope className="mr-1 inline h-3.5 w-3.5" />
                          {l.name}
                          {seqd && ' ✓'}
                        </button>
                      )
                    })}
                  </div>
                )}
                {priv.error && <div className="mt-2 text-sm text-[var(--chm-red)]">{errorText(priv.error)}</div>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
              {mine && !info.certified && <Button variant="ghost" busy={busy === 'Certify genome'} disabled={!!busy} onClick={publishGenome}>
                <ScrollText className="h-4 w-4" aria-hidden="true" /> Publish genome
              </Button>}
              {!info.chimera && <div className="mt-3">
                  <Button
                    variant="gold"
                    disabled={!t || rc < CHIMERA_TRAITS}
                    busy={busy === 'Verify rare lineage'}
                    title={t && rc < CHIMERA_TRAITS ? `Needs ${CHIMERA_TRAITS} rare traits — this one has ${rc}` : undefined}
                    onClick={() => run('Verify rare lineage', (s) => claimChimera(id, base.pheno, s), 'Rare lineage verified onchain', { spec: { kind: 'chimera', me: id } }).then((r) => r && done(['world']))}
                  >
                    <Sparkles className="h-4 w-4" /> Verify rare lineage
                  </Button>
              </div>}
              </div>
            </Panel>}
          <section id="specimen-genome" tabIndex={-1} aria-label="Specimen genome" className="chm-panel p-5">
            <div className="flex items-baseline justify-between">
              <Label>Genome</Label>
              <span className="font-mono text-[11px] text-[var(--chm-dim)]">{info.certified ? 'certified — public' : mine ? 'sealed except what you sequence' : 'sealed — only looks are public'}</span>
            </div>
            <div className="mt-2">
              <TraitTable traits={t} alleles={alleles} element={element} base={base} />
            </div>
            {!mine && !info.certified && <p className="mt-3 text-xs text-[var(--chm-dim)]">Its looks are public. The keeper can read its element and the alleles they have sequenced.</p>}
          </section>

          <NftPanel id={id} mine={mine} certified={info.certified} />

          <Panel className="grid gap-4 p-5 sm:grid-cols-[220px_1fr]">
            <DnaStrand alleles={alleles} height={300} />
            <div className="space-y-3 text-sm text-[var(--chm-dim)]">
              <Label>How to read the strand</Label>
              <p>Each rung is one gene: the left allele came from parent A, the right from parent B. The lower number is dominant and is what you see on the creature.</p>
              <p>A high hidden allele is valuable even when it does not show — pair two carriers and the child can express it.</p>
              <p>
                <SpecimenLink id={id} destination="verify" className="text-[var(--chm-teal)] hover:underline">
                  Verify this specimen's genome →
                </SpecimenLink>
              </p>
            </div>
          </Panel>

          </>}
          {section === 'trade' && <>
            <Panel className="space-y-2 p-4"><Label>Trade record</Label><TradeEvidence key={listing.data?.id ?? id} id={id} listingId={inMarket ? listing.data?.id : undefined} seller={sellerIsMe && listing.data?.status === 1} /></Panel>
            {mine && <Panel className="p-5"><Label>List this specimen</Label>
              {!inMarket && (
                <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-[var(--chm-line)] pt-4">
                  <div className="w-36">
                    <Label className="mb-1">Price (cZAMA)</Label>
                    <input className="chm-input" aria-label="Sale price in cZAMA" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
                  </div>
                  <Button
                    variant="ghost"
                    busy={busy === 'List for sale'}
                    disabled={!(Number(price) > 0)}
                    onClick={() =>
                      run('List for sale', (s) => list(account!, id, BigInt(Math.round(Number(price) * 1e6)), s), 'Listed on the market', { spec: { kind: 'list', me: id } }).then((r) => {
                        if (r) {
                          refresh('listings', 'listingOf', 'mine', 'creature')
                          go('market')
                        }
                      })
                    }
                  >
                    <Store className="h-4 w-4" /> List for sale
                  </Button>
                  <div className="pb-2 text-xs text-[var(--chm-dim)]">Buyers pay in encrypted cZAMA. The price is public; balances are not. You receive 95% (5% feeds the World Boss).</div>
                </div>
              )}
            </Panel>}
          {inMarket && listing.data && (
            <Panel className="flex flex-wrap items-center gap-4 p-5">
              <div className="flex-1">
                <Label>Listed on the market</Label>
                <div className="mt-1 font-mono text-lg">{fmtZama(listing.data.price)} cZAMA</div>
                <div className="text-xs text-[var(--chm-dim)]">
                  by <Addr a={listing.data.seller} you={account} />
                  {listing.data.status === 2 && ' · purchase awaiting finalization'}
                </div>
              </div>
              {sellerIsMe && listing.data.status === 1 ? (
                <Button variant="danger" busy={busy === 'Cancel listing'} onClick={() => run('Cancel listing', (s) => cancelListing(listing.data!.id, s), 'Specimen returned', { spec: { kind: 'cancelListing', me: id } }).then((r) => r && refresh('listingOf', 'creature', 'listings', 'mine'))}>
                  Cancel listing
                </Button>
              ) : (
                <Link to="market" className="chm-btn chm-btn-ghost">
                  Open market
                </Link>
              )}
            </Panel>
          )}

            {!mine && !inMarket && <Empty title="This specimen is not for sale">Only its keeper can list it on the Market.</Empty>}
          </>}
          {section === 'history' && <>
          <ChronicleFeed creature={id} limit={12} title={`#${id} · LIFE STORY`} more={false} empty="No public events for this specimen yet." />          </>}

        </div>
      </div>
    </div>
  )
}
