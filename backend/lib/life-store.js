const { randomUUID } = require('node:crypto')
const { problem } = require('./keeper-store')
const { decodeOutcome, ITEMS, LANTERN_RECIPES, lanternCrafting } = require('./life-rules')

function lifeStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS life_state (world TEXT PRIMARY KEY, data TEXT NOT NULL, lease TEXT, until_ms INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS life_results (
      world TEXT NOT NULL, day INTEGER NOT NULL, nft INTEGER NOT NULL, code INTEGER NOT NULL,
      at INTEGER NOT NULL, receipt TEXT NOT NULL, handle TEXT NOT NULL, proof TEXT NOT NULL,
      PRIMARY KEY(world,day,nft)
    );
    CREATE TABLE IF NOT EXISTS life_bags (world TEXT NOT NULL, nft INTEGER NOT NULL, item INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0), PRIMARY KEY(world,nft,item));
    CREATE TABLE IF NOT EXISTS life_equipment (world TEXT NOT NULL, nft INTEGER NOT NULL, item INTEGER NOT NULL, PRIMARY KEY(world,nft));
  `)
  function atomic(work) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      db.exec('COMMIT')
      return result
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  const defaults = {
    day: 0,
    cursor: 1,
    operation: null,
    costs: {},
    retry: [],
    error: null,
    lastTick: null,
  }
  return {
    acquire(world, now) {
      db.prepare(
        'INSERT OR IGNORE INTO life_state(world,data) VALUES (?,?)',
      ).run(world, JSON.stringify(defaults))
      const lease = randomUUID()
      const row = db
        .prepare(
          'UPDATE life_state SET lease = ?, until_ms = ? WHERE world = ? AND until_ms <= ? RETURNING data',
        )
        .get(lease, now + 120_000, world, now)
      return row ? { lease, state: JSON.parse(row.data) } : null
    },
    owns(world, lease, now) {
      return !!db
        .prepare(
          'SELECT 1 FROM life_state WHERE world = ? AND lease = ? AND until_ms > ?',
        )
        .get(world, lease, now)
    },
    renew(world, lease, now) {
      return !!db
        .prepare(
          'UPDATE life_state SET until_ms = ? WHERE world = ? AND lease = ? AND until_ms > ?',
        )
        .run(now + 120_000, world, lease, now).changes
    },
    save(world, lease, data, now) {
      if (
        !db
          .prepare(
            'UPDATE life_state SET data = ? WHERE world = ? AND lease = ? AND until_ms > ?',
          )
          .run(JSON.stringify(data), world, lease, now).changes
      )
        throw new Error('Encounter worker lease expired')
    },
    release(world, lease) {
      db.prepare(
        'UPDATE life_state SET lease = NULL, until_ms = 0 WHERE world = ? AND lease = ?',
      ).run(world, lease)
    },
    state(world) {
      const row = db
        .prepare('SELECT data FROM life_state WHERE world = ?')
        .get(world)
      return row ? JSON.parse(row.data) : defaults
    },
    record(world, result) {
      const decoded = decodeOutcome(result.code)
      return atomic(() => {
        const inserted = db
          .prepare(
            'INSERT OR IGNORE INTO life_results(world,day,nft,code,at,receipt,handle,proof) VALUES (?,?,?,?,?,?,?,?)',
          )
          .run(
            world,
            result.day,
            result.nft,
            decoded.code,
            result.at,
            result.hash,
            result.handle,
            JSON.stringify(result.proof),
          )
        if (!inserted.changes) return false
        if (decoded.won)
          db.prepare(
            `INSERT INTO life_bags(world,nft,item,quantity) VALUES (?,?,?,?) ON CONFLICT(world,nft,item) DO UPDATE SET quantity = quantity + excluded.quantity`,
          ).run(world, result.nft, decoded.item, decoded.quantity)
        return true
      })
    },
    has(world, day, nft) {
      return !!db
        .prepare(
          'SELECT 1 FROM life_results WHERE world = ? AND day = ? AND nft = ?',
        )
        .get(world, day, nft)
    },
    view(world, nft) {
      const inventory = db.prepare(
        'SELECT item,quantity FROM life_bags WHERE world = ? AND nft = ? AND quantity > 0 ORDER BY item',
      ).all(world, nft).map(row => ({ ...row }))
      return {
        inventory,
        crafting: lanternCrafting(inventory),
        equipped:
          db
            .prepare(
              'SELECT item FROM life_equipment WHERE world = ? AND nft = ?',
            )
            .get(world, nft)?.item || null,
        history: db
          .prepare(
            'SELECT day,nft,code,at,receipt AS hash,handle FROM life_results WHERE world = ? AND nft = ? ORDER BY day DESC LIMIT 14',
          )
          .all(world, nft)
          .map((r) => ({ ...r, ...decodeOutcome(r.code) })),
      }
    },
    proof(world, day, nft) {
      const row = db
        .prepare(
          'SELECT proof FROM life_results WHERE world = ? AND day = ? AND nft = ?',
        )
        .get(world, day, nft)
      return row ? JSON.parse(row.proof) : null
    },
    craft(world, nft, recipe = 'standard') {
      if (typeof recipe !== 'string' || !Object.hasOwn(LANTERN_RECIPES, recipe)) throw problem(400, 'Unknown lantern recipe.')
      return atomic(() => {
        if (recipe !== 'standard' && db.prepare('SELECT 1 FROM life_bags WHERE world=? AND nft=? AND item=3 AND quantity>0').get(world, nft))
          throw problem(409, 'This Xeno already has its first Trail lantern.')
        const cost = LANTERN_RECIPES[recipe]
        for (const {item, quantity} of cost) {
          if (
            !db
              .prepare(
                'UPDATE life_bags SET quantity = quantity - ? WHERE world = ? AND nft = ? AND item = ? AND quantity >= ?',
              )
              .run(quantity, world, nft, item, quantity).changes
          )
            throw problem(
              409,
              `Crafting needs ${cost.map(row => `${row.quantity} ${ITEMS[row.item].name}`).join(' + ')}.`,
            )
        }
        db.prepare(
          'INSERT INTO life_bags(world,nft,item,quantity) VALUES (?,?,3,1) ON CONFLICT(world,nft,item) DO UPDATE SET quantity = quantity + 1',
        ).run(world, nft)
      })
    },
    equip(world, nft, item) {
      if (
        item !== null &&
        (item !== 3 ||
          !db
            .prepare(
              'SELECT 1 FROM life_bags WHERE world = ? AND nft = ? AND item = 3 AND quantity > 0',
            )
            .get(world, nft))
      )
        throw problem(409, 'This specimen has no Trail lantern.')
      if (item === null)
        db.prepare(
          'DELETE FROM life_equipment WHERE world = ? AND nft = ?',
        ).run(world, nft)
      else
        db.prepare(
          'INSERT INTO life_equipment(world,nft,item) VALUES (?,?,?) ON CONFLICT(world,nft) DO UPDATE SET item = excluded.item',
        ).run(world, nft, item)
    },
  }
}
module.exports = { lifeStore }
