const { problem } = require('./keeper-store')
function keeperJourney(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS keeper_journey (keeper_id TEXT PRIMARY KEY REFERENCES keepers(id), life_introduced INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS keeper_seen_stories (
      keeper_id TEXT NOT NULL REFERENCES keepers(id), world TEXT NOT NULL,
      nft INTEGER NOT NULL, day INTEGER NOT NULL,
      PRIMARY KEY(keeper_id,world,nft,day)
    );
  `)
  return {
    state(keeper) {
      return {
        lifeIntroduced: !!db
          .prepare(
            'SELECT life_introduced FROM keeper_journey WHERE keeper_id=?',
          )
          .get(keeper.id)?.life_introduced,
      }
    },
    introduce(keeper) {
      db.prepare(
        'INSERT INTO keeper_journey(keeper_id,life_introduced) VALUES (?,1) ON CONFLICT(keeper_id) DO UPDATE SET life_introduced=1',
      ).run(keeper.id)
    },
    seen(keeper, world, nft, day) {
      return !!db
        .prepare(
          'SELECT 1 FROM keeper_seen_stories WHERE keeper_id=? AND world=? AND nft=? AND day=?',
        )
        .get(keeper.id, world, nft, day)
    },
    mark(keeper, world, nft, day) {
      if (
        !db
          .prepare(
            'SELECT 1 FROM life_results WHERE world=? AND nft=? AND day=?',
          )
          .get(world, nft, day)
      )
        throw problem(404, 'This story has not happened yet.')
      db.prepare(
        'INSERT OR IGNORE INTO keeper_seen_stories(keeper_id,world,nft,day) VALUES (?,?,?,?)',
      ).run(keeper.id, world, nft, day)
    },
    summary(keeper, world, ids) {
      if (!ids.length) return { count: 0, wins: 0, items: 0, latest: null }
      const rows = db
        .prepare(
          `SELECT nft,day,at,code FROM life_results r WHERE world=? AND nft IN (SELECT value FROM json_each(?))
        AND NOT EXISTS (SELECT 1 FROM keeper_seen_stories s WHERE s.keeper_id=? AND s.world=r.world AND s.nft=r.nft AND s.day=r.day)
        ORDER BY at DESC,nft DESC`,
        )
        .all(world, JSON.stringify(ids), keeper.id)
      return {
        count: rows.length,
        wins: rows.filter((r) => r.code & 16).length,
        items: rows.reduce((sum, r) => sum + ((r.code >> 8) & 3), 0),
        latest: rows[0] ? { ...rows[0] } : null,
      }
    },
  }
}
module.exports = { keeperJourney }
