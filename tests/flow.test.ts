import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTO_DELAYS, AUTO_MASTERY_LEVEL, LEARNING_AUTO_DELAY, autoContinuePlan, type AutoContinue } from '../src/game/flow.ts'
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings } from '../src/settings.ts'

const plan = (
  isCorrect: boolean,
  outcome: 'continue' | 'victory' | 'defeat',
  eliteKill = false,
  setting: AutoContinue = 'quick',
  masteryLevel = 2
) => autoContinuePlan({ isCorrect, outcome, eliteKill, setting, masteryLevel })

test('right answers continue using the selected speed', () => {
  assert.deepEqual(plan(true, 'continue'), { mode: 'question', delay: AUTO_DELAYS.quick.question })
  assert.deepEqual(plan(true, 'victory'), { mode: 'enemy', delay: AUTO_DELAYS.quick.enemy })
  assert.deepEqual(plan(true, 'continue', false, 'relaxed'), { mode: 'question', delay: AUTO_DELAYS.relaxed.question })
  assert.ok(AUTO_DELAYS.relaxed.question > AUTO_DELAYS.quick.question && AUTO_DELAYS.quick.enemy >= AUTO_DELAYS.quick.question)
})

test('Learn first pauses below mastery level 2, then auto-advances after 0.5 seconds', () => {
  for (const level of [0, 1]) {
    assert.equal(plan(true, 'continue', false, 'learning', level), null, `question at mastery ${level}`)
    assert.equal(plan(true, 'victory', false, 'learning', level), null, `enemy at mastery ${level}`)
  }
  assert.deepEqual(plan(true, 'continue', false, 'learning', AUTO_MASTERY_LEVEL), { mode: 'question', delay: LEARNING_AUTO_DELAY })
  assert.deepEqual(plan(true, 'victory', false, 'learning', AUTO_MASTERY_LEVEL), { mode: 'enemy', delay: LEARNING_AUTO_DELAY })
})

test('the game pauses for wrong answers, defeat and clearing a floor', () => {
  for (const outcome of ['continue', 'victory', 'defeat'] as const) assert.equal(plan(false, outcome), null, `wrong answer / ${outcome}`)
  assert.equal(plan(true, 'defeat'), null, 'a right answer can still end in defeat (counterattack)')
  assert.equal(plan(true, 'victory', true), null, 'elite kill = floor cleared')
  assert.equal(plan(true, 'victory', true, 'learning', 2), null, 'Learn first also pauses when clearing a floor')
})

test('Off never auto-continues', () => {
  for (const isCorrect of [true, false]) for (const outcome of ['continue', 'victory', 'defeat'] as const) assert.equal(plan(isCorrect, outcome, false, 'off'), null)
})

test('settings: Learn first is the default; sanitising and loading never throw', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { muted: false, sfx: true, haptics: true, autoContinue: 'learning' })
  assert.deepEqual(sanitizeSettings({ muted: true, autoContinue: 'off' }), { muted: true, sfx: true, haptics: true, autoContinue: 'off' }, 'old saved settings gain the new switches, on')
  assert.deepEqual(sanitizeSettings({ sfx: false, haptics: false }), { ...DEFAULT_SETTINGS, sfx: false, haptics: false })
  assert.deepEqual(sanitizeSettings({ muted: false, autoContinue: 'quick' }), { ...DEFAULT_SETTINGS, autoContinue: 'quick' }, 'existing preferences remain supported')
  for (const bad of [null, undefined, 5, 'x', [], { muted: 'yes', autoContinue: 'fast' }]) assert.deepEqual(sanitizeSettings(bad), DEFAULT_SETTINGS)
  assert.deepEqual(loadSettings({ getItem: () => '{bad json' }), DEFAULT_SETTINGS)
  assert.deepEqual(loadSettings({ getItem: () => JSON.stringify({ muted: true }) }), { ...DEFAULT_SETTINGS, muted: true })
})
