import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import CreatureArt from '../CreatureArt'
import { useWallet } from '../chain'
import { BusyNote, Button, Label, Panel, Tag, creatureTitle, useAction } from '../ui'
import { useCreature, useMyCreatures, useRefresh, useTraits } from '../hooks'
import { useSlots, useTDefenders, useXpRoom } from '../season'
import { P1_LIVE, ascend, retireForLineage, ascensionXp, useAscensionStats } from '../p1'
import { ascensionPreview } from './ascension-preview'
import { useLineageEconomy } from '../economy'

function Offering({ id, selected, blocked, onPick }: { id: number; selected: boolean; blocked?: string; onPick: () => void }) {
  const c = useCreature(id)
  const t = useTraits(c.data)
  const gen = c.data?.info.generation
  return (
    <button
      onClick={onPick}
      disabled={!!blocked}
      title={blocked}
      className="flex items-center gap-2 border-[3px] border-[#111] p-1.5 pr-3 text-left shadow-[3px_3px_0_#111] disabled:opacity-40"
      style={{ background: selected ? '#FFDD00' : '#fff' }}
    >
      <CreatureArt traits={t.data} seed={id} size={40} />
      <span className="min-w-0">
        <span className="block truncate font-mono text-[11px] font-bold">{creatureTitle(id, t.data)}</span>
        <span className="block font-mono text-[10px] text-[var(--chm-dim)]">{blocked ?? (gen == null ? 'Reading specimen…' : `Gen ${gen} · +${ascensionXp(gen)} XP`)}</span>
      </span>
    </button>
  )
}

/** Sacrifice a spare creature to pour XP into this one. */
export function AscensionAltar({ id, owner }: { id: number; owner: Address }) {
  const { account } = useWallet()
  const mine = useMyCreatures(account)
  const defenders = useTDefenders()
  const room = useXpRoom(id)
  const stats = useAscensionStats(account)
  const refresh = useRefresh()
  const { busy, run, status } = useAction()
  const [pick, setPick] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)
  const [chargeOnly, setChargeOnly] = useState(false)
  const lineage = useLineageEconomy(account)
  const lineageReady = lineage.data?.version === 2 && lineage.data.altarReady
  const offer = useCreature(pick)
  const offerTraits = useTraits(offer.data)
  const slots = useSlots(pick)

  useEffect(() => {
    setPick(null)
    setArmed(false)
    setChargeOnly(false)
  }, [id])

  const isMine = !!account && owner.toLowerCase() === account.toLowerCase()
  if (!P1_LIVE || !isMine) return null
  const others = (mine.data ?? []).filter((x) => x !== id)
  const guarding = new Set((defenders.data ?? []).filter((d) => d.active).map((d) => d.id))
  const roomLeft = room.data?.room
  const unavailable = (!chargeOnly && room.isError) || offer.isError || slots.isError || defenders.isError || mine.isError
  const { xp, gained, blocker } = ascensionPreview({
    picked: pick != null,
    generation: offer.data?.info.generation,
    room: roomLeft,
    owned: offer.data && mine.data ? others.includes(pick!) && offer.data.owner.toLowerCase() === account?.toLowerCase() : undefined,
    defending: defenders.data ? guarding.has(pick!) : undefined,
    slots: slots.data,
    unavailable,
    chargeOnly,
  })
  const hasRelics = !!slots.data?.some((s) => s > 0)

  async function doAscend() {
    if (!account || !pick || blocker) return
    if (chargeOnly && !lineageReady) return
    const r = await run('Ascension', (st) => chargeOnly ? retireForLineage(account, pick, st) : ascend(account, id, pick, st), 'Offering accepted', {
      spec: { kind: 'ascend', me: id, foe: pick },
      map: result => ({ ...result, lineageCharge: lineageReady, chargeOnly }),
    })
    if (r) {
      setPick(null)
      setArmed(false)
      refresh('mine', 'training', 'xpRoom', 'ascension', 'creature', 'lineageEconomy')
    }
  }

  return (
    <Panel className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#7B3FE4 2px, transparent 2px)', backgroundSize: '14px 14px' }} />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <Tag color="pink">Ascension altar</Tag>
          <span className="ml-auto font-mono text-[11px] text-[var(--chm-dim)]">
            {stats.data ? `${stats.data.total} ascension${stats.data.total === 1 ? '' : 's'} so far${stats.data.mine ? ` · ${stats.data.mine} by you` : ''}` : ''}
          </span>
        </div>
        <p className="mt-3 text-sm text-[#222]">
          The offering is locked in the altar forever. {lineageReady && <>You earn <b>one lineage charge</b> for a later breeding. </>}
          {chargeOnly ? 'This offering grants no XP.' : <>Your hero also gains <b>30 XP + 10 per generation</b> of the offering (max 120), within the daily cap. {roomLeft == null ? <b>{room.isError ? 'XP allowance unavailable.' : 'Reading today’s XP allowance…'}</b> : <><b>{roomLeft} XP</b> of room left today (cap {room.data!.cap}).</>}</>}
        </p>
        {lineageReady && <div role="group" aria-label="Offering reward" className="mt-3 flex flex-wrap gap-2">
          <button className="chm-btn chm-btn-ghost" aria-pressed={!chargeOnly} disabled={!!busy} onClick={() => { setChargeOnly(false); setArmed(false) }}>Charge + hero XP</button>
          <button className="chm-btn chm-btn-ghost" aria-pressed={chargeOnly} disabled={!!busy} onClick={() => { setChargeOnly(true); setArmed(false) }}>Charge only</button>
        </div>}

        {others.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-[var(--chm-dim)]">You need a second creature at home to make an offering.</p>
        ) : (
          <>
            <Label className="mt-4">Choose the offering</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {others.map((o) => (
                <Offering
                  key={o}
                  id={o}
                  selected={o === pick}
                  blocked={guarding.has(o) ? 'Guarding the Colosseum' : undefined}
                  onPick={() => {
                    setPick(o)
                    setArmed(false)
                  }}
                />
              ))}
            </div>
          </>
        )}

        {pick != null && (
          <div className="mt-4 flex items-center gap-3 border-[3px] border-[#111] bg-[var(--chm-gray)] p-3">
            <div className="opacity-70 grayscale">
              <CreatureArt traits={offerTraits.data} seed={pick} size={56} />
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-mono font-bold">
                {creatureTitle(pick, offerTraits.data)} → {lineageReady ? '+1 charge · ' : ''}{gained == null ? 'XP pending' : `+${gained} XP`}
              </div>
              <div className="text-xs text-[var(--chm-dim)]">
                {gained != null && xp != null && gained < xp ? `Worth ${xp} XP, but only ${gained} fits under today's cap. ` : ''}
                {hasRelics ? 'It wears relics: take them off first so they are not lost.' : 'This cannot be undone.'}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!armed ? (
            <Button variant="ghost" disabled={!!blocker || !!busy} title={blocker ?? ''} onClick={() => setArmed(true)}>
              {blocker ?? `Offer #${pick}`}
            </Button>
          ) : (
            <>
              <Button variant="danger" busy={busy === 'Ascension'} disabled={!!blocker} onClick={doAscend}>
                Yes, sacrifice #{pick} forever
              </Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => setArmed(false)}>
                Cancel
              </Button>
            </>
          )}
        </div>
        {unavailable && <Button variant="ghost" className="mt-2" onClick={() => refresh('xpRoom', 'creature', 'slots', 'tdefenders', 'mine')}>Retry offering checks</Button>}
        <BusyNote status={status} className="mt-2" />
      </div>
    </Panel>
  )
}
