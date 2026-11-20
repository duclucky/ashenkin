const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createSettlementSponsor}=require('./settlement-sponsor')
const {SponsorBusyError}=require('./sponsor-lane')
function setup(){
 let latest=10,pending=10,writes=[]
 const clients={account:{address:'0x9999999999999999999999999999999999999999'},maxFee:100n,
  client:{estimateFeesPerGas:async()=>({maxFeePerGas:1n}),getBalance:async()=>1000000n,simulateContract:async call=>({request:call}),estimateContractGas:async()=>100n,getTransactionCount:async call=>call.blockTag==='pending'?pending:latest},
  wallet:{writeContract:async request=>{writes.push(request);return '0x'+'a'.repeat(64)}}}
 return {sponsor:createSettlementSponsor({},clients),writes,head:(a,b)=>{latest=a;pending=b}}
}
test('sponsor never reuses an acknowledged nonce while RPC pending state lags',async()=>{
 const f=setup(),call={address:'0x1111111111111111111111111111111111111111',abi:[],functionName:'settle',args:[]}
 await f.sponsor.send(call)
 assert.equal(f.writes[0].nonce,10)
 await assert.rejects(f.sponsor.send(call),error=>error instanceof SponsorBusyError)
 assert.equal(f.writes.length,1)
 f.head(11,11)
 await f.sponsor.send(call)
 assert.equal(f.writes[1].nonce,11)
})
test('another pending sponsor transaction is refused before signing',async()=>{
 const f=setup();f.head(10,11)
 await assert.rejects(f.sponsor.send({address:'0x1111111111111111111111111111111111111111',abi:[],functionName:'settle',args:[]}),error=>error instanceof SponsorBusyError)
 assert.equal(f.writes.length,0)
})

test('an ambiguous broadcast keeps its nonce reserved and is not signed again',async()=>{
 const f=setup();let writes=0
 const clients={account:{address:'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},maxFee:100n,client:{estimateFeesPerGas:async()=>({maxFeePerGas:1n}),getBalance:async()=>1000000n,simulateContract:async call=>({request:call}),estimateContractGas:async()=>100n,getTransactionCount:async()=>10},wallet:{writeContract:async()=>{writes++;throw Error('acknowledgement lost')}}}
 const sponsor=createSettlementSponsor({},clients),call={address:'0x1111111111111111111111111111111111111111',abi:[],functionName:'settle',args:[]}
 await assert.rejects(sponsor.send(call),/acknowledgement lost/)
 await assert.rejects(sponsor.send(call),error=>error instanceof SponsorBusyError)
 assert.equal(writes,1)
})
