import {afterEach,expect,test,spyOn} from 'bun:test'
import {keeperRequest} from '../src/chimera/keeper-api'
import {KeeperEstimateRetry} from '../src/chimera/keeper-retry'
afterEach(()=>{globalThis.fetch=original})
const original=globalThis.fetch
test('a proven pre-signing Circle budget wait is eligible for bounded UI retry',async()=>{
 spyOn(globalThis,'fetch').mockResolvedValue(Response.json({code:'CIRCLE_GAS_RESERVED',notSubmitted:true,error:'Synchronizing reserved gas'},{status:429}))
 await expect(keeperRequest('transactions',{})).rejects.toBeInstanceOf(KeeperEstimateRetry)
})
test('an unknown failure or a hashed transaction never becomes a safe budget retry',async()=>{
 spyOn(globalThis,'fetch').mockResolvedValue(Response.json({code:'CIRCLE_GAS_RESERVED',error:'Unknown acknowledgement'},{status:503}))
 try{await keeperRequest('transactions',{});throw Error('Expected failure')}catch(error){expect(error).not.toBeInstanceOf(KeeperEstimateRetry)}
})
