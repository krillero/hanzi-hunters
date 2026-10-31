// Word mastery: pure functions, no DOM.
// Which entry is introduced next and which known entries are reviewed lives in course.ts (curriculum order, never file order).
import type { Mastery } from './types.ts'

export const MAX_LV = 4            // 4 = long-term mastery ("mastered"). Lesson completion only needs level 1 (see course.ts readiness).
export const PROMOTE_AFTER = 2     // consecutive correct answers needed to move up a level
export const STARTING_POOL = 6     // entries met may exceed the number of entries at level >= 1 by at most this much
export const MAX_LEARNING = 4      // never introduce a new entry while this many are still at level 0
export const MIN_KNOWN = 3         // a fight needs a few known entries to ask about: a brand-new player is introduced to this many first

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

/** Damage bonus for answering a harder (higher level) question. */
export const MASTERY_DAMAGE = [0, 0.1, 0.25, 0.4, 0.4]
