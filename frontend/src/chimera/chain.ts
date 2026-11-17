import { useSyncExternalStore } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  parseAbi,
  parseEventLogs,
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  type Abi,
  type Address,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem'
import { sepolia } from 'viem/chains'
import deployment from './contracts.json'
import deploymentV2 from './contracts.v2.json'
import ashenkinDeployment from './contracts.ashenkin.json'
import { firstReceipt, ReplacedActionError } from './transaction-receipt'

/* ───────────────────────── deployment ───────────────────────── */

type Names = 'ChimeraLab' | 'ChimeraArena' | 'ChimeraMarket' | 'ChimeraTreasury' | 'ChimeraRaid' | 'ChimeraExpeditions' | 'ChimeraQuests' | 'ChimeraTraining' | 'ChimeraColosseum' | 'ChimeraRelics' | 'ChimeraOracle' | 'ChimeraAscension' | 'ChimeraSeason' | 'ChimeraRaffle' | 'ChimeraDepths'
type Deployment = {
  chainId: number
  cZAMA: Address
  zamaMock: Address
  deployBlock: number
  seasonBlock?: number
  p1Block?: number
  raffleBlock?: number
  depthsBlock?: number
  legacy?: Record<string, Address>
  addresses: Record<Names, Address | null>
  abis: Record<Names, Abi>
}

const v1 = deployment as unknown as Deployment
const v2 = deploymentV2 as unknown as Deployment | null
const release = ashenkinDeployment as unknown as Deployment
const hasTestDeployment = v2?.chainId === v1.chainId && Object.keys(v1.addresses).every(name => !!v2.addresses[name as Names])
// Preserve NFT and proof links for the two older Sepolia collections.
const requestedWorld = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('world')
export const ACTIVE_WORLD = hasTestDeployment && requestedWorld === 'v2' ? 'v2' : requestedWorld === 'original' ? 'v1' : 'ashenkin'
const dep = ACTIVE_WORLD === 'v2' ? v2! : ACTIVE_WORLD === 'v1' ? v1 : release
export const NFT_API = ACTIVE_WORLD === 'v2' ? 'nft-v2' : ACTIVE_WORLD === 'v1' ? 'nft' : 'ashenkin-nft'

const ZERO = '0x0000000000000000000000000000000000000000' as Address
const at = (n: Names) => (dep.addresses[n] ?? ZERO) as Address
export const DEPLOYED = Object.values(dep.addresses).every(Boolean)
export const LAB = at('ChimeraLab')
export const ARENA = at('ChimeraArena')
export const MARKET = at('ChimeraMarket')
export const TREASURY = at('ChimeraTreasury')
export const RAID = at('ChimeraRaid')
export const EXPEDITIONS = at('ChimeraExpeditions')
export const QUESTS = at('ChimeraQuests')
export const TRAINING = at('ChimeraTraining')
/** Season of Masks: Blind Tactics arena, relic caches, Oracle's Riddle. */
export const COLOSSEUM = at('ChimeraColosseum')
export const RELICS = at('ChimeraRelics')
export const ORACLE = at('ChimeraOracle')
/** P1: Ascension altar (sacrifice for XP) and the three Season thrones. */
export const ASCENSION = at('ChimeraAscension')
export const SEASON = at('ChimeraSeason')
export const P1_BLOCK = BigInt(dep.p1Block || 0)
/** P2: the Sealed Raffle (hidden ticket counts, encrypted leader). */
export const RAFFLE = at('ChimeraRaffle')
export const RAFFLE_BLOCK = BigInt(dep.raffleBlock || 0)
/** P2: Arkhive Depths (sealed doors, sealed health, sealed loot). */
export const DEPTHS = at('ChimeraDepths')
export const DEPTHS_BLOCK = BigInt(dep.depthsBlock || 0)
/** First training contract (levels were migrated to the current one). */
export const LEGACY_TRAINING = (dep.legacy?.ChimeraTraining ?? null) as Address | null
export const SEASON_BLOCK = BigInt(dep.seasonBlock || dep.deployBlock || 0)
/** Zama's official confidential ZAMA (ERC-7984 wrapper of the Sepolia ZAMA mock). */
export const CZAMA = dep.cZAMA
export const ZAMA_MOCK = dep.zamaMock
export const CHAIN_ID = 11155111
export const DEPLOY_BLOCK = BigInt(dep.deployBlock || 0)
export const EXPLORER = 'https://sepolia.etherscan.io'
/** Free Sepolia ETH for gas (no mainnet balance required). */
export const GAS_FAUCET = 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia'

export const labAbi = dep.abis.ChimeraLab
export const arenaAbi = dep.abis.ChimeraArena
export const marketAbi = dep.abis.ChimeraMarket
export const treasuryAbi = dep.abis.ChimeraTreasury
export const raidAbi = dep.abis.ChimeraRaid
export const expeditionsAbi = dep.abis.ChimeraExpeditions
export const questsAbi = dep.abis.ChimeraQuests
export const questBatchAbi = parseAbi([
  'function supportsClaimAll() view returns (bool)',
  'function claimAll(uint32 expectedDay)',
  'error NothingToClaim()',
  'error QuestDayChanged(uint32 expectedDay, uint32 actualDay)',
])
export const trainingAbi = dep.abis.ChimeraTraining
export const colosseumAbi = dep.abis.ChimeraColosseum
export const relicsAbi = dep.abis.ChimeraRelics
export const oracleAbi = dep.abis.ChimeraOracle
export const ascensionAbi = dep.abis.ChimeraAscension
export const seasonAbi = dep.abis.ChimeraSeason
export const raffleAbi = dep.abis.ChimeraRaffle
export const depthsAbi = dep.abis.ChimeraDepths
export const czamaAbi = parseAbi([
  'function confidentialBalanceOf(address account) view returns (bytes32)',
  'function setOperator(address operator, uint48 until)',
  'function isOperator(address holder, address spender) view returns (bool)',
  'function wrap(address to, uint256 amount)',
  'function decimals() view returns (uint8)',
])
export const zamaAbi = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
])
const ALL_ABI = Object.values(dep.abis).flat() as Abi

/* ───────────────────────── clients ───────────────────────── */

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: fallback([
    http('https://ethereum-sepolia-rpc.publicnode.com', { timeout: 4_000, retryCount: 0 }),
    http('https://sepolia.gateway.tenderly.co', { timeout: 4_000, retryCount: 0 }),
  ], { retryCount: 1, retryDelay: 250 }),
  batch: { multicall: true },
  pollingInterval: 3_000,
})

/** Independent receipt observation avoids waiting for a lagging primary RPC. */
export const receiptMirror = createPublicClient({
  chain: sepolia,
  transport: http('https://sepolia.gateway.tenderly.co', { timeout: 4_000, retryCount: 0 }),
  pollingInterval: 2_000,
})

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: (...a: any[]) => void) => void }
export const injected = (): Eip1193 | undefined => (typeof window === 'undefined' ? undefined : (window as any).ethereum)

/* ───────────────────────── wallet store ───────────────────────── */

type WalletState = { account: Address | null; chainId: number | null; connecting: boolean }
let state: WalletState = { account: null, chainId: null, connecting: false }
const listeners = new Set<() => void>()
const set = (p: Partial<WalletState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useWallet = () => useSyncExternalStore(subscribe, () => state, () => state)
export const getWallet = () => state

let wired = false
export function wireWallet() {
  const eth = injected()
  if (!eth || wired) return
  wired = true
  eth.on?.('accountsChanged', (a: string[]) => set({ account: (a?.[0] as Address) ?? null }))
  eth.on?.('chainChanged', (c: string) => set({ chainId: parseInt(c, 16) }))
  // silent reconnect
  eth.request({ method: 'eth_accounts' }).then((a) => {
    const list = a as string[]
    if (list?.[0] && localStorage.getItem('chm:connected') === '1') set({ account: list[0] as Address })
  }).catch(() => {})
  eth.request({ method: 'eth_chainId' }).then((c) => set({ chainId: parseInt(c as string, 16) })).catch(() => {})
}

export async function connect() {
  const eth = injected()
  if (!eth) throw new Error('No browser wallet found. Install MetaMask or Rabby, then reload.')
  set({ connecting: true })
  try {
    const a = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
    localStorage.setItem('chm:connected', '1')
    set({ account: (a[0] as Address) ?? null })
    await ensureChain()
  } finally {
    set({ connecting: false })
  }
}

export function disconnect() {
  localStorage.removeItem('chm:connected')
  set({ account: null })
}

export async function ensureChain() {
  const eth = injected()
  if (!eth) return
  const hex = '0x' + CHAIN_ID.toString(16)
  const current = parseInt((await eth.request({ method: 'eth_chainId' })) as string, 16)
  if (current === CHAIN_ID) {
    set({ chainId: current })
    return
  }
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hex, chainName: 'Sepolia', nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'], blockExplorerUrls: [EXPLORER] }],
      })
    } else throw e
  }
  set({ chainId: CHAIN_ID })
}

function walletClient() {
  const eth = injected()
  if (!eth || !state.account) throw new Error('Connect your wallet first.')
  return createWalletClient({ account: state.account, chain: sepolia, transport: custom(eth as any) })
}

/* ───────────────────────── transactions ───────────────────────── */

export type Call = { address: Address; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[]; gas?: bigint; expectedAccount?: Address }
export type Sent = { hash: Hex; receipt: TransactionReceipt; events: { eventName: string; args: any; address: Address }[] }

let lastMinedAt = 0

/** Progress reporter for the action currently running (set by useAction). */
let txStep: ((s: string, hash?: string) => void) | null = null
export function setTxStep(f: typeof txStep) {
  txStep = f
}

function sentFromReceipt(receipt: TransactionReceipt): Sent {
  if (receipt.status !== 'success') throw new Error('The transaction reverted onchain.')
  const events = parseEventLogs({ abi: ALL_ABI, logs: receipt.logs, strict: false }) as Sent['events']
  return { hash: receipt.transactionHash, receipt, events }
}

export async function readSentReceipt(hash: Hex): Promise<Sent> {
  const receipt = await firstReceipt([publicClient, receiptMirror].map(client => signal => (
    client.waitForTransactionReceipt({ hash, signal, timeout: 120_000, pollingInterval: 2_000 })
  )))
  return sentFromReceipt(receipt)
}

export async function send(call: Call): Promise<Sent> {
  const report = txStep
  const { gas: gasLimit, expectedAccount, ...c } = call
  const checkAccount = () => {
    if (expectedAccount && state.account?.toLowerCase() !== expectedAccount.toLowerCase()) {
      throw new Error('Wallet changed. Select your moves again with the current wallet.')
    }
  }
  checkAccount()
  await ensureChain()
  checkAccount()
  const wc = walletClient()
  const account = wc.account.address
  txStep?.('Preparing the transaction and gas estimate…')
  // Public RPCs are load-balanced: right after a previous step (approve, setOperator…)
  // one node may not have seen it yet. Retry the simulation briefly in that window.
  const simulate = async () => {
    for (let i = 0; ; i++) {
      try {
        checkAccount()
        return (await publicClient.simulateContract({ ...(c as any), account })).request
      } catch (e) {
        if (i >= 4 || Date.now() - lastMinedAt > 90_000) throw e
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }
  // These reads are independent. Keep preflight validation, but don't pay for two
  // sequential RPC round trips before the player can even see their wallet.
  const [request, estimate] = await Promise.all([
    simulate(),
    gasLimit ? Promise.resolve(undefined) : publicClient.estimateContractGas({ ...(c as any), account }).catch(() => undefined),
  ])
  // FHE ops are metered differently at execution time — retain the existing margin.
  let gas = gasLimit ?? (estimate == null ? undefined : (estimate * 15n) / 10n)
  if (gas && gas > 16_000_000n) gas = 16_000_000n
  checkAccount()
  if (expectedAccount && state.chainId !== CHAIN_ID) throw new Error('Network changed. Switch to Sepolia and try again.')
  txStep?.('Confirm the transaction in your wallet (open the wallet extension if no popup appears)…')
  const hash = await wc.writeContract({ ...(request as any), gas })
  report?.('Sent — waiting for a Sepolia confirmation…', hash)
  let replacedAction = false
  const receipt = await firstReceipt([publicClient, receiptMirror].map(client => async signal => {
    const result = await client.waitForTransactionReceipt({
      hash, confirmations: 1, timeout: 180_000, pollingInterval: 2_000, signal,
      onReplaced: replacement => {
        if (signal.aborted) return
        if (replacement.reason !== 'repriced') replacedAction = true
        else report?.('Sent — fee updated in the wallet; waiting for confirmation…', replacement.transaction.hash)
      },
    })
    if (replacedAction) throw new ReplacedActionError()
    return result
  }))
  const sent = sentFromReceipt(receipt)
  lastMinedAt = Date.now()
  const confirmedHash = sent.hash ?? hash
  report?.('Confirmed on Sepolia — preparing the result…', confirmedHash)
  return { ...sent, hash: confirmedHash }
}

export async function read<T = unknown>(address: Address, abi: Abi | readonly unknown[], functionName: string, args: readonly unknown[] = []): Promise<T> {
  return (await publicClient.readContract({ address, abi: abi as Abi, functionName, args } as any)) as T
}

const ERROR_COPY: Record<string, string> = {
  NothingToClaim: 'These rewards have already been collected.',
  QuestDayChanged: 'The Quest Board reset for a new day. Check the updated rewards and try again.',
  ERC721IncorrectOwner: 'This creature belongs to someone else now. Refresh and try again.',
  ERC721NonexistentToken: 'That creature does not exist (yet).',
  InvalidKMSSignatures: 'The Zama network proof did not check out. Wait a few seconds and try again.',
  SenderNotAllowedToUseHandle: 'This encrypted value is not shared with your wallet yet. Refresh the page and try again.',
  OwnableUnauthorizedAccount: 'Only the game admin can do that.',
  ZamaProtocolUnsupported: 'This network is not supported by Zama FHEVM. Switch to Sepolia.',
  NotOwner: 'You do not own this creature.',
  GenesisLimitReached: 'This wallet already claimed its 3 genesis embryos.',
  InvalidLocus: 'That gene does not exist.',
  AlreadySequenced: 'This gene is already sequenced.',
  NoEnergy: 'Out of lab energy. It refills one point per day.',
  SameCreature: 'Pick two different creatures.',
  OnCooldown: 'One of the parents is still resting.',
  AlreadyCertified: 'This creature is already certified.',
  AlreadyChimera: 'Rare lineage already verified.',
  NotCertified: 'Certify the genome first.',
  NotAChimera: 'Rare lineage requires at least 5 rare traits.',
  NotReady: 'This creature is still recovering from its last fight.',
  AshlandsCrowded: 'The Colosseum is full of wild creatures. Hunt a roaming one instead.',
  NotRoaming: 'That wild creature is gone.',
  WildEngaged: 'Someone is already fighting that wild creature.',
  AlreadyDefending: 'This creature already guards the arena.',
  NotDefending: 'That defender has left the arena.',
  DefenderGone: 'That defender changed hands and can no longer be challenged.',
  SelfDuel: 'You cannot duel yourself.',
  NotPending: 'Already settled.',
  NotSeller: 'Only the seller can do that.',
  NotOpen: 'This listing is no longer open.',
  ZeroPrice: 'Set a price above zero.',
  OwnListing: 'You cannot buy your own listing.',
  ERC721InsufficientApproval: 'The contract needs approval to hold this creature.',
  NotCombat: 'Only game contracts can read battle stats.',
  BreedLimit: 'One parent has already bred 7 times — its line is spent.',
  EggNotPending: 'This egg has already hatched.',
  DailyLimit: 'You have used today’s runs here: 6 expeditions or 3 dives into the Depths (resets 00:00 UTC).',
  StillAway: 'Your creature has not returned yet.',
  NotKeeper: 'Only the keeper who started this run can do that.',
  AlreadyClaimed: 'Already claimed.',
  InvalidZone: 'That zone does not exist.',
  NotKillingBlow: 'This strike did not land the killing blow.',
  AlreadySlain: 'This boss has already fallen.',
  NotSlain: 'The boss is still alive — shares unlock once it falls.',
  NotRaider: 'You did not strike this boss.',
  LateToTheFight: 'You struck after the boss had already fallen, so this pot is not yours to share. Catch the next boss!',
  AlreadyCheckedIn: 'You already checked in today.',
  TaskNotDone: 'Finish the task first.',
  ChestLocked: 'Complete all 4 daily tasks to open the chest.',
  NotEnoughXp: 'Not enough XP yet — send this creature on expeditions, raids or arena battles.',
  MaxLevel: 'This creature is already at the maximum level (10).',
  TrainingPending: 'A training session is already waiting to be confirmed.',
  NoTraining: 'There is no pending training session for this creature.',
  StillDefending: 'That creature is guarding the Colosseum. Withdraw it first.',
  RelicsEquipped: 'Take the relics off the offering first — they would be lost with it.',
  NoXpRoom: 'Your hero already took its 120 XP for today. Come back after midnight UTC.',
  SeasonOver: 'This season has ended. Close it (anyone can) to start the next one.',
  SeasonRunning: 'The season is still running.',
  NotJoined: 'Join the season first — only what you do after joining counts.',
  AlreadyJoined: 'You already joined this season.',
  AlreadyHolding: 'You already sit on this throne.',
  NotEnough: 'Your season score must be higher than the current holder’s.',
  RoundClosed: 'This raffle round has ended. Draw it first, then buy into the next one.',
  RoundOpen: 'The raffle is still selling tickets. The draw opens when the timer ends.',
  AlreadyDrawing: 'The draw has already started. Finish it with the proof.',
  NotDrawing: 'Nothing to finish: the draw has not been requested.',
  RunActive: 'You are already down in the Depths. Finish that dive first.',
  RunOver: 'This dive is already over.',
  RunNotOver: 'Climb out of the Depths first.',
  BadDoor: 'Pick one of the three doors.',
  Bottom: 'This is the bottom floor. Climb out with your loot.',
  AlreadyRecorded: 'This dive’s depth has already been posted.',
  NotRevealing: 'Open the survival seal first.',
}

export function errorText(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'You rejected the request in your wallet.'
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    const name = rev?.data?.errorName
    if (name) return ERROR_COPY[name] ?? `Contract refused: ${name}.`
    if (/insufficient funds/i.test(e.message)) return 'Not enough Sepolia ETH for gas. Grab some free test ETH from a Sepolia faucet, then try again.'
    return e.shortMessage || e.message
  }
  const m = (e as any)?.message ?? String(e)
  if ((e as any)?.code === 4001 || /user rejected|denied/i.test(m)) return 'You rejected the request in your wallet.'
  if (/failed to fetch|networkerror|load failed|relayer|ECONNRESET|timed? ?out/i.test(m)) return 'The Zama network is slow to answer right now. Your funds are safe. Wait a moment and try again.'
  if (/insufficient funds/i.test(m)) return 'Not enough Sepolia ETH for gas. Grab some free test ETH from a Sepolia faucet, then try again.'
  return m.length > 220 ? m.slice(0, 220) + '…' : m
}

export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`

/** Raid contracts retired by a redeploy. Their events still count towards the chronicle and Hall of Keepers. */
export const OLD_RAIDS: Address[] = ['0xC7C1AEb57a4cA59eC7c2C4836f905c7e1655B58F']

// publicnode caps eth_getLogs at ~50k blocks, so history is read in slices and cached per key.
const LOG_SPAN = 40_000n
const logCache = new Map<string, { to: bigint; logs: Log[] }>()
/** One slice; if the RPC refuses the range (some free tiers cap at 10k blocks), retry it in small pieces. */
async function logSlice(params: Record<string, unknown>, a: bigint, b: bigint): Promise<Log[]> {
  const get = (from: bigint, to: bigint) => publicClient.getLogs({ ...params, fromBlock: from, toBlock: to } as Parameters<typeof publicClient.getLogs>[0]) as Promise<Log[]>
  try {
    return await get(a, b)
  } catch (e) {
    if (b - a < 9_000n) throw e
    const out: Log[] = []
    for (let s = a; s <= b; s += 9_000n) out.push(...(await get(s, s + 8_999n < b ? s + 8_999n : b)))
    return out
  }
}
/** Every log emitted by `address` since the deployment block, scanned incrementally (only new blocks on refetch). */
export async function scanLogs(key: string, address: Address | Address[], from = DEPLOY_BLOCK): Promise<Log[]> {
  const head = await publicClient.getBlockNumber()
  const hit = logCache.get(key)
  let start = hit ? hit.to + 1n : from
  const logs = hit ? [...hit.logs] : []
  const ranges: [bigint, bigint][] = []
  for (; start <= head; start += LOG_SPAN) ranges.push([start, start + LOG_SPAN - 1n < head ? start + LOG_SPAN - 1n : head])
  for (let i = 0; i < ranges.length; i += 4) {
    const parts = await Promise.all(ranges.slice(i, i + 4).map(([a, b]) => logSlice({ address }, a, b)))
    parts.forEach((p) => logs.push(...p))
  }
  logCache.set(key, { to: head, logs })
  return logs
}

/** One filtered eth_getLogs query, split into RPC-sized block slices from the deployment block to head. */
export async function getLogsSliced<T = Log>(params: Record<string, unknown>, from = DEPLOY_BLOCK): Promise<T[]> {
  const head = await publicClient.getBlockNumber()
  const out: T[] = []
  const ranges: [bigint, bigint][] = []
  for (let a = from; a <= head; a += LOG_SPAN) ranges.push([a, a + LOG_SPAN - 1n < head ? a + LOG_SPAN - 1n : head])
  for (let i = 0; i < ranges.length; i += 4) {
    const parts = await Promise.all(ranges.slice(i, i + 4).map(([a, b]) => logSlice(params, a, b)))
    parts.forEach((p) => out.push(...(p as T[])))
  }
  return out
}
