const {test}=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),express=require('express');
const {keeperStore}=require('./keeper-store'),{keeperRouter}=require('../routes/keeper');
test('ordinary hunt allocation is authenticated and scoped to the current game wallet',async()=>{
 const store=keeperStore(':memory:','test-secret'),session=store.openSession('email:hunter@example.com');
 const keeper=store.setWallet(session.keeper,{id:'circle',address:'0x1111111111111111111111111111111111111111'}),calls=[];
 const hunts={prepare:async(k,nft)=>{calls.push([k.id,nft]);return{id:'reservation',creatureId:nft,kind:'explore',targetId:null}},rare:async()=>({sightings:[]})};
 const app=express(),origin='http://localhost';app.use('/api/keeper',keeperRouter({store,circle:{},chain:{},hunts,origin}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const request=async(cookie,body,from=origin)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/keeper/hunts`,{method:'POST',headers:{origin:from,'content-type':'application/json',cookie:cookie?`ash-keeper-local=${cookie}`:''},body:JSON.stringify(body)});return{status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():null}};
 try{assert.equal((await request(null,{creatureId:1})).status,401);assert.equal((await request(session.token,{creatureId:1},'https://bad.test')).status,403);assert.equal((await request(session.token,{creatureId:1,address:'0x2222222222222222222222222222222222222222'})).status,409);assert.equal((await request(session.token,{creatureId:1})).status,200);assert.deepEqual(calls,[[keeper.id,1]]);assert.equal((await request(session.token,{creatureId:0})).status,400)}finally{await new Promise(r=>server.close(r));store.close()}
});

test('a completed private hunt POST is idempotent and a forged lease never reaches Circle',async()=>{
 const {huntsService}=require('./hunts'),{encodeFunctionData,parseAbi}=require('viem'),A=require('./ashenkin.json').addresses;
 const store=keeperStore(':memory:','test-secret'),session=store.openSession('email:retry@example.com'),keeper=store.setWallet(session.keeper,{id:'c',address:'0x1111111111111111111111111111111111111111'});let executions=0;
 const abi=parseAbi(['function explore(uint256,bytes32,bytes)','function challengeWild(uint256,uint256,bytes32,bytes)']);
 const hunts=huntsService({store,world:'test',chain:{address:A.ChimeraColosseum,abi,owner:async()=>keeper.address,ready:async()=>0,roaming:async()=>[10],engaged:async()=>false,rareCount:async()=>0}});
 const circle={execute:async()=>{executions++;return{status:'CONFIRMED',hash:'0x'+'a'.repeat(64),done:true}}},chain={metrics:async()=>[1n,1n]},origin='http://localhost';
 const app=express();app.use('/api/keeper',keeperRouter({store,circle,chain,hunts,origin}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const post=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/keeper/${route}`,{method:'POST',headers:{origin,'content-type':'application/json',cookie:`ash-keeper-local=${session.token}`},body:JSON.stringify(body)});return{status:r.status,data:await r.json()}};
 try{const reservation=(await post('hunts',{creatureId:1})).data;const data=encodeFunctionData({abi,functionName:'challengeWild',args:[1n,10n,'0x'+'1'.repeat(64),'0x1234']});const call={destination:A.ChimeraColosseum,data,huntId:reservation.id};assert.equal((await post('transactions',{...call,huntId:'fake'})).status,404);assert.equal(executions,0);const first=await post('transactions',call),second=await post('transactions',call);assert.equal(first.status,200);assert.deepEqual(first,second);store.hunts.reconcile('test',A.ChimeraColosseum);const afterReconcile=await post('transactions',call);assert.deepEqual(afterReconcile,first);assert.equal(executions,1)}finally{await new Promise(r=>server.close(r));store.close()}
});
