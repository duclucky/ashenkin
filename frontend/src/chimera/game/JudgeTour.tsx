import { useEffect, useState, useSyncExternalStore } from 'react'
import { Gavel, ChevronDown, ChevronUp, X, Check, ArrowRight } from 'lucide-react'
import { useWallet } from '../chain'
import { useBalance, useEthBalance, useMyCreatures } from '../hooks'
import { useMyGuesses, useMyRelics, useTStats } from '../season'
import { useProofSpec } from '../proof'
import { go, useRoute } from '../ui'
import { travel } from './Transition'

/* Judge mode: a 3-minute guided loop through every place FHE matters, with live progress from the chain. */

const KEY = 'chm:judge'
const subs = new Set<() => void>()
const read = () => localStorage.getItem(KEY) === '1'
export function setJudge(on: boolean) {
  localStorage.setItem(KEY, on ? '1' : '0')
  subs.forEach((f) => f())
}
export const useJudge = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), read)

const flag = (k: string) => localStorage.getItem(`chm:judge:${k}`) === '1'
const setFlag = (k: string) => localStorage.setItem(`chm:judge:${k}`, '1')

type StepDef = { key: string; title: string; hidden: string; route: string; place: string; cta: string }
const STEPS: StepDef[] = [
  { key: 'wallet', title: 'Connect a wallet with Sepolia ETH', hidden: 'Every move is a real Sepolia transaction. Grab free test ETH if the top bar says "No gas".', route: 'map', place: 'WORLD MAP', cta: 'Connect in the top bar' },
  { key: 'czama', title: 'Draw 1,000 cZAMA at the Wishing Well', hidden: 'cZAMA is an ERC-7984 confidential token: the chain stores only a ciphertext of your balance.', route: 'map', place: 'WORLD MAP', cta: 'Find the Wishing Well on the map' },
  { key: 'key', title: 'Unlock your lab key', hidden: 'One signature lets your browser ask the Zama KMS to re-encrypt your own data for you. Nobody else can read it.', route: 'map', place: 'WORLD MAP', cta: 'Unlock key in the top bar' },
  { key: 'hatch', title: 'Hatch a creature in the Lab', hidden: 'Genes are rolled with encrypted randomness. Only you can read the genome; others see a sealed sprite.', route: 'lab', place: 'LAB', cta: 'Go to the Lab' },
  { key: 'relic', title: 'Open a Relic Cache', hidden: 'Odds are public, your roll is private. Pity is an encrypted counter, so nobody can time the drop.', route: 'relics', place: 'RELIC FORGE', cta: 'Go to the Forge' },
  { key: 'fight', title: 'Fight in the Colosseum', hidden: 'Pick 3 moves that stay encrypted. The contract scores them blind; only the round winners are revealed.', route: 'arena', place: 'COLOSSEUM', cta: 'Go to the Colosseum' },
  { key: 'riddle', title: "Guess the Oracle's genome", hidden: 'Your guess is encrypted. The hint comes back privately; a perfect guess is proven with a KMS signature.', route: 'oracle', place: 'ORACLE', cta: 'Go to the Oracle' },
  { key: 'proof', title: 'Open "How was this decided?"', hidden: 'Every result links to its transactions and ciphertext handles. Decrypt the public ones yourself.', route: 'fairness', place: 'PROOF CENTER', cta: 'Go to the Proof Center' },
  { key: 'economy', title: 'Check the closed economy', hidden: 'Fees flow to the Treasury and Boss pot; the reserve is encrypted but publicly decryptable on demand.', route: 'economy', place: 'TREASURY', cta: 'Go to the Treasury' },
]

export function JudgeButton({ className = '' }: { className?: string }) {
  const on = useJudge()
  return (
    <button
      onClick={() => setJudge(!on)}
      aria-pressed={on}
      className={`flex min-h-11 items-center gap-3 border-[3px] border-[#111] px-4 py-3 text-left text-sm font-bold shadow-[4px_4px_0_#111] ${on ? 'bg-[#FFD209]' : 'bg-white hover:bg-[#FFD209]'} ${className}`}
    >
      <Gavel className="h-5 w-5 shrink-0" />
      <span className="flex-1">
        Judge Mode
        <span className="mt-0.5 block text-xs font-normal text-[var(--chm-dim)]">{on ? 'Checklist is on' : 'Follow the on-chain demo checklist'}</span>
      </span>
    </button>
  )
}

/** Floating checklist, shown on every page while judge mode is on. */
export function JudgePanel() {
  const on = useJudge()
  if (!on) return null
  return <Panel />
}

function Panel() {
  const { account } = useWallet()
  const [page] = useRoute()
  const eth = useEthBalance(account)
  const bal = useBalance(account)
  const mine = useMyCreatures(account)
  const relics = useMyRelics(account)
  const ts = useTStats(account)
  const guesses = useMyGuesses(account)
  const proof = useProofSpec()
  const [min, setMin] = useState(true)
  const [, bump] = useState(0)
  useEffect(() => {
    if (proof) setFlag('proof')
    if (page === 'economy') setFlag('economy')
    bump((x) => x + 1)
  }, [proof, page])

  const done: Record<string, boolean> = {
    wallet: !!account && (eth ?? 0n) > 0n,
    czama: !!bal.handle && !/^0x0*$/.test(bal.handle),
    key: !!bal.keyReady,
    hatch: (mine.data?.length ?? 0) > 0,
    relic: (relics.data?.length ?? 0) > 0,
    fight: !!ts.data && ts.data.wins + ts.data.losses > 0,
    riddle: (guesses.data?.guesses.length ?? 0) > 0,
    proof: flag('proof'),
    economy: flag('economy'),
  }
  const n = STEPS.filter((s) => done[s.key]).length
  const next = STEPS.find((s) => !done[s.key])

  return (
    <div className="chm-judge-panel fixed bottom-3 left-3 z-50 w-[min(340px,calc(100cqw-24px))] border-[3px] border-[#111] bg-[#F4F4F4] shadow-[5px_5px_0_#111]" role="complementary" aria-label="Judge mode">
      <div className="flex items-center gap-2 bg-[#111] px-3 py-2 text-[#F4F4F4]">
        <Gavel className="h-4 w-4 text-[#FFD209]" />
        <span className="font-pixel text-[9px] text-[#FFD209]">JUDGE MODE</span>
        <span className="font-mono text-xs">
          {n}/{STEPS.length}
        </span>
        <div className="ml-1 h-2 flex-1 border border-[#F4F4F4]">
          <div className="h-full bg-[#3DDC97]" style={{ width: `${(n / STEPS.length) * 100}%` }} />
        </div>
        <button className="grid min-h-11 min-w-11 place-items-center" onClick={() => setMin(!min)} aria-expanded={!min} aria-label={min ? 'Expand checklist' : 'Collapse checklist'}>
          {min ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button className="grid min-h-11 min-w-11 place-items-center" onClick={() => setJudge(false)} aria-label="Close judge mode">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!min && (
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {next ? (
            <div className="mb-3 border-[3px] border-[#111] bg-[#FFD209] p-3">
              <div className="font-mono text-[10px] font-black uppercase tracking-widest">Next · {next.place}</div>
              <div className="mt-1 font-bold">{next.title}</div>
              <div className="mt-1 text-xs">{next.hidden}</div>
              <button
                className="mt-2 inline-flex items-center gap-1 border-2 border-[#111] bg-white px-2 py-1 text-xs font-bold shadow-[2px_2px_0_#111]"
                onClick={() => (next.route === page ? document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' }) : next.route === 'map' ? travel('map') : go(next.route))}
              >
                {next.cta} <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="mb-3 border-[3px] border-[#111] bg-[#3DDC97] p-3 text-sm font-bold">Tour complete. Every secret you touched stayed encrypted onchain, and every result had a proof.</div>
          )}
          <ol className="space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button className={`flex w-full items-center gap-2 px-1 py-0.5 text-left text-xs ${s === next ? 'font-bold' : ''}`} onClick={() => (s.route === 'map' ? travel('map') : go(s.route))} title={s.hidden}>
                  <span className={`grid h-4 w-4 shrink-0 place-items-center border-2 border-[#111] ${done[s.key] ? 'bg-[#3DDC97]' : 'bg-white'}`}>{done[s.key] ? <Check className="h-3 w-3" /> : <span className="font-mono text-[8px]">{i + 1}</span>}</span>
                  <span className={done[s.key] ? 'text-[var(--chm-dim)] line-through' : ''}>{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
