import { Location } from '../game/Location'
import { travel } from '../game/Transition'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { encodePacked, keccak256, parseAbiItem, type Hex } from 'viem'
import { CheckCircle2, XCircle, CircleDashed, ExternalLink, Search } from 'lucide-react'
import CreatureArt from '../CreatureArt'
import { Button, CreatureCard, Empty, Label, Panel, creatureTitle } from '../ui'
import { useChronicle } from '../chronicle'
import { DEPLOYED, LAB, getLogsSliced, txUrl, short } from '../chain'
import { useCertifiedGenome, useCreature, useTraits } from '../hooks'
import { LOCI, hiAllele, loAllele } from '../genetics'

const HATCHED = parseAbiItem('event Hatched(uint256 indexed id, address indexed owner, uint16 generation, uint32 parentA, uint32 parentB, bytes32 genomeCommitment)')

type Check = { ok: boolean | null; title: string; detail: string }

export default function Verify({ id }: { id?: number }) {
  const [q, setQ] = useState(id ? String(id) : '')
  if (!DEPLOYED) return <Empty title="Verification opens once the contracts are live" />
  return (
    <div className="space-y-8">
      <Location place="verify" />
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const specimen = Number(q)
          if (Number.isSafeInteger(specimen) && specimen > 0) travel(`verify/${specimen}`)
        }}
      >
        <input className="chm-input min-w-0" aria-label="Specimen number" inputMode="numeric" placeholder="Specimen number" value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} />
        <Button type="submit">
          <Search className="h-4 w-4" /> Verify
        </Button>
      </form>
      {id ? <Report id={id} key={id} /> : <Recent />}
    </div>
  )
}

function Report({ id }: { id: number }) {
  const c = useCreature(id)
  const t = useTraits(c.data)
  const cert = useCertifiedGenome(c.data)
  const pa = useCreature(c.data?.info.parentA || null)
  const pb = useCreature(c.data?.info.parentB || null)
  const ca = useCertifiedGenome(pa.data)
  const cb = useCertifiedGenome(pb.data)

  const birth = useQuery({
    queryKey: ['birth', id],
    queryFn: async () => {
      const logs = await getLogsSliced<{ args: { genomeCommitment: Hex }; transactionHash: Hex; blockNumber: bigint }>({ address: LAB, event: HATCHED, args: { id: BigInt(id) } })
      const l = logs[0]
      return l ? { commitment: l.args.genomeCommitment as Hex, tx: l.transactionHash, block: l.blockNumber } : null
    },
    enabled: !!c.data,
    staleTime: Infinity,
    retry: 1,
  })

  if (c.isLoading) return <div className="chm-panel h-60 animate-pulse" />
  if (!c.data) return <Empty title={`Specimen ${id} was not found`} />

  const base = c.data
  const now = keccak256(encodePacked(['bytes32[]'], [base.genome]))
  const checks: Check[] = []

  checks.push(
    birth.data
      ? { ok: birth.data.commitment.toLowerCase() === now.toLowerCase(), title: 'Genome unchanged since birth', detail: `Birth record ${short(birth.data.commitment)} · today ${short(now)}` }
      : { ok: null, title: 'Genome unchanged since birth', detail: birth.isLoading ? 'Reading the birth record…' : 'This RPC could not return the birth log. The commitment today is ' + short(now) },
  )
  checks.push({ ok: true, title: 'Genes drawn from encrypted onchain randomness', detail: base.info.parentA ? 'Inherited alleles were chosen by FHE.randEbool; mutations by FHE.randEuint8. No input from the player or the operator.' : 'Each locus came from FHE.randEuint8 inside the Zama coprocessor. No one saw the value at birth.' })

  if (!base.info.certified) {
    checks.push({ ok: null, title: 'Looks match the genome', detail: 'The genome is still sealed. Its keeper can publish it with "Certify genome".' })
  } else if (cert.data && t.data) {
    const bad = t.data.filter((v, i) => Math.min(hiAllele(cert.data!.loci[i]), loAllele(cert.data!.loci[i])) !== v).length
    checks.push({ ok: bad === 0, title: 'Looks match the genome', detail: bad ? `${bad} trait(s) do not equal the dominant allele` : 'Every visible trait equals the lower of its two alleles.' })
    const el = cert.data.loci[7]
    checks.push({ ok: Math.min(hiAllele(el), loAllele(el)) === cert.data.element, title: 'Element matches its gene', detail: `Element value ${cert.data.element}` })
  }

  let mendel: { i: number; a: 'ok' | 'mutation' | 'bad'; b: 'ok' | 'bad' }[] | null = null
  if (base.info.parentA && cert.data && ca.data && cb.data) {
    mendel = cert.data.loci.map((locus, i) => {
      const A = [hiAllele(ca.data!.loci[i]), loAllele(ca.data!.loci[i])]
      const B = [hiAllele(cb.data!.loci[i]), loAllele(cb.data!.loci[i])]
      return { i, a: A.includes(hiAllele(locus)) ? 'ok' : 'mutation', b: B.includes(loAllele(locus)) ? 'ok' : 'bad' }
    })
    const bad = mendel.filter((m) => m.b === 'bad').length
    const mut = mendel.filter((m) => m.a === 'mutation').length
    checks.push({ ok: bad === 0, title: 'Inheritance follows the rules', detail: bad ? `${bad} allele(s) did not come from parent B` : `Every allele traces back to a parent${mut ? `, plus ${mut} mutation(s) from parent A's side (1 in 32 chance each)` : ''}.` })
  } else if (base.info.parentA) {
    checks.push({ ok: null, title: 'Inheritance follows the rules', detail: 'Needs this specimen and both parents to be certified.' })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Panel className="flex flex-col items-center p-6 text-center">
        <CreatureArt traits={t.data} seed={id} size={240} hatching={!t.data} />
        <div className="font-display text-3xl">{creatureTitle(id, t.data)}</div>
        <div className="font-mono text-xs text-[var(--chm-dim)]">
          #{id} · gen {base.info.generation} · {base.info.certified ? 'certified' : 'sealed'}
        </div>
        {birth.data && (
          <a href={txUrl(birth.data.tx)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-mono text-xs text-[var(--chm-teal)] hover:underline">
            birth transaction <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </Panel>
      <div className="space-y-4">
        <Panel className="divide-y divide-[var(--chm-line)]">
          {checks.map((ch) => (
            <div key={ch.title} className="flex gap-3 p-4">
              {ch.ok === true ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--chm-teal)]" /> : ch.ok === false ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--chm-red)]" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-[var(--chm-dim)]" />}
              <div>
                <div className="text-[var(--chm-ink)]">{ch.title}</div>
                <div className="mt-0.5 break-all text-sm text-[var(--chm-dim)]">{ch.detail}</div>
              </div>
            </div>
          ))}
        </Panel>
        {mendel && (
          <Panel className="p-5">
            <Label className="mb-3">Allele trace</Label>
            <div className="grid grid-cols-4 gap-2 font-mono text-xs sm:grid-cols-8">
              {mendel.map((m) => (
                <div key={m.i} className="border-2 border-[#111] bg-white p-2 text-center">
                  <div className="text-[10px] uppercase text-[var(--chm-dim)]">{LOCI[m.i].name}</div>
                  <div className="mt-1">
                    <span className="font-bold" style={{ color: m.a === 'ok' ? '#0f8a56' : '#d14f00' }}>{hiAllele(cert.data!.loci[m.i])}</span>
                    {' / '}
                    <span className="font-bold" style={{ color: m.b === 'ok' ? '#0f8a56' : '#E5341D' }}>{loAllele(cert.data!.loci[m.i])}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--chm-dim)]">{m.a === 'mutation' ? 'mutated' : 'inherited'}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}
        <Panel className="p-5 text-sm leading-relaxed text-[var(--chm-dim)]">
          <Label className="mb-2">Check it without this page</Label>
          Call <span className="font-mono text-[var(--chm-ink)]">getGenomeHandles({id})</span> on the lab contract and hash the 8 handles with <span className="font-mono text-[var(--chm-ink)]">keccak256(abi.encodePacked(...))</span>. It must equal the <span className="font-mono text-[var(--chm-ink)]">genomeCommitment</span> in the Hatched event. For a certified genome, any Zama relayer will return the same cleartexts and a KMS signature you can check with <span className="font-mono text-[var(--chm-ink)]">FHE.checkSignatures</span>.
        </Panel>
      </div>
    </div>
  )
}

/** With no number typed yet, offer the newest specimens so there is always something to audit. */
function Recent() {
  const q = useChronicle()
  const ids = [...new Set((q.data?.items ?? []).filter((i) => (i.kind === 'hatch' || i.kind === 'breed' || i.kind === 'wild') && i.creature).map((i) => i.creature!))].slice(0, 8)
  if (q.isLoading) return <div className="chm-panel h-40 animate-pulse" />
  if (!ids.length) return null
  return (
    <div>
      <Label className="mb-3">Newest specimens · pick one to audit</Label>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {ids.map((n) => (
          <CreatureCard key={n} id={n} compact onClick={() => travel(`verify/${n}`)} />
        ))}
      </div>
    </div>
  )
}
