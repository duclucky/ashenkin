/** Public scoring constants shared by Sepolia descriptions and local training. */
export const MOVE_BONUS = 30
export const ROLL_BOUND = 32
/** +1 if a counters b, -1 if b counters a, 0 for the same command. */
export const duelOf = (a: number, b: number) => a === b ? 0 : (a === 1 && b === 0) || (a === 2 && b === 1) || (a === 0 && b === 2) ? 1 : -1
