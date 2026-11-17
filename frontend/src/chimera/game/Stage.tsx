import { openProof } from '../proof'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Volume2, VolumeX, Minus, X, Loader2, ExternalLink } from 'lucide-react'
import CreatureArt from '../CreatureArt'
import { useCreature, useTraits, useTraining, stageOf, xpToNext, MAX_LEVEL } from '../hooks'
import { speciesName, rareCount, ELEMENTS, TIERS, tierOf } from '../genetics'
import { STAGE_NAMES } from '../sprite'
import { EXPLORER } from '../chain'
import { go } from '../ui'
import { bossTraits, bossName, ZONE_META } from './world-encounters'
import { useScene, closeScene, sceneMinimize, scenePresented, type SceneState, type Phase } from './store'
import { sfx, isMuted, setMuted, onMute } from './sfx'
import { Backdrop, Px, DUMMY, DUMMY_PAL, CHEST_CLOSED, CHEST_OPEN, CHEST_PAL, COIN, COIN_PAL, HEART, HEART_PAL, LOCK, LOCK_PAL, ALERT, ALERT_PAL, type Theme } from './art'
import { ActionProp, creatureActionResult, creatureActions, isCreatureAction } from './CreatureActionScene'
import { fullGameMotion } from './motion'
import { PxIcon } from './hud'
import { BattleDebrief } from './BattleDebrief'
import { ARENA_TIMING, ArenaStage, type ArenaBeat } from './ArenaStage'

/* ───────────────────────── shared stage plumbing ───────────────────────── */

const FLOOR = 70
type Cta = { label: string; to?: string; primary?: boolean; act?: () => void }
type Say = { who: string; text: string; ctas?: Cta[] }
type PopOpt = { color?: string; size?: number; stay?: boolean }
type Fx =
  | { id: number; kind: 'pop'; x: number; y: number; text: string; color: string; size: number; stay: boolean }
  | { id: number; kind: 'burst'; x: number; y: number; bits: { dx: number; dy: number; c: string; s: number }[] }
  | { id: number; kind: 'flash' }
  | { id: number; kind: 'coins'; x: number; y: number; bits: { dx: number; dy: number; s: number }[] }

type Api = {
  u: number
  pop: (text: string, x: number, y: number, o?: PopOpt) => void
  burst: (x: number, y: number, colors?: string[], n?: number) => void
  coins: (x: number, y: number, n?: number) => void
  flash: () => void
  shake: () => void
  say: (s: Say | null) => void
}
const Ctx = createContext<Api>(null as unknown as Api)
const useStage = () => useContext(Ctx)

let fxId = 0

/** setTimeout that is cleared when the scene unmounts. */
function useTimers() {
  const ids = useRef<number[]>([])
  useEffect(() => () => ids.current.forEach((i) => clearTimeout(i)), [])
  return useCallback((ms: number, f: () => void) => {
    ids.current.push(window.setTimeout(f, ms))
  }, [])
}
function useLatest<T>(v: T) {
  const r = useRef(v)
  r.current = v
  return r
}
/** Run `f` the first time `cond` becomes true. */
function useOnce(cond: boolean, f: () => void) {
  const done = useRef(false)
  useEffect(() => {
    if (cond && !done.current) {
      done.current = true
      f()
    }
  })
}
/** Repeat `f` every `ms` while `on`. */
function useLoop(on: boolean, ms: number, f: () => void) {
  const ref = useRef(f)
  ref.current = f
  useEffect(() => {
    if (!on) return
    const i = window.setInterval(() => ref.current(), ms)
    return () => clearInterval(i)
  }, [on, ms])
}

function useMon(id?: number | null) {
  const c = useCreature(id ?? undefined)
  const t = useTraits(c.data)
  const tr = useTraining(id ?? undefined)
  const traits = t.data ?? null
  return { id: id ?? 0, traits, stage: tr.data?.stage ?? 0, level: tr.data?.level ?? 0, trainingReady: !!tr.data && !tr.data.pending && tr.data.level < MAX_LEVEL && tr.data.xp >= xpToNext(tr.data.level), name: traits ? speciesName(traits) : id ? `Specimen ${id}` : 'Specimen', failed: t.isError }
}

const grid = (u: number, x: number, y: number, w: number, h: number): CSSProperties => ({ position: 'absolute', left: x * u, top: y * u, width: w * u, height: h * u })

/** A box whose bottom-centre sits at (x, y) on the 160×90 grid. Children stack inside as animation layers. */
function Actor({ x, y = FLOOR, w, h, z = 2, children, style }: { x: number; y?: number; w: number; h?: number; z?: number; children: ReactNode; style?: CSSProperties }) {
  const { u } = useStage()
  const hh = h ?? w
  return <div style={{ ...grid(u, x - w / 2, y - hh, w, hh), zIndex: z, ...style }}>{children}</div>
}
/** One animation layer (nest them so transforms combine). */
function L({ cls, style, children, k }: { cls?: string; style?: CSSProperties; children: ReactNode; k?: string | number }) {
  return (
    <div key={k} className={cls} style={{ width: '100%', height: '100%', position: 'relative', ...style }}>
      {children}
    </div>
  )
}

function Mon({ mon, size, flip, dark, stage, seed }: { mon: { id: number; traits: number[] | null; stage: number }; size: number; flip?: boolean; dark?: boolean; stage?: number; seed?: number }) {
  const { u } = useStage()
  return (
    <div style={{ width: '100%', height: '100%', transform: flip ? 'scaleX(-1)' : undefined, filter: dark ? 'brightness(0) opacity(.75)' : undefined }}>
      <CreatureArt traits={mon.traits} seed={seed ?? (mon.id || 3)} size={Math.max(8, size * u)} stage={stage ?? mon.stage} />
    </div>
  )
}

function Alert({ x, y }: { x: number; y: number }) {
  return (
    <Actor x={x} y={y} w={4} h={12} z={5}>
      <L cls="chm-g-alert">
        <Px rows={ALERT} pal={ALERT_PAL} />
      </L>
    </Actor>
  )
}

function Tag({ x, y, children, bg = '#fff', color = '#111' }: { x: number; y: number; children: ReactNode; bg?: string; color?: string }) {
  const { u } = useStage()
  return (
    <div className="font-pixel" style={{ position: 'absolute', left: x * u, top: y * u, transform: 'translateX(-50%)', background: bg, color, border: `${Math.max(2, u * 0.6)}px solid #111`, padding: `${u * 0.6}px ${u * 1.2}px`, fontSize: Math.max(6, u * 2.1), whiteSpace: 'nowrap', zIndex: 6, boxShadow: `${u * 0.7}px ${u * 0.7}px 0 #111` }}>
      {children}
    </div>
  )
}

/* ───────────────────────── stage shell ───────────────────────── */

const WHO: Record<Phase, string> = { prep: 'GET READY', wallet: 'YOUR WALLET', chain: 'SEPOLIA', confirmed: 'SEPOLIA CONFIRMED', fhe: 'CHECKING RESULT', done: 'RESULT', fail: 'OOPS' }
const PIPS: [Phase, string][] = [
  ['wallet', 'SIGN'],
  ['chain', 'CHAIN'],
  ['fhe', 'CHECK'],
  ['done', 'RESULT'],
]
const KIND_LABEL: Record<string, string> = { hatch: 'INCUBATOR', breed: 'BREEDING', hatchEgg: 'HATCHERY', strike: 'WORLD BOSS', train: 'DOJO', finishTraining: 'DOJO', expedition: 'EXPEDITION', claim: 'EXPEDITION', battle: 'ARENA', faucet: 'FAUCET' }

export function GameStage() {
  const s = useScene()
  if (!s) return null
  return <StageInner key={s.nonce} s={s} />
}

function StageInner({ s }: { s: SceneState }) {
  const [u, setU] = useState(4)
  const [fx, setFx] = useState<Fx[]>([])
  const [said, setSaid] = useState<Say | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const box = useRef<HTMLDivElement>(null)
  const shakeEl = useRef<HTMLDivElement>(null)
  const dialogEl = useRef<HTMLDivElement>(null)
  const running = s.phase !== 'done' && s.phase !== 'fail'
  const action = isCreatureAction(s.kind) ? creatureActions[s.kind] : undefined
  const incubation = s.kind === 'hatch' || s.kind === 'breed' || s.kind === 'hatchEgg'

  useEffect(() => onMute(() => setMutedState(isMuted())), [])
  useEffect(() => {
    if (s.minimized) return
    const previous = document.activeElement
    dialogEl.current?.focus({ preventScroll: true })
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [s.minimized])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setU(el.clientWidth / 160))
    ro.observe(el)
    setU(el.clientWidth / 160)
    return () => ro.disconnect()
  }, [s.minimized])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (running) sceneMinimize(true)
      else closeScene()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running])

  const add = useCallback((f: Fx, ms?: number) => {
    setFx((l) => [...l, f])
    if (ms) window.setTimeout(() => setFx((l) => l.filter((x) => x.id !== f.id)), ms)
  }, [])
  const api = useMemo<Api>(
    () => ({
      u,
      pop: (text, x, y, o = {}) => add({ id: ++fxId, kind: 'pop', x, y, text, color: o.color ?? '#fff', size: o.size ?? 6, stay: !!o.stay }, o.stay ? undefined : 2000),
      burst: (x, y, colors = ['#FFDD00', '#fff', '#FF7020'], n = 14) =>
        add(
          {
            id: ++fxId,
            kind: 'burst',
            x,
            y,
            bits: Array.from({ length: n }, (_, i) => {
              const a = (i / n) * Math.PI * 2 + Math.random() * 0.4
              const r = 10 + Math.random() * 14
              return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, c: colors[i % colors.length], s: 1.5 + Math.random() * 2 }
            }),
          },
          1000,
        ),
      coins: (x, y, n = 10) =>
        add({ id: ++fxId, kind: 'coins', x, y, bits: Array.from({ length: n }, () => ({ dx: (Math.random() - 0.5) * 50, dy: -14 - Math.random() * 26, s: 4 + Math.random() * 2 })) }, 1000),
      flash: () => add({ id: ++fxId, kind: 'flash' }, 600),
      shake: () => {
        if (!fullGameMotion()) return
        shakeEl.current?.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-1.4%,1%)' }, { transform: 'translate(1.2%,-1%)' }, { transform: 'translate(-.7%,.6%)' }, { transform: 'translate(0,0)' }], { duration: 420, easing: 'steps(4,end)' })
      },
      say: setSaid,
    }),
    [u, add],
  )

  // Fallback ending if a scene never narrates its result.
  useEffect(() => {
    if (s.phase !== 'done' || isCreatureAction(s.kind) || s.kind === 'hatch' || s.kind === 'breed' || s.kind === 'hatchEgg') return
    const t = window.setTimeout(() => setSaid((v) => v ?? { who: 'RESULT', text: `${s.title} complete.`, ctas: [{ label: 'Continue', primary: true }] }), 7000)
    return () => clearTimeout(t)
  }, [s.phase, s.title])

  const dialog: Say = s.phase === 'fail'
    ? { who: 'OOPS', text: s.error || 'Something went wrong.', ctas: [{ label: 'Close', primary: true }] }
    : action && s.phase === 'done'
      ? { who: 'RESULT', text: creatureActionResult(s), ctas: [{ label: 'Continue', primary: true }] }
      : said ?? { who: s.kind === 'battle' && s.phase === 'fhe' ? 'ZAMA FHE' : WHO[s.phase], text: s.phase === 'done' ? 'And the result is…' : s.text }
  const hasEnding = !!dialog.ctas?.length && !running
  const battleReport = s.kind === 'battle' && hasEnding && s.phase === 'done' && s.result?.rounds?.length === 3
  useEffect(() => {
    if (!hasEnding) return
    const timer = window.setTimeout(() => scenePresented(s.nonce), action && s.phase === 'done' ? 1400 : 0)
    return () => window.clearTimeout(timer)
  }, [hasEnding, s.nonce, action, s.phase])
  const elapsed = useElapsed(running, s.startedAt)
  const stepElapsed = useElapsed(running, s.phaseStartedAt)
  const tip = useTip(running && s.phase !== 'wallet' && s.kind !== 'battle')

  return (
    <Ctx.Provider value={api}>
      {s.minimized && <MiniChip s={s} />}
      <div ref={dialogEl} className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-[#111]/80 p-3 backdrop-blur-[2px] sm:p-6" role="dialog" aria-modal="true" aria-label={s.title} tabIndex={-1} onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
        const first = controls[0]
        const last = controls[controls.length - 1]
        const active = document.activeElement
        if (event.shiftKey ? active === first || active === event.currentTarget : active === last) {
          event.preventDefault()
          if (event.shiftKey) last?.focus()
          else first?.focus()
        }
      }} style={{ display: s.minimized ? 'none' : undefined }}>
        <div className={`w-full ${s.kind === 'battle' ? 'chm-arena-modal max-w-[760px]' : 'my-auto max-w-[920px]'}`}>
          {/* header */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="chm-stage-location">{action?.location ?? (s.kind === 'battle' ? (s.mode === 1 ? 'DUEL' : 'WILD HUNT') : KIND_LABEL[s.kind])}</span>
            <span className="font-display mr-auto text-lg text-white">{s.title}</span>
            <div className="flex flex-wrap gap-1.5">
              {s.kind !== 'battle' && !s.replay && !(s.phase === 'done' && hasEnding) && PIPS.map(([p, label]) => {
                const now = s.phase === p || (s.phase === 'confirmed' && p === 'done')
                const was = s.seen.includes(p) && !now
                return (
                  <span key={p} className={`chm-pip font-mono ${now ? 'chm-pip-on' + (running ? ' chm-pip-now' : '') : was ? 'chm-pip-done' : ''}`}>
                    {label}
                    {p === 'wallet' && s.signs > 0 ? ` ×${s.signs}` : ''}
                  </span>
                )
              })}
              {s.phase === 'fail' && <span className="chm-pip font-mono !bg-[#8f3934] !text-white">FAILED</span>}
            </div>
            <button className="chm-stage-control" title={muted ? 'Unmute sound' : 'Mute sound'} onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {running ? (
              <button className="chm-stage-control" title="Minimize progress" onClick={() => sceneMinimize(true)}>
                <Minus className="h-4 w-4" />
              </button>
            ) : (
              <button className="chm-stage-control" title="Close" onClick={() => closeScene()}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className={battleReport ? 'chm-battle-summary-layout' : undefined}>
          <div className="min-w-0">
          {/* the stage */}
          <div ref={box} className="chm-stage" data-motion="full" data-scene={s.kind}>
            <div ref={shakeEl} className="absolute inset-0">
              <SceneBody s={s} />
              {s.phase === 'fhe' && s.kind !== 'battle' && !incubation && <CipherRain />}
              {s.kind !== 'battle' && !incubation && <Hud s={s} />}
              <FxLayer fx={fx} />
            </div>
          </div>
          {s.kind === 'battle' && running ? <p className="chm-arena-status" role="status">{s.text}</p>
            : !battleReport && (s.kind !== 'battle' || s.phase === 'fail' || hasEnding) && <Dialog say={dialog} running={running} />}
          </div>
          {battleReport && <BattleDebrief rounds={s.result?.rounds} mine={s.result?.mine} theirs={s.result?.theirs} xp={s.result?.xp} replay={s.replay} actions={<SceneActions ctas={dialog.ctas} />} />}
          </div>

          {/* footer */}
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-white/70">
            {running && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {stepElapsed}s this step · {elapsed}s total
              </span>
            )}
            {s.hash && (
              <a href={`${EXPLORER}/tx/${s.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-dotted hover:text-white">
                tx {s.hash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <span className="ml-auto hidden sm:inline">{running ? 'Esc to minimize — the action keeps running' : 'Esc to close'}</span>
          </div>
          {tip && (
            <div key={tip} className="chm-g-fadein mt-2 flex items-start gap-2 border-[3px] border-[#111] bg-[var(--chm-gray)] px-3 py-2 text-[13px] leading-snug text-[#111] shadow-[3px_3px_0_var(--chm-yellow)]">
              <span className="font-pixel mt-0.5 shrink-0 bg-[var(--chm-black)] px-1.5 py-0.5 text-[8px] text-[var(--chm-yellow)]">TIP</span>
              <span>{tip}</span>
            </div>
          )}
        </div>
      </div>
    </Ctx.Provider>
  )
}

const TIPS = [
  'Ember beats Spore, Spore beats Tide, Tide beats Ember. Pick a counter before you fight.',
  'Train at the Dojo after expeditions and strikes. LV 5 evolves, LV 10 is Sovereign.',
  'Check in at the Quest Board every day: your streak raises every reward by up to +100%.',
  'Rare traits can surface when you breed two specimens.',
]

/** Rotating loading-screen tips while the chain and the Zama network do their work. */
function useTip(on: boolean) {
  const [i, setI] = useState(() => Math.floor(Math.random() * TIPS.length))
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => setI((x) => (x + 1) % TIPS.length), 7000)
    return () => clearInterval(t)
  }, [on])
  return on ? TIPS[i] : null
}

function useElapsed(on: boolean, from: number) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!on) return
    const i = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [on])
  return Math.max(0, Math.round((Date.now() - from) / 1000))
}

function MiniChip({ s }: { s: SceneState }) {
  const running = s.phase !== 'done' && s.phase !== 'fail'
  return (
    <button onClick={() => sceneMinimize(false)} className="chm-mini-scene fixed bottom-4 left-4 z-[60] flex items-center gap-2 border-[3px] border-[#111] bg-[var(--chm-yellow)] px-3 py-2 shadow-[4px_4px_0_#111]">
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-3 w-3 border-2 border-[#111]" style={{ background: s.phase === 'fail' ? '#E5341D' : '#3DDC97' }} />}
      <span className="font-pixel text-[9px]">{s.title.toUpperCase()}</span>
      <span className="font-mono text-[11px]">{running ? WHO[s.phase] : s.phase === 'fail' ? 'failed' : 'done — tap to see'}</span>
    </button>
  )
}

function Hud({ s }: { s: SceneState }) {
  const { u } = useStage()
  if (s.phase === 'wallet')
    return (
      <div className="font-pixel chm-g-alert" style={{ position: 'absolute', left: '50%', top: u * 3, transform: 'translateX(-50%)', zIndex: 8, background: '#FFDD00', border: `${u * 0.7}px solid #111`, boxShadow: `${u}px ${u}px 0 #111`, padding: `${u}px ${u * 2}px`, fontSize: Math.max(7, u * 2.4), whiteSpace: 'nowrap' }}>
        ▶ CHECK YOUR WALLET{s.signs > 1 ? ` · SIGNATURE ${s.signs}` : ''}
      </div>
    )
  if (s.phase === 'confirmed') return <div className="chm-stage-confirmed" role="status">SEPOLIA CONFIRMED</div>
  if (s.phase === 'chain' || s.phase === 'fhe')
    return (
      <div className="font-pixel" style={{ position: 'absolute', left: u * 3, top: u * 3, zIndex: 8, display: 'flex', alignItems: 'center', gap: u, background: s.phase === 'fhe' ? '#3DDC97' : '#fff', border: `${u * 0.6}px solid #111`, padding: `${u * 0.7}px ${u * 1.4}px`, fontSize: Math.max(6, u * 1.9) }}>
        {s.phase === 'fhe' ? (
          <>
            <span style={{ width: u * 3, height: u * 4, display: 'inline-block' }}>
              <Px rows={LOCK} pal={LOCK_PAL} />
            </span>
            {s.kind === 'battle' ? 'ENCRYPTED COMPUTE' : 'CHECKING RESULT'}
          </>
        ) : (
          <>
            <span className="chm-pxblink" style={{ width: u * 1.6, height: u * 1.6, background: '#FF7020', display: 'inline-block' }} />
            WAITING FOR BLOCK
          </>
        )}
      </div>
    )
  return null
}

function FxLayer({ fx }: { fx: Fx[] }) {
  const { u } = useStage()
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 9 }}>
      {fx.map((f) => {
        if (f.kind === 'flash') return <div key={f.id} className="chm-g-flash absolute inset-0" />
        if (f.kind === 'pop')
          return (
            <div key={f.id} className={`font-pixel chm-outline ${f.stay ? 'chm-g-stay' : 'chm-g-pop'}`} style={{ position: 'absolute', left: f.x * u, top: f.y * u, color: f.color, fontSize: Math.max(8, f.size * u), whiteSpace: 'nowrap', lineHeight: 1 }}>
              {f.text}
            </div>
          )
        if (f.kind === 'burst')
          return (
            <div key={f.id} style={{ position: 'absolute', left: f.x * u, top: f.y * u }}>
              {f.bits.map((b, i) => (
                <span key={i} className="chm-g-burst" style={{ position: 'absolute', width: b.s * u, height: b.s * u, background: b.c, border: `${Math.max(1, u * 0.3)}px solid #111`, ['--dx' as string]: `${b.dx * u}px`, ['--dy' as string]: `${b.dy * u}px` } as CSSProperties} />
              ))}
            </div>
          )
        return (
          <div key={f.id} style={{ position: 'absolute', left: f.x * u, top: f.y * u }}>
            {f.bits.map((b, i) => (
              <span key={i} className="chm-g-burst" style={{ position: 'absolute', width: b.s * u, height: b.s * u, ['--dx' as string]: `${b.dx * u}px`, ['--dy' as string]: `${b.dy * u}px` } as CSSProperties}>
                <Px rows={COIN} pal={COIN_PAL} />
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const HEX = '0123456789abcdef'
function CipherRain() {
  const cols = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        x: (i / 16) * 100 + Math.random() * 3,
        d: 1.6 + Math.random() * 1.8,
        dl: -Math.random() * 3,
        s: Array.from({ length: 22 }, () => HEX[Math.floor(Math.random() * 16)]).join(''),
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 7, mixBlendMode: 'screen' }}>
      {cols.map((c, i) => (
        <div key={i} className="chm-g-rain absolute top-0 h-full font-mono font-bold" style={{ left: `${c.x}%`, color: '#3DDC97', opacity: 0.45, fontSize: 11, lineHeight: 1.05, writingMode: 'vertical-rl', textOrientation: 'upright', ['--d' as string]: `${c.d}s`, ['--dl' as string]: `${c.dl}s` } as CSSProperties}>
          {c.s}
        </div>
      ))}
    </div>
  )
}

function Dialog({ say, running }: { say: Say; running: boolean }) {
  return (
    <div className="chm-stage-dialog relative mt-3 p-3 sm:p-4">
      <div className="chm-stage-speaker" data-error={say.who === 'OOPS'}>
        {say.who}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <div className="min-w-0 break-words text-sm leading-relaxed sm:text-base" role={say.who === 'OOPS' ? 'alert' : 'status'}>
          {say.text}
          {running && <span className="chm-caret" aria-hidden="true" />}
        </div>
        <SceneActions ctas={say.ctas} />
      </div>
    </div>
  )
}

function SceneActions({ ctas }: { ctas?: Cta[] }) {
  if (!ctas?.length) return null
  return (
    <div className="chm-g-fadein flex flex-wrap justify-end gap-2">
      {ctas.map((c) => (
        <button
          key={c.label}
          className={`chm-btn ${c.primary ? 'chm-btn-primary' : 'chm-btn-ghost'} !px-3 !py-2 text-xs`}
          onClick={() => {
            sfx.select()
            closeScene()
            if (c.to) go(c.to)
            c.act?.()
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

function SceneBody({ s }: { s: SceneState }) {
  if (isCreatureAction(s.kind)) return <CreatureScene s={s} action={creatureActions[s.kind]} />
  switch (s.kind) {
    case 'hatch':
    case 'breed':
    case 'hatchEgg':
      return <HatchScene s={s} />
    case 'strike':
      return <StrikeScene s={s} />
    case 'train':
    case 'finishTraining':
      return <TrainScene s={s} />
    case 'battle':
      return <BattleScene s={s} />
    case 'expedition':
      return <ExpeditionScene s={s} />
    case 'claim':
      return <ClaimScene s={s} />
    case 'faucet':
      return <FaucetScene s={s} />
  }
}

function CreatureScene({ s, action }: { s: SceneState; action: (typeof creatureActions)[keyof typeof creatureActions] }) {
  const { u } = useStage()
  const me = useMon(s.me)
  const foe = useMon(s.foe)
  const done = s.phase === 'done'
  const landed = done && s.result?.ok !== false && s.result?.survived !== false
  const floor = landed && s.kind === 'openDoor' ? s.result?.log : null
  const outcome = !floor ? undefined : floor.content === 3 ? 'trap' : floor.loot === 0n ? 'fall'
    : floor.content === 0 ? 'stairs' : floor.content === 1 ? (floor.damage > 4 ? 'escape' : 'clash')
    : floor.content === 2 ? 'treasure' : undefined
  const doorResult = outcome === 'stairs' ? 'flag' : outcome === 'clash' || outcome === 'escape' ? 'sword'
    : outcome === 'treasure' ? 'chest' : outcome === 'trap' || outcome === 'fall' ? 'skull' : null
  const rejected = s.phase === 'fail' || (done && !landed)
  const prop = rejected ? 'cross' : doorResult ?? (landed ? action.finish : action.prop)
  const celebrate = landed && (s.kind !== 'openDoor' || outcome === 'treasure' || outcome === 'clash' || outcome === 'stairs')
  const boss = s.level == null ? null : { id: s.level * 7919, traits: bossTraits(s.level, s.element ?? 0), stage: 0 }

  return (
    <div className={`chm-creature-action chm-action-${action.motion} absolute inset-0`} data-action={s.kind} data-state={s.phase} data-landed={landed} data-rejected={rejected} data-outcome={outcome} style={{ '--action-color': action.color } as CSSProperties} aria-hidden="true">
      <Bg theme={action.theme} tint={action.color} />
      <div className="chm-action-pad" />
      {s.me != null && <Actor x={s.foe != null ? 57 : 76} y={75} w={45}>
        <div key={done ? 'finish' : 'prepare'} className="chm-action-mon"><Mon mon={me} size={45} /></div>
      </Actor>}
      {s.foe != null && <Actor x={111} y={75} w={35}>
        <div key={done ? 'finish' : 'prepare'} className="chm-action-partner"><Mon mon={foe} size={35} flip /></div>
      </Actor>}
      {boss && s.me == null && <Actor x={74} y={77} w={52}>
        <div key={done ? 'finish' : 'prepare'} className="chm-action-mon"><Mon mon={boss} size={52} /></div>
      </Actor>}
      <div key={`${prop}:${landed}`} className="chm-action-prop">{rejected ? <PxIcon name="cross" size={36} style={{ width: '100%', height: '100%' }} /> : <ActionProp item={prop} done={landed} door={s.door} />}</div>
      {celebrate && <div className="chm-action-sparks">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ '--i': i, top: `${30 + i % 3 * 20}%` } as CSSProperties} />)}</div>}
      {s.detail && <div className="font-mono absolute bottom-[5%] left-[5%] border-2 border-[#111] bg-[#fff7de] px-2 py-1 font-bold text-[#111]" style={{ fontSize: Math.max(11, u * 2.3) }}>{s.detail}</div>}
    </div>
  )
}

function Bg({ theme, zone, tint, moving }: { theme: Theme; zone?: number; tint?: string; moving?: boolean }) {
  return (
    <div className="absolute inset-0" style={{ zIndex: 0 }}>
      <Backdrop theme={theme} zone={zone} tint={tint} moving={moving} />
    </div>
  )
}

const rarityColor = (traits: number[]) => {
  const best = Math.max(...traits.slice(0, 7).map((v) => tierOf(v)))
  return rareCount(traits) >= 5 ? '#FFDD00' : TIERS[best].color
}

/* ───────────────────────── hatch / breed ───────────────────────── */

const SHELL_SHARDS = [[-62,-30],[-38,-61],[-28,-32],[-12,-66],[16,-62],[30,-47],[44,-69],[64,-26]]

function HatchScene({ s }: { s: SceneState }) {
  const fx = useStage()
  const { u } = fx
  const at = useTimers()
  const breed = s.kind === 'breed'
  const awaitingEgg = s.kind === 'hatchEgg'
  const ok = s.result?.ok !== false
  const childId = s.phase === 'done' && ok ? (s.result?.id as number | undefined) : undefined
  const child = useMon(childId)
  function hatchActions(profileLabel: string): Cta[] {
    const profile = { label: profileLabel, to: `creature/${childId}` }
    return s.firstHatch
      ? [{ label: 'Enter your first hunt', to: `arena/${childId}`, primary: true }, profile]
      : [{ ...profile, primary: true }, { label: 'Stay here' }]
  }
  const pa = useMon(breed || awaitingEgg ? s.me : undefined)
  const pb = useMon(breed || awaitingEgg ? s.foe : undefined)
  const [beat, setBeat] = useState(0) // 0 sealed · 1 cracking · 2 open
  const [late, setLate] = useState(false)

  useOnce(s.phase === 'done' && ok && !!childId, () => {
    sfx.crack()
    setBeat(1)
    if (!child.traits) fx.say({ who: 'INCUBATOR', text: `Specimen #${childId} has hatched on Sepolia. Reading its visible genes…` })
    at(325, () => sfx.crack())
    at(740, () => {
      sfx.hatch()
      fx.shake()
      setBeat(2)
    })
    at(10_000, () => setLate(true))
  })
  useOnce(beat === 2 && !!child.traits, () => {
    const t = child.traits!
    at(500, () => {
      const rc = rareCount(t)
      fx.pop(child.name.toUpperCase(), 80, 12, { stay: true, size: 6.5, color: rarityColor(t) })
      if (rc >= 5) {
        fx.pop('RARE LINEAGE!', 80, 21, { stay: true, size: 4.5, color: '#FF8FC7' })
        sfx.win()
      } else {
        sfx.levelUp()
        fx.pop(rc ? `${rc} RARE GENE${rc > 1 ? 'S' : ''}` : 'COMMON LINE', 80, 21, { stay: true, size: 3.6, color: rc ? '#8B5CF6' : '#fff' })
      }
      fx.say({
        who: breed ? 'BREEDING' : 'INCUBATOR',
        text: `${child.name} #${childId} has hatched! ${rc >= 5 ? `${rc} rare traits qualify it for rare lineage verification. ` : rc ? `${rc} rare trait${rc > 1 ? 's' : ''}. ` : ''}You choose which hidden genes to reveal.`,
        ctas: hatchActions(`Meet ${child.name}`),
      })
    })
  })
  useOnce(s.phase === 'done' && ok && !childId, () =>
    fx.say({ who: 'INCUBATOR', text: 'The transaction finished. Open your Lab to check the new specimen.', ctas: [{ label: 'Open Lab', to: 'lab', primary: true }] }),
  )
  useOnce((late || (s.firstHatch === true && beat === 2)) && !child.traits, () =>
    fx.say({ who: 'INCUBATOR', text: `Specimen #${childId} hatched onchain. Zama is still unsealing its visible genes.`, ctas: hatchActions('Open its page') }),
  )
  useOnce(s.phase === 'done' && !ok, () => {
    sfx.lose()
    fx.pop('NOT ENOUGH cZAMA', 80, 14, { stay: true, color: '#E5341D', size: 4.5 })
    fx.say({ who: 'BREEDING', text: 'The hidden fee check failed, so the egg was returned. Nothing was charged. Top up cZAMA from the faucet and try again.', ctas: [{ label: 'OK', primary: true }] })
  })

  const incubating = s.phase === 'prep' || s.phase === 'wallet' || s.phase === 'chain' || s.phase === 'confirmed' || s.phase === 'fhe'
  const powered = incubating || beat === 1
  const status = s.phase === 'wallet' ? 'CONFIRM IN WALLET' : s.phase === 'chain' ? 'AWAITING SEPOLIA' : s.phase === 'fhe' ? 'READING GENES' : beat === 1 ? 'SHELL CRACKING' : beat === 2 && !child.traits ? 'READING VISIBLE GENES' : s.phase === 'confirmed' || s.phase === 'prep' ? 'INCUBATOR ON' : null
  const tubeX = 80
  return (
    <>
      <Bg theme="lab" />
      <div className="chm-hatch-focus" data-beat={beat} aria-hidden="true" />
      {status && <Tag x={80} y={5} bg="#15243d" color="#a8ffe4">{status}</Tag>}
      {/* pedestal */}
      <div style={{ ...grid(u, tubeX - 22, 63, 44, 8), background: '#3d4677', border: `${u * 0.7}px solid #111`, zIndex: 1 }}>
        <div style={{ position: 'absolute', left: '10%', right: '10%', top: '30%', height: u * 1.5, background: powered ? '#72f5cd' : beat === 2 ? '#ffe093' : '#8492ab' }} className={powered ? 'chm-incubator-light' : undefined} />
      </div>
      {/* glass tube */}
      <div className={beat === 2 ? 'chm-g-tubeup' : undefined} style={{ ...grid(u, tubeX - 18, 15, 36, 48), zIndex: 4 }}>
        <div style={{ position: 'absolute', inset: 0, border: `${u * 0.8}px solid #111`, borderBottom: 'none', background: 'rgba(168,228,255,.22)' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: s.phase === 'prep' || s.phase === 'wallet' ? '35%' : '82%', transition: 'height 1.6s steps(8,end)', background: s.phase === 'fhe' ? 'rgba(61,220,151,.38)' : 'rgba(90,200,250,.35)' }} />
          <div style={{ position: 'absolute', left: '14%', top: '6%', width: u * 1.2, height: '60%', background: 'rgba(255,255,255,.55)' }} />
          {powered && <div className="chm-incubator-scan" aria-hidden="true" />}
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="chm-g-bubble" style={{ position: 'absolute', bottom: '4%', left: `${18 + i * 10}%`, width: u * 1.4, height: u * 1.4, background: '#fff', opacity: 0.8, ['--d' as string]: `${1.4 + (i % 3) * 0.6}s`, ['--dl' as string]: `${-i * 0.37}s` } as CSSProperties} />
          ))}
        </div>
        <div style={{ position: 'absolute', left: -u * 2, right: -u * 2, top: -u * 4, height: u * 4.5, background: '#56609a', border: `${u * 0.7}px solid #111` }} />
      </div>
      {/* egg → creature */}
      <Actor x={tubeX} y={64} w={beat === 2 ? 36 : 28} z={3}>
        {beat < 2 ? (
          <L cls={beat === 1 ? 'chm-hatch-cracking' : undefined}>
            <CreatureArt traits={null} seed={s.nonce * 7} size={28 * u} hatching={beat === 1} />
            {beat === 1 && <svg className="chm-shell-crack" viewBox="0 0 28 28" aria-hidden="true" shapeRendering="crispEdges"><path d="M15 7v4h-3v4h4v4h-2v3m2-7h4v-3m-8 3H9v3" stroke="#ffe19a" strokeWidth="1.6" fill="none" /></svg>}
          </L>
        ) : child.traits ? (
          <L cls="chm-hatch-arrival">
            <Mon mon={child} size={36} />
          </L>
        ) : <svg viewBox="0 0 36 36" aria-hidden="true" shapeRendering="crispEdges"><path d="M7 26h4v3h6v3H9v-2H7zM28 23h3v6h-2v3h-9v-3h5v-3h3z" fill="#f4de9f" stroke="#27273d" /></svg>}
      </Actor>
      {beat === 2 && <div className="chm-hatch-shards" aria-hidden="true"><i />
        {SHELL_SHARDS.map(([x,y], index) => <b key={x} style={{ '--dx': x, '--dy': y, '--turn': `${index * 56 - 165}deg` } as CSSProperties} />)}
      </div>}
      {/* parents */}
      {(breed || awaitingEgg) && s.me != null && s.foe != null && (
        <>
          <Actor x={26} w={30}>
            <L cls={s.phase === 'chain' ? 'chm-g-hop' : 'chm-g-breathe'}>
              <Mon mon={pa} size={30} />
            </L>
          </Actor>
          <Actor x={134} w={30}>
            <L cls={s.phase === 'chain' ? 'chm-g-hop' : 'chm-g-breathe'} style={{ animationDelay: '-.2s' }}>
              <Mon mon={pb} size={30} flip />
            </L>
          </Actor>
          {beat < 2 &&
            [20, 32, 128, 140].map((x, i) => (
              <Actor key={x} x={x} y={44} w={5} z={5}>
                <L cls="chm-g-heart" style={{ ['--dl' as string]: `${-i * 0.5}s` } as CSSProperties}>
                  <Px rows={HEART} pal={HEART_PAL} />
                </L>
              </Actor>
            ))}
          {(s.phase === 'chain' || s.phase === 'fhe') && (
            <>
              <div className="chm-g-beam" style={{ ...grid(u, 42, 44, 20, 2), zIndex: 3, backgroundImage: 'repeating-linear-gradient(90deg,#FF8FC7 0 8px,transparent 8px 16px)' }} />
              <div className="chm-g-beam" style={{ ...grid(u, 98, 44, 20, 2), zIndex: 3, backgroundImage: 'repeating-linear-gradient(270deg,#5AC8FA 0 8px,transparent 8px 16px)' }} />
            </>
          )}
        </>
      )}
      {s.phase === 'wallet' && <Alert x={tubeX + 22} y={22} />}
    </>
  )
}

/* ───────────────────────── world boss strike ───────────────────────── */

function StrikeScene({ s }: { s: SceneState }) {
  const fx = useStage()
  const { u } = fx
  const at = useTimers()
  const me = useMon(s.me)
  const meL = useLatest(me)
  const lvl = s.level ?? 1
  const el = s.element ?? 0
  const boss = useMemo(() => ({ id: 900 + lvl, traits: bossTraits(lvl, el), stage: 2 }), [lvl, el])
  const color = ELEMENTS[el]?.color ?? '#FF7020'
  const [meCls, setMeCls] = useState('chm-g-breathe')
  const [hit, setHit] = useState(0)
  const [bossCls, setBossCls] = useState('chm-g-breathe')
  const [attacked, setAttacked] = useState(false)
  const [band, setBand] = useState<number | null>(s.band ?? null)
  useEffect(() => setBand(s.band ?? null), [s.band])

  useEffect(() => {
    if (s.phase === 'chain') setMeCls('chm-g-charge')
  }, [s.phase])

  useOnce(s.phase === 'fhe' || s.phase === 'done', () => {
    setMeCls('chm-g-lunge')
    sfx.hop()
    at(320, () => {
      sfx.hit()
      fx.shake()
      fx.flash()
      fx.burst(110, 38, [color, '#fff', '#FFDD00'], 20)
      setHit((h) => h + 1)
      fx.pop('HIT!', 110, 20, { color: '#FFDD00', size: 9 })
    })
    at(1000, () => {
      setMeCls('chm-g-breathe')
      fx.pop('DAMAGE SEALED', 110, 30, { color: '#3DDC97', size: 3.6 })
    })
    at(2100, () => setAttacked(true))
  })

  useOnce(attacked && s.phase === 'done', () => {
    const name = bossName({ level: lvl, element: el })
    if (typeof s.result?.xp === 'number' && s.result.xp > 0) fx.pop(`+${s.result.xp} XP`, 38, 22, { color: '#5AC8FA', size: 4.5 })
    if (s.result?.killed) {
      sfx.crit()
      fx.flash()
      fx.shake()
      setBossCls('chm-g-die')
      setMeCls('chm-g-victory')
      setBand(0)
      at(500, () => sfx.win())
      at(300, () => fx.pop('KILLING BLOW!', 80, 26, { stay: true, size: 7.5, color: '#FFDD00' }))
      at(1400, () =>
        fx.say({ who: 'WORLD BOSS', text: `${meL.current.name} landed the killing blow on ${name}! Claim your raider share in the Raid hall. Individual damage stays sealed.`, ctas: [{ label: 'Back to the raid', primary: true }] }),
      )
    } else {
      sfx.roar()
      setBossCls('chm-g-roar')
      fx.pop('STILL STANDING', 112, 12, { stay: true, size: 4, color: '#fff' })
      at(900, () =>
        fx.say({
          who: 'WORLD BOSS',
          text: `${meL.current.name} struck ${name}. Damage stays encrypted. Check its recovery timer in the Raid hall before striking again.`,
          ctas: [{ label: 'Back to the raid', primary: true }, { label: 'Train it', to: `training/${s.me}` }],
        }),
      )
    }
  })

  const embers = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: 4 + i * 11 + Math.random() * 6, d: 3 + Math.random() * 3, dl: -Math.random() * 5, dx: (Math.random() - 0.5) * 30 })), [])
  return (
    <>
      <Bg theme="lair" tint={color} />
      {embers.map((e, i) => (
        <span key={i} className="chm-g-ember" style={{ ...grid(u, e.x, 62, 1.2, 1.2), background: i % 2 ? '#FFDD00' : color, zIndex: 1, ['--d' as string]: `${e.d}s`, ['--dl' as string]: `${e.dl}s`, ['--dx' as string]: `${e.dx * u}px` } as CSSProperties} />
      ))}
      {/* boss */}
      <Actor x={118} w={58} z={2}>
        <L cls={bossCls}>
          <L k={hit} cls={hit ? 'chm-g-flinch' : undefined}>
            <Mon mon={boss} size={58} flip seed={lvl * 13 + 5} />
          </L>
        </L>
      </Actor>
      <div style={{ ...grid(u, 96, 6, 44, 4), zIndex: 5, background: '#111', border: `${u * 0.6}px solid #111` }}>
        <div style={{ height: '100%', width: band == null ? '100%' : `${Math.max(0, Math.min(10, band)) * 10}%`, background: band == null ? 'repeating-linear-gradient(90deg,#E5341D 0 6px,#8a1a0c 6px 12px)' : '#E5341D', transition: 'width .5s steps(5,end)' }} />
      </div>
      <Tag x={118} y={0.6} bg="#111" color="#fff">
        {bossName({ level: lvl, element: el }).toUpperCase()}
      </Tag>
      {/* my creature */}
      <Actor x={38} w={40} z={3}>
        <L cls={meCls} style={{ ['--lunge' as string]: `${48 * u}px` } as CSSProperties}>
          <Mon mon={me} size={40} />
        </L>
      </Actor>
      <Tag x={38} y={24}>
        {me.name.toUpperCase()}
        {me.level ? ` · LV${me.level}` : ''}
      </Tag>
      {s.phase === 'wallet' && <Alert x={50} y={26} />}
    </>
  )
}

/* ───────────────────────── training dojo ───────────────────────── */

function TrainScene({ s }: { s: SceneState }) {
  const fx = useStage()
  const { u } = fx
  const at = useTimers()
  const me = useMon(s.me)
  const meL = useLatest(me)
  const from = s.level ?? me.level
  const to = from + 1
  const [cls, setCls] = useState('chm-g-breathe')
  const [stage, setStage] = useState<number | null>(null)
  const [evo, setEvo] = useState(false)
  const [levelShown, setLevelShown] = useState(false)
  const reps = s.phase === 'chain'

  useEffect(() => {
    if (s.phase === 'chain') setCls('chm-g-train')
    else if (s.phase === 'fhe') setCls(s.kind === 'finishTraining' ? 'chm-g-train-proof' : 'chm-g-pant')
    else if (s.phase === 'wallet' || s.phase === 'prep') setCls('chm-g-breathe')
  }, [s.kind, s.phase])
  useLoop(reps, 600, () => sfx.step())

  useOnce(s.phase === 'done', () => {
    if (s.result?.ok === false) {
      sfx.lose()
      setCls('chm-g-pant')
      fx.pop('REFUNDED', 80, 16, { stay: true, size: 6, color: '#E5341D' })
      fx.say({ who: 'DOJO', text: 'Not enough cZAMA for the session fee, so your XP was returned. Grab cZAMA from the faucet and train again.', ctas: [{ label: 'OK', primary: true }] })
      return
    }
    const evolves = stageOf(to) > stageOf(from)
    let t = 0
    if (evolves) {
      setEvo(true)
      sfx.evolve()
      fx.pop('...!?', 56, 18, { size: 5 })
      at(1800, () => {
        fx.flash()
        fx.shake()
        fx.burst(56, 44, ['#FFDD00', '#fff', '#8B5CF6', '#FF8FC7'], 24)
        setStage(stageOf(to))
        setEvo(false)
        sfx.win()
        fx.pop('EVOLVED!', 80, 12, { stay: true, size: 8, color: '#FF8FC7' })
        fx.pop(STAGE_NAMES[stageOf(to)].toUpperCase() + ' FORM', 80, 22, { stay: true, size: 4, color: '#fff' })
      })
      t = 3000
    }
    at(t, () => {
      setLevelShown(true)
      sfx.levelUp()
      setCls('chm-g-victory')
      if (!evolves) {
        fx.flash()
        fx.pop('LEVEL UP!', 80, 12, { stay: true, size: 8, color: '#FFDD00' })
      }
      fx.pop(`LV ${from} → ${to}`, 80, evolves ? 31 : 22, { stay: true, size: 4.5, color: '#5AC8FA' })
      fx.burst(56, 30, ['#FFDD00', '#5AC8FA', '#fff'], 14)
    })
    at(t + 1300, () =>
      fx.say({
        who: 'DOJO',
        text: `${meL.current.name} reached LV ${to}${evolves ? ` and evolved into its ${STAGE_NAMES[stageOf(to)]} form` : ''}. A secret power boost was rolled under FHE. It counts in every raid and arena fight, and only you can read it.`,
        ctas: [{ label: 'See its power', to: `creature/${s.me}`, primary: true }, { label: 'Continue' }],
      }),
    )
  })

  return (
    <>
      <Bg theme="dojo" />
      <Actor x={106} w={20} h={32} z={2}>
        <L cls={reps ? 'chm-g-dummy' : undefined}>
          <Px rows={DUMMY} pal={DUMMY_PAL} />
        </L>
      </Actor>
      {reps && (
        <Actor x={98} y={50} w={10} z={4}>
          <L cls="chm-g-hitspark">
            <Px rows={['..k..', '.kyk.', 'kywyk', '.kyk.', '..k..']} pal={{ k: '#111', y: '#FFDD00', w: '#fff' }} />
          </L>
        </Actor>
      )}
      <Actor x={56} w={38} z={3}>
        <L cls={cls}>
          <L cls={evo ? 'chm-g-evo' : undefined}>
            <Mon mon={me} size={38} stage={stage ?? stageOf(from)} />
          </L>
        </L>
      </Actor>
      <Tag x={56} y={24}>
        {me.name.toUpperCase()} · LV{levelShown ? to : from}
      </Tag>
      {s.phase === 'fhe' && (
        <Actor x={132} y={34} w={10} z={4}>
          <L cls="chm-g-glow">
            <Px rows={COIN} pal={COIN_PAL} />
          </L>
        </Actor>
      )}
      {s.phase === 'wallet' && <Alert x={68} y={28} />}
    </>
  )
}

/* ───────────────────────── arena battle ───────────────────────── */

function BattleScene({ s }: { s: SceneState }) {
  const { say } = useStage()
  const at = useTimers()
  const minimized = useLatest(s.minimized)
  const me = useMon(s.me)
  const meL = useLatest(me)
  const foe = useMon(s.foe)
  const [shot, setShot] = useState<{ beat: ArenaBeat; round: number; shown: number }>({ beat: 'intro', round: 0, shown: 0 })
  const rounds: boolean[] = Array.isArray(s.result?.rounds) && s.result.rounds.length === 3 ? s.result.rounds : []
  const won: boolean | undefined = s.result?.won

  useOnce(s.phase === 'done' && won !== undefined, () => {
    let finishAt = 0
    if (rounds.length === 3) {
      rounds.forEach((roundWon, round) => {
        const startAt = ARENA_TIMING.intro + round * (ARENA_TIMING.moves + ARENA_TIMING.impact)
        at(startAt, () => setShot({ beat: 'moves', round, shown: round }))
        at(startAt + ARENA_TIMING.moves, () => {
          setShot({ beat: 'impact', round, shown: round + 1 })
          if (!minimized.current) sfx.arenaHit(roundWon ? s.result?.mine?.[round] : s.result?.theirs?.[round], round === 2)
        })
      })
      finishAt = ARENA_TIMING.intro + rounds.length * (ARENA_TIMING.moves + ARENA_TIMING.impact)
    }
    at(finishAt, () => {
      setShot({ beat: 'result', round: 2, shown: rounds.length })
      if (!minimized.current) {
        if (won) sfx.win()
        else sfx.lose()
      }
    })
    at(finishAt + ARENA_TIMING.finish, () => {
      const battleId = s.result?.battleId
      const proof: Cta[] = battleId ? [{
        label: 'Verify the rounds',
        act: () => openProof({ mode: 'tactics', id: Number(battleId), title: `Fight #${battleId}` }),
      }] : []
      const next: Cta = s.replay ? { label: s.replayOrigin === 'scout' ? 'Back to planning' : 'Back to the log', primary: true }
        : s.starterHunt ? { label: 'Investigate the beacon', to: 'journal', primary: true }
          : meL.current.trainingReady ? { label: 'Train at the Dojo', to: `training/${s.me}`, primary: true }
            : { label: 'Plan the next hunt', to: `arena/${s.me}`, primary: true }
      say({ who: 'ARENA', text: won ? 'Victory' : 'Defeat', ctas: [next, ...proof] })
    })
  })

  const status = s.phase === 'wallet' ? 'Check your wallet'
    : s.phase === 'chain' ? 'Awaiting block'
      : s.phase === 'fhe' ? 'Reading rounds'
        : s.phase === 'confirmed' ? 'Fight confirmed'
          : s.phase === 'prep' ? 'Getting ready' : undefined

  return <ArenaStage
    fighters={[
      { ...me, seed: me.id || 3 },
      { ...foe, name: s.foe ? foe.name : s.mode === 1 ? 'Defender' : 'Unknown wild', seed: foe.id || 11 },
    ]}
    beat={s.phase === 'done' ? shot.beat : status ? 'waiting' : 'idle'}
    round={shot.round}
    scores={rounds.slice(0, shot.shown)}
    commands={[s.result?.mine?.[shot.round] ?? null, s.result?.theirs?.[shot.round] ?? null]}
    winner={shot.beat === 'result' ? won : shot.beat === 'impact' ? rounds[shot.round] : undefined}
    status={status}
  />
}

/* ───────────────────────── expeditions ───────────────────────── */

function ExpeditionScene({ s }: { s: SceneState }) {
  const fx = useStage()
  const at = useTimers()
  const me = useMon(s.me)
  const meL = useLatest(me)
  const zone = s.zone ?? 0
  const meta = ZONE_META[zone] ?? ZONE_META[0]
  const [gone, setGone] = useState(false)
  const walking = s.phase === 'chain' || s.phase === 'fhe' || s.phase === 'done'
  useLoop(walking && !gone, 680, () => sfx.step())

  useOnce(s.phase === 'done', () => {
    setGone(true)
    sfx.select()
    at(600, () => fx.pop('EXPEDITION STARTED', 80, 16, { stay: true, size: 5, color: '#FFDD00' }))
    at(1000, () => fx.pop(meta.name.toUpperCase(), 80, 25, { stay: true, size: 3.6, color: '#fff' }))
    at(1700, () =>
      fx.say({
        who: 'EXPEDITION',
        text: `${meL.current.name} set out into ${meta.name}. Success and loot were rolled under encryption the moment it left. Come back when the timer ends to see what it found.`,
        ctas: [{ label: 'OK', primary: true }],
      }),
    )
  })

  return (
    <>
      <Bg theme="zone" zone={zone} moving={walking && !gone} />
      <Actor x={62} w={34} z={3}>
        <L cls={gone ? 'chm-g-exit' : undefined}>
          <L cls={walking ? 'chm-g-walk' : 'chm-g-breathe'}>
            <Mon mon={me} size={34} />
          </L>
        </L>
      </Actor>
      {s.phase === 'wallet' && <Alert x={72} y={30} />}
    </>
  )
}

function ClaimScene({ s }: { s: SceneState }) {
  const fx = useStage()
  const at = useTimers()
  const me = useMon(s.me)
  const meL = useLatest(me)
  const zone = s.zone ?? 0
  const [open, setOpen] = useState(false)

  useOnce(s.phase === 'done', () => {
    const xp: number = s.result?.xp ?? 0
    sfx.crack()
    setOpen(true)
    fx.flash()
    at(500, () => fx.pop('BACK AT CAMP', 80, 14, { stay: true, size: 6, color: '#FFDD00' }))
    at(900, () => fx.pop(`+${xp} XP`, 50, 26, { size: 4.5, color: '#5AC8FA' }))
    at(1500, () =>
      fx.say({
        who: 'EXPEDITION',
        text: `${meL.current.name} is home. Read the sealed expedition report to see what it found.`,
        ctas: [{ label: 'Train it', to: `training/${s.me}` }, { label: 'OK', primary: true }],
      }),
    )
  })

  return (
    <>
      <Bg theme="zone" zone={zone} />
      <Actor x={108} w={22} h={17} z={2}>
        <L cls={!open && (s.phase === 'chain' || s.phase === 'fhe') ? 'chm-g-wobble' : undefined}>
          <Px rows={open ? CHEST_OPEN : CHEST_CLOSED} pal={CHEST_PAL} />
        </L>
      </Actor>
      <Actor x={60} w={34} z={3}>
        <L cls="chm-g-enter">
          <L cls={open ? 'chm-g-victory' : 'chm-g-breathe'}>
            <Mon mon={me} size={34} />
          </L>
        </L>
      </Actor>
      {s.phase === 'wallet' && <Alert x={70} y={30} />}
    </>
  )
}

/* ───────────────────────── faucet ───────────────────────── */

function FaucetScene({ s }: { s: SceneState }) {
  const fx = useStage()
  const { u } = fx
  const at = useTimers()
  const raining = s.phase === 'chain' || s.phase === 'fhe'
  const coins = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ x: 6 + i * 8.5 + Math.random() * 4, d: 0.9 + Math.random() * 0.8, dl: -Math.random() * 1.6 })), [])
  useLoop(raining, 420, () => sfx.coin())

  useOnce(s.phase === 'done', () => {
    sfx.coins()
    fx.flash()
    fx.coins(80, 44, 18)
    at(400, () => fx.pop('+1,000 cZAMA', 80, 16, { stay: true, size: 7, color: '#FFDD00' }))
    at(800, () => fx.pop('ENCRYPTED BALANCE', 80, 26, { stay: true, size: 3.6, color: '#3DDC97' }))
    at(1500, () =>
      fx.say({
        who: 'FAUCET',
        text: '1,000 cZAMA landed in your wallet as an encrypted balance. Only you can read it with your lab key. Spend it on breeding and training, and win more in raids, duels and expeditions.',
        ctas: [{ label: 'Go to my lab', to: 'lab', primary: true }, { label: 'Close' }],
      }),
    )
  })

  return (
    <>
      <Bg theme="vault" />
      {raining &&
        coins.map((c, i) => (
          <span key={i} className="chm-g-coinfall" style={{ ...grid(u, c.x, 0, 5, 5), zIndex: 2, ['--d' as string]: `${c.d}s`, ['--dl' as string]: `${c.dl}s`, ['--fall' as string]: `${62 * u}px` } as CSSProperties}>
            <Px rows={COIN} pal={COIN_PAL} />
          </span>
        ))}
      <Actor x={80} y={64} w={18} h={23} z={3}>
        <L cls={s.phase === 'done' ? 'chm-g-glow' : raining ? 'chm-g-wobble' : 'chm-g-bob'}>
          <Px rows={LOCK} pal={LOCK_PAL} />
        </L>
      </Actor>
    </>
  )
}
