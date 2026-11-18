export type LivingResult = {
  day: number
  nft: number
  kind: number
  tier: number
  won: boolean
  item: number
  quantity: number
  at: number
  hash: `0x${string}`
  handle: `0x${string}`
  code: number
  seen?: boolean
}
export type LivingCrafting = {
  version: number
  firstLantern: boolean
  recipes: { id: string; cost: { item: number; quantity: number }[] }[]
}
export type LivingState = {
  enabled: boolean
  contract: `0x${string}`
  day: number
  status: 'settled' | 'pending' | 'waiting'
  nextDayAt: number
  lastTick: number | null
  inventory: { item: number; quantity: number }[]
  equipped: number | null
  crafting?: LivingCrafting
  history: LivingResult[]
}
export const LIVING_STORIES = [
  {
    name: 'Signal beneath the ash',
    zone: 0,
    arrival: 'A buried light flickers beneath the dunes.',
    challenge: 'Your Xeno pushes through the sealed stone.',
    win: 'The stone gives way. Something survived beneath the ash.',
    loss: 'The stone holds. Your Xeno returns safely to the Arkhive.',
  },
  {
    name: 'Keeper of the crossing',
    zone: 2,
    arrival: 'A lone guardian blocks an ancient crossing.',
    challenge: 'Your Xeno faces the guardian without its keeper.',
    win: 'The guardian yields. The path reveals a forgotten cache.',
    loss: 'The guardian stands firm. Your Xeno takes the safe road home.',
  },
  {
    name: 'Footprints in the hollows',
    zone: 1,
    arrival: 'Fresh tracks glow between the old mushrooms.',
    challenge: 'Your Xeno follows the trail through the thicket.',
    win: 'At the end of the trail, an abandoned cache waits.',
    loss: 'The tracks fade. Your Xeno heads home with nothing lost.',
  },
] as const
export const LIVING_ITEMS: Record<number, { name: string; text: string }> = {
  1: { name: 'Ash thread', text: 'Crafting material' },
  2: { name: 'Archive fragment', text: 'A piece of the old world' },
  3: { name: 'Trail lantern', text: 'Wearable · cosmetic only' },
}
export const LIVING_TIERS = ['Gentle', 'Daring', 'Formidable'] as const

// Ambient schedule is presentation only, never a reward/randomness generator.
export function residentActivity(nft: number, nowSeconds: number) {
  return (Math.floor(nowSeconds / 3600) + nft) % 3
}

export function validLivingResult(r: LivingResult) {
  return (
    Number.isSafeInteger(r.day) &&
    r.day > 0 &&
    Number.isSafeInteger(r.nft) &&
    r.nft > 0 &&
    Number.isInteger(r.kind) &&
    r.kind >= 0 &&
    r.kind <= 2 &&
    Number.isInteger(r.tier) &&
    r.tier >= 0 &&
    r.tier <= 2 &&
    typeof r.won === 'boolean' &&
    Number.isSafeInteger(r.code) &&
    r.code ===
      (r.kind |
        (r.tier << 2) |
        (Number(r.won) << 4) |
        (r.item << 5) |
        (r.quantity << 8)) &&
    (r.won
      ? !!LIVING_ITEMS[r.item] &&
        r.quantity === (r.item === 1 ? r.tier + 1 : 1) &&
        (r.item !== 3 || r.tier === 2)
      : r.item === 0 && r.quantity === 0)
  )
}

// Display exactly the server quote. A cached older API keeps its original price.
export function livingCraftRecipes(inventory: LivingState['inventory'], crafting?: LivingCrafting) {
  const recipes = crafting?.recipes ?? [{ id: 'standard', cost: [{ item: 1, quantity: 5 }, { item: 2, quantity: 2 }] }]
  return recipes.map(recipe => {
    const cost = recipe.cost.map(row => {
      const have = inventory.find(i => i.item === row.item)?.quantity ?? 0
      return { ...row, have, missing: Math.max(0, row.quantity - have) }
    })
    return { ...recipe, cost, ready: cost.length > 0 && cost.every(row => row.missing === 0) }
  })
}
