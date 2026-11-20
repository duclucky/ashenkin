const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
function settlementJournal(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(file)
  if (file !== ':memory:') fs.chmodSync(file, 0o600)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settlement_sends (
      job TEXT PRIMARY KEY, signer TEXT NOT NULL, nonce INTEGER NOT NULL, destination TEXT NOT NULL,
      data TEXT NOT NULL, raw TEXT, hash TEXT UNIQUE NOT NULL, max_cost TEXT NOT NULL,
      state TEXT NOT NULL, created INTEGER NOT NULL, confirmed INTEGER, cost TEXT,
      UNIQUE(signer,nonce));
    CREATE TABLE IF NOT EXISTS settlement_signer_locks (signer TEXT PRIMARY KEY, owner TEXT, until_ms INTEGER NOT NULL DEFAULT 0);`)
  return {
    get: job => db.prepare('SELECT * FROM settlement_sends WHERE job=?').get(job),
    active: signer => db.prepare("SELECT * FROM settlement_sends WHERE signer=? AND state='signed' ORDER BY nonce").all(signer.toLowerCase()),
    acquire(signer) {
      const who = signer.toLowerCase(), owner = randomUUID(), now = Date.now()
      db.prepare('INSERT OR IGNORE INTO settlement_signer_locks(signer) VALUES(?)').run(who)
      return db.prepare('UPDATE settlement_signer_locks SET owner=?,until_ms=? WHERE signer=? AND until_ms<=?').run(owner,now+45000,who,now).changes ? owner : null
    },
    owns: (signer, owner) => !!db.prepare('SELECT 1 FROM settlement_signer_locks WHERE signer=? AND owner=? AND until_ms>?').get(signer.toLowerCase(),owner,Date.now()),
    release(signer, owner) { db.prepare('UPDATE settlement_signer_locks SET owner=NULL,until_ms=0 WHERE signer=? AND owner=?').run(signer.toLowerCase(),owner) },
    save(row) { db.prepare("INSERT INTO settlement_sends(job,signer,nonce,destination,data,raw,hash,max_cost,state,created) VALUES(?,?,?,?,?,?,?,?,'signed',?)").run(row.job,row.signer.toLowerCase(),row.nonce,row.destination.toLowerCase(),row.data,row.raw,row.hash,String(row.maxCost),Date.now()) },
    finish(job, receipt) { db.prepare("UPDATE settlement_sends SET state=?,confirmed=?,cost=?,raw=NULL WHERE job=? AND state='signed'").run(receipt.status==='success'?'confirmed':'reverted',Date.now(),String(receipt.gasUsed*receipt.effectiveGasPrice),job) },
    close() { db.close() },
  }
}
module.exports = { settlementJournal }
