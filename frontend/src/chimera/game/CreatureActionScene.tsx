import { CHEST_CLOSED, CHEST_OPEN, CHEST_PAL, COIN, COIN_PAL, LOCK, LOCK_PAL, Px, type Theme } from './art'
import { PxIcon, type PxIconName } from './hud'
import type { CreatureAction, SceneState } from './store'

type Prop = 'lock' | 'chest' | 'coin' | 'door' | 'portal' | 'beam' | 'seal' | PxIconName
type Choreography = { location: string; theme: Theme; color: string; prop: Prop; finish: Prop; motion: string }

export const creatureActions: Record<CreatureAction, Choreography> = {
  sequence: { location: 'Lab scanner', theme: 'lab', color: '#5ac8fa', prop: 'beam', finish: 'eye', motion: 'scan' },
  certify: { location: 'Genome archive', theme: 'lab', color: '#b8f5d8', prop: 'seal', finish: 'check', motion: 'stamp' },
  chimera: { location: 'Rare lineage verification', theme: 'vault', color: '#ffdd00', prop: 'star', finish: 'star', motion: 'crown' },
  list: { location: 'Market stall', theme: 'meadow', color: '#ffbe72', prop: 'seal', finish: 'coin', motion: 'tag' },
  buy: { location: 'Market exchange', theme: 'meadow', color: '#ffdd00', prop: 'coin', finish: 'check', motion: 'trade' },
  cancelListing: { location: 'Market return', theme: 'meadow', color: '#b8f5d8', prop: 'seal', finish: 'flag', motion: 'return' },
  equip: { location: 'Relic Forge', theme: 'vault', color: '#d3a9ff', prop: 'gem', finish: 'bolt', motion: 'bind' },
  unequip: { location: 'Relic Forge', theme: 'vault', color: '#b5cbff', prop: 'gem', finish: 'chest', motion: 'release' },
  appraiseEquipped: { location: 'Relic Forge', theme: 'vault', color: '#d3a9ff', prop: 'gem', finish: 'eye', motion: 'appraise' },
  ascend: { location: 'Ascension altar', theme: 'vault', color: '#ffcf85', prop: 'portal', finish: 'bolt', motion: 'sacrifice' },
  defend: { location: 'Colosseum gate', theme: 'arena', color: '#ffbe72', prop: 'flag', finish: 'lock', motion: 'plant' },
  replan: { location: 'Tactics table', theme: 'arena', color: '#d3a9ff', prop: 'lock', finish: 'lock', motion: 'flip' },
  recall: { location: 'Colosseum gate', theme: 'arena', color: '#b8f5d8', prop: 'flag', finish: 'paw', motion: 'march' },
  unsealPlan: { location: 'Wild tactics', theme: 'arena', color: '#a8e4ff', prop: 'lock', finish: 'eye', motion: 'unseal' },
  descend: { location: 'Depths entrance', theme: 'lair', color: '#d3a9ff', prop: 'portal', finish: 'door', motion: 'sink' },
  openDoor: { location: 'Sealed door', theme: 'lair', color: '#d3a9ff', prop: 'door', finish: 'door', motion: 'door' },
  climb: { location: 'Depths exit', theme: 'lair', color: '#b8f5d8', prop: 'portal', finish: 'flag', motion: 'rise' },
  depthRecord: { location: 'Depths record', theme: 'vault', color: '#ffdd00', prop: 'seal', finish: 'star', motion: 'record' },
  revealPower: { location: 'Dojo', theme: 'dojo', color: '#5ac8fa', prop: 'lock', finish: 'bolt', motion: 'charge' },
  walletCollect: { location: 'Specimen collection', theme: 'lab', color: '#b5cbff', prop: 'seal', finish: 'check', motion: 'collect' },
  bossFinish: { location: 'Boss Lair', theme: 'lair', color: '#ff946f', prop: 'sword', finish: 'skull', motion: 'shatter' },
  bossReward: { location: 'Boss Lair', theme: 'lair', color: '#ffdd00', prop: 'chest', finish: 'coin', motion: 'payout' },
  unlockSpecimen: { location: 'Genome archive', theme: 'lab', color: '#a8e4ff', prop: 'lock', finish: 'eye', motion: 'keyturn' },
  expeditionReport: { location: 'Expedition camp', theme: 'meadow', color: '#b8f5d8', prop: 'lock', finish: 'seal', motion: 'report' },
  depthLantern: { location: 'Depths lantern', theme: 'lair', color: '#ffdd00', prop: 'lock', finish: 'bolt', motion: 'lantern' },
  raidReport: { location: 'Raid ledger', theme: 'lair', color: '#ff946f', prop: 'lock', finish: 'eye', motion: 'damage' },
}

export function isCreatureAction(kind: SceneState['kind']): kind is CreatureAction {
  return Object.prototype.hasOwnProperty.call(creatureActions, kind)
}

export function creatureActionResult(s: SceneState) {
  if (s.kind === 'ascend' && s.result?.lineageCharge) return `Offering retired forever. +1 lineage charge${s.result?.chargeOnly ? '.' : ` · +${s.result?.xp ?? 0} XP granted.`}`
  if (s.kind === 'ascend' && typeof s.result?.xp === 'number') return `Ascension complete: +${s.result.xp} XP granted.`
  if (s.kind === 'buy' && s.result?.ok === false) return 'Payment was short. The specimen stays on the market.'
  if (s.kind === 'depthRecord' && s.result?.survived === false) return 'The proof shows the specimen did not survive. No record was posted.'
  if (s.kind === 'openDoor') return s.result?.summary ?? 'Door opened. The outcome is still sealed in your floor log.'
  return s.completedText ?? 'Action complete.'
}

export function ActionProp({ item, done, door }: { item: Prop; done: boolean; door?: number }) {
  switch (item) {
    case 'lock': return <Px rows={LOCK} pal={LOCK_PAL} />
    case 'chest': return <Px rows={done ? CHEST_OPEN : CHEST_CLOSED} pal={CHEST_PAL} />
    case 'coin': return <Px rows={COIN} pal={COIN_PAL} />
    case 'beam': return <div className="chm-action-beam" />
    case 'portal': return <div className="chm-action-portal" />
    case 'seal': return <div className="chm-action-seal"><PxIcon name="check" size={22} /></div>
    case 'door': return <div className={`chm-action-door ${done ? 'is-open' : ''}`}><span>{door}</span><i /></div>
    default: return <PxIcon name={item} size={36} style={{ width: '100%', height: '100%' }} />
  }
}
