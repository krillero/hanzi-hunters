// Test helper (not a test file): a simulated clock for the spaced scheduler. `learn` answers one question about an entry the way
// the old updateMastery did in tests: the first call introduces (no credit), later calls are unassisted meaning answers after a
// 20 minute break (so spacing is always satisfied) and do not skip the 24 h wait of delayed reviews.
import { LONG_BREAK_MS, introduce, recordAnswer } from '../src/game/schedule.ts'
import type { Mastery } from '../src/game/types.ts'

let now = Date.UTC(2026, 10, 1, 12), seq = 0
export const clockNow = () => now
export const advance = (ms: number) => { now += ms }
export function learn(m: Mastery, id: string, correct = true): Mastery {
  if (!m[id]) return { ...m, [id]: introduce(now, seq) }
  now += LONG_BREAK_MS; seq++
  return { ...m, [id]: recordAnswer(m[id], { correct, assisted: false, kind: 'meaning', promotes: true, now, seq }).entry }
}

/** `{ id: level }` of a mastery map, for assertions about levels (the entries also carry scheduling data). */
export const levels = (m: Mastery) => Object.fromEntries(Object.entries(m).map(([k, e]) => [k, e.lv]))
