// Gentle long-term progress: days played, correct-answer total, milestone badges and the optional daily warm-up.
// Pure; no DOM. Nothing here can be lost by missing a day (a tally, never a streak).
import type { Mastery } from './types.ts'
import { MAX_LV } from './mastery.ts'

export type Habit = {
  daysPlayed: number
  lastPlayed: string      // local date YYYY-MM-DD, '' = never
  warmupDay: string       // local date of the last finished warm-up, '' = never
  correct: number         // lifetime correct answers (battle + warm-up)
  bosses: number          // bosses defeated
  bossesMet: string[]     // boss types whose intro card has been shown (later floors skip it)
  seed: number            // shuffles the order new words are introduced in (0 = the file's order; a fresh profile gets a random one)
  tipsSeen: string[]      // words whose 💡 button has already pulsed once
  badges: string[]
}
export const emptyHabit = (): Habit => ({ daysPlayed: 0, lastPlayed: '', warmupDay: '', correct: 0, bosses: 0, bossesMet: [], seed: 0, tipsSeen: [], badges: [] })

const DAY = /^\d{4}-\d{2}-\d{2}$/
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0)

export function sanitizeHabit(raw: unknown): Habit {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : '')
  const known = new Set(BADGES.map(b => b.id))
  const badges = Array.isArray(r.badges) ? [...new Set(r.badges.filter((b): b is string => typeof b === 'string' && known.has(b)))] : []
  const tipsSeen = Array.isArray(r.tipsSeen) ? [...new Set(r.tipsSeen.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 4))].slice(0, 500) : []
  const bossesMet = Array.isArray(r.bossesMet) ? [...new Set(r.bossesMet.filter((b): b is string => typeof b === 'string' && /^[a-z]{1,12}$/.test(b)))].slice(0, 20) : []
  return { daysPlayed: int(r.daysPlayed, 1e6), lastPlayed: day(r.lastPlayed), warmupDay: day(r.warmupDay), correct: int(r.correct, 1e9), bosses: int(r.bosses, 1e6), bossesMet, seed: int(r.seed, 2147483647), tipsSeen, badges }
}

/** Local calendar day, e.g. 2026-10-31 (the player's own clock, not UTC). */
export const localDay = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Counts a day the first time the player answers on it. Never decreases, whatever the gap or clock changes. */
export const recordPlay = (h: Habit, today: string): Habit => (h.lastPlayed === today ? h : { ...h, daysPlayed: h.daysPlayed + 1, lastPlayed: today })
export const recordCorrect = (h: Habit, n = 1): Habit => ({ ...h, correct: Math.min(1e9, h.correct + n) })

// ---- badges --------------------------------------------------------------------------------

export type BadgeContext = { known: number; mastered: number; correct: number; bestFloor: number; runs: number; daysPlayed: number; bosses: number }
export type Badge = { id: string; name: string; icon: string; desc: string; earned: (c: BadgeContext) => boolean }

export const BADGES: Badge[] = [
  { id: 'first-mastered', name: 'First mastery', icon: '★', desc: 'Master your first word', earned: c => c.mastered >= 1 },
  { id: 'known-10', name: 'Ten words', icon: '📖', desc: 'Meet 10 different words', earned: c => c.known >= 10 },
  { id: 'known-25', name: 'Twenty-five words', icon: '📚', desc: 'Meet 25 different words', earned: c => c.known >= 25 },
  { id: 'known-50', name: 'Fifty words', icon: '🎓', desc: 'Meet 50 different words', earned: c => c.known >= 50 },
  { id: 'correct-100', name: '100 right', icon: '✔', desc: '100 correct answers', earned: c => c.correct >= 100 },
  { id: 'correct-500', name: '500 right', icon: '✅', desc: '500 correct answers', earned: c => c.correct >= 500 },
  { id: 'floor-5', name: 'Deep diver', icon: '🕳', desc: 'Reach floor 5', earned: c => c.bestFloor >= 5 },
  { id: 'floor-10', name: 'Bottomless', icon: '🌋', desc: 'Reach floor 10', earned: c => c.bestFloor >= 10 },
  { id: 'first-boss', name: 'Boss slayer', icon: '👑', desc: 'Defeat your first boss', earned: c => c.bosses >= 1 },
  { id: 'days-7', name: 'A week of study', icon: '🗓', desc: 'Play on 7 different days', earned: c => c.daysPlayed >= 7 }
]

export const badgeById = (id: string) => BADGES.find(b => b.id === id)

export const contextFor = (mastery: Mastery, h: Habit, bestFloor: number, runs: number): BadgeContext => ({
  known: Object.keys(mastery).length, mastered: Object.values(mastery).filter(e => e.lv >= MAX_LV).length,
  correct: h.correct, bestFloor, runs, daysPlayed: h.daysPlayed, bosses: h.bosses
})

/** Badges the player has just earned (not stored yet). */
export const newBadges = (h: Habit, c: BadgeContext): Badge[] => BADGES.filter(b => !h.badges.includes(b.id) && b.earned(c))

// ---- daily warm-up -------------------------------------------------------------------------

export const WARMUP_SIZE = 5
export const WARMUP_MIN_WORDS = 3

const hash = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) } return x >>> 0 }

/** Words to review today: the ones you know least (lowest level, then fewest right in a row), tie-broken by a day-stable shuffle. */
export function pickWarmup(mastery: Mastery, today: string, size = WARMUP_SIZE): string[] {
  const seen = Object.entries(mastery)
  if (seen.length < WARMUP_MIN_WORDS) return []
  return seen
    .sort(([ha, a], [hb, b]) => a.lv - b.lv || a.ok - b.ok || hash(today + ha) - hash(today + hb) || (ha < hb ? -1 : 1))
    .slice(0, size).map(([h]) => h)
}

export const warmupAvailable = (h: Habit, mastery: Mastery, today: string) => h.warmupDay !== today && pickWarmup(mastery, today).length >= WARMUP_MIN_WORDS

export const WARMUP_GOLD_PER_CORRECT = 3

/** A fresh profile's word-order seed (never 0, which means "file order"). */
export const newSeed = () => 1 + Math.floor(Math.random() * 2147483646)
