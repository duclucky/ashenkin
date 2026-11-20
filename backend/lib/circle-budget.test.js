const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {circleKeepers}=require('./circle-keepers');
const keeper={id:randomUUID(),circle_id:randomUUID(),address:'0x7777777777777777777777777777777777777777'};
function fixture(){
 const state={pending:[],sends:0,balance:1000000000000000n,pages:null};
 const client={listTransactions:async({walletIds,pageAfter})=>{assert.deepEqual(walletIds,[keeper.circle_id]);return{data:state.pages?state.pages(pageAfter):{transactions:state.pending}}},estimateContractExecutionFee:async()=>({data:{medium:{priorityFee:'1',maxFee:'1'}}}),createContractExecutionTransaction:async()=>{state.sends++;return{data:{id:randomUUID(),state:'INITIATED'}}}};
 const chain={estimateGas:async()=>100000n,getBalance:async()=>state.balance};
 const adapter=circleKeepers({},client,chain);
 return{state,client,chain,send:()=>adapter.execute(keeper,{id:randomUUID()},{address:keeper.address,data:'0x'}),row:(id,state='SENT',gasLimit='900000')=>({id,walletId:keeper.circle_id,blockchain:'ETH-SEPOLIA',sourceAddress:keeper.address,state,estimatedFee:{gasLimit,maxFee:'1'}})};
}
test('Circle pending reservations prevent a new signature even when that call alone fits the chain balance',async()=>{const f=fixture();f.state.pending=[f.row('prior')];await assert.rejects(f.send(),e=>e.code==='CIRCLE_GAS_RESERVED'&&e.notSubmitted===true&&e.status===429);assert.equal(f.state.sends,0)});
test('mined-but-Circle-pending fees remain reserved until the provider completes them',async()=>{const f=fixture();const row=f.row('prior','CONFIRMED');f.state.pending=[row];await assert.rejects(f.send(),e=>e.code==='CIRCLE_GAS_RESERVED');row.state='COMPLETE';await f.send();assert.equal(f.state.sends,1)});
test('an affordable pending reservation does not serialize other sends or count another wallet',async()=>{const f=fixture();f.state.pending=[f.row('small','SENT','100000'),{...f.row('foreign'),walletId:randomUUID()}];await f.send();assert.equal(f.state.sends,1)});
test('all pages of pending fees are counted and malformed reservations never authorize signing',async()=>{const f=fixture();f.state.pages=page=>page?{transactions:[f.row('second','SENT','500000')]}:{transactions:[f.row('first','SENT','500000')],nextPageAfter:'next'};await assert.rejects(f.send(),e=>e.code==='CIRCLE_GAS_RESERVED');f.state.pages=null;f.state.pending=[{...f.row('unknown'),estimatedFee:null}];await assert.rejects(f.send(),e=>e.code==='CIRCLE_GAS_RESERVED');assert.equal(f.state.sends,0)});
test('failed and cancelled requests reserve no gas, incoming transfers do not consume the wallet budget',async()=>{const f=fixture();f.state.pending=[f.row('failed','FAILED'),f.row('cancelled','CANCELLED'),{...f.row('inbound'),transactionType:'INBOUND'}];await f.send();assert.equal(f.state.sends,1)});


test('Circle list summaries omit fee fields, so pending details are read before admitting a new action',async()=>{
 const f=fixture();const summary={...f.row('summary','SENT','100000')};delete summary.estimatedFee;f.state.pending=[summary];let reads=0;
 f.client.getTransaction=async({id})=>{reads++;assert.equal(id,'summary');return{data:{transaction:f.row(id,'SENT','100000')}}};
 await f.send();assert.equal(f.state.sends,1);assert.equal(reads,1);
});


test('pending detail lookup refuses a mismatched wallet, chain or transaction ID',async()=>{
 for(const patch of [{id:'other'},{walletId:'other'},{blockchain:'ETH'}]){
  const f=fixture(),summary={...f.row('pending')};delete summary.estimatedFee;f.state.pending=[summary];
  f.client.getTransaction=async()=>({data:{transaction:{...f.row('pending'),...patch}}});
  await assert.rejects(f.send(),e=>e.code==='CIRCLE_GAS_RESERVED'&&e.notSubmitted);assert.equal(f.state.sends,0);
 }
});
