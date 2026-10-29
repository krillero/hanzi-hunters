import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTO_DELAYS, autoContinuePlan, type AutoContinue } from '../src/game/flow.ts'
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings } from '../src/settings.ts'

const plan = (isCorrect: boolean, outcome: 'continue' | 'victory' | 'defeat', eliteKill = false, setting: AutoContinue = 'quick') => autoContinuePlan({ isCorrect, outcome, eliteKill, setting })

test('right answers continue by themselves: next question, or next monster after a normal kill', () => {
  assert.deepEqual(plan(true, 'continue'), { mode: 'question', delay: AUTO_DELAYS.quick.question })
  assert.deepEqual(plan(true, 'victory'), { mode: 'enemy', delay: AUTO_DELAYS.quick.enemy })
  assert.deepEqual(plan(true, 'continue', false, 'relaxed'), { mode: 'question', delay: AUTO_DELAYS.relaxed.question })
  assert.ok(AUTO_DELAYS.relaxed.question > AUTO_DELAYS.quick.question && AUTO_DELAYS.quick.enemy > AUTO_DELAYS.quick.question)
})

test('the game pauses for wrong answers, defeat and clearing a floor', () => {
  for (const outcome of ['continue', 'victory', 'defeat'] as const) assert.equal(plan(false, outcome), null, `wrong answer / ${outcome}`)
  assert.equal(plan(true, 'defeat'), null, 'a right answer can still end in defeat (counterattack)')
  assert.equal(plan(true, 'victory', true), null, 'elite kill = floor cleared')
})

test('Off never auto-continues', () => {
  for (const isCorrect of [true, false]) for (const outcome of ['continue', 'victory', 'defeat'] as const) assert.equal(plan(isCorrect, outcome, false, 'off'), null)
})

test('settings: defaults, sanitising and loading never throw', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { muted: false, autoContinue: 'quick' })
  assert.deepEqual(sanitizeSettings({ muted: true, autoContinue: 'off' }), { muted: true, autoContinue: 'off' })
  for (const bad of [null, undefined, 5, 'x', [], { muted: 'yes', autoContinue: 'fast' }]) assert.deepEqual(sanitizeSettings(bad), DEFAULT_SETTINGS)
  assert.deepEqual(loadSettings({ getItem: () => '{bad json' }), DEFAULT_SETTINGS)
  assert.deepEqual(loadSettings({ getItem: () => JSON.stringify({ muted: true }) }), { muted: true, autoContinue: 'quick' })
})
