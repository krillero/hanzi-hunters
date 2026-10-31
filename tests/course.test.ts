// Curriculum ordering, readiness, review selection and course-progress migration (game/course.ts, game/save.ts).
import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVE_CURRICULUM, WORDS } from '../src/data.ts'
import type { Curriculum, Introduction, Word } from '../src/content/types.ts'
import {
  courseLine, courseStatus, emptyCourse, entrySatisfied, introCardLine, isPracticed, isReady, lessonSatisfied, orphanLessons,
  selectIntroductions, selectReview, stepsOf, syncCourse, wordMap, type CourseProgress, type CourseState
} from '../src/game/course.ts'
import { updateMastery } from '../src/game/mastery.ts'
import { sanitizeSave } from '../src/game/save.ts'
import type { Mastery } from '../src/game/types.ts'

const lcg = (seed: number) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) }
const lv = (n: number, ok = 0) => ({ lv: n, ok })
type L = { id: string; entries: (string | Introduction)[]; pre?: string[]; aliases?: string[] }
/** A small test curriculum: units of lessons, everything else defaulted. */
function course(units: [string, L[]][], over: Partial<Curriculum> = {}): Curriculum {
  return {
    id: 'test', version: 1, title: 'Test course',
    units: units.map(([id, ls]) => ({ id, title: id.toUpperCase(), lessons: ls.map(l => ({ id: l.id, title: l.id, prerequisiteLessons: l.pre ?? [], ...(l.aliases ? { aliases: l.aliases } : {}), introductions: l.entries.map(e => (typeof e === 'string' ? { entryId: e } : e)) })) })),
    ...over
  }
}
const state = (c: Curriculum, m: Mastery, p: CourseProgress = emptyCourse(), words: Word[] = WORDS): CourseState => ({ curriculum: c, mastery: m, progress: p, words: wordMap(words) })
const ALL = { maxLearning: 99, minKnown: 0, perFight: 99, startingPool: 99 }

/** Plays like the game: introductions at the start of each fight, then review questions answered right with probability `acc`. */
function play(c: Curriculum, words: Word[], seed: number, fights = 120, acc = 0.75) {
  const rng = lcg(seed), byId = wordMap(words)
  let m: Mastery = {}, p = emptyCourse()
  const order: string[] = []
  for (let f = 0; f < fights; f++) {
    for (const id of selectIntroductions({ curriculum: c, mastery: m, progress: p, words: byId }).ids) { order.push(id); m = updateMastery(m, id, true) }
    for (let q = 0; q < 4; q++) {
      const w = selectReview(words, m, { rng })
      assert.ok(w, 'something is always reviewable after the first introductions')
      assert.ok(m[w!.id], 'review never returns an unseen entry')
      m = updateMastery(m, w!.id, rng() < acc); p = syncCourse(c, m, p, byId)
    }
  }
  return { order, mastery: m, progress: p }
}

// ---- ordering --------------------------------------------------------------------------------------------

test('introduction order is the curriculum order, identical for every player (no seed, no randomness)', () => {
  const declared = stepsOf(ACTIVE_CURRICULUM).map(s => s.intro.entryId)
  const runs = [1, 2, 3, 99, 12345, 777777].map(seed => play(ACTIVE_CURRICULUM, WORDS, seed, 150, 0.5 + (seed % 5) / 10).order)
  for (const order of runs) {
    assert.ok(order.length >= Math.min(10, declared.length), `progressed through ${order.length} entries`)
    assert.deepEqual(order, declared.slice(0, order.length), 'a prefix of the declared order')
  }
})

test('reordering words.json has no effect on the teaching order', () => {
  const reversed = [...WORDS].reverse()
  const shuffled = [...WORDS].sort((a, b) => (a.pinyin < b.pinyin ? -1 : 1))
  // the same decision at every point of a long game, whatever the order of the vocabulary file
  const rng = lcg(5), byId = wordMap(WORDS)
  let m: Mastery = {}, p = emptyCourse(), checked = 0
  for (let f = 0; f < 150; f++) {
    const plans = [WORDS, reversed, shuffled].map(ws => selectIntroductions(state(ACTIVE_CURRICULUM, m, p, ws)))
    assert.deepEqual(plans[1], plans[0]); assert.deepEqual(plans[2], plans[0]); checked++
    for (const id of plans[0].ids) m = updateMastery(m, id, true)
    for (let q = 0; q < 4; q++) { const w = selectReview(WORDS, m, { rng })!; m = updateMastery(m, w.id, rng() < 0.8); p = syncCourse(ACTIVE_CURRICULUM, m, p, byId) }
  }
  assert.ok(Object.keys(m).length >= Math.min(20, stepsOf(ACTIVE_CURRICULUM).length) && checked === 150)
  // and playing with a reordered file still follows the declared order
  const declared = stepsOf(ACTIVE_CURRICULUM).map(s => s.intro.entryId)
  for (const ws of [reversed, shuffled]) { const o = play(ACTIVE_CURRICULUM, ws, 5).order; assert.deepEqual(o, declared.slice(0, o.length)) }
})

test('entries outside the curriculum are never introduced, but known ones can be reviewed', () => {
  const c = course([['u', [{ id: 'l1', entries: ['人', '大', '小'] }]]])
  const r = play(c, WORDS, 3, 60)
  assert.deepEqual(new Set(r.order), new Set(['人', '大', '小']))
  assert.equal(selectIntroductions(state(c, r.mastery, r.progress)).reason, 'complete')
  const known: Mastery = { ...r.mastery, 水: lv(2) }   // progress from another curriculum / an older save
  const seen = new Set<string>(); const rng = lcg(1)
  for (let k = 0; k < 400; k++) seen.add(selectReview(WORDS, known, { rng })!.id)
  assert.ok(seen.has('水'), 'known entries outside the active curriculum keep being reviewed')
  assert.ok([...seen].every(id => known[id]))
})

test('inside a lesson entries come strictly in order; the existing learning limits still apply', () => {
  const c = course([['u', [{ id: 'l1', entries: ['一', '二', '三', '日', '月'] }]]])
  assert.deepEqual(selectIntroductions(state(c, {})).ids, ['一', '二', '三'], 'a new learner gets three to start')
  const m3: Mastery = { 一: lv(0), 二: lv(0), 三: lv(0) }
  assert.deepEqual(selectIntroductions(state(c, m3)).ids, ['日'], 'then one per fight')
  const m4: Mastery = { ...m3, 日: lv(0) }
  const p = selectIntroductions(state(c, m4))
  assert.deepEqual(p.ids, []); assert.equal(p.reason, 'learning-limit', p.detail)
})

// ---- prerequisites and readiness ------------------------------------------------------------------------------

test('lesson prerequisites gate a lesson; readiness = every required entry at level 1 (optional entries do not count)', () => {
  const c = course([['u', [
    { id: 'a', entries: ['人', { entryId: '大', required: false }] },
    { id: 'b', entries: ['小'], pre: ['a'] },
    { id: 'c', entries: ['水'] }
  ]]])
  const m: Mastery = { 人: lv(0), 大: lv(0) }
  let plan = selectIntroductions(state(c, m), ALL)
  assert.deepEqual(plan.ids, ['水'], 'b waits for a; the next unlocked lesson (c) goes first')
  assert.equal(lessonSatisfied(state(c, m), 'a'), false)
  const ready: Mastery = { 人: lv(1), 大: lv(0) }
  assert.equal(lessonSatisfied(state(c, ready), 'a'), true, 'level 1 on required entries is enough; the optional entry is not needed')
  plan = selectIntroductions(state(c, ready), ALL)
  assert.deepEqual(plan.ids, ['小', '水'])
  // a lesson whose only entry waits: the reason is explained
  const only = course([['u', [{ id: 'a', entries: ['人'] }, { id: 'b', entries: ['小'], pre: ['a'] }]]])
  plan = selectIntroductions(state(only, { 人: lv(0) }), ALL)
  assert.equal(plan.reason, 'prerequisites'); assert.match(plan.detail, /waits for lesson\(s\) a/)
})

test('entry prerequisites are explicit: a word waits for its authored prerequisites, never for its characters', () => {
  const c = course([['u', [{ id: 'l1', entries: ['你', '好', { entryId: '你好', prerequisiteEntries: ['你'] }, '朋友'] }]]])
  const m: Mastery = { 你: lv(0), 好: lv(0) }
  let plan = selectIntroductions(state(c, m), ALL)
  assert.deepEqual(plan.ids, [], 'the lesson waits (strict order) until 你 is ready')
  assert.equal(plan.reason, 'prerequisites'); assert.match(plan.detail, /你好.*waits for 你/)
  plan = selectIntroductions(state(c, { 你: lv(1), 好: lv(0) }), ALL)
  assert.deepEqual(plan.ids, ['你好', '朋友'], '好 is not required for 你好: only declared prerequisites count')
  // a multi-character word without prerequisites does not wait for its characters at all
  const free = course([['u', [{ id: 'l1', entries: ['朋友'] }]]])
  assert.deepEqual(selectIntroductions(state(free, {}), ALL).ids, ['朋友'])
})

test('vocabulary states are distinct: introduced, practiced, ready, long-term mastered', () => {
  assert.equal(isPracticed(lv(0)), false); assert.equal(isPracticed(lv(0, 1)), true); assert.equal(isPracticed(lv(1)), true)
  assert.equal(isReady(lv(0, 1)), false); assert.equal(isReady(lv(1)), true); assert.equal(isReady(lv(1), { minLevel: 2 }), false)
  const c = course([['u', [{ id: 'l1', entries: ['人', '大'] }]]], { readiness: { minLevel: 2 } })
  assert.equal(lessonSatisfied(state(c, { 人: lv(1), 大: lv(1) }), 'l1'), false, 'the readiness rule is configurable per curriculum')
  assert.equal(lessonSatisfied(state(c, { 人: lv(2), 大: lv(3) }), 'l1'), true)
})

test('no relocking: once a lesson is completed, later mistakes send entries to review instead of locking the course', () => {
  const c = course([['u', [{ id: 'a', entries: ['人', '大'] }, { id: 'b', entries: [{ entryId: '小', prerequisiteEntries: ['人'] }], pre: ['a'] }]]])
  const ready: Mastery = { 人: lv(1), 大: lv(1) }
  const p = syncCourse(c, ready, emptyCourse())
  assert.deepEqual(p.completed, ['a'])
  let m = updateMastery(ready, '人', false); m = updateMastery(m, '大', false)
  assert.deepEqual(m, { 人: lv(0), 大: lv(0) })
  assert.deepEqual(syncCourse(c, m, p).completed, ['a'], 'completion is never removed')
  assert.equal(lessonSatisfied(state(c, m, p), 'a'), true)
  assert.equal(entrySatisfied(state(c, m, p), '人'), true, 'an entry of a completed lesson stays satisfied as a prerequisite')
  assert.deepEqual(selectIntroductions(state(c, m, p), ALL).ids, ['小'], 'lesson b stays unlocked')
  // the weak entries are what review asks most
  const known: Mastery = { ...m, 小: lv(3) }
  const rng = lcg(2); let weak = 0
  for (let k = 0; k < 2000; k++) if (selectReview(WORDS, known, { rng })!.id !== '小') weak++
  assert.ok(weak / 2000 > 0.6, `weak entries asked ${(weak / 20).toFixed(0)}%`)
})

// ---- review selection ---------------------------------------------------------------------------------------------

test('review selection never returns an unseen entry, and returns null when nothing is known', () => {
  const rng = lcg(9)
  assert.equal(selectReview(WORDS, {}), null)
  for (let k = 0; k < 300; k++) {
    const m: Mastery = {}
    for (const w of WORDS) if (rng() < 0.1) m[w.id] = lv(Math.floor(rng() * 5))
    if (!Object.keys(m).length) continue
    const w = selectReview(WORDS, m, { rng, currentId: Object.keys(m)[0], recent: Object.keys(m).slice(0, 3) })
    assert.ok(w && m[w.id], 'only introduced entries')
  }
  assert.equal(selectReview(WORDS, { 人: lv(1) }, { filter: w => w.kind === 'particle' }), null)
  // a future scheduler plugs in its own weight without touching curriculum order
  const due = selectReview(WORDS, { 人: lv(1), 大: lv(1) }, { weight: w => (w.id === '大' ? 1 : 0) })
  assert.equal(due!.id, '大')
})

test('exhausted curriculum: nothing left to introduce, review continues; an unusable curriculum reports "empty"', () => {
  const c = course([['u', [{ id: 'l1', entries: ['人', '大'] }]]])
  const done: Mastery = { 人: lv(2), 大: lv(1) }
  const plan = selectIntroductions(state(c, done))
  assert.equal(plan.reason, 'complete'); assert.deepEqual(plan.ids, [])
  assert.ok(selectReview(WORDS, done))
  assert.equal(courseLine(courseStatus(state(c, done, syncCourse(c, done)))), 'Test course · all lessons complete')
  const broken = course([['u', [{ id: 'l1', entries: ['不存在', '也没有'] }]]])
  const bad = selectIntroductions(state(broken, {}))
  assert.equal(bad.reason, 'empty'); assert.deepEqual(bad.missing, ['不存在', '也没有'])
  assert.equal(selectReview(WORDS, {}), null, 'nothing known + nothing to introduce: the game shows a configuration error')
})

test('progress line: "Unit · Lesson n · k of N introduced", no ids or schema words', () => {
  const c = course([['greetings', [{ id: 'g1', entries: ['你好', '谢谢', '朋友', '人', '大'] }]]])
  c.units[0].title = 'Greetings'
  const m: Mastery = { 你好: lv(0), 谢谢: lv(0) }
  assert.equal(courseLine(courseStatus(state(c, m))), 'Greetings · Lesson 1 · 2 of 5 introduced')
  assert.equal(introCardLine(state(c, m), '朋友'), 'Greetings · Lesson 1 · 3 of 5 introduced', 'the card being shown counts')
  assert.equal(introCardLine(state(c, m), '水'), null)
  const all: Mastery = { 你好: lv(1), 谢谢: lv(0), 朋友: lv(0), 人: lv(0), 大: lv(0) }
  assert.equal(courseLine(courseStatus(state(c, all))), 'Greetings · Lesson 1 · 1 of 5 ready')
})

// ---- saves and curriculum updates ----------------------------------------------------------------------------------

// A compatibility-style course used by the migration tests (independent of what curricula.json ships).
const COMPAT = course([['first', [{ id: 'first-1', entries: ['人', '大', '小'] }, { id: 'first-2', entries: ['一', '二', '三'] }, { id: 'first-3', entries: ['日', '月'] }]]], { id: 'compat' })

test('migration: a v2 save keeps mastery, gold, gear, runs; known entries count as introduced; readiness is derived', () => {
  const v2 = {
    version: 2, meta: { gold: 321, upgrades: ['W1'], bestFloor: 4, runs: 7 },
    mastery: { 人: lv(2), 大: lv(1, 1), 小: lv(1), 一: lv(0, 1), 我: lv(3) },
    run: { floor: 2, kill: 1, kills: 5, level: 3, xp: 4, hp: 20, enemyHp: 5, gold: 40, potions: 2, gear: ['Copper Blade'], loadout: { Weapon: 'Copper Blade' }, streak: 1, hintsLeft: 0, secondLeft: 0, phase: 'fighting', reward: { xp: 0, gold: 0, loot: '', levelUps: 0 } },
    lastRun: null, habit: { daysPlayed: 3, correct: 50 }
  }
  const s = sanitizeSave(v2, WORDS, [COMPAT])
  assert.equal(s.version, 3)
  assert.deepEqual(s.meta, { gold: 321, upgrades: ['W1'], bestFloor: 4, runs: 7 })
  assert.deepEqual(s.mastery, v2.mastery)
  assert.deepEqual(s.run?.gear, ['Copper Blade']); assert.equal(s.run?.gold, 40); assert.equal(s.habit.correct, 50)
  const p = s.courses.compat
  assert.ok(p.completed.includes('first-1'), '人 大 小 are all at level 1+: lesson 1 is ready')
  assert.ok(!p.completed.includes('first-2'), '一 is still at level 0')
  assert.equal(p.version, COMPAT.version)
  assert.deepEqual(s.mastery.我, lv(3), 'progress for an entry outside the curriculum is kept')
  const plan = selectIntroductions(state(COMPAT, s.mastery, p), ALL)
  for (const id of Object.keys(v2.mastery)) assert.ok(!plan.ids.includes(id), `${id} is not introduced again`)
  assert.equal(plan.ids[0], '二', 'the first unseen entry in curriculum order comes next')
  // an older app version (v2 code) would drop `courses`; it is re-derived on the next load
  assert.deepEqual(sanitizeSave({ ...s, courses: undefined }, WORDS, [COMPAT]).courses.compat.completed, p.completed)
  // the shipped curriculum is synced too (whatever it is)
  assert.ok(sanitizeSave(v2).courses[ACTIVE_CURRICULUM.id])
})

test('migration: progress for other curricula, unknown lessons and entries outside the curriculum is kept', () => {
  const s = sanitizeSave({ version: 3, meta: {}, mastery: { 水: lv(2) }, courses: { 'old-course': { version: 4, completed: ['x-1', 'x-2'] }, [ACTIVE_CURRICULUM.id]: { version: 1, completed: ['removed-lesson'] } } })
  assert.deepEqual(s.courses['old-course'], { version: 4, completed: ['x-1', 'x-2'] })
  assert.ok(s.courses[ACTIVE_CURRICULUM.id].completed.includes('removed-lesson'))
  assert.deepEqual(orphanLessons(ACTIVE_CURRICULUM, s.courses[ACTIVE_CURRICULUM.id]), ['removed-lesson'])
  assert.deepEqual(s.mastery, { 水: lv(2) })
  const junk = sanitizeSave({ meta: {}, courses: { 'a b': {}, ok: { version: 'x', completed: [1, 'l', 'l', null] } } })
  assert.deepEqual(junk.courses.ok, { version: 0, completed: ['l'] })
})

test('curriculum update: an entry moved to another lesson is not introduced again and lesson completion survives', () => {
  const v1 = course([['u', [{ id: 'a', entries: ['人', '大'] }, { id: 'b', entries: ['小', '水'] }]]])
  const m: Mastery = { 人: lv(1), 大: lv(1) }
  const p1 = syncCourse(v1, m)
  assert.deepEqual(p1.completed, ['a'])
  // v2: 大 moves to lesson b, lesson order changes, ids stay
  const v2 = course([['u', [{ id: 'b', entries: ['大', '小', '水'] }, { id: 'a', entries: ['人'] }]]], { version: 2 })
  const p2 = syncCourse(v2, m, p1)
  assert.ok(p2.completed.includes('a'), 'completion is keyed by lesson id, not position')
  assert.equal(p2.version, 2)
  assert.deepEqual(selectIntroductions(state(v2, m, p2), ALL).ids, ['小', '水', ], 'the moved entry is already introduced: no replay')
})

test('curriculum update: an entry inserted into a completed lesson is introduced; later lessons stay unlocked', () => {
  const v1 = course([['u', [{ id: 'a', entries: ['人', '大'] }, { id: 'b', entries: ['小'], pre: ['a'] }]]])
  const m: Mastery = { 人: lv(1), 大: lv(1), 小: lv(0) }
  const p1 = syncCourse(v1, m)
  const v2 = course([['u', [{ id: 'a', entries: ['人', '水', '大'] }, { id: 'b', entries: ['小', '火'], pre: ['a'] }]]], { version: 2 })
  const p2 = syncCourse(v2, m, p1)
  assert.ok(p2.completed.includes('a'), 'still completed although 水 is new')
  const plan = selectIntroductions(state(v2, m, p2), ALL)
  assert.deepEqual(plan.ids, ['水', '火'], 'the new entry comes first (earliest), lesson b is not relocked')
  assert.equal(courseLine(courseStatus(state(v2, m, p2))), 'U · Lesson 1 · 2 of 3 introduced')
})

test('curriculum update: a renamed lesson keeps its completion through "aliases"; without an alias the old id is kept', () => {
  const v1 = course([['u', [{ id: 'old', entries: ['人'] }, { id: 'next', entries: ['大'], pre: ['old'] }]]])
  const p1 = syncCourse(v1, { 人: lv(1) })
  const renamed = course([['u', [{ id: 'new', entries: ['人'], aliases: ['old'] }, { id: 'next', entries: ['大'], pre: ['new'] }]]], { version: 2 })
  const m: Mastery = { 人: lv(0) }   // forgotten since: the alias still carries the completion
  const p2 = syncCourse(renamed, m, p1)
  assert.ok(p2.completed.includes('new') && p2.completed.includes('old'))
  assert.deepEqual(selectIntroductions(state(renamed, m, p2), ALL).ids, ['大'])
  const noAlias = course([['u', [{ id: 'new', entries: ['人'] }]]], { version: 2 })
  assert.deepEqual(orphanLessons(noAlias, syncCourse(noAlias, m, p1)), ['old'], 'recoverable: an alias added later picks it up')
})

test('syncCourse returns the same object when nothing changed (cheap after every answer)', () => {
  const c = course([['u', [{ id: 'a', entries: ['人'] }]]])
  const p = syncCourse(c, { 人: lv(1) })
  assert.equal(syncCourse(c, { 人: lv(1) }, p), p)
})

test('scale: 1,200 entries in 240 lessons with prerequisites stay fast and in order', async () => {
  const { simulatedOrder } = await import('../src/content/validateCurriculum.ts')
  const ids = Array.from({ length: 1200 }, (_, i) => `e${i}`)
  const lessons = Array.from({ length: 240 }, (_, l) => ({ id: `l${l}`, entries: ids.slice(l * 5, l * 5 + 5).map((e, k) => ({ entryId: e, prerequisiteEntries: k ? [ids[l * 5]] : [] })), pre: l ? [`l${l - 1}`] : [] }))
  const c = course([['u', lessons]])
  const t = Date.now()
  assert.deepEqual(simulatedOrder(c, new Set(ids)), ids)
  const words = ids.map(id => ({ id }) as Word)
  const m: Mastery = Object.fromEntries(ids.slice(0, 600).map(id => [id, lv(1)]))
  const p = syncCourse(c, m, emptyCourse(), wordMap(words))
  assert.equal(p.completed.length, 120)
  assert.deepEqual(selectIntroductions(state(c, m, p, words), ALL).ids, ['e600'], 'the next lesson starts with its anchor entry')
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t} ms`)
})
