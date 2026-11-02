// What to tell the player about an entry's schedule, in plain words. Pure: derived from timestamps only (see schedule.ts).
import type { Mastery, MasteryEntry } from './types.ts'
import { INITIAL_SUCCESS_TARGET, MAX_LV, formatWait } from './schedule.ts'
import { isDue } from './mastery.ts'

export type Tag = 'review' | 'maintenance' | 'practise' | null
export type EntryStatus = { tag: Tag; /** short line for the wordbook and screen readers */ text: string }

export function entryStatus(e: MasteryEntry, now: number): EntryStatus {
  if (e.rel === 'relearn') return { tag: 'practise', text: "Let's practice this again" }
  if (e.ok < INITIAL_SUCCESS_TARGET) return { tag: null, text: `${e.ok}/${INITIAL_SUCCESS_TARGET} spaced practices` }
  if (isDue(e, now)) return { tag: e.lv >= MAX_LV ? 'maintenance' : 'review', text: e.lv >= MAX_LV ? 'Maintenance due' : 'Review due' }
  const wait = e.due === null ? '' : formatWait(e.due - now)
  const next = e.lv >= MAX_LV ? `Next maintenance ${wait}` : `Next check ${wait}`
  return { tag: null, text: e.rel === 'recheck' ? `Recovering · ${next.toLowerCase()}` : next }
}

/** Counts for the camp screen: reviews due now (of which maintenance), words to practise again, and when the next review comes. */
export function reviewSummary(m: Mastery, now: number) {
  let due = 0, maintenance = 0, practise = 0, nextAt: number | null = null
  for (const e of Object.values(m)) {
    if (e.rel === 'relearn') practise++
    else if (isDue(e, now)) { due++; if (e.lv >= MAX_LV) maintenance++ }
    else if (e.due !== null && e.due > now && (nextAt === null || e.due < nextAt)) nextAt = e.due
  }
  return { due, maintenance, practise, nextAt }
}

/** "3 words ready for review (1 maintenance)" / "Maintenance due: 2 words" / "Next word review in 2 days" / null. */
export function reviewLine(m: Mastery, now: number): string | null {
  const { due, maintenance, practise, nextAt } = reviewSummary(m, now)
  const words = (n: number) => `${n} word${n === 1 ? '' : 's'}`
  if (due > 0) return maintenance === due ? `Maintenance due: ${words(due)}` : `${words(due)} ready for review${maintenance ? ` (${maintenance} maintenance)` : ''}`
  if (practise > 0) return `${words(practise)} to practice again`
  return nextAt !== null ? `Next word review ${formatWait(nextAt - now)}` : null
}
