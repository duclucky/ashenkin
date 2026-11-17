import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { COLOSSEUM, DEPLOYED, TRAINING } from './chain'
import { fetchTraining, useExpeditions, useListings, useMyCreatures, useNow, usePendingEggs, useRaid } from './hooks'
import { claimExpedition, claimShare, completeTraining, finalize, hatchEgg } from './actions'
import { loadPlan, oracleClaim, tacticsSettle, useKeeperBattles, useMyGuesses } from './season'
import { xpGrantedFromReceipt } from './game/expedition-progression'
import { raffleDraw, useRaffle } from './raffle'
import type { SceneSpec } from './game/store'

type Step = (s: string, hash?: string) => void

/** Something the keeper started that still needs one more transaction (usually with a KMS proof). */
export type PendingItem = {
  key: string
  kind: 'egg' | 'expedition' | 'training' | 'battle' | 'oracle' | 'market' | 'raid' | 'raffle'
  title: string
  detail: string
  route: string
  scene?: SceneSpec
  /** settle it: only proofs and payouts, never spends new cZAMA */
  run: (step: Step) => Promise<unknown>
  /** query keys to refresh after it is done */
  refresh: string[]
}
/** Something on a timer (not actionable yet). */
export type WaitingItem = { key: string; title: string; readyAt: number; route: string }

const ZONES = ['Ashen Dunes', 'Spore Hollows', 'Abyssal Trench']
const lc = (a?: string | null) => (a ?? '').toLowerCase()

export function usePending(account?: Address | null) {
  const now = useNow(5000)
  const eggs = usePendingEggs(account)
  const exps = useExpeditions(account)
  const mine = useMyCreatures(account)
  const battles = useKeeperBattles(account)
  const guesses = useMyGuesses(account)
  const listings = useListings()
  const raid = useRaid(account)
  const raffle = useRaffle(account)
  const ids = mine.data ?? []
  const training = useQuery({
    queryKey: ['pendingTraining', ids.join()],
    queryFn: async () => (await Promise.all(ids.slice(0, 24).map(fetchTraining))).filter((t) => t.pending),
    enabled: DEPLOYED && ids.length > 0,
    refetchInterval: 30_000,
  })

  const me = lc(account)
  const items: PendingItem[] = []
  const waiting: WaitingItem[] = []
  if (account) {
    for (const e of eggs.data ?? [])
      items.push({
        key: `egg-${e.id}`,
        kind: 'egg',
        title: `Hatch egg #${e.id}`,
        detail: `Parents #${e.parentA} × #${e.parentB}: the breeding fee still needs its proof`,
        route: 'breed',
        scene: { kind: 'hatchEgg', me: e.parentA, foe: e.parentB },
        run: async (s) => ({ ...await hatchEgg(e.id, e.paid, s), id: e.id }),
        refresh: ['eggs', 'mine', 'creature', 'world', 'bal', 'balHandle', 'quests', 'economy', 'lineageEconomy'],
      })
    for (const x of exps.data?.list ?? []) {
      if (x.claimed) continue
      if (x.endsAt <= now)
        items.push({
          key: `exp-${x.id}`,
          kind: 'expedition',
          title: `Bring #${x.creatureId} home`,
          detail: `Back from ${ZONES[x.zone] ?? 'the wilds'}: claim the sealed loot`,
          route: 'expeditions',
          scene: { kind: 'claim', me: x.creatureId, zone: x.zone },
          run: (s) => claimExpedition(x.id, x.creatureId, s),
          refresh: ['expeditions', 'mine', 'bal', 'balHandle', 'report', 'training', 'xpRoom', 'economy'],
        })
      else waiting.push({ key: `exp-${x.id}`, title: `#${x.creatureId} in ${ZONES[x.zone] ?? 'the wilds'}`, readyAt: x.endsAt, route: 'expeditions' })
    }
    for (const t of training.data ?? [])
      items.push({
        key: `train-${t.id}`,
        kind: 'training',
        title: `Finish training #${t.id}`,
        detail: 'The fee was paid but the level-up was never confirmed',
        route: `creature/${t.id}`,
        scene: { kind: 'finishTraining', me: t.id, level: t.level },
        run: (s) => completeTraining(t.id, t.paid, s),
        refresh: ['training', 'pendingTraining', 'bal'],
      })
    for (const b of battles.data ?? []) {
      if (b.status !== 1 || (lc(b.challenger) !== me && lc(b.opponent) !== me)) continue
      const challenger = lc(b.challenger) === me
      items.push({
        key: `fight-${b.id}`,
        kind: 'battle',
        title: `Settle fight #${b.id}`,
        detail: `#${b.challengerId} vs #${b.opponentId}: 3 sealed rounds waiting to be revealed`,
        route: `arena/log/${b.id}`,
        scene: { kind: 'battle', me: challenger ? b.challengerId : b.opponentId, foe: challenger ? b.opponentId : b.challengerId, mode: b.kind },
        run: async (s) => {
          const result = await tacticsSettle(b.id, b.handles, s)
          const heroId = challenger ? b.challengerId : b.opponentId
          return { ...result, battleId: b.id, won: challenger ? result.won : !result.won, rounds: challenger ? result.rounds : result.rounds.map((round) => !round), mine: challenger ? loadPlan(b.id) ?? undefined : undefined, xp: xpGrantedFromReceipt(result.events, heroId, TRAINING, COLOSSEUM) }
        },
        refresh: ['tbattles', 'tstats', 'twilds', 'mine', 'bal', 'training'],
      })
    }
    for (const g of guesses.data?.guesses ?? [])
      if (g.claimed && !g.finalized)
        items.push({
          key: `oracle-${g.id}`,
          kind: 'oracle',
          title: `Collect riddle claim #${g.id}`,
          detail: 'Your answer was submitted; the jackpot proof was never posted',
          route: 'oracle',
          run: (s) => oracleClaim(g, s),
          refresh: ['guesses', 'oracle', 'relics', 'bal'],
        })
    for (const l of listings.data ?? [])
      if (l.status === 2 && (lc(l.buyer) === me || lc(l.seller) === me))
        items.push({
          key: `market-${l.id}`,
          kind: 'market',
          title: `Finish sale of #${l.creatureId}`,
          detail: 'The encrypted payment is waiting to be checked',
          route: 'market',
          scene: { kind: 'buy', me: l.creatureId },
          run: (s) => finalize(l.id, l.paid, s),
          refresh: ['listings', 'mine', 'bal'],
        })
    for (const r of raid.data?.mine ?? [])
      if (r.canClaim && !r.claimed)
        items.push({
          key: `raid-${r.level}`,
          kind: 'raid',
          title: `Claim boss share · LV ${r.level}`,
          detail: 'Your cut of the slain boss pot is waiting',
          route: 'raid',
          scene: { kind: 'bossReward', level: r.level, element: raid.data?.past.find((boss) => boss.level === r.level)?.element },
          run: (s) => claimShare(r.level, s),
          refresh: ['raid', 'bal'],
        })
    const rr = raffle.data?.round
    if (rr && raffle.data?.entered && !rr.done) {
      if (rr.drawing || now >= rr.endsAt)
        items.push({
          key: `raffle-${rr.id}`,
          kind: 'raffle',
          title: `Draw Raffle #${rr.id}`,
          detail: 'Sales are closed. Open the winner and the pot with a proof',
          route: 'raffle',
          run: (s) => raffleDraw(s),
          refresh: ['raffle', 'raffleTickets', 'bal', 'balHandle', 'relics'],
        })
      else waiting.push({ key: `raffle-${rr.id}`, title: `Raffle #${rr.id} draw`, readyAt: rr.endsAt, route: 'raffle' })
    }
  }
  waiting.sort((a, b) => a.readyAt - b.readyAt)
  const loading = !!account && (eggs.isLoading || exps.isLoading || battles.isLoading || guesses.isLoading)
  return { items, waiting, loading, now, battleHistoryUnavailable: !!account && battles.isError }
}
