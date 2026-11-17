export function expeditionXpPreview(base: number, room?: number) {
  return { base, today: room == null ? undefined : Math.min(base, room) }
}

type ReceiptEvent = { eventName: string; address: string; args: { creatureId?: bigint; game?: string; amount?: number } }

export function xpGrantedFromReceipt(events: readonly ReceiptEvent[], creatureId: number, training: string, game: string) {
  const grant = events.find(({ eventName, address, args }) =>
    eventName === 'XpGranted' && address.toLowerCase() === training.toLowerCase() &&
    args.creatureId === BigInt(creatureId) && args.game?.toLowerCase() === game.toLowerCase(),
  )
  return grant?.args.amount ?? 0
}

export const expeditionXpFromReceipt = xpGrantedFromReceipt
