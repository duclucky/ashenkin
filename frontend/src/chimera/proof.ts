import { useEffect, useState } from 'react'
import { getAbiItem, type Abi, type AbiEvent, type Address, type Hex } from 'viem'
import { COLOSSEUM, DEPTHS, DEPTHS_BLOCK, EXPEDITIONS, LAB, MARKET, ORACLE, RAID, RELICS, SEASON_BLOCK, TRAINING, colosseumAbi, depthsAbi, getLogsSliced, oracleAbi, relicsAbi } from './chain'

/* The Proof Center: for every game mode, what is sealed, where the randomness comes from,
   what becomes public and how that reveal is checked onchain. */

export type ModeKey = 'tactics' | 'depths' | 'relics' | 'oracle' | 'genes' | 'raid' | 'expeditions' | 'training' | 'market'

export type Mode = {
  key: ModeKey
  name: string
  place: string
  contract: () => Address
  sealed: string[]
  randomness: string
  revealed: string
  check: string
  ifPublic: string
}

export const MODES: Mode[] = [
  {
    key: 'tactics',
    name: 'Blind Tactics',
    place: 'arena',
    contract: () => COLOSSEUM,
    sealed: ['Both 3-move plans', 'Each creature’s fight power (genes + training + relics)', 'Every round score and dice roll', 'Duel stakes'],
    randomness: 'FHE.randEuint16(32) adds a fresh encrypted roll to each side in each round. A wild creature’s plan comes from FHE.randEuint8, so nobody can predict its moves.',
    revealed: 'Only the three round winners can be decrypted publicly, once the fight starts. Settlement checks their proof and records the score. A hunter can privately read the wild plan after settlement.',
    check: 'The round bits are decrypted by the Zama KMS. Settle only accepts them with a valid KMS signature, checked onchain by FHE.checkSignatures, so nobody can fake a result.',
    ifPublic: 'If a defender’s stored plan were public, a challenger could pick a counter for every round and take the move bonus. Private power and rolls still affect the score.',
  },
  {
    key: 'depths',
    name: 'Arkhive Depths',
    place: 'depths',
    contract: () => DEPTHS,
    sealed: ['Door contents', 'Creature and monster power', 'Health, damage and loot'],
    randomness: 'The contract rolls and seals all three doors when it creates a floor. A separate encrypted roll sets the monster’s strength during the encounter.',
    revealed: 'The lit door number and the door picked are public. Only the delver can read the lit door before choosing. A finished run can publish one survival bit at the keeper’s request.',
    check: 'The record transaction checks the KMS signature against the survival bit. The door rolls and private floor log stay sealed.',
    ifPublic: 'Anyone could scan the floor and pick the safest door or best loot. The lantern gives the delver one piece of information to weigh against the risk.',
  },
  {
    key: 'relics',
    name: 'Relic caches',
    place: 'relics',
    contract: () => RELICS,
    sealed: ['The tier and power you pulled', 'Your pity counter', 'Whether your 25 cZAMA payment went through'],
    randomness: 'FHE.randEuint8 is compared with a public odds table (153 / 72 / 26 / 5 out of 256) entirely under encryption.',
    revealed: 'Nothing, unless you choose to appraise. Then tier and power are published with a KMS proof.',
    check: 'Appraisals are accepted only with a KMS signature checked by FHE.checkSignatures. The odds table is a constant in the verified contract.',
    ifPublic: 'Everyone would know your build before a fight. Snipers would hunt keepers who just pulled a Legendary and buyers would price you out.',
  },
  {
    key: 'oracle',
    name: 'Oracle’s Riddle',
    place: 'oracle',
    contract: () => ORACLE,
    sealed: ['The 4-gene answer', 'Every guess', 'Every hint (only the guesser can read it)'],
    randomness: 'FHE.randEuint8 rolls each gene of the answer. Not even the developers can read it.',
    revealed: 'The jackpot total, and one “solved?” bit when a keeper claims. The answer is made public only after the round ends.',
    check: 'A claim pays out only if the KMS-signed “solved” bit passes FHE.checkSignatures onchain.',
    ifPublic: 'Anyone could copy the best player’s hints and race them to the jackpot. The puzzle would be solved by whoever reads the chain fastest.',
  },
  {
    key: 'genes',
    name: 'Genomes & breeding',
    place: 'lab',
    contract: () => LAB,
    sealed: ['Hidden allele pairs and the private element', 'Which allele each parent passed down', 'Mutations'],
    randomness: 'FHE.randEuint8 and FHE.randEbool flip the inheritance coins and mutations inside ciphertext.',
    revealed: 'Ownership, visible appearance and a genome commitment at birth. Sequencing authorizes private reads of a locus. The owner can irreversibly make the full genome publicly decryptable.',
    check: 'Compare the genome handles with the birth commitment. Owner-only certification makes the genome public; it is not a proof-settlement step. A rare-lineage claim separately checks a KMS proof of the seven visible traits onchain.',
    ifPublic: 'Breeders would read every rare genome and snipe them. Private allele pairs and power would be available to rivals before they chose their fights.',
  },
  {
    key: 'raid',
    name: 'World Boss',
    place: 'raid',
    contract: () => RAID,
    sealed: ['The boss’s exact health', 'Every strike’s damage'],
    randomness: 'FHE.randEuint16 rolls each strike’s damage.',
    revealed: 'A 10-step health band, and a “slain” bit when the boss falls.',
    check: 'The kill is accepted only with a KMS signature checked by FHE.checkSignatures.',
    ifPublic: 'Everyone would wait for the last few hit points and snipe the killing blow. Hidden health makes every strike count.',
  },
  {
    key: 'expeditions',
    name: 'Expeditions',
    place: 'expeditions',
    contract: () => EXPEDITIONS,
    sealed: ['Whether the run succeeded', 'The loot amount'],
    randomness: 'FHE.randEuint16 and FHE.randEuint64 roll success and loot from encrypted stats.',
    revealed: 'Nothing. Loot is paid straight into your encrypted cZAMA balance.',
    check: 'No reveal is needed: the payment itself is an encrypted transfer.',
    ifPublic: 'Bots would map the loot tables and farm only the best zones, draining the Treasury.',
  },
  {
    key: 'training',
    name: 'Training',
    place: 'training',
    contract: () => TRAINING,
    sealed: ['The power each level adds', 'Your fee payment'],
    randomness: 'FHE.randEuint8 rolls the 2–5 power each level adds.',
    revealed: 'The level (and evolution), plus a “fee paid” bit.',
    check: 'The fee bit is accepted only with a KMS signature checked by FHE.checkSignatures.',
    ifPublic: 'Rivals would know your creature’s exact strength and pick only fights they cannot lose.',
  },
  {
    key: 'market',
    name: 'Purse & market',
    place: 'market',
    contract: () => MARKET,
    sealed: ['Every cZAMA balance', 'Every transfer amount'],
    randomness: 'None needed.',
    revealed: 'Listing prices, and a “payment succeeded” bit for each sale.',
    check: 'A sale completes only with a KMS-signed payment bit checked by FHE.checkSignatures.',
    ifPublic: 'Whales and their spending would be visible to everyone, and you could be targeted.',
  },
]
export const modeOf = (k: ModeKey) => MODES.find((m) => m.key === k)!

/* ───────────────────────── drawer store ───────────────────────── */

export type ProofTx = { label: string; hash: Hex; block?: bigint }
export type ProofHandle = { label: string; handle: Hex; publicValue?: boolean; meaning?: [string, string] }
export type ProofSpec = { mode: ModeKey; id?: number; title?: string; result?: string; txs?: ProofTx[]; handles?: ProofHandle[] }

let current: ProofSpec | null = null
const subs = new Set<(s: ProofSpec | null) => void>()
export function openProof(s: ProofSpec) {
  current = s
  subs.forEach((f) => f(current))
}
export function closeProof() {
  current = null
  subs.forEach((f) => f(current))
}
export function useProofSpec() {
  const [s, set] = useState<ProofSpec | null>(current)
  useEffect(() => {
    subs.add(set)
    return () => void subs.delete(set)
  }, [])
  return s
}

/* ───────────────────────── onchain trail ───────────────────────── */

type Found = { txs: ProofTx[]; handles: ProofHandle[]; depthRecord?: { survived: boolean; depth: number } }
type L = { transactionHash: Hex; blockNumber: bigint; args: Record<string, any> }

const ev = (abi: unknown, name: string) => getAbiItem({ abi: abi as Abi, name }) as AbiEvent
async function logs(address: Address, abi: unknown, name: string, args?: Record<string, unknown>, from = SEASON_BLOCK) {
  return getLogsSliced<L>({ address, event: ev(abi, name), args }, from)
}

export async function latestDepthRecord() {
  const records = await logs(DEPTHS, depthsAbi, 'DepthRecorded', undefined, DEPTHS_BLOCK || SEASON_BLOCK)
  const latest = records[records.length - 1]
  return latest ? { id: Number(latest.args.runId) } : null
}

/** Find the transactions and ciphertext handles behind one result. */
export async function proofTrail(mode: ModeKey, id: number): Promise<Found> {
  const txs: ProofTx[] = []
  const handles: ProofHandle[] = []
  if (mode === 'tactics') {
    const [st, se] = await Promise.all([logs(COLOSSEUM, colosseumAbi, 'BattleStarted', { battleId: BigInt(id) }), logs(COLOSSEUM, colosseumAbi, 'BattleSettled', { battleId: BigInt(id) })])
    if (st[0]) {
      txs.push({ label: 'Fight started: sealed plans in, dice rolled', hash: st[0].transactionHash, block: st[0].blockNumber })
      ;(st[0].args.roundHandles as Hex[]).forEach((h, i) => handles.push({ label: `Round ${i + 1} result (public bit)`, handle: h, publicValue: true, meaning: ['challenger took this round', 'opponent took this round'] }))
    }
    if (se[0]) txs.push({ label: 'Settled: round bits checked against the KMS proof', hash: se[0].transactionHash, block: se[0].blockNumber })
  } else if (mode === 'depths') {
    const args = { runId: BigInt(id) }
    const from = DEPTHS_BLOCK || SEASON_BLOCK
    const [[started], [ended], [reveal], [record]] = await Promise.all([
      logs(DEPTHS, depthsAbi, 'RunStarted', args, from),
      logs(DEPTHS, depthsAbi, 'RunEnded', args, from),
      logs(DEPTHS, depthsAbi, 'SurvivalRevealed', args, from),
      logs(DEPTHS, depthsAbi, 'DepthRecorded', args, from),
    ])
    if (started) txs.push({ label: 'Entered: first floor rolled and sealed', hash: started.transactionHash, block: started.blockNumber })
    if (ended) txs.push({ label: 'Climbed out: payout computed under encryption', hash: ended.transactionHash, block: ended.blockNumber })
    if (reveal) {
      txs.push({ label: 'Keeper opened the survival bit for public verification', hash: reveal.transactionHash, block: reveal.blockNumber })
      handles.push({ label: 'Survival bit', handle: reveal.args.survivedHandle as Hex, publicValue: true, meaning: ['survived', 'did not survive'] })
    }
    if (record) txs.push({ label: 'Survival proof accepted by the contract', hash: record.transactionHash, block: record.blockNumber })
    const depthRecord = record ? { survived: record.args.survived === true, depth: Number(record.args.depth) } : undefined
    return { txs, handles, depthRecord }
  } else if (mode === 'relics') {
    const [op, fu, ap] = await Promise.all([
      logs(RELICS, relicsAbi, 'CacheOpened', { relicId: BigInt(id) }),
      logs(RELICS, relicsAbi, 'Fused', { relicId: BigInt(id) }),
      logs(RELICS, relicsAbi, 'Appraised', { relicId: BigInt(id) }),
    ])
    if (fu[0]) txs.push({ label: 'Forged by fusing three relics', hash: fu[0].transactionHash, block: fu[0].blockNumber })
    if (op[0]) {
      txs.push({ label: 'Rolled: tier drawn from encrypted randomness', hash: op[0].transactionHash, block: op[0].blockNumber })
      handles.push({ label: 'Tier (sealed to the keeper)', handle: op[0].args.tierHandle as Hex }, { label: 'Power (sealed to the keeper)', handle: op[0].args.powerHandle as Hex })
    }
    if (ap[0]) txs.push({ label: 'Appraised: made public with a KMS proof', hash: ap[0].transactionHash, block: ap[0].blockNumber })
  } else if (mode === 'oracle') {
    const [g, c, r] = await Promise.all([
      logs(ORACLE, oracleAbi, 'Guessed', { guessId: BigInt(id) }),
      logs(ORACLE, oracleAbi, 'ClaimRequested', { guessId: BigInt(id) }),
      logs(ORACLE, oracleAbi, 'ClaimRejected', { guessId: BigInt(id) }),
    ])
    if (g[0]) {
      txs.push({ label: 'Guess sealed, hint computed under encryption', hash: g[0].transactionHash, block: g[0].blockNumber })
      handles.push({ label: 'Hint (only the guesser can read it)', handle: g[0].args.feedbackHandle as Hex })
    }
    if (c[0]) {
      txs.push({ label: 'Claim: “solved?” bit made public', hash: c[0].transactionHash, block: c[0].blockNumber })
      handles.push({ label: 'Solved? (public bit)', handle: c[0].args.solvedHandle as Hex, publicValue: true, meaning: ['perfect guess: solved', 'not solved'] })
      const keeper = c[0].args.keeper as Address
      const won = (await logs(ORACLE, oracleAbi, 'Solved', { keeper })).find((l) => Number(l.args.guessId) === id)
      if (won) txs.push({ label: 'Paid: KMS proof accepted, jackpot sent', hash: won.transactionHash, block: won.blockNumber })
    }
    if (r[0]) txs.push({ label: 'Rejected: the KMS proof said “not solved”', hash: r[0].transactionHash, block: r[0].blockNumber })
  }
  return { txs, handles }
}
