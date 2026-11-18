const { randomUUID } = require('node:crypto')
const { problem } = require('./keeper-store')

// Separate from login sessions: an explicit mandate survives logout and restarts.
function patrolStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS keeper_patrols (
      id TEXT PRIMARY KEY, keeper_id TEXT NOT NULL REFERENCES keepers(id),
      active INTEGER NOT NULL DEFAULT 1, stopped INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL, data TEXT NOT NULL, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
      checked_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS keeper_active_patrol ON keeper_patrols(keeper_id) WHERE active = 1;
  `)
  const unpack = row => row && ({ ...JSON.parse(row.data), id: row.id, keeperId: row.keeper_id, active: !!row.active, stopped: !!row.stopped })
  return {
    create(keeper, data, now) {
      const id = randomUUID()
      const inserted = db.prepare(`INSERT OR IGNORE INTO keeper_patrols(id,keeper_id,created,data) VALUES (?,?,?,?)`).run(id, keeper.id, now, JSON.stringify(data))
      if (!inserted.changes) throw problem(409, 'Finish or stop your current patrol first.')
      return this.get(keeper, id)
    },
    get(keeper, id) { return unpack(db.prepare('SELECT * FROM keeper_patrols WHERE keeper_id = ? AND id = ?').get(keeper.id, id)) },
    current(keeper) { return unpack(db.prepare('SELECT * FROM keeper_patrols WHERE keeper_id = ? AND active = 1').get(keeper.id)) },
    list(keeper) { return db.prepare('SELECT * FROM keeper_patrols WHERE keeper_id = ? ORDER BY created DESC, rowid DESC LIMIT 12').all(keeper.id).map(unpack) },
    stop(keeper, id) {
      db.prepare('UPDATE keeper_patrols SET stopped = 1 WHERE keeper_id = ? AND id = ? AND active = 1').run(keeper.id, id)
      const job = this.get(keeper, id)
      if (!job) throw problem(404, 'Patrol not found.')
      return job
    },
    due(now) { return db.prepare('SELECT id,keeper_id FROM keeper_patrols WHERE active = 1 AND lease_until <= ? ORDER BY checked_at, created LIMIT 50').all(now) },
    acquire(id, now) {
      const lease = randomUUID()
      const row = db.prepare(`UPDATE keeper_patrols SET lease = ?, lease_until = ?, checked_at = ? WHERE id = ? AND active = 1 AND lease_until <= ? RETURNING *`).get(lease, now + 120_000, now, id, now)
      return row ? { job: unpack(row), lease } : null
    },
    renew(id, lease, now) { return !!db.prepare('UPDATE keeper_patrols SET lease_until = ? WHERE id = ? AND lease = ? AND lease_until > ?').run(now + 120_000, id, lease, now).changes },
    owns(id, lease, now) { return !!db.prepare('SELECT 1 FROM keeper_patrols WHERE id = ? AND lease = ? AND lease_until > ?').get(id, lease, now) },
    save(job, lease, now) {
      const { id, keeperId, active, stopped, ...data } = job
      if (!db.prepare('UPDATE keeper_patrols SET data = ?, active = ? WHERE id = ? AND lease = ? AND lease_until > ?').run(JSON.stringify(data), Number(active), id, lease, now).changes) {
        throw problem(409, 'Patrol worker lease expired.')
      }
    },
    release(id, lease) { db.prepare('UPDATE keeper_patrols SET lease = NULL, lease_until = 0 WHERE id = ? AND lease = ?').run(id, lease) },
  }
}

module.exports = { patrolStore }
