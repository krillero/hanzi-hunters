import test from 'node:test'
import assert from 'node:assert/strict'
import { BADGES, emptyHabit, localDay, newBadges, recordCorrect, recordPlay, sanitizeHabit, contextFor } from '../src/game/habit.ts'
import { sanitizeSave, loadSave } from '../src/game/save.ts'
import { parseBackup, serializeBackup } from '../src/game/backup.ts'
import { WORDS } from '../src/data.ts'

const lv = (n: number, ok = 0) => ({ lv: n, ok })

test('habit: sanitising never throws and drops junk', () => {
  for (const bad of [null, undefined, 5, 'x', [], { daysPlayed: -4, lastPlayed: 'yesterday', badges: ['nope', 7, 'known-10', 'known-10'], correct: 'many' }]) {
    const h = sanitizeHabit(bad)
    assert.ok(h.daysPlayed >= 0 && h.correct >= 0 && Array.isArray(h.badges))
    assert.ok(h.lastPlayed === '' || /^\d{4}-\d{2}-\d{2}$/.test(h.lastPlayed))
  }
  const h = sanitizeHabit({ daysPlayed: 3.9, lastPlayed: '2026-10-31', warmupDay: '2026-10-30', correct: 12, badges: ['known-10', 'known-10', 'bogus'] })
  assert.deepEqual(h, { daysPlayed: 3, lastPlayed: '2026-10-31', warmupDay: '2026-10-30', correct: 12, bosses: 0, bossesMet: [], seed: 0, tipsSeen: [], badges: ['known-10'] })
  assert.deepEqual(sanitizeHabit({ bosses: 2.7, tipsSeen: ['石', '石', 5, '', 'toolongword', '好'] }).tipsSeen, ['石', '好'], 'tip list: unique short strings only')
  assert.equal(sanitizeHabit({ bosses: 2.7 }).bosses, 2)
  assert.deepEqual(sanitizeHabit({ bossesMet: ['golem', 'golem', 7, 'Bad Name', 'wraith'] }).bossesMet, ['golem', 'wraith'], 'boss ids: unique lowercase words')
})

test('days played counts each new day once and never goes down', () => {
  let h = emptyHabit()
  h = recordPlay(h, '2026-10-30'); h = recordPlay(h, '2026-10-30'); assert.equal(h.daysPlayed, 1)
  h = recordPlay(h, '2026-10-31'); assert.equal(h.daysPlayed, 2)
  h = recordPlay(h, '2026-12-24'); assert.equal(h.daysPlayed, 3, 'a long gap costs nothing')
  h = recordPlay(h, '2026-10-01'); assert.equal(h.daysPlayed, 4, 'a clock change cannot lower it')
  assert.equal(localDay(new Date(2026, 9, 5, 23, 59)), '2026-10-05')
  assert.equal(recordCorrect(emptyHabit(), 3).correct, 3)
})

test('badges unlock at their thresholds and are not awarded twice', () => {
  const none = contextFor({}, emptyHabit(), 1, 0)
  assert.deepEqual(newBadges(emptyHabit(), none), [])
  const many = Object.fromEntries(WORDS.slice(0, 26).map((w, i) => [w.hanzi, lv(i === 0 ? 4 : 1)]))
  const ctx = contextFor(many, { ...emptyHabit(), correct: 100, daysPlayed: 7, bosses: 1 }, 5, 3)
  const ids = newBadges(emptyHabit(), ctx).map(b => b.id)
  for (const id of ['first-mastered', 'known-10', 'known-25', 'correct-100', 'floor-5', 'days-7', 'first-boss']) assert.ok(ids.includes(id), id)
  for (const id of ['known-50', 'correct-500', 'floor-10']) assert.ok(!ids.includes(id), id)
  assert.deepEqual(newBadges({ ...emptyHabit(), badges: ids }, ctx), [], 'idempotent')
  assert.equal(new Set(BADGES.map(b => b.id)).size, BADGES.length)
})

test('saves: old saves load with an empty habit; the habit survives export and import', () => {
  const old = sanitizeSave({ version: 2, meta: { gold: 5, upgrades: [], bestFloor: 2, runs: 1 }, mastery: { 人: lv(1) }, run: null, lastRun: null })
  assert.deepEqual(old.habit, emptyHabit())
  assert.deepEqual(loadSave({ getItem: () => JSON.stringify({ version: 2, meta: { gold: 1 } }) }).habit, emptyHabit())
  const s = sanitizeSave({ ...old, habit: { daysPlayed: 4, lastPlayed: '2026-10-31', warmupDay: '2026-10-31', correct: 40, badges: ['known-10'] } })
  const back = parseBackup(serializeBackup(s))
  assert.deepEqual(back.habit, s.habit)
})
