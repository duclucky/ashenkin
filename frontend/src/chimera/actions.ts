import type { Address, Hex } from 'viem'
import { ARENA, CZAMA, EXPEDITIONS, LAB, MARKET, QUESTS, RAID, TRAINING, TREASURY, ZAMA_MOCK, arenaAbi, treasuryAbi, czamaAbi, expeditionsAbi, labAbi, marketAbi, questsAbi, raidAbi, trainingAbi, getWallet, read, send, zamaAbi, type Sent } from './chain'
import { encrypt64, publicDecryptWithProof, publicValues } from './fhe'
import { expeditionXpFromReceipt, xpGrantedFromReceipt } from './game/expedition-progression'
import { settlementEvent, sponsoredSettlement } from './sponsored-settlement'
import { questBatchAbi } from './chain'

type Step = (s: string, hash?: string) => void
const ev = (r: Sent, name: string) => r.events.find((e) => e.eventName === name)?.args

/* ───────────────────────── tokens ───────────────────────── */

export const FAUCET_AMOUNT = 1000

/** Mint test ZAMA (18 decimals) and wrap it 1:1 into confidential cZAMA (6 decimals). */
export async function faucet(account: Address, step: Step) {
  const amount = BigInt(FAUCET_AMOUNT) * 10n ** 18n
  step('Minting test ZAMA…')
  const m = await send({ address: ZAMA_MOCK, abi: zamaAbi, functionName: 'mint', args: [account, amount] })
  step('Approving the confidential wrapper…', m.hash)
  const allowance = await read<bigint>(ZAMA_MOCK, zamaAbi, 'allowance', [account, CZAMA])
  if (allowance < amount) await send({ address: ZAMA_MOCK, abi: zamaAbi, functionName: 'approve', args: [CZAMA, amount] })
  step('Wrapping into encrypted cZAMA…')
  return send({ address: CZAMA, abi: czamaAbi, functionName: 'wrap', args: [account, amount] })
}

/** ERC-7984 operator approval so a game contract can pull a hidden amount. */
export async function ensureOperator(account: Address, spender: Address, step: Step) {
  const ok = await read<boolean>(CZAMA, czamaAbi, 'isOperator', [account, spender])
  if (ok) return
  step('Allowing the game to charge cZAMA for 30 days…')
  const until = Math.floor(Date.now() / 1000) + 30 * 86400
  await send({ address: CZAMA, abi: czamaAbi, functionName: 'setOperator', args: [spender, until] })
  step('Waiting for Sepolia to show your cZAMA approval…')
  for (let i = 0; i < 10; i++) {
    if (await read<boolean>(CZAMA, czamaAbi, 'isOperator', [account, spender]).catch(() => false)) return
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('Your cZAMA approval is still syncing on Sepolia. Wait a moment, then retry this action.')
}

/* ───────────────────────── lab ───────────────────────── */

export async function hatch(step: Step) {
  step('Sealing a random genome…')
  const r = await send({ address: LAB, abi: labAbi, functionName: 'hatchGenesis' })
  const hatched = ev(r, 'Hatched')
  return { ...r, id: Number(hatched?.id), owner: hatched?.owner as Address | undefined }
}

export async function breed(account: Address, a: number, b: number, step: Step) {
  await ensureOperator(account, LAB, step)
  step('Paying the breeding fee and splicing encrypted alleles…')
  const r = await send({ address: LAB, abi: labAbi, functionName: 'breed', args: [BigInt(a), BigInt(b)] })
  const egg = ev(r, 'EggLaid')
  const id = Number(egg?.eggId)
  const paid = egg?.paidHandle as Hex
  const sponsored = await sponsoredSettlement('egg', id, [paid], step)
  if (sponsored) {
    const result = settlementEvent(sponsored, LAB, id, { Hatched: 'id', EggDud: 'eggId' })
    return { ...sponsored, id, ok: result.eventName === 'Hatched' }
  }
  const h = await hatchEgg(id, paid, step)
  return { ...h, id }
}

/** Second half of breeding: prove the hidden fee was paid, then the egg hatches (or refunds). */
export async function hatchEgg(eggId: number, paid: Hex, step: Step) {
  step('Checking the hidden fee with the Zama network…')
  const p = await publicDecryptWithProof([paid], { tries: 20 })
  const ok = Object.values(p.clearValues)[0] as boolean
  step(ok ? 'Fee confirmed — hatching the egg…' : 'Not enough cZAMA — returning the egg…')
  const s = await send({ address: LAB, abi: labAbi, functionName: 'hatchEgg', args: [BigInt(eggId), p.abiEncodedClearValues, p.decryptionProof] })
  return { ...s, ok }
}

export async function sequence(id: number, locus: number, step: Step) {
  step('Spending 1 energy to read both alleles…')
  return send({ address: LAB, abi: labAbi, functionName: 'sequence', args: [BigInt(id), locus] })
}

export async function certify(id: number, step: Step) {
  step('Publishing the full genome…')
  return send({ address: LAB, abi: labAbi, functionName: 'certify', args: [BigInt(id)] })
}

export async function claimChimera(id: number, phenoHandles: Hex[], step: Step) {
  step('Asking the Zama network for a decryption proof…')
  const r = await publicDecryptWithProof(phenoHandles.slice(0, 7))
  step('Submitting the proof onchain…')
  return send({ address: LAB, abi: labAbi, functionName: 'claimChimera', args: [BigInt(id), r.abiEncodedClearValues, r.decryptionProof] })
}

/* ───────────────────────── arena ───────────────────────── */

export type Started = Sent & { battleId: number; outcome: Hex; wildId?: number }
const started = (r: Sent): Started => {
  const b = ev(r, 'BattleStarted')
  return { ...r, battleId: Number(b?.battleId), outcome: b?.outcomeHandle, wildId: ev(r, 'WildSpawned') ? Number(ev(r, 'WildSpawned').wildId) : undefined }
}

export async function explore(myId: number, step: Step) {
  step('Venturing into the Ashlands…')
  return started(await send({ address: ARENA, abi: arenaAbi, functionName: 'explore', args: [BigInt(myId)] }))
}

export async function challengeWild(myId: number, wildId: number, step: Step) {
  step('Stalking the wild creature…')
  return started(await send({ address: ARENA, abi: arenaAbi, functionName: 'challengeWild', args: [BigInt(myId), BigInt(wildId)] }))
}

export async function registerDefender(account: Address, id: number, stake: bigint, step: Step) {
  await ensureOperator(account, ARENA, step)
  step('Encrypting your stake in the browser…')
  const e = await encrypt64(ARENA, account, stake)
  step('Posting your defender…')
  return send({ address: ARENA, abi: arenaAbi, functionName: 'registerDefender', args: [BigInt(id), e.handle, e.proof] })
}

export async function withdrawDefender(id: number, step: Step) {
  step('Recalling your defender…')
  return send({ address: ARENA, abi: arenaAbi, functionName: 'withdrawDefender', args: [BigInt(id)] })
}

export async function duel(account: Address, myId: number, defenderId: number, stake: bigint, step: Step) {
  await ensureOperator(account, ARENA, step)
  step('Encrypting your stake in the browser…')
  const e = await encrypt64(ARENA, account, stake)
  step('Entering the duel…')
  return started(await send({ address: ARENA, abi: arenaAbi, functionName: 'duel', args: [BigInt(myId), BigInt(defenderId), e.handle, e.proof] }))
}

export async function settle(battleId: number, outcome: Hex, step: Step) {
  step('Waiting for the Zama network to reveal the winner…')
  const r = await publicDecryptWithProof([outcome], { tries: 20 })
  const won = Object.values(r.clearValues)[0] as boolean
  step(won ? 'Challenger won — settling onchain…' : 'Defender held — settling onchain…')
  const s = await send({ address: ARENA, abi: arenaAbi, functionName: 'settle', args: [BigInt(battleId), r.abiEncodedClearValues, r.decryptionProof] })
  return { ...s, won }
}

/* ───────────────────────── market ───────────────────────── */

export async function list(account: Address, id: number, price: bigint, step: Step) {
  const approved = (await read<Address>(LAB, labAbi, 'getApproved', [BigInt(id)])).toLowerCase() === MARKET.toLowerCase()
  const all = await read<boolean>(LAB, labAbi, 'isApprovedForAll', [account, MARKET])
  if (!approved && !all) {
    step('Approving the market to hold your creature…')
    await send({ address: LAB, abi: labAbi, functionName: 'approve', args: [MARKET, BigInt(id)] })
  }
  step('Listing…')
  return send({ address: MARKET, abi: marketAbi, functionName: 'list', args: [BigInt(id), price] })
}

export async function cancelListing(listingId: number, step: Step) {
  step('Taking your creature back…')
  return send({ address: MARKET, abi: marketAbi, functionName: 'cancel', args: [BigInt(listingId)] })
}

export async function buy(account: Address, listingId: number, step: Step) {
  await ensureOperator(account, MARKET, step)
  step('Paying in encrypted cZAMA…')
  const r = await send({ address: MARKET, abi: marketAbi, functionName: 'buy', args: [BigInt(listingId)] })
  const paid = ev(r, 'PurchaseStarted')?.paidHandle as Hex
  return { ...r, paid }
}

export async function finalize(listingId: number, paid: Hex, step: Step) {
  step('Checking the payment with the Zama network…')
  const r = await publicDecryptWithProof([paid], { tries: 20 })
  const ok = Object.values(r.clearValues)[0] as boolean
  step(ok ? 'Payment confirmed — releasing the creature…' : 'Payment came up short — refunding…')
  const s = await send({ address: MARKET, abi: marketAbi, functionName: 'finalize', args: [BigInt(listingId), r.abiEncodedClearValues, r.decryptionProof] })
  return { ...s, ok }
}

/* ───────────────────────── expeditions ───────────────────────── */

export async function startExpedition(account: Address, creatureId: number, zone: number, step: Step) {
  const all = await read<boolean>(LAB, labAbi, 'isApprovedForAll', [account, EXPEDITIONS])
  if (!all) {
    step('Letting the expedition camp escort your creatures…')
    await send({ address: LAB, abi: labAbi, functionName: 'setApprovalForAll', args: [EXPEDITIONS, true] })
  }
  step('Sending your creature out — the outcome is sealed now…')
  const r = await send({ address: EXPEDITIONS, abi: expeditionsAbi, functionName: 'start', args: [BigInt(creatureId), zone] })
  return { ...r, id: Number(ev(r, 'ExpeditionStarted')?.expeditionId) }
}

export async function claimExpedition(id: number, creatureId: number, step: Step) {
  step('Bringing your creature home with the loot…')
  const result = await send({ address: EXPEDITIONS, abi: expeditionsAbi, functionName: 'claim', args: [BigInt(id)] })
  return { ...result, xp: expeditionXpFromReceipt(result.events, creatureId, TRAINING, EXPEDITIONS) }
}

/* ───────────────────────── world boss ───────────────────────── */

export async function strikeBoss(creatureId: number, step: Step) {
  step('Striking the World Boss with hidden power…')
  // Running damage totals before and after, so the striker can always read this hit as the difference.
  const me = getWallet().account
  const lvl = Number(await read<number>(RAID, raidAbi, 'currentLevel'))
  const before = me ? await read<Hex>(RAID, raidAbi, 'damageOf', [lvl, me]) : undefined
  const r = await send({ address: RAID, abi: raidAbi, functionName: 'strike', args: [BigInt(creatureId)] })
  const e = ev(r, 'Struck')
  const strikeId = Number(e?.strikeId)
  step('Asking the Zama network if that was the killing blow…')
  const p = await publicDecryptWithProof([e?.killingHandle as Hex], { tries: 20 })
  const killed = Object.values(p.clearValues)[0] as boolean
  if (killed) {
    step('Killing blow! Splitting the pot…')
    await send({ address: RAID, abi: raidAbi, functionName: 'finalizeKill', args: [BigInt(strikeId), p.abiEncodedClearValues, p.decryptionProof] })
  }
  const after = me ? await read<Hex>(RAID, raidAbi, 'damageOf', [Number(e?.level), me]) : undefined
  return { ...r, strikeId, killed, damage: e?.damageHandle as Hex, level: Number(e?.level), before: Number(e?.level) === lvl ? before : undefined, after, xp: xpGrantedFromReceipt(r.events, creatureId, TRAINING, RAID) }
}

/** Retry the payout of a killing blow if the browser closed before it was settled. */
export async function finalizeKill(strikeId: number, killing: Hex, step: Step) {
  step('Fetching the killing-blow proof…')
  const p = await publicDecryptWithProof([killing], { tries: 20 })
  step('Splitting the pot…')
  return send({ address: RAID, abi: raidAbi, functionName: 'finalizeKill', args: [BigInt(strikeId), p.abiEncodedClearValues, p.decryptionProof] })
}

/** If a killing blow landed but was never settled, find it among the latest strikes and settle it. */
export async function settleOpenKill(level: number, step: Step) {
  step('Looking for the killing blow…')
  const total = Number(await read<bigint>(RAID, raidAbi, 'totalStrikes'))
  for (let id = total; id > Math.max(0, total - 40); id--) {
    const [s, killing] = await read<[any, Hex]>(RAID, raidAbi, 'getStrike', [BigInt(id)])
    if (Number(s.level) !== level) continue
    const v = await publicValues([killing])
    if (v[killing.toLowerCase()] === true) return finalizeKill(id, killing, step)
  }
  throw new Error('No unsettled killing blow found among the latest strikes.')
}

export async function claimShare(level: number, step: Step) {
  step('Claiming your share of the raid pot…')
  return send({ address: RAID, abi: raidAbi, functionName: 'claimShare', args: [level] })
}

export async function publishPot(step: Step) {
  step('Refreshing the public pot…')
  return send({ address: RAID, abi: raidAbi, functionName: 'publishPot' })
}

/* ───────────────────────── quests ───────────────────────── */

export async function checkIn(step: Step) {
  step('Checking in…')
  return send({ address: QUESTS, abi: questsAbi, functionName: 'checkIn' })
}

export async function claimAllQuests(day: number, step: Step) {
  step('Collecting available daily rewards in one transaction…')
  return send({ address: QUESTS, abi: questBatchAbi, functionName: 'claimAll', args: [day] })
}

export async function claimTask(task: number, step: Step) {
  step('Claiming the quest reward…')
  return send({ address: QUESTS, abi: questsAbi, functionName: 'claimTask', args: [task] })
}

export async function claimChest(step: Step) {
  step('Opening the daily chest…')
  return send({ address: QUESTS, abi: questsAbi, functionName: 'claimChest' })
}

export async function publishReserve(step: Step) {
  step('Publishing the Treasury reserve…')
  return send({ address: TREASURY, abi: treasuryAbi, functionName: 'publishReserve' })
}

/* ───────────────────────── training ───────────────────────── */

/** Spend XP + a hidden cZAMA fee, then prove the fee was paid so the creature levels up. */
export async function train(account: Address, id: number, step: Step) {
  await ensureOperator(account, TRAINING, step)
  step('Paying the training fee in encrypted cZAMA…')
  const r = await send({ address: TRAINING, abi: trainingAbi, functionName: 'train', args: [BigInt(id)] })
  const paid = ev(r, 'TrainingStarted')?.paidHandle as Hex
  const sponsored = await sponsoredSettlement('training', id, [paid], step)
  if (sponsored) {
    const result = settlementEvent(sponsored, TRAINING, id, { LevelUp: 'creatureId', TrainingUnpaid: 'creatureId' })
    if (result.eventName === 'LevelUp' && result.args.level !== Number(ev(r, 'TrainingStarted')?.level) + 1) {
      throw new Error('Sepolia confirmed a different training session. Check the Dojo.')
    }
    return { ...sponsored, ok: result.eventName === 'LevelUp' }
  }
  return completeTraining(id, paid, step)
}

export async function completeTraining(id: number, paid: Hex, step: Step) {
  step('Checking the hidden fee with the Zama network…')
  const p = await publicDecryptWithProof([paid], { tries: 20 })
  const ok = Object.values(p.clearValues)[0] as boolean
  step(ok ? 'Fee confirmed — rolling a secret power boost…' : 'Not enough cZAMA — refunding the XP…')
  const s = await send({ address: TRAINING, abi: trainingAbi, functionName: 'completeTraining', args: [BigInt(id), p.abiEncodedClearValues, p.decryptionProof] })
  return { ...s, ok }
}

/** Re-grant the current owner the right to decrypt a creature's trained power (after a purchase). */
export async function revealBonus(id: number, step: Step) {
  step('Unsealing trained power for your wallet…')
  return send({ address: TRAINING, abi: trainingAbi, functionName: 'reveal', args: [BigInt(id)] })
}
