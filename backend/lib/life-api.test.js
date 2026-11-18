const assert = require('node:assert/strict')
const { once } = require('node:events')
const { test } = require('node:test')
const express = require('express')
const { keeperStore } = require('./keeper-store')
const { keeperRouter } = require('../routes/keeper')
const { lifeService } = require('./life')

test('only the current NFT owner can view/craft/equip; inheritance follows the NFT, not the old account', async () => {
  const origin = 'http://localhost:5186', store = keeperStore(':memory:', 'test-secret')
  const one = store.openSession('email:one@example.com'), two = store.openSession('email:two@example.com')
  const first = store.setWallet(one.keeper, { id: 'c1', address: '0x7777777777777777777777777777777777777777' })
  const second = store.setWallet(two.keeper, { id: 'c2', address: '0x8888888888888888888888888888888888888888' })
  let owner = first.address
  const life = { ...lifeService({ store, chain: { address: 'contract' }, world: 'test', dailyBudgetWei: 1n }), chain: {
    owner: async () => owner, owned: async who => who === owner ? [1] : [],
  } }
  for (let day = 1; day <= 5; day++) store.life.record('test', { day, nft: 1, code: 304, at: 1, hash: 'h', handle: 'h', proof: { value: 304 } })
  for (let day = 6; day <= 7; day++) store.life.record('test', { day, nft: 1, code: 336, at: 1, hash: 'h', handle: 'h', proof: { value: 336 } })
  const app = express()
  app.use('/api/keeper', keeperRouter({ store, circle: {}, chain: {}, life, origin }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const req = async (route, token, body, from = origin) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/keeper/${route}`, {
      headers: { cookie: token ? `ash-keeper-local=${token}` : '', origin: from, 'content-type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, data: await res.json() }
  }
  try {
    assert.equal((await req('life')).status, 401)
    assert.deepEqual((await req('life', two.token)).data.specimens, [])
    assert.equal((await req('life/1', two.token)).status, 403)
    assert.equal((await req('life/1/craft', one.token, {}, 'https://bad.test')).status, 403)
    assert.equal((await req('life/1/equip', one.token, { item: 3 })).status, 409)
    assert.equal((await req('life/1/craft', one.token, {})).status, 200)
    assert.equal((await req('life/1/equip', one.token, { item: 3 })).data.equipped, 3)
    assert.equal((await req('life/1/proof/1', one.token)).data.value, 304)
    owner = second.address
    assert.equal((await req('life/1', one.token)).status, 403)
    const view = await req('life/1', two.token)
    assert.deepEqual(view.data.inventory, [{ item: 3, quantity: 1 }])
    assert.equal(view.data.history.length, 7)
    assert.equal((await req('life/0', two.token)).status, 400)
    assert.equal((await req('life/1/equip', two.token, { item: 99 })).status, 409)
  } finally { await new Promise(resolve => server.close(resolve)); store.close() }
})


test('the authenticated craft route uses the chosen first recipe and rejects reuse without taking more material',async()=>{
 const origin='http://localhost:5186', store=keeperStore(':memory:','test-secret')
 const session=store.openSession('email:balance@example.com')
 const who=store.setWallet(session.keeper,{id:'c-balance',address:'0x9999999999999999999999999999999999999999'})
 const service=lifeService({store,chain:{address:'contract'},world:'test',dailyBudgetWei:1n})
 const life={...service,chain:{owner:async()=>who.address,owned:async()=>[1]}}
 for(const [day,code] of [[1,304],[2,336]])store.life.record('test',{day,nft:1,code,at:day,hash:'h',handle:'h',proof:{value:code}})
 const app=express();app.use('/api/keeper',keeperRouter({store,circle:{},chain:{},life,origin}))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const req=async body=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/keeper/life/1/craft`,{method:'POST',headers:{cookie:`ash-keeper-local=${session.token}`,origin,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 try{
  const crafted=await req({recipe:'fragment'})
  assert.equal(crafted.status,200)
  assert.deepEqual(crafted.data.inventory,[{item:3,quantity:1}])
  assert.equal((await req({recipe:'fragment'})).status,409)
  assert.deepEqual(store.life.view('test',1).inventory,[{item:3,quantity:1}])
 }finally{await new Promise(resolve=>server.close(resolve));store.close()}
})
