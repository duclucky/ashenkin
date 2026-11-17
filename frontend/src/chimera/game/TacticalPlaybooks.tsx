import { useId, useRef, useState, type FormEvent } from 'react'
import { BookOpen, Check, Save, Trash2 } from 'lucide-react'
import { MOVES } from '../season'
import { MOVE_ICON } from './Tactics'
import { deletePlaybook, MAX_PLAYBOOKS, PLAYBOOK_NAME_LIMIT, readPlaybooks, savePlaybook, type LocalPlaybook, type PlaybookScope } from './playbooks'

type Snapshot = { books: LocalPlaybook[]; error: string | null }
const message = (error: unknown) => error instanceof Error ? error.message : 'Saved plans are unavailable in this browser.'
function load(scope: PlaybookScope): Snapshot {
  try { return { books: readPlaybooks(localStorage, scope), error: null } }
  catch (error) { return { books: [], error: message(error) } }
}

/** Parent keys this component by wallet + deployment + specimen. No automatic plan submission. */
export function TacticalPlaybooks({ scope, plan, apply }: { scope: PlaybookScope; plan: number[]; apply: (moves: number[]) => void }) {
  const [snapshot, setSnapshot] = useState(() => load(scope))
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const nameId = useId()

  function save(event: FormEvent) {
    event.preventDefault()
    try {
      const books = savePlaybook(localStorage, scope, { id: crypto.randomUUID(), name, moves: plan }, Date.now())
      setSnapshot({ books, error: null })
      setName('')
      setStatus(`Saved ${books[0].name} for specimen #${scope.specimenId}.`)
    } catch (error) { setSnapshot(previous => ({ ...previous, error: message(error) })); setStatus('') }
  }

  function remove(book: LocalPlaybook) {
    try {
      const books = deletePlaybook(localStorage, scope, book.id)
      setSnapshot({ books, error: null })
      if (name.toLowerCase() === book.name.toLowerCase()) setName('')
      setStatus(`Deleted saved plan ${book.name}.`)
      input.current?.focus()
    } catch (error) { setSnapshot(previous => ({ ...previous, error: message(error) })); setStatus('') }
  }

  return <details className="chm-playbooks" onToggle={event => { if (event.currentTarget.open) setSnapshot(load(scope)) }}>
    <summary><BookOpen size={15} aria-hidden="true" /><span>Playbook · #{scope.specimenId}</span><small>{snapshot.books.length}/{MAX_PLAYBOOKS}</small></summary>
    <div className="chm-playbook-content">
      <p>Saved on this browser for this wallet and specimen. Encrypted for Sepolia when you enter a fight.</p>
      {snapshot.books.length > 0 && <ul aria-label={`Saved plans for specimen #${scope.specimenId}`}>
        {snapshot.books.map(book => {
          const selected = book.moves.every((move, round) => move === plan[round])
          return <li key={book.id} data-current={selected}>
            <div><b>{book.name}</b><span className="chm-playbook-queue" aria-label={book.moves.map((move, round) => `Round ${round + 1}: ${MOVES[move].name}`).join(', ')}>{book.moves.map((move, round) => { const Icon = MOVE_ICON[move]; return <span key={round} title={`Round ${round + 1}: ${MOVES[move].name}`}><Icon size={14} aria-hidden="true" /></span> })}</span></div>
            <div><button type="button" aria-label={`Apply ${book.name}`} onClick={() => { apply([...book.moves]); setName(book.name); setStatus(`Applied ${book.name}. Your three commands are ready.`) }}>{selected && <Check size={12} aria-hidden="true" />}Use</button><button type="button" aria-label={`Delete ${book.name}`} onClick={() => remove(book)}><Trash2 size={15} aria-hidden="true" /></button></div>
          </li>
        })}
      </ul>}
      <form onSubmit={save}>
        <label htmlFor={nameId}>Name this plan</label>
        <div><input ref={input} id={nameId} className="chm-input" value={name} maxLength={PLAYBOOK_NAME_LIMIT} autoComplete="off" placeholder="e.g. Counter opener" onChange={event => setName(event.target.value)} /><button type="submit" className="chm-btn chm-btn-primary" disabled={!name.trim()}><Save size={14} aria-hidden="true" />Save</button></div>
        <small>The same name updates its saved commands.</small>
      </form>
      {snapshot.error && <div className="chm-playbook-error" role="alert"><p>{snapshot.error}</p><button type="button" onClick={() => setSnapshot(load(scope))}>Retry saved plans</button></div>}
      <span role="status" aria-live="polite" className="chm-playbook-status">{status}</span>
    </div>
  </details>
}
