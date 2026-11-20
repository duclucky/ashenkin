const {parseGwei,parseEther,isAddressEqual}=require('viem');
const TERMINAL=new Set(['COMPLETE','FAILED','CANCELLED','DENIED']);
function budgetWaiting(){return Object.assign(Error('Circle is releasing gas reserved by your previous actions. Your ETH has not been spent again.'),{status:429,code:'CIRCLE_GAS_RESERVED',notSubmitted:true,retryAfterSeconds:5})}
async function reservedCircleGas(client,keeper){
 let reserved=0n,pageAfter;const cursors=new Set(),ids=new Set();
 for(let page=0;page<20;page++){
  const response=await client.listTransactions({walletIds:[keeper.circle_id],pageSize:50,...(pageAfter?{pageAfter}:{})});
  const transactions=response.data?.transactions;if(!Array.isArray(transactions))throw budgetWaiting();
  for(let tx of transactions){
   if(tx.walletId!==keeper.circle_id||tx.blockchain!=='ETH-SEPOLIA'||tx.transactionType==='INBOUND'||TERMINAL.has(tx.state))continue;
   if(tx.sourceAddress&&!isAddressEqual(tx.sourceAddress,keeper.address))continue;
   if(typeof tx.id!=='string')throw budgetWaiting();if(ids.has(tx.id))continue;ids.add(tx.id);
   // Circle's list endpoint returns summaries without estimatedFee. Retrieve
   // only pending outgoing details; absence of a fee cannot mean zero reserve.
   if(!tx.estimatedFee){
    const expectedId=tx.id;
    try{tx=(await client.getTransaction({id:expectedId})).data?.transaction}catch{throw budgetWaiting()}
    if(!tx||tx.id!==expectedId||tx.walletId!==keeper.circle_id||tx.blockchain!=='ETH-SEPOLIA'||(tx.sourceAddress&&!isAddressEqual(tx.sourceAddress,keeper.address)))throw budgetWaiting();
    if(TERMINAL.has(tx.state))continue;
   }
   const fee=tx.estimatedFee;let cost;
   try{
    if(fee&&/^\d+$/.test(fee.gasLimit)&&/^(?:\d+)(?:\.\d+)?$/.test(fee.maxFee))cost=BigInt(fee.gasLimit)*parseGwei(fee.maxFee);
    else if(fee&&/^(?:\d+)(?:\.\d+)?$/.test(fee.networkFee))cost=parseEther(fee.networkFee);
   }catch{throw budgetWaiting()}
   if(cost==null||cost<=0n)throw budgetWaiting();reserved+=cost;
  }
  const next=response.data.nextPageAfter||(transactions.length===50?transactions.at(-1)?.id:undefined);
  if(!next)return reserved;if(cursors.has(next))throw budgetWaiting();cursors.add(next);pageAfter=next;
 }
 throw budgetWaiting();
}
module.exports={reservedCircleGas,budgetWaiting};
