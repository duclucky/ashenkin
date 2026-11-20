const {decodeFunctionData,parseAbi,isAddressEqual}=require('viem')
const {problem}=require('./keeper-store')
const A=require('./ashenkin.json').addresses
const APPROVAL_ABI=parseAbi(['function setOperator(address,uint48)','function approve(address,uint256)'])
const SPENDING=new Map(Object.entries({ChimeraLab:['breed'],ChimeraArena:['duel','registerDefender'],ChimeraColosseum:['duel','registerDefender'],ChimeraMarket:['buy'],ChimeraTraining:['train'],ChimeraRelics:['openCache'],ChimeraOracle:['guess'],ChimeraRaffle:['buy'],ChimeraDepths:['enter']}).map(([name,methods])=>[A[name].toLowerCase(),methods]))
// Wait only for a recent grant used by this action, not for every game click.
async function waitForApproval({store,chain,keeper,call,czama,zama,now=Date.now()}){
 const wrap=isAddressEqual(call.address,czama)&&call.name==='wrap'
 if(!wrap&&!SPENDING.get(call.address.toLowerCase())?.includes(call.name))return
 const token=(wrap?zama:czama).toLowerCase(),method=wrap?'approve':'setOperator',spender=wrap?czama:call.address
 const candidates=store.recentConfirmedTransactions(keeper,now-15*60_000)
 for(const tx of candidates){
  const separator=tx.fingerprint.indexOf(':')
  if(tx.fingerprint.slice(0,separator).toLowerCase()!==token)continue
  let approval
  try{approval=decodeFunctionData({abi:APPROVAL_ABI,data:tx.fingerprint.slice(separator+1)})}catch{continue}
  if(approval.functionName!==method||!isAddressEqual(approval.args[0],spender))continue
  // A later revocation is not replaced with an older successful grant.
  if((wrap&&approval.args[1]===0n)||(!wrap&&Number(approval.args[1])*1000<=now))return
  try{
   const receipt=await chain.waitForTransactionReceipt({hash:tx.hash,confirmations:2,timeout:20_000,pollingInterval:1500})
   if(receipt.status!=='success'||receipt.transactionHash?.toLowerCase()!==tx.hash.toLowerCase())throw Error('Approval receipt changed')
  }catch{throw Object.assign(problem(503,'Your approval is still syncing on Sepolia. Please retry shortly.'),{code:'APPROVAL_SYNC_PENDING',notSubmitted:true})}
  return
 }
}
module.exports={waitForApproval}
