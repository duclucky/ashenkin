import { useState } from 'react'
import {
  Check,
  ChevronRight,
  Droplets,
  Egg,
  Swords,
  Sparkles,
} from 'lucide-react'
import { Link } from '../ui'
import { firstTarget } from './first-steps'
import { keeperGuideEnabled } from './keeper-story'
import { useFirstSteps } from './use-first-steps'
import './first-steps.css'
const ORDER = ['gas', 'hatch', 'fight', 'life'] as const
const STEPS = [
  { key: 'gas', label: 'Gas', Icon: Droplets },
  { key: 'hatch', label: 'Hatch', Icon: Egg },
  { key: 'fight', label: 'Fight', Icon: Swords },
  { key: 'life', label: 'Life', Icon: Sparkles },
]
const COPY = {
  gas: {
    title: 'Fuel your first adventure',
    line: 'Collect free Sepolia ETH for your first moves.',
    action: 'Get free gas',
  },
  hatch: {
    title: 'Bring your Xeno to life',
    line: 'Mint your NFT. Its true strength stays sealed.',
    action: 'Meet your first Xeno',
  },
  fight: {
    title: 'Answer the Colosseum',
    line: 'Choose three moves. A completed hunt counts, win or lose.',
    action: 'Enter your first hunt',
  },
  life: {
    title: 'A life beyond your screen',
    line: 'Your Xeno has daily encounters of its own. Meet it there.',
    action: 'Meet your living Xeno',
  },
  loading: {
    title: 'Finding your next step',
    line: 'Reading your account’s game record.',
    action: 'Visit the Lab',
  },
  recover: {
    title: 'Bring a Xeno home',
    line: 'Your collection is away. Recover a specimen to continue.',
    action: 'Open your collection',
  },
  complete: { title: '', line: '', action: '' },
}
export function FirstSteps({ page }: { page: string }) {
  const { stage, active, pending } = useFirstSteps()
  const [hidden, setHidden] = useState(() => !keeperGuideEnabled())
  if (!active) return null
  if (hidden)
    return (
      <button
        type="button"
        className="first-steps-show"
        onClick={() => {
          localStorage.setItem('chm:guide', 'on')
          setHidden(false)
        }}
      >
        Show first steps <ChevronRight size={14} />
      </button>
    )
  const copy = COPY[stage],
    index = ORDER.findIndex((s) => s === stage)
  const target = firstTarget(stage, pending)
  const atTarget = page === target.split('/')[0]
  return (
    <section className="first-steps" aria-label="Your first four steps">
      <div className="first-steps-top">
        <span>
          {index >= 0 ? `FIRST STEPS · ${index + 1}/4` : 'FIRST STEPS'}
        </span>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem('chm:guide', 'off')
            setHidden(true)
          }}
          aria-label="Hide first steps"
        >
          Hide
        </button>
      </div>
      <ol>
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            aria-current={stage === s.key ? 'step' : undefined}
            data-done={index > i}
          >
            <span>
              {index > i ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <s.Icon size={14} aria-hidden="true" />
              )}
            </span>
            <b>{s.label}</b>
          </li>
        ))}
      </ol>
      <div className="first-steps-next">
        <div>
          <h2>
            {pending && stage === 'fight'
              ? 'Finish your first hunt'
              : copy.title}
          </h2>
          <p>
            {pending && stage === 'fight'
              ? 'Your fight is waiting in the battle log.'
              : copy.line}
          </p>
        </div>
        {!atTarget && stage !== 'loading' && (
          <Link to={target} className="first-steps-action">
            {pending && stage === 'fight' ? 'Resume hunt' : copy.action}
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  )
}
