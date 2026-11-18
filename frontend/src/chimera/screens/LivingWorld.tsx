import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useJourney, useLifeRoster } from '../game/use-first-steps'
import {
  ArrowRight,
  Check,
  Flame,
  Play,
  ShieldCheck,
  Sparkles,
  Package,
  X,
  Pause,
  RefreshCw,
} from 'lucide-react'
import { decodeAbiParameters } from 'viem'
import { ACTIVE_WORLD, EXPLORER, publicClient, useWallet } from '../chain'
import { keeperRequest } from '../keeper-api'
import {
  useCreature,
  useNow,
  useTraits,
  fmtDuration,
  useTraining,
} from '../hooks'
import { Button, Empty, Link, Panel } from '../ui'
import CreatureArt from '../CreatureArt'
import { Backdrop } from '../game/art'
import {
  LIVING_STORIES,
  LIVING_ITEMS,
  LIVING_TIERS,
  residentActivity,
  validLivingResult,
  type LivingResult,
  type LivingState,
} from '../game/living-world'
import '../game/living-world.css'
import LivingCraft from '../game/LivingCraft'

const VERIFY_ABI = [
  {
    type: 'function',
    name: 'verify',
    stateMutability: 'view',
    inputs: [
      { name: 'day', type: 'uint256' },
      { name: 'id', type: 'uint256' },
      { name: 'cleartexts', type: 'bytes' },
      { name: 'proof', type: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export default function LivingWorld({ preset }: { preset?: number }) {
  const { account, mode } = useWallet()
  const [pick, setPick] = useState<number | null>(preset ?? null)
  const [replay, setReplay] = useState<LivingResult | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const now = useNow(1000)
  const cache = useQueryClient()
  const journey = useJourney()
  const roster = useLifeRoster()
  const introduced = useRef<string | null>(null)
  const ids = roster.data?.specimens ?? []
  const id = pick != null && ids.includes(pick) ? pick : (ids[0] ?? null)
  const living = useQuery({
    queryKey: ['living-nft', account, id],
    queryFn: () => keeperRequest<LivingState>(`life/${id}?address=${account}`),
    enabled: !!account && id != null && !!roster.data?.enabled,
    refetchInterval: 30_000,
    retry: 1,
  })
  const data = living.data
  const history = data?.history.filter(validLivingResult) ?? []
  const unread = history.filter(row => !row.seen)
  const quantity = (item: number) =>
    data?.inventory.find((i) => i.item === item)?.quantity ?? 0
  useEffect(() => {
    setReplay(null)
    setMessage('')
  }, [account, id])

  useEffect(() => {
    if (!account || !data || !id || journey.data?.lifeIntroduced !== false || introduced.current === account) return
    introduced.current = account
    void keeperRequest('journey/life', { address: account }).then(() => cache.invalidateQueries({queryKey:['keeper-journey',account]})).catch(() => { introduced.current = null })
  }, [account, data, id, journey.data?.lifeIntroduced, cache])
  const markSeen = useCallback(async (result: LivingResult) => {
    if (!account || !id || result.nft !== id) return
    try {
      await keeperRequest(`life/${id}/seen`, { address: account, day: result.day })
      await Promise.all([cache.invalidateQueries({queryKey:['living-nft',account,id]}),cache.invalidateQueries({queryKey:['life-roster',account]})])
    } catch { /* Keep the story new if acknowledgement failed. */ }
  }, [account,id,cache])

  async function change(action: string, body: object = {}) {
    if (!id || busy) return
    setBusy(action)
    setMessage('')
    try {
      await keeperRequest(`life/${id}/${action}`, { address: account, ...body })
      await living.refetch()
      if (action === 'craft') setMessage('Trail lantern crafted. Equip it for the road ahead.')
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Could not update this specimen’s bag.',
      )
    } finally {
      setBusy('')
    }
  }
  async function verify(result: LivingResult) {
    if (!id || !data || busy) return
    setBusy(`proof-${result.day}`)
    setMessage('')
    try {
      const proof = await keeperRequest<{
        value: number
        cleartexts: `0x${string}`
        proof: `0x${string}`
      }>(`life/${id}/proof/${result.day}?address=${account}`)
      const [value] = decodeAbiParameters(
        [{ type: 'uint16' }],
        proof.cleartexts,
      )
      if (Number(value) !== result.code || proof.value !== result.code)
        throw new Error('The story does not match its decryption proof.')
      const valid = await publicClient.readContract({
        address: data.contract,
        abi: VERIFY_ABI,
        functionName: 'verify',
        args: [BigInt(result.day), BigInt(id), proof.cleartexts, proof.proof],
      })
      if (!valid) throw new Error('The Zama proof did not verify.')
      setMessage(
        'Verified against the encounter contract. Your Xeno’s strength stays sealed.',
      )
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Could not verify this encounter.',
      )
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="living-world">
      <header className="living-heading">
        <span className="living-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> LIFE IN ASHENKIN
        </span>
        <h1>Their story keeps going.</h1>
        <p>Your Xenos live here, even while you’re away.</p>
      </header>
      {!account || mode !== 'circle' ? (
        <>
          <ResidentScene id={null} />
          <Empty title="Meet your living Xeno">
            <p>Sign in with a wallet or email, then mint your first NFT.</p>
            <Link to="lab" className="chm-btn chm-btn-primary mt-4">
              Visit the Lab <ArrowRight size={16} />
            </Link>
          </Empty>
        </>
      ) : ACTIVE_WORLD !== 'ashenkin' ? (
        <Empty title="Living encounters belong to Ashenkin">
          <Link to="map">Return to the world</Link>
        </Empty>
      ) : roster.isError ? (
        <Panel>
          <p>Could not read your living collection.</p>
          <Button variant="ghost" onClick={() => roster.refetch()}>
            Try again
          </Button>
        </Panel>
      ) : roster.data && !roster.data.enabled ? (
        <>
          <ResidentScene id={null} />
          <Panel>
            <h2 className="font-bold">
              The living world is preparing to open.
            </h2>
            <p className="mt-2 text-sm">
              Daily encounters will appear here once the world is active.
            </p>
            <Link
              to="map"
              className="inline-flex min-h-11 items-center gap-2 font-bold underline"
            >
              Back to the Arkhive <ArrowRight size={15} />
            </Link>
          </Panel>
        </>
      ) : !ids.length && roster.isPending ? (
        <Panel>
          <p role="status">Finding your Xenos…</p>
        </Panel>
      ) : !ids.length ? (
        <Empty title="No Xeno at home">
          <p>
            Return a specimen from an expedition or hatch an NFT at the Lab.
          </p>
          <Link to="lab" className="chm-btn mt-4">
            Visit the Lab
          </Link>
        </Empty>
      ) : (
        <>
          <label className="living-specimen-select">
            Your resident
            <select
              aria-label="Choose living Xeno"
              value={id ?? ''}
              onChange={(e) => setPick(Number(e.target.value))}
            >
              {ids.map((n) => (
                <option key={n} value={n}>
                  Xeno #{n}
                </option>
              ))}
            </select>
          </label>
          <ResidentScene
            key={`${id}:${replay?.day ?? 'home'}`}
            id={id}
            result={replay}
            equipped={data?.equipped === 3}
            onClose={() => setReplay(null)}
            onComplete={markSeen}
          />
          {living.isError ? (
            <Panel>
              <p>
                Could not load this Xeno’s story. Nothing in its bag has
                changed.
              </p>
              <Button variant="ghost" onClick={() => living.refetch()}>
                Reload story
              </Button>
            </Panel>
          ) : !data ? (
            <Panel>
              <p role="status">Reading its story…</p>
            </Panel>
          ) : (
            <>
              <div className="living-status">
                <ShieldCheck size={17} aria-hidden="true" />
                <div>
                  <b>
                    {data.status === 'settled'
                      ? 'Today’s encounter is complete'
                      : data.status === 'waiting'
                        ? 'The world is waiting for a verified result'
                        : 'A new encounter is waiting to unfold'}
                  </b>
                  <p>
                    {data.status === 'settled'
                      ? `Next day in ${fmtDuration(Math.max(0, data.nextDayAt / 1000 - now))}`
                      : 'No action needed. Your Xeno takes part automatically.'}
                  </p>
                </div>
                <span>
                  NO GAS
                  <br />
                  FOR YOU
                </span>
              </div>
              {unread.length > 0 && <div className="living-recap" role="status">
                <strong>While you were away…</strong>
                <p>{unread.length} new {unread.length === 1 ? 'chapter' : 'chapters'} in #{id}’s life. {unread.some(r=>r.won) ? 'Any rewards are already in its field bag.' : 'Your Xeno came home safely.'}</p>
                <button type="button" onClick={() => setReplay(unread[0])}><Play size={14} aria-hidden="true"/> Watch the latest story</button>
              </div>}
              <section aria-labelledby="living-stories">
                <div className="living-section-heading">
                  <h2 id="living-stories">While life went on</h2>
                  <span>1 trial / NFT / day</span>
                </div>
                {!history.length ? (
                  <p className="living-note">
                    No encounter recorded yet. Your Xeno can explore, train and
                    rest while the next sponsored trial is prepared.
                  </p>
                ) : (
                  <ol className="living-history">
                    {history.map((r) => (
                      <li key={r.day} className={!r.seen ? 'living-story-new' : undefined}>
                        <div
                          className={`living-history-icon ${r.won ? 'living-win' : ''}`}
                        >
                          <ItemArt item={r.won ? r.item : 0} />
                        </div>
                        <div className="living-history-copy">
                          <span className="living-eyebrow">
                            {new Date(r.at).toLocaleDateString('en', {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            · {LIVING_TIERS[r.tier]}
                          </span>
                          <h3>{LIVING_STORIES[r.kind].name}{!r.seen && <span className="living-new-badge">NEW</span>}</h3>
                          <p>
                            {r.won
                              ? `+${r.quantity} ${LIVING_ITEMS[r.item].name} · already in your bag`
                              : 'Returned safely · no reward, nothing lost'}
                          </p>
                          <div className="living-history-actions">
                            <button type="button" onClick={() => setReplay(r)}>
                              <Play size={13} aria-hidden="true" /> Watch story
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => verify(r)}
                            >
                              <ShieldCheck size={13} aria-hidden="true" />
                              {busy === `proof-${r.day}`
                                ? 'Verifying…'
                                : 'Verify'}
                            </button>
                            <a
                              href={`${EXPLORER}/tx/${r.hash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Receipt ↗
                            </a>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <section aria-labelledby="living-bag">
                <div className="living-section-heading">
                  <h2 id="living-bag">#{id}’s field bag</h2>
                  <Package size={17} aria-hidden="true" />
                </div>
                <div className="living-bag">
                  {[1, 2, 3].map((item) => (
                    <div key={item}>
                      <ItemArt item={item} />
                      <strong>{quantity(item)}</strong>
                      <b>{LIVING_ITEMS[item].name}</b>
                      <small>{LIVING_ITEMS[item].text}</small>
                    </div>
                  ))}
                </div>
                <LivingCraft key={id} data={data} busy={!!busy} crafting={busy === 'craft'} onCraft={recipe => change('craft', { recipe })} />
                {!!quantity(3) && (
                  <Button
                    variant="ghost"
                    className="w-full mt-3"
                    busy={busy === 'equip'}
                    disabled={!!busy}
                    onClick={() =>
                      change('equip', { item: data.equipped === 3 ? null : 3 })
                    }
                  >
                    {data.equipped === 3 ? (
                      <Check size={15} />
                    ) : (
                      <Flame size={15} />
                    )}
                    {data.equipped === 3
                      ? 'Lantern equipped · remove'
                      : 'Equip Trail lantern'}
                  </Button>
                )}
                <p className="living-note">
                  Items stay with this NFT when it changes owner. Materials and
                  cosmetics are game items; they do not mint tokens or change
                  onchain combat strength.
                </p>
              </section>
            </>
          )}
          {message && (
            <p className="living-message" role="status">
              {message}
            </p>
          )}
          <details className="living-explainer">
            <summary>What happens while I’m away?</summary>
            <p>
              One daily trial uses your Xeno’s hidden strength, elemental
              advantage and a small Zama luck roll. Winning earns an item
              automatically. Losing never takes anything from your Xeno. The
              game pays the blockchain fee; no wallet signature or claim is
              needed.
            </p>
            <p>
              Only the encounter result is opened. Gene power, element and the
              luck roll remain sealed. The bag is stored by the game server.
            </p>
          </details>
          <Link
            to={`creature/${id}`}
            className="inline-flex min-h-11 items-center gap-2 font-bold underline"
          >
            Meet #{id} <ArrowRight size={15} />
          </Link>
        </>
      )}
    </div>
  )
}

export function ItemArt({ item }: { item: number }) {
  return (
    <svg viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden="true">
      <g fill="#1b201d">
        {item === 3 ? (
          <>
            <path d="M9 1h6v2H9zM7 3h2v4H7zM15 3h2v4h-2zM6 7h12v3H6zM5 10h14v10H5zM7 20h10v3H7z" />
            <path d="M8 11h8v8H8z" fill="#ffdd00" />
            <path d="M10 11h2v6h-2z" fill="#fff5ba" />
          </>
        ) : item === 2 ? (
          <>
            <path d="m7 2 11 3 3 12-11 5-8-8Z" />
            <path d="m8 5 8 2 2 8-8 4-5-6Z" fill="#ffdd00" />
            <path d="M9 8h5v2H9zM8 12h7v2H8z" fill="#a38014" />
          </>
        ) : item === 1 ? (
          <>
            <path d="M7 3h10v3H7zM5 6h14v12H5zM7 18h10v3H7z" />
            <path d="M8 7h8v10H8z" fill="#cfb273" />
            <path d="m7 9 10 3v2L7 11zM7 14l10 2v2L7 16z" fill="#ffdd00" />
          </>
        ) : (
          <>
            <path
              d="M11 3h3v3h3v3h3v6h-3v3h-3v3h-3v-3H8v-3H5V9h3V6h3z"
              fill="#9aa694"
            />
            <path d="M8 10h9v4H8z" fill="#f6f2e7" />
          </>
        )}
      </g>
    </svg>
  )
}

function ResidentScene({
  id,
  result,
  equipped = false,
  onClose,
  onComplete,
}: {
  id: number | null
  result?: LivingResult | null
  equipped?: boolean
  onClose?: () => void
  onComplete?: (result: LivingResult) => Promise<void>
}) {
  const base = useCreature(id)
  const traits = useTraits(base.data)
  const training = useTraining(id)
  const now = useNow(1000)
  const [phase, setPhase] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const acknowledged = useRef(false)
  useEffect(() => {
    if (!result || phase !== 2 || acknowledged.current) return
    acknowledged.current = true
    void onComplete?.(result)
  }, [result,phase,onComplete])
  const activity = residentActivity(id ?? 1, now)
  const story = result && LIVING_STORIES[result.kind]
  useEffect(() => {
    if (!result || paused || phase >= 2 || reduced) return
    const timer = window.setTimeout(
      () => setPhase((p) => p + 1),
      phase === 0 ? 2300 : 3200,
    )
    return () => clearTimeout(timer)
  }, [result, phase, paused, reduced])
  const caption =
    result && story
      ? phase === 0
        ? story.arrival
        : phase === 1
          ? story.challenge
          : result.won
            ? story.win
            : story.loss
      : [
          'Resting beneath the Arkhive lights.',
          'Practising a familiar move at the Dojo.',
          'Wandering the trails beyond the gate.',
        ][activity]
  return (
    <div
      className={`living-scene ${result ? `living-replay phase-${phase} ${result.won ? 'is-win' : 'is-loss'}` : `living-idle activity-${activity}`} ${paused ? 'is-paused' : ''}`}
      aria-label={result ? `Replay of ${story?.name}` : 'Life in the Arkhive'}
    >
      <Backdrop
        theme={result ? 'zone' : activity === 1 ? 'dojo' : 'meadow'}
        zone={story?.zone ?? 0}
        moving={!paused && !reduced && (!result || phase === 0)}
      />
      <div className="living-scene-shade" />
      <div className="living-scene-label">
        <span className="living-eyebrow">
          {result
            ? `${LIVING_TIERS[result.tier]} ENCOUNTER · REPLAY`
            : id
              ? `XENO #${id} · LIVING IN ASHENKIN`
              : 'THE ARKHIVE IS ALIVE'}
        </span>
        <h2>
          {story?.name ??
            (id ? 'At home in the world.' : 'A life of their own.')}
        </h2>
      </div>
      {result && (
        <div
          className={`living-encounter-prop encounter-${result.kind}`}
          aria-hidden="true"
        >
          {result.kind === 1 ? (
            <CreatureArt
              traits={[9, 6, 8, 10, 11, 7, 9]}
              seed={120}
              size={120}
            />
          ) : (
            <svg viewBox="0 0 40 44" shapeRendering="crispEdges">
              <path d="M7 8h26v4h4v28H3V12h4z" fill="#252c28" />
              <path
                d="M9 10h22v4h4v23H5V14h4z"
                fill={result.kind === 0 ? '#8e8164' : '#4c8666'}
              />
              <path d="M15 16h10v3H15zM18 19h4v12h-4z" fill="#ffdd00" />
              <path d="M11 33h18v4H11z" fill="#1d241f" />
            </svg>
          )}
        </div>
      )}
      <div className="living-resident">
        <CreatureArt
          traits={traits.data}
          seed={id ?? 1}
          size={170}
          stage={training.data?.stage}
        />
        {equipped && (
          <span className="living-equipped-lantern">
            <ItemArt item={3} />
          </span>
        )}
      </div>
      {result && phase >= 1 && (
        <div className="living-clash" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {result && phase === 2 && (
        <div className="living-outcome" aria-live="polite">
          <span>{result.won ? 'CHALLENGE CLEARED' : 'HOME SAFE'}</span>
          {result.won ? (
            <>
              <ItemArt item={result.item} />
              <b>
                +{result.quantity} {LIVING_ITEMS[result.item].name}
              </b>
            </>
          ) : (
            <b>No reward. Nothing lost.</b>
          )}
        </div>
      )}
      <div className="living-scene-bottom">
        <p aria-live="polite">{caption}</p>
        <div>
          {result ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setPhase(0)
                  setPaused(false)
                }}
                aria-label="Restart story"
              >
                <RefreshCw size={15} />
              </button>
              {phase < 2 && (
                <button
                  type="button"
                  onClick={() => setPhase((p) => Math.min(2, p + 1))}
                >
                  {reduced ? 'Next' : 'Skip ahead'}
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="Close story">
                <X size={17} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={
              paused ? 'Resume scene animation' : 'Pause scene animation'
            }
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>
      </div>
    </div>
  )
}
