const {createPublicClient,http,parseAbi}=require('viem');
const {sepolia}=require('viem/chains');
const {RPC,zama}=require('./zama');
const {huntsService}=require('./hunts');
const A=require('./ashenkin.json').addresses;
const ABI=parseAbi(['function roamingWilds() view returns(uint256[])','function wildEngaged(uint256) view returns(bool)','function readyAt(uint256) view returns(uint64)','function maxRoaming() view returns(uint16)','function explore(uint256,bytes32,bytes)','function challengeWild(uint256,uint256,bytes32,bytes)']);
const LAB_ABI=parseAbi(['function ownerOf(uint256) view returns(address)','function getPhenotypeHandles(uint256) view returns(bytes32[8])','function populationLimit() view returns(uint256)','function circulatingPopulation() view returns(uint256)']);
function productionHunts(store){
 const client=createPublicClient({chain:sepolia,transport:http(RPC,{timeout:8000,retryCount:1})});
 const read=(functionName,args=[])=>client.readContract({address:A.ChimeraColosseum,abi:ABI,functionName,args});
 const lab=(functionName,args=[])=>client.readContract({address:A.ChimeraLab,abi:LAB_ABI,functionName,args});
 const chain={address:A.ChimeraColosseum,abi:ABI,
  owner:id=>lab('ownerOf',[BigInt(id)]),ready:async id=>Number(await read('readyAt',[BigInt(id)])),
  roaming:async()=>(await read('roamingWilds')).map(Number),engaged:id=>read('wildEngaged',[BigInt(id)]),
  capacity:async()=>{const [maxRoaming,populationLimit,population]=await Promise.all([read('maxRoaming'),lab('populationLimit'),lab('circulatingPopulation')]);return{maxRoaming:Number(maxRoaming),populationLimit:Number(populationLimit),population:Number(population)}},
  rareCount:async id=>{const handles=(await lab('getPhenotypeHandles',[BigInt(id)])).slice(0,7);let timer;
   try{const result=await Promise.race([zama().then(z=>z.publicDecrypt(handles)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Public rarity is temporarily unavailable')),15000)})]);const values=new Map(Object.entries(result.clearValues).map(([h,v])=>[h.toLowerCase(),v]));const traits=handles.map(h=>Number(values.get(h.toLowerCase())));if(traits.some(v=>!Number.isInteger(v)||v<0||v>15))throw Error('Invalid visible traits');return traits.filter(v=>v>=12).length}finally{clearTimeout(timer)}
  },
 };
 return huntsService({store,chain,world:`11155111:${A.ChimeraColosseum.toLowerCase()}`,log:event=>console.info(JSON.stringify(event))});
}
module.exports={productionHunts};
