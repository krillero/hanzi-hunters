// Gentle long-term progress: days played and correct-answer total.
// Pure; no DOM. Nothing here can be lost by missing a day (a tally, never a streak).

export type Habit = {
  daysPlayed: number
  lastPlayed: string      // local date YYYY-MM-DD, '' = never
  warmupDay: string       // no longer used (the daily warm-up was removed); kept so older saves round-trip unchanged
  correct: number         // lifetime correct answers
  bosses: number          // bosses defeated
  bossesMet: string[]     // boss types whose intro card has been shown (later floors skip it)
  seed: number            // shuffles the order new words are introduced in (0 = the file's order; a fresh profile gets a random one)
  tipsSeen: string[]      // words whose 💡 button has already pulsed once
  badges: string[]        // no longer used (milestone badges were removed); kept so older saves round-trip unchanged
}
export const emptyHabit = (): Habit => ({ daysPlayed: 0, lastPlayed: '', warmupDay: '', correct: 0, bosses: 0, bossesMet: [], seed: 0, tipsSeen: [], badges: [] })

const DAY = /^\d{4}-\d{2}-\d{2}$/
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0)

export function sanitizeHabit(raw: unknown): Habit {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : '')
  const badges = Array.isArray(r.badges) ? [...new Set(r.badges.filter((b): b is string => typeof b === 'string' && b.length > 0 && b.length <= 40))].slice(0, 50) : []
  const tipsSeen = Array.isArray(r.tipsSeen) ? [...new Set(r.tipsSeen.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 4))].slice(0, 500) : []
  const bossesMet = Array.isArray(r.bossesMet) ? [...new Set(r.bossesMet.filter((b): b is string => typeof b === 'string' && /^[a-z]{1,12}$/.test(b)))].slice(0, 20) : []
  return { daysPlayed: int(r.daysPlayed, 1e6), lastPlayed: day(r.lastPlayed), warmupDay: day(r.warmupDay), correct: int(r.correct, 1e9), bosses: int(r.bosses, 1e6), bossesMet, seed: int(r.seed, 2147483647), tipsSeen, badges }
}

/** Local calendar day, e.g. 2026-10-31 (the player's own clock, not UTC). */
export const localDay = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Counts a day the first time the player answers on it. Never decreases, whatever the gap or clock changes. */
export const recordPlay = (h: Habit, today: string): Habit => (h.lastPlayed === today ? h : { ...h, daysPlayed: h.daysPlayed + 1, lastPlayed: today })
export const recordCorrect = (h: Habit, n = 1): Habit => ({ ...h, correct: Math.min(1e9, h.correct + n) })

/** A fresh profile's word-order seed (never 0, which means "file order"). */
export const newSeed = () => 1 + Math.floor(Math.random() * 2147483646)
