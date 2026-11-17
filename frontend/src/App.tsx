import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Wallet, KeyRound, Droplets, AlertTriangle, Menu, X, Flame, Music, Music2, Fuel, ChevronDown, LogOut } from 'lucide-react'
import { PxIcon, type PxIconName } from './chimera/game/hud'
import { CHIMERA_CSS } from './chimera/styles'
import { DEPLOYED, connect, disconnect, short, useWallet, wireWallet, CHAIN_ID, ensureChain, errorText, GAS_FAUCET } from './chimera/chain'
import { hasNativePageTransition, useRoute, Link, Toasts, Button, toast, useAction } from './chimera/ui'
import { useBalance, fmtZama, useRefresh, useQuests, useEthBalance } from './chimera/hooks'
import { getFhe, labKey } from './chimera/fhe'
import { faucet, FAUCET_AMOUNT } from './chimera/actions'
import WorldMap from './chimera/screens/WorldMap'
import { ProofDrawer } from './chimera/game/ProofDrawer'
import { InboxButton } from './chimera/game/Inbox'
import { JudgePanel, setJudge } from './chimera/game/JudgeTour'
import { GameStage } from './chimera/game/Stage'
import { travel } from './chimera/game/Transition'
import { sfx, unlockAudio, resumeMusic, setTrack, isMusicOn, setMusic, onMusic } from './chimera/game/sfx'
import { getSceneOpen } from './chimera/game/store'
import { TOURNAMENT } from './chimera/tournament'

const About = lazy(() => import('./chimera/screens/Landing'))
const HowToPlay = lazy(() => import('./chimera/screens/HowToPlay'))
const Lab = lazy(() => import('./chimera/screens/Lab'))
const CreatureDetail = lazy(() => import('./chimera/screens/CreatureDetail'))
const Breed = lazy(() => import('./chimera/screens/Breed'))
const Arena = lazy(() => import('./chimera/screens/Arena'))
const Tournament = lazy(() => import('./chimera/screens/Tournament'))
const Market = lazy(() => import('./chimera/screens/Market'))
const Verify = lazy(() => import('./chimera/screens/Verify'))
const Journal = lazy(() => import('./chimera/screens/Journal'))
const WorldLore = lazy(() => import('./chimera/screens/WorldLore'))
const Expeditions = lazy(() => import('./chimera/screens/Expeditions'))
const Raid = lazy(() => import('./chimera/screens/Raid'))
const Quests = lazy(() => import('./chimera/screens/Quests'))
const Economy = lazy(() => import('./chimera/screens/Economy'))
const Training = lazy(() => import('./chimera/screens/Training'))
const Hall = lazy(() => import('./chimera/screens/Hall'))
const Relics = lazy(() => import('./chimera/screens/Relics'))
const Oracle = lazy(() => import('./chimera/screens/Oracle'))
const Raffle = lazy(() => import('./chimera/screens/Raffle'))
const Depths = lazy(() => import('./chimera/screens/Depths'))
const Fairness = lazy(() => import('./chimera/screens/Fairness'))

const NAV = [
  ['map', 'Map'],
  ['lab', 'Lab'],
  ['breed', 'Breed'],
  ['arena', 'Colosseum'],
  ['expeditions', 'Expeditions'],
  ['raid', 'Boss'],
  ['training', 'Train'],
  ['relics', 'Relics'],
  ['oracle', 'Oracle'],
  ['quests', 'Quests'],
] as const
const MORE = [
  ['market', 'Market'],
  ['raffle', 'Raffle Tent'],
  ['depths', 'Arkhive Depths'],
  ['hall', 'Hall of Keepers'],
  ['about', 'About'],
  ['fairness', 'Proof Center'],
  ['verify', 'Verify'],
  ['journal', 'Journal'],
  ['economy', 'Economy'],
] as const
const PRIMARY = NAV.slice(0, 4)
const OTHER_PLACES = [...NAV.slice(4), ...MORE.slice(0, 3), MORE[8]]
const WORLD_INFO = [['lore', 'World Lore'], ['guide', 'How to Play'], ...MORE.slice(3, 8)] as const
const NAV_SPRITES: Record<string, PxIconName> = {
  map: 'flag', lab: 'egg', breed: 'egg', arena: 'sword', expeditions: 'flag', raid: 'skull', training: 'bolt', relics: 'gem',
  oracle: 'eye', quests: 'star', market: 'coin', raffle: 'coin', depths: 'skull', economy: 'coin', hall: 'star',
  guide: 'info', lore: 'flag', about: 'info', fairness: 'check', verify: 'eye', journal: 'flag',
}

export default function App() {
  const route = useRoute()
  const [page, ...rest] = route
  const { account } = useWallet()
  const [menu, setMenu] = useState<'world' | 'wallet' | null>(null)
  const menuToggle = useRef<HTMLButtonElement>(null)
  const walletToggle = useRef<HTMLButtonElement>(null)
  const header = useRef<HTMLElement>(null)
  const activePage = page === 'creature' ? 'lab' : page || 'map'
  useEffect(() => wireWallet(), [])
  const routeKey = route.join('/')
  useLayoutEffect(() => { document.getElementById('main-content')?.scrollTo({ top: 0 }) }, [routeKey])
  // #/judge turns on the guided judge tour and lands on the map
  useEffect(() => {
    if (page === 'judge') {
      setJudge(true)
      window.location.replace('#/map')
    }
  }, [page])
  useEffect(() => setMenu(null), [page])
  useEffect(() => {
    if (!menu) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setMenu(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [menu])
  useEffect(() => setTrack(page === 'arena' || page === 'raid' ? 'battle' : 'town'), [page])
  useEffect(() => {
    const place = page && PLACE[page]
    const name = place ? place.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null
    document.title = page === 'creature' && rest[0] ? `Xeno #${rest[0]} · Ashenkin` : name ? `${name} · Ashenkin` : 'Ashenkin'
  }, [page, rest[0]])
  // Every press gets a tiny click, and the first gesture wakes the audio (and the music, if it was on).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      unlockAudio()
      resumeMusic()
      const el = (e.target as Element | null)?.closest('button, a, [role=button]')
      if (el && !(el as HTMLButtonElement).disabled) sfx.press()
    }
    window.addEventListener('pointerdown', down)
    return () => window.removeEventListener('pointerdown', down)
  }, [])
  // Esc walks back to the world map from any building.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || getSceneOpen()) return
      const t = e.target as HTMLElement | null
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      if (document.querySelector('.fixed.inset-0:not([aria-hidden])')) return
      const p = window.location.hash.replace(/^#\/?/, '').split('/')[0]
      if (DEPLOYED && p && p !== 'map') travel('map')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  let screen
  switch (page) {
    case 'guide':
      screen = <HowToPlay />
      break
    case 'about':
      screen = <About />
      break
    case 'map':
      screen = <WorldMap />
      break
    case 'lab':
      screen = <Lab />
      break
    case 'creature':
      screen = <CreatureDetail key={rest.join('/')} id={Number(rest[0])} initialSection={rest[1] === 'genome' ? 'genome' : 'overview'} />
      break
    case 'breed':
      screen = <Breed preset={rest[0] ? Number(rest[0]) : undefined} />
      break
    case 'arena':
      screen = rest[0] === 'tournament' && TOURNAMENT ? <Tournament /> : <Arena
        key={`${account ?? 'guest'}:${rest.join('/') || 'hunt'}`}
        practice={rest[0] === 'trial'}
        starter={rest[0] === 'trial' && rest[1] === 'start'}
        log={rest[0] === 'log'}
        battleLookup={rest[0] === 'log' ? rest[1] : undefined}
        preset={/^\d+$/.test(rest[0] ?? '') ? Number(rest[0]) : rest[0] === 'defend' ? Number(rest[1]) || undefined : undefined}
        defenderId={rest[0] === 'duel' ? Number(rest[1]) || undefined : undefined}
        defend={rest[0] === 'defend'}
      />
      break
    case 'market':
      screen = <Market />
      break
    case 'verify':
      screen = <Verify id={rest[0] ? Number(rest[0]) : undefined} />
      break
    case 'journal':
      screen = <Journal />
      break
    case 'lore':
      screen = <WorldLore />
      break
    case 'expeditions':
      screen = <Expeditions />
      break
    case 'raid':
      screen = <Raid />
      break
    case 'training':
      screen = <Training key={rest[0] ?? 'default'} preset={Number(rest[0]) || undefined} />
      break
    case 'quests':
      screen = <Quests />
      break
    case 'economy':
      screen = <Economy />
      break
    case 'hall':
      screen = <Hall />
      break
    case 'relics':
      screen = <Relics />
      break
    case 'oracle':
      screen = <Oracle />
      break
    case 'raffle':
      screen = <Raffle />
      break
    case 'depths':
      screen = <Depths />
      break
    case 'fairness':
      screen = <Fairness />
      break
    default:
      screen = DEPLOYED ? <WorldMap /> : <About />
  }

  return (
    <div className="chm-root">
      {(page === 'lab' || page === 'breed' || page === 'creature') && <FheWarmup />}
      <style>{CHIMERA_CSS}</style>
      <a href="#main-content" className="chm-skip" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>
      <header ref={header} className="chm-hud sticky top-0 z-40 border-b-[3px] border-[#111]" onKeyDown={(event) => {
        if (event.key !== 'Escape' || !menu) return
        event.preventDefault()
        setMenu(null)
        const trigger = menu === 'wallet' ? walletToggle : menuToggle
        trigger.current?.focus()
      }}>
        <div className="chm-hud-row">
          <Link to="" onNavigate={() => setMenu(null)} className="chm-hud-brand">
            <Sigil />
            <span className="font-display">Ashenkin</span>
          </Link>
          <div className="chm-hud-tools">
            {DEPLOYED && <InboxButton />}
            <WalletBar trigger={walletToggle} open={menu === 'wallet'} toggle={() => setMenu(menu === 'wallet' ? null : 'wallet')} close={() => setMenu(null)} />
            <button ref={menuToggle} type="button" className="chm-hud-control" onClick={() => setMenu(menu === 'world' ? null : 'world')} aria-label="Menu" aria-expanded={menu === 'world'} aria-controls="world-menu">
              {menu === 'world' ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              <span className="hidden lg:inline">Menu</span>
            </button>
          </div>
        </div>
        <nav id="world-menu" aria-label="World menu" hidden={menu !== 'world'} className="chm-menu absolute inset-x-0 top-full max-h-[min(75dvh,38rem)] overflow-y-auto border-y-[3px] border-[#111] bg-[#FFFFFF] shadow-[0_6px_0_#111]">
          <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:grid-cols-2">
            <div className="min-w-0">
              <h2 className="font-display text-base">Destinations</h2>
              <div className="chm-nav mt-2 grid grid-cols-2 gap-2">
                {[...PRIMARY, ...OTHER_PLACES].map(([k, label], index) => <Link key={k} to={k} current={activePage === k} onNavigate={() => setMenu(null)} className={`${activePage === k ? 'on' : ''} ${index < PRIMARY.length ? 'lg:hidden' : ''}`}><PxIcon name={NAV_SPRITES[k]} size={15} /> {label}</Link>)}
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base">World records & help</h2>
              <div className="chm-nav mt-2 grid grid-cols-2 gap-2">
                {WORLD_INFO.map(([k, label]) => <Link key={k} to={k} current={activePage === k} onNavigate={() => setMenu(null)} className={activePage === k ? 'on' : ''}><PxIcon name={NAV_SPRITES[k]} size={15} /> {label}</Link>)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <MusicToggle />
              </div>
            </div>
          </div>
        </nav>
      </header>
      {!DEPLOYED && (
        <div className="border-b-[3px] border-[#111] bg-[#FFD209] px-4 py-2 text-center text-sm font-bold text-[#111]">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          The Arkhive contracts are not live on Sepolia yet. You can browse the lore and the specimen atlas in the meantime.
        </div>
      )}
      <ChainWarning />
      <main id="main-content" tabIndex={-1} className="chm-playfield" key={page}>
        <div className="mx-auto max-w-7xl px-3 pb-16 pt-4 sm:px-5 sm:pt-6">
          {DEPLOYED && page && PLACE[page] && <BackToMap />}
          <div className={hasNativePageTransition() ? undefined : 'chm-rise'} key={routeKey}>
            <Suspense fallback={<p className="chm-panel p-4 text-sm" role="status">Opening destination…</p>}>{screen}</Suspense>
          </div>
        </div>
      <footer className="border-t-[3px] border-[#111] bg-[#000000] px-4 py-4 text-center font-mono text-xs text-[#FFFFFF]">
        <p className="font-bold">Ashenkin · Zama FHEVM · Sepolia</p>
        <p className="mt-1">This project is not audited, endorsed or operated by Zama. Use at your own risk.</p>
      </footer>
      </main>
      <nav className="chm-bottom-nav" aria-label="Main destinations">
        {PRIMARY.map(([k, label]) => <Link key={k} to={k} current={activePage === k} onNavigate={() => setMenu(null)} className={activePage === k ? 'on' : ''}><PxIcon name={NAV_SPRITES[k]} size={19} /><span>{label}</span></Link>)}
      </nav>
      <Toasts />
      <GameStage />
      <ProofDrawer />
      {DEPLOYED && <JudgePanel />}
    </div>
  )
}

const PLACE: Record<string, string> = {
  lab: 'LAB',
  creature: 'LAB',
  breed: 'NURSERY',
  arena: 'COLOSSEUM',
  relics: 'RELIC FORGE',
  oracle: 'ORACLE',
  raffle: 'RAFFLE TENT',
  depths: 'ARKHIVE DEPTHS',
  expeditions: 'EXPEDITION GATE',
  raid: 'BOSS LAIR',
  training: 'DOJO',
  quests: 'QUEST BOARD',
  market: 'MARKET',
  economy: 'TREASURY',
  verify: 'VERIFIER',
  fairness: 'PROOF CENTER',
  journal: 'JOURNAL',
  lore: 'WORLD LORE',
  hall: 'HALL OF KEEPERS',
  about: 'ABOUT',
  guide: 'HOW TO PLAY',
}

function BackToMap() {
  return (
    <div className="mb-2.5 flex items-center gap-3 sm:mb-4">
      <button
        onClick={() => travel('map')}
        className="inline-flex min-h-11 items-center gap-2 px-1 text-sm font-bold underline decoration-2 underline-offset-4 hover:text-[#2b50f5]"
        title="Back to the world map (Esc)"
      >
        ← World map
      </button>
    </div>
  )
}

function MusicToggle() {
  const [on, setOn] = useState(isMusicOn())
  useEffect(() => onMusic(() => setOn(isMusicOn())), [])
  return (
    <button
      onClick={() => setMusic(!on)}
      className={`grid h-9 w-9 place-items-center border-[3px] border-[#111] shadow-[3px_3px_0_#111] ${on ? 'bg-[#FFD209]' : 'bg-white'}`}
      title={on ? 'Music on: click to stop' : 'Play 8-bit music'}
      aria-label="Toggle music"
      aria-pressed={on}
    >
      {on ? <Music2 className="h-4 w-4" /> : <Music className="h-4 w-4 opacity-60" />}
    </button>
  )
}

function Sigil() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <rect x="2" y="2" width="28" height="28" fill="var(--chm-yellow)" />
      <path d="M10 6 C20 12, 10 20, 20 26" stroke="var(--chm-brand-ink)" strokeWidth="2.5" fill="none" />
      <path d="M20 6 C10 12, 20 20, 10 26" stroke="var(--chm-brand-ink)" strokeWidth="2.5" fill="none" />
    </svg>
  )
}

/** Load WASM and public network configuration while the connected player browses. */
function FheWarmup() {
  const { account, chainId } = useWallet()
  useEffect(() => {
    if (!account || chainId !== CHAIN_ID) return
    const idle = window.setTimeout(() => { void getFhe().catch(() => {}) }, 0)
    return () => window.clearTimeout(idle)
  }, [account, chainId])
  return null
}

function ChainWarning() {
  const { account, chainId } = useWallet()
  const eth = useEthBalance(account)
  if (!account || chainId == null) return null
  if (chainId === CHAIN_ID) {
    if (eth !== 0n) return null
    return <div className="border-b-2 border-[#111] bg-[#fff3c4] px-3 text-center text-sm sm:hidden"><a href={GAS_FAUCET} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-bold underline">Get Sepolia ETH for gas</a></div>
  }
  return (
    <div className="chm-chain-warning px-4 py-2 text-center text-sm font-bold">
      Your wallet is on another network.{' '}
      <button className="underline" onClick={() => ensureChain().catch((e) => toast({ kind: 'err', title: 'Switch failed', detail: errorText(e) }))}>
        Switch to Sepolia
      </button>
    </div>
  )
}

function WalletBar({ trigger, open, toggle, close }: { trigger: RefObject<HTMLButtonElement | null>; open: boolean; toggle: () => void; close: () => void }) {
  const { account, connecting } = useWallet()
  const bal = useBalance(account)
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const quests = useQuests(account)
  const eth = useEthBalance(account)
  if (!account)
    return (
      <Button className="chm-hud-connect" aria-label="Connect wallet" onClick={() => connect().catch((e) => toast({ kind: 'err', title: 'Could not connect', detail: errorText(e) }))} busy={connecting}>
        <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" /> <span>Connect<span className="max-[380px]:hidden"> wallet</span></span>
      </Button>
    )
  return (
    <div className="chm-hud-wallet">
      <button type="button" ref={trigger} className="chm-hud-control chm-hud-account" aria-label={`Wallet ${short(account)}`} aria-expanded={open} aria-controls="wallet-panel" onClick={toggle}>
        <Wallet className="h-4 w-4" aria-hidden="true" /><span>{short(account)}</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <section id="wallet-panel" hidden={!open} aria-label="Wallet" className="chm-wallet-panel">
        <div className="chm-wallet-summary">
          <h2 className="font-display">Wallet</h2>
          {DEPLOYED && <p title="Your confidential balance">{bal.keyReady ? `${bal.loading ? '…' : fmtZama(bal.value)} cZAMA` : 'Balance sealed'}</p>}
        </div>
        {DEPLOYED && <div className="chm-wallet-actions">
          {eth === 0n && (
            <a href={GAS_FAUCET} target="_blank" rel="noreferrer" className="chm-wallet-action">
              <Fuel className="h-4 w-4" aria-hidden="true" /> Get Sepolia ETH
            </a>
          )}
          {quests.data && (
            <Link to="quests" onNavigate={close} className="chm-wallet-action">
              <Flame className="h-4 w-4" aria-hidden="true" /> {quests.data.checkedIn ? `Quest streak · ${quests.data.streak}` : 'Daily check-in'}
            </Link>
          )}
          {!bal.keyReady && (
            <Button className="chm-wallet-action" busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', () => labKey(account), 'Lab key unlocked for 30 days')}>
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Unlock lab key
            </Button>
          )}
          <Button
            className="chm-wallet-action"
            title={`Mint ${FAUCET_AMOUNT.toLocaleString()} test ZAMA and wrap it into confidential cZAMA`}
            busy={busy === 'Faucet'}
            onClick={() => {
              close()
              run('Faucet', async (step) => {
                const r = await faucet(account, step)
                refresh('balHandle', 'bal')
                return r
              }, `${FAUCET_AMOUNT.toLocaleString()} cZAMA added to your wallet`, { spec: { kind: 'faucet' } })
            }}
          >
            <Droplets className="h-4 w-4" aria-hidden="true" /> Test cZAMA faucet
          </Button>
        </div>}
        <button type="button" className="chm-wallet-action chm-wallet-disconnect" onClick={() => { close(); disconnect() }}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> Disconnect wallet
        </button>
      </section>
    </div>
  )
}
