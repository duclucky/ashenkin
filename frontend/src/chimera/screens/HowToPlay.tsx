import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { PxIcon, type PxIconName } from '../game/hud'
import { Location, LocationNotes } from '../game/Location'
import { Link } from '../ui'

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
  return (
    <div className="space-y-5">
      <Location place="guide" />

      <section aria-labelledby="first-hunt-title" className="space-y-3">
        <h2 id="first-hunt-title" className="font-display text-xl">Your first four steps</h2>
        <ol className="grid gap-3" role="list">
          <GuideStep icon="coin" title="Sign in and get gas" to="lab/gas" action="Start at the Lab" primary>
            <p>Sign in with a wallet or email. Ashenkin links that identity to a Circle-managed game wallet, so you can return to the same collection.</p>
            <p>If needed, request 0.002 Sepolia ETH once every 24 hours. This test gas pays blockchain fees; it is separate from cZAMA and game items.</p>
          </GuideStep>
          <GuideStep icon="egg" title="Mint your first NFT" to="lab" action="Hatch a Xeno">
            <p>Mint a starter NFT before entering game activities. Minting is on Sepolia and uses gas from your game wallet; hosted actions are signed through Circle without a browser-wallet popup for every move.</p>
          </GuideStep>
          <GuideStep icon="sword" title="Complete your first hunt" to="arena" action="Enter the Colosseum">
            <p>Choose a champion, three moves and Start a hunt. Your ordinary encounter has its own opponent. Winning two rounds captures that NFT; win or lose, a settled hunt completes this first step.</p>
            <p>Rare sightings are optional shared captures: two or more visible Rare/Mythic traits, one specimen and one winner. They do not block ordinary hunts.</p>
            <p>Resume unfinished hunts from the <Link to="arena/log" className="font-bold underline underline-offset-4">Battle log</Link>. Local practice is optional after you own an NFT; it uses no encryption, gas or rewards.</p>
          </GuideStep>
          <GuideStep icon="paw" title="Meet your living Xeno" to="life" action="Open Living Xenos">
            <p>Your NFT can face one sponsored challenge per UTC day while you are offline. Zama randomness creates the encounter; FHE checks hidden strength. Wins bring items, losses take nothing.</p>
            <p>Replay stories, verify outcomes and inspect the field bag. Trials depend on eligibility, verified chain results and available sponsorship.</p>
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
        <LocationNotes title="Practice and explore the story">
          <p>With an NFT, learn Guard → Strike, Feint → Guard and Strike → Feint in Lumen’s local practice. The Silent Beacon is an optional story in the Journal.</p>
          <div className="flex flex-wrap gap-x-4"><Link to="arena/trial/start" className={textLink}>Practice with Lumen</Link><Link to="journal" className={textLink}>The Silent Beacon</Link></div>
        </LocationNotes>
        <LocationNotes title="Sequence genes and breed">
          <p>Open a specimen in the Lab and spend Lab energy to sequence a gene. Unlock your Lab key to read private alleles. In the Nursery, choose two eligible parents, review the fee and breed. Both parents stay in your collection.</p>
          <Link to="breed" className={textLink}>Go to the Nursery</Link>
        </LocationNotes>
        <LocationNotes title="A life while you’re away">
          <p>Your NFT automatically takes part in one daily encounter. Zama randomizes the challenge; FHE checks its hidden strength. Win to find materials or a cosmetic. Losing takes nothing away. No delegation, player gas or wallet signature is needed.</p>
          <p>Craft its first Trail lantern with 3 Ash thread, or 1 Ash thread + 1 Archive fragment. Choose the recipe yourself. This cosmetic has no combat bonus and does not unlock Depths doors.</p>
          <Link to="life" className={textLink}>Meet your living Xenos</Link>
        </LocationNotes>
        <LocationNotes title="How hidden genes and battles work">
          <p>Hidden alleles and combat plans are encrypted. Appearance and ownership are public; owners can deliberately publish a full genome. Zama supplies onchain rolls. Choose <strong>Verify the rounds</strong> on a battle result to check each winner without signing.</p>
          <Link to="fairness" className={textLink}>Open the Proof Center</Link>
        </LocationNotes>
      </section>
    </div>
  )
}
