import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
describe("Private ordinary hunt instances", function () {
 this.timeout(600000);
 async function setup(){
  const [admin,alice,bob,charlie]=await ethers.getSigners();
  const token=await ethers.deployContract("ConfidentialTokenMock"),lab=await ethers.deployContract("ChimeraLab",[await token.getAddress()]);
  const col=await ethers.deployContract("ChimeraColosseum",[await lab.getAddress(),await token.getAddress()]);
  await (await lab.setArena(await col.getAddress())).wait();
  for(const p of [alice,bob,charlie])await (await lab.connect(p).hatchGenesis()).wait();
  const explore=async(p:any,id:number)=>{const e=await fhevm.createEncryptedInput(await col.getAddress(),p.address).add8(36).encrypt();return col.connect(p).explore(id,e.handles[0],e.inputProof)};
  return{admin,alice,bob,charlie,lab,col,explore};
 }
 it("independent pending hunts do not share a capturable NFT and each KMS result preserves ownership",async function(){
  if(!fhevm.isMock)this.skip();const {alice,bob,charlie,lab,col,explore}=await setup();
  const populationLimit=await lab.populationLimit();await(await col.setSettings(180,populationLimit)).wait();
  const players=[alice,bob,charlie],wilds=[];
  for(let i=0;i<players.length;i++){await(await explore(players[i],i+1)).wait();const [b]=await col.getBattle(i+1);wilds.push(Number(b.opponentId));expect(b.status).to.eq(1n);expect(b.challenger).to.eq(players[i].address)}
  expect(new Set(wilds).size).to.eq(3);expect(await lab.populationLimit()).to.eq(populationLimit);
  for(let i=0;i<players.length;i++){const [,handles]=await col.getBattle(i+1),proof=await fhevm.publicDecrypt([...handles]);const won=handles.filter(h=>Boolean(proof.clearValues[h as `0x${string}`])).length>=2;await(await col.settle(i+1,proof.abiEncodedClearValues,proof.decryptionProof)).wait();expect(await lab.ownerOf(wilds[i])).to.eq(won?players[i].address:await col.getAddress());expect(await col.wildEngaged(wilds[i])).to.eq(false);await expect(col.settle(i+1,proof.abiEncodedClearValues,proof.decryptionProof)).to.be.revertedWithCustomError(col,"NotPending")}
 });
 it("raising only the inventory setting permits another private spawn while a previous opponent stays engaged",async function(){
  if(!fhevm.isMock)this.skip();const {alice,bob,lab,col,explore}=await setup();await(await col.setSettings(180,1)).wait();await(await explore(alice,1)).wait();await expect(explore(bob,2)).to.be.revertedWithCustomError(col,"AshlandsCrowded");await(await col.setSettings(180,await lab.populationLimit())).wait();await(await explore(bob,2)).wait();const [a]=await col.getBattle(1),[b]=await col.getBattle(2);expect(a.opponentId).not.to.eq(b.opponentId);expect(await col.wildEngaged(a.opponentId)).to.eq(true);expect(await col.wildEngaged(b.opponentId)).to.eq(true);expect(await col.battleCooldown()).to.eq(180n);
 });
});
