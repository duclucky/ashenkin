import type { ReactNode } from 'react'
import { Lock, ArrowRight } from 'lucide-react'
import { MOVES } from '../season'
import { MOVE_ICON } from './Tactics'
import { buildBattleReport } from './battle-report'

function Command({ move }: { move: number | null }) {
  if (move == null) return <span className="chm-report-command" title="This command is still sealed"><Lock aria-hidden="true" /><span>Sealed</span></span>
  const Icon = MOVE_ICON[move]
  return <span className="chm-report-command" data-move={MOVES[move].key}><Icon aria-hidden="true" /><span>{MOVES[move].name}</span></span>
}

export function BattleDebrief({ rounds, mine, theirs, xp, replay, actions }: { rounds: unknown; mine?: number[]; theirs?: number[]; xp?: number; replay?: boolean; actions?: ReactNode }) {
  const report = buildBattleReport({ rounds, mine, theirs })
  if (!report) return null
  return <section className="chm-battle-report" aria-label="Battle report">
    <header>
      <b>Rounds</b>
      <span>{replay ? 'Replay' : xp != null && xp > 0 ? `+${xp} XP` : xp === 0 ? 'No XP awarded' : 'XP pending'}</span>
    </header>
    <ol>
      {report.rows.map((row) => <li key={row.round}>
        <div className="chm-report-verdict"><b>R{row.round}</b><span data-won={row.won}>{row.won ? 'WIN' : 'LOSS'}</span></div>
        <div className="chm-report-matchup"><Command move={row.left} /><ArrowRight aria-hidden="true" /><Command move={row.right} /></div>

      </li>)}
    </ol>
    <div className="chm-report-actions">{actions}</div>
  </section>
}
