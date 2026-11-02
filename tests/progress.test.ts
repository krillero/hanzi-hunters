import test from 'node:test'
import assert from 'node:assert/strict'
import { shortTermProgress } from '../src/game/progress.ts'
import type { CourseStatus } from '../src/game/course.ts'

const course = (o: Partial<CourseStatus>): CourseStatus => ({ title: 'C', provisional: false, lesson: { number: 3 } as CourseStatus['lesson'], introduced: 4, total: 6, ready: 2, required: 6, lessonsCompleted: 2, lessonsTotal: 20, courseIntroduced: 20, courseTotal: 100, complete: false, ...o })
const T = '2026-11-02'

test('short-term progress: Familiar words, how many got there today, and words one step away', () => {
  const m = { a: { lv: 2, ok: 0, at: T }, b: { lv: 3, ok: 0, at: '2026-11-01' }, c: { lv: 1, ok: 1, at: T }, d: { lv: 0, ok: 0, at: T } }
  const p = shortTermProgress(m, course({}), T)
  assert.equal(p.familiar, 2); assert.equal(p.familiarToday, 1); assert.equal(p.almost, 1)
})

test('the next milestone is the nearest one: finish the lesson, then its new words, then words close to Familiar', () => {
  assert.equal(shortTermProgress({}, course({}), T).next, '4 more words to practise to finish lesson 3')
  assert.equal(shortTermProgress({}, course({ ready: 5 }), T).next, '1 more word to practise to finish lesson 3')
  assert.equal(shortTermProgress({}, course({ ready: 6 }), T).next, '2 new words waiting in lesson 3')
  const done = course({ lesson: null, ready: 6, introduced: 6 })
  assert.equal(shortTermProgress({ a: { lv: 1, ok: 0 } }, done, T).next, '1 word one step from Familiar')
  assert.match(shortTermProgress({ a: { lv: 3, ok: 0 } }, done, T).next, /Keep reviewing/)
  assert.equal(shortTermProgress({ a: { lv: 5, ok: 0 } }, done, T).next, 'Every word you have met is mastered')
})
