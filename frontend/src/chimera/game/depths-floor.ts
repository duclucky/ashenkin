export function doorThresholds(floor: number) {
  const trap = 26 + 8 * floor
  const monster = Math.min(255, trap + 90 + 5 * floor)
  const treasure = Math.min(255, trap + 90 + 5 * floor + 38)
  return { trap, monster, treasure }
}

/** A browser trial uses the same thresholds as Depths with a local random byte. */
export function doorFromByte(floor: number, roll: number) {
  const { trap, monster, treasure } = doorThresholds(floor)
  if (roll < trap) return 3
  if (roll < monster) return 1
  if (roll < treasure) return 2
  return 0
}

export function decodeFloorLog(floor: number, door: number, content: unknown, damage: unknown, loot: unknown) {
  if (typeof content !== 'bigint' || content < 0n || content > 3n ||
      typeof damage !== 'bigint' || damage < 0n || typeof loot !== 'bigint' || loot < 0n) {
    throw new Error('The private floor report has not been decrypted yet.')
  }
  return { floor, door, content: Number(content), damage: Number(damage), loot }
}
