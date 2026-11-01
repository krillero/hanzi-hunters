// Word mastery: pure functions, no DOM.
// Which entry is introduced next and which known entries are reviewed lives in course.ts (curriculum order, never file order).
//
// Levels 0-2 are learned within a session (2 right answers in a row per level). Levels 3-5 need time: one right answer after the
// word has waited RETENTION_DAYS since its last step (1 day for Remembered, 3 for Retained, 7 for Mastered). A right answer before
// that still counts as practice but does not promote; a miss drops one level and restarts that wait. Days are local calendar days.
import type { Mastery, MasteryEntry } from './types.ts'

export const MAX_LV = 5            // 5 = mastered: remembered after 1, 3 and 7 days. Lesson completion only needs level 1 (course.ts).
export const SESSION_LV = 2        // levels up to this one are earned within a session
export const PROMOTE_AFTER = 2     // consecutive correct answers needed to move up a session level
/** Days a word must wait at level SESSION_LV, SESSION_LV + 1, … before one right answer promotes it (to 3, 4, 5). */
export const RETENTION_DAYS = [1, 3, 7]
export const LEVEL_NAMES = ['New', 'Learning', 'Familiar', 'Remembered', 'Retained', 'Mastered']
export const STARTING_POOL = 6     // entries met may exceed the number of entries at level >= 1 by at most this much
export const MAX_LEARNING = 4      // never introduce a new entry while this many are still at level 0
export const MIN_KNOWN = 3         // a fight needs a few known entries to ask about: a brand-new player is introduced to this many first

const DAY_MS = 86_400_000
const dayNumber = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, dd || 1) / DAY_MS }
/** Whole calendar days from `from` to `to` (YYYY-MM-DD); an unknown `from` counts as long ago. */
export const daysBetween = (from: string | undefined, to: string) => (from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? Math.round(dayNumber(to) - dayNumber(from)) : Infinity)

/** Days a word at this level waits before its next (time-gated) step; null for session levels and for mastered words. */
export const waitDays = (lv: number) => (lv >= SESSION_LV && lv < MAX_LV ? RETENTION_DAYS[lv - SESSION_LV] : null)
/** Can one right answer today take this word to its next time-gated level? */
export function isDue(e: MasteryEntry | undefined, today: string): boolean {
  const wait = e ? waitDays(e.lv) : null
  return wait !== null && daysBetween(e!.at, today) >= wait
}
/** Days until the word is due (0 = due now); null when no time-gated step is ahead. */
export function daysUntilDue(e: MasteryEntry | undefined, today: string): number | null {
  const wait = e ? waitDays(e.lv) : null
  return wait === null ? null : Math.max(0, wait - daysBetween(e!.at, today))
}
export const dueCount = (m: Mastery, today: string) => Object.values(m).filter(e => isDue(e, today)).length

/**
 * First exposure creates the entry without credit. A miss drops one level and restarts its wait. A right answer: session levels
 * count 2 in a row; time-gated levels promote once the wait is over (earlier right answers are practice only).
 */
export function updateMastery(m: Mastery, id: string, correct: boolean, today: string): Mastery {
  const e = m[id]
  if (!e) return { ...m, [id]: { lv: 0, ok: 0, at: today } }
  if (!correct) return { ...m, [id]: { lv: Math.max(0, e.lv - 1), ok: 0, at: today } }
  if (e.lv >= MAX_LV) return m
  if (e.lv >= SESSION_LV) return isDue(e, today) ? { ...m, [id]: { lv: e.lv + 1, ok: 0, at: today } } : m
  const ok = e.ok + 1
  return { ...m, [id]: ok >= PROMOTE_AFTER ? { lv: e.lv + 1, ok: 0, at: today } : { ...e, ok } }
}

export const masteredCount = (m: Mastery) => Object.values(m).filter(e => e.lv >= MAX_LV).length
export const seenCount = (m: Mastery) => Object.keys(m).length

/** Damage bonus for answering a harder (higher level) question: the full bonus from Remembered on. */
export const MASTERY_DAMAGE = [0, 0.1, 0.25, 0.4, 0.4, 0.4]
