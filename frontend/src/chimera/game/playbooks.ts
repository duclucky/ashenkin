export type TacticPlan = [number, number, number]
export type LocalPlaybook = { id: string; name: string; moves: TacticPlan; savedAt: number }
export type PlaybookScope = { chainId: number; colosseum: string; account: string; specimenId: number }
export type PlaybookStorage = Pick<Storage, 'getItem' | 'setItem'>
export const MAX_PLAYBOOKS = 6
export const PLAYBOOK_NAME_LIMIT = 28

const address = (value: string) => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value)
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9_-]{1,80}$/i.test(value)
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const validPlan = (value: unknown): value is TacticPlan => Array.isArray(value) && value.length === 3 && value.every(move => Number.isInteger(move) && move >= 0 && move <= 2)
function cleanName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\x00-\x08\x0b-\x1f\x7f]/.test(value)) return null
  const name = value.trim().replace(/\s+/g, ' ')
  return name.length > 0 && name.length <= PLAYBOOK_NAME_LIMIT ? name : null
}

export function playbookKey(scope: PlaybookScope): string {
  if (!Number.isSafeInteger(scope.chainId) || scope.chainId <= 0 || !Number.isSafeInteger(scope.specimenId) || scope.specimenId <= 0 || !address(scope.account) || !address(scope.colosseum)) throw new Error('A wallet, deployment and specimen are required to save plans.')
  return `chm:playbooks:v1:${scope.chainId}:${scope.colosseum.toLowerCase()}:${scope.account.toLowerCase()}:${scope.specimenId}`
}

export function readPlaybooks(storage: PlaybookStorage, scope: PlaybookScope): LocalPlaybook[] {
  const raw = storage.getItem(playbookKey(scope))
  if (raw == null) return []
  const unreadable = () => new Error('Saved plans could not be read in this browser.')
  if (raw.length > 16_384) throw unreadable()
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw unreadable() }
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('items' in data) || !Array.isArray(data.items)) throw unreadable()
  const valid: LocalPlaybook[] = []
  for (const value of data.items) {
    if (!value || typeof value !== 'object') continue
    const name = cleanName(value.name)
    if (!name || !validId(value.id) || !validPlan(value.moves) || !validTime(value.savedAt)) continue
    valid.push({ id: value.id, name, moves: [value.moves[0], value.moves[1], value.moves[2]], savedAt: value.savedAt })
  }
  const ids = new Set<string>(), names = new Set<string>()
  return valid.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id)).filter(book => {
    const name = book.name.toLowerCase()
    if (ids.has(book.id) || names.has(name)) return false
    ids.add(book.id); names.add(name)
    return true
  }).slice(0, MAX_PLAYBOOKS)
}

export function savePlaybook(storage: PlaybookStorage, scope: PlaybookScope, input: { id: string; name: string; moves: readonly number[] }, now: number): LocalPlaybook[] {
  const name = cleanName(input.name)
  if (!name) throw new Error(`Choose a name of 1–${PLAYBOOK_NAME_LIMIT} characters.`)
  if (!validPlan(input.moves)) throw new Error('A plan needs exactly three valid commands.')
  if (!validId(input.id) || !validTime(now)) throw new Error('The saved plan identifier or time is invalid.')
  const books = readPlaybooks(storage, scope)
  const existing = books.find(book => book.name.toLowerCase() === name.toLowerCase())
  if (!existing && books.length >= MAX_PLAYBOOKS) throw new Error(`The ${MAX_PLAYBOOKS} plan slots are full. Delete a plan or update its name.`)
  if (!existing && books.some(book => book.id === input.id)) throw new Error('A saved plan already uses that identifier.')
  const updated: LocalPlaybook = { id: existing?.id ?? input.id, name, moves: [...input.moves], savedAt: now }
  const next = [updated, ...books.filter(book => book.id !== updated.id)]
  storage.setItem(playbookKey(scope), JSON.stringify({ version: 1, items: next }))
  return next
}

export function deletePlaybook(storage: PlaybookStorage, scope: PlaybookScope, id: string): LocalPlaybook[] {
  const books = readPlaybooks(storage, scope)
  const next = books.filter(book => book.id !== id)
  if (next.length !== books.length) storage.setItem(playbookKey(scope), JSON.stringify({ version: 1, items: next }))
  return next
}
