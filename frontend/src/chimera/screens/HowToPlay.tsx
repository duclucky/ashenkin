import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { PxIcon, type PxIconName } from '../game/hud'
import { Location, LocationNotes } from '../game/Location'
import { Link } from '../ui'
import { useWallet } from '../chain'

const textLink = 'inline-flex min-h-11 items-center font-bold underline underline-offset-4'

function GuideStep({ icon, title, to, action, primary = false, children }: {
  icon: PxIconName
  title: string
  to: string
  action: string
  primary?: boolean
  children: ReactNode
}) {
  return (
    <li role="listitem" className="chm-panel grid grid-cols-[32px_minmax(0,1fr)] gap-3 p-3">
      <span className="grid h-8 w-8 place-items-center border border-[var(--chm-line)] bg-[var(--chm-yellow-soft)]" aria-hidden="true">
        <PxIcon name={icon} size={20} />
      </span>
      <div className="min-w-0 space-y-2">
        <h3 className="font-display text-lg">{title}</h3>
        <div className="space-y-2 text-sm leading-relaxed">{children}</div>
        <Link to={to} className={primary ? 'chm-btn chm-btn-primary' : textLink}>
          {action}<ArrowRight className="ml-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </li>
  )
}

export default function HowToPlay() {
  const { keeper } = useWallet()
  return (
    <div className="space-y-5">
      <Location place="guide" />

      <section aria-labelledby="first-hunt-title" className="space-y-3">
        <h2 id="first-hunt-title" className="font-display text-xl">Your first hunt</h2>
        <ol className="grid gap-3" role="list">
          <GuideStep icon="egg" title="Hatch your first specimen" to="lab" action="Go to the Lab" primary>
            <p>{keeper?.enabled ? 'Sign in to your Ashenkin account, then mint a starter NFT in the Lab.' : 'Visit the Lab to mint your starter NFT.'} {keeper?.sponsored && 'The Lab covers your first mint.'}</p>
          </GuideStep>
          <GuideStep icon="sword" title="Learn the three moves" to="arena/trial/start" action="Practice with Lumen">
            <p>Bring your NFT into a free practice match in the Colosseum.</p>
            <p><strong>Guard</strong> beats Strike. <strong>Feint</strong> beats Guard. <strong>Strike</strong> beats Feint.</p>
          </GuideStep>
          <GuideStep icon="flag" title="Investigate the beacon" to="journal" action="Open the Journal">
            <p>After practice, scout Ashen Dunes and restore the silent beacon with your specimen.</p>
          </GuideStep>
          <GuideStep icon="paw" title="Capture a wild specimen" to="arena" action="Enter the Colosseum">
            <p>Choose a champion and three moves, then win two rounds to capture the wild specimen. Sepolia actions use test ETH from your wallet when they are not sponsored.</p>
            <p>You can resume a pending fight from your <Link to="arena/log" className="font-bold underline underline-offset-4">Battle log</Link>.</p>
          </GuideStep>
        </ol>
      </section>

      <section aria-labelledby="keeper-guide-title" className="space-y-2">
        <h2 id="keeper-guide-title" className="font-display text-xl">Next steps</h2>
        <LocationNotes title="Earn cZAMA and train">
          <p>Check in at the Quest Board and claim completed tasks for cZAMA. Send a specimen on an expedition, then return to the gate to claim its XP and payout. The Dojo uses XP and cZAMA to train specimens.</p>
          <div className="flex flex-wrap gap-x-4">
            <Link to="quests" className={textLink}>Quest Board</Link>
            <Link to="expeditions" className={textLink}>Expedition Gate</Link>
            <Link to="training" className={textLink}>Dojo</Link>
          </div>
        </LocationNotes>
        <LocationNotes title="Sequence genes and breed">
          <p>Open a specimen in the Lab and spend Lab energy to sequence a gene. Unlock your Lab key to read private alleles. In the Nursery, choose two eligible parents, review the fee and breed. Both parents stay in your collection.</p>
          <Link to="breed" className={textLink}>Go to the Nursery</Link>
        </LocationNotes>
        <LocationNotes title="A life while you’re away">
          <p>Your NFT automatically takes part in one daily encounter. Zama randomizes the challenge; FHE checks its hidden strength. Win to find materials or a cosmetic. Losing takes nothing away. No delegation, player gas or wallet signature is needed.</p>
          <p>Open Living Xenos to watch recorded stories, inspect proofs and use its field bag. The game sponsors trials within its available daily budget.</p>
          <Link to="life" className={textLink}>Meet your living Xenos</Link>
        </LocationNotes>
        <LocationNotes title="How hidden genes and battles work">
          <p>Genes and battle plans stay hidden. Zama supplies the rolls. Choose <strong>Verify the rounds</strong> on a battle result to check each winner without signing.</p>
          <Link to="fairness" className={textLink}>Open the Proof Center</Link>
        </LocationNotes>
      </section>
    </div>
  )
}
