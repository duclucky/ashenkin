/* Tiny chiptune sound kit on WebAudio — no assets, square/triangle waves + noise. */

let ctx: AudioContext | null = null
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('chm:mute') === '1'
const subs = new Set<() => void>()

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem('chm:mute', m ? '1' : '0')
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05)
  subs.forEach((f) => f())
}
export function onMute(f: () => void) {
  subs.add(f)
  return () => void subs.delete(f)
}

/** Must be called from a user gesture once (clicking an action button does it). */
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; at?: number } = {}) {
  if (muted || !ctx) return
  const t = ctx.currentTime + (opts.at ?? 0)
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = opts.type ?? 'square'
  o.frequency.setValueAtTime(freq, t)
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
  const v = opts.vol ?? 0.05
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, vol = 0.08, at = 0, lowpass = 1800) {
  if (muted || !ctx) return
  const t = ctx.currentTime + at
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const s = ctx.createBufferSource()
  s.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = lowpass
  const g = ctx.createGain()
  g.gain.value = vol
  s.connect(f).connect(g).connect(ctx.destination)
  s.start(t)
}

const seq = (notes: number[], step: number, opts: { type?: OscillatorType; vol?: number; len?: number } = {}) =>
  notes.forEach((n, i) => n && tone(n, opts.len ?? step * 0.95, { type: opts.type, vol: opts.vol, at: i * step }))

export const sfx = {
  blip: () => tone(880, 0.03, { vol: 0.018 }),
  select: () => seq([660, 990], 0.06, { vol: 0.04 }),
  wallet: () => seq([523, 784], 0.08, { type: 'triangle', vol: 0.07 }),
  sent: () => seq([392, 523, 659], 0.07, { vol: 0.04 }),
  cipher: () => seq([1046, 0, 1318, 0, 1174], 0.05, { type: 'triangle', vol: 0.03 }),
  hop: () => tone(300, 0.09, { to: 520, vol: 0.035 }),
  hit: () => {
    noise(0.18, 0.14, 0, 1400)
    tone(180, 0.16, { to: 60, vol: 0.08 })
  },
  arenaHit: (move?: number | null, finalRound = false) => {
    if (move === 1) {
      noise(0.12, 0.085, 0, 3300)
      tone(670, 0.15, { type: 'triangle', to: 385, vol: 0.062 })
      tone(280, 0.18, { type: 'triangle', to: 104, vol: 0.05, at: 0.025 })
    } else if (move === 2) {
      noise(0.15, 0.082, 0, 5700)
      tone(490, 0.12, { type: 'triangle', to: 1180, vol: 0.045 })
      tone(157, 0.13, { to: 68, vol: 0.061, at: 0.045 })
    } else {
      noise(0.19, move === 0 ? 0.13 : 0.096, 0, move === 0 ? 2900 : 1600)
      tone(193, 0.16, { to: 62, vol: 0.07 })
    }
    if (finalRound) tone(95, 0.22, { type: 'sine', to: 43, vol: 0.067, at: 0.022 })
  },
  crit: () => {
    noise(0.35, 0.18, 0, 2400)
    tone(220, 0.3, { to: 40, vol: 0.1 })
    seq([0, 0, 0, 1568, 2093], 0.06, { vol: 0.04 })
  },
  crack: () => {
    noise(0.07, 0.12, 0, 4000)
    noise(0.05, 0.1, 0.12, 4000)
  },
  hatch: () => {
    noise(0.25, 0.1, 0, 5000)
    seq([523, 659, 784, 1046, 1318], 0.07, { vol: 0.05 })
  },
  levelUp: () => seq([523, 659, 784, 1046, 0, 784, 1046, 1318], 0.08, { vol: 0.05 }),
  evolve: () => {
    seq([262, 330, 392, 523, 659, 784, 1046, 1318, 1568], 0.06, { type: 'triangle', vol: 0.07 })
    noise(0.6, 0.06, 0.4, 6000)
  },
  coin: () => seq([988, 1318], 0.07, { vol: 0.04 }),
  coins: () => [0, 0.09, 0.18, 0.27].forEach((d) => (tone(988, 0.06, { vol: 0.03, at: d }), tone(1318, 0.12, { vol: 0.03, at: d + 0.05 }))),
  win: () => seq([523, 523, 523, 698, 0, 659, 698, 880], 0.1, { vol: 0.05 }),
  lose: () => seq([392, 370, 349, 262], 0.18, { type: 'triangle', vol: 0.07 }),
  roar: () => {
    tone(110, 0.6, { type: 'sawtooth', to: 70, vol: 0.06 })
    noise(0.5, 0.06, 0.05, 600)
  },
  error: () => seq([220, 0, 196], 0.1, { vol: 0.05 }),
  step: () => tone(140, 0.04, { type: 'triangle', vol: 0.05 }),
  press: () => tone(620, 0.025, { vol: 0.02 }),
  door: () => {
    seq([392, 330, 262], 0.06, { type: 'triangle', vol: 0.06 })
    noise(0.12, 0.05, 0.05, 900)
  },
}

/* ───────────────────────── background music ─────────────────────────
   A tiny step sequencer: lead (square), bass (triangle) and a noise hat, scheduled ahead of time. */

type Track = { bpm: number; lead: number[]; bass: number[]; hat: number[] }
const N = (m: number) => (m ? 440 * Math.pow(2, (m - 69) / 12) : 0)
// 0 = rest. Midi notes, one per 8th note.
const TRACKS: Record<'town' | 'battle', Track> = {
  town: {
    bpm: 104,
    lead: [72, 0, 76, 79, 81, 79, 76, 0, 74, 0, 77, 81, 79, 0, 76, 74, 72, 0, 76, 79, 84, 83, 81, 79, 77, 76, 74, 76, 72, 0, 0, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0, 50, 0, 57, 0, 50, 0, 57, 0, 53, 0, 60, 0, 53, 0, 60, 0, 55, 0, 50, 0, 48, 0, 55, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1],
  },
  battle: {
    bpm: 150,
    lead: [69, 69, 72, 69, 74, 72, 69, 67, 69, 69, 72, 76, 74, 72, 74, 0, 69, 69, 72, 69, 74, 72, 69, 67, 65, 67, 69, 72, 71, 69, 68, 0],
    bass: [45, 45, 57, 45, 45, 45, 57, 45, 43, 43, 55, 43, 43, 43, 55, 43, 41, 41, 53, 41, 41, 41, 53, 41, 40, 40, 52, 40, 44, 44, 56, 44],
    hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
  },
}

let musicOn = typeof localStorage !== 'undefined' && localStorage.getItem('chm:music') === '1'
let track: keyof typeof TRACKS = 'town'
let timer: number | null = null
let stepIdx = 0
let nextAt = 0
let master: GainNode | null = null
const musicSubs = new Set<() => void>()

export const isMusicOn = () => musicOn
export function onMusic(f: () => void) {
  musicSubs.add(f)
  return () => void musicSubs.delete(f)
}

function note(freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
  if (!ctx || !master || !freq) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(master)
  o.start(at)
  o.stop(at + dur + 0.02)
}
function hat(at: number, vol: number) {
  if (!ctx || !master) return
  const len = Math.floor(ctx.sampleRate * 0.03)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 6000
  const g = ctx.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(master)
  src.start(at)
}

function tick() {
  if (!ctx || !master) return
  const t = TRACKS[track]
  const step = 60 / t.bpm / 2
  while (nextAt < ctx.currentTime + 0.25) {
    const i = stepIdx % t.lead.length
    note(N(t.lead[i]), nextAt, step * 0.9, 'square', 0.028)
    note(N(t.bass[i]), nextAt, step * 0.95, 'triangle', 0.06)
    if (t.hat[i]) hat(nextAt, 0.025)
    nextAt += step
    stepIdx++
  }
}

function start() {
  unlockAudio()
  if (!ctx || timer != null) return
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.9
  master.connect(ctx.destination)
  nextAt = ctx.currentTime + 0.05
  stepIdx = 0
  timer = window.setInterval(tick, 90)
}
function stop() {
  if (timer != null) clearInterval(timer)
  timer = null
  if (master && ctx) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    const m = master
    setTimeout(() => m.disconnect(), 300)
  }
  master = null
}

/** Turn the music on or off (call from a click so audio can start). */
export function setMusic(on: boolean) {
  musicOn = on
  localStorage.setItem('chm:music', on ? '1' : '0')
  on ? start() : stop()
  musicSubs.forEach((f) => f())
}
/** Pick the loop for the current place. Restarts the bar so the switch lands cleanly. */
export function setTrack(t: keyof typeof TRACKS) {
  if (t === track) return
  track = t
  stepIdx = 0
}
/** Resume music after the first user gesture if it was left on last time. */
export function resumeMusic() {
  if (musicOn && timer == null) start()
}

