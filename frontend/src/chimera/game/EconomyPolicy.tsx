import type { LineageRules } from './economy-rules'
import { dailyRewardBudget } from './economy-rules'
import { fmtZama } from '../hooks'
import { Link } from '../ui'

export function LineageNotice({ rules, blocker, trainingId }: { rules: Extract<LineageRules, { version: 2 }>; blocker?: string | null; trainingId?: number }) {
  return <div className="border-2 border-[#111] bg-[var(--chm-yellow)] p-3 text-sm" role="status">
    <b>{rules.charges.toString()} lineage {rules.charges === 1n ? 'charge' : 'charges'}</b> · {rules.population.toString()}/{rules.limit.toString()} population
    <p>{rules.introUsed ? 'One charge per egg. Offer one spare at the altar to earn one.' : 'Your introductory egg needs no charge. Later eggs need one permanent offering each.'}</p>
    {blocker && rules.altarReady && trainingId != null && <Link to={`training/${trainingId}`} className="font-bold underline">Visit the Ascension altar →</Link>}
  </div>
}

export function DailyBudgetNotice({ current, remaining, opening, reserve, failed }: { current: boolean; remaining?: bigint; opening?: bigint; reserve?: bigint | null; failed?: boolean }) {
  return <div className="mt-3 border-2 border-[#111] bg-[var(--chm-yellow)] p-3 text-sm" role="status">
    <b>Daily reward budget</b>
    <p>1% of the reserve at the first payout, capped at 3,000 cZAMA. All Treasury games share it; midday deposits do not reset it.</p>
    <p className="mt-2 font-mono font-bold">{current ? remaining != null && opening != null ? `${fmtZama(remaining)} / ${fmtZama(opening)} cZAMA left` : failed ? 'Budget values unavailable' : 'Reading encrypted budget…' : `Next budget estimate: ${reserve == null ? '—' : fmtZama(dailyRewardBudget(reserve))} cZAMA`}</p>
    {!current && <p className="text-xs">Estimate uses the published reserve; the first payout sets the actual budget.</p>}
  </div>
}
