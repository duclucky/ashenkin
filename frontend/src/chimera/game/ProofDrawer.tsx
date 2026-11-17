import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Hex } from 'viem'
import { X, Dice5, Lock, Unlock, ShieldCheck, AlertTriangle, ExternalLink, FileCode2 } from 'lucide-react'
import { addrUrl, short, txUrl } from '../chain'
import { publicDecryptWithProof } from '../fhe'
import { closeProof, openProof, modeOf, proofTrail, useProofSpec, type ProofHandle, type ProofSpec } from '../proof'
import { Link } from '../ui'
import { fetchTBattle, roundBits } from '../season'

/** "How was this decided?" — slides in from the right for any result in the game. */
export function ProofDrawer() {
  const spec = useProofSpec()
  const drawer = useRef<HTMLElement>(null)
  const open = !!spec
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    drawer.current?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.focus({ preventScroll: true })
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeProof()
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('keydown', k)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])
  if (!spec) return null
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" onClick={closeProof}>
      <aside ref={drawer} className="chm-rise h-full w-full max-w-[460px] overflow-y-auto border-l-[4px] border-[#111] bg-[#F4F4F4] shadow-[-8px_0_0_#FFD209]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How was this decided?">
        <Body spec={spec} key={`${spec.mode}:${spec.id ?? ''}`} />
      </aside>
    </div>
  )
}

function Body({ spec }: { spec: ProofSpec }) {
  const m = modeOf(spec.mode)
  const trail = useQuery({
    queryKey: ['proofTrail', spec.mode, spec.id],
    queryFn: () => proofTrail(spec.mode, spec.id!),
    enabled: spec.id != null && !spec.txs,
    staleTime: 60_000,
    retry: 1,
  })
  const txs = spec.txs ?? trail.data?.txs ?? []
  const handles = spec.handles ?? trail.data?.handles ?? []

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b-[3px] border-[#111] bg-[#111] p-4 text-[#F4F4F4]">
        <div>
          <div className="font-pixel text-[9px] text-[#FFD209]">HOW WAS THIS DECIDED?</div>
          <div className="mt-1 font-display text-2xl leading-tight">{spec.title ?? m.name}</div>
          {spec.result && <div className="mt-1 font-mono text-xs text-[#cfcab9]">{spec.result}</div>}
        </div>
        <button onClick={closeProof} className="grid min-h-11 min-w-11 shrink-0 place-items-center border-2 border-[#F4F4F4] hover:bg-[#F4F4F4] hover:text-[#111]" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {spec.mode === 'tactics' && spec.id != null && <VerifyRounds id={spec.id} />}
        {spec.mode === 'depths' && trail.data?.depthRecord && handles[0]?.publicValue && (
          <VerifyDepth handle={handles[0].handle} {...trail.data.depthRecord} />
        )}
        <Step n={1} icon={<Dice5 className="h-4 w-4" />} title="Where the luck came from" tone="#FFD209">
          <p>{m.randomness}</p>
        </Step>
        <Step n={2} icon={<Lock className="h-4 w-4" />} title="What stays secret" tone="#B06CFF">
          <ul className="list-disc space-y-0.5 pl-4">
            {m.sealed.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Step>
        <Step n={3} icon={<Unlock className="h-4 w-4" />} title="What was made public" tone="#3DDC97">
          <p>{m.revealed}</p>
        </Step>
        <Step n={4} icon={<ShieldCheck className="h-4 w-4" />} title="How the chain checked it" tone="#5AC8FA">
          <p>{m.check}</p>
        </Step>
        <Step n={5} icon={<AlertTriangle className="h-4 w-4" />} title="If this were public…" tone="#FF7020">
          <p>{m.ifPublic}</p>
        </Step>

        {spec.id != null && (
          <div className="border-[3px] border-[#111] bg-white p-3">
            <div className="font-mono text-[10px] font-black uppercase tracking-widest">Onchain trail</div>
            {trail.isLoading && <div className="chm-flicker mt-2 text-sm">Reading Sepolia…</div>}
            {trail.error && <div className="mt-2 text-sm text-[var(--chm-red)]">Could not read the logs right now.</div>}
            {!trail.isLoading && !txs.length && !trail.error && <div className="mt-2 text-sm text-[var(--chm-dim)]">No transactions found yet.</div>}
            <ol className="mt-2 space-y-2">
              {txs.map((t) => (
                <li key={t.hash} className="text-sm">
                  <div className="font-bold">{t.label}</div>
                  <a href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs underline">
                    {short(t.hash)} <ExternalLink className="h-3 w-3" />
                  </a>
                  {t.block != null && <span className="ml-2 font-mono text-[11px] text-[var(--chm-dim)]">block {t.block.toString()}</span>}
                </li>
              ))}
            </ol>
            {handles.length > 0 && (
              <>
                <div className="mt-4 font-mono text-[10px] font-black uppercase tracking-widest">Ciphertext handles</div>
              <div className="mt-2 space-y-2">
                  {handles.map((h) => (
                    <HandleRow key={h.handle} h={h} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <a href={addrUrl(m.contract())} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            <FileCode2 className="h-3.5 w-3.5" /> Contract {short(m.contract())}
          </a>
          <span onClick={closeProof}>
            <Link to="fairness" className="underline">
              All modes in the Proof Center →
            </Link>
          </span>
        </div>
      </div>
    </div>
  )
}

function VerifyDepth({ handle, survived, depth }: { handle: Hex; survived: boolean; depth: number }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  async function verify() {
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      const proof = await publicDecryptWithProof([handle], { tries: 3 })
      const value = Object.entries(proof.clearValues).find(([key]) => key.toLowerCase() === handle.toLowerCase())?.[1]
      if (!proof.decryptionProof || proof.decryptionProof === '0x' || value !== survived) {
        throw new Error('The KMS survival bit does not match the posted result.')
      }
      setMessage(`KMS matches Sepolia: ${survived ? 'survived' : 'did not survive'} · ${depth} floors cleared.`)
    } catch (cause) {
      setFailed(true)
      setMessage(cause instanceof Error ? cause.message : 'Verification could not finish. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-[3px] border-[#111] bg-[#b8f5d8] p-3" aria-label="Verify Sepolia survival">
      <button type="button" className="chm-btn chm-btn-primary" onClick={verify} disabled={busy}>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {busy ? 'Checking Sepolia and KMS…' : 'Verify survival'}
      </button>
      {message && <p role={failed ? 'alert' : 'status'} className="mt-2 break-words text-sm font-bold">{message}</p>}
    </section>
  )
}

function VerifyRounds({ id }: { id: number }) {
  const [result, setResult] = useState<{ rounds: boolean[]; proof: Hex } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function verify() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const battle = await fetchTBattle(id)
      if (battle.status !== 2 || battle.handles.length !== 3) throw new Error('This fight needs to be settled on Sepolia first.')
      const proof = await publicDecryptWithProof(battle.handles, { tries: 3 })
      const values = new Map(Object.entries(proof.clearValues).map(([handle, value]) => [handle.toLowerCase(), value]))
      const expected = roundBits(battle.rounds)
      if (!proof.decryptionProof || proof.decryptionProof === '0x' || battle.handles.some((handle, index) => values.get(handle.toLowerCase()) !== expected[index])) {
        throw new Error('The KMS results do not match the settled rounds.')
      }
      if (battle.challengerWon !== (expected.filter(Boolean).length >= 2)) throw new Error('The stored match winner does not match the round results.')
      setResult({ rounds: expected, proof: proof.decryptionProof })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sepolia verification could not finish. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-[3px] border-[#111] bg-[#b8f5d8] p-3" aria-label="Verify Sepolia rounds">
      <button type="button" disabled={busy} onClick={verify} className="chm-btn chm-btn-primary">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {busy ? 'Checking Sepolia and KMS…' : 'Verify all three rounds'}
      </button>
      {result && <div role="status" className="mt-3 text-sm">
        <p className="font-bold">All three KMS results match Sepolia.</p>
        <ol className="mt-1 space-y-1">
          {result.rounds.map((win, index) => <li key={index}>Round {index + 1} · {win ? 'Challenger' : 'Opponent'}</li>)}
        </ol>
        <p className="mt-2 break-all font-mono text-[10px]">KMS proof {result.proof.slice(0, 42)}…</p>
      </div>}
      {error && <p role="alert" className="mt-2 break-words text-sm font-bold text-[#8f241a]">{error}</p>}
    </section>
  )
}

function Step({ n, icon, title, tone, children }: { n: number; icon: React.ReactNode; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center border-[3px] border-[#111] font-mono text-xs font-black" style={{ background: tone }}>
        {n}
      </div>
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-1.5 font-bold">
          {icon} {title}
        </div>
        <div className="mt-0.5 text-[var(--chm-dim)]">{children}</div>
      </div>
    </div>
  )
}

/** A handle; public ones can be decrypted right here through the Zama relayer, with the KMS proof shown. */
function HandleRow({ h }: { h: ProofHandle }) {
  const [state, setState] = useState<{ busy?: boolean; value?: string; proof?: Hex; err?: string }>({})
  async function check() {
    setState({ busy: true })
    try {
      const r = await publicDecryptWithProof([h.handle], { tries: 3 })
      const v = Object.values(r.clearValues)[0]
      setState({ value: typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v), proof: r.decryptionProof })
    } catch (e) {
      setState({ err: e instanceof Error ? e.message.slice(0, 140) : 'Not decryptable yet' })
    }
  }
  return (
    <div className="border-2 border-[#111] p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{h.label}</span>
        {h.publicValue ? (
          <button className="border-2 border-[#111] bg-[#3DDC97] px-1.5 font-mono text-[10px] font-black disabled:opacity-50" disabled={state.busy} onClick={check}>
            {state.busy ? 'ASKING KMS…' : 'DECRYPT IT YOURSELF'}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--chm-dim)]">
            <Lock className="h-3 w-3" /> owner only
          </span>
        )}
      </div>
      <div className="mt-1 break-all font-mono text-[10px] text-[var(--chm-dim)]">{h.handle}</div>
      {state.value != null && (
        <div className="mt-1 font-mono text-[11px]">
          = <b>{state.value === 'true' ? (h.meaning?.[0] ?? 'true') : state.value === 'false' ? (h.meaning?.[1] ?? 'false') : state.value}</b>
          <div className="break-all text-[10px] text-[var(--chm-dim)]">KMS proof {state.proof?.slice(0, 42)}… ({((state.proof?.length ?? 2) - 2) / 2} bytes)</div>
        </div>
      )}
      {state.err && <div className="mt-1 text-[11px] text-[var(--chm-red)]">{state.err}</div>}
    </div>
  )
}

/** Small inline trigger. */
export function ProofButton({ spec, className, label = 'How was this decided?' }: { spec: ProofSpec; className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openProof(spec)
      }}
      className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold underline decoration-dotted underline-offset-2 hover:decoration-solid ${className ?? ''}`}
    >
      <ShieldCheck className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
