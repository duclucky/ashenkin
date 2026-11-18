import { Location, LocationNotes } from '../game/Location'
import { useEffect, useRef, useState } from 'react'
import { ProofButton } from '../game/ProofDrawer'
import { GuestGate } from '../game/GuestGate'
import { Compass, Dice5, Lock, Shield, Swords, ScrollText, Eye, RefreshCw } from 'lucide-react'
import { Addr, Button, CreatureCard, Empty, Label, Link, Panel, go, useAction } from '../ui'
import { CHAIN_ID, COLOSSEUM, DEPLOYED, TRAINING, useWallet, errorText, type Sent } from '../chain'
import { xpGrantedFromReceipt } from '../game/expedition-progression'
import { useDefenders, useMyCreatures, useNow, useRefresh, fmtDuration } from '../hooks'
import { withdrawDefender } from '../actions'
import { TOURNAMENT } from '../tournament'
import { getSceneOpen, openScene, sceneActive, sceneDone, sceneUpdate } from '../game/store'
import {
  battleIdFromInput,
  loadPlan,
  packPlan,
  roundBits,
  tacticsAutoSettle,
  tacticsChallenge,
  tacticsDuel,
  tacticsExplore,
  tacticsRegister,
  tacticsReplan,
  tacticsWithdraw,
  useMyDefencePlan,
  useKeeperBattles,
  useTBattle,
  useTBattles,
  useTDefenders,
  useTReadyAt,
  useTStats,
  useTWilds,
  wildPlan,
  type TBattle,
  type TDefender,
  type TacticStarted,
  type Settled,
} from '../season'
import { MoveTriangle, PlanPicker, RoundPips } from '../game/Tactics'
import { PracticeBattle } from '../game/PracticeBattle'
import { SpecimenLink } from '../game/Transition'
import { ArenaPreparation } from '../game/ArenaPreparation'
import { ScoutButton } from '../game/ScoutDrawer'
import { TacticalPlaybooks } from '../game/TacticalPlaybooks'
import { clearStarterPracticePlan, stagePracticeDraft, starterPracticePlan, takePracticeDraft } from '../game/practice-draft'
import { keeperGuideEnabled } from '../game/keeper-story'
import { preloadHuntEncryption, sealHuntPlan } from '../game/hunt-encryption'
import { HuntPlanPreparation } from '../game/hunt-plan'

type Scene = { battleId: number; handles: `0x${string}`[]; myId: number; foeId: number; kind: 0 | 1; asDefender?: boolean; mine?: number[] | null }
type Run = ReturnType<typeof useAction>['run']

export default function Arena({ preset, practice = false, starter = false, log = false, battleLookup, defenderId, defend = false }: {
  preset?: number
  practice?: boolean
  starter?: boolean
  log?: boolean
  battleLookup?: string
  defenderId?: number
  defend?: boolean
}) {
  const { account, chainId } = useWallet()
  const mine = useMyCreatures(account)
  const [champ, setChamp] = useState<number | null>(preset ?? null)
  const [tab, setTab] = useState<'hunt' | 'duel' | 'log'>(log ? 'log' : defenderId || defend ? 'duel' : 'hunt')
  const [plan, setPlan] = useState<number[]>([0, 1, 2])
  const planEdited = useRef(false)
  const [huntPreparation] = useState(() => new HuntPlanPreparation(sealHuntPlan))
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const ready = useTReadyAt(champ)
  const stats = useTStats(account)
  const roaming = useTWilds(!!account && !practice && tab === 'hunt')
  const now = useNow(1000)
  const inHunt = DEPLOYED && !practice && tab === 'hunt' && chainId === CHAIN_ID && !!account
  const hasChampion = champ != null && (mine.data?.includes(champ) ?? false)
  const practiceSpecimen = hasChampion ? champ : mine.data?.[0]
  const packedHuntPlan = packPlan(plan)
  const firstFight = stats.data?.wins === 0 && stats.data.losses === 0 && keeperGuideEnabled()

  useEffect(() => {
    if (inHunt) void preloadHuntEncryption().catch(() => { /* The hunt can prepare on demand. */ })
  }, [inHunt])

  useEffect(() => {
    if (!inHunt || !account || !hasChampion || busy) return
    const timer = setTimeout(() => {
      if (!getSceneOpen()) huntPreparation.warm({ chainId: CHAIN_ID, colosseum: COLOSSEUM, account, moves: packedHuntPlan })
    }, 600)
    return () => {
      clearTimeout(timer)
      huntPreparation.clear()
    }
  }, [inHunt, account, hasChampion, busy, packedHuntPlan, huntPreparation])

  useEffect(() => {
    if (!account || practice) return
    const draft = takePracticeDraft(account)
    if (draft) {
      planEdited.current = true
      setPlan(draft)
    }
    if (firstFight && tab === 'hunt' && !planEdited.current) {
      const plan = starterPracticePlan(account)
      if (plan) setPlan(plan)
    }
  }, [account, firstFight, practice, tab])

  function editPlan(moves: number[]) {
    planEdited.current = true
    setPlan(moves)
  }

  useEffect(() => {
    if (!mine.isFetching && mine.data && (champ == null || !mine.data.includes(champ))) setChamp(mine.data[0] ?? null)
  }, [mine.data, mine.isFetching, champ])

  if (!DEPLOYED) return <Empty title="The Colosseum opens once the contracts are live" />
  if (!account && log) return <div className="space-y-5"><Location place="arena" /><Log run={run} battleLookup={battleLookup} /></div>

  const cd = (ready.data ?? 0) - now
  const roamingTarget = roaming.data?.find(wild => !wild.engaged)
  const huntDisabled = !champ || ready.data == null || cd > 0 || !!busy

  async function resolve(s: Scene, cont = false) {
    // rounds are always from the challenger's point of view; flip them for the defender
    const map = (r: Settled) => ({
      ...r,
      won: s.asDefender ? !r.won : r.won,
      rounds: s.asDefender ? r.rounds.map((x) => !x) : r.rounds,
      mine: s.mine ?? undefined,
      battleId: s.battleId,
      xp: xpGrantedFromReceipt(r.events, me, TRAINING, COLOSSEUM),
    })
    const me = s.asDefender ? s.foeId : s.myId
    const foe = s.asDefender ? s.myId : s.foeId
    await run('Reveal the rounds', (st) => tacticsAutoSettle(s.battleId, s.handles, st), 'Battle settled', cont ? { cont: true, map } : { spec: { kind: 'battle', me, foe: foe || undefined, mode: s.kind, starterHunt: firstFight && s.kind === 0 && !s.asDefender }, map })
    refresh('twilds', 'tbattles', 'mine', 'account', 'tdefenders', 'treadyAt', 'balHandle', 'creature', 'training', 'tstats', 'xpRoom')
  }

  async function start(kind: 0 | 1, foeId: number | null, fn: (st: (m: string, h?: string) => void) => Promise<TacticStarted>) {
    if (!champ) return
    const moves = [...plan]
    const r = await run(
      kind === 0 ? 'Hunt' : 'Duel',
      async (st) => {
        const x = await fn(st)
        if (!foeId && x.wildId) sceneUpdate({ foe: x.wildId })
        return x
      },
      'Plans sealed — fighting under encryption',
      { spec: { kind: 'battle', me: champ, foe: foeId ?? undefined, mode: kind, starterHunt: firstFight && kind === 0 }, final: false },
    )
    if (!r) {
      if (kind === 0) void roaming.refetch()
      return
    }
    if (kind === 0 && account) clearStarterPracticePlan(account)
    refresh('twilds', 'tbattles', 'treadyAt', 'tdefenders')
    await resolve({ battleId: r.battleId, handles: r.rounds, myId: champ, foeId: foeId ?? r.wildId ?? 0, kind, mine: moves }, true)
  }

  function hunt(wildId: number) {
    if (account && champ) void start(0, wildId, st => tacticsChallenge(account, champ, wildId, plan, st, huntPreparation))
  }

  function explore() {
    if (account && champ) void start(0, null, st => tacticsExplore(account, champ, plan, st, huntPreparation))
  }

  return (
    <div className="space-y-5">
      {practice ? <h1 className={starter ? 'sr-only' : 'chm-ring-title font-pixel'}>Colosseum</h1> : (
        <Location place="arena">{account && stats.data && <span>{stats.data.wins} wins · {stats.data.losses} losses · {stats.data.captures} captures</span>}</Location>
      )}

      {!!TOURNAMENT && !practice && !log && <Link to="arena/tournament" className="chm-btn chm-btn-ghost min-h-11"><Shield size={16} aria-hidden="true" /> Colosseum Cup</Link>}

      {!account || practice ? (
        <>
          {!account && defenderId ? (
            <Panel className="flex flex-wrap items-center gap-5 p-4 sm:p-5">
              <div className="w-36"><CreatureCard id={defenderId} compact /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl">Challenge specimen #{defenderId}</h2>
                <p className="mt-2 text-sm">Sign in, bring a champion NFT and choose three sealed moves.</p>
                <SpecimenLink id={defenderId} className="mt-2 inline-block text-sm font-bold underline">View specimen</SpecimenLink>
              </div>
            </Panel>
          ) : practice && account && practiceSpecimen != null ? (
            <>
              {!!mine.data && mine.data.length > 1 && <label className="chm-panel flex items-center justify-between gap-3 p-3 text-sm font-bold">
                Practice specimen
                <select className="min-h-11 min-w-0 border px-2" value={practiceSpecimen} onChange={event => setChamp(Number(event.target.value))}>
                  {mine.data.map(id => <option key={id} value={id}>Specimen #{id}</option>)}
                </select>
              </label>}
              <PracticeBattle key={practiceSpecimen} specimen={practiceSpecimen} starter={starter} onReady={moves => { stagePracticeDraft(account, moves); go(`arena/${practiceSpecimen}`) }} />
            </>
          ) : account && mine.isPending ? <p className="chm-panel p-4" role="status">Checking your specimens…</p> : null}
          <LocationNotes title="Move matchups"><MoveTriangle /></LocationNotes>
          <LocationNotes title="How Sepolia fights work"><MatchRules /></LocationNotes>
          {account && practiceSpecimen != null ? <Link to="arena" className="chm-btn chm-btn-ghost">Enter the Sepolia Colosseum</Link> : (!account || !mine.isPending) && <GuestGate place="arena" />}
        </>
      ) : (
        <>
          <div className="chm-arena-modes" role="group" aria-label="Colosseum modes">
            {([
              ['hunt', 'Wild hunts', Compass],
              ['duel', 'Duels', Shield],
              ['log', 'Battle log', ScrollText],
            ] as const).map(([k, label, Icon]) => (
              <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)} className="chm-mode"><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>
            ))}
          </div>
          {tab !== 'log' && <div className="chm-arena-workbench">
            {mine.isPending ? <div className="chm-panel min-h-[340px] animate-pulse" role="status" aria-label="Loading your champions" /> : mine.isError ? <Empty title="Could not read your champions"><Button variant="ghost" onClick={() => mine.refetch()}>Try again</Button></Empty> : mine.data?.length ? <ArenaPreparation ids={mine.data} selected={champ} onSelect={setChamp} duel={tab === 'duel'} /> : <Empty title="No specimens yet"><Link to="lab" className="font-bold underline">Hatch an embryo at the Lab</Link> to start your first hunt.</Empty>}
            <div className="chm-arena-console">
              <div className="chm-console-heading"><span>YOUR BATTLE PLAN</span><small>{champ && (cd > 0 ? `Recovering ${fmtDuration(cd)}` : 'Champion ready')}</small></div>
              <PlanPicker plan={plan} onChange={editPlan} label="Choose three commands" prepare={tab === 'hunt'} />
              {champ && <TacticalPlaybooks key={`${CHAIN_ID}:${COLOSSEUM}:${account.toLowerCase()}:${champ}`} scope={{ chainId: CHAIN_ID, colosseum: COLOSSEUM, account, specimenId: champ }} plan={plan} apply={editPlan} />}
              {tab === 'hunt' && <div className="chm-hunt-entry">
                {roaming.isError && !roaming.data ? <Button variant="ghost" onClick={() => roaming.refetch()}>Retry reading the wilds</Button> : (
                  <Button
                    onClick={roamingTarget ? () => hunt(roamingTarget.id) : explore}
                    disabled={huntDisabled || !roaming.data}
                    busy={busy === 'Hunt'}
                    variant="gold"
                    className={firstFight && !huntDisabled ? 'chm-quest-target' : ''}
                  >
                    <Compass className="h-4 w-4" />
                    {!roaming.data ? 'Reading the wilds…' : roamingTarget ? `Hunt wild #${roamingTarget.id}` : 'Explore for a new wild'}
                  </Button>
                )}
                {roamingTarget && <Button onClick={explore} disabled={huntDisabled} variant="ghost">Explore for a new wild</Button>}
                <p>Win 2 of 3 rounds to capture.{roamingTarget ? ' Hunting a roaming wild uses less gas.' : ''}</p>
              </div>}
            </div>
          </div>}
          {tab === 'hunt' && <Hunts roaming={roaming} disabled={huntDisabled} onChallenge={hunt} />}
          {tab === 'duel' && <Duels target={defenderId} champ={champ} cd={cd} busy={busy} run={run} plan={plan} onDuel={(d, stake) => start(1, d, (st) => tacticsDuel(account, champ!, d, stake, plan, st))} />}
          {tab === 'log' && (
            <Log
              run={run}
              battleLookup={battleLookup}
              guideFirstFight={firstFight}
              onReveal={(b) => {
                const asDefender = b.opponent.toLowerCase() === account.toLowerCase()
                const asChallenger = b.challenger.toLowerCase() === account.toLowerCase()
                resolve({ battleId: b.id, handles: b.handles, myId: b.challengerId, foeId: b.opponentId, kind: b.kind, asDefender, mine: asChallenger ? loadPlan(b.id) : null })
              }}
            />
          )}
          <LegacyDefenders run={run} />
          <LocationNotes title="Move matchups"><MoveTriangle /></LocationNotes>
          <LocationNotes title="How Sepolia fights work"><MatchRules /></LocationNotes>
          <Link to="arena/trial" className="chm-trial-link">Practice with Lumen · no gas</Link>
        </>
      )}
    </div>
  )
}

function MatchRules() {
  return (
    <section className="grid gap-2 text-sm" aria-label="Sepolia fight rules">
      <p className="flex items-start gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><b>Sealed plans.</b> Pick a counter for a +30 bonus. Your opponent’s moves and power stay encrypted during scoring.</span></p>
      <p className="flex items-start gap-2"><Dice5 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><b>Zama roll.</b> Each side gets a fresh 0–31 roll per round on Sepolia. The proof reveals who won each round.</span></p>
      <ProofButton spec={{ mode: 'tactics' }} label="What the proof reveals" />
    </section>
  )
}

function Hunts({ roaming, disabled, onChallenge }: { roaming: ReturnType<typeof useTWilds>; disabled: boolean; onChallenge: (id: number) => void }) {
  return (
    <details className="chm-panel chm-roaming-list">
      <summary>Choose a specific wild <span>{roaming.isPending ? '…' : roaming.isError ? 'Unavailable' : roaming.data?.length ?? 0} roaming</span></summary>
      <div className="p-4">
        {!roaming.data?.length ? (
          <div className="text-sm text-[var(--chm-dim)]">{roaming.isPending ? 'Reading the wilds…' : roaming.isError ? 'The wilds could not be read.' : 'Nothing roams right now. Wild creatures that beat a Keeper stay here until someone captures them.'}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            {roaming.data.map((w) => (
              <CreatureCard
                key={w.id}
                id={w.id}
                compact
                footer={
                  <div className="space-y-1"><Button variant="ghost" className="w-full !py-1.5 text-xs" disabled={disabled || w.engaged} onClick={() => onChallenge(w.id)}>
                    {w.engaged ? 'Being fought' : 'Hunt it'}
                  </Button><ScoutButton id={w.id} /></div>
                }
              />
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

function Duels({ target, champ, cd, busy, run, plan, onDuel }: { target?: number; champ: number | null; cd: number; busy: string | null; run: Run; plan: number[]; onDuel: (id: number, stake: bigint) => void }) {
  const { account } = useWallet()
  const defenders = useTDefenders()
  const refresh = useRefresh()
  const [stake, setStake] = useState('10')
  const amount = BigInt(Math.round((Number(stake) || 0) * 1e6))
  const live = (defenders.data ?? []).filter((d) => d.active && d.valid)
  const opponents = target ? live.filter((defender) => defender.id === target) : live
  const champDefending = live.some((d) => d.id === champ)
  const after = (r?: Sent) => r && refresh('tdefenders', 'balHandle', 'tplan')

  return (
    <div className="space-y-6">
      <Panel className="grid gap-5 p-5 md:grid-cols-[1fr_auto]">
        <div>
          <div className="font-display text-2xl">Hidden stakes, hidden plans</div>
          <div className="mt-1 text-sm text-[var(--chm-dim)]">
            Post a defender with an encrypted stake and a sealed 3-move plan, both under one proof. Challengers see only its looks. Only the smaller of the two stakes is at risk, and the winner takes the matched pot minus a 5% rake that feeds the World Boss. Ties go to the defender. You can change your plan for free at any time.
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-32">
            <Label className="mb-1">Stake (cZAMA)</Label>
            <input className="chm-input" aria-label="Stake (cZAMA)" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
          {!target && <Button variant="ghost" disabled={!champ || champDefending || !!busy || amount === 0n} busy={busy === 'Post defender'} onClick={() => run('Post defender', (st) => tacticsRegister(account!, champ!, amount, plan, st), 'Your defender guards the Colosseum', { spec: { kind: 'defend', me: champ! } }).then(after)}>
            <Shield className="h-4 w-4" /> {champDefending ? 'Already defending' : 'Defend with this plan'}
          </Button>}
        </div>
      </Panel>

      <div>
        <Label className="mb-3">{target ? `Challenge specimen #${target}` : `Defenders waiting · ${live.length}`}</Label>
        {!opponents.length ? (
          <p className="text-sm text-[var(--chm-dim)]">{defenders.isPending ? 'Checking the Colosseum…' : defenders.isError ? 'Defender status is unavailable. Try again shortly.' : target ? 'This specimen is not defending right now.' : 'No defenders are waiting. Post yours with a sealed plan.'}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            {opponents.map((d) => {
              const mine = d.keeper.toLowerCase() === account?.toLowerCase()
              return (
                <CreatureCard
                  key={d.id}
                  id={d.id}
                  compact
                  footer={
                    <div className="space-y-2">
                      <div className="flex justify-between font-mono text-[11px] text-[var(--chm-dim)]">
                        <span>
                          <Addr a={d.keeper} you={account} />
                        </span>
                        <span>{d.replans ? `${d.replans}× replanned` : 'plan sealed'}</span>
                      </div>
                      <ScoutButton id={d.id} keeper={d.keeper} replans={d.replans} />
                      {mine ? (
                        <MyDefender d={d} busy={busy} run={run} plan={plan} onDone={after} />
                      ) : (
                        <Button className="w-full !py-1.5 text-xs" disabled={!champ || cd > 0 || !!busy || amount === 0n} onClick={() => onDuel(d.id, amount)}>
                          <Swords className="h-3.5 w-3.5" /> Duel · {stake || 0}
                        </Button>
                      )}
                    </div>
                  }
                />
              )
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-[var(--chm-dim)]">Duels use test cZAMA, an ERC-7984 confidential token. Get 1,000 test cZAMA at the Wishing Well on the map or in the wallet menu. Sepolia ETH for gas comes from the separate daily faucet.</p>
      </div>
    </div>
  )
}

function MyDefender({ d, busy, run, plan, onDone }: { d: TDefender; busy: string | null; run: Run; plan: number[]; onDone: (r?: Sent) => void }) {
  const { account } = useWallet()
  const current = useMyDefencePlan(d, account)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] font-black uppercase text-[var(--chm-dim)]">your plan</span>
        <RoundPips rounds={[null, null, null]} mine={current.data ?? null} />
      </div>
      <Button variant="ghost" className="w-full !py-1 text-[11px]" disabled={!!busy} onClick={() => run('Replan', (st) => tacticsReplan(account!, d.id, plan, st), 'New plan sealed', { spec: { kind: 'replan', me: d.id } }).then(onDone)}>
        <RefreshCw className="h-3 w-3" /> Use the plan above
      </Button>
      <Button variant="danger" className="w-full !py-1 text-[11px]" disabled={!!busy} onClick={() => run('Recall defender', (st) => tacticsWithdraw(d.id, st), 'Defender recalled, stake refunded', { spec: { kind: 'recall', me: d.id } }).then(onDone)}>
        Recall and refund
      </Button>
    </div>
  )
}

function Log({ onReveal, run, guideFirstFight = false, battleLookup }: {
  onReveal?: (battle: TBattle) => void
  run: Run
  guideFirstFight?: boolean
  battleLookup?: string
}) {
  const { account } = useWallet()
  const [peek, setPeek] = useState<Record<number, number[]>>({})
  const [mineOnly, setMineOnly] = useState(true)
  const [lookupInput, setLookupInput] = useState(battleLookup ?? '')
  const lookup = battleLookup !== undefined
  const battleId = battleIdFromInput(battleLookup)
  const validInput = battleIdFromInput(lookupInput)
  const showMine = !!account && mineOnly
  const personal = useKeeperBattles(account, !lookup && showMine)
  const recent = useTBattles(30, !lookup && !showMine)
  const exact = useTBattle(battleId)
  const history = showMine ? personal : recent
  const query = lookup ? exact : history
  const me = account?.toLowerCase()
  const guidedBattle = guideFirstFight ? personal.data?.find(b => b.status === 1)?.id : undefined
  const visible = lookup ? exact.data && exact.data.status !== 0 ? [exact.data] : [] : history.data ?? []
  return (
    <section className="space-y-3" aria-label="Battle history">
    <form className="chm-panel grid gap-2 p-3" onSubmit={event => {
      event.preventDefault()
      if (validInput != null) go(`arena/log/${validInput}`)
    }}>
      <label className="text-sm font-bold" htmlFor="battle-lookup">Find a battle by ID</label>
      <div className="flex gap-2">
        <input id="battle-lookup" className="chm-input min-w-0 flex-1" inputMode="numeric" value={lookupInput} onChange={event => setLookupInput(event.target.value.replace(/\D/g, ''))} />
        <Button type="submit" disabled={validInput == null}>Find</Button>
      </div>
      {lookup && <Link to="arena/log" className="inline-flex min-h-11 items-center text-sm font-bold underline">Back to battle log</Link>}
    </form>
    {!lookup && account && <div className="chm-log-heading"><div role="group" aria-label="Battle history filter"><button type="button" className="chm-mode" aria-pressed={showMine} onClick={() => setMineOnly(true)}>Your fights</button><button type="button" className="chm-mode" aria-pressed={!showMine} onClick={() => setMineOnly(false)}>Recent world fights</button></div></div>}
    {query.isError ? <Empty title="Could not load battles">{errorText(query.error)} <Button variant="ghost" onClick={() => query.refetch()}>Retry</Button></Empty>
      : query.isLoading ? <div className="chm-panel h-40 animate-pulse" role="status" aria-label="Loading battles" />
      : !visible.length ? lookup ? <Empty title={battleId == null ? 'Enter a valid battle ID' : `Battle #${battleId} was not found in this world`} />
        : <Empty title={showMine ? 'Your first fight awaits' : 'No recent battles'}>{showMine && 'Choose Wild hunts to enter the Colosseum.'}</Empty>
      : <Panel className="divide-y divide-[var(--chm-line)]">
      {visible.map((b) => {
        const mineC = b.challenger.toLowerCase() === me
        const mineD = b.kind === 1 && b.opponent.toLowerCase() === me
        const myPlan = mineC ? loadPlan(b.id) : null
        return (
          <div key={b.id} className="chm-log-row">
            <span className="w-12 font-mono text-xs text-[var(--chm-dim)]">
              {b.status === 2 && !lookup ? <Link to={`arena/log/${b.id}`} className="inline-flex min-h-11 items-center underline" aria-label={`Open fight #${b.id}`}>#{b.id}</Link> : `#${b.id}`}
            </span>
            <span className="w-20 font-mono text-[11px] uppercase" style={{ color: b.kind === 0 ? 'var(--chm-ember)' : 'var(--chm-teal)' }}>
              {b.kind === 0 ? 'wild hunt' : 'duel'}
            </span>
            <span className="chm-log-opponents">
              <SpecimenLink className="hover:text-[var(--chm-teal)]" id={b.challengerId}>
                #{b.challengerId}
              </SpecimenLink>{' '}
              <span className="text-[var(--chm-dim)]"> vs </span>{' '}
              <SpecimenLink className="hover:text-[var(--chm-teal)]" id={b.opponentId}>
                #{b.opponentId}
              </SpecimenLink>

            </span>
            {b.status === 1 ? (
              <><span className="chm-log-pending">Awaiting reveal</span>{onReveal && <Button variant="ghost" className={`!py-1 text-xs${b.id === guidedBattle ? ' chm-quest-target' : ''}`} onClick={() => onReveal(b)}>
                Reveal rounds
              </Button>}</>
            ) : (
              <>
                <span className="chm-log-score">{roundBits(b.rounds).filter(Boolean).length}–{roundBits(b.rounds).filter(win => !win).length}<small>{b.kind === 0 ? (b.challengerWon ? 'Captured' : 'Escaped') : b.challengerWon ? 'Challenger won' : 'Defender held'}</small></span>
                <details className="chm-log-details"><summary>Details</summary><div className="chm-log-detail-body">
                <span className="text-xs text-[var(--chm-dim)]">Challenger <Addr a={b.challenger} you={account} />{b.kind === 1 && <> · Defender <Addr a={b.opponent} you={account} /></>}</span>
                <RoundPips rounds={roundBits(b.rounds)} mine={myPlan} theirs={mineC ? peek[b.id] ?? null : null} />
                {mineC && b.kind === 0 && !peek[b.id] && (
                  <button
                    className="flex items-center gap-1 font-mono text-[11px] font-bold text-[var(--chm-dim)] underline hover:text-[#111]"
                    onClick={() => run("Unseal the wild's plan", async () => {
                      const p = await wildPlan(account!, b.id)
                      if (!p) throw new Error('The wild plan is still sealed. Unlock your lab key and try again.')
                      setPeek((x) => ({ ...x, [b.id]: p }))
                      return p
                    }, 'Wild moves revealed', { spec: { kind: 'unsealPlan', me: b.opponentId } })}
                  >
                    <Eye className="h-3 w-3" /> its moves
                  </button>
                )}
                {!lookup && <ProofButton spec={{ mode: 'tactics', id: b.id, title: `Fight #${b.id}`, result: `${b.kind === 0 ? 'Wild hunt' : 'Duel'} · #${b.challengerId} vs #${b.opponentId} · challenger ${b.challengerWon ? 'won' : 'lost'}` }} label="proof" className="text-[var(--chm-dim)]" />}
                </div></details>
                {b.status === 2 && <Button variant="ghost" className="!py-1 text-xs" aria-label={`Replay fight #${b.id}`} onClick={() => {
                  if (sceneActive()) return
                  const [me, foe] = mineD ? [b.opponentId, b.challengerId] : [b.challengerId, b.opponentId]
                  openScene({ kind: 'battle', me, foe, mode: b.kind, replay: true }, `Replay fight #${b.id}`)
                  sceneDone({ battleId: b.id, won: mineD ? !b.challengerWon : b.challengerWon, rounds: roundBits(b.rounds).map((win) => mineD ? !win : win), mine: mineC ? myPlan ?? undefined : undefined, theirs: mineC ? peek[b.id] : undefined })
                }}>Replay</Button>}
                {lookup && <div className="col-span-full">
                  <ProofButton spec={{ mode: 'tactics', id: b.id, title: `Fight #${b.id}` }} label="Verify the rounds" className="chm-btn chm-btn-primary min-h-11 no-underline" />
                </div>}
              </>
            )}
          </div>
        )
      })}
    </Panel>}
    </section>
  )
}

/** Defenders still parked in the first (pre-season) arena can be recalled with their stake. */
function LegacyDefenders({ run }: { run: Run }) {
  const { account } = useWallet()
  const refresh = useRefresh()
  const old = useDefenders()
  const mine = (old.data ?? []).filter((d) => d.active && d.keeper.toLowerCase() === account?.toLowerCase())
  if (!mine.length) return null
  return (
    <Panel className="flex flex-wrap items-center gap-3 p-4">
      <div className="flex-1 text-sm">
        <b>Pre-season arena:</b> {mine.length} of your defenders still wait in the old arena. Recall them to get your stake back.
      </div>
      {mine.map((d) => (
        <Button key={d.id} variant="ghost" className="!py-1 text-xs" onClick={() => run('Recall old defender', (st) => withdrawDefender(d.id, st), 'Recalled, stake refunded', { spec: { kind: 'recall', me: d.id } }).then((r) => r && refresh('defenders', 'balHandle'))}>
          Recall #{d.id}
        </Button>
      ))}
    </Panel>
  )
}
