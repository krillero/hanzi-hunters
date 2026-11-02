import test from 'node:test'
import assert from 'node:assert/strict'
import { DUE_PER_FIGHT, SCHEDULE_PRIORITY, selectReview } from '../src/game/course.ts'
import { WORDS } from '../src/data.ts'
import { entryAtLevel, introduce, recordAnswer, type SchedEntry } from '../src/game/schedule.ts'
import type { Mastery } from '../src/game/types.ts'

const T = Date.UTC(2026, 10, 1, 12), H = 3_600_000, MIN = 60_000
const [A, B, C, D, E] = WORDS.slice(0, 5).map(w => w.id)
const pickMany = (m: Mastery, o: Parameters<typeof selectReview>[2], n = 60) => { const out = new Set<string>(); for (let i = 0; i < n; i++) out.add(selectReview(WORDS, m, { ...o, rng: Math.random })!.id); return out }
/** relearning with its gap met: failed at T, now 10 min later */
const relearning = (): SchedEntry => recordAnswer({ ...entryAtLevel(3, T), due: T + 72 * H }, { correct: false, assisted: false, dim: 'meaning', now: T, seq: 1 }).entry

test('priority: relearning, then due reviews, then initial learning, then everything else', () => {
  assert.deepEqual(SCHEDULE_PRIORITY, ['relearn', 'due', 'initial', 'other'])
  const now = T + 10 * MIN, seq = 10
  const m: Mastery = { [A]: relearning(), [B]: { ...entryAtLevel(3, T - 80 * H), due: T }, [C]: introduce(T - 5 * MIN, 0), [D]: { ...entryAtLevel(3, T), due: T + 50 * H } }
  assert.deepEqual([...pickMany(m, { now, seq })], [A], 'relearning first')
  assert.deepEqual([...pickMany({ ...m, [A]: m[B] }, { now, seq })].sort(), [A, B].sort(), 'then the due review')
  assert.deepEqual([...pickMany({ [C]: m[C], [D]: m[D] }, { now, seq })], [C], 'then initial learning whose gap is met')
  assert.deepEqual([...pickMany({ [D]: m[D], [E]: { ...entryAtLevel(4, T), due: T + 50 * H } }, { now: T + MIN, seq })].sort(), [D, E].sort(), 'otherwise ordinary review of known words')
})

test('entries that cannot earn credit yet are still practised when nothing qualifies', () => {
  const m: Mastery = { [A]: introduce(T, 0), [B]: introduce(T, 0) }
  assert.equal(selectReview(WORDS, m, { now: T + 1000, seq: 1 }) !== null, true)
})

test('the due cap holds: capped due words give way to the next tier, and are used only when nothing else exists', () => {
  const due = (id: string): [string, SchedEntry] => [id, { ...entryAtLevel(3, T - 80 * H), due: T }]
  const m: Mastery = { ...Object.fromEntries([A, B].map(due)), [C]: { ...entryAtLevel(4, T), due: T + 50 * H } }
  assert.deepEqual([...pickMany(m, { now: T + H, seq: 5, dueCapped: true })], [C])
  assert.deepEqual([...pickMany(Object.fromEntries([A, B].map(due)), { now: T + H, seq: 5, dueCapped: true })].sort(), [A, B].sort(), 'nothing else known: still answers')
  assert.ok(DUE_PER_FIGHT >= 1)
})

test('the entry just asked is avoided, and a filter that removes every candidate returns null instead of looping', () => {
  const m: Mastery = { [A]: relearning(), [B]: relearning() }
  for (let i = 0; i < 40; i++) assert.equal(selectReview(WORDS, m, { now: T + 10 * MIN, seq: 9, currentId: A })!.id, B)
  assert.equal(selectReview(WORDS, m, { now: T + 10 * MIN, seq: 9, filter: () => false }), null)
  assert.equal(selectReview(WORDS, {}, { now: T, seq: 1 }), null)
})

test('a just-failed entry waits for other answers before it comes back (no repeat of the same failing item)', () => {
  const m: Mastery = { [A]: relearning(), [B]: { ...entryAtLevel(3, T - 80 * H), due: T } }   // B is due
  assert.deepEqual([...pickMany(m, { now: T + 5 * MIN, seq: 2 })], [B], 'seq 2 follows the failure at seq 1 directly: no other answers yet')
  assert.deepEqual([...pickMany(m, { now: T + 5 * MIN, seq: 4 })], [A], 'after two other answers and 30 s it is asked again')
})

test('without now and seq the old weights decide (callers that do not schedule keep working)', () => {
  const m: Mastery = { [A]: entryAtLevel(0), [B]: entryAtLevel(5) }
  assert.ok(pickMany(m, {}, 200).size === 2)
})
