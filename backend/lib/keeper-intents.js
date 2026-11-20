const {problem}=require('./keeper-store');
function keeperIntents(db){
 db.exec(`CREATE TABLE IF NOT EXISTS keeper_tx_intents(keeper_id TEXT NOT NULL REFERENCES keepers(id),intent_id TEXT NOT NULL,fingerprint TEXT NOT NULL,request_id TEXT,cancelled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(keeper_id,intent_id));`);
 return{
  claim(keeper,id,fingerprint){
   db.prepare('INSERT OR IGNORE INTO keeper_tx_intents(keeper_id,intent_id,fingerprint) VALUES(?,?,?)').run(keeper.id,id,fingerprint);
   const row=db.prepare('SELECT * FROM keeper_tx_intents WHERE keeper_id=? AND intent_id=?').get(keeper.id,id);
   if(row.fingerprint!==fingerprint)throw problem(409,'This action ID belongs to a different call.');return row;
  },
  attach(keeper,id,request){
   if(!db.prepare('UPDATE keeper_tx_intents SET request_id=? WHERE keeper_id=? AND intent_id=? AND cancelled=0 AND (request_id IS NULL OR request_id=?)').run(request,keeper.id,id,request).changes)throw problem(409,'The action intent was cancelled or changed.');
  },
  cancel(keeper,id){db.prepare('UPDATE keeper_tx_intents SET cancelled=1 WHERE keeper_id=? AND intent_id=? AND request_id IS NULL').run(keeper.id,id)},
 };
}
module.exports={keeperIntents};
