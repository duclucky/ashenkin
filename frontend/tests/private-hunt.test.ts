import {expect,test} from 'bun:test'
import {validHuntEncounter} from '../src/chimera/game/private-hunt'
const world='11155111:0xabc',base={id:'11111111-1111-4111-8111-111111111111',world,creatureId:1,targetId:10,kind:'challengeWild',expires:2000}
test('private hunt responses bind the champion, world, target and expiry before signing',()=>{
 expect(validHuntEncounter(base,1,world,1000).targetId).toBe(10)
 expect(validHuntEncounter({...base,kind:'explore',targetId:null},1,world,1000).kind).toBe('explore')
 for(const change of [{world:'another'},{creatureId:2},{targetId:-1},{targetId:null},{expires:1000},{kind:'explore'},{id:'unsafe/path'}])expect(()=>validHuntEncounter({...base,...change},1,world,1000)).toThrow()
})
