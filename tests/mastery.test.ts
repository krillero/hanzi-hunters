import test from 'node:test'
import assert from 'node:assert/strict'
import { LEVEL_NAMES, MAX_LEARNING, MAX_LV, MIN_KNOWN, RETENTION_DAYS, SESSION_LV, STARTING_POOL, daysBetween, daysUntilDue, dueCount, isDue, masteredCount, updateMastery } from '../src/game/mastery.ts'
import { DUE_PER_FIGHT, introCapacity, selectReview } from '../src/game/course.ts'
import { WORDS } from '../src/data.ts'
import type { Mastery } from '../src/game/types.ts'

const D1 = '2026-11-01'
const after = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000).toISOString().slice(0, 10)

test('first exposure creates an entry without credit, even when answered correctly, dated today', () => {
  assert.deepEqual(updateMastery({}, '人', true, D1), { 人: { lv: 0, ok: 0, at: D1 } })
  assert.deepEqual(updateMastery({}, '人', false, D1), { 人: { lv: 0, ok: 0, at: D1 } })
})

test('session levels: two correct in a row promote up to Familiar; a miss demotes one level and clears progress', () => {
  let m = updateMastery({}, '人', true, D1)
  m = updateMastery(m, '人', true, D1); assert.deepEqual(m['人'], { lv: 0, ok: 1, at: D1 })
  m = updateMastery(m, '人', true, D1); assert.deepEqual(m['人'], { lv: 1, ok: 0, at: D1 })
  m = updateMastery(m, '人', true, D1); m = updateMastery(m, '人', false, D1); assert.deepEqual(m['人'], { lv: 0, ok: 0, at: D1 })
  m = updateMastery(m, '人', false, D1); assert.equal(m['人'].lv, 0, 'never below 0')
  for (let i = 0; i < 20; i++) m = updateMastery(m, '人', true, D1)
  assert.equal(m['人'].lv, SESSION_LV, 'a single day never gets past Familiar, however many right answers')
})

test('time-gated levels: one right answer after 1, 3 and 7 days promotes; earlier right answers are practice only', () => {
  let m: Mastery = { 人: { lv: SESSION_LV, ok: 0, at: D1 } }
  assert.deepEqual(RETENTION_DAYS, [1, 3, 7])
  assert.equal(isDue(m['人'], D1), false); assert.equal(daysUntilDue(m['人'], D1), 1)
  m = updateMastery(m, '人', true, D1); assert.equal(m['人'].lv, 2, 'same day: no promotion')
  m = updateMastery(m, '人', true, after(1)); assert.deepEqual(m['人'], { lv: 3, ok: 0, at: after(1) })
  m = updateMastery(m, '人', true, after(3)); assert.equal(m['人'].lv, 3, 'only 2 days at Remembered')
  m = updateMastery(m, '人', true, after(4)); assert.equal(m['人'].lv, 4)
  assert.equal(daysUntilDue(m['人'], after(4)), 7)
  m = updateMastery(m, '人', true, after(11)); assert.equal(m['人'].lv, MAX_LV); assert.equal(masteredCount(m), 1)
  assert.equal(isDue(m['人'], after(400)), false, 'mastered words have no further step')
  m = updateMastery(m, '人', true, after(400)); assert.equal(m['人'].lv, MAX_LV)
})

test('a long gap still promotes one level only; a miss drops one level and restarts its wait', () => {
  let m: Mastery = { 人: { lv: 3, ok: 0, at: D1 } }
  m = updateMastery(m, '人', true, after(60)); assert.equal(m['人'].lv, 4, 'one level, however overdue')
  m = updateMastery(m, '人', false, after(61)); assert.deepEqual(m['人'], { lv: 3, ok: 0, at: after(61) })
  assert.equal(daysUntilDue(m['人'], after(61)), 3, 'the wait for Retained starts again')
  m = { 人: { lv: MAX_LV, ok: 0, at: D1 } }
  m = updateMastery(m, '人', false, after(30)); assert.equal(m['人'].lv, MAX_LV - 1, 'even a mastered word drops only one level')
})

test('due words are counted; entries saved before time-gated levels (no date) count as due', () => {
  const m: Mastery = { a: { lv: 2, ok: 0, at: D1 }, b: { lv: 3, ok: 0, at: D1 }, c: { lv: 4, ok: 0 }, d: { lv: 1, ok: 0, at: D1 }, e: { lv: 5, ok: 0, at: D1 } }
  assert.equal(dueCount(m, D1), 1, 'only c (old entry, no date)')
  assert.equal(dueCount(m, after(1)), 2, 'a (1 day) and c')
  assert.equal(dueCount(m, after(3)), 3, 'b too after 3 days')
  assert.equal(daysBetween(undefined, D1), Infinity); assert.equal(daysBetween('2026-10-31', D1), 1)
  assert.equal(LEVEL_NAMES.length, MAX_LV + 1)
})

test('introduction capacity keeps the old limits: 3 to start, then one per fight, none while 4 are at level 0, pool cap', () => {
  const lvs = (...l: number[]): Mastery => Object.fromEntries(l.map((lv, i) => [`e${i}`, { lv, ok: 0 }]))
  assert.equal(introCapacity({}), MIN_KNOWN, 'a brand-new player is introduced to three entries')
  assert.equal(introCapacity(lvs(0, 0, 0)), 1, 'then one per fight')
  assert.equal(introCapacity(lvs(0, 0, 0, 0)), 0, `${MAX_LEARNING} entries still at level 0: wait`)
  assert.equal(introCapacity(lvs(1, 0, 0, 0)), 1, 'a level-1 entry frees a slot')
  assert.equal(introCapacity(lvs(...Array(STARTING_POOL + 2).fill(1), 0, 0)), 1)
  assert.equal(introCapacity(lvs(0, 0, 0), { maxLearning: 9, minKnown: 3, perFight: 1, startingPool: 3 }), 0, 'pool cap: met entries may exceed level-1 entries by at most startingPool')
})

test('reviews favour due words, at most DUE_PER_FIGHT per fight; a capped due word is still the last resort', () => {
  const ids = ['人', '大', '小']
  const words = WORDS.filter(w => ids.includes(w.id))
  const m: Mastery = { 人: { lv: 2, ok: 0, at: D1 }, 大: { lv: 0, ok: 0, at: D1 }, 小: { lv: 1, ok: 0, at: D1 } }
  const today = after(1)   // 人 is due (Familiar for a day); 大 and 小 are still being learned
  let s = 0.37; const rng = () => (s = (s * 9301 + 0.49297) % 1)
  const share = (o: object) => { let n = 0; for (let i = 0; i < 600; i++) if (selectReview(words, m, { rng, today, ...o })!.id === '人') n++; return n / 600 }
  assert.ok(share({}) > 0.45, `due word favoured (${share({})})`)
  assert.equal(share({ dueCapped: true }), 0, 'capped: never picked while other words exist')
  assert.equal(selectReview(words.filter(w => w.id === '人'), m, { rng, today, dueCapped: true })!.id, '人', 'only due words left: still asked')
  assert.equal(DUE_PER_FIGHT, 2)
})
