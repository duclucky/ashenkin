import { Location, LocationNotes } from '../game/Location'
import { CHEST_CLOSED, CHEST_PAL, Px } from '../game/art'
import { useState } from 'react'
import { Gem, KeyRound, Layers, Lock, Package, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Button, Empty, Label, Panel, useAction, BusyNote } from '../ui'
import { DEPLOYED, useWallet, type Sent } from '../chain'
import { labKey } from '../fhe'
import { useLabKeyReady, useMyCreatures, useRefresh, useTraining } from '../hooks'
import { GuestGate } from '../game/GuestGate'
import { ProofButton } from '../game/ProofDrawer'
import { SpecimenLink } from '../game/Transition'
import { RelicGem } from '../game/RelicGem'
import { sfx } from '../game/sfx'
import CreatureArt from '../CreatureArt'
import { useCreature, useTraits } from '../hooks'
import {
  CACHE_PRICE,
  FUSE_PRICE,
  PITY,
  RELIC_SOURCES,
  SECOND_SLOT_LEVEL,
  TIERS_R,
  appraiseRelic,
  equipRelic,
  fuseRelics,
  openCache,
  unequipRelic,
  useMyRelics,
  usePity,
  useRelicSecrets,
  useRelicWorld,
  type Relic,
} from '../season'

type Reveal = { relicId: number; tier?: number; power?: number; fused?: boolean }

export default function Relics() {
  const { account } = useWallet()
  const { busy, run, status } = useAction()
  const refresh = useRefresh()
  const world = useRelicWorld()
  const relics = useMyRelics(account)
  const secrets = useRelicSecrets(relics.data, account)
  const pity = usePity(account)
  const keyReady = useLabKeyReady(account)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [pick, setPick] = useState<number[]>([])
  const [equipFor, setEquipFor] = useState<Relic | null>(null)

  if (!DEPLOYED) return <Empty title="The Relic Forge opens once the contracts are live" />

  const after = () => refresh('relics', 'relicSecrets', 'relicWorld', 'pity', 'balHandle', 'slots', 'bonus', 'training')
  const bag = relics.data ?? []
  const sec = secrets.data ?? {}

  async function open() {
    const r = await run('Open a cache', (st) => openCache(account!, st), 'Cache opened')
    if (!r) return
    setReveal({ relicId: r.relicId, tier: r.tier, power: r.power })
    after()
  }
  async function fuse() {
    const r = await run('Fuse relics', (st) => fuseRelics(account!, pick, st), 'Relics fused')
    if (!r) return
    setPick([])
    setReveal({ relicId: r.relicId, tier: r.tier, power: r.power, fused: true })
    after()
  }

  return (
    <div className="space-y-8">
      <Location place="relics" />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div aria-hidden="true" className={`grid h-24 w-24 shrink-0 place-items-center border-[3px] border-[#111] bg-[#231d38] p-3 shadow-[4px_4px_0_#B57BFF] ${busy === 'Open a cache' ? 'chm-shake' : ''}`}>
              <Px rows={CHEST_CLOSED} pal={CHEST_PAL} />
            </div>
            <div className="min-w-44 flex-1">
              <div className="font-display text-2xl">Mystery cache</div>
              {!account ? (
                <div className="mt-4">
                  <GuestGate place="relics" />
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="gold" onClick={open} busy={busy === 'Open a cache'} disabled={!!busy}>
                    <Sparkles className="h-4 w-4" /> Open a cache · {CACHE_PRICE} cZAMA
                  </Button>
                  <BusyNote status={busy === 'Open a cache' ? status : null} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map((t) => (
              <div key={t} className="border-[3px] border-[#111] bg-white p-2 text-center shadow-[3px_3px_0_#111]">
                <div className="flex justify-center">
                  <RelicGem tier={t} size={34} />
                </div>
                <div className="mt-1 text-xs font-black" style={{ color: t === 1 ? '#555' : TIERS_R[t].color, textShadow: t === 4 ? '1px 1px 0 #111' : undefined }}>
                  {TIERS_R[t].name}
                </div>
                <div className="font-mono text-lg font-black">{((TIERS_R[t].odds / 256) * 100).toFixed(1)}%</div>
                <div className="font-mono text-[10px] text-[var(--chm-dim)]">+{TIERS_R[t].power} power</div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-2 border-dashed border-[#111] bg-[var(--chm-gray)] p-3 text-xs">
            <b>Epic guarantee</b> · {PITY} caches without Epic or better
            {account && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-3 flex-1 border-2 border-[#111] bg-white">
                  <div className="h-full bg-[#B57BFF]" style={{ width: `${Math.min(100, ((pity.data ?? 0) / PITY) * 100)}%` }} />
                </div>
                <span className="w-20 text-right font-mono font-black">{keyReady ? (pity.data == null ? '…' : `${pity.data}/${PITY}`) : <Lock className="ml-auto h-3.5 w-3.5" />}</span>
              </div>
            )}
          </div>
          <div className="mt-4"><LocationNotes title="Cache rules">A cache costs {CACHE_PRICE} cZAMA. Of that, 15 goes to the boss pot and 10 to the Treasury. An unpaid cache yields Dust.</LocationNotes></div>
        </Panel>

        <Panel className="p-6">
          <Label className="mb-3">The forge, in public</Label>
          <div className="grid grid-cols-3 gap-2 font-mono">
            {(
              [
                ['caches opened', world.data?.opened],
                ['fusions', world.data?.fusions],
                ['relics made', world.data?.total],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="border-[3px] border-[#111] bg-white p-3 shadow-[3px_3px_0_#111]">
                <div className="text-2xl font-black">{v ?? '…'}</div>
                <div className="text-[10px] uppercase text-[var(--chm-dim)]">{k}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 text-sm text-[var(--chm-dim)]">
            Publicly appraised pulls (Keepers who chose to reveal):
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((t) => (
                <span key={t} className="flex items-center gap-1.5 border-2 border-[#111] bg-white px-2 py-1 font-mono text-xs font-black">
                  <RelicGem tier={t} size={16} /> {world.data?.appraised[t] ?? 0}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-5 border-t-2 border-[#111] pt-4 text-sm">
            <div className="flex items-center gap-2 font-display text-xl">
              <Layers className="h-5 w-5" /> Fusion
            </div>
            <p className="mt-1 text-[var(--chm-dim)]">
              Burn 3 unequipped relics into one. You keep the best tier of the three, and the {FUSE_PRICE} cZAMA fee buys a 35% chance to climb one tier. The roll is encrypted too.
            </p>
            {account && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="blue" disabled={pick.length !== 3 || !!busy} busy={busy === 'Fuse relics'} onClick={fuse}>
                  <Layers className="h-4 w-4" /> Fuse {pick.length}/3 · {FUSE_PRICE} cZAMA
                </Button>
                {pick.length > 0 && (
                  <button className="font-mono text-xs underline" onClick={() => setPick([])}>
                    clear
                  </button>
                )}
                <span className="text-xs text-[var(--chm-dim)]">Pick 3 relics in your bag below.</span>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {account && (
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <Label>Your bag · {bag.length}</Label>
            {!keyReady && bag.length > 0 && (
              <Button variant="ghost" className="!py-1 text-xs" busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', () => labKey(account), 'Lab key unlocked')}>
                <KeyRound className="h-3.5 w-3.5" /> Unlock your lab key to see what you pulled
              </Button>
            )}
          </div>
          {relics.isLoading ? (
            <div className="chm-panel h-40 animate-pulse" />
          ) : !bag.length ? (
            <Empty title="Your bag is empty">Open a cache, or solve the Oracle's Riddle for a free prize cache.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {bag.map((r) => {
                const s = sec[r.id]
                const picked = pick.includes(r.id)
                return (
                  <div key={r.id} className={`chm-panel flex flex-col p-3 ${picked ? '!bg-[#e9dcff] outline outline-[3px] outline-[#B57BFF]' : ''}`}>
                    <div className="flex items-start justify-between font-mono text-[10px] font-black uppercase text-[var(--chm-dim)]">
                      <span>#{r.id}</span>
                      <span>{RELIC_SOURCES[r.source]}</span>
                    </div>
                    <div className="my-2 flex justify-center">
                      <RelicGem tier={s?.tier} size={56} glow={!!s && s.tier >= 3} />
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-black" style={{ color: s ? (s.tier === 1 ? '#555' : TIERS_R[s.tier].color) : '#111', textShadow: s?.tier === 4 ? '1px 1px 0 #111' : undefined }}>
                        {s ? TIERS_R[s.tier].name : 'Sealed'}
                      </div>
                      <div className="font-mono text-xs">{s ? `+${s.power} power` : 'only you can read it'}</div>
                      <div className="mt-1 flex flex-wrap justify-center gap-1 font-mono text-[10px]">
                        {r.appraised && (
                          <span className="flex items-center gap-0.5 border border-[#111] bg-[#3DDC97] px-1">
                            <ShieldCheck className="h-2.5 w-2.5" /> public
                          </span>
                        )}
                        {r.equippedTo > 0 && (
                          <SpecimenLink id={r.equippedTo} className="border border-[#111] bg-[var(--chm-yellow)] px-1">
                            on #{r.equippedTo} · slot {r.slot + 1}
                          </SpecimenLink>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto space-y-1.5 pt-3">
                      {r.equippedTo ? (
                        <Button variant="ghost" className="w-full !py-1 text-[11px]" disabled={!!busy} onClick={() => run('Unequip', (st) => unequipRelic(r.id, st), 'Relic back in the bag', { spec: { kind: 'unequip', me: r.equippedTo, detail: `Relic #${r.id}` } }).then((x?: Sent) => x && after())}>
                          Unequip
                        </Button>
                      ) : (
                        <>
                          <Button className="w-full !py-1 text-[11px]" disabled={!!busy} onClick={() => setEquipFor(r)}>
                            <Gem className="h-3 w-3" /> Equip
                          </Button>
                          <button
                            className="w-full border-2 border-[#111] bg-white py-0.5 font-mono text-[10px] font-black hover:bg-[#f0e6ff]"
                            disabled={!!busy || (!picked && pick.length >= 3)}
                            onClick={() => setPick((p) => (picked ? p.filter((x) => x !== r.id) : [...p, r.id]))}
                          >
                            {picked ? '✓ in the furnace' : 'add to fusion'}
                          </button>
                        </>
                      )}
                      {!r.appraised && (
                        <button
                          className="w-full font-mono text-[10px] text-[var(--chm-dim)] underline hover:text-[#111]"
                          disabled={!!busy}
                          title="Makes this relic's tier and power public forever, for bragging rights or trading."
                          onClick={() => run('Appraise', (st) => appraiseRelic(r, st), 'Appraisal published', r.equippedTo ? { spec: { kind: 'appraiseEquipped', me: r.equippedTo, detail: `Relic #${r.id}` } } : undefined).then((x) => x && after())}
                        >
                          make it public
                        </button>
                      )}
                      <div className="text-center">
                        <ProofButton spec={{ mode: 'relics', id: r.id, title: `Relic #${r.id}` }} label="proof" className="!text-[10px] text-[var(--chm-dim)]" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--chm-dim)]">
            Each creature has 2 relic slots; the 2nd unlocks at training level {SECOND_SLOT_LEVEL}. Relic power joins the creature's hidden combat bonus, used in every Colosseum round and every World Boss strike. Relics stay with you: if you sell a creature, its relics stop counting.
          </p>
        </div>
      )}

      {equipFor && <EquipDialog relic={equipFor} onClose={() => setEquipFor(null)} run={run} busy={busy} onDone={after} />}
      {reveal && <RevealOverlay r={reveal} onClose={() => setReveal(null)} />}
    </div>
  )
}

function EquipDialog({ relic, onClose, run, busy, onDone }: { relic: Relic; onClose: () => void; run: ReturnType<typeof useAction>['run']; busy: string | null; onDone: () => void }) {
  const { account } = useWallet()
  const mine = useMyCreatures(account)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="chm-panel max-h-[80vh] w-full max-w-2xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-2xl">Equip relic #{relic.id}</div>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {!mine.data?.length ? (
          <Empty title="No creatures to equip">Hatch one in your lab first.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mine.data.map((id) => (
              <EquipTarget
                key={id}
                id={id}
                busy={busy}
                onPick={(slot) =>
                  run('Equip', (st) => equipRelic(relic.id, id, slot, st), `Relic bound to #${id}`, { spec: { kind: 'equip', me: id, detail: `Socket ${slot + 1}` } }).then((x) => {
                    if (x) {
                      onDone()
                      onClose()
                    }
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EquipTarget({ id, busy, onPick }: { id: number; busy: string | null; onPick: (slot: number) => void }) {
  const c = useCreature(id)
  const t = useTraits(c.data)
  const tr = useTraining(id)
  const level = tr.data?.level ?? 0
  return (
    <div className="border-[3px] border-[#111] bg-white p-2 shadow-[3px_3px_0_#111]">
      <div className="flex items-center gap-2">
        <CreatureArt traits={t.data} seed={id} size={56} stage={tr.data?.stage} />
        <div className="font-mono text-xs">
          <div className="font-black">#{id}</div>
          <div className="text-[var(--chm-dim)]">LV {level}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <Button className="!px-1 !py-1 text-[11px]" disabled={!!busy} onClick={() => onPick(0)}>
          Slot 1
        </Button>
        <Button variant="ghost" className="!px-1 !py-1 text-[11px]" disabled={!!busy || level < SECOND_SLOT_LEVEL} title={level < SECOND_SLOT_LEVEL ? `Unlocks at LV ${SECOND_SLOT_LEVEL}` : undefined} onClick={() => onPick(1)}>
          {level < SECOND_SLOT_LEVEL ? <Lock className="h-3 w-3" /> : null} Slot 2
        </Button>
      </div>
    </div>
  )
}

function RevealOverlay({ r, onClose }: { r: Reveal; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const known = r.tier != null
  const tier = r.tier ?? null
  const color = tier != null ? TIERS_R[tier].color : '#FFDD00'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm border-[4px] border-[#111] bg-[#1b1430] p-8 text-center text-white shadow-[10px_10px_0_#111]" onClick={(e) => e.stopPropagation()}>
        <div className="font-mono text-[11px] font-black uppercase tracking-widest text-[var(--chm-yellow)]">{r.fused ? 'Fusion result' : 'Cache'} · relic #{r.relicId}</div>
        <div className="relative my-6 flex h-44 items-center justify-center">
          {open && <div className="chm-g-fadein absolute inset-0" style={{ background: `radial-gradient(circle, ${color}66 0, transparent 60%)` }} />}
          {!open ? (
            <button
              className="chm-shake flex flex-col items-center gap-3"
              onClick={() => {
                setOpen(true)
                if (tier != null && tier >= 3) sfx.win()
                else sfx.select()
              }}
            >
              <Package className="h-24 w-24 text-[var(--chm-yellow)]" />
              <span className="font-mono text-xs font-black">tap to open</span>
            </button>
          ) : (
            <div className="chm-g-victory relative">
              <RelicGem tier={tier} size={120} glow />
            </div>
          )}
        </div>
        {open && (
          <div className="chm-g-fadein">
            <div className="font-display text-4xl" style={{ color }}>
              {known ? TIERS_R[tier!].name : 'Sealed'}
            </div>
            <div className="mt-1 font-mono text-sm">{known ? `+${r.power} hidden power` : 'Unlock your lab key in the bag to read it.'}</div>
            <div className="mt-3 text-xs text-white/70">Only your wallet can decrypt this. Onchain it is just a ciphertext.</div>
            <button className="chm-btn chm-btn-gold mt-5" onClick={onClose}>
              To the bag
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
