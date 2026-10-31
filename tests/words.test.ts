import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { RECENT_PENALTY, selectReview } from '../src/game/course.ts'
import { sanitizeHabit } from '../src/game/habit.ts'
import type { Mastery } from '../src/game/types.ts'

test('recently asked words come back less often, but still can', () => {
  const m: Mastery = Object.fromEntries(WORDS.slice(0, 10).map(w => [w.id, { lv: 2, ok: 0 }]))
  let s = 7; const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const recent = [WORDS[1].id, WORDS[2].id, WORDS[3].id]
  const count = (r: string[]) => { const c: Record<string, number> = {}; for (let k = 0; k < 4000; k++) { const id = selectReview(WORDS, m, { currentId: WORDS[0].id, rng, recent: r })!.id; c[id] = (c[id] ?? 0) + 1 } return c }
  const plain = count([]), pen = count(recent)
  for (const id of recent) { assert.ok(pen[id] < plain[id] * 0.5, `${id} is asked clearly less right after being asked`); assert.ok(pen[id] > 0, 'but not never') }
  assert.equal(RECENT_PENALTY.every(p => p > 0 && p < 1), true)
  // a pool of one word still works
  assert.equal(selectReview([WORDS[0], WORDS[1]], { [WORDS[1].id]: { lv: 1, ok: 0 } }, { currentId: WORDS[0].id, rng, recent: [WORDS[1].id] })!.id, WORDS[1].id)
})

test('weak entries are reviewed more than long-term mastered ones', () => {
  const m: Mastery = Object.fromEntries(WORDS.slice(0, 6).map((w, i) => [w.id, { lv: i === 0 ? 4 : 1, ok: 0 }]))
  let hits = 0
  for (let i = 0; i < 3000; i++) if (selectReview(WORDS, m)!.id === WORDS[0].id) hits++
  assert.ok(hits / 3000 < 0.1, `mastered word asked ${(hits / 30).toFixed(1)}%`)
})

test('habit seed is still validated (kept for old saves; no longer used for word order)', () => {
  assert.equal(sanitizeHabit({}).seed, 0); assert.equal(sanitizeHabit({ seed: 42.9 }).seed, 42)
  assert.equal(sanitizeHabit({ seed: 'x' }).seed, 0); assert.equal(sanitizeHabit({ seed: -5 }).seed, 0)
})
