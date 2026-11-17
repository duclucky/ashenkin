import { ChevronDown, Egg, KeyRound } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { EnergyPips } from '../game/hud'
import { GuestGate } from '../game/GuestGate'
import { Button, CreatureCard, Empty, Link, Panel, Stat, useAction, BusyNote } from '../ui'
import { travel } from '../game/Transition'
import { DEPLOYED, errorText, GAS_FAUCET, useWallet } from '../chain'
import { useAccountStats, useEthBalance, useMyCreatures, useNow, useRefresh, fmtDuration, useLabKeyReady } from '../hooks'
import { hatch } from '../actions'
import { labKey } from '../fhe'
import Habitat from '../game/Habitat'
import { Location } from '../game/Location'
import { useTStats } from '../season'
import { keeperGuideEnabled } from '../game/keeper-story'

export default function Lab() {
  const { account } = useWallet()
  const mine = useMyCreatures(account)
  const stats = useAccountStats(account)
  const eth = useEthBalance(account)
  const tactics = useTStats(account)
  const keyReady = useLabKeyReady(account)
  const query = useQueryClient()
  const refresh = useRefresh()
  const now = useNow(1000)
  const { busy, run, status } = useAction()

  if (!DEPLOYED) return <Empty title="The lab opens once the contracts are live">Check the Journal for the specimen atlas while you wait.</Empty>
  if (!account)
    return <div className="space-y-5"><Location place="lab" /><GuestGate place="lab" /></div>

  const s = stats.data
  const left = s ? 3 - s.genesis : 0
  const refillIn = s && s.energy < 3 ? s.refill - now : 0
  const guide = keeperGuideEnabled()
  const firstHatch = guide && s?.genesis === 0 && mine.data?.length === 0
  const needsGas = firstHatch && eth === 0n
  const readyForHunt = guide && !!mine.data?.length && tactics.data?.wins === 0 && tactics.data.losses === 0

  async function doHatch() {
    const r = await run('Hatch embryo', (st) => hatch(st), 'An embryo has been sealed', { spec: { kind: 'hatch', firstHatch } })
    if (!r?.id) return
    if (r.owner?.toLowerCase() === account?.toLowerCase()) {
      query.setQueryData<number[]>(['mine', account], current => current?.includes(r.id) ? current : [r.id, ...(current ?? [])])
    }
    refresh('mine', 'account', 'world', 'quests')
  }

  return (
    <div className="space-y-5">
      <Location place="lab" actions={left > 0 && <Button onClick={doHatch} busy={busy === 'Hatch embryo'} className={firstHatch && !needsGas ? 'chm-quest-target' : ''}><Egg className="h-4 w-4" /> Hatch embryo · {left} left</Button>}><span className="flex items-center gap-2">Lab energy <EnergyPips value={s?.energy} size={16} />{refillIn > 0 && <span>· refills in {fmtDuration(refillIn)}</span>}</span></Location>
      {needsGas && <Panel className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
        <p>Hatching uses a little Sepolia ETH for gas.</p>
        <a href={GAS_FAUCET} target="_blank" rel="noreferrer" className="chm-btn chm-btn-primary chm-quest-target">Get Sepolia ETH</a>
      </Panel>}
      {readyForHunt && <Panel className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
        <p>Your specimen is ready for its first hunt.</p>
        <Link to="arena" className="chm-btn chm-btn-primary chm-quest-target">Enter the Colosseum</Link>
      </Panel>}
      {busy && mine.data?.length ? <BusyNote status={status} className="ml-auto -mt-4 justify-end" /> : null}



      {mine.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="chm-card h-[250px] animate-pulse" />
          ))}
        </div>
      ) : mine.error ? (
        <Empty title="Could not read your specimens">{errorText(mine.error)}</Empty>
      ) : !mine.data?.length ? (
        <Empty title="Your lab is empty">
          {left > 0 ? 'Use Hatch embryo to begin your collection.' : 'Creatures at home will appear here.'}
        </Empty>
      ) : (
        <>
        <Habitat ids={mine.data} />
      {!keyReady && (
        <details className="chm-lab-key">
          <summary><KeyRound className="h-4 w-4" aria-hidden="true" /> Read your sealed genes <ChevronDown className="ml-auto h-4 w-4" aria-hidden="true" /></summary>
          <div className="flex flex-wrap items-center gap-3 px-3 pb-3">
            <p className="min-w-36 flex-1 text-sm">Sign once to read your private genes and cZAMA balance in this browser for 30 days. No gas required.</p>
            <Button busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', () => labKey(account), 'Lab key unlocked')}>Unlock lab key</Button>
          </div>
        </details>
      )}
        <details className="chm-panel px-4"><summary className="min-h-11 cursor-pointer py-3 font-bold">Collection details · {mine.data.length}</summary>
        <Panel className="flex flex-wrap items-center gap-5 px-4 py-3 sm:px-6">
          <Stat
            label="Lab energy"
            value={
              <EnergyPips value={s?.energy} size={20} className="py-0.5" />
            }
            hint="Sequencing a gene costs 1 energy. Refills to 3 every 24 hours."
          />
          {refillIn > 0 && <Stat label="Refill in" value={fmtDuration(refillIn)} />}
          <Stat label="Colosseum record" value={tactics.data ? `${tactics.data.wins}W · ${tactics.data.losses}L` : '—'} />
          <Stat label="Captured" value={tactics.data?.captures ?? '—'} />
        </Panel>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {mine.data.map((id) => (
            <CreatureCard key={id} id={id} onClick={() => travel(`creature/${id}`)} />
          ))}
        </div>
        </details>
        </>
      )}
    </div>
  )
}
