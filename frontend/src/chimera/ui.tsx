import { useRef, useState, useSyncExternalStore, type ReactNode, type CSSProperties, type MouseEventHandler } from 'react'
import { flushSync } from 'react-dom'
import { Loader2, ExternalLink, Lock, Check, X } from 'lucide-react'
import CreatureArt from './CreatureArt'
import { LOCI, TIERS, tierOf, speciesName, rareCount, hiAllele, loAllele, ELEMENTS, elementOf } from './genetics'
import { errorText, txUrl, short, addrUrl, setTxStep, GAS_FAUCET } from './chain'
import { useCreature, useTraits, useTraining, type CreatureBase } from './hooks'
import { openScene, sceneStep, sceneDone, sceneFail, getSceneOpen, sceneActive, type SceneSpec } from './game/store'
import { PxIcon, type PxIconName } from './game/hud'
import { fullGameMotion } from './game/motion'

/* ───────────────────────── router ───────────────────────── */

const hashSubs = new Set<() => void>()
const notifyRoute = () => hashSubs.forEach(listener => listener())
let activeTransition: ViewTransition | null = null
let navigationRequest = 0
let viewTransitionHash: string | null = null
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => {
  viewTransitionHash = null
  notifyRoute()
})

export const hasNativePageTransition = () => typeof window !== 'undefined' && window.location.hash === viewTransitionHash
export function useRoute(): string[] {
  const h = useSyncExternalStore(
    (f) => {
      hashSubs.add(f)
      return () => hashSubs.delete(f)
    },
    () => window.location.hash,
    () => '',
  )
  return h.replace(/^#\/?/, '').split('/').filter(Boolean)
}
const routeHref = (path: string) => '#/' + path.replace(/^\//, '')

export function go(path: string) {
  const hash = routeHref(path)
  const request = ++navigationRequest
  activeTransition?.skipTransition()

  if (window.location.hash === hash) {
    document.getElementById('main-content')?.scrollTo({ top: 0 })
    return
  }
  const commit = (withTransition = false) => {
    window.history.pushState(null, '', hash)
    viewTransitionHash = withTransition ? hash : null
    notifyRoute()
  }
  if (!document.startViewTransition || document.visibilityState !== 'visible') {
    commit()
    return
  }

  const before = window.location.href
  const root = document.documentElement
  root.classList.add('chm-view-transition')
  const transition = document.startViewTransition(() => {
    if (request !== navigationRequest || before !== window.location.href) return
    flushSync(() => commit(true))
  })
  activeTransition = transition
  const cleanup = () => {
    if (activeTransition !== transition) return
    activeTransition = null
    root.classList.remove('chm-view-transition')
  }
  void transition.ready.catch(() => {})
  void transition.finished.then(cleanup, cleanup)
}
export function Link({ to, children, className, style, current, onNavigate }: { to: string; children: ReactNode; className?: string; style?: CSSProperties; current?: boolean; onNavigate?: () => void }) {
  return (
    <a href={routeHref(to)} className={className} style={style} aria-current={current ? 'page' : undefined} onClick={event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      onNavigate?.()
      go(to)
    }}>
      {children}
    </a>
  )
}

/* ───────────────────────── toasts ───────────────────────── */

type Toast = { id: number; kind: 'pending' | 'ok' | 'err'; title: string; detail?: string; hash?: string }
let toasts: Toast[] = []
const toastSubs = new Set<() => void>()
const emit = () => toastSubs.forEach((f) => f())
let tid = 0
export function toast(t: Omit<Toast, 'id'>, ttl = 7000) {
  const id = ++tid
  toasts = [...toasts, { ...t, id }].slice(-4)
  emit()
  if (t.kind !== 'pending') setTimeout(() => dismiss(id), ttl)
  return id
}
export function updateToast(id: number, t: Partial<Toast>, ttl = 7000) {
  toasts = toasts.map((x) => (x.id === id ? { ...x, ...t } : x))
  emit()
  if (t.kind && t.kind !== 'pending') setTimeout(() => dismiss(id), ttl)
}
export const dismiss = (id: number) => {
  toasts = toasts.filter((x) => x.id !== id)
  emit()
}
export function Toasts() {
  const list = useSyncExternalStore(
    (f) => {
      toastSubs.add(f)
      return () => toastSubs.delete(f)
    },
    () => toasts,
    () => toasts,
  )
  return (
    <div className="chm-toasts fixed bottom-5 right-5 z-50 flex w-[340px] max-w-[calc(100cqw-2.5rem)] flex-col gap-4" aria-live="polite">
      {list.map((t) => {
        const tone = TOAST_TONE[t.kind]
        return (
          <div key={t.id} role={t.kind === 'err' ? 'alert' : 'status'} className="chm-toast-in chm-pxbox bg-white text-sm">
            <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: tone.bar, color: tone.ink }}>
              <PxIcon name={tone.icon} size={13} className={t.kind === 'pending' ? 'chm-hg' : ''} />
              <div className="font-pixel min-w-0 flex-1 truncate text-[9px] uppercase">{t.title}</div>
              <button onClick={() => dismiss(t.id)} className="font-pixel -mr-1 px-1 text-[10px] leading-none opacity-80 hover:opacity-100" aria-label="Dismiss">
                ×
              </button>
            </div>
            <div className="border-t-[3px] border-[#111] px-3 py-2.5" style={{ background: tone.body }}>
              {t.detail && <div className="break-words leading-snug text-[#222]">{t.detail}</div>}
              {t.kind === 'pending' && (
                <div className="chm-pxbar mt-2 flex h-2 gap-[2px] text-[var(--chm-black)]" aria-hidden>
                  {Array.from({ length: 12 }, (_, i) => (
                    <i key={i} style={{ animationDelay: `${(i * 0.1).toFixed(1)}s` }} />
                  ))}
                </div>
              )}
              {t.detail?.includes('Sepolia faucet') && (
                <a href={GAS_FAUCET} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 font-mono text-xs font-bold text-[var(--chm-black)] underline">
                  Get free Sepolia ETH <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {t.hash && (
                <a href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 font-mono text-xs font-bold text-[#111] underline">
                  TX {short(t.hash)} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {!t.detail && !t.hash && t.kind !== 'pending' && <div className="font-mono text-xs text-[#555]">{t.kind === 'ok' ? 'All done.' : 'Something went wrong.'}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const TOAST_TONE: Record<string, { bar: string; ink: string; body: string; icon: PxIconName }> = {
  pending: { bar: 'var(--chm-yellow)', ink: 'var(--chm-black)', body: 'var(--chm-white)', icon: 'hourglass' },
  ok: { bar: 'var(--chm-black)', ink: 'var(--chm-yellow)', body: 'var(--chm-gray)', icon: 'check' },
  err: { bar: '#E5341D', ink: '#fff', body: '#FFE9E4', icon: 'cross' },
  info: { bar: '#111', ink: '#fff', body: '#fff', icon: 'info' },
}

/** Runs an async action with a pending/ok/error toast. Steps can update the detail line. */
export type SceneOpt = {
  /** open a new animated scene for this action */
  spec?: SceneSpec
  /** route progress into the scene that is already open */
  cont?: boolean
  /** false → keep the scene running after this action (a follow-up action finishes it) */
  final?: boolean
  /** shape the action result into what the scene shows */
  map?: (r: any) => any
}

let actionRunning = false

/** Runs an async action. With a scene it plays as a pixel cutscene; otherwise a pending/ok/error toast. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  async function run<T>(title: string, fn: (step: (s: string, hash?: string) => void) => Promise<T>, okText?: string, scene?: SceneOpt): Promise<T | undefined> {
    if (actionRunning || (sceneActive() && !scene?.cont)) return
    actionRunning = true
    setBusy(title)
    setStatus('Preparing…')
    const staged = !!scene && (!!scene.spec || (scene.cont && !!getSceneOpen()))
    if (scene?.spec) openScene(scene.spec, title)
    const id = staged ? 0 : toast({ kind: 'pending', title, detail: 'Preparing…' })
    const step = (s: string, hash?: string) => {
      setStatus(s)
      if (staged) sceneStep(s, hash)
      else updateToast(id, { detail: s, ...(hash ? { hash } : {}) })
    }
    setTxStep(step)
    try {
      const r = await fn(step)
      const hash = (r as any)?.hash
      if (staged) {
        if (scene!.final !== false) sceneDone(scene!.map ? scene!.map(r) : r, okText)
      } else updateToast(id, { kind: 'ok', title: okText ?? 'Done', detail: undefined, ...(hash ? { hash } : {}) })
      return r
    } catch (e) {
      console.error(e)
      if (staged) sceneFail(errorText(e))
      else updateToast(id, { kind: 'err', title: `${title} failed`, detail: errorText(e) }, 10000)
    } finally {
      actionRunning = false
      setTxStep(null)
      setBusy(null)
      setStatus(null)
    }
  }
  return { busy, run, status }
}

/** Inline progress line shown under a busy button, so nobody wonders whether it is stuck. */
export function BusyNote({ status, className = '' }: { status: string | null; className?: string }) {
  if (!status) return null
  return (
    <div className={`chm-rise flex max-w-[360px] items-start gap-2 text-left text-xs font-bold text-[#111] ${className}`}>
      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[var(--chm-teal)]" />
      <span>{status}</span>
    </div>
  )
}

/* ───────────────────────── primitives ───────────────────────── */

export function Button({ children, onClick, disabled, busy, variant = 'primary', className = '', title, type = 'button', arrow, 'aria-label': ariaLabel }: { children: ReactNode; onClick?: MouseEventHandler<HTMLButtonElement>; disabled?: boolean; busy?: boolean; variant?: 'primary' | 'ghost' | 'danger' | 'gold' | 'blue'; className?: string; title?: string; type?: 'button' | 'submit'; arrow?: boolean; 'aria-label'?: string }) {
  return (
    <button type={type} title={title} aria-label={ariaLabel} onClick={onClick} disabled={disabled || busy} className={`chm-btn chm-btn-${variant} ${arrow ? 'chm-btn-arrow' : ''} ${className}`}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Panel({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`chm-panel ${className}`} style={style}>
      {children}
    </div>
  )
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--chm-dim)] ${className}`}>{children}</div>
}

/** Yellow mono tag with a hard shadow — the section kicker used everywhere. */
export function Tag({ children, color = 'yellow', className = '' }: { children: ReactNode; color?: 'yellow' | 'white' | 'orange' | 'blue' | 'pink' | 'mint' | 'ink'; className?: string }) {
  return <span className={`chm-tag ${color !== 'yellow' ? `chm-tag-${color}` : ''} ${className}`}>{children}</span>
}

export function Addr({ a, you }: { a?: string | null; you?: string | null }) {
  if (!a) return <span>—</span>
  const isYou = you && a.toLowerCase() === you.toLowerCase()
  return (
    <a href={addrUrl(a)} target="_blank" rel="noreferrer" className="font-mono font-bold text-[var(--chm-ink)] underline decoration-2 underline-offset-2 hover:bg-[var(--chm-yellow)]">
      {isYou ? 'you' : short(a)}
    </a>
  )
}

export function TierChip({ v }: { v: number }) {
  const t = TIERS[tierOf(v)]
  return (
    <span className="border-2 border-[#111] px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: t.on, background: t.color }}>
      {t.name}
    </span>
  )
}

export function Sealed({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[var(--chm-dim)] ${className}`}>
      <Lock className="h-3 w-3" /> sealed
    </span>
  )
}

/* ───────────────────────── creature pieces ───────────────────────── */

export function creatureTitle(id: number, traits?: number[] | null) {
  return traits ? speciesName(traits) : `Specimen ${id}`
}

export function CreatureCard({ id, onClick, selected, footer, compact }: { id: number; onClick?: (trigger: HTMLButtonElement) => void; selected?: boolean; footer?: ReactNode; compact?: boolean }) {
  const art = useRef<HTMLDivElement>(null)
  const c = useCreature(id)
  const t = useTraits(c.data)
  const traits = t.data
  const rc = traits ? rareCount(traits) : 0
  const chimera = c.data?.info.chimera
  const tr = useTraining(id)
  const level = tr.data?.level ?? 0
  const body = (
    <>
      <div className="chm-art relative flex items-center justify-center" style={{ height: compact ? 136 : 180 }}>
        <div ref={art}><CreatureArt traits={traits} seed={id} size={compact ? 130 : 170} hatching={!traits && !!c.data} stage={tr.data?.stage} /></div>
        {level > 0 && (
          <span className="chm-specimen-chip absolute bottom-2 left-2">
            LV {level}
          </span>
        )}
        {(chimera || c.data?.info.wild) && <span className="chm-specimen-chip absolute left-2 top-2">{chimera ? 'Rare lineage' : 'Wild-born'}</span>}
        <span className="chm-specimen-chip absolute right-2 top-2">#{id}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="truncate font-display text-lg text-[var(--chm-ink)]">{creatureTitle(id, traits)}</div>
        {traits && rc > 0 && <span className="chm-specimen-rare shrink-0">{rc} RARE</span>}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[12px] font-bold text-[var(--chm-dim)]">
        <span>Gen {c.data?.info.generation ?? '·'}</span>
        {traits ? (
          <span className="flex gap-0.5" title={`${rc} of 7 traits rare or better`}>
            {traits.map((v, i) => (
              <span key={i} className="h-2.5 w-2.5 border-[1.5px] border-[#111]" style={{ background: TIERS[tierOf(v)].color }} />
            ))}
          </span>
        ) : (
          <span className="chm-flicker">{c.data ? 'decrypting…' : 'loading…'}</span>
        )}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </>
  )
  if (onClick)
    return (
      <button onClick={(event) => {
        if (fullGameMotion()) {
          art.current?.getAnimations().forEach((animation) => animation.cancel())
          art.current?.animate([{ transform: 'scale(.92,1.05)' }, { transform: 'translateY(-7px) scale(1.04,.96)' }, { transform: 'none' }], { duration: 260, easing: 'steps(6,end)' })
        }
        onClick(event.currentTarget)
      }} aria-pressed={selected} className={`chm-card text-left ${selected ? 'chm-card-on' : ''}`}>
        {body}
      </button>
    )
  return <div className={`chm-card ${selected ? 'chm-card-on' : ''}`}>{body}</div>
}

/** Seven visible traits as bars; sequenced/certified loci show both alleles. */
export function TraitTable({ traits, alleles, element, base }: { traits?: number[]; alleles?: Record<number, number>; element?: number | null; base?: CreatureBase }) {
  return (
    <div className="divide-y-2 divide-[#111]/15">
      {LOCI.map((l, i) => {
        const isElem = i === 7
        const v = isElem ? element ?? undefined : traits?.[i]
        const locus = alleles?.[i]
        const t = v != null ? TIERS[tierOf(v)] : null
        return (
          <div key={l.key} className="grid grid-cols-[70px_minmax(0,1fr)_84px] items-center gap-2 py-2.5">
            <div>
              <div className="text-sm font-bold text-[var(--chm-ink)]">{l.name}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--chm-dim)]">{l.stat ?? 'cosmetic'}</div>
            </div>
            <div>
              {v == null ? (
                <div className="flex items-center gap-2">
                  <div className="chm-noise h-3 flex-1" />
                  <Sealed className="text-[11px]" />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 overflow-hidden border-2 border-[#111] bg-white">
                    <div className="h-full border-r-2 border-[#111]" style={{ width: `${((v + 1) / 16) * 100}%`, background: t!.color }} />
                  </div>
                  <span className="w-6 text-right font-mono text-sm font-bold text-[#111]">
                    {v}
                  </span>
                </div>
              )}
              {isElem && v != null && (
                <div className="mt-1 font-mono text-[12px] font-bold" style={{ color: ELEMENTS[elementOf(v)].ink }}>
                  {ELEMENTS[elementOf(v)].name} · beats {ELEMENTS[elementOf(v)].beats}
                </div>
              )}
            </div>
            <div className="min-w-0 text-right font-mono text-[10px]">
              {locus != null ? (
                <span title="Both alleles: the lower one is dominant and shows">
                  <span className="font-bold" style={{ color: TIERS[tierOf(hiAllele(locus))].ink }}>{hiAllele(locus)}</span>
                  <span className="text-[var(--chm-dim)]"> / </span>
                  <span className="font-bold" style={{ color: TIERS[tierOf(loAllele(locus))].ink }}>{loAllele(locus)}</span>
                </span>
              ) : base ? (
                <span className="text-[var(--chm-dim)]">alleles sealed</span>
              ) : null}
              {v != null && !isElem && <div className="mt-0.5"><TierChip v={v} /></div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Double helix: one rung per locus. Known alleles glow; sealed ones are encrypted noise. */
export function DnaStrand({ alleles, height = 340 }: { alleles: Record<number, number>; height?: number }) {
  const rows = 8
  const w = 220
  const gap = height / (rows + 1)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} className="chm-helix">
      {Array.from({ length: rows }, (_, i) => {
        const y = gap * (i + 1)
        const phase = (i / rows) * Math.PI * 2
        const dx = Math.sin(phase) * 70
        const z = Math.cos(phase)
        const xa = w / 2 - dx
        const xb = w / 2 + dx
        const locus = alleles[i]
        const known = locus != null
        const ca = known ? TIERS[tierOf(hiAllele(locus))].color : '#ffffff'
        const cb = known ? TIERS[tierOf(loAllele(locus))].color : '#ffffff'
        return (
          <g key={i} className="chm-rung" style={{ animationDelay: `${i * -0.35}s` }} opacity={0.8 + 0.2 * ((z + 1) / 2)}>
            <line x1={xa} y1={y} x2={xb} y2={y} stroke="#111" strokeWidth="3" strokeDasharray={known ? undefined : '4 4'} />
            <rect x={xa - 12 + 3} y={y - 12 + 3} width={24} height={24} fill="#111" />
            <rect x={xb - 12 + 3} y={y - 12 + 3} width={24} height={24} fill="#111" />
            <rect x={xa - 12} y={y - 12} width={24} height={24} fill={ca} stroke="#111" strokeWidth="2.5" />
            <rect x={xb - 12} y={y - 12} width={24} height={24} fill={cb} stroke="#111" strokeWidth="2.5" />
            <text x={xa} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fontFamily="Courier Prime, monospace" fill={known ? TIERS[tierOf(hiAllele(locus))].on : '#111'}>
              {known ? hiAllele(locus) : '?'}
            </text>
            <text x={xb} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fontFamily="Courier Prime, monospace" fill={known ? TIERS[tierOf(loAllele(locus))].on : '#111'}>
              {known ? loAllele(locus) : '?'}
            </text>
            <text x={w / 2} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="Courier Prime, monospace" fill="#111" letterSpacing="1.5">
              {LOCI[i].name.toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="chm-panel chm-dotgrid flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="font-display text-2xl text-[var(--chm-ink)]">{title}</div>
      {children && <div className="max-w-md text-sm text-[var(--chm-dim)]">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <Label>{label}</Label>
      <div className="mt-1 font-display text-3xl text-[var(--chm-ink)]">{value}</div>
    </div>
  )
}
