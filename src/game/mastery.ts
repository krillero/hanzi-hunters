// Word mastery: pure functions, no DOM.
import type { Word } from '../data.ts'
import type { Mastery } from './types.ts'

export const MAX_LV = 4            // 4 = mastered
export const PROMOTE_AFTER = 2     // consecutive correct answers needed to move up a level
export const STARTING_POOL = 6     // words available before anything is learned
export const MAX_LEARNING = 4      // never introduce a new word while this many are still at level 0
const WEIGHT = [3, 3, 2, 2, 0.6]   // how often each level is asked
const NEW_WEIGHT = 3

/** First exposure creates the entry without credit; afterwards correct answers promote, a miss demotes one level. */
export function updateMastery(m: Mastery, hanzi: string, correct: boolean): Mastery {
  const e = m[hanzi]
  if (!e) return { ...m, [hanzi]: { lv: 0, ok: 0 } }
  if (!correct) return { ...m, [hanzi]: { lv: Math.max(0, e.lv - 1), ok: 0 } }
  const ok = e.ok + 1
  return { ...m, [hanzi]: ok >= PROMOTE_AFTER ? { lv: Math.min(MAX_LV, e.lv + 1), ok: 0 } : { lv: e.lv, ok } }
}

export const masteredCount = (m: Mastery) => Object.values(m).filter(e => e.lv >= MAX_LV).length
export const seenCount = (m: Mastery) => Object.keys(m).length

/** The pool grows by one word for every word that has reached level 1. */
export function activeCount(m: Mastery, total: number) {
  return Math.min(total, STARTING_POOL + Object.values(m).filter(e => e.lv >= 1).length)
}

export function pickWord(words: Word[], m: Mastery, currentHanzi: string | null, rng: () => number = Math.random): Word {
  const pool = words.slice(0, activeCount(m, words.length)).filter(w => w.hanzi !== currentHanzi)
  const learning = Object.values(m).filter(e => e.lv === 0).length
  const weighted = pool.map(w => {
    const e = m[w.hanzi]
    return { w, weight: e ? WEIGHT[e.lv] : learning >= MAX_LEARNING ? 0 : NEW_WEIGHT }
  }).filter(x => x.weight > 0)
  const candidates = weighted.length ? weighted : pool.map(w => ({ w, weight: 1 }))
  let r = rng() * candidates.reduce((n, x) => n + x.weight, 0)
  for (const x of candidates) { r -= x.weight; if (r < 0) return x.w }
  return candidates[candidates.length - 1].w
}

/** Damage bonus for answering a harder (higher level) question. */
export const MASTERY_DAMAGE = [0, 0.1, 0.25, 0.4, 0.4]
