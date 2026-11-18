// The existing settlement sponsor and living-world worker may share a signer.
// Serialize signing and keep a durable worker blocker during uncertain sends.
const lanes = new Map()
const blockers = new Map()
function blockSponsor(address, check) {
  blockers.set(address.toLowerCase(), check)
}
async function sponsorLane(address, work, { living = false } = {}) {
  const key = address.toLowerCase(),
    before = lanes.get(key) || Promise.resolve()
  const next = before
    .catch(() => {})
    .then(async () => {
      if (!living && blockers.get(key)?.())
        throw new Error('Sponsor is reconciling a living-world transaction.')
      return work()
    })
  lanes.set(key, next)
  try {
    return await next
  } finally {
    if (lanes.get(key) === next) lanes.delete(key)
  }
}
module.exports = { blockSponsor, sponsorLane }
