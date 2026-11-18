const ITEMS = {
  1: {
    name: 'Ash thread',
    description: 'A material recovered from a living encounter.',
  },
  2: {
    name: 'Archive fragment',
    description: 'A fragment used to craft a trail lantern.',
  },
  3: {
    name: 'Trail lantern',
    description: 'An equipable cosmetic. No combat bonus.',
  },
}

function decodeOutcome(value) {
  const code = Number(value)
  if (!Number.isSafeInteger(code) || code < 0 || code > 1023)
    throw new Error('Invalid encounter code')
  const result = {
    code,
    kind: code & 3,
    tier: (code >> 2) & 3,
    won: !!(code & 16),
    item: (code >> 5) & 7,
    quantity: (code >> 8) & 3,
  }
  const { kind, tier, won, item, quantity } = result
  if (
    kind > 2 ||
    tier > 2 ||
    (!won && (item || quantity)) ||
    (won && (!ITEMS[item] || quantity !== (item === 1 ? tier + 1 : 1))) ||
    (item === 3 && tier !== 2)
  ) {
    throw new Error('Encounter code violates rules v1')
  }
  return result
}
// Ordinary backend crafting. Only the verified encounter code can add loot.
const LANTERN_RECIPES = {
  thread: [{ item: 1, quantity: 3 }],
  fragment: [{ item: 1, quantity: 1 }, { item: 2, quantity: 1 }],
  standard: [{ item: 1, quantity: 5 }, { item: 2, quantity: 2 }],
}
function lanternCrafting(inventory) {
  const firstLantern = !inventory.some(row => row.item === 3 && row.quantity > 0)
  return {
    version: 2,
    firstLantern,
    recipes: (firstLantern ? ['thread', 'fragment'] : ['standard']).map(id => ({ id, cost: LANTERN_RECIPES[id] })),
  }
}
module.exports = { ITEMS, decodeOutcome, LANTERN_RECIPES, lanternCrafting }
