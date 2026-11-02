import { entryAtLevel } from '../src/game/schedule.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { shortTermProgress } from '../src/game/progress.ts'
import type { CourseStatus } from '../src/game/course.ts'

const course = (o: Partial<CourseStatus>): CourseStatus => ({ title: 'C', provisional: false, lesson: { number: 3 } as CourseStatus['lesson'], introduced: 4, total: 6, ready: 2, required: 6, lessonsCompleted: 2, lessonsTotal: 20, courseIntroduced: 20, courseTotal: 100, complete: false, ...o })

const T = new Date(2026, 10, 2).getTime()   // local midnight today
const at = (lv: number, adv: number) => ({ ...entryAtLevel(lv), adv })

test('short-term progress: Familiar words, how many got there today, and words one step away', () => {
  const m = { a: at(2, T + 1000), b: at(3, T - 86_400_000), c: at(1, T), d: at(0, T) }
  const p = shortTermProgress(m, course({}), T)
  assert.equal(p.familiar, 2); assert.equal(p.familiarToday, 1); assert.equal(p.almost, 1)
})

test('the next milestone is the nearest one: finish the lesson, then its new words, then words close to Familiar', () => {
  assert.equal(shortTermProgress({}, course({}), T).next, '4 more words to practise to finish lesson 3')
  assert.equal(shortTermProgress({}, course({ ready: 5 }), T).next, '1 more word to practise to finish lesson 3')
  assert.equal(shortTermProgress({}, course({ ready: 6 }), T).next, '2 new words waiting in lesson 3')
  const done = course({ lesson: null, ready: 6, introduced: 6 })
  assert.equal(shortTermProgress({ a: entryAtLevel(1) }, done, T).next, '1 word one step from Familiar')
  assert.match(shortTermProgress({ a: entryAtLevel(3) }, done, T).next, /Keep reviewing/)
  assert.equal(shortTermProgress({ a: entryAtLevel(5) }, done, T).next, 'Every word you have met is mastered')
})
