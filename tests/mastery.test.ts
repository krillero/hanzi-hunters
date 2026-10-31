import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { MAX_LV, STARTING_POOL, activeCount, masteredCount, pickWord, updateMastery, wordsToIntroduce } from '../src/game/mastery.ts'
import type { Mastery } from '../src/game/types.ts'

test('first exposure creates an entry without credit, even when answered correctly', () => {
  assert.deepEqual(updateMastery({}, '人', true), { 人: { lv: 0, ok: 0 } })
  assert.deepEqual(updateMastery({}, '人', false), { 人: { lv: 0, ok: 0 } })
})

test('two correct in a row promote; a miss demotes one level and clears progress', () => {
  let m = updateMastery({}, '人', true)
  m = updateMastery(m, '人', true); assert.deepEqual(m['人'], { lv: 0, ok: 1 })
  m = updateMastery(m, '人', true); assert.deepEqual(m['人'], { lv: 1, ok: 0 })
  m = updateMastery(m, '人', true); m = updateMastery(m, '人', false); assert.deepEqual(m['人'], { lv: 0, ok: 0 })
  m = updateMastery(m, '人', false); assert.equal(m['人'].lv, 0, 'never below 0')
})

test('mastery caps at the mastered level and is counted', () => {
  let m = { 人: { lv: MAX_LV - 1, ok: 1 } }
  m = updateMastery(m, '人', true); assert.equal(m['人'].lv, MAX_LV); assert.equal(masteredCount(m), 1)
  m = updateMastery(m, '人', true); m = updateMastery(m, '人', true); assert.equal(m['人'].lv, MAX_LV)
})

test('the active pool starts small and grows with level-1 words', () => {
  assert.equal(activeCount({}, 30), STARTING_POOL)
  assert.equal(activeCount({ 人: { lv: 1, ok: 0 }, 大: { lv: 2, ok: 0 }, 小: { lv: 0, ok: 0 } }, 30), STARTING_POOL + 2)
  assert.equal(activeCount(Object.fromEntries(WORDS.map(w => [w.hanzi, { lv: 3, ok: 0 }])), 30), 30)
})

test('pickWord stays in the pool, never repeats, and limits new words while several are at level 0', () => {
  for (let i = 0; i < 300; i++) {
    const w = pickWord(WORDS, {}, '人')
    assert.notEqual(w.hanzi, '人'); assert.ok(WORDS.indexOf(w) < STARTING_POOL)
  }
  const m = Object.fromEntries(WORDS.slice(0, 4).map(w => [w.hanzi, { lv: 0, ok: 0 }]))
  for (let i = 0; i < 300; i++) assert.ok(WORDS.indexOf(pickWord(WORDS, m, null)) < 4, 'no new word while 4 are at level 0')
})

test('mastered words are asked rarely', () => {
  const m = Object.fromEntries(WORDS.slice(0, 6).map((w, i) => [w.hanzi, { lv: i === 0 ? 4 : 1, ok: 0 }]))
  let hits = 0
  for (let i = 0; i < 3000; i++) if (pickWord(WORDS, m, null).hanzi === WORDS[0].hanzi) hits++
  assert.ok(hits / 3000 < 0.1, `mastered word asked ${(hits / 30).toFixed(1)}%`)
})

test('introduction: a new player gets enough cards to start, then one per fight, never past the learning cap', () => {
  const ws = WORDS
  const ids = (m: Mastery) => wordsToIntroduce(ws, m)
  assert.deepEqual(ids({}), ws.slice(0, 3).map(w => w.id), 'a brand-new player is introduced to the first three')
  const three: Mastery = Object.fromEntries(ws.slice(0, 3).map(w => [w.id, { lv: 0, ok: 0 }]))
  assert.deepEqual(ids(three), [ws[3].id], 'one new word per fight')
  const four: Mastery = { ...three, [ws[3].id]: { lv: 0, ok: 0 } }
  assert.deepEqual(ids(four), [], 'four words still at level 0: wait')
  const promoted: Mastery = { ...four, [ws[0].id]: { lv: 1, ok: 0 } }
  assert.deepEqual(ids(promoted), [ws[4].id], 'a level-1 word frees a slot and unlocks the next word in order')
  const everything: Mastery = Object.fromEntries(ws.map(w => [w.id, { lv: 2, ok: 0 }]))
  assert.deepEqual(ids(everything), [], 'nothing left to introduce')
})

test('a word you have not been introduced to is never asked', () => {
  const m: Mastery = Object.fromEntries(WORDS.slice(0, 3).map(w => [w.id, { lv: 1, ok: 0 }]))
  const pool = new Set(WORDS.slice(0, 3).map(w => w.id))
  for (let k = 0; k < 300; k++) assert.ok(pool.has(pickWord(WORDS, m, null, Math.random, []).id))
})
