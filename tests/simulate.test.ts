import test from 'node:test'
import assert from 'node:assert/strict'
import { introduce, recordAnswer } from '../src/game/schedule.ts'
import { SIM_ANSWER_MS, newPace, simulate } from '../tools/simulate.ts'

test('hundreds of answers at one timestamp earn no spaced learning', () => {
  let e = introduce(1_000, 0)
  for (let seq = 1; seq <= 300; seq++) e = recordAnswer(e, { correct: true, assisted: false, dim: 'meaning', now: 1_000, seq }).entry
  assert.deepEqual([e.lv, e.ok], [0, 0])
})

test('the simulator advances a clock: words reach Familiar only after real elapsed time and several answers', () => {
  const pace = newPace(), log = simulate(0.9, 4, 7, { pace })
  assert.equal(log.length, 4); assert.ok(pace.answers > 0 && pace.introduced > 0)
  assert.ok(pace.toFamiliar.length > 0, 'some words learn within 4 expeditions')
  for (const x of pace.toFamiliar) { assert.ok(x.minutes >= (30 + 90 + 180) / 60, `${x.minutes} min`); assert.ok(x.answers >= 2 + 4 + 8 + 3) }
  assert.ok(SIM_ANSWER_MS > 0)
})
