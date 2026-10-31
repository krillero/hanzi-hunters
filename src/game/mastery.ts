// Word mastery: pure functions, no DOM.
import type { Word } from '../data.ts'
import type { Mastery } from './types.ts'

export const MAX_LV = 4            // 4 = mastered
export const PROMOTE_AFTER = 2     // consecutive correct answers needed to move up a level
export const STARTING_POOL = 6     // words available before anything is learned
export const MAX_LEARNING = 4      // never introduce a new word while this many are still at level 0
const WEIGHT = [3, 3, 2, 2, 0.6]   // how often each level is asked
export const MIN_KNOWN = 3         // a fight needs a few known words to ask about: a brand-new player is introduced to this many first

/** First exposure creates the entry without credit; afterwards correct answers promote, a miss demotes one level. */
export function updateMastery(m: Mastery, id: string, correct: boolean): Mastery {
  const e = m[id]
  if (!e) return { ...m, [id]: { lv: 0, ok: 0 } }
  if (!correct) return { ...m, [id]: { lv: Math.max(0, e.lv - 1), ok: 0 } }
  const ok = e.ok + 1
  return { ...m, [id]: ok >= PROMOTE_AFTER ? { lv: Math.min(MAX_LV, e.lv + 1), ok: 0 } : { lv: e.lv, ok } }
}

export const masteredCount = (m: Mastery) => Object.values(m).filter(e => e.lv >= MAX_LV).length
export const seenCount = (m: Mastery) => Object.keys(m).length

/** The pool grows by one word for every word that has reached level 1. */
export function activeCount(m: Mastery, total: number) {
  return Math.min(total, STARTING_POOL + Object.values(m).filter(e => e.lv >= 1).length)
}

// ---- which words come first -------------------------------------------------------------------
/** New words are introduced in the content file's order (easiest first). To keep every new profile from starting with the same
 *  handful of words, the order is shuffled inside blocks of this many words, by a per-profile seed (seed 0 = file order, used by old saves). */
export const ORDER_BLOCK = 16

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** The word list in this profile's introduction order: a seeded shuffle inside each block of ORDER_BLOCK words. */
export function orderedWords(words: Word[], seed: number): Word[] {
  if (!seed) return words
  const rnd = mulberry32(seed), out: Word[] = []
  for (let i = 0; i < words.length; i += ORDER_BLOCK) {
    const block = words.slice(i, i + ORDER_BLOCK)
    for (let k = block.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [block[k], block[j]] = [block[j], block[k]] }
    out.push(...block)
  }
  return out
}

/**
 * Which unlocked words should get their introduction card at the start of this fight (ids, in order).
 * A word unlocks when the pool grows (a word reaching level 1); it is introduced at the next fight start, one per fight,
 * unless MAX_LEARNING words are still at level 0. A player who knows fewer than MIN_KNOWN words is introduced to enough to start.
 */
export function wordsToIntroduce(ordered: Word[], m: Mastery): string[] {
  const unseen = ordered.slice(0, activeCount(m, ordered.length)).filter(w => !m[w.id])
  if (!unseen.length) return []
  const learning = Object.values(m).filter(e => e.lv === 0).length
  const room = Math.max(0, MAX_LEARNING - learning)
  const need = Math.max(1, MIN_KNOWN - seenCount(m))
  return unseen.slice(0, Math.min(need, room)).map(w => w.id)
}

/** Words asked a moment ago are less likely to come straight back (never impossible, so tiny pools still work). Index 0 = most recent. */
export const RECENT_PENALTY = [0.1, 0.2, 0.3, 0.4, 0.6, 0.6]

export function pickWord(words: Word[], m: Mastery, currentId: string | null, rng: () => number = Math.random, recent: string[] = []): Word {
  const pool = words.slice(0, activeCount(m, words.length)).filter(w => w.id !== currentId)
  const weighted = pool.map(w => {
    const e = m[w.id]
    const base = e ? WEIGHT[e.lv] : 0   // a word you have not been introduced to is never asked: it gets its own card first (wordsToIntroduce)
    const ri = recent.indexOf(w.id)
    return { w, weight: ri >= 0 && ri < RECENT_PENALTY.length ? base * RECENT_PENALTY[ri] : base }
  }).filter(x => x.weight > 0)
  const candidates = weighted.length ? weighted : pool.map(w => ({ w, weight: 1 }))
  let r = rng() * candidates.reduce((n, x) => n + x.weight, 0)
  for (const x of candidates) { r -= x.weight; if (r < 0) return x.w }
  return candidates[candidates.length - 1].w
}

/** Damage bonus for answering a harder (higher level) question. */
export const MASTERY_DAMAGE = [0, 0.1, 0.25, 0.4, 0.4]
