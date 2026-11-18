const { randomUUID } = require('node:crypto')
const { parseEther, parseGwei } = require('viem')
const { problem } = require('./keeper-store')
const { addresses: A } = require('./ashenkin.json')

const CONSENT = 'offline-patrol-v1'
const MAX_FEE = parseGwei('0.1')
const RETURN_RESERVE = 16_000_000n * MAX_FEE
const HOURS = 8 * 3600_000

function patrolService({ store, circle, patrolChain: chain, clock = Date.now }) {
  const jobs = store.patrols
  function note(job, type, detail = {}) {
    // Do not write decrypted outcomes or personal login identifiers to the journal.
    job.journal.push({ at: clock(), type, ...detail })
  }
  async function idleWallet(keeper) {
    for (const tx of store.pendingTransactions(keeper)) {
      if (!tx.circle_id) throw problem(409, 'A game action is unresolved. Finish it before starting a patrol.')
      const info = await circle.status(keeper, tx.circle_id)
      store.updateTx(tx.id, info)
      if (!info.done) throw problem(409, 'Wait for your pending game action before starting a patrol.')
    }
  }
  async function advance(job, lease) {
    const keeper = store.keeper(job.keeperId)
    const save = () => jobs.save(job, lease, clock())
    const live = () => jobs.get(keeper, job.id)
    const finish = () => {
      job.active = false
      job.phase = job.completed >= job.trips ? 'complete' : 'stopped'
      note(job, job.phase)
      save()
    }
    async function send(kind) {
      const stopped = live().stopped || clock() >= job.expiresAt
      if (kind !== 'claim' && stopped) { finish(); return }
      const available = BigInt(job.budgetWei) - BigInt(job.spentWei) - (kind === 'claim' ? 0n : RETURN_RESERVE)
      if (available <= 0n) {
        job.phase = 'paused'; job.issue = 'Gas budget reached. No new trip can start.'; save(); return
      }
      job.step = { id: randomUUID(), kind, created: clock() }
      job.phase = kind === 'claim' ? 'returning' : kind === 'start' ? 'departing' : 'preparing'
      job.issue = null
      save() // Commit intent BEFORE Circle can accept it.
      try {
        const result = await circle.execute(keeper, job.step, chain.call(kind, job), undefined, {
          maxFeePerGas: MAX_FEE, maxCostWei: available,
          balanceReserveWei: kind === 'claim' ? 0n : RETURN_RESERVE,
          authorize() {
            if (!jobs.owns(job.id, lease, clock()) || (kind !== 'claim' && (live().stopped || clock() >= job.expiresAt))) {
              throw problem(409, 'The patrol was stopped before submission.')
            }
          },
        })
        Object.assign(job.step, result)
        note(job, 'transaction', { kind, requestId: job.step.id })
      } catch (error) {
        // Only locally proven pre-send rejections are safe to discard. Network
        // timeouts keep the intent and are reconciled by its immutable refId.
        if (error.notSubmitted) {
          job.step = null; job.phase = 'paused'; job.retryAt = clock() + 60_000
          job.issue = error.status === 409 ? 'Check the gas budget and game wallet ETH, then stop or try a new patrol.' : 'Gas fees or the provider are unavailable. The camp will retry returning an away specimen.'
        } else {
          job.issue = 'Checking a submitted action. No action will be sent twice.'
        }
      }
      save()
    }

    if (job.step) {
      const step = job.step
      if (!step.circleId) {
        const recovered = await circle.find(keeper, step.id, step.created)
        if (!recovered) {
          job.issue = 'The provider has not resolved this submission. No further action will be sent.'
          save(); return
        }
        Object.assign(step, recovered)
        save()
      }
      const info = await circle.status(keeper, step.circleId)
      if (!info.done) { if (info.hash) { step.hash = info.hash; save() }; return }
      let receipt = null
      if (info.hash) {
        receipt = await chain.receipt(info.hash, keeper)
        if (!receipt) return // Cost and contract events are mandatory, even if Circle says complete.
      }
      if (info.failed || receipt?.status !== 'success') {
        if (receipt) job.spentWei = String(BigInt(job.spentWei) + receipt.cost)
        job.step = null; job.phase = 'paused'; job.retryAt = Number.MAX_SAFE_INTEGER
        job.issue = 'An on-chain action failed. Stop the patrol and inspect its transaction before retrying.'
        note(job, 'failed', { kind: step.kind, hash: info.hash }); save(); return
      }
      if (step.kind === 'start') {
        const exp = await chain.started(receipt, keeper, job)
        job.expeditionId = exp.id; job.startedAt = exp.startedAt; job.endsAt = exp.endsAt
        job.phase = 'away'
        note(job, 'departed', { expeditionId: exp.id, hash: info.hash })
      } else if (step.kind === 'claim') {
        if (!chain.returned(receipt, keeper, job)) throw new Error('Missing expedition return event')
        job.completed++
        note(job, 'returned', { expeditionId: job.expeditionId, hash: info.hash })
        job.expeditionId = null; job.phase = 'ready'
      } else { job.phase = 'ready'; note(job, 'approved', { hash: info.hash }) }
      job.spentWei = String(BigInt(job.spentWei) + receipt.cost)
      job.issue = null; job.step = null; save(); return
    }

    // An existing trip is always brought home, including after stop/expiry/logout.
    if (job.expeditionId != null) {
      const exp = await chain.expedition(job.expeditionId)
      if (Number(exp.creatureId) !== job.creatureId || exp.keeper.toLowerCase() !== keeper.address.toLowerCase()) throw new Error('Expedition ownership mismatch')
      if (exp.claimed) {
        job.completed++; note(job, 'manual-return', { expeditionId: job.expeditionId })
        job.expeditionId = null; job.active = false; job.phase = 'stopped'; save(); return
      }
      for (const [part, type] of [[0.33, 'trail'], [0.66, 'survey']]) {
        if (clock() / 1000 >= job.startedAt + (job.endsAt - job.startedAt) * part &&
            !job.journal.some(e => e.type === type && e.expeditionId === job.expeditionId)) note(job, type, { expeditionId: job.expeditionId })
      }
      save()
      if (clock() / 1000 >= Number(exp.endsAt) && clock() >= (job.retryAt || 0)) {
        await idleWallet(keeper)
        await send('claim')
      }
      return
    }
    if (live().stopped || clock() >= job.expiresAt || job.completed >= job.trips) { finish(); return }
    if (job.phase === 'paused') return
    await idleWallet(keeper)
    const check = await chain.check(keeper, job.creatureId, job.zone)
    if (check.runs >= check.max) { job.phase = 'paused'; job.issue = 'Daily expedition allowance used. Stop and start a new patrol tomorrow.'; save(); return }
    if (clock() + check.duration * 1000 > job.expiresAt) { finish(); return }
    await send(check.approved ? 'start' : 'approve')
  }
  return {
    list: keeper => jobs.list(keeper),
    async start(keeper, input = {}) { return store.exclusive(keeper, async () => {
      const { creatureId, zone, trips, budget, consent } = input
      if (consent !== CONSENT || !Number.isSafeInteger(creatureId) || creatureId <= 0 ||
          !Number.isInteger(zone) || zone < 0 || zone > 2 || !Number.isInteger(trips) || trips < 1 || trips > 6 ||
          typeof budget !== 'string' || !/^0\.\d{1,6}$/.test(budget) || parseEther(budget) < parseEther('0.004') || parseEther(budget) > parseEther('0.05')) {
        throw problem(400, 'Choose an NFT, route, 1–6 trips, a 0.004–0.05 ETH budget and allow offline patrols.')
      }
      if (jobs.current(keeper)) throw problem(409, 'Finish or stop your current patrol first.')
      await idleWallet(keeper)
      const check = await chain.check(keeper, creatureId, zone)
      if (check.runs >= check.max) throw problem(409, 'Your daily expedition allowance is used.')
      const now = clock()
      return jobs.create(keeper, {
        creatureId, zone, trips, budgetWei: String(parseEther(budget)), spentWei: '0',
        createdAt: now, expiresAt: now + HOURS, consent, completed: 0, phase: 'ready',
        expeditionId: null, step: null, issue: null, journal: [{ at: now, type: 'assigned' }],
      }, now)
    }) },
    stop(keeper, id) { return jobs.stop(keeper, id) },
    guard(keeper, call) {
      const job = jobs.current(keeper)
      if (!job) return
      // Never allow approvals or changes to this NFT to race its departure.
      const target = Object.entries(A).find(([, address]) => address.toLowerCase() === call.address.toLowerCase())?.[0]
      if (target === 'ChimeraExpeditions' && call.name === 'claim') {
        if (call.args[0] !== BigInt(job.expeditionId || 0)) return
        if (job.stopped && !job.step) return // Explicit manual return fallback.
        throw problem(409, 'The camp is bringing this specimen home. Stop its patrol before a manual return.')
      }
      const methods = {
        ChimeraLab: ['breed', 'approve', 'setApprovalForAll'], ChimeraTraining: ['train', 'completeTraining'],
        ChimeraColosseum: ['explore', 'challengeWild', 'duel', 'registerDefender'],
        ChimeraArena: ['explore', 'challengeWild', 'duel', 'registerDefender'],
        ChimeraExpeditions: ['start'], ChimeraMarket: ['list'], ChimeraRaid: ['strike'],
        ChimeraAscension: ['ascend', 'retire'], ChimeraDepths: ['enter'], ChimeraRelics: ['equip', 'unequip'],
      }
      if (!methods[target]?.includes(call.name)) return
      // approve(address,id) / equip(relic,id,slot) have their NFT in argument 1.
      const ids = call.name === 'approve' || call.name === 'equip' ? call.args.slice(1, 2) :
        call.args.slice(0, call.name === 'breed' || call.name === 'ascend' ? 2 : 1)
      const affects = call.name === 'setApprovalForAll' || call.name === 'unequip' ||
        ids.some(arg => typeof arg === 'bigint' && arg === BigInt(job.creatureId))
      if (affects) throw problem(409, 'This specimen is assigned to an offline patrol. Stop the patrol and wait for its return first.')
    },
    async tick() {
      for (const row of jobs.due(clock())) {
        const held = jobs.acquire(row.id, clock())
        if (!held) continue
        const timer = setInterval(() => jobs.renew(row.id, held.lease, clock()), 20_000)
        timer.unref()
        try { await store.exclusive({ id: held.job.keeperId }, () => advance(held.job, held.lease)) }
        catch (error) {
          // SDK errors may contain credentials. Persist only a fixed public error.
          held.job.issue = 'Camp is waiting for a verified chain response. Your saved instructions remain in place.'
          if (error.status === 409 && !held.job.step && held.job.expeditionId == null) {
            held.job.phase = 'paused'
            held.job.issue = 'This specimen or wallet is busy or no longer available. Stop this patrol before assigning new orders.'
          }
          try { jobs.save(held.job, held.lease, clock()) } catch { /* another worker owns the lease */ }
          console.warn(JSON.stringify({ event: 'patrol-waiting', patrolId: row.id }))
        } finally { clearInterval(timer); jobs.release(row.id, held.lease) }
      }
    },
  }
}

module.exports = { patrolService, CONSENT, RETURN_RESERVE }
