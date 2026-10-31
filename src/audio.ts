// Procedural sound effects and haptics. No audio files: every sound is a few synthesised notes, so there is nothing to license
// and nothing to download. The score functions are pure (and unit-tested); only `playSfx` / `vibrate` touch the browser.

export type SfxName = 'correct' | 'combo' | 'wrong' | 'kill' | 'levelup' | 'loot' | 'mastered' | 'defeat' | 'tap'
export type Note = { at: number; freq: number; dur: number; type: OscillatorType; gain: number }
export type SfxOptions = { streak?: number; rarity?: 'common' | 'rare' | 'epic' }

const note = (at: number, freq: number, dur: number, type: OscillatorType = 'square', gain = 0.12): Note => ({ at, freq, dur, type, gain })
const SEMI = (n: number) => 2 ** (n / 12)

/** The notes of a sound, in seconds from now. Combo pitch rises with the streak but is capped (cosmetic only). */
export function sfxScore(name: SfxName, opts: SfxOptions = {}): Note[] {
  switch (name) {
    case 'tap': return [note(0, 880, 0.03, 'sine', 0.04)]
    case 'correct': return [note(0, 523, 0.09), note(0.08, 784, 0.14)]
    case 'combo': {
      const lift = SEMI(Math.min(12, Math.max(0, (opts.streak ?? 2) - 2)))
      return [note(0, 523 * lift, 0.07), note(0.06, 659 * lift, 0.07), note(0.12, 784 * lift, 0.07), note(0.18, 1047 * lift, 0.2, 'triangle', 0.14)]
    }
    case 'wrong': return [note(0, 196, 0.16, 'triangle', 0.14), note(0.1, 147, 0.22, 'triangle', 0.12)]
    case 'kill': return [note(0, 110, 0.12, 'sawtooth', 0.14), note(0.1, 523, 0.12), note(0.22, 659, 0.12), note(0.34, 784, 0.26, 'triangle', 0.15)]
    case 'levelup': return [523, 659, 784, 1047, 1319].map((f, i) => note(i * 0.12, f, i === 4 ? 0.3 : 0.12, 'triangle', 0.13))
    case 'loot': {
      const r = opts.rarity ?? 'common'
      const base = [784, 988]
      const more = r === 'common' ? [] : r === 'rare' ? [1319] : [1319, 1568, 2093]
      return [...base, ...more].map((f, i, a) => note(i * 0.09, f, i === a.length - 1 ? 0.28 : 0.1, 'triangle', 0.12))
    }
    case 'mastered': return [note(0, 1319, 0.5, 'sine', 0.12), note(0.02, 1976, 0.5, 'sine', 0.06), note(0.16, 1568, 0.6, 'sine', 0.1)]
    case 'defeat': return [note(0, 262, 0.2, 'triangle', 0.14), note(0.18, 196, 0.2, 'triangle', 0.13), note(0.36, 131, 0.5, 'triangle', 0.13)]
  }
}

/** Vibration patterns in milliseconds (vibrate, pause, vibrate, ...). Android browsers only; harmless elsewhere. */
export const HAPTICS: Record<SfxName, number[]> = {
  tap: [], correct: [15], combo: [15, 30, 15], wrong: [40], kill: [20, 40, 60], levelup: [20, 30, 20, 30, 80], loot: [15, 25, 15], mastered: [20, 40, 20, 40, 20], defeat: [80, 60, 120]
}

export const totalDuration = (notes: Note[]) => notes.reduce((m, n) => Math.max(m, n.at + n.dur), 0)

let ctx: AudioContext | null = null
function context(): AudioContext | null {
  try {
    if (!ctx) { const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return null; ctx = new C() }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

/** Call from the first tap so browsers that block autoplay allow later sounds. */
export function unlockAudio() { context() }

export function playSfx(name: SfxName, opts: SfxOptions = {}, delaySec = 0) {
  const c = context(); if (!c) return
  const t0 = c.currentTime + delaySec + 0.01
  for (const n of sfxScore(name, opts)) {
    const o = c.createOscillator(), g = c.createGain()
    o.type = n.type; o.frequency.value = n.freq
    g.gain.setValueAtTime(0.0001, t0 + n.at)
    g.gain.exponentialRampToValueAtTime(n.gain, t0 + n.at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur)
    o.connect(g).connect(c.destination)
    o.start(t0 + n.at); o.stop(t0 + n.at + n.dur + 0.02)
  }
}

export function vibrate(name: SfxName) {
  const p = HAPTICS[name]
  try { if (p.length > 0 && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(p) } catch { /* not supported */ }
}
