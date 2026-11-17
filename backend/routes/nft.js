// ERC-721 metadata for the seven public phenotype values and public on-chain specimen records.
const { Router } = require('express')
const { BaseError, ContractFunctionRevertedError, createPublicClient, http, parseAbi } = require('viem')
const { sepolia } = require('viem/chains')
const { spriteSvg, STAGE_NAMES, speciesName, LOCI, TIERS, tierOf, rareCount } = require('../lib/sprite')
const { RPC, zama } = require('../lib/zama')

const legacyAddresses = require('../lib/chimera.json').addresses
const v2Addresses = require('../lib/chimera.v2.json').addresses
const releaseAddresses = require('../lib/ashenkin.json').addresses
const client = createPublicClient({ chain: sepolia, transport: http(RPC, { timeout: 8000, retryCount: 1 }), batch: { multicall: true } })
const labAbi = parseAbi([
  'struct Creature { uint32 parentA; uint32 parentB; uint16 generation; uint64 bornAt; uint64 cooldownUntil; uint8 sequencedMask; bool certified; bool chimera; bool wild; uint8 breeds; }',
  'error ERC721NonexistentToken(uint256 tokenId)',
  'function getCreature(uint256 id) view returns (Creature)',
  'function getPhenotypeHandles(uint256 id) view returns (bytes32[8])',
  'function totalCreatures() view returns (uint256)',
])
const trainingAbi = parseAbi([
  'struct Profile { uint32 xp; uint8 level; bool pending; uint16 trainings; uint64 trainedAt; address keeper; uint32 spentXp; uint64 fee; }',
  'function getProfile(uint256 id) view returns (Profile profile, uint8 stage, bytes32 paidHandle, bytes32 bonusHandle)',
])
const PUBLIC_TRAIT_COUNT = 7
const MAX_CACHED_TRAITS = 512
const BACKGROUND_COLOR = 'FFF8E7'

class PublicTraitsUnavailable extends Error {}

function worldFor(req) {
  const release = req.baseUrl.endsWith('/ashenkin-nft')
  const v2 = req.baseUrl.endsWith('/nft-v2')
  const addresses = release ? releaseAddresses : v2 ? v2Addresses : legacyAddresses
  const query = release ? '' : v2 ? '?world=v2' : '?world=original'
  const name = release ? 'Ashenkin' : 'Chimera'
  const symbol = release ? 'ASHEN' : 'CHIM'
  return { query, name, symbol, lab: addresses.ChimeraLab, training: addresses.ChimeraTraining }
}

async function decryptVisibleTraits(handles) {
  let timer
  try {
    const r = await Promise.race([
      zama().then(instance => instance.publicDecrypt(handles)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('relayer timeout')), 15000) }),
    ])
    const values = new Map(Object.entries(r.clearValues).map(([handle, value]) => [handle.toLowerCase(), value]))
    return handles.map(handle => {
      const value = values.get(handle.toLowerCase())
      return typeof value === 'bigint' ? Number(value) : value
    })
  } finally {
    clearTimeout(timer)
  }
}

function parseId(raw) {
  const text = raw.replace(/\.json$/, '')
  const id = Number(text)
  return /^\d+$/.test(text) && Number.isSafeInteger(id) && id > 0 ? id : null
}

function metadataError(res, error, id) {
  res.set('Cache-Control', 'no-store')
  if (error instanceof PublicTraitsUnavailable) {
    return res.set('Retry-After', '15').status(503).json({ error: 'Public phenotype is temporarily unavailable' })
  }
  const cause = error instanceof BaseError ? error.walk(cause => cause instanceof ContractFunctionRevertedError) : null
  const missing = cause instanceof ContractFunctionRevertedError && cause.data?.errorName === 'ERC721NonexistentToken'
  return res.status(missing ? 404 : 502).json({ error: missing ? 'creature ' + id + ' not found' : 'chain read failed' })
}

function numericTrait(trait_type, value, max_value) {
  return { trait_type, value: Number(value), display_type: 'number', ...(max_value === undefined ? {} : { max_value }) }
}

function metadata({ info, traits, level, xp, stage }, id, origin, mount, world) {
  const name = speciesName(traits)
  const attributes = LOCI.slice(0, PUBLIC_TRAIT_COUNT).map((locus, i) => ({
    trait_type: locus.name,
    value: TIERS[tierOf(traits[i])].name + ' ' + traits[i],
  }))
  attributes.push(
    { trait_type: 'Origin', value: info.wild ? 'Wild-born' : info.parentA ? 'Bred' : 'Lab-hatched' },
    numericTrait('Generation', info.generation),
    { trait_type: 'Hatched', value: Number(info.bornAt), display_type: 'date' },
    { trait_type: 'Evolution', value: STAGE_NAMES[stage] },
    numericTrait('Level', level, 10),
    numericTrait('XP', xp),
    numericTrait('Breeds', info.breeds, 7),
    numericTrait('Rare traits', rareCount(traits), PUBLIC_TRAIT_COUNT),
    { trait_type: 'Element', value: info.certified ? 'Published in game' : 'Sealed' },
    { trait_type: 'Hidden alleles', value: info.certified ? 'Certified' : 'Sealed' },
    { trait_type: 'Trained power', value: level > 0 ? 'Sealed' : 'None' },
  )
  if (info.parentA && info.parentB) {
    attributes.push(numericTrait('Parent A', info.parentA), numericTrait('Parent B', info.parentB))
  }
  if (info.chimera) attributes.push({ trait_type: 'Rare lineage', value: 'Verified' })

  const voice = info.certified
    ? '“My genome is yours to read. Want to see how I fight? Meet me in the Colosseum.” My keeper published my alleles and element. '
    : '“I live on-chain. Want to know what I’m capable of? Fight me, or wait until I reveal my genes.” My keeper chooses whether to publish my genome. '
  const summary = 'Level ' + level + ' · ' + STAGE_NAMES[stage] + ' · generation ' + info.generation + '.'
  return {
    name: name + ' #' + id,
    description: voice + 'Duels reveal the round winners. Training bonuses and round rolls stay encrypted with Zama FHE. ' + summary,
    image: origin + mount + '/' + id + '/image.svg',
    image_data: spriteSvg(traits, id, stage),
    external_url: origin + '/' + world.query + '#/creature/' + id,
    background_color: BACKGROUND_COLOR,
    attributes,
  }
}

function createNftRouter({ reader = client, decrypt = decryptVisibleTraits, origin = process.env.PUBLIC_ORIGIN } = {}) {
  const publicOrigin = origin ? new URL(origin) : null
  if (publicOrigin && (!['https:', 'http:'].includes(publicOrigin.protocol) || publicOrigin.href !== publicOrigin.origin + '/')) {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials.')
  }

  const resolvedTraits = new Map()
  const loadingTraits = new Map()
  async function visibleTraits(cacheKey, handles) {
    if (resolvedTraits.has(cacheKey)) {
      const traits = resolvedTraits.get(cacheKey)
      resolvedTraits.delete(cacheKey)
      resolvedTraits.set(cacheKey, traits)
      return traits
    }
    if (loadingTraits.has(cacheKey)) return loadingTraits.get(cacheKey)
    const visible = handles.slice(0, PUBLIC_TRAIT_COUNT)
    const pending = Promise.resolve().then(() => decrypt(visible)).then(traits => {
      if (!Array.isArray(traits) || traits.length !== PUBLIC_TRAIT_COUNT ||
        !traits.every(value => Number.isInteger(value) && value >= 0 && value <= 15)) {
        throw new PublicTraitsUnavailable()
      }
      if (resolvedTraits.size === MAX_CACHED_TRAITS) resolvedTraits.delete(resolvedTraits.keys().next().value)
      resolvedTraits.set(cacheKey, traits)
      return traits
    }).catch(() => { throw new PublicTraitsUnavailable() })
      .finally(() => { loadingTraits.delete(cacheKey) })
    loadingTraits.set(cacheKey, pending)
    return pending
  }

  async function load(id, { lab, training }) {
    const args = [BigInt(id)]
    const [info, handles, profile] = await Promise.all([
      reader.readContract({ address: lab, abi: labAbi, functionName: 'getCreature', args }),
      reader.readContract({ address: lab, abi: labAbi, functionName: 'getPhenotypeHandles', args }),
      reader.readContract({ address: training, abi: trainingAbi, functionName: 'getProfile', args }),
    ])
    const traits = await visibleTraits(lab + ':' + id, handles)
    return { info, traits, level: Number(profile[0].level), xp: Number(profile[0].xp), stage: Number(profile[1]) }
  }

  function requestOrigin(req) {
    return publicOrigin?.origin ?? req.protocol + '://' + req.get('host')
  }

  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const { lab, name, symbol } = worldFor(req)
      const total = await reader.readContract({ address: lab, abi: labAbi, functionName: 'totalCreatures' })
      res.set('Cache-Control', 'public, max-age=60').json({
        name,
        symbol,
        description: 'Xenos are pixel monsters on Sepolia. Their looks and ownership are public. Keepers choose whether to publish their genomes.',
        contract: lab,
        chainId: sepolia.id,
        totalCreatures: Number(total),
        tokenURI: requestOrigin(req) + req.baseUrl + '/{id}',
      })
    } catch {
      metadataError(res)
    }
  })

  router.get('/:id/image.svg', async (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'bad id' })
    try {
      const c = await load(id, worldFor(req))
      return res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff',
      }).send(spriteSvg(c.traits, id, c.stage))
    } catch (error) {
      return metadataError(res, error, id)
    }
  })

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: 'bad id' })
    try {
      const world = worldFor(req)
      const c = await load(id, world)
      return res.set('Cache-Control', 'public, max-age=60')
        .json(metadata(c, id, requestOrigin(req), req.baseUrl, world))
    } catch (error) {
      return metadataError(res, error, id)
    }
  })

  return router
}

module.exports = createNftRouter()
module.exports.createNftRouter = createNftRouter
