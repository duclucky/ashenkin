const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {keeperStore}=require('./keeper-store'),{keeperChain,gameCall}=require('./keeper-chain'),{encodeFunctionData,parseAbi}=require('viem');
const A=require('./ashenkin.json').addresses,token='0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB',owner='0x7777777777777777777777777777777777777777',hash='0x'+'42'.repeat(32);
function fixture(t){const store=keeperStore(':memory:',randomUUID());t.after(()=>store.close());const keeper=store.setWallet(store.openSession('wallet:test').keeper,{id:randomUUID(),address:owner});const approved=operator=>encodeFunctionData({abi:parseAbi(['function setOperator(address,uint48)']),functionName:'setOperator',args:[operator,BigInt(Math.floor(Date.now()/1000)+86400)]});const call=gameCall(owner,A.ChimeraRelics,encodeFunctionData({abi:parseAbi(['function openCache()']),functionName:'openCache'}));return{store,keeper,approved,call}}
test('a recent cZAMA grant must reach two confirmations before its dependent action can be submitted',async t=>{
 const f=fixture(t),tx=f.store.beginTx(f.keeper,token.toLowerCase()+':'+f.approved(A.ChimeraRelics));f.store.updateTx(tx.id,{status:'CONFIRMED',hash,done:true});let waited;
 const chain={waitForTransactionReceipt:async input=>{waited=input;return{status:'success',transactionHash:hash}}};await keeperChain(f.store,{}, {chain}).waitForDependencies(f.keeper,f.call);assert.equal(waited.hash,hash);assert.equal(waited.confirmations,2);assert.ok(waited.timeout<=25000);
});
test('unrelated grants, unconfirmed grants and non-spending actions add no confirmation delay',async t=>{
 const f=fixture(t);for(const [op,done] of [[A.ChimeraLab,true],[A.ChimeraRelics,false]]){const tx=f.store.beginTx(f.keeper,token.toLowerCase()+':'+f.approved(op));f.store.updateTx(tx.id,{status:done?'CONFIRMED':'SENT',hash,done})}
 const service=keeperChain(f.store,{}, {chain:{waitForTransactionReceipt:async()=>{throw Error('Unexpected wait')}}});await service.waitForDependencies(f.keeper,f.call);
 const grant=f.store.pending(f.keeper,token.toLowerCase()+':'+f.approved(A.ChimeraRelics));f.store.updateTx(grant.id,{status:'CONFIRMED',hash,done:true});await service.waitForDependencies(f.keeper,{address:A.ChimeraRelics,name:'equip'});
});
test('a confirmation timeout or a reverted grant prevents signing instead of ignoring the dependency',async t=>{
 const f=fixture(t),tx=f.store.beginTx(f.keeper,token.toLowerCase()+':'+f.approved(A.ChimeraRelics));f.store.updateTx(tx.id,{status:'CONFIRMED',hash,done:true});const chain={waitForTransactionReceipt:async()=>{throw Error('timeout')}};const service=keeperChain(f.store,{}, {chain});await assert.rejects(service.waitForDependencies(f.keeper,f.call));chain.waitForTransactionReceipt=async()=>({status:'reverted',transactionHash:hash});await assert.rejects(service.waitForDependencies(f.keeper,f.call));
});

test('the wrapper waits for its own ERC20 allowance, not a cZAMA approval',async t=>{
 const f=fixture(t),wrapped='0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57';const data=encodeFunctionData({abi:parseAbi(['function approve(address,uint256)']),functionName:'approve',args:[token,1000n]});const tx=f.store.beginTx(f.keeper,wrapped.toLowerCase()+':'+data);f.store.updateTx(tx.id,{status:'CONFIRMED',hash,done:true});let waits=0;
 await keeperChain(f.store,{}, {chain:{waitForTransactionReceipt:async()=>{waits++;return{status:'success',transactionHash:hash}}}}).waitForDependencies(f.keeper,{address:token,name:'wrap'});assert.equal(waits,1);
});
test('a dependency timeout gives a recoverable UI message and closes only the proven unsent request',async t=>{
 const express=require('express'),{once}=require('node:events'),{keeperRouter}=require('../routes/keeper');const f=fixture(t),session=f.store.openSession('wallet:test'),origin='http://localhost';let sends=0;
 const chain={metrics:async()=>[1n,1n],waitForDependencies:async()=>{throw Object.assign(Error('Your approval is still syncing on Sepolia. Please retry shortly.'),{status:503,code:'APPROVAL_SYNC_PENDING',notSubmitted:true})}},circle={execute:async()=>{sends++;return{circleId:'next',status:'INITIATED'}}};const app=express();app.use('/api/keeper',keeperRouter({store:f.store,chain,circle,origin}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const submit=()=>fetch(`http://127.0.0.1:${server.address().port}/api/keeper/transactions`,{method:'POST',headers:{origin,cookie:'ash-keeper-local='+session.token,'content-type':'application/json'},body:JSON.stringify({destination:f.call.address,data:f.call.data})});
 try{const first=await submit();assert.equal(first.status,503);assert.match((await first.json()).error,/approval is still syncing/);assert.equal(sends,0);const failed=f.store.latest(f.keeper,f.call.address.toLowerCase()+':'+f.call.data);assert.equal(failed.done,1);assert.equal(failed.hash,null);chain.waitForDependencies=async()=>{};assert.equal((await submit()).status,200);assert.equal(sends,1);assert.notEqual(f.store.latest(f.keeper,f.call.address.toLowerCase()+':'+f.call.data).id,failed.id)}finally{await new Promise(resolve=>server.close(resolve))}
});
