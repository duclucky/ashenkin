const {isAddressEqual,decodeFunctionData}=require('viem');
const {problem}=require('./keeper-store');
const RARE_TRAITS=2;
function huntsService({store,chain,world,clock=Date.now,log=()=>{}}){
 let lane=Promise.resolve();const serial=work=>{const next=lane.catch(()=>{}).then(work);lane=next;return next};
 const view=r=>({id:r.id,world,creatureId:r.creature,targetId:r.target,kind:r.target==null?'explore':'challengeWild',expires:r.expires});
 async function owner(keeper,nft){if(!isAddressEqual(await chain.owner(nft),keeper.address))throw problem(403,'This specimen is not in your game wallet.')}
 async function reconcile(keeper){
  const row=store.hunts.active(world,keeper);if(!row?.data)return row;
  const tx=store.latest(keeper,chain.address.toLowerCase()+':'+row.data);
  if(tx?.done){store.hunts.close(row.id);return null}
  return row;
 }
 async function rarity(nft){let count=store.hunts.rarity(world,nft);if(count===undefined){count=await chain.rareCount(nft);if(!Number.isInteger(count)||count<0||count>7)throw Error('Invalid public rarity');store.hunts.rarity(world,nft,count)}return count}
 return {
  async prepare(keeper,nft){return serial(async()=>{
   await owner(keeper,nft);store.hunts.expire(clock());store.hunts.reconcile(world,chain.address);let previous=await reconcile(keeper);
   if(previous&&!previous.data&&(previous.creature!==nft||(previous.target!=null&&await chain.engaged(previous.target)))){store.hunts.close(previous.id);previous=null}
   if(previous){if(previous.creature!==nft)throw problem(409,'Finish your submitted hunt first.');return view(previous)}
   const ready=await chain.ready(nft);if(ready*1000>clock())throw problem(409,'Your champion is recovering. Choose a ready specimen.');
   const ids=await chain.roaming(),reserved=new Set(store.hunts.reserved(world));let target=null;
   // Unknown rarities are read from seven public looks only, never hidden genes.
   for(let offset=0;offset<Math.min(ids.length,32)&&target==null;offset+=4){
    const candidates=await Promise.all(ids.slice(offset,offset+4).map(async id=>{
     if(reserved.has(id)||await chain.engaged(id))return null;
     return await rarity(id)<RARE_TRAITS?id:null;
    }));target=candidates.find(id=>id!=null)??null;
   }
   if(target==null){const capacity=await chain.capacity(),pending=store.hunts.explores(world);
    if(capacity.population+pending>=capacity.populationLimit)throw problem(409,'The NFT population is full. Return later or use Ascension to make room.');
    if(ids.length+pending>=capacity.maxRoaming)throw problem(409,'New hunt spaces are not open yet. Your current progress is safe.');
   }
   const row=store.hunts.claim(world,keeper,nft,target,clock());log({event:'private-hunt-reserved',reservation:row.id,creature:nft,target,method:target==null?'explore':'challengeWild'});return view(row);
  })},
  async bind(keeper,id,call){return serial(async()=>{
   const row=store.hunts.get(id,keeper);
   if(!row||row.world!==world)throw problem(404,'Hunt encounter not found.');
   if(row.data===call.data&&isAddressEqual(call.address,chain.address)){
    const previous=store.latest(keeper,chain.address.toLowerCase()+':'+row.data);
    if(previous?.done&&['CLEARED','CONFIRMED','COMPLETE'].includes(previous.status))return;
   }
   if(row.state!=='open')throw problem(404,'Hunt encounter not found.');
   if(!row.data&&row.expires<=clock())throw problem(410,'Your encounter expired before signing. Start a new hunt.');
   await owner(keeper,row.creature);
   if(!isAddressEqual(call.address,chain.address))throw problem(400,'Hunt contract mismatch.');
   const decoded=decodeFunctionData({abi:chain.abi,data:call.data}),method=row.target==null?'explore':'challengeWild';
   if(decoded.functionName!==method||Number(decoded.args[0])!==row.creature||(row.target!=null&&Number(decoded.args[1])!==row.target))throw problem(400,'Hunt target does not match this encounter.');
   if(row.data&&row.data!==call.data)throw problem(409,'This encounter already has a signed plan. Check the Inbox.');
   store.hunts.bind(id,keeper,call.data);
   if(!row.data)log({event:'private-hunt-bound',reservation:id,creature:row.creature,target:row.target});
  })},
  async release(keeper,id){return serial(()=>{const row=store.hunts.get(id,keeper);if(!row||row.world!==world)throw problem(404,'Hunt encounter not found.');if(row.data)throw problem(409,'This hunt may already be submitted. Check the Inbox.');store.hunts.close(id);return{released:true}})},
  async rare(offset=0){store.hunts.expire(clock());store.hunts.reconcile(world,chain.address);const ids=await chain.roaming(),reserved=new Set(store.hunts.reserved(world)),sightings=[];
   for(let start=offset;start<Math.min(ids.length,offset+24);start+=4){const group=await Promise.all(ids.slice(start,start+4).map(async id=>{const count=await rarity(id);return count>=RARE_TRAITS?{id,rareTraits:count,engaged:reserved.has(id)||await chain.engaged(id)}:null}));sightings.push(...group.filter(Boolean))}
   return{sightings,minimumRareTraits:RARE_TRAITS,nextOffset:ids.length>offset+24?offset+24:null}},
 };
}
module.exports={huntsService,RARE_TRAITS};
