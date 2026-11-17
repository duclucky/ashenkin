import { Location } from '../game/Location'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { Search, ExternalLink } from 'lucide-react'
import { ARENA, ASCENSION, COLOSSEUM, CZAMA, DEPLOYED, DEPTHS, EXPEDITIONS, LAB, MARKET, ORACLE, QUESTS, RAFFLE, RAID, RELICS, SEASON, TRAINING, TREASURY, addrUrl, short } from '../chain'
import { Button, Empty, Label, Link, Panel } from '../ui'
import { MODES, latestDepthRecord, openProof, type ModeKey } from '../proof'
import { ProofButton } from '../game/ProofDrawer'
import { roundBits, useTBattles } from '../season'

const CONTRACTS: [string, () => Address, string][] = [
  ['Lab', () => LAB, 'Genomes, hatching, breeding'],
  ['Colosseum', () => COLOSSEUM, 'Blind Tactics fights'],
  ['Relics', () => RELICS, 'Caches, fusion, sockets'],
  ['Oracle', () => ORACLE, 'The genome riddle and jackpot'],
  ['Raffle', () => RAFFLE, 'Sealed tickets, encrypted leader'],
  ['Depths', () => DEPTHS, 'Sealed doors, health and loot'],
  ['Season', () => SEASON, 'Thrones and season prizes'],
  ['Ascension', () => ASCENSION, 'Sacrifice altar for XP'],
  ['Training', () => TRAINING, 'Levels, hidden power, XP cap'],
  ['Raid', () => RAID, 'World Boss'],
  ['Expeditions', () => EXPEDITIONS, 'Sealed loot runs'],
  ['Market', () => MARKET, 'Creature trading'],
  ['Quests', () => QUESTS, 'Daily tasks and streaks'],
  ['Treasury', () => TREASURY, 'Encrypted reserve'],
  ['cZAMA', () => CZAMA as Address, 'Confidential token (ERC-7984)'],
  ['Arena (season 1)', () => ARENA, 'Legacy, recall only'],
]

const LOOKUP: { mode: ModeKey; label: string; hint: string }[] = [
  { mode: 'tactics', label: 'Fight', hint: 'battle #' },
  { mode: 'depths', label: 'Dive', hint: 'dive #' },
  { mode: 'relics', label: 'Relic', hint: 'relic #' },
  { mode: 'oracle', label: 'Riddle guess', hint: 'guess #' },
]

export default function Fairness() {
  const battles = useTBattles(8)
  const depth = useQuery({ queryKey: ['latestDepthRecord'], queryFn: latestDepthRecord, enabled: DEPLOYED && !/^0x0+$/.test(DEPTHS), staleTime: 60_000 })
  const [mode, setMode] = useState<ModeKey>('tactics')
  const [id, setId] = useState('')
  if (!DEPLOYED) return <Empty title="The Proof Center opens once the contracts are live" />
  const settledFight = battles.data?.find((battle) => battle.status === 2)

  return (
    <div className="space-y-6 sm:space-y-10">
      <Location place="fairness" actions={<>
        {settledFight && <ProofButton spec={{ mode: 'tactics', id: settledFight.id, title: `Fight #${settledFight.id}` }} label="Verify a settled Sepolia fight" className="chm-btn chm-btn-primary !text-[#111]" />}
        {depth.data && <ProofButton spec={{ mode: 'depths', id: depth.data.id, title: `Dive #${depth.data.id}` }} label="Verify a Sepolia dive" className="chm-btn chm-btn-ghost !bg-white !text-[#111]" />}
      </>} />

      <details className="chm-panel px-4">
        <summary className="min-h-11 cursor-pointer py-3 font-bold">How a Zama proof works</summary>
        <ol className="list-decimal space-y-2 border-t-2 border-[#111] py-3 pl-5 text-sm leading-relaxed">
          <li>The browser encrypts moves and guesses before sending them.</li>
          <li>The contract computes scores and generates randomness on encrypted data.</li>
          <li>The contract marks the values needed for settlement as public. Zama KMS decrypts and signs those values.</li>
          <li>The settlement transaction checks the KMS signature on-chain before accepting the result.</li>
        </ol>
      </details>

      <section>
        <h2 className="font-display text-2xl sm:text-3xl">What each mode reveals</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {MODES.map((mode) => (
            <article key={mode.key} className="chm-panel min-w-0 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base"><Link to={mode.place} className="underline underline-offset-4">{mode.name}</Link></h3>
                <ProofButton spec={{ mode: mode.key }} label="View proof details" />
              </div>
              <dl className="mt-3 grid gap-2 text-sm leading-relaxed">
                <div><dt className="font-bold">Encrypted</dt><dd>{mode.sealed.join(' · ')}</dd></div>
                <div><dt className="font-bold">Public</dt><dd>{mode.revealed}</dd></div>
              </dl>
              <details className="mt-3 border-t border-[#b9b4a6] text-sm leading-relaxed">
                <summary className="min-h-11 cursor-pointer py-3 font-bold">Randomness and privacy</summary>
                <p>{mode.randomness}</p>
                <p className="mt-2 text-[var(--chm-dim)]">{mode.ifPublic}</p>
              </details>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        {/* real results */}
        <section>
          <Label>Check a real result</Label>
          <h2 className="mt-1 font-display text-3xl">Latest Colosseum fights</h2>
          <Panel className="mt-4 divide-y-2 divide-[#111] p-0">
            {battles.isLoading && <div className="chm-flicker p-4 text-sm">Reading the Colosseum…</div>}
            {battles.data?.length === 0 && <div className="p-4 text-sm text-[var(--chm-dim)]">No fights yet.</div>}
            {battles.data?.map((b) => {
              const won = b.challengerWon
              const settled = b.status === 2
              const took = roundBits(b.rounds).filter(Boolean).length
              const score = settled ? `${took}–${3 - took}` : null
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="w-14 font-mono text-xs font-black">#{b.id}</span>
                  <span className="min-w-0 flex-1">
                    <b>#{b.challengerId}</b> vs {b.kind === 0 ? 'wild' : 'defender'} <b>#{b.opponentId}</b>
                    <span className="ml-2 font-mono text-[11px] text-[var(--chm-dim)]">{short(b.challenger)}</span>
                  </span>
                  <span className="font-mono text-xs font-bold" style={{ color: !settled ? 'var(--chm-dim)' : won ? '#1FA46A' : 'var(--chm-red)' }}>
                    {!settled ? 'awaiting reveal' : `${won ? 'challenger won' : 'challenger lost'} ${score}`}
                  </span>
                  <ProofButton spec={{ mode: 'tactics', id: b.id, title: `Fight #${b.id}`, result: settled ? `${b.kind === 0 ? 'Wild hunt' : 'Duel'} · challenger ${won ? 'won' : 'lost'} ${score}` : 'Not revealed yet' }} label="Proof" />
                </div>
              )
            })}
          </Panel>
        </section>

        <aside className="space-y-6">
          <Panel className="p-5">
            <Label>Look up any result</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {LOOKUP.map((l) => (
                <button key={l.mode} onClick={() => setMode(l.mode)} className={`border-[3px] border-[#111] px-2 py-1 font-mono text-xs font-bold ${mode === l.mode ? 'bg-[var(--chm-yellow)]' : 'bg-white'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (Number(id) > 0) openProof({ mode, id: Number(id), title: `${LOOKUP.find((l) => l.mode === mode)!.label} #${id}` })
              }}
            >
              <input className="chm-input min-w-0" aria-label={LOOKUP.find((l) => l.mode === mode)!.hint} inputMode="numeric" placeholder={LOOKUP.find((l) => l.mode === mode)!.hint} value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} />
              <Button type="submit">
                <Search className="h-4 w-4" /> Trace
              </Button>
            </form>
            <p className="mt-2 text-xs text-[var(--chm-dim)]">Shows the transactions behind it, the ciphertext handles, and lets you ask the Zama KMS to decrypt any public bit yourself.</p>
          </Panel>

          <Panel className="p-5">
            <Label>The contracts (Sepolia)</Label>
            <ul className="mt-3 space-y-1.5 text-sm">
              {CONTRACTS.map(([n, a, d]) => (
                <li key={n} className="flex items-baseline justify-between gap-2">
                  <span>
                    <b>{n}</b> <span className="text-xs text-[var(--chm-dim)]">{d}</span>
                  </span>
                  <a href={addrUrl(a())} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-mono text-xs underline">
                    {short(a())} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-5 text-sm">
            <Label>Honest notes</Label>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[var(--chm-dim)]">
              <li>The Wishing Well hands out free test cZAMA so anyone can play. It would be switched off on mainnet.</li>
              <li>Totals (jackpot, caches opened, levels) are public on purpose: the world is transparent, each keeper is private.</li>
              <li>
                Want to audit a creature’s genome? Use the <Link to="verify" className="underline">Verifier</Link>.
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
