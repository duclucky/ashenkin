const { encodeFunctionData, keccak256, isAddressEqual } = require('viem')
const { sponsorLane, SponsorBusyError } = require('./sponsor-lane')
const { settlementJournal } = require('./settlement-journal')
function settlementPipeline({ account, client, maxFee, file, maxPending = 8, log = entry => console.info(JSON.stringify(entry)) }) {
  const chainId=client.chain?.id||11155111
  if (!Number.isInteger(maxPending) || maxPending < 1 || maxPending > 16) throw Error('Invalid sponsor pipeline capacity')
  const journal = settlementJournal(file)
  async function broadcast(row) {
    if (!row.raw || keccak256(row.raw) !== row.hash) throw Error('Invalid persisted settlement signature')
    try {
      const hash = await client.sendRawTransaction({ serializedTransaction: row.raw })
      if (hash !== row.hash) throw Error('Unexpected settlement broadcast hash')
    } catch {
      // The signed hash is already durable. A timeout cannot authorize another
      // signature or nonce. The background worker resends only these same bytes.
      log({event:'settlement-broadcast-reconciling',hash:row.hash,nonce:row.nonce})
    }
    return row.hash
  }
  async function reconcile(row) {
    let receipt
    try { receipt = await client.getTransactionReceipt({hash:row.hash}) }
    catch (error) { if (error.name === 'TransactionReceiptNotFoundError') return false; throw error }
    if ((await client.getBlockNumber({cacheTime:0})) < receipt.blockNumber + 2n) return false
    const tx = await client.getTransaction({hash:row.hash})
    if (receipt.transactionHash !== row.hash || !tx.to || !isAddressEqual(tx.to,row.destination) ||
        !isAddressEqual(tx.from,row.signer) || tx.nonce !== row.nonce || tx.input !== row.data || tx.value !== 0n) {
      throw Error('Settlement journal receipt mismatch')
    }
    journal.finish(row.job,receipt)
    log({event:'settlement-pipeline-confirmed',hash:row.hash,nonce:row.nonce,failed:receipt.status!=='success'})
    return true
  }
  async function tick() {
    return sponsorLane(account.address,async()=>{
      const owner=journal.acquire(account.address)
      if(!owner)return
      try { for(const row of journal.active(account.address)){ if(!await reconcile(row))await broadcast(row) } }
      finally { journal.release(account.address,owner) }
    })
  }
  return {
    getJob(key) {
      const row=journal.get(key)
      if(!row)return null
      if(!isAddressEqual(row.signer,account.address))throw Error('Settlement signer mismatch')
      return {hash:row.hash,state:row.state}
    },
    async send(call,{key}={}) {
      if(typeof key!=='string'||!key.length||key.length>2048)throw Error('A stable settlement job key is required')
      const data=encodeFunctionData({abi:call.abi,functionName:call.functionName,args:call.args})
      return sponsorLane(account.address,async()=>{
        const owner=journal.acquire(account.address)
        if(!owner)throw new SponsorBusyError()
        try {
          const known=journal.get(key)
          if(known){
            if(!isAddressEqual(known.signer,account.address)||!isAddressEqual(known.destination,call.address)||known.data!==data)throw Error('Settlement job calldata mismatch')
            if(known.state==='reverted')throw Error('Settlement transaction reverted')
            return known.state==='signed'?broadcast(known):known.hash
          }
          for(const row of journal.active(account.address))await reconcile(row)
          const active=journal.active(account.address)
          if(active.length>=maxPending)throw new SponsorBusyError()
          if(await client.getChainId()!==chainId)throw Error('Settlement chain mismatch')
          const input={...call,account:account.address}
          const [latest,pending,fees,balance,estimate]=await Promise.all([
            client.getTransactionCount({address:account.address,blockTag:'latest'}),
            client.getTransactionCount({address:account.address,blockTag:'pending'}),
            client.estimateFeesPerGas(),client.getBalance({address:account.address,blockTag:'latest'}),
            client.estimateContractGas(input),client.simulateContract(input),
          ])
          const nonce=Math.max(latest,...active.map(row=>row.nonce+1))
          // Every nonce between the mined head and our new nonce must be ours.
          if(pending>nonce||nonce-latest>maxPending||Array.from({length:nonce-latest},(_,i)=>latest+i).some(n=>!active.some(row=>row.nonce===n)))throw new SponsorBusyError()
          const gas=estimate*12n/10n,cost=gas*fees.maxFeePerGas,reserved=active.reduce((sum,row)=>sum+BigInt(row.max_cost),0n)
          if(gas>9000000n||fees.maxFeePerGas>maxFee||cost+reserved>balance)throw Error('The settlement is outside the sponsor budget.')
          if(!journal.owns(account.address,owner))throw Error('Settlement signer lease expired')
          const raw=await account.signTransaction({chainId,type:'eip1559',to:call.address,data,value:0n,nonce,gas,...fees})
          const row={job:key,signer:account.address,nonce,destination:call.address,data,raw,hash:keccak256(raw),maxCost:cost}
          if(!journal.owns(account.address,owner))throw Error('Settlement signer lease expired')
          journal.save(row)
          log({event:'settlement-pipeline-signed',hash:row.hash,nonce})
          return broadcast(row)
        } finally { journal.release(account.address,owner) }
      })
    },
    tick,
    close:()=>journal.close(),
  }
}
module.exports={settlementPipeline}
