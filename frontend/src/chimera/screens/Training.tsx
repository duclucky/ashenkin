import { Location } from '../game/Location'
import { useEffect, useState } from 'react'
import { GuestGate } from '../game/GuestGate'
import { Dumbbell, Lock, Eye, Crown, Sparkles, ExternalLink, Wallet, Swords } from 'lucide-react'
import CreatureArt, { STAGE_NAMES } from '../CreatureArt'
import { Button, CreatureCard, Empty, Label, Link, Panel, creatureTitle, toast, useAction, BusyNote } from '../ui'
import { DEPLOYED, LAB, NFT_API, TRAINING, injected, useWallet, errorText } from '../chain'
import { useBalance, useCreature, useLabKeyReady, useMyCreatures, useRefresh, useTraining, useTrainedBonus, useTraits, MAX_LEVEL, TRAIN_XP, stageOf, trainFee, xpToNext, fmtZama, type TrainingProfile } from '../hooks'
import { completeTraining, revealBonus, train } from '../actions'
import { labKey } from '../fhe'
import { api } from '../../lib/api'
import { useXpRoom } from '../season'
import { RelicSlots } from '../game/RelicSlots'
import { AscensionAltar } from '../game/AscensionAltar'
import { SpecimenLink } from '../game/Transition'
import type { Address, Hex } from 'viem'

const STAGE_COLOR = ['#f2eee4', '#c2d8c9', '#e3cf9f']

/* ───────────────────────── shared bits ───────────────────────── */

export function XpBar({ t }: { t?: TrainingProfile }) {
  const level = t?.level ?? 0
  const need = xpToNext(level)
  const pct = level >= MAX_LEVEL ? 100 : Math.min(100, ((t?.xp ?? 0) / need) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[12px] font-bold">
        <span>LV {level}</span>
        <span className="text-[var(--chm-dim)]">{level >= MAX_LEVEL ? `MAX · ${t?.xp ?? 0} XP banked` : `${t?.xp ?? 0} / ${need} XP`}</span>
      </div>
      <div className="mt-1 h-2 border border-[#b7b8a8] bg-[#e1e5da]">
        <div className="h-full bg-[var(--chm-yellow)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Level pips 1..10 with the two evolution levels marked. */
function LevelTrack({ level }: { level: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: MAX_LEVEL }, (_, i) => {
        const l = i + 1
        const on = l <= level
        const evo = l === 5 || l === 10
        return (
          <div key={l} className="flex flex-1 flex-col items-center gap-1">
            <div className="h-3 w-full border border-[#aaa998]" style={{ background: on ? (l >= 10 ? '#c6a464' : l >= 5 ? '#719783' : '#526b61') : '#e6e4da' }} />
            <span className={`font-mono text-[10px] font-bold ${evo ? 'text-[#111]' : 'text-[var(--chm-dim)]'}`}>{evo ? (l === 5 ? '★5' : '♛10') : l}</span>
          </div>
        )
      })}
    </div>
  )
}

async function addToWallet(id: number) {
  const eth = injected()
  if (!eth) throw new Error('No wallet found in this browser.')
  const added = await eth.request({ method: 'wallet_watchAsset', params: { type: 'ERC721', options: { address: LAB, tokenId: String(id) } } as any })
  if (added === false) throw new Error('The wallet did not add this specimen.')
}

/* ───────────────────────── panel on the creature page ───────────────────────── */

export function TrainingPanel({ id, owner }: { id: number; owner: Address }) {
  const { account } = useWallet()
  const tr = useTraining(id)
  const t = tr.data
  const room = useXpRoom(id)
  const bonus = useTrainedBonus(t, owner, account)
  const keyReady = useLabKeyReady(account)
  const bal = useBalance(account)
  const refresh = useRefresh()
  const { busy, run, status } = useAction()
  const mine = !!account && owner.toLowerCase() === account.toLowerCase()
  const level = t?.level ?? 0
  const need = xpToNext(level)
  const fee = trainFee(level)
  const ready = !!t && !t.pending && level < MAX_LEVEL && t.xp >= need
  const nextEvo = level < 5 ? 5 : level < 10 ? 10 : null

  async function doTrain() {
    const r = await run('Train', (s) => train(account!, id, s), 'Training session settled', { spec: { kind: 'train', me: id, level } })
    if (r) refresh('training', 'bonus', 'bal', 'balHandle', 'economy')
  }

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>Training · evolution</Label>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-2xl">LV {level}</span>
            <span className="border border-[#b7b4a4] px-1.5 font-mono text-[11px] font-bold" style={{ background: STAGE_COLOR[t?.stage ?? 0] }}>
              {STAGE_NAMES[t?.stage ?? 0].toUpperCase()}
            </span>
          </div>
        </div>
        <div className="text-right">
          <Label>Trained power</Label>
          <div className="mt-1 font-mono text-lg font-bold">
            {!t || t.level === 0 ? (
              '+0'
            ) : bonus.data != null ? (
              <span className="text-[#1FA46A]">+{bonus.data}</span>
            ) : mine ? (
              keyReady ? (
                bonus.isFetching ? <span className="chm-flicker">decrypting…</span> : <span className="inline-flex items-center gap-1"><Lock className="h-4 w-4" /> sealed</span>
              ) : (
                <span className="inline-flex items-center gap-1"><Lock className="h-4 w-4" /> sealed</span>
              )
            ) : (
              <span className="inline-flex items-center gap-1" title="Only the keeper can read trained power"><Lock className="h-4 w-4" /> sealed</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <XpBar t={t} />
        {room.data && (
          <div className="flex items-center justify-between font-mono text-[11px] text-[var(--chm-dim)]" title="Each creature can earn a limited amount of XP per UTC day, so nobody can farm levels with bots">
            <span>XP it can still earn today</span>
            <span className={room.data.room === 0 ? 'font-bold text-[var(--chm-red)]' : 'font-bold text-[#111]'}>
              {room.data.room} / {room.data.cap}
            </span>
          </div>
        )}
        <LevelTrack level={level} />
      </div>

      {mine && (
        <div className="mt-5 space-y-3 border-t border-[var(--chm-line)] pt-4">
          {t?.pending ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">A training session is waiting for its fee check.</span>
              <Button variant="gold" busy={busy === 'Finish training'} onClick={() => run('Finish training', (s) => completeTraining(id, t.paid as Hex, s), 'Training finished', { spec: { kind: 'finishTraining', me: id, level } }).then((r) => r && refresh('training', 'bonus', 'economy'))}>
                Finish training
              </Button>
            </div>
          ) : level >= MAX_LEVEL ? (
            <div className="flex items-center gap-2 font-bold"><Crown className="h-5 w-5" /> Fully trained Sovereign.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!ready} busy={busy === 'Train'} onClick={doTrain} title={!ready ? `Needs ${need} XP` : undefined}>
                <Dumbbell className="h-4 w-4" /> Train to LV {level + 1} · {need} XP + {fee} cZAMA
              </Button>
              {nextEvo && <span className="font-mono text-[12px] text-[var(--chm-dim)]">evolves at LV {nextEvo}</span>}
            </div>
          )}
          <BusyNote status={busy ? status : null} />
          {mine && bal.value != null && bal.value < BigInt(fee) * 1_000_000n && !t?.pending && level < MAX_LEVEL && (
            <div className="text-xs text-[var(--chm-red)]">Your cZAMA balance ({fmtZama(bal.value)}) is below the {fee} cZAMA fee — the session would be refunded.</div>
          )}
          {t && t.level > 0 && !keyReady && (
            <div className="flex items-center gap-3 text-sm text-[var(--chm-dim)]">
              Unlock your lab key to read the trained power.
              <Button variant="ghost" busy={busy === 'Unlock lab key'} onClick={() => run('Unlock lab key', (step) => { step('Sign for your lab key…'); return labKey(account!) }, 'Lab key unlocked', { spec: { kind: 'unlockSpecimen', me: id } })}>
                Unlock
              </Button>
            </div>
          )}
          {t && t.level > 0 && keyReady && bonus.error && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--chm-dim)]">
              Bought this creature? Re-seal its trained power to your wallet.
              <Button variant="ghost" busy={busy === 'Reveal'} onClick={() => run('Reveal', (s) => revealBonus(id, s), 'Power unsealed for you', { spec: { kind: 'revealPower', me: id } }).then((r) => r && refresh('bonus'))}>
                <Eye className="h-4 w-4" /> Reveal to me
              </Button>
            </div>
          )}
          <details className="chm-training-notes">
            <summary>How training works</summary>
            <div className="space-y-2 pb-2 text-sm leading-relaxed text-[var(--chm-dim)]">
              <p>Each level adds 2–5 private power, with +4 more at LV 5 and LV 10. Offspring inherit genes. Training bonuses belong to this specimen.</p>
              <p>Earn {TRAIN_XP.expedition.join('/')} XP from expeditions, {TRAIN_XP.raid} from a Boss strike, or {TRAIN_XP.arenaWin}/{TRAIN_XP.arenaLoss} from a Colosseum win/loss. The daily cap is {room.data?.cap ?? 120} XP.</p>
              <p>Fees go 60% to the World Boss pot and 40% to the Treasury.</p>
            </div>
          </details>
        </div>
      )}
      {tr.error && <div className="mt-2 text-sm text-[var(--chm-red)]">{errorText(tr.error)}</div>}
    </Panel>
  )
}

/** NFT card: the metadata that wallets and marketplaces read. */
export function NftPanel({ id, mine, certified }: { id: number; mine: boolean; certified: boolean }) {
  const { busy, run } = useAction()
  return (
    <Panel className="p-5">
      <Label>NFT · ERC-721 “CHIM” #{id}</Label>
      <p className="mt-2 text-sm text-[var(--chm-dim)]">
        Public metadata includes looks, generation, level and evolution. {certified ? 'This specimen’s alleles and element are public in its game profile.' : 'Its hidden alleles and element are sealed until the keeper publishes the genome.'} Training bonuses stay encrypted.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="chm-btn chm-btn-ghost" href={api(`${NFT_API}/${id}`)} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" /> Metadata JSON
        </a>
        <a className="chm-btn chm-btn-ghost" href={api(`${NFT_API}/${id}/image.svg`)} target="_blank" rel="noreferrer">
          <Sparkles className="h-4 w-4" /> NFT image
        </a>
        <a className="chm-btn chm-btn-ghost" href={`https://sepolia.etherscan.io/nft/${LAB}/${id}`} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" /> Etherscan
        </a>
        {mine && (
          <Button variant="ghost" busy={busy === 'Add to wallet'} onClick={() => run('Add to wallet', (step) => { step('Confirm adding the specimen in your wallet…'); return addToWallet(id) }, 'Added to your wallet', { spec: { kind: 'walletCollect', me: id } })}>
            <Wallet className="h-4 w-4" /> Add to wallet
          </Button>
        )}
      </div>
    </Panel>
  )
}

/* ───────────────────────── Training page ───────────────────────── */

function Row({ id, selected, onPick }: { id: number; selected: boolean; onPick: () => void }) {
  const tr = useTraining(id)
  const t = tr.data
  const ready = !!t && !t.pending && t.level < MAX_LEVEL && t.xp >= xpToNext(t.level)
  return (
    <CreatureCard
      id={id}
      compact
      selected={selected}
      onClick={onPick}
      footer={
        <div className="space-y-1">
          <XpBar t={t} />
          {ready && <div className="font-mono text-[11px] font-bold text-[#1FA46A]">READY TO TRAIN</div>}
          {t?.pending && <div className="font-mono text-[11px] font-bold text-[#FF7020]">FEE CHECK PENDING</div>}
        </div>
      }
    />
  )
}

function Focus({ id }: { id: number }) {
  const c = useCreature(id)
  const traits = useTraits(c.data)
  const tr = useTraining(id)
  if (!c.data) return <div className="chm-panel h-[420px] animate-pulse" />
  const stage = tr.data?.stage ?? 0
  return (
    <div className="space-y-4">
      <Panel className="chm-specimen-portrait relative overflow-hidden p-6">
        <div className="relative grid items-center gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((s) => (
            <div key={s} className={`flex flex-col items-center ${s === stage ? '' : 'opacity-40'}`}>
              <CreatureArt traits={traits.data} seed={id} size={s === stage ? 200 : 140} stage={s} animate={s === stage} />
              <span className="mt-2 border border-[#b7b4a4] px-2 font-mono text-[11px] font-bold text-[#24312c]" style={{ background: STAGE_COLOR[s] }}>
                {STAGE_NAMES[s].toUpperCase()} {s === 0 ? 'LV 0–4' : s === 1 ? 'LV 5–9' : 'LV 10'}
              </span>
            </div>
          ))}
        </div>
        <div className="relative mt-4 text-center">
          <SpecimenLink id={id} className="font-display text-2xl hover:underline">
            {creatureTitle(id, traits.data)}
          </SpecimenLink>
        </div>
      </Panel>
      <TrainingPanel id={id} owner={c.data.owner} />
      <Link to={`arena/${id}`} className="inline-flex min-h-11 items-center gap-2 font-bold underline"><Swords className="h-4 w-4" aria-hidden="true" /> Take #{id} to the Colosseum</Link>
      <RelicSlots id={id} owner={c.data.owner} level={tr.data?.level ?? 0} />
      <AscensionAltar id={id} owner={c.data.owner} />
    </div>
  )
}

export default function Training({ preset }: { preset?: number }) {
  const { account } = useWallet()
  const mine = useMyCreatures(account)
  const [pick, setPick] = useState<number | null>(preset ?? null)

  useEffect(() => {
    if (pick == null && mine.data?.length) setPick(mine.data[0])
    if (pick != null && mine.data && !mine.data.includes(pick)) setPick(mine.data[0] ?? null)
  }, [mine.data, pick])

  if (!DEPLOYED || TRAINING === '0x0000000000000000000000000000000000000000') return <Empty title="Training opens once the contracts are live" />

  return (
    <div className="space-y-8">
      <Location place="training"><span>Spend XP to train and evolve.</span></Location>

      {!account ? (
        <GuestGate place="training" />
      ) : mine.isLoading ? (
        <div className="chm-panel h-60 animate-pulse" />
      ) : !mine.data?.length ? (
        <Empty title="No creatures at home">
          Hatch one in the <Link to="lab" className="underline">Lab</Link>. Creatures away on an expedition or listed on the market can't train until they're back.
        </Empty>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>{pick != null && <Focus id={pick} />}</div>
          <div>
            <Label className="mb-3">Your creatures</Label>
            <div className="grid grid-cols-2 gap-4">
              {mine.data.map((id) => (
                <Row key={id} id={id} selected={id === pick} onPick={() => setPick(id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

