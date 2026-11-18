import { bytesToHex, getAddress, type Address, type Hex } from 'viem'
import { ACTIVE_WORLD, COLOSSEUM, CZAMA, DEPTHS, EXPEDITIONS, LAB, ORACLE, RAFFLE, RAID, RELICS, TRAINING, getWallet, injected, publicClient } from './chain'
import { keeperRequest } from './keeper-api'
import { DecryptionFlights, privateDecryptionKey, publicDecryptionKey, retryDecryption, transientDecryptionError } from './decryption-requests'

/* Lazy, browser-only Zama relayer instance. */

type Instance = any
let instancePromise: Promise<Instance> | null = null
export type FheStatus = 'idle' | 'loading' | 'ready' | 'error'
let status: FheStatus = 'idle'
export const fheStatus = () => status

export function getFhe(): Promise<Instance> {
  if (!instancePromise) {
    status = 'loading'
    instancePromise = (async () => {
      const sdk: any = await import('@zama-fhe/relayer-sdk/web')
      const base = new URL(import.meta.env.BASE_URL, window.location.href)
      await sdk.initSDK({
        tfheParams: new URL('fhe/tfhe_bg.wasm', base).href,
        kmsParams: new URL('fhe/kms_lib_bg.wasm', base).href,
      })
      // The public relayer occasionally answers 503 for a few seconds — retry before giving up.
      for (let i = 0; ; i++) {
        try {
          const inst = await sdk.createInstance({ ...sdk.SepoliaConfig, network: { request: (request: any) => publicClient.request(request) } })
          status = 'ready'
          return inst
        } catch (e) {
          if (i >= 5 || !transientDecryptionError(e)) throw e
          await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
        }
      }
    })().catch((e) => {
      status = 'error'
      instancePromise = null
      throw e
    })
  }
  return instancePromise
}

export const ZERO_HANDLE = ('0x' + '0'.repeat(64)) as Hex
export const isZero = (h?: string | null) => !h || /^0x0+$/.test(h)

const decryptFlights = new DecryptionFlights()

/* ───────────────────────── public decryption ───────────────────────── */

type Clear = bigint | boolean
const PD = 'chm:pd:'
const enc = (v: Clear) => (typeof v === 'boolean' ? (v ? 'b1' : 'b0') : 'n' + v.toString())
const dec = (s: string): Clear => (s === 'b1' ? true : s === 'b0' ? false : BigInt(s.slice(1)))

export function cachedPublic(handle: string): Clear | undefined {
  try {
    const s = localStorage.getItem(PD + handle.toLowerCase())
    return s == null ? undefined : dec(s)
  } catch {
    return undefined
  }
}

/** Values of publicly decryptable handles, cached forever (ciphertexts are immutable). */
export async function publicValues(handles: string[], opts: { tries?: number } = {}): Promise<Record<string, Clear>> {
  const out: Record<string, Clear> = {}
  const missing: string[] = []
  for (const h of handles) {
    const k = h.toLowerCase()
    const c = cachedPublic(k)
    if (c !== undefined) out[k] = c
    else if (!isZero(k)) missing.push(k)
  }
  if (missing.length) {
    const r = await publicDecryptWithProof(missing, opts)
    for (const [h, v] of Object.entries(r.clearValues)) {
      const k = h.toLowerCase()
      out[k] = v as Clear
      try {
        localStorage.setItem(PD + k, enc(v as Clear))
      } catch {
        /* storage full — fine */
      }
    }
  }
  return out
}

/** Decryption + KMS proof, needed for any onchain settle/claim. Retries while the coprocessor catches up. */
export async function publicDecryptWithProof(handles: string[], { tries = 14 }: { tries?: number } = {}) {
  if (!handles.length || handles.some(handle => !/^0x[0-9a-f]{64}$/i.test(handle) || isZero(handle))) throw new Error('Valid ciphertext handles are required for public decryption.')
  const inst = await getFhe()
  try {
    return await retryDecryption(() => decryptFlights.run(publicDecryptionKey(handles), () => inst.publicDecrypt(handles)), { attempts: tries }) as { clearValues: Record<string, Clear>; abiEncodedClearValues: Hex; decryptionProof: Hex }
  } catch (error) {
    if (!transientDecryptionError(error)) throw error
    throw new Error('The Zama network has not finished decrypting yet. Try again in a minute.')
  }
}

/* ───────────────────────── lab key (user decryption) ───────────────────────── */

type LabKey = { publicKey: string; privateKey: string; signature: string; start: number; days: number; contracts: string[] }
const KEY = (a: string) => ACTIVE_WORLD === 'v1' ? `chm:key:${a.toLowerCase()}` : `chm:key:${LAB.toLowerCase()}:${a.toLowerCase()}`
const labKeyStorage = () => getWallet().mode === 'circle' ? sessionStorage : localStorage
/** Contracts whose handles the player decrypts privately. The Zama relayer accepts at most 10 per key,
 *  so only list contracts that really hand out user-decryptable handles (Arena/Market proofs are public). */
const MAX_KEY_CONTRACTS = 10
const CONTRACTS = () => [LAB, RAID, EXPEDITIONS, TRAINING, CZAMA, COLOSSEUM, RELICS, ORACLE, RAFFLE, DEPTHS].filter((x) => !/^0x0+$/.test(x)).map((x) => x.toLowerCase()).slice(0, MAX_KEY_CONTRACTS)

export function storedLabKey(account: string): LabKey | null {
  try {
    const raw = labKeyStorage().getItem(KEY(account))
    if (!raw) return null
    const k = JSON.parse(raw) as LabKey
    const now = Math.floor(Date.now() / 1000)
    if (k.start + k.days * 86400 - 3600 < now) return null
    if (k.contracts.length > MAX_KEY_CONTRACTS) return null
    if (CONTRACTS().some((c) => !k.contracts.includes(c))) return null
    return k
  } catch {
    return null
  }
}

/** One signature unlocks private reads (element, sequenced genes, balances) for 30 days. */
export async function labKey(account: Address): Promise<LabKey> {
  const existing = storedLabKey(account)
  if (existing) return existing
  const inst = await getFhe()
  const kp = inst.generateKeypair()
  const start = Math.floor(Date.now() / 1000) - 60
  const managed = getWallet().mode === 'circle'
  const days = managed ? 7 : 30
  const contracts = CONTRACTS()
  const eip712 = inst.createEIP712(kp.publicKey, contracts, start, days)
  let signature: string
  if (managed) {
    const result = await keeperRequest<{ signature: string }>('lab-key', { address: account, publicKey: kp.publicKey, start, days })
    signature = result.signature
  } else {
    const eth = injected()
    if (!eth) throw new Error('No wallet found.')
    const payload = JSON.stringify(eip712, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    signature = (await eth.request({ method: 'eth_signTypedData_v4', params: [account, payload] })) as string
  }
  const key: LabKey = { publicKey: kp.publicKey, privateKey: kp.privateKey, signature, start, days, contracts }
  if (getWallet().account?.toLowerCase() !== account.toLowerCase()) throw new Error('The active wallet changed.')
  labKeyStorage().setItem(KEY(account), JSON.stringify(key))
  window.dispatchEvent(new Event('chm:labkey'))
  return key
}

const UD = (a: string) => `chm:ud:${a.toLowerCase()}:`

export function cachedPrivate(account: string, handle: string): bigint | boolean | undefined {
  try {
    const s = sessionStorage.getItem(UD(account) + handle.toLowerCase())
    return s == null ? undefined : dec(s)
  } catch {
    return undefined
  }
}

/** Decrypt handles the user has ACL access to. Cached for the browser session. */
export async function privateValues(account: Address, pairs: { handle: string; contract: Address }[]): Promise<Record<string, Clear>> {
  const out: Record<string, Clear> = {}
  const todo: { handle: string; contractAddress: string }[] = []
  for (const p of pairs) {
    const h = p.handle.toLowerCase()
    if (isZero(h)) {
      out[h] = 0n
      continue
    }
    const c = cachedPrivate(account, h)
    if (c !== undefined) out[h] = c
    else todo.push({ handle: h, contractAddress: p.contract })
  }
  if (!todo.length) return out
  const key = await labKey(account)
  const inst = await getFhe()
  const requestKey = privateDecryptionKey({ account, publicKey: key.publicKey, signature: key.signature, start: key.start, days: key.days, contracts: key.contracts }, todo)
  const result = await retryDecryption(() => decryptFlights.run(requestKey, () => inst.userDecrypt(todo, key.privateKey, key.publicKey, key.signature.replace(/^0x/, ''), key.contracts, account, key.start, key.days)), { attempts: 8, cap: 10_000 })
  for (const [h, v] of Object.entries(result as Record<string, Clear>)) {
    const handle = h.toLowerCase()
    out[handle] = v
    try {
      sessionStorage.setItem(UD(account) + handle, enc(v))
    } catch {
      /* storage full — the current read still succeeded */
    }
  }
  return out
}

/* ───────────────────────── encrypted inputs ───────────────────────── */

export async function encrypt64(contract: Address, user: Address, value: bigint) {
  const { handles, proof } = await encryptMany(contract, user, [{ bits: 64, value }])
  return { handle: handles[0], proof }
}

/** Several encrypted values under one input proof (order = argument order). */
export async function encryptMany(contract: Address, user: Address, items: { bits: 8 | 16 | 64; value: number | bigint }[]) {
  const inst = await getFhe()
  // Wallet providers can return lowercase addresses. The relayer requires their checksummed form.
  const input = inst.createEncryptedInput(getAddress(contract), getAddress(user))
  for (const it of items) {
    if (it.bits === 8) input.add8(Number(it.value))
    else if (it.bits === 16) input.add16(Number(it.value))
    else input.add64(BigInt(it.value))
  }
  const { handles, inputProof } = await input.encrypt()
  return { handles: handles.map((h: Uint8Array) => bytesToHex(h) as Hex), proof: bytesToHex(inputProof) as Hex }
}
