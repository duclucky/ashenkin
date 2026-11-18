const { decodeOutcome } = require('./life-rules')
const DAY = 86400_000

function lifeService({
  store,
  chain,
  world,
  dailyBudgetWei,
  clock = Date.now,
}) {
  const db = store.life
  async function settle(result) {
    if (db.has(world, result.day, result.nft)) return
    const proof = await chain.decrypt(result.handle)
    if (!(await chain.verify(result.day, result.nft, proof)))
      throw new Error('Unverified encounter result')
    const code = decodeOutcome(proof.value).code
    if (db.record(world, { ...result, code, proof }))
      console.info(
        JSON.stringify({
          event: 'living-encounter-recorded',
          world,
          day: result.day,
          nft: result.nft,
          code,
          hash: result.hash,
        }),
      )
  }
  return {
    world,
    async view(nft) {
      const data = db.view(world, nft)
      const state = db.state(world)
      const day = Math.floor(clock() / DAY)
      const today = data.history.some((h) => h.day === day)
      return {
        ...data,
        enabled: true,
        contract: chain.address,
        day,
        rules: 1,
        status: today ? 'settled' : state.error ? 'waiting' : 'pending',
        nextDayAt: (day + 1) * DAY,
        lastTick: state.lastTick,
      }
    },
    craft(nft, recipe) {
      db.craft(world, nft, recipe)
    },
    equip(nft, item) {
      db.equip(world, nft, item)
    },
    proof(day, nft) {
      return db.proof(world, day, nft)
    },
    pending() {
      return db.state(world).operation != null
    },
    async tick() {
      const held = db.acquire(world, clock())
      if (!held) return
      const { state, lease } = held
      const save = () => db.save(world, lease, state, clock())
      const renew = setInterval(() => db.renew(world, lease, clock()), 20_000)
      renew.unref()
      try {
        state.lastTick = clock()
        state.error = null
        const day = Math.floor(clock() / DAY)
        if (state.operation) {
          const op = state.operation
          const receipt = await chain.receipt(op.hash)
          if (!receipt) {
            // The same pre-signed bytes have the same hash/nonce. Never reroll.
            await chain.broadcast(op.raw, op.hash)
            save()
            return
          }
          if (!op.accounted) {
            if (
              !receipt.failed &&
              (receipt.results.length !== op.ids.length ||
                op.ids.some(
                  (id) =>
                    receipt.results.filter((r) => r.nft === id).length !== 1,
                ))
            ) {
              throw new Error(
                'Sponsored receipt is missing its expected NFT results',
              )
            }
            const charged = String(receipt.day)
            state.costs[charged] = String(
              BigInt(state.costs[charged] || 0) + BigInt(receipt.cost),
            )
            op.accounted = true
            op.events = receipt.results
            op.failed = receipt.failed
            save()
            console.info(
              JSON.stringify({
                event: 'living-draw-confirmed',
                world,
                hash: op.hash,
                costWei: receipt.cost,
                failed: !!receipt.failed,
              }),
            )
          }
          if (op.failed) {
            state.error = 'A sponsored draw reverted. No item was issued.'
            state.retry.push(
              ...op.ids.filter((id) => !state.retry.includes(id)),
            )
          } else {
            for (const event of op.events) await settle(event)
          }
          state.operation = null
          // Retain just the last three days of fee accounting.
          state.costs = Object.fromEntries(
            Object.entries(state.costs).filter(([d]) => Number(d) >= day - 2),
          )
          save()
          return
        }
        if (state.day !== day) {
          state.day = day
          state.cursor = 1
          state.retry = []
        }
        const population = await chain.population(day)
        // Scan at most 30 IDs/tick. Busy/escrow NFTs are revisited after the scan.
        let candidate = null
        const scanned = new Set()
        for (let i = 0; i < 30; i++) {
          const id =
            state.cursor <= population ? state.cursor++ : state.retry.shift()
          if (!id) break
          if (scanned.has(id)) {
            state.retry.push(id)
            break
          }
          scanned.add(id)
          if (db.has(world, day, id)) continue
          try {
            const prior = await chain.encounter(day, id)
            if (prior) {
              await settle(prior)
              continue
            }
            if (!(await chain.eligible(id))) {
              if (!state.retry.includes(id)) state.retry.push(id)
              continue
            }
          } catch (error) {
            if (!state.retry.includes(id)) state.retry.push(id)
            throw error
          }
          candidate = id
          break
        }
        save()
        if (!candidate) return
        const remaining = dailyBudgetWei - BigInt(state.costs[String(day)] || 0)
        if (remaining <= 0n || clock() % DAY >= DAY - 120_000) {
          state.retry.push(candidate)
          state.error = 'Waiting for the next sponsorship window.'
          save()
          return
        }
        try {
          // Signing alone costs no gas. The adapter must not broadcast here.
          const commit = (op) => {
            state.operation = { ...op, ids: [candidate], accounted: false }
            save()
            console.info(
              JSON.stringify({
                event: 'living-draw-prepared',
                world,
                hash: op.hash,
                ids: [candidate],
                maxCostWei: op.maxCost,
              }),
            )
          }
          const op = await chain.prepare(
            [candidate],
            remaining,
            () => {
              if (!db.owns(world, lease, clock()))
                throw new Error('Worker lease expired')
            },
            commit,
          )
          if (!state.operation) commit(op) // injectable offline test adapters
          await chain.broadcast(op.raw, op.hash)
        } catch (error) {
          if (!state.operation) state.retry.push(candidate)
          throw error
        }
      } catch {
        state.error =
          'Waiting for verified chain results or available sponsor gas.'
        try {
          save()
        } catch {
          /* lease moved; never overwrite another worker */
        }
        console.warn(
          JSON.stringify({ event: 'living-encounter-waiting', world }),
        )
      } finally {
        clearInterval(renew)
        db.release(world, lease)
      }
    },
  }
}
module.exports = { lifeService }
