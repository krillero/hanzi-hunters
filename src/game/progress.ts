// Short-term learning progress for the camp screen: what changed recently and the next milestone within reach. Long-term mastery
// (Remembered / Retained / Mastered over days) lives in the wordbook. Pure; see tests/progress.test.ts.
import type { CourseStatus } from './course.ts'
import type { Mastery } from './types.ts'
import { MAX_LV, SESSION_LV } from './mastery.ts'

export type ShortTermProgress = {
  /** Words at Familiar or higher, and how many of them reached their level today. */
  familiar: number; familiarToday: number
  /** Words at Learning (one step from Familiar). */
  almost: number
  /** The next milestone within reach, in plain words. */
  next: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function shortTermProgress(m: Mastery, course: CourseStatus, today: string): ShortTermProgress {
  const entries = Object.values(m)
  const familiar = entries.filter(e => e.lv >= SESSION_LV).length
  const familiarToday = entries.filter(e => e.lv >= SESSION_LV && e.at === today).length
  const almost = entries.filter(e => e.lv === SESSION_LV - 1).length
  let next: string
  if (course.lesson && course.required > course.ready) next = `${plural(course.required - course.ready, 'more word')} to practise to finish lesson ${course.lesson.number}`
  else if (course.lesson && course.total > course.introduced) next = `${plural(course.total - course.introduced, 'new word')} waiting in lesson ${course.lesson.number}`
  else if (almost > 0) next = `${plural(almost, 'word')} one step from Familiar`
  else if (entries.some(e => e.lv < MAX_LV)) next = 'Keep reviewing: words grow stronger over the coming days'
  else next = 'Every word you have met is mastered'
  return { familiar, familiarToday, almost, next }
}
