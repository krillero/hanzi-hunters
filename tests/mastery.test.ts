import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_LEARNING, MAX_LV, MIN_KNOWN, STARTING_POOL, masteredCount, updateMastery } from '../src/game/mastery.ts'
import { introCapacity } from '../src/game/course.ts'
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

test('introduction capacity keeps the old limits: 3 to start, then one per fight, none while 4 are at level 0, pool cap', () => {
  const lvs = (...l: number[]): Mastery => Object.fromEntries(l.map((lv, i) => [`e${i}`, { lv, ok: 0 }]))
  assert.equal(introCapacity({}), MIN_KNOWN, 'a brand-new player is introduced to three entries')
  assert.equal(introCapacity(lvs(0, 0, 0)), 1, 'then one per fight')
  assert.equal(introCapacity(lvs(0, 0, 0, 0)), 0, `${MAX_LEARNING} entries still at level 0: wait`)
  assert.equal(introCapacity(lvs(1, 0, 0, 0)), 1, 'a level-1 entry frees a slot')
  assert.equal(introCapacity(lvs(...Array(STARTING_POOL + 2).fill(1), 0, 0)), 1)
  assert.equal(introCapacity(lvs(0, 0, 0), { maxLearning: 9, minKnown: 3, perFight: 1, startingPool: 3 }), 0, 'pool cap: met entries may exceed level-1 entries by at most startingPool')
})
