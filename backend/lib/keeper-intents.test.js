const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {keeperStore}=require('./keeper-store');
test('intent fencing persists after restart and cannot be reused for changed calldata or another keeper',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'keeper-intents-')),file=path.join(dir,'store.sqlite');let store=keeperStore(file,'secret');
 try{let keeper=store.openSession('email:a@example.com').keeper;store.intents.claim(keeper,'action','first-call');store.intents.cancel(keeper,'action');store.close();store=keeperStore(file,'secret');keeper=store.openSession('email:a@example.com').keeper;
 assert.equal(store.intents.claim(keeper,'action','first-call').cancelled,1);assert.throws(()=>store.intents.attach(keeper,'action','request'));assert.throws(()=>store.intents.claim(keeper,'action','changed-call'));
 const other=store.openSession('email:b@example.com').keeper;assert.equal(store.intents.claim(other,'action','another-call').cancelled,0);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true})}
});
