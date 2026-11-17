import { Location, LocationNotes } from '../game/Location'
import { ProofButton } from '../game/ProofDrawer'
import { useMemo, useState } from 'react'
import { Eye, KeyRound, Minus, Plus, Sparkles, Trophy, Hourglass, Lock } from 'lucide-react'
import { Addr, Button, Empty, Label, Panel, useAction, BusyNote } from '../ui'
import { DEPLOYED, useWallet } from '../chain'
import { labKey } from '../fhe'
import { fmtDuration, fmtZama, useLabKeyReady, useNow, useRefresh } from '../hooks'
import { GuestGate } from '../game/GuestGate'
import { GENES, GUESS_PRICE, loadGuess, oracleClaim, oracleExpire, oracleGuess, useHints, useMyGuesses, useOracle, useRevealedAnswers, type OGuess } from '../season'

const HINT = [
  { bg: '#d9d6cc', fg: '#555', label: 'far (3+ away)' },
  { bg: '#FFDD00', fg: '#111', label: 'close (±1–2)' },
  { bg: '#3DDC97', fg: '#111', label: 'exact' },
]

export default function Oracle() {
  const { account } = useWallet()
  const { busy, run, status } = useAction()
  const refresh = useRefresh()
  const now = useNow(1000)
  const o = useOracle()
  const mine = useMyGuesses(account)
  const keyReady = useLabKeyReady(account)
  const hints = useHints(mine.data?.guesses, account)
  const answers = useRevealedAnswers(o.data?.past)
  const [genes, setGenes] = useState([8, 8, 8, 8])
  const [flash, setFlash] = useState<number | null>(null)

  const round = o.data?.round
  const live = !!round && !round.ended
  const endsAt = round ? round.startedAt + (o.data?.roundLength ?? 0) : 0
  const expired = live && now >= endsAt
  const current = (mine.data?.guesses ?? []).filter((g) => round && g.round === round.id)
  const older = (mine.data?.guesses ?? []).filter((g) => !round || g.round !== round.id)
  const h = hints.data ?? {}

  // What's still possible for each gene, given every private hint you received this round.
  const candidates = useMemo(() => {
    return [0, 1, 2, 3].map((i) =>
      Array.from({ length: 16 }, (_, v) => v).filter((v) =>
        current.every((g) => {
          const mine = loadGuess(g.id)
          const hint = h[g.id]
          if (!mine || !hint) return true
          const d = Math.abs(v - mine[i])
          return hint[i] === 2 ? d === 0 : hint[i] === 1 ? d > 0 && d <= 2 : d > 2
        }),
      ),
    )
  }, [current, h])

  if (!DEPLOYED) return <Empty title="The Oracle wakes once the contracts are live" />

  const after = () => refresh('oracle', 'guesses', 'hints', 'balHandle', 'relics')

  async function submit() {
    if (!o.data || !mine.data || mine.data.left === 0 || expired || busy) return
    const r = await run('Ask the Oracle', (st) => oracleGuess(account!, genes, st), 'The Oracle answered')
    if (!r) return
    setFlash(r.guessId)
    after()
  }

  return (
    <div className="space-y-8">
      <Location place="oracle">
        <strong>{o.data?.pot == null ? 'Jackpot loading…' : `${fmtZama(o.data.pot)} cZAMA jackpot`}</strong>
        {live && <span>{expired ? 'Round ended' : `${fmtDuration(endsAt - now)} left`}</span>}
      </Location>

      {!account ? (
        <GuestGate place="oracle" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Panel className="p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="font-display text-2xl">Your guess</div>
                  <div className="text-sm text-[var(--chm-dim)]">Sealed in your browser before it leaves. The chain only ever sees ciphertext.</div>
                </div>
                <div className="font-mono text-xs font-black">
                  {mine.data ? `${mine.data.left}/${o.data?.daily ?? 6} guesses left today` : '…'}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {GENES.map((name, i) => (
                  <div key={name} className="border-[3px] border-[#111] bg-white p-3 text-center shadow-[4px_4px_0_#111]">
                    <div className="font-mono text-[11px] font-black uppercase text-[var(--chm-dim)]">{name}</div>
                    <div className="my-2 flex items-center justify-center gap-2">
                      <button className="border-2 border-[#111] bg-[var(--chm-gray)] p-1 hover:bg-[var(--chm-yellow)]" onClick={() => setGenes((g) => g.map((x, j) => (j === i ? (x + 15) % 16 : x)))} aria-label={`${name} down`}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-12 font-display text-4xl">{genes[i]}</span>
                      <button className="border-2 border-[#111] bg-[var(--chm-gray)] p-1 hover:bg-[var(--chm-yellow)]" onClick={() => setGenes((g) => g.map((x, j) => (j === i ? (x + 1) % 16 : x)))} aria-label={`${name} up`}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <input type="range" aria-label={`${name} gene value`} min={0} max={15} value={genes[i]} onChange={(e) => setGenes((g) => g.map((x, j) => (j === i ? Number(e.target.value) : x)))} className="w-full accent-[#111]" />
                    {current.length > 0 && keyReady && (
                      <div className="mt-2 flex flex-wrap justify-center gap-0.5">
                        {candidates[i].length === 16 ? (
                          <span className="font-mono text-[10px] text-[var(--chm-dim)]">any</span>
                        ) : (
                          candidates[i].map((v) => (
                            <button key={v} onClick={() => setGenes((g) => g.map((x, j) => (j === i ? v : x)))} className="min-w-5 border border-[#111] bg-[#e8fff4] px-0.5 font-mono text-[10px] font-black hover:bg-[#3DDC97]">
                              {v}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button variant="gold" onClick={submit} busy={busy === 'Ask the Oracle'} disabled={!!busy || !o.data || !mine.data || mine.data.left === 0 || expired}>
                  <Sparkles className="h-4 w-4" /> Ask the Oracle · {GUESS_PRICE} cZAMA
                </Button>
                {expired && (
                  <Button variant="ghost" disabled={!!busy} busy={busy === 'Close round'} onClick={() => run('Close round', (st) => oracleExpire(st), 'Round closed, answer revealed').then((r) => r && after())}>
                    Close the round and reveal its answer
                  </Button>
                )}
                <BusyNote status={busy === 'Ask the Oracle' ? status : null} />
              </div>
              {(o.isError || mine.isError) && <p className="mt-3 text-sm">Could not verify the round or your guess allowance. <button type="button" className="min-h-11 font-bold underline" onClick={() => { o.refetch(); mine.refetch() }}>Retry Oracle</button></p>}
              {current.length > 0 && keyReady && <p className="mt-3 text-xs text-[var(--chm-dim)]">The green chips under each gene are the values still possible given your private hints. Tap one to use it.</p>}
            </Panel>

            <div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <Label>Your board · round #{round?.id ?? '—'}</Label>
                {!keyReady && current.length > 0 && (
                  <Button variant="ghost" className="!py-1 text-xs" busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', () => labKey(account), 'Lab key unlocked')}>
                    <KeyRound className="h-3.5 w-3.5" /> Unlock your lab key to read hints
                  </Button>
                )}
              </div>
              {!current.length ? (
                <Empty title="No guesses this round">Your first guess shows up here, with hints only you can read.</Empty>
              ) : (
                <Panel className="divide-y divide-[var(--chm-line)]">
                  {current.map((g) => (
                    <GuessRow key={g.id} g={g} hint={h[g.id]} keyReady={keyReady} flash={flash === g.id} busy={busy} onClaim={() => run('Claim the jackpot', (st) => oracleClaim(g, st), 'Claim settled').then((r) => r && after())} />
                  ))}
                </Panel>
              )}
              {older.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer font-mono text-xs font-black uppercase text-[var(--chm-dim)]">Earlier rounds · {older.length} guesses</summary>
                  <Panel className="mt-2 divide-y divide-[var(--chm-line)]">
                    {older.map((g) => (
                      <GuessRow key={g.id} g={g} hint={h[g.id]} keyReady={keyReady} busy={busy} stale />
                    ))}
                  </Panel>
                </details>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <LocationNotes title="How the Oracle works">
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" /> The answer is rolled with encrypted randomness and never decrypted while the round is live.
                </li>
                <li className="flex gap-2">
                  <Eye className="mt-0.5 h-4 w-4 shrink-0" /> Hints are computed on ciphertext and only your key can open yours. Other keepers learn nothing from your guesses.
                </li>
                <li className="flex gap-2">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0" /> A win is a single public bit, checked with a Zama KMS proof. The first valid proof takes the pot.
                </li>
                <li className="flex gap-2">
                  <Hourglass className="mt-0.5 h-4 w-4 shrink-0" /> Unsolved after {Math.round((o.data?.roundLength ?? 259200) / 86400)} days? The answer is made public, the jackpot rolls over, and a new genome is sealed.
                </li>
              </ul>
            </LocationNotes>
            <Panel className="p-5">
              <Label className="mb-3">Past riddles</Label>
              {!o.data?.past.length ? (
                <div className="text-sm text-[var(--chm-dim)]">No round has ended yet.</div>
              ) : (
                <div className="space-y-3">
                  {o.data.past.map((r) => {
                    const a = answers.data?.[r.id]
                    return (
                      <div key={r.id} className="border-2 border-[#111] bg-white p-3">
                        <div className="flex justify-between font-mono text-xs font-black">
                          <span>round #{r.id}</span>
                          <span>{r.guesses} guesses</span>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className="flex h-9 w-9 items-center justify-center border-2 border-[#111] bg-[#3DDC97] font-display text-xl">
                              {a ? a[i] : '?'}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-xs text-[var(--chm-dim)]">
                          {r.solver && !/^0x0+$/.test(r.solver) ? (
                            <>
                              solved by <Addr a={r.solver} you={account} />
                            </>
                          ) : (
                            'unsolved, jackpot rolled over'
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function GuessRow({ g, hint, keyReady, flash, busy, stale, onClaim }: { g: OGuess; hint?: number[] | null; keyReady: boolean; flash?: boolean; busy: string | null; stale?: boolean; onClaim?: () => void }) {
  const vals = loadGuess(g.id)
  const perfect = !!hint && hint.every((x) => x === 2)
  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${flash ? 'chm-rise bg-[#fffbe0]' : ''}`}>
      <span className="w-12 font-mono text-xs text-[var(--chm-dim)]">#{g.id}</span>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => {
          const c = hint ? HINT[hint[i]] : null
          return (
            <span key={i} title={c?.label} className={`flex h-11 w-11 items-center justify-center border-[3px] border-[#111] font-display text-2xl ${flash ? 'chm-g-fadein' : ''}`} style={{ background: c?.bg ?? '#fff', color: c?.fg ?? '#111', animationDelay: `${i * 120}ms` }}>
              {vals ? vals[i] : '·'}
            </span>
          )
        })}
      </div>
      <span className="min-w-0 flex-1 font-mono text-[11px] text-[var(--chm-dim)]">
        {hint === null ? 'fee did not arrive: no hint' : !keyReady ? 'hint sealed: unlock your key' : hint === undefined ? 'decrypting…' : perfect ? 'PERFECT: claim it before anyone else' : `${hint.filter((x) => x === 2).length} exact · ${hint.filter((x) => x === 1).length} close`}
        {!vals && ' · guessed on another device'}
      </span>
      {g.finalized ? (
        <span className="font-mono text-xs font-black" style={{ color: g.won ? 'var(--chm-teal)' : 'var(--chm-dim)' }}>
          {g.won ? 'JACKPOT WON' : 'claim rejected'}
        </span>
      ) : null}
      <ProofButton spec={{ mode: 'oracle', id: g.id, title: `Riddle guess #${g.id}` }} label="proof" className="text-[var(--chm-dim)]" />
      {g.finalized ? null : (perfect || g.claimed) && !stale && onClaim ? (
        <Button variant="gold" className="!py-1 text-xs" disabled={!!busy} busy={busy === 'Claim the jackpot'} onClick={onClaim}>
          <Trophy className="h-3.5 w-3.5" /> {g.claimed ? 'Finish claim' : 'Claim jackpot'}
        </Button>
      ) : null}
    </div>
  )
}
