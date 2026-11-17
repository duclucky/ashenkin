import { useState } from 'react'
import { formatUnits, isAddressEqual, zeroAddress } from 'viem'
import { Shield, Trophy } from 'lucide-react'
import { useWallet } from '../chain'
import { fmtDuration, useMyCreatures, useNow } from '../hooks'
import { Location } from '../game/Location'
import { PlanPicker, RoundPips } from '../game/Tactics'
import { roundBits } from '../season'
import { TOURNAMENT, sealTournamentPlan, settleTournamentMatch, tournamentWrite, useTournament, verifyTournamentRounds } from '../tournament'
import { Addr, Button, Empty, Label, Link, Panel, useAction } from '../ui'

type Match = NonNullable<ReturnType<typeof useTournament>['state']['data']>['matches'][number]
const ROUND_NAMES = ['Quarterfinals', 'Semifinals', 'Final']
const ROUND_SLOTS = [[0, 1, 2, 3], [4, 5], [6]]

export default function Tournament() {
  const { account } = useWallet()
  const now = useNow(1000)
  const { info, state } = useTournament(account)
  const { run, busy } = useAction()
  const mine = useMyCreatures(account)
  const [specimen, setSpecimen] = useState('')
  const cup = state.data
  const details = info.data
  const joined = cup?.entered || 0
  const amount = (value: bigint) => details && `${formatUnits(value, details.decimals)} ${details.symbol}`
  const reload = () => void state.refetch()

  return <div className="space-y-4">
    <Location place="arena"><Link to="arena" className="underline">Back to Colosseum</Link></Location>
    <Panel className="space-y-4 p-4">
      <div className="flex items-center gap-3"><Trophy size={26} aria-hidden="true" /><h2 className="font-display text-2xl">Colosseum Cup</h2></div>
      <p className="text-sm">Eight keepers. Three sealed rounds per match. No entry stake.</p>
      <div className="flex items-start gap-2 text-sm"><Shield size={17} className="shrink-0" aria-hidden="true" /> Zama limits the power gap to 10 after elemental bonuses. Score ties use a fresh Zama roll.</div>
      {!TOURNAMENT && <p className="text-sm font-bold">The tournament contract is awaiting deployment.</p>}
      {TOURNAMENT && (info.isError || state.isError ? <Empty title="Cup details unavailable"><Button variant="ghost" onClick={() => { void info.refetch(); reload() }}>Retry</Button></Empty> : !details || !cup ? <p role="status">Reading the prize escrow…</p> : <>
        <div className="space-y-1">
          <Label>{['Awaiting the prize deposit', 'Registration', 'In play', 'Cup ended', 'Cup cancelled'][cup.status]}</Label>
          <p className="break-words font-mono font-bold">{amount(details.prize)} {cup.status === 0 ? 'announced' : cup.status < 3 ? 'committed' : 'total prize'}</p>
          <p className="text-xs">60% winner · 20% runner-up · 10% each semifinalist</p>
        </div>
        {cup.status === 1 && <div className="space-y-2 text-sm">
          <p>{cup.joined} / 8 registered · {now < details.endsAt ? `closes in ${fmtDuration(details.endsAt - now)}` : 'registration closed'}</p>
          {!account && <p>Connect your wallet to enter.</p>}
          {!!account && !!joined && <p>Specimen #{joined} is registered.</p>}
          {!!account && !cup.invited && <p>Entry is limited to the eight invited keepers.</p>}
          {!!account && cup.invited && !joined && now < details.endsAt && <>
            <label className="block" htmlFor="cup-specimen">Specimen</label>
            <select id="cup-specimen" className="chm-input min-h-11 w-full" value={specimen} onChange={e => setSpecimen(e.target.value)}>
              <option value="">Choose your specimen</option>
              {(mine.data ?? []).map(id => <option key={id} value={id}>#{id}</option>)}
            </select>
            <Button className="min-h-11" disabled={!specimen || !!busy} onClick={() => run('Register', () => tournamentWrite('join', [BigInt(specimen)]), 'Specimen registered').then(reload)}>Register specimen</Button>
          </>}
          {!!account && (cup.joined === 8 || now >= details.endsAt) && <Button className="min-h-11" disabled={!!busy} onClick={() => run('Start cup', () => tournamentWrite('start'), cup.joined === 8 ? 'Bracket started' : 'Prize released for refund').then(reload)}>{cup.joined === 8 ? 'Start bracket' : 'Cancel unfilled cup'}</Button>}
        </div>}
        {!!account && cup.claimable > 0n && <Button className="min-h-11" disabled={!!busy} onClick={() => run('Claim prize', () => tournamentWrite('claim', [account]), 'Transfer confirmed').then(reload)}>Claim {amount(cup.claimable)}</Button>}
      </>)}
    </Panel>
    {cup && (cup.status === 2 || cup.status === 3) && ROUND_SLOTS.map((ids, index) => <Panel key={index} className="space-y-3 p-4">
      <h3 className="font-display text-xl">{ROUND_NAMES[index]}</h3>
      {ids.map(id => <MatchCard key={`${id}:${account}`} match={cup.matches[id]} now={now} reload={reload} />)}
    </Panel>)}
  </div>
}

function MatchCard({ match, now, reload }: { match: Match; now: number; reload: () => void }) {
  const { account } = useWallet()
  const { busy, run } = useAction()
  const [plan, setPlan] = useState([0, 1, 2])
  const [verified, setVerified] = useState(false)
  const { id, left, right, winner, deadline, sealed, done, forfeit, rounds } = match
  const seat = account && isAddressEqual(account, left) ? 1 : account && isAddressEqual(account, right) ? 2 : 0
  const keeper = (address: typeof left) => isAddressEqual(address, zeroAddress) ? 'Open slot' : <Addr a={address} you={account} />

  if (!deadline) return <p className="text-sm">Waiting for the previous round</p>

  return <article className="space-y-2 border-t border-[var(--chm-line)] pt-3 text-sm">
    <div className="font-bold">{keeper(left)} vs {keeper(right)}</div>
    {done ? <>
      <p>{isAddressEqual(winner, zeroAddress) ? 'No winner' : <>Winner {keeper(winner)}</>}{forfeit && ' · forfeit'}</p>
      {!forfeit && <><RoundPips rounds={roundBits(rounds)} />
        {verified ? <p role="status">All three rounds match Zama’s proof.</p> : <Button variant="ghost" className="min-h-11" busy={busy === 'Verify rounds'} onClick={async () => {
          const result = await run('Verify rounds', () => verifyTournamentRounds(id, rounds), 'All three rounds verified')
          if (result) setVerified(true)
        }}>Verify rounds</Button>}
      </>}
    </> : sealed === 3 ? <>
      <p>Both plans sealed. Ready for Zama proof.</p>
      {account && <Button className="min-h-11" disabled={!!busy} onClick={() => run('Settle match', step => settleTournamentMatch(id, step), 'Match settled').then(reload)}>Settle match</Button>}
    </> : now >= deadline ? <>
      <p>Plan deadline passed.</p>
      {account && <Button variant="ghost" className="min-h-11" disabled={!!busy} onClick={() => run('Resolve forfeit', () => tournamentWrite('resolveNoShow', [id]), 'Match recorded').then(reload)}>Resolve forfeit</Button>}
    </> : <>
      <p>{sealed ? 'One plan sealed' : 'Waiting for plans'} · {fmtDuration(deadline - now)} left</p>
      {!!account && !!seat && !(sealed & seat) && <>
        <PlanPicker plan={plan} onChange={setPlan} label="Choose three commands" />
        <Button className="min-h-11" disabled={!!busy} onClick={() => run('Seal plan', step => sealTournamentPlan(account, id, plan, step), 'Plan sealed').then(reload)}>Seal my plan</Button>
      </>}
    </>}
  </article>
}
