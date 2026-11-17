import { Location } from '../game/Location'
import { CalendarCheck, Check, Flame, Gift, Lock } from 'lucide-react'
import { GuestGate } from '../game/GuestGate'
import { Button, Empty, Label, Link, Panel, useAction } from '../ui'
import { DEPLOYED, useWallet } from '../chain'
import { useNow, useQuests, useRefresh, fmtDuration, fmtZama } from '../hooks'
import { checkIn, claimAllQuests, claimChest, claimTask } from '../actions'
import { useQuestBatchAvailable, useQuestPaid } from '../economy'

const TASKS = [
  { name: 'Breed or hatch', blurb: 'Hatch a genesis embryo or breed two specimens.', to: 'breed', color: '#FF8FC7' },
  { name: 'Win or lose a fight', blurb: 'Settle a hunt or duel you started in the Colosseum.', to: 'arena', color: '#FF7020' },
  { name: 'Send an expedition', blurb: 'Send any creature to any zone.', to: 'expeditions', color: '#5AC8FA' },
  { name: 'Strike the World Boss', blurb: 'Land at least one hit on the current boss.', to: 'raid', color: '#3DDC97' },
] as const

const CHECKIN = 1
const TASK = 2
const CHEST = 10

export default function Quests() {
  const { account } = useWallet()
  const q = useQuests(account)
  const paid = useQuestPaid(account)
  const batch = useQuestBatchAvailable(!!account).data === true
  const refresh = useRefresh()
  const { busy, run } = useAction()
  const now = useNow(1000)

  if (!DEPLOYED) return <Empty title="Quests open once the contracts are live" />
  if (!account) return <div className="space-y-5"><Location place="quests" /><GuestGate place="quests" /></div>
  const s = q.data
  const resetIn = 86400 - (now % 86400)
  const mult = s?.multiplier ?? 100
  const fmtTarget = (base: number, rate: number) => ((base * rate) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const doneCount = s ? [0, 1, 2, 3].filter((i) => s.done & (1 << i)).length : 0
  // multiplier preview for tomorrow's check-in
  const streakNow = s?.streak ?? 0
  const after = (st: number) => 100 + Math.min(Math.max(st - 1, 0), 10) * 10
  const checkInRate = after(s && s.lastCheckIn + 1 === s.today ? streakNow + 1 : 1)
  const checkInDue = !!s && !s.checkedIn
  const tasksReady = s ? TASKS.filter((_, i) => (s.done & (1 << i)) && !(s.claimedMask & (1 << i))).length : 0
  const chestReady = doneCount === TASKS.length && !s?.chestClaimed
  const batchBase = (checkInDue ? CHECKIN : 0) + tasksReady * TASK + (chestReady ? CHEST : 0)
  const batchRate = checkInDue ? checkInRate : mult
  const amt = (base: number) => fmtTarget(base, batch ? batchRate : mult)

  async function act(title: string, fn: (st: (m: string, h?: string) => void) => Promise<unknown>, ok: string) {
    await run(title, fn as any, ok)
    refresh('quests', 'bal', 'balHandle', 'economy', 'rewardBudget', 'questPaidHandle', 'questPaid')
  }

  return (
    <div className="space-y-8">
      <Location place="quests"><span>Resets in {fmtDuration(resetIn)}</span></Location>
      <p className="text-sm">Rewards below are targets. Your actual receipt depends on Treasury funding and its active budget.</p>
      {paid.exists && <Panel className="p-3" ><b>Last quest receipt</b><p>{paid.value != null ? `${fmtZama(paid.value)} cZAMA received` : paid.error ? 'Could not read the receipt' : paid.keyReady ? 'Reading your private receipt…' : 'Unlock your lab key to read the amount'}</p></Panel>}
        <Panel className="flex flex-col p-6">
          <div className="flex items-start justify-between">
            <div>
              <Label>Streak</Label>
              <div className="mt-1 flex items-center gap-2 font-display text-6xl">
                <Flame className="h-12 w-12 text-[#FF7020]" strokeWidth={2.5} /> {s ? streakNow : '…'}
              </div>
              <div className="font-mono text-xs text-[var(--chm-dim)]">best {s?.bestStreak ?? 0} days</div>
            </div>
            <div className="border-[3px] border-[#111] bg-[var(--chm-yellow)] px-3 py-2 text-center shadow-[4px_4px_0_#111]">
              <div className="font-mono text-[10px] font-bold uppercase">Multiplier</div>
              <div className="font-display text-3xl">{(mult / 100).toFixed(1)}×</div>
            </div>
          </div>
          <div className="mt-5 flex gap-1.5">
            {Array.from({ length: 11 }, (_, i) => {
              const lit = i < streakNow
              return (
                <div key={i} className="flex-1 border-[3px] border-[#111] text-center" style={{ background: lit ? '#FF7020' : '#fff' }}>
                  <div className="py-1.5 font-mono text-[10px] font-bold">{i === 10 ? '2×' : `d${i + 1}`}</div>
                </div>
              )
            })}
          </div>
          <div className="mt-auto pt-5">
            {s?.checkedIn ? (
              <div className="flex items-center gap-2 border-[3px] border-[#111] bg-[#3DDC97] px-4 py-3 font-bold shadow-[4px_4px_0_#111]">
                <Check className="h-5 w-5" /> Checked in today · tomorrow’s target {(after(streakNow + 1) / 100).toFixed(1)}×
              </div>
            ) : !batch && (
              <Button className="w-full !py-3 text-base" disabled={!s || !!busy} busy={busy === 'Check in'} onClick={() => act('Check in', (st) => checkIn(st), 'Checked in — streak extended')}>
                <CalendarCheck className="h-5 w-5" /> Check in · up to {fmtTarget(CHECKIN, checkInRate)} cZAMA
              </Button>
            )}
            {batch && s && batchBase > 0 && <div className="mt-3 space-y-2">
              <Button className="w-full !py-3 text-base" disabled={!!busy} busy={busy === 'Claim all'} onClick={() => act('Claim all', st => claimAllQuests(s.today, st), 'Daily rewards processed')}>
                <Gift className="h-5 w-5" /> {batchBase === CHECKIN ? 'Check in' : 'Claim all'} · up to {fmtTarget(batchBase, batchRate)} cZAMA
              </Button>
              {batchBase > CHECKIN && <p className="text-sm text-[var(--chm-dim)]">{[
                checkInDue && 'Today’s check-in',
                tasksReady > 0 && `${tasksReady} task ${tasksReady === 1 ? 'reward' : 'rewards'}`,
                chestReady && 'Daily chest',
              ].filter(Boolean).join(' · ')}</p>}
            </div>}
            {!batch && checkInDue && <p className="mt-2 text-xs text-[var(--chm-dim)]">Check in first: the multiplier only applies to quest rewards after you've checked in today.</p>}
          </div>
        </Panel>
      <div>
        <div className="mb-3 flex items-end justify-between">
          <Label>Today's tasks · {doneCount}/4 done</Label>
          <span className="font-mono text-xs text-[var(--chm-dim)]">up to {amt(TASK)} cZAMA each</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TASKS.map((t, i) => {
            const done = !!s && !!(s.done & (1 << i))
            const claimed = !!s && !!(s.claimedMask & (1 << i))
            return (
              <div key={i} className="chm-panel flex flex-col">
                <div className="flex items-center justify-between border-b-[3px] border-[#111] px-4 py-2" style={{ background: t.color }}>
                  <span className="font-mono text-xs font-bold uppercase">Task {i + 1}</span>
                  {claimed ? <Check className="h-4 w-4" /> : done ? <Gift className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="font-display text-xl">{t.name}</div>
                  <p className="mt-1 text-sm text-[var(--chm-dim)]">{t.blurb}</p>
                  <div className="mt-auto pt-4">
                    {claimed ? (
                      <div className="border-2 border-[#111] bg-[var(--chm-gray)] px-3 py-2 text-center font-mono text-xs font-bold">Reward claimed</div>
                    ) : done && batch ? (
                      <div className="text-sm font-bold">Ready to claim</div>
                    ) : done && !s?.checkedIn ? (
                      <Button className="w-full" variant="ghost" disabled title="The streak multiplier only applies after today's check-in">
                        Check in first
                      </Button>
                    ) : done ? (
                      <Button className="w-full" busy={busy === `Task ${i}`} onClick={() => act(`Task ${i}`, (st) => claimTask(i, st), 'Task reward processed')}>
                        Claim · up to {amt(TASK)} cZAMA
                      </Button>
                    ) : (
                      <Link to={t.to} className="chm-btn chm-btn-ghost w-full">
                        Go do it →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Panel className="flex flex-wrap items-center gap-6 p-6" style={{ background: doneCount === 4 ? '#FFDD00' : '#fff' }}>
        <ChestArt open={!!s?.chestClaimed} />
        <div className="min-w-[220px] flex-1">
          <div className="font-display text-3xl">Daily chest</div>
          <p className="mt-1 text-sm text-[var(--chm-dim)]">Finish all four tasks to open it: up to {amt(CHEST)} cZAMA at your current multiplier.</p>
          <div className="mt-3 flex h-4 max-w-sm border-[3px] border-[#111] bg-white">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex-1 border-r-2 border-[#111] last:border-r-0" style={{ background: i < doneCount ? '#111' : 'transparent' }} />
            ))}
          </div>
        </div>
        {s?.chestClaimed ? (
          <span className="border-[3px] border-[#111] bg-[#3DDC97] px-4 py-2 font-bold">Opened today</span>
        ) : batch ? (
          <span className="text-sm font-bold">{chestReady ? 'Ready to claim' : `${4 - doneCount} tasks to go`}</span>
        ) : (
          <Button variant="gold" disabled={doneCount < 4 || !s?.checkedIn} busy={busy === 'Chest'} onClick={() => act('Chest', (st) => claimChest(st), 'Chest reward processed')}>
            <Gift className="h-4 w-4" /> {doneCount < 4 ? `${4 - doneCount} tasks to go` : !s?.checkedIn ? 'Check in first' : 'Open the chest'}
          </Button>
        )}
      </Panel>

      <div className="flex flex-wrap gap-6 font-mono text-sm">
        <span>
          Lifetime quest reward targets: <b>{s ? fmtZama(s.earned) : '…'} cZAMA</b>
        </span>
        <span className="text-[var(--chm-dim)]">Rewards come from the Treasury, which is refilled by 40% of every breeding fee.</span>
      </div>
    </div>
  )
}

/* 16×14 pixel chest */
function ChestArt({ open }: { open: boolean }) {
  const rows = open
    ? ['....########....', '...#YYYYYYYY#...', '..#YYYYYYYYYY#..', '.##############.', '#OOOOOOOOOOOOOO#', '#OOOOOO##OOOOOO#', '################', '#BBBBBB##BBBBBB#', '#BBBBBYYYYBBBBB#', '#BBBBBB##BBBBBB#', '#BBBBBBBBBBBBBB#', '#BBBBBBBBBBBBBB#', '################', '................']
    : ['................', '................', '..############..', '.#OOOOOOOOOOOO#.', '#OOOOOOOOOOOOOO#', '#OOOOOOOOOOOOOO#', '#######YY#######', '#BBBBBBYYBBBBBB#', '#BBBBBB##BBBBBB#', '#BBBBBBBBBBBBBB#', '#BBBBBBBBBBBBBB#', '#BBBBBBBBBBBBBB#', '################', '................']
  const C: Record<string, string> = { '#': '#111', Y: '#FFDD00', O: '#FF7020', B: '#c24d0c' }
  return (
    <svg viewBox="0 0 16 14" width={112} height={98} shapeRendering="crispEdges" className={open ? '' : 'chm-pxbob-slow'} style={{ imageRendering: 'pixelated' }}>
      {rows.flatMap((r, y) => [...r].map((ch, x) => (C[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={C[ch]} /> : null)))}
    </svg>
  )
}
