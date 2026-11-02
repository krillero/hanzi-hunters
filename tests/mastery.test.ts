import test from 'node:test'
import assert from 'node:assert/strict'
import { LEVEL_NAMES, MAX_LEARNING, MAX_LV, MIN_KNOWN, SESSION_LV, STARTING_POOL, dueCount, isDue, masteredCount, nextReviewTime } from '../src/game/mastery.ts'
import { DUE_PER_FIGHT, introCapacity, selectReview } from '../src/game/course.ts'
import { WORDS } from '../src/data.ts'
import { INITIAL_GAPS, STAGE_INTERVAL_MS, entryAtLevel } from '../src/game/schedule.ts'
import { answerRevealed, applyAnswer, applyIntroduce, applyReveal, dimensionOf, learningNote, toneCorrect } from '../src/game/learning.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { buildQuestion } from '../src/game/questions.ts'
import type { Mastery, Saved } from '../src/game/types.ts'

const T = Date.UTC(2026, 10, 1, 12), H = 3_600_000
const fresh = () => sanitizeSave(null, WORDS, [], T)

test('level names and the lesson threshold are unchanged', () => {
  assert.deepEqual(LEVEL_NAMES, ['New', 'Learning', 'Familiar', 'Remembered', 'Retained', 'Mastered']); assert.equal(MAX_LV, 5); assert.equal(SESSION_LV, 2)
})

test('due reviews: delayed, maintenance and recheck count; initial learning and relearning do not', () => {
  const m: Mastery = { a: { ...entryAtLevel(3, T), due: T + H }, b: { ...entryAtLevel(5, T), due: T + 2 * H }, c: entryAtLevel(1, T), d: { ...entryAtLevel(3, T), rel: 'relearn', due: null } }
  assert.equal(dueCount(m, T), 0); assert.equal(isDue(m.a, T + H - 1), false); assert.equal(isDue(m.a, T + H), true)
  assert.equal(dueCount(m, T + 2 * H), 2); assert.equal(nextReviewTime(m, T), T + H)
  assert.equal(isDue({ ...m.a, reveal: T + H - 60_000 }, T + H), false, 'answer shown a minute ago')
  assert.equal(nextReviewTime({}, T), null)
})

test('introduction creates level 0 without credit; answering an unintroduced word is assisted practice', () => {
  const s = applyIntroduce(fresh(), 'a', T)
  assert.deepEqual([s.mastery.a.lv, s.mastery.a.ok, s.answerSeq], [0, 0, 0])
  const r = applyAnswer(fresh(), { id: 'b', kind: 'meaning', correct: true, assisted: false, now: T + 40_000 })
  assert.equal(r.outcome, 'assisted'); assert.equal(r.save.mastery.b.lv, 0); assert.equal(r.save.answerSeq, 1)
})

test('every submitted answer bumps the global number once; a replay of the same number is a no-op', () => {
  let s: Saved = applyIntroduce(applyIntroduce(fresh(), 'a', T), 'b', T)
  const sub = { id: 'a', kind: 'meaning' as const, correct: true, assisted: false, now: T + 40_000 }
  const first = applyAnswer(s, sub, 1); s = first.save
  assert.equal(s.answerSeq, 1)
  const again = applyAnswer(s, sub, 1)
  assert.equal(again.outcome, 'ignored'); assert.equal(again.save, s)
  s = applyAnswer(s, { ...sub, id: 'b', now: T + 41_000 }).save; assert.equal(s.answerSeq, 2)
  // a and b alternate: a needs 2 other answers + 30 s for its first success
  assert.equal(first.outcome, 'practice', 'a lone answer 40 s after introduction, with no other answers, is practice only')
})

test('a full path through the API: introduce, three spaced successes, delayed review after 24 h, persisted through a save', () => {
  let s = fresh(); s = applyIntroduce(s, '人', T); s = applyIntroduce(s, '大', T)
  let now = T
  const other = () => { now += 1000; s = applyAnswer(s, { id: '大', kind: 'character', correct: true, assisted: false, now }).save }   // another entry's answer
  for (const gap of INITIAL_GAPS) {
    for (let i = 0; i < gap.otherAnswers; i++) other()
    now += gap.minimumMs; s = applyAnswer(s, { id: '人', kind: 'meaning', correct: true, assisted: false, now }).save
  }
  assert.equal(s.mastery.人.lv, 2); assert.equal(s.mastery.人.due, now + STAGE_INTERVAL_MS[2])
  s = sanitizeSave(JSON.parse(JSON.stringify(s)), WORDS, [], now + 60_000)       // reload
  assert.equal(s.mastery.人.lv, 2); assert.equal(s.answerSeq, 3 + 2 + 4 + 8)
  const late = applyAnswer(s, { id: '人', kind: 'meaning', correct: true, assisted: false, now: s.mastery.人.due! }); assert.equal(late.after, 3)
})

test('help and answer-revealing questions are assisted; dimensions map to question kinds', () => {
  const w = WORDS.find(x => x.hanzi === '人')!
  const byKind = (kind: Parameters<typeof buildQuestion>[3] extends infer O ? NonNullable<(O & { kind?: unknown })['kind']> : never) => buildQuestion(w, entryAtLevel(2), WORDS, { kind, canListen: false, known: new Set(WORDS.map(x => x.id)) })
  assert.equal(answerRevealed(byKind('meaning')), false)
  assert.equal(answerRevealed(buildQuestion(w, undefined, WORDS)), true, 'the intro question shows everything')
  assert.deepEqual(['meaning', 'pinyin', 'character', 'listen', 'particle'].map(k => dimensionOf(k as never)), ['meaning', 'reading', 'reverse', 'listening', 'sentence'])
})

test('tone evidence: right tone, wrong tone, and a different syllable', () => {
  assert.equal(toneCorrect('nǐ hǎo', 'nǐ hǎo'), true); assert.equal(toneCorrect('nǐ hǎo', 'ní hǎo'), false); assert.equal(toneCorrect('nǐ', 'nā'), undefined)
})

test('details and wordbook only record that the answer was shown', () => {
  const s = applyIntroduce(fresh(), 'a', T), r = applyReveal(s, ['a', 'zzz'], T + 5 * H)
  assert.equal(r.mastery.a.reveal, T + 5 * H); assert.equal(r.mastery.a.lv, 0); assert.equal(applyReveal(s, ['zzz'], T), s)
})

test('feedback lines say what happened without shaming', () => {
  const e = { lv: 3, ok: 3, due: T + 72 * H }
  assert.equal(learningNote('lapse', e, 3, false, T), "Let's practice this again.")
  assert.equal(learningNote('spaced', { lv: 1, ok: 2, due: null }, 1, true, T), '2/3 spaced practices')
  assert.equal(learningNote('practice', { lv: 1, ok: 1, due: null }, 1, true, T), 'Practice — next memory check later.')
  assert.equal(learningNote('assisted', e, 3, true, T), 'Correct with help — practice recorded.')
  assert.match(learningNote('advanced', e, 2, true, T), /Level up! Now Remembered · next check in 3 days/)
  assert.match(learningNote('maintained', { lv: 5, ok: 3, due: T + 30 * 24 * H }, 5, true, T), /next maintenance in 30 days/)
  assert.equal(learningNote('practice', e, -1, true, T), 'New word — added to your wordbook')
})

test('mastered count, learning pool constants and review picking still work with the new entries', () => {
  assert.equal(masteredCount({ a: entryAtLevel(5), b: entryAtLevel(4) }), 1)
  assert.ok(MAX_LEARNING > 0 && MIN_KNOWN > 0 && STARTING_POOL > 0)
  assert.ok(introCapacity({}) > 0)
  const m: Mastery = Object.fromEntries(WORDS.slice(0, 8).map(w => [w.id, entryAtLevel(3, T)]))
  const picks = new Set<string>(); let dueAsked = 0
  for (let i = 0; i < 200; i++) { const w = selectReview(WORDS, m, { now: T + H, dueCapped: dueAsked >= DUE_PER_FIGHT, rng: Math.random })!; picks.add(w.id); if (isDue(m[w.id], T + H)) dueAsked++ }
  assert.ok(picks.size > 1)
})
