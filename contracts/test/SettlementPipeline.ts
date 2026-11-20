import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
describe("Interactive settlement pipeline",function(){
 this.timeout(600000);
 it("broadcasts three proof settlements before mining and then verifies every receipt",async function(){
  if(!fhevm.isMock)this.skip();
  const {createPublicClient,custom,parseGwei}=require('../../backend/node_modules/viem');
  const {mnemonicToAccount}=require('../../backend/node_modules/viem/accounts');
  const {createSettlementSponsor}=require('../../backend/lib/settlement-sponsor');
  const [,alice,bob,charlie]=await ethers.getSigners();
  const token=await ethers.deployContract('ConfidentialTokenMock'),lab=await ethers.deployContract('ChimeraLab',[await token.getAddress()]),col=await ethers.deployContract('ChimeraColosseum',[await lab.getAddress(),await token.getAddress()]);
  await(await lab.setArena(await col.getAddress())).wait();
  const players=[alice,bob,charlie],calls=[];
  for(let i=0;i<3;i++){
   await(await lab.connect(players[i]).hatchGenesis()).wait();const myId=await lab.totalCreatures();
   const input=await fhevm.createEncryptedInput(await col.getAddress(),players[i].address).add8(36).encrypt();await(await col.connect(players[i]).explore(myId,input.handles[0],input.inputProof)).wait();
   const [,handles]=await col.getBattle(i+1),proof=await fhevm.publicDecrypt([...handles]);
   calls.push({address:await col.getAddress(),abi:JSON.parse(col.interface.formatJson()),functionName:'settle',args:[BigInt(i+1),proof.abiEncodedClearValues,proof.decryptionProof]});
  }
  const network={id:31337,name:'Local FHE mock',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://localhost']}}};
  const account=mnemonicToAccount('test test test test test test test test test test test junk');
  const client=createPublicClient({chain:network,transport:custom({request:({method,params}:any)=>ethers.provider.send(method,params||[])})});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'settlement-integration-'));
  const sponsor=createSettlementSponsor({}, {account,client,wallet:{},maxFee:parseGwei('100')},{pipeline:true,journalFile:path.join(dir,'journal.sqlite'),log:()=>{}});
  try{
   const nonce=await client.getTransactionCount({address:account.address});await ethers.provider.send('evm_setAutomine',[false]);
   const hashes=await Promise.all(calls.map((call,i)=>sponsor.send(call,{key:'battle:'+i})));
   expect(new Set(hashes).size).to.eq(3);
   const txs=await Promise.all(hashes.map(hash=>client.getTransaction({hash})));
   expect(txs.map(tx=>tx.nonce)).to.deep.eq([nonce,nonce+1,nonce+2]);expect(txs.every(tx=>tx.blockNumber===null)).to.eq(true);
   await ethers.provider.send('evm_mine',[]);await ethers.provider.send('evm_mine',[]);await ethers.provider.send('evm_mine',[]);
   await sponsor.tick();
   for(let i=0;i<3;i++){const [battle]=await col.getBattle(i+1);expect(battle.status).to.eq(2n);expect(sponsor.getJob('battle:'+i).state).to.eq('confirmed');expect((await client.getTransactionReceipt({hash:hashes[i]})).status).to.eq('success')}
  }finally{await ethers.provider.send('evm_setAutomine',[true]);sponsor.close();fs.rmSync(dir,{recursive:true,force:true})}
 });
});
