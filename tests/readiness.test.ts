// Regression: lesson completion must never grant ENTRY readiness (bug: a word inserted into a completed lesson counted as learned).
// Entry readiness = introduced and reached the curriculum's threshold now or before (peak). Lesson completion only unlocks lessons.
import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { normalizeWords } from '../src/content/entries.ts'
import type { ClozeItem, Curriculum, RawWord } from '../src/content/types.ts'
import { emptyCourse, entrySatisfied, lessonSatisfied, recordPeaks, selectIntroductions, sentencePrereqsMet, syncCourse, wordMap, type CourseState, type PeakLevels } from '../src/game/course.ts'
import { updateMastery } from '../src/game/mastery.ts'
import { sanitizeSave, withLearning } from '../src/game/save.ts'
import { parseBackup, serializeBackup } from '../src/game/backup.ts'
import type { Mastery, Saved } from '../src/game/types.ts'

const BY_ID = wordMap(WORDS)
const ALL = { maxLearning: 99, minKnown: 0, perFight: 99, startingPool: 99 }
const lv = (n: number, ok = 0) => ({ lv: n, ok })
type Intro = string | { entryId: string; prerequisiteEntries?: string[] }
const curr = (id: string, version: number, lessons: [string, Intro[], string[]?][], minLevel = 1): Curriculum => ({
  id, version, title: id, readiness: { minLevel },
  units: [{ id: 'u', title: 'Unit', lessons: lessons.map(([lid, intros, pre]) => ({ id: lid, title: lid, prerequisiteLessons: pre ?? [], introductions: intros.map(e => (typeof e === 'string' ? { entryId: e } : e)) })) }]
})
// version 1: lesson A teaches 我. Version 2 inserts 你 into A, and lesson B has a word that explicitly requires 你.
const V1 = curr('course', 1, [['a', ['我']], ['b', ['他'], ['a']]])
const V2 = curr('course', 2, [['a', ['我', '你']], ['b', ['他', { entryId: '朋友', prerequisiteEntries: ['你'] }], ['a']]])
const SENTENCE = { prerequisiteEntries: ['你'] } as Pick<ClozeItem, 'prerequisiteEntries'>
const stateOf = (s: Saved, c: Curriculum): CourseState => ({ curriculum: c, mastery: s.mastery, progress: s.courses[c.id] ?? emptyCourse(), words: BY_ID, peak: s.peak })
/** A save after learning, as the app keeps it: every mastery change goes through withLearning. */
const learn = (s: Saved, c: Curriculum, id: string, correct: boolean) => withLearning({ ...s, mastery: updateMastery(s.mastery, id, correct) }, c, BY_ID)
const fresh = (): Saved => sanitizeSave(null, WORDS, [])

/** Learner who completed lesson A of version 1 (我 at level 1), then the content updates to version 2. */
function afterUpdate(): Saved {
  let s = fresh()
  s = learn(s, V1, '我', true); s = learn(s, V1, '我', true); s = learn(s, V1, '我', true)   // intro, then two right answers -> level 1
  assert.deepEqual(s.courses.course.completed, ['a'])
  return withLearning(s, V2, BY_ID)
}

test('1, 7: a word inserted into a completed lesson is an unsatisfied prerequisite while unseen; the lesson stays completed', () => {
  const s = afterUpdate()
  const st = stateOf(s, V2)
  assert.equal(entrySatisfied(st, '你'), false, 'the reproduced bug: this used to be true')
  assert.equal(lessonSatisfied(st, 'a'), true, 'lesson A is still completed, so lesson B stays unlocked')
  assert.deepEqual(s.courses.course.completed, ['a'])
  assert.equal(sentencePrereqsMet(SENTENCE, st), false)
})

test('2-7: introducing alone is not enough; reaching the threshold satisfies; a later mistake does not revoke it', () => {
  let s = afterUpdate()
  // the next introductions: 你 (new in A), 他 (B); 朋友 waits for 你
  assert.deepEqual(selectIntroductions(stateOf(s, V2), ALL).ids, ['你', '他'])
  s = learn(s, V2, '你', true); s = learn(s, V2, '他', true)   // introduction cards seen
  assert.equal(entrySatisfied(stateOf(s, V2), '你'), false, 'seeing the introduction card does not grant readiness')
  assert.equal(sentencePrereqsMet(SENTENCE, stateOf(s, V2)), false, 'the sentence stays blocked')
  let plan = selectIntroductions(stateOf(s, V2), ALL)
  assert.deepEqual(plan.ids, [], '朋友 stays blocked'); assert.equal(plan.reason, 'prerequisites'); assert.match(plan.detail, /朋友.*waits for 你/)
  s = learn(s, V2, '你', true)
  assert.equal(entrySatisfied(stateOf(s, V2), '你'), false, 'one right answer (practiced) is still below level 1')
  s = learn(s, V2, '你', true)   // level 1 = the configured threshold
  assert.equal(s.mastery.你.lv, 1); assert.equal(s.peak.你, 1)
  assert.equal(entrySatisfied(stateOf(s, V2), '你'), true)
  assert.equal(sentencePrereqsMet(SENTENCE, stateOf(s, V2)), true)
  assert.deepEqual(selectIntroductions(stateOf(s, V2), ALL).ids, ['朋友'])
  s = learn(s, V2, '你', false)   // a mistake: back to level 0
  assert.equal(s.mastery.你.lv, 0); assert.equal(s.peak.你, 1, 'the peak never goes down')
  assert.equal(entrySatisfied(stateOf(s, V2), '你'), true, 'earned readiness is not revoked')
  assert.equal(sentencePrereqsMet(SENTENCE, stateOf(s, V2)), true)
  assert.ok(s.courses.course.completed.includes('a'), 'lesson A completed throughout')
})

test('8: reordering lessons or moving entries neither fabricates nor erases readiness', () => {
  let s = afterUpdate()
  s = learn(s, V2, '他', true); s = learn(s, V2, '他', true); s = learn(s, V2, '他', true); s = learn(s, V2, '他', false)   // 他: peak 1, now 0
  // version 3: lessons swapped, 你 (unseen) moved into the completed lesson B... and 他 moved into A
  const V3 = curr('course', 3, [['b', ['你', '朋友']], ['a', ['我', '他']]])
  s = withLearning(s, V3, BY_ID)
  const st = stateOf(s, V3)
  assert.equal(entrySatisfied(st, '你'), false, 'moving an unseen entry into a completed lesson does not make it ready')
  assert.equal(entrySatisfied(st, '他'), true, 'readiness earned under another lesson is kept (keyed by entry id)')
  assert.equal(entrySatisfied(st, '我'), true)
  assert.ok(s.courses.course.completed.includes('a'), 'completion is by lesson id, whatever the order')
  assert.ok(!s.courses.course.completed.includes('b'), 'lesson b (with unseen 你 now) is not completed by the move')
  assert.equal(s.peak.你, undefined)
})

test('9: old saves migrate without losing progress and without granting readiness to unseen or lesson-only entries', () => {
  const v3 = {
    version: 3, meta: { gold: 77, upgrades: ['W1'], bestFloor: 3, runs: 5 },
    mastery: { 我: lv(0), 他: lv(2), 大: lv(1, 1) }, legacyMastery: { 龙: lv(3) },
    run: { floor: 1, kill: 0, kills: 0, level: 2, xp: 0, hp: 20, enemyHp: 10, gold: 9, potions: 1, gear: ['Copper Blade'], loadout: { Weapon: 'Copper Blade' }, streak: 0, hintsLeft: 0, secondLeft: 0, phase: 'fighting', reward: { xp: 0, gold: 0, loot: '', levelUps: 0 } },
    lastRun: null, habit: { correct: 40 },
    courses: { course: { version: 1, completed: ['a'] }, gone: { version: 2, completed: ['x'] } }
  }
  const s = sanitizeSave(v3, WORDS, [V2])
  assert.equal(s.version, 4)
  assert.deepEqual(s.mastery, v3.mastery); assert.deepEqual(s.legacyMastery, v3.legacyMastery)
  assert.deepEqual(s.meta, v3.meta); assert.deepEqual(s.run?.gear, ['Copper Blade']); assert.equal(s.run?.gold, 9); assert.equal(s.habit.correct, 40)
  assert.deepEqual(s.courses.gone, { version: 2, completed: ['x'] }, 'recoverable progress for unknown curricula is kept')
  assert.ok(s.courses.course.completed.includes('a'), 'completed lessons are preserved: the course is not relocked')
  assert.deepEqual(s.peak, { 他: 2, 大: 1 }, 'peaks derived from the current levels only (no history in old saves; level 0 needs no entry)')
  const st = stateOf(s, V2)
  assert.equal(entrySatisfied(st, '他'), true, 'current level is evidence')
  assert.equal(entrySatisfied(st, '我'), false, 'conservative: 我 is in completed lesson A, but its readiness cannot be proven, so it must be re-earned')
  assert.equal(entrySatisfied(st, '你'), false, 'unseen: never ready')
  assert.equal(lessonSatisfied(st, 'a'), true)
  // a peak without an introduction (corrupt / foreign data) never makes an unseen entry ready
  const odd = sanitizeSave({ ...v3, peak: { 你: 4 } }, WORDS, [V2])
  assert.equal(odd.peak.你, 4, 'kept (recoverable)'); assert.equal(entrySatisfied(stateOf(odd, V2), '你'), false)
  // v2 saves (no courses, no peaks) too
  const v2 = sanitizeSave({ version: 2, meta: {}, mastery: { 我: lv(1), 你: lv(0, 1) } }, WORDS, [V2])
  assert.deepEqual(v2.peak, { 我: 1 }); assert.equal(entrySatisfied(stateOf(v2, V2), '你'), false)
  // garbage peaks are cleaned, and a peak below the current level is raised
  const junk = sanitizeSave({ version: 4, meta: {}, mastery: { 我: lv(3) }, peak: { 我: 1, 他: 'x', 大: 99, 小: -2 } }, WORDS, [])
  assert.deepEqual(junk.peak, { 我: 3, 大: 4, 小: 0 })
})

test('10: thresholds are per curriculum: level-1 readiness does not satisfy a curriculum that requires level 2', () => {
  const easy = curr('easy', 1, [['a', ['你']], ['b', [{ entryId: '朋友', prerequisiteEntries: ['你'] }]]], 1)
  const strict = curr('strict', 1, [['a', ['你']], ['b', [{ entryId: '朋友', prerequisiteEntries: ['你'] }]]], 2)
  const m: Mastery = { 你: lv(0) }
  const peak1: PeakLevels = { 你: 1 }   // reached level 1 once, now back to 0
  const st = (c: Curriculum, peak: PeakLevels): CourseState => ({ curriculum: c, mastery: m, progress: emptyCourse(), words: BY_ID, peak })
  assert.equal(entrySatisfied(st(easy, peak1), '你'), true)
  assert.equal(entrySatisfied(st(strict, peak1), '你'), false)
  assert.deepEqual(selectIntroductions(st(strict, peak1), ALL).ids, [], 'strict course keeps 朋友 blocked')
  assert.deepEqual(syncCourse(easy, m, emptyCourse(), BY_ID, peak1).completed, ['a'])
  assert.deepEqual(syncCourse(strict, m, emptyCourse(), BY_ID, peak1).completed, [], 'lesson readiness uses the same rule and threshold')
  assert.equal(entrySatisfied(st(strict, { 你: 2 }), '你'), true)
  // one save, two curricula: the same peak is judged by each curriculum's own threshold
  let s = fresh()
  for (let k = 0; k < 3; k++) s = learn(s, easy, '你', true)
  s = withLearning(s, strict, BY_ID)
  assert.deepEqual(s.courses.easy.completed, ['a']); assert.deepEqual(s.courses.strict.completed, [])
})

test('11: entry aliases move readiness with progress; removed entries park it; backups round-trip it', () => {
  const raw = (over: Partial<RawWord> & { hanzi: string; pinyin: string; meaning: string }): RawWord => ({ group: 'g', note: 'n', ...over })
  const renamed = normalizeWords([raw({ id: 'ni-you', hanzi: '你', pinyin: 'nǐ', meaning: 'you', aliases: ['你'] }), raw({ hanzi: '我', pinyin: 'wǒ', meaning: 'I' })])
  const s = sanitizeSave({ version: 4, meta: {}, mastery: { 你: lv(0), 龙: lv(1) }, peak: { 你: 2, 龙: 3 } }, renamed, [])
  assert.deepEqual(s.mastery, { 'ni-you': lv(0) }); assert.deepEqual(s.peak, { 'ni-you': 2 }, 'the peak follows the alias, like mastery')
  assert.deepEqual(s.legacyMastery, { 龙: lv(1) }); assert.deepEqual(s.legacyPeak, { 龙: 3 }, 'removed entry: parked, not deleted')
  const back = normalizeWords([...renamed, raw({ hanzi: '龙', pinyin: 'lóng', meaning: 'dragon' })])
  const again = sanitizeSave(s, back, [])
  assert.equal(again.peak.龙, 3); assert.deepEqual(again.legacyPeak, {}, 'recovered when the entry returns')
  // backup export / import keeps peaks and therefore earned readiness
  let game = afterUpdate()
  for (const ok of [true, true, true, false]) game = learn(game, V2, '你', ok)   // 你: earned level 1, then a mistake
  const restored = parseBackup(serializeBackup(game))!
  assert.ok(restored)
  const reloaded = sanitizeSave(restored, WORDS, [V2])
  assert.deepEqual(reloaded.peak, game.peak)
  assert.equal(entrySatisfied(stateOf(reloaded, V2), '你'), true)
  assert.ok(reloaded.courses.course.completed.includes('a'))
  assert.equal(recordPeaks(reloaded.peak, reloaded.mastery), reloaded.peak, 'nothing to update after a round trip')
})
