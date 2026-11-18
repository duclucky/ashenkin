const assert = require('node:assert/strict')
const { test } = require('node:test')
const { keeperStore } = require('./keeper-store')
function fixture(){const store=keeperStore(':memory:','test-secret');let day=0;return {store,db:store.life,add(nft,code){store.life.record('test',{nft,day:++day,code,at:day,hash:'h',handle:'x',proof:{value:code}})}}}
test('the first lantern needs three common wins instead of waiting for two rare fragments',()=>{
 const f=fixture();try{
  f.add(1,304);f.add(1,304)
  const before=f.db.view('test',1)
  assert.equal(before.crafting.firstLantern,true)
  assert.throws(()=>f.db.craft('test',1,'thread'),{status:409})
  assert.deepEqual(f.db.view('test',1).inventory,before.inventory)
  f.add(1,304);f.db.craft('test',1,'thread')
  assert.deepEqual(f.db.view('test',1).inventory,[{item:3,quantity:1}])
  assert.equal(f.db.view('test',1).crafting.firstLantern,false)
  assert.throws(()=>f.db.craft('test',1,'thread'),{status:409})
 }finally{f.store.close()}
})
test('a fragment gives a deliberate first-lantern shortcut; the selected recipe alone determines spending',()=>{
 const f=fixture();try{
  f.add(1,304);f.add(1,336);f.db.craft('test',1,'fragment')
  assert.deepEqual(f.db.view('test',1).inventory,[{item:3,quantity:1}])
  for(let i=0;i<3;i++)f.add(2,304)
  f.add(2,336);f.db.craft('test',2,'thread')
  assert.deepEqual(f.db.view('test',2).inventory,[{item:2,quantity:1},{item:3,quantity:1}])
  for (const recipe of ['free','__proto__','constructor',null,['thread'],{}]) assert.throws(()=>f.db.craft('test',3,recipe),{status:400})
  assert.throws(()=>f.db.craft('test',3,'fragment'),{status:409})
  assert.deepEqual(f.db.view('test',3).inventory,[])
 }finally{f.store.close()}
})
test('the introduction discount belongs to the NFT and cannot be used after a natural lantern drop',()=>{
 const f=fixture();try{
  f.add(1,376) // formidable win + natural lantern
  for(let i=0;i<5;i++)f.add(1,304)
  f.add(1,336);f.add(1,336)
  assert.equal(f.db.view('test',1).crafting.firstLantern,false)
  const before=f.db.view('test',1).inventory
  assert.throws(()=>f.db.craft('test',1,'fragment'),{status:409})
  assert.deepEqual(f.db.view('test',1).inventory,before)
  f.db.craft('test',1,'standard')
  assert.deepEqual(f.db.view('test',1).inventory,[{item:3,quantity:2}])
  f.add(2,0)
  assert.equal(f.db.view('test',2).crafting.firstLantern,true)
  assert.deepEqual(f.db.view('test',2).inventory,[])
 }finally{f.store.close()}
})
