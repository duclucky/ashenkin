const { randomUUID } = require('node:crypto')
const { problem } = require('./keeper-store')
const DAY = 86400_000
function gasFaucetStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gas_faucet_claims (
      id TEXT PRIMARY KEY, keeper_id TEXT NOT NULL REFERENCES keepers(id), address TEXT NOT NULL,
      amount TEXT NOT NULL, created INTEGER NOT NULL, confirmed INTEGER, status TEXT NOT NULL,
      raw TEXT, hash TEXT, cost TEXT, issue TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS gas_faucet_pending ON gas_faucet_claims(keeper_id) WHERE status IN ('queued','signed');
    CREATE TABLE IF NOT EXISTS gas_faucet_worker (id INTEGER PRIMARY KEY CHECK(id=1), lease TEXT, until_ms INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO gas_faucet_worker(id) VALUES (1);
  `)
  const latest = (keeper) =>
    db
      .prepare(
        'SELECT * FROM gas_faucet_claims WHERE keeper_id = ? ORDER BY created DESC,rowid DESC LIMIT 1',
      )
      .get(keeper.id)
  return {
    latest,
    reserve(keeper, amount, now) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const pending = db
          .prepare(
            "SELECT * FROM gas_faucet_claims WHERE keeper_id=? AND status IN ('queued','signed')",
          )
          .get(keeper.id)
        if (pending) {
          db.exec('COMMIT')
          return pending
        }
        const last = db
          .prepare(
            "SELECT confirmed FROM gas_faucet_claims WHERE keeper_id=? AND status='confirmed' ORDER BY confirmed DESC LIMIT 1",
          )
          .get(keeper.id)
        if (last && last.confirmed + DAY > now)
          throw problem(429, 'You can receive Sepolia ETH once every 24 hours.')
        const id = randomUUID()
        db.prepare(
          "INSERT INTO gas_faucet_claims(id,keeper_id,address,amount,created,status) VALUES (?,?,?,?,?,'queued')",
        ).run(id, keeper.id, keeper.address, String(amount), now)
        db.exec('COMMIT')
        return latest(keeper)
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    pending() {
      return db
        .prepare(
          "SELECT * FROM gas_faucet_claims WHERE status IN ('queued','signed') ORDER BY created,rowid LIMIT 1",
        )
        .get()
    },
    acquire(now) {
      const lease = randomUUID()
      return db
        .prepare(
          'UPDATE gas_faucet_worker SET lease=?,until_ms=? WHERE id=1 AND until_ms<=?',
        )
        .run(lease, now + 120000, now).changes
        ? lease
        : null
    },
    owns(lease, now) {
      return !!db
        .prepare('SELECT 1 FROM gas_faucet_worker WHERE lease=? AND until_ms>?')
        .get(lease, now)
    },
    renew(lease, now) {
      return !!db
        .prepare(
          'UPDATE gas_faucet_worker SET until_ms=? WHERE lease=? AND until_ms>?',
        )
        .run(now + 120000, lease, now).changes
    },
    release(lease) {
      db.prepare(
        'UPDATE gas_faucet_worker SET lease=NULL,until_ms=0 WHERE lease=?',
      ).run(lease)
    },
    update(id, lease, now, fields) {
      if (!this.owns(lease, now)) throw new Error('Faucet worker lease expired')
      const allowed = ['raw', 'hash', 'status', 'confirmed', 'cost', 'issue']
      const entries = Object.entries(fields).filter(([key]) =>
        allowed.includes(key),
      )
      if (entries.length)
        db.prepare(
          `UPDATE gas_faucet_claims SET ${entries.map(([k]) => `${k}=?`).join(',')} WHERE id=?`,
        ).run(...entries.map(([, v]) => v), id)
    },
  }
}
module.exports = { gasFaucetStore, DAY }
