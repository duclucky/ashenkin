import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronDown, Flag, Lock, Pause, Tent, Footprints } from 'lucide-react'
import { formatEther } from 'viem'
import { ACTIVE_WORLD, EXPLORER, useWallet } from '../chain'
import { keeperRequest } from '../keeper-api'
import { Button, CreatureCard, Link, Panel } from '../ui'
import { fmtDuration, useCreature, useMyCreatures, useNow, useRefresh, useTraits, useZones } from '../hooks'
import CreatureArt from '../CreatureArt'
import { Backdrop } from './art'
import { ZONE_META } from './world-encounters'
import './patrol-camp.css'

type Entry = { at: number; type: string; hash?: string; expeditionId?: number }
type Patrol = {
  id: string; creatureId: number; zone: number; trips: number; completed: number;
  phase: string; active: boolean; stopped: boolean; budgetWei: string; spentWei: string;
  expiresAt: number; startedAt?: number; endsAt?: number; expeditionId?: number;
  issue?: string; journal: Entry[];
}
type Camp = { enabled: boolean; consent: string; jobs: Patrol[] }
const STATUS: Record<string, string> = {
  ready: 'Ready at camp', preparing: 'Preparing the trail', departing: 'Crossing the gate',
  away: 'Out on patrol', returning: 'Bringing your Xeno home', paused: 'Camp needs attention',
  complete: 'Patrol complete', stopped: 'Resting at camp',
}
const JOURNAL: Record<string, string> = {
  assigned: 'Sable packed the field kit.', approved: 'The expedition gate is ready.',
  departed: 'Your Xeno crossed into the wilds. Its fate is sealed.',
  trail: 'Following the old Arkhive trail.', survey: 'Surveying the ruins. The field report remains sealed.',
  returned: 'Home again. XP and any payable loot have been collected.',
  'manual-return': 'You brought your Xeno home.', complete: 'All assigned trips finished. Time to rest.',
  stopped: 'No further trips. Your Xeno is resting.', failed: 'An action failed. Check its chain receipt.',
}

export function PatrolCamp() {
  const { account, mode } = useWallet()
  const mine = useMyCreatures(account)
  const zones = useZones()
  const now = useNow(1000)
  const refresh = useRefresh()
  const [pick, setPick] = useState<number | null>(null)
  const [zone, setZone] = useState(0)
  const [trips, setTrips] = useState(3)
  const [budget, setBudget] = useState('0.01')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const camp = useQuery({
    queryKey: ['patrols', account],
    queryFn: () => keeperRequest<Camp>(`patrols?address=${account}`),
    enabled: !!account && mode === 'circle' && ACTIVE_WORLD === 'ashenkin',
    refetchInterval: 5000, retry: 1,
  })
  const job = camp.data?.jobs.find(p => p.active)
  const latest = job || camp.data?.jobs[0]
  const specimen = job?.creatureId ?? pick ?? mine.data?.[0] ?? latest?.creatureId ?? null
  const base = useCreature(specimen ?? undefined)
  const traits = useTraits(base.data)
  const route = job?.zone ?? zone
  const duration = zones.data?.[route]?.duration ?? [600, 1800, 3600][route]
  const progress = job?.startedAt && job.endsAt ? Math.max(0, Math.min(1, (now - job.startedAt) / (job.endsAt - job.startedAt))) : 0
  const completed = latest?.completed ?? 0
  const status = job?.stopped ? (job.expeditionId != null ? 'Last trip · returning to camp' : 'Stopping patrol') : job ? STATUS[job.phase] : 'Camp is open'
  const refreshed = useRef('')
  useEffect(() => {
    if (pick != null && mine.data && !mine.data.includes(pick)) setPick(null)
  }, [mine.data, pick])
  useEffect(() => {
    const key = `${latest?.id}:${completed}`
    if (completed && refreshed.current !== key) {
      refreshed.current = key
      void refresh('mine', 'expeditions', 'training', 'xpRoom', 'bal', 'balHandle', 'economy')
    }
  }, [completed, latest?.id, refresh])

  async function act(stop = false) {
    if (!account || busy) return
    setBusy(true); setError('')
    try {
      if (stop && job) await keeperRequest(`patrols/${job.id}/stop`, { address: account })
      else await keeperRequest('patrols', { address: account, creatureId: specimen, zone, trips, budget, consent: consent ? camp.data?.consent : null })
      setConsent(false)
      await camp.refetch()
    } catch (e) { setError(e instanceof Error ? e.message : 'The camp could not save your instructions.') }
    finally { setBusy(false) }
  }

  return <section className="patrol-camp" aria-labelledby="patrol-title">
    <div className="patrol-scene" role="img" aria-label={`Specimen ${specimen ?? ''} at the ${ZONE_META[route].name} patrol camp`}>
      <Backdrop theme="zone" zone={route} tint="#ffdd00" />
      <div className="patrol-scene-shade" />
      <div className="patrol-scene-title"><span className="patrol-kicker"><Tent size={14} aria-hidden="true" /> SABLE’S FIELD CAMP</span><h2 id="patrol-title">The wilds don’t sleep.</h2><p>Your Xeno can explore while you’re away.</p></div>
      <svg className="patrol-tent" viewBox="0 0 80 50" shapeRendering="crispEdges" aria-hidden="true">
        <path d="M4 46 36 6h8l32 40Z" fill="#181a18" /><path d="M9 43 38 9l29 34Z" fill="#ffdd00" /><path d="M38 9 65 43H38Z" fill="#c29b19" /><path d="m22 43 16-24 12 24Z" fill="#1b2020" /><path d="M1 46h78v4H1Z" fill="#141715" /><path d="M38 0h3v15h-3Z" fill="#f7f5ee" /><path d="M41 1h16v9H41Z" fill="#ffdd00" />
      </svg>
      <div className={`patrol-xeno ${job?.phase === 'away' ? 'patrol-walking' : ''}`}><CreatureArt seed={specimen ?? 1} traits={traits.data} size={140} /></div>
      <div className="patrol-fire" aria-hidden="true"><i /><i /><i /><b /></div>
      <div className="patrol-scene-status"><span className={`patrol-dot ${job ? 'patrol-dot-active' : ''}`} />{status}{job?.endsAt && job.expeditionId != null && <span>{now < job.endsAt ? fmtDuration(job.endsAt - now) : 'Return due'}</span>}</div>
      {job?.expeditionId != null && <div className="patrol-progress" role="progressbar" aria-label="Current expedition progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ transform: `scaleX(${progress})` }} /></div>}
    </div>

    {(!account || mode !== 'circle') ? <Panel><p className="font-bold">Sign in with a wallet or email to use your game wallet’s camp.</p><p className="mt-2 text-sm">Mint an NFT first, then assign it a patrol.</p></Panel> : ACTIVE_WORLD !== 'ashenkin' ? <Panel>Offline patrols belong to the Ashenkin world.</Panel> : camp.isError ? <Panel><p>Could not reach the camp. Your saved patrol keeps its instructions.</p><Button variant="ghost" onClick={() => camp.refetch()}>Retry camp connection</Button></Panel> : camp.data && !camp.data.enabled ? <Panel>The camp is not available on this server yet.</Panel> : job ? <Panel className="patrol-orders">
      <div className="patrol-order-heading"><div><span className="patrol-kicker">ACTIVE ORDERS · #{job.creatureId}</span><h3>{ZONE_META[job.zone].name}</h3></div><strong>{job.completed}/{job.trips}<small> trips home</small></strong></div>
      <p className="text-sm">You can close the game. Sable follows these orders for up to eight hours.</p>
      <div className="patrol-receipt"><span>Gas used <b>{eth(job.spentWei)} ETH</b></span><span>Your limit <b>{eth(job.budgetWei)} ETH</b></span></div>
      {job.issue && <p className="patrol-issue" role="status">{job.issue}</p>}
      <Button variant="ghost" busy={busy} disabled={job.stopped} onClick={() => act(true)}><Pause size={16} aria-hidden="true" />{job.stopped ? 'No more departures' : 'Stop after this trip'}</Button>
      <p className="patrol-fine">Stopping cancels future departures. A pending departure may still finish; an away Xeno is brought home first.</p>
      {job.stopped && job.expeditionId != null && <Link to="expeditions/manual" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold underline">Manual return <ArrowRight size={14} /></Link>}
    </Panel> : <div className="patrol-setup">
      {latest && <div className="patrol-welcome" role="status"><Check size={18} aria-hidden="true" /><div><b>While you were away</b><p>{latest.completed} trip{latest.completed === 1 ? '' : 's'} home · #{latest.creatureId} · {STATUS[latest.phase]}</p></div></div>}
      <div className="patrol-section-title"><h3>Who takes the trail?</h3><span>One Xeno per patrol</span></div>
      {mine.data?.length ? <div className="patrol-roster">{mine.data.map(id => <div key={id}><CreatureCard id={id} compact selected={specimen === id} onClick={() => setPick(id)} /></div>)}</div> : <Panel><p>No available Xeno at camp. Bring one home or hatch your first NFT.</p><Link to="lab" className="inline-flex min-h-11 items-center gap-2 font-bold underline">Visit the Lab <ArrowRight size={16} /></Link></Panel>}
      <fieldset><legend>Choose a trail</legend><div className="patrol-route-options">{[0, 1, 2].map(id => <button type="button" key={id} onClick={() => setZone(id)} aria-pressed={zone === id}><Flag size={16} aria-hidden="true" /><b>{ZONE_META[id].name}</b><span>{fmtDuration(zones.data?.[id]?.duration ?? [600, 1800, 3600][id])}</span></button>)}</div></fieldset>
      <fieldset><legend>Trips before resting</legend><div className="patrol-trip-options">{[1, 3, 6].map(n => <button type="button" key={n} onClick={() => setTrips(n)} aria-pressed={trips === n}>{n}<small>{n === 1 ? 'trip' : 'trips'}</small></button>)}</div><p className="patrol-fine">About {fmtDuration(duration * trips)} + chain confirmations. Daily expedition and XP limits apply.</p></fieldset>
      <details className="patrol-budget"><summary>Gas limit <b>{budget} Sepolia ETH</b><ChevronDown size={15} aria-hidden="true" /></summary><div><label htmlFor="patrol-budget">Maximum total gas spend</label><input id="patrol-budget" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} /><p className="patrol-fine">0.004–0.05 ETH. Paid by your game wallet; unused ETH stays there. Gas must cover approvals, departures and returns. The camp pauses if fees exceed 0.1 gwei. No automatic top-ups.</p></div></details>
      <label className="patrol-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Allow Sable to approve expedition custody, send and return this Xeno for up to {trips} trips within eight hours, spending at most {budget} Sepolia ETH on gas while I’m offline.</span></label>
      <Button className="w-full" busy={busy} disabled={!specimen || !consent || !camp.data?.enabled} onClick={() => act()}><Footprints size={17} aria-hidden="true" /> Begin offline patrol</Button>
      <p className="patrol-fine patrol-privacy"><Lock size={14} aria-hidden="true" /> Zama seals the outcome. Only you can open the field report. Loot depends on the route, outcome and Treasury availability.</p>
    </div>}
    {error && <p className="patrol-issue" role="alert">{error}</p>}
    {latest && <section className="patrol-journal" aria-label="Patrol journal"><div className="patrol-section-title"><h3>Trail journal</h3><span>Saved at camp</span></div><ol>{latest.journal.filter(e => JOURNAL[e.type]).slice(-10).reverse().map((entry, i) => <li key={`${entry.at}:${i}`}><span className="patrol-journal-mark" /><div><time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</time><p>{JOURNAL[entry.type]}</p>{entry.hash && <a href={`${EXPLORER}/tx/${entry.hash}`} target="_blank" rel="noreferrer">Chain receipt ↗</a>}</div></li>)}</ol></section>}
  </section>
}

function eth(wei: string) { return Number(formatEther(BigInt(wei))).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') || '0' }
