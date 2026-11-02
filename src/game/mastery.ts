// Word mastery constants and helpers: pure functions, no DOM. The scheduling rules live in schedule.ts (see docs/SCHEDULING.md).
// Which entry is introduced next and which known entries are reviewed lives in course.ts (curriculum order, never file order).
import type { Mastery, MasteryEntry } from './types.ts'
import { MAX_LV, standing } from './schedule.ts'

export { MAX_LV }
export const SESSION_LV = 2        // Familiar: initial learning (three spaced successes) is complete; lesson readiness needs less (course.ts)
export const LEVEL_NAMES = ['New', 'Learning', 'Familiar', 'Remembered', 'Retained', 'Mastered']
export const STARTING_POOL = 6     // entries met may exceed the number of entries at level >= 1 by at most this much
export const MAX_LEARNING = 4      // never introduce a new entry while this many are still at level 0
export const MIN_KNOWN = 3         // a fight needs a few known entries to ask about: a brand-new player is introduced to this many first

/** Is a delayed, maintenance or recheck review due at `now` (ms)? Relearning is not a review. */
export const isDue = (e: MasteryEntry | undefined, now: number) => !!e && standing(e, now, 0) === 'due'
export const dueCount = (m: Mastery, now: number) => Object.values(m).filter(e => isDue(e, now)).length
/** The earliest future review time among words that are not due yet, or null. */
export function nextReviewTime(m: Mastery, now: number): number | null {
  let best: number | null = null
  for (const e of Object.values(m)) if (e.due !== null && e.due > now && (best === null || e.due < best)) best = e.due
  return best
}

export const masteredCount = (m: Mastery) => Object.values(m).filter(e => e.lv >= MAX_LV).length
export const seenCount = (m: Mastery) => Object.keys(m).length

/** Damage bonus for answering a harder (higher level) question: the full bonus from Remembered on. */
export const MASTERY_DAMAGE = [0, 0.1, 0.25, 0.4, 0.4, 0.4]
