const { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')

const MINUTE = 60_000
const SESSION_MS = 7 * 24 * 60 * MINUTE
const digest = value => createHash('sha256').update(value).digest('hex')

function problem(status, message) {
  return Object.assign(new Error(message), { status })
}

function keeperStore(file, secret) {
  const db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS keepers (
      id TEXT PRIMARY KEY, identity TEXT UNIQUE NOT NULL, circle_id TEXT UNIQUE, address TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS keeper_sessions (
      token TEXT PRIMARY KEY, keeper_id TEXT NOT NULL REFERENCES keepers(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS keeper_challenges (
      id TEXT PRIMARY KEY, identity TEXT NOT NULL, proof TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS keeper_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS keeper_transactions (
      id TEXT PRIMARY KEY, keeper_id TEXT NOT NULL REFERENCES keepers(id), fingerprint TEXT NOT NULL,
      circle_id TEXT UNIQUE, status TEXT, hash TEXT, created INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS keeper_pending_tx ON keeper_transactions(keeper_id,fingerprint) WHERE done = 0;
    CREATE TABLE IF NOT EXISTS keeper_tx_checks (
      request_id TEXT PRIMARY KEY REFERENCES keeper_transactions(id) ON DELETE CASCADE,
      next_check INTEGER NOT NULL, attempts INTEGER NOT NULL, result TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS keeper_starter_funding (
      keeper_id TEXT PRIMARY KEY REFERENCES keepers(id), hash TEXT
    );
  `)
  let lastCleanup = 0
  function cleanup(now) {
    if (now - lastCleanup < MINUTE) return
    lastCleanup = now
    for (const table of ['keeper_sessions', 'keeper_challenges', 'keeper_limits']) db.prepare(`DELETE FROM ${table} WHERE expires <= ?`).run(now)
    db.prepare('DELETE FROM keeper_transactions WHERE done = 1 AND created <= ?').run(now - SESSION_MS)
  }

  function rate(key, max, windowMs) {
    const now = Date.now()
    cleanup(now)
    const expires = (Math.floor(now / windowMs) + 1) * windowMs
    const { count } = db.prepare(`
      INSERT INTO keeper_limits(bucket,count,expires) VALUES (?,1,?)
      ON CONFLICT(bucket) DO UPDATE SET count = CASE WHEN expires <= ? THEN 1 ELSE count + 1 END,
        expires = max(expires, excluded.expires) RETURNING count
    `).get(digest(key), expires, now)
    if (count > max) throw problem(429, 'Too many attempts. Try again later.')
  }

  const writeChallenge = db.prepare('INSERT INTO keeper_challenges(id,identity,proof,expires) VALUES (?,?,?,?)')
  const readChallenge = db.prepare('SELECT * FROM keeper_challenges WHERE id = ? AND expires > ? AND tries < 5')
  const consumeChallenge = db.prepare('DELETE FROM keeper_challenges WHERE id = ? AND expires > ? AND tries < 5')
  const mac = (id, code) => createHmac('sha256', secret).update(`${id}:${code}`).digest('hex')
  const keeperByIdentity = db.prepare('SELECT * FROM keepers WHERE identity = ?')
  const flights = new Map()
  return {
    async exclusive(keeper, work) {
      const before = flights.get(keeper.id) || Promise.resolve()
      const current = before.catch(() => {}).then(work)
      flights.set(keeper.id, current)
      try { return await current } finally { if (flights.get(keeper.id) === current) flights.delete(keeper.id) }
    },
    // Lazy require avoids a cycle through problem() while the module loads.
    hunts: require('./hunts-store').huntsStore(db),
    patrols: require('./patrol-store').patrolStore(db),
    life: require('./life-store').lifeStore(db),
    journey: require('./keeper-journey').keeperJourney(db),
    faucet: require('./gas-faucet-store').gasFaucetStore(db),
    keeper(id) { return db.prepare('SELECT * FROM keepers WHERE id = ?').get(id) },
    dueTransactions(now, graceMs, limit) {
      return db.prepare(`
        SELECT t.*, coalesce(c.attempts, 0) AS check_attempts
        FROM keeper_transactions t LEFT JOIN keeper_tx_checks c ON c.request_id = t.id
        WHERE t.done = 0 AND t.created <= ? AND coalesce(c.next_check, 0) <= ?
        ORDER BY coalesce(c.next_check, 0), t.created, t.id LIMIT ?
      `).all(now - graceMs, now, limit)
    },
    scheduleTxCheck(id, nextCheck, result) {
      db.prepare(`
        INSERT INTO keeper_tx_checks(request_id,next_check,attempts,result) VALUES (?,?,1,?)
        ON CONFLICT(request_id) DO UPDATE SET next_check = excluded.next_check,
          attempts = keeper_tx_checks.attempts + 1, result = excluded.result
      `).run(id, nextCheck, result)
    },
    pendingTransactions(keeper) { return db.prepare('SELECT * FROM keeper_transactions WHERE keeper_id = ? AND done = 0').all(keeper.id) },
    rate,
    challenge(identity, makeMessage) {
      const id = randomBytes(24).toString('hex')
      const expires = Date.now() + 5 * MINUTE
      const proof = makeMessage(id, expires)
      writeChallenge.run(id, identity, proof, expires)
      return { id, proof }
    },
    emailChallenge(email) {
      const code = String(randomInt(0, 100_000_000)).padStart(8, '0')
      const { id } = this.challenge(`email:${email}`, id => mac(id, code))
      return { id, code }
    },
    getChallenge(id) {
      return readChallenge.get(id, Date.now())
    },
    checkEmail(challenge, code) {
      if (timingSafeEqual(Buffer.from(challenge.proof), Buffer.from(mac(challenge.id, code)))) return true
      db.prepare('UPDATE keeper_challenges SET tries = tries + 1 WHERE id = ?').run(challenge.id)
      return false
    },
    consume(id) {
      return !!consumeChallenge.run(id, Date.now()).changes
    },
    openSession(identity) {
      db.prepare('INSERT OR IGNORE INTO keepers(id,identity) VALUES (?,?)').run(randomUUID(), identity)
      const keeper = keeperByIdentity.get(identity)
      const token = randomBytes(32).toString('base64url')
      db.prepare('INSERT INTO keeper_sessions(token,keeper_id,expires) VALUES (?,?,?)').run(digest(token), keeper.id, Date.now() + SESSION_MS)
      return { token, maxAge: SESSION_MS, keeper }
    },
    session(token) {
      if (!token) return null
      return db.prepare('SELECT k.* FROM keeper_sessions s JOIN keepers k ON k.id = s.keeper_id WHERE s.token = ? AND s.expires > ?').get(digest(token), Date.now())
    },
    logout(token) {
      if (token) db.prepare('DELETE FROM keeper_sessions WHERE token = ?').run(digest(token))
    },
    setWallet(keeper, wallet) {
      db.prepare('UPDATE keepers SET circle_id = ?, address = ? WHERE id = ? AND circle_id IS NULL').run(wallet.id, wallet.address, keeper.id)
      return keeperByIdentity.get(keeper.identity)
    },
    pending(keeper, fingerprint) {
      return db.prepare('SELECT * FROM keeper_transactions WHERE keeper_id = ? AND fingerprint = ? AND done = 0').get(keeper.id, fingerprint)
    },
    latest(keeper, fingerprint) {
      return db.prepare('SELECT * FROM keeper_transactions WHERE keeper_id = ? AND fingerprint = ? ORDER BY created DESC, rowid DESC LIMIT 1').get(keeper.id, fingerprint)
    },
    beginTx(keeper, fingerprint) {
      db.prepare('INSERT OR IGNORE INTO keeper_transactions(id,keeper_id,fingerprint,created) VALUES (?,?,?,?)').run(randomUUID(), keeper.id, fingerprint, Date.now())
      return this.pending(keeper, fingerprint)
    },
    tx(keeper, id) {
      return db.prepare('SELECT * FROM keeper_transactions WHERE id = ? AND keeper_id = ?').get(id, keeper.id)
    },
    updateTx(id, { circleId = null, status, hash = null, done = false }) {
      db.prepare('UPDATE keeper_transactions SET circle_id = coalesce(?,circle_id), status = ?, hash = coalesce(?,hash), done = ? WHERE id = ? AND done = 0')
        .run(circleId, status, hash, Number(done), id)
    },
    starterFunding(keeper) {
      return db.prepare('SELECT hash FROM keeper_starter_funding WHERE keeper_id = ?').get(keeper.id)
    },
    reserveFunding(keeper, limit) {
      return !!db.prepare(`
        INSERT OR IGNORE INTO keeper_starter_funding(keeper_id)
        SELECT ? WHERE (SELECT COUNT(*) FROM keeper_starter_funding) < ?
      `).run(keeper.id, limit).changes
    },
    saveFunding(keeper, hash) {
      db.prepare('UPDATE keeper_starter_funding SET hash = ? WHERE keeper_id = ?').run(hash, keeper.id)
    },
    retryFunding(keeper, failedHash) {
      return !!db.prepare('UPDATE keeper_starter_funding SET hash = NULL WHERE keeper_id = ? AND hash = ?').run(keeper.id, failedHash).changes
    },
    close: () => db.close(),
  }
}

module.exports = { keeperStore, problem }
