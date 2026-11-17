let draft: { account: string; moves: number[] } | null = null
const STARTER_PLAN = 'chm:starter-hunt-plan'

function isPlan(moves: unknown): moves is number[] {
  return Array.isArray(moves) && moves.length === 3 && moves.every(move => Number.isInteger(move) && move >= 0 && move <= 2)
}

/** One-use, in-memory handoff. Never submits, saves a playbook or touches a URL. */
export function stagePracticeDraft(account: string, moves: readonly number[]): void {
  if (!/^0x[0-9a-f]{40}$/i.test(account) || !isPlan(moves)) throw new Error('Choose a wallet and three valid practice commands.')
  draft = { account: account.toLowerCase(), moves: [...moves] }
}
export function takePracticeDraft(account: string | null): number[] | null {
  const pending = draft
  draft = null
  return pending && pending.account === account?.toLowerCase() ? [...pending.moves] : null
}

export function saveStarterPracticePlan(moves: number[], account: string | null) {
  if (!isPlan(moves)) return
  try { sessionStorage.setItem(STARTER_PLAN, JSON.stringify({ moves, account: account?.toLowerCase() ?? null })) } catch { /* Optional when browser storage is blocked. */ }
}

export function starterPracticePlan(account: string): number[] | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STARTER_PLAN) ?? 'null')
    if (!isPlan(saved?.moves)) return null
    if (saved.account === null) saveStarterPracticePlan(saved.moves, account)
    else if (saved.account !== account.toLowerCase()) return null
    return saved.moves
  } catch { return null }
}

export function clearStarterPracticePlan(account: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STARTER_PLAN) ?? 'null')
    if (saved?.account === account.toLowerCase()) sessionStorage.removeItem(STARTER_PLAN)
  } catch { /* Storage may be unavailable. */ }
}
