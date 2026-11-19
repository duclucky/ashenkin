import { expect, test } from 'bun:test'
import { deletePlaybook, MAX_PLAYBOOKS, playbookKey, readPlaybooks, savePlaybook, type PlaybookScope } from '../src/chimera/game/playbooks'

const scope: PlaybookScope = { chainId: 11155111, colosseum: `0x${'a'.repeat(40)}`, account: `0x${'b'.repeat(40)}`, specimenId: 30 }
class MemoryStorage {
  data = new Map<string, string>()
  failWrite = false
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { if (this.failWrite) throw new Error('Storage full'); this.data.set(key, value) }
}
const input = (name = 'Counter opener', id = 'one') => ({ id, name, moves: [1, 0, 2] })

test('saved commands survive reload without sharing mutable move arrays', () => {
  const storage = new MemoryStorage(), commands = input()
  savePlaybook(storage, scope, commands, 100)
  commands.moves[0] = 2
  expect(readPlaybooks(storage, scope)).toEqual([{ id: 'one', name: 'Counter opener', moves: [1, 0, 2], savedAt: 100 }])
})

test('wallet, NFT, chain and deployment boundaries isolate saved strategies', () => {
  const storage = new MemoryStorage()
  savePlaybook(storage, scope, input(), 100)
  for (const other of [{ ...scope, specimenId: 31 }, { ...scope, account: `0x${'c'.repeat(40)}` }, { ...scope, chainId: 1 }, { ...scope, colosseum: `0x${'d'.repeat(40)}` }]) {
    expect(playbookKey(other)).not.toBe(playbookKey(scope))
    expect(readPlaybooks(storage, other)).toEqual([])
  }
  expect(playbookKey({ ...scope, account: scope.account.toUpperCase(), colosseum: scope.colosseum.toUpperCase() })).toBe(playbookKey(scope))
})

test('invalid commands, empty names and invalid scopes never reach storage', () => {
  const storage = new MemoryStorage()
  for (const moves of [[0, 1], [0, 1, 3], [0, 1, 2, 0], [0, 0.5, 2], [0, NaN, 2]]) expect(() => savePlaybook(storage, scope, { ...input(), moves }, 100)).toThrow()
  for (const name of ['   ', 'x'.repeat(29)]) expect(() => savePlaybook(storage, scope, input(name), 100)).toThrow()
  expect(() => savePlaybook(storage, { ...scope, account: '' }, input(), 100)).toThrow()
  expect(() => savePlaybook(storage, { ...scope, specimenId: 0 }, input(), 100)).toThrow()
  expect(storage.data.size).toBe(0)
})

test('a matching name updates the existing strategy instead of consuming another slot', () => {
  const storage = new MemoryStorage()
  savePlaybook(storage, scope, input('  Counter   opener  '), 100)
  const saved = savePlaybook(storage, scope, { ...input('COUNTER OPENER', 'new-id'), moves: [2, 2, 0] }, 200)
  expect(saved).toEqual([{ id: 'one', name: 'COUNTER OPENER', moves: [2, 2, 0], savedAt: 200 }])
})

test('the collection limit rejects a new plan without silently evicting one', () => {
  const storage = new MemoryStorage()
  for (let index = 0; index < MAX_PLAYBOOKS; index++) savePlaybook(storage, scope, input(`Plan ${index}`, `id-${index}`), index)
  expect(() => savePlaybook(storage, scope, input('Overflow', 'overflow'), 100)).toThrow()
  expect(readPlaybooks(storage, scope)).toHaveLength(MAX_PLAYBOOKS)
  expect(savePlaybook(storage, scope, input('Plan 0', 'new-id'), 101)).toHaveLength(MAX_PLAYBOOKS)
})

test('deleting one plan preserves the other plans and every other scope', () => {
  const storage = new MemoryStorage(), other = { ...scope, specimenId: 31 }
  savePlaybook(storage, scope, input('First', 'first'), 100)
  savePlaybook(storage, scope, input('Second', 'second'), 101)
  savePlaybook(storage, other, input('Other NFT', 'other'), 102)
  expect(deletePlaybook(storage, scope, 'first').map(book => book.id)).toEqual(['second'])
  expect(readPlaybooks(storage, other).map(book => book.id)).toEqual(['other'])
})

test('corrupt documents fail closed while invalid entries cannot supply executable commands', () => {
  const storage = new MemoryStorage()
  storage.setItem(playbookKey(scope), '{broken')
  expect(() => readPlaybooks(storage, scope)).toThrow()
  storage.setItem(playbookKey(scope), JSON.stringify({ version: 1, items: [{ ...input('Valid'), savedAt: 100 }, { ...input('Bad'), moves: [3, 3, 3], savedAt: 101 }] }))
  expect(readPlaybooks(storage, scope).map(book => book.name)).toEqual(['Valid'])
})

test('failed writes do not report a new plan or delete the existing one', () => {
  const storage = new MemoryStorage()
  savePlaybook(storage, scope, input(), 100)
  storage.failWrite = true
  expect(() => savePlaybook(storage, scope, input('Not saved', 'two'), 101)).toThrow('Storage full')
  expect(() => deletePlaybook(storage, scope, 'one')).toThrow('Storage full')
  expect(readPlaybooks(storage, scope).map(book => book.id)).toEqual(['one'])
})

test('playbook names reject every unsafe ASCII control while preserving whitespace normalization', () => {
  const storage = new MemoryStorage()
  for (let code = 0; code <= 127; code++) {
    if (code <= 8 || (code >= 11 && code <= 31) || code === 127) {
      expect(() => savePlaybook(storage, scope, input(`Bad${String.fromCharCode(code)}name`), 100)).toThrow()
    }
  }
  expect(savePlaybook(storage, scope, input('  Hold\tthen\nstrike  '), 100)[0].name).toBe('Hold then strike')
})
