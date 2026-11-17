export const ascensionXp = (generation: number) => Math.min(30 + 10 * generation, 120)

type OfferingState = {
  picked: boolean
  generation?: number
  room?: number
  owned?: boolean
  defending?: boolean
  slots?: readonly number[]
  unavailable?: boolean
  chargeOnly?: boolean
}

/** What the player is authorizing before an irreversible offering. */
export function ascensionPreview(state: OfferingState) {
  const xp = state.generation == null ? undefined : ascensionXp(state.generation)
  const gained = state.chargeOnly ? 0 : xp == null || state.room == null ? undefined : Math.min(xp, state.room)
  const blocker = !state.picked ? 'Pick an offering'
    : state.unavailable ? 'Could not verify the offering'
    : (!state.chargeOnly && state.room == null) || state.generation == null || state.owned == null || state.defending == null || state.slots == null ? 'Reading offering and XP allowance…'
    : !state.owned ? 'Offering is no longer at home'
    : state.defending ? 'Guarding the Colosseum'
    : state.slots?.some((slot) => slot > 0) ? 'Unequip its relics first'
    : !state.chargeOnly && state.room === 0 ? 'No XP room left today' : null
  return { xp, gained, blocker }
}
