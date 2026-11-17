import { ArrowRight } from 'lucide-react'
import { GAS_FAUCET } from '../chain'
import { Button, Link } from '../ui'
import { Px } from './art'
import { PROF, PROF_PAL } from './map-art'
import { keeperChapter, type KeeperProgress } from './keeper-story'

const MISSIONS = {
  prologue: { title: 'Practice with Lumen', line: 'Tap the glowing Colosseum or start a free three-round match here.', route: 'arena', action: 'Start practice' },
  beacon: { title: 'Investigate the beacon', line: 'A bell rang beyond the walls. Scout Ashen Dunes with Sable.', route: 'journal', action: 'Open the Journal' },
  connect: { title: 'Connect your wallet', line: 'Open the Lab and connect on Sepolia to hatch a specimen of your own.', route: 'lab', action: 'Visit the Lab' },
  gas: { title: 'Get Sepolia ETH', line: 'Use test ETH to pay network fees for hatching and wild hunts.', route: 'lab', action: 'Visit the Lab' },
  hatch: { title: 'Hatch your first specimen', line: 'Tap the glowing Lab and choose Hatch embryo. The vault rolls its genes in secret.', route: 'lab', action: 'Visit the Lab' },
  fight: { title: 'Enter your first wild hunt', line: 'Choose three moves. Win two rounds to capture your rival. Your champion gains XP either way.', route: 'arena', action: 'Enter the Colosseum' },
  settle: { title: 'Finish your hunt', line: 'Open the battle log to collect your result.', route: 'arena', action: 'Open the battle log' },
  sequence: { title: 'Reading the dark', line: 'Read one combat gene in your specimen’s file. Spend one Lab energy to see both alleles. Decide if this is the line you want to train or breed.', route: 'creature', action: 'Inspect your specimen' },
  dispatch: { title: 'Beyond the gate', line: 'Send a specimen to Ashen Dunes for XP and loot. Bring it home when it returns.', route: 'expeditions', action: 'Choose an expedition' },
  away: { title: 'A light at the gate', line: 'Your specimen is in the field. Come back to the gate when the timer ends to collect its XP and read its report.', route: 'expeditions', action: 'Check the expedition' },
  return: { title: 'Bring them home', line: 'Your specimen is back at camp. Claim its return to recover it and see what the Treasury paid.', route: 'expeditions', action: 'Bring it home' },
  choose: { title: 'Choose your line', line: 'Train your champion with XP and cZAMA, or breed a new line to restore the vault’s rare traits. Return to the Colosseum with a stronger team.', route: 'training', action: 'Go to the Dojo' },
  recover: { title: 'An empty habitat', line: 'You have used your free embryos. Check any specimens held at the Market or Colosseum, or find one for sale.', route: 'market', action: 'Open the Market' },
  loading: { title: 'The vault is checking your record', line: 'You can visit the Lab while your campaign progress loads.', route: 'lab', action: 'Visit the Lab' },
} as const

export function keeperMission(progress: KeeperProgress) {
  const chapter = keeperChapter(progress)
  const mission = MISSIONS[chapter]
  let target: string = mission.route
  if (chapter === 'sequence') target = `creature/${progress.specimens![0]}/genome`
  if (chapter === 'prologue') target = 'arena/trial/start'
  if (chapter === 'settle') target = 'arena/log'
  const setup = chapter === 'connect' || (chapter === 'gas' && progress.fights === 0 && progress.genesis === 0)
  const firstHunt = chapter === 'fight' || (chapter === 'settle' && progress.fights === 0)
  const step = chapter === 'prologue' ? 1 : setup ? 2 : chapter === 'hatch' ? 3 : firstHunt ? 4 : null
  const landmark = mission.route === 'creature' ? 'lab' : mission.route === 'journal' ? null : mission.route
  return { chapter, mission, target, landmark, step }
}

export function KeeperBriefing({ quest, hide, enter }: {
  quest: ReturnType<typeof keeperMission>
  hide: () => void
  enter: (route: string) => void
}) {
  const { chapter, mission, target, step } = quest
  return (
    <section className="chm-briefing" aria-label="Keeper mission">
      <div className="chm-briefing-head">
        <div className="chm-lumen-portrait" aria-hidden="true"><Px rows={PROF} pal={PROF_PAL} /></div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p>{step ? `Starter quest ${step} of 4` : 'Professor Lumen'}</p>
          <h2 id="keeper-mission-title" className="font-display">{mission.title}</h2>
        </div>
        <button type="button" onClick={hide} className="min-h-11 px-1 text-xs font-bold underline" aria-label="Hide the guide">Hide</button>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{mission.line}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {chapter === 'gas' && <a href={GAS_FAUCET} target="_blank" rel="noreferrer" className="chm-btn chm-btn-primary chm-quest-target">Get Sepolia ETH</a>}
        <Button variant={chapter === 'gas' ? 'ghost' : 'primary'} className={step && chapter !== 'gas' ? 'chm-quest-target' : ''} onClick={() => enter(target)}>{mission.action}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
        {chapter === 'choose' && <Link to="breed" className="text-sm font-bold underline">Visit the Nursery</Link>}
        {chapter !== 'beacon' && <Link to={step ? 'guide' : 'journal'} className="inline-flex min-h-11 items-center text-xs font-semibold underline">{step ? 'How to play' : 'Follow the story'}</Link>}
      </div>
    </section>
  )
}
