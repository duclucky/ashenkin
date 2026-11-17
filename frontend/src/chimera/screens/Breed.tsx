import { Location } from '../game/Location'
import { useState } from 'react'
import { GuestGate } from '../game/GuestGate'
import { HeartHandshake, Lock, Egg as EggIcon } from 'lucide-react'
import { Button, Empty, Panel, useAction, creatureTitle } from '../ui'
import { DEPLOYED, useWallet } from '../chain'
import { useBalance, useCertifiedGenome, useCreature, useMyCreatures, useNow, usePendingEggs, usePrivateGenes, useRefresh, useTraits, fmtDuration, fmtZama, feeFor, MAX_BREEDS, BREED_FEES, type CreatureBase, type Egg } from '../hooks'
import { breed, hatchEgg } from '../actions'
import { LOCI, RARE, CHIMERA_TRAITS, TIERS, childExpressed, pAtLeast, pAtLeastK, passedAllele, pct, tierOf } from '../genetics'
import CreatureArt from '../CreatureArt'
import { Backdrop } from '../game/art'
import { SpecimenRoster } from '../game/SpecimenRoster'
import { BreedingObjective } from '../game/BreedingObjective'
import { useLineageEconomy } from '../economy'
import { breedingAccess } from '../game/economy-rules'
import { LineageNotice } from '../game/EconomyPolicy'

type Known = { base?: CreatureBase; traits?: number[]; loci: Record<number, number> }

function useKnown(id: number | null): Known {
  const { account } = useWallet()
  const c = useCreature(id)
  const t = useTraits(c.data)
  const p = usePrivateGenes(c.data, account)
  const cert = useCertifiedGenome(c.data)
  const loci: Record<number, number> = { ...(p.data?.loci ?? {}) }
  cert.data?.loci.forEach((v, i) => (loci[i] = v))
  return { base: c.data, traits: t.data, loci }
}

export default function Breed({ preset }: { preset?: number }) {
  const { account } = useWallet()
  const mine = useMyCreatures(account)
  const [a, setA] = useState<number | null>(preset ?? null)
  const [b, setB] = useState<number | null>(null)
  const A = useKnown(a)
  const B = useKnown(b)
  const now = useNow(1000)
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const bal = useBalance(account)
  const eggs = usePendingEggs(account)
  const lineage = useLineageEconomy(account)
  const access = breedingAccess(lineage.data, lineage.isError)

  if (!DEPLOYED) return <Empty title="Breeding opens once the contracts are live" />
  if (!account) return <div className="space-y-5"><Location place="breed" /><GuestGate place="breed" /></div>

  function pick(id: number) {
    if (a === id) return setA(null)
    if (b === id) return setB(null)
    if (a == null) setA(id)
    else setB(id)
  }

  // per-locus odds
  const ready = A.traits && B.traits
  const rows = ready
    ? LOCI.slice(0, 7).map((_, i) => {
        const fa = passedAllele(A.traits![i], A.loci[i])
        const fb = passedAllele(B.traits![i], B.loci[i])
        const dist = childExpressed(fa, fb)
        const exact = A.loci[i] != null && B.loci[i] != null
        const mean = dist.reduce((s, p, v) => s + p * v, 0)
        return { i, dist, pRare: pAtLeast(dist, RARE), pMythic: dist[15], exact, partial: A.loci[i] != null || B.loci[i] != null, mean }
      })
    : []
  const pChimera = ready ? pAtLeastK(rows.map((r) => r.pRare), CHIMERA_TRAITS) : 0
  const cdA = A.base ? Number(A.base.info.cooldownUntil) - now : 0
  const cdB = B.base ? Number(B.base.info.cooldownUntil) - now : 0
  const spent = (A.base && A.base.info.breeds >= MAX_BREEDS) || (B.base && B.base.info.breeds >= MAX_BREEDS)
  const fee = A.base && B.base ? feeFor(A.base.info.breeds) + feeFor(B.base.info.breeds) : null
  const short = fee != null && bal.value != null && bal.value < BigInt(fee) * 1_000_000n

  async function doBreed() {
    if (access.blocker) return
    await run('Breed', (s) => breed(account!, a!, b!, s), 'Egg hatched', { spec: { kind: 'breed', me: a!, foe: b! } })
    refresh('mine', 'creature', 'world', 'eggs', 'bal', 'balHandle', 'quests', 'economy', 'lineageEconomy', 'rewardBudget')
  }

  async function doHatch(egg: Egg) {
    await run('Hatch egg', (s) => hatchEgg(egg.id, egg.paid, s), 'Egg resolved', {
      spec: { kind: 'hatchEgg', me: egg.parentA, foe: egg.parentB },
      map: (r) => ({ ...r, id: egg.id }),
    })
    refresh('mine', 'eggs', 'bal', 'balHandle', 'quests', 'economy', 'lineageEconomy', 'rewardBudget')
  }

  return (
    <div className="space-y-5 chm-nursery">
      <Location place="breed"><span>Choose two parents.</span></Location>

      {!!eggs.data?.length && (
        <Panel className="!bg-[var(--chm-yellow)] p-5">
          <div className="flex items-center gap-2 font-display text-xl"><EggIcon className="h-5 w-5" /> Eggs waiting to hatch</div>
          <p className="mt-1 text-sm">The fee was sent but the proof never landed (maybe the tab closed). Hatch them now: if the fee was paid in full the child is born, otherwise your cZAMA comes back and the parents keep their breed slot.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {eggs.data.map((e) => (
              <Button key={e.id} variant="ghost" busy={busy === 'Hatch egg'} onClick={() => doHatch(e)}>
                Egg #{e.id} · #{e.parentA} × #{e.parentB} · {fmtZama(e.fee)} cZAMA
              </Button>
            ))}
          </div>
        </Panel>
      )}

      <div className="chm-breed-workbench">
        <section className="chm-breed-lab" aria-label="Selected parents">
          <h2 className="sr-only">Choose parents</h2>
          <div className="chm-breed-scene">
            <Backdrop theme="lab" />
            <span className="chm-prep-caption">NURSERY / GENE SPLICING</span>
            <div className="chm-breed-pair">
              <Slot label="Parent A" k={A} cd={cdA} onClear={() => setA(null)} />
              <HeartHandshake className="chm-breed-link" aria-hidden="true" />
              <Slot label="Parent B" k={B} cd={cdB} onClear={() => setB(null)} />
            </div>
          </div>
          {mine.isPending ? <div className="p-4 text-sm text-[#c5d2c3]" role="status">Loading your specimens…</div> : mine.isError ? <div className="p-4"><Button variant="ghost" onClick={() => mine.refetch()}>Retry specimens</Button></div> : !mine.data?.length ? <div className="p-4 text-sm text-[#c5d2c3]">Hatch embryos in the Lab or capture a wild first.</div> : <SpecimenRoster ids={mine.data} selected={[a, b].filter((id): id is number => id != null)} onSelect={pick} label="Choose two parents" selectionLabel="Choose parent" badges={{...(a ? {[a]: 'A'} : {}), ...(b ? {[b]: 'B'} : {})}} />}
        </section>
        <section className="chm-breed-console" aria-label="Breeding preview">
          <span className="chm-console-eyebrow">A NEW LINEAGE</span>
          <div className="chm-offspring-preview" aria-hidden="true"><CreatureArt seed={0} size={112} /></div>
          <h2 className="font-display text-2xl">Offspring unknown</h2>
          <p>Choose two parents. Their hidden alleles combine without being revealed.</p>
          <div className="chm-breed-summary"><span>Parents selected</span><b>{Number(!!a) + Number(!!b)} / 2</b><span>Breeding fee</span><b>{fee == null ? '—' : `${fee} cZAMA`}</b>{ready && <><span>{rows.every(row => row.exact) ? 'Rare lineage chance' : 'Rare lineage estimate'}</span><b>{pct(pChimera)}</b></>}</div>
          <p className="text-sm">Parents stay with you. Each uses one of its seven breeding slots.</p>
          {lineage.data?.version === 2 && <LineageNotice rules={lineage.data} blocker={access.blocker} trainingId={a ?? mine.data?.[0]} />}
          <BreedingObjective a={{ id: a, traits: A.traits, loci: A.loci }} b={{ id: b, traits: B.traits, loci: B.loci }} swap={() => { setA(b); setB(a) }} />
          <Button onClick={doBreed} busy={busy === 'Breed'} disabled={!ready || fee == null || cdA > 0 || cdB > 0 || a === b || !!spent || short || !!busy || !!access.blocker}>
            <HeartHandshake className="h-4 w-4" />{!ready ? 'Choose two parents' : spent ? 'Breed limit reached' : cdA > 0 || cdB > 0 ? `Resting ${fmtDuration(Math.max(cdA, cdB))}` : access.blocker ?? `Breed · ${fee} cZAMA${access.charge ? ' + 1 charge' : ''}`}
          </Button>
          {short && <p className="chm-breed-warning">Your balance is below the fee. Draw cZAMA at the Wishing Well first.</p>}
          <div className="chm-breed-privacy"><Lock size={14} aria-hidden="true" /><span>Zama draws inheritance and mutations on-chain. The genome stays sealed.</span></div>
        </section>
      </div>
      {ready && <details className="chm-panel px-4">
        <summary className="min-h-11 cursor-pointer py-3 font-bold">Inheritance forecast · {pct(pChimera)} rare lineage {rows.every(row => row.exact) ? 'chance' : 'estimate'}</summary>
        <p className="text-sm text-[var(--chm-dim)]">Chance of {CHIMERA_TRAITS} or more rare traits. Unread alleles make this an estimate.</p>
          <div className="mt-6 divide-y divide-[var(--chm-line)]">
            {rows.map((r) => (
              <div key={r.i} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2.5 text-sm sm:grid-cols-[90px_minmax(0,1fr)_74px_60px] sm:gap-4">
                <div>
                  {LOCI[r.i].name}
                  <div className="font-mono text-[10px] uppercase text-[var(--chm-dim)]">{r.exact ? 'exact' : r.partial ? 'partly known' : 'estimate'}</div>
                </div>
                <div className="order-last col-span-full flex h-8 items-end gap-[2px] sm:order-none sm:col-span-1" aria-hidden="true">
                  {r.dist.map((p, v) => (
                    <div key={v} title={`${v}: ${pct(p)}`} className="flex-1 rounded-sm" style={{ height: `${Math.max(3, Math.min(1, p * 2.2) * 100)}%`, background: TIERS[tierOf(v)].color, opacity: r.exact ? 1 : 0.6, border: '1.5px solid #111' }} />
                  ))}
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold" style={{ color: r.pRare > 0.3 ? TIERS[2].ink : undefined }}>{pct(r.pRare)}</span>
                  <div className="text-[10px] text-[var(--chm-dim)]">rare+</div>
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold" style={{ color: r.pMythic > 0.05 ? TIERS[3].ink : undefined }}>{pct(r.pMythic)}</span>
                  <div className="text-[10px] text-[var(--chm-dim)]">mythic</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--chm-dim)]">
            <Lock className="mr-1 inline h-3 w-3" />
            The element gene is inherited too, but it stays private and is not shown here.
          </p>
      </details>}

      <details className="chm-panel px-3 sm:px-4">
        <summary className="min-h-11 cursor-pointer py-3 font-bold">Breeding fees and mutation odds</summary>
        <FeeTable />
      </details>
    </div>
  )
}

function Slot({ label, k, cd, onClear }: { label: string; k: Known; cd: number; onClear: () => void }) {
  return <div className="chm-parent-slot" data-selected={!!k.base}>
    <span className="chm-parent-label">{label}</span>
    {k.base ? <>
      <button type="button" className="chm-parent-clear" aria-label={`Remove ${label.toLowerCase()}`} onClick={onClear}>×</button>
      <CreatureArt traits={k.traits} seed={k.base.id} size={164} hatching={!k.traits} />
      <h3>{creatureTitle(k.base.id, k.traits)}</h3>
      <small>#{k.base.id} · GEN {k.base.info.generation} · BRED {k.base.info.breeds}/{MAX_BREEDS}</small>
      <span className="chm-parent-status">{cd > 0 ? `Resting ${fmtDuration(cd)}` : k.base.info.breeds >= MAX_BREEDS ? 'Breed limit reached' : 'Ready to splice'}</span>
    </> : <>
      <div className="chm-parent-placeholder" aria-hidden="true"><EggIcon /></div>
      <h3>Choose a specimen</h3>
      <small>Pick from your roster below</small>
    </>}
  </div>
}

function FeeTable() {
  return (
    <div className="border-t-2 border-[#111] py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <p className="mt-1 text-sm text-[var(--chm-dim)]">
            Each parent can breed seven times. Fees rise with each use. Of every fee, <b className="text-[#111]">60% feeds the World Boss pot</b> and 40% goes to the Treasury. Parent A's allele has a 1-in-32 chance to mutate at each locus.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BREED_FEES.map((f, i) => (
            <div key={i} className="w-12 border-[3px] border-[#111] bg-white text-center shadow-[3px_3px_0_#111]">
              <div className="border-b-2 border-[#111] bg-[#111] font-mono text-[10px] font-bold text-[var(--chm-yellow)]">#{i + 1}</div>
              <div className="py-1 font-display text-lg">{f}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
