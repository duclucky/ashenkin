const {randomUUID}=require('node:crypto');
const TTL=5*60_000;
function huntsStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS hunt_reservations(id TEXT PRIMARY KEY,world TEXT NOT NULL,keeper_id TEXT NOT NULL,creature INTEGER NOT NULL,target INTEGER,expires INTEGER NOT NULL,data TEXT,state TEXT NOT NULL DEFAULT 'open');
 CREATE UNIQUE INDEX IF NOT EXISTS hunt_keeper_open ON hunt_reservations(world,keeper_id) WHERE state='open';
 CREATE UNIQUE INDEX IF NOT EXISTS hunt_target_open ON hunt_reservations(world,target) WHERE state='open' AND target IS NOT NULL;
 CREATE TABLE IF NOT EXISTS hunt_rarity(world TEXT NOT NULL,nft INTEGER NOT NULL,rare_traits INTEGER NOT NULL,PRIMARY KEY(world,nft));`);
 return {
  reconcile(world,address){db.prepare(`UPDATE hunt_reservations AS h SET state='closed' WHERE h.world=? AND h.state='open' AND h.data IS NOT NULL
   AND EXISTS(SELECT 1 FROM keeper_transactions t WHERE t.keeper_id=h.keeper_id AND t.fingerprint=? || ':' || h.data AND t.done=1)
   AND NOT EXISTS(SELECT 1 FROM keeper_transactions t WHERE t.keeper_id=h.keeper_id AND t.fingerprint=? || ':' || h.data AND t.done=0)`).run(world,address.toLowerCase(),address.toLowerCase())},
  expire(now){db.prepare("UPDATE hunt_reservations SET state='expired' WHERE state='open' AND data IS NULL AND expires<=?").run(now)},
  active(world,keeper){return db.prepare("SELECT * FROM hunt_reservations WHERE world=? AND keeper_id=? AND state='open'").get(world,keeper.id)},
  get(id,keeper){return db.prepare('SELECT * FROM hunt_reservations WHERE id=? AND keeper_id=?').get(id,keeper.id)},
  reserved(world){return db.prepare("SELECT target FROM hunt_reservations WHERE world=? AND state='open' AND target IS NOT NULL").all(world).map(r=>r.target)},
  explores(world){return db.prepare("SELECT count(*) n FROM hunt_reservations WHERE world=? AND state='open' AND target IS NULL").get(world).n},
  claim(world,keeper,creature,target,now){const id=randomUUID();db.prepare('INSERT INTO hunt_reservations(id,world,keeper_id,creature,target,expires) VALUES(?,?,?,?,?,?)').run(id,world,keeper.id,creature,target,now+TTL);return this.get(id,keeper)},
  bind(id,keeper,data){db.prepare("UPDATE hunt_reservations SET data=? WHERE id=? AND keeper_id=? AND state='open' AND data IS NULL").run(data,id,keeper.id)},
  close(id,state='closed'){db.prepare("UPDATE hunt_reservations SET state=? WHERE id=? AND state='open'").run(state,id)},
  rarity(world,nft,value){if(value===undefined)return db.prepare('SELECT rare_traits FROM hunt_rarity WHERE world=? AND nft=?').get(world,nft)?.rare_traits;db.prepare('INSERT OR IGNORE INTO hunt_rarity VALUES(?,?,?)').run(world,nft,value);return value},
 };
}
module.exports={huntsStore};
