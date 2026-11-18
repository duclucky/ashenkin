import {expect,test} from 'bun:test'
import {livingCraftRecipes} from '../src/chimera/game/living-world'

test('the craft UI enables only a fully funded, explicitly quoted recipe',()=>{
 const crafting={version:2,firstLantern:true,recipes:[{id:'thread',cost:[{item:1,quantity:3}]},{id:'fragment',cost:[{item:1,quantity:1},{item:2,quantity:1}]}]}
 const recipes=livingCraftRecipes([{item:1,quantity:2},{item:2,quantity:1}],crafting)
 expect(recipes.map(r=>r.ready)).toEqual([false,true])
 expect(recipes[0].cost[0]).toEqual({item:1,quantity:3,have:2,missing:1})
 expect(recipes[1].cost.every(c=>c.missing===0)).toBe(true)
 expect(livingCraftRecipes([],crafting).some(r=>r.ready)).toBe(false)
})
test('an older API keeps its original standard price and cannot imply a discounted quote',()=>{
 const insufficient=livingCraftRecipes([{item:1,quantity:3}])
 expect(insufficient[0].id).toBe('standard')
 expect(insufficient[0].ready).toBe(false)
 expect(livingCraftRecipes([{item:1,quantity:5},{item:2,quantity:2}])[0].ready).toBe(true)
})
