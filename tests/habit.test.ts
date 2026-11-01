import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyHabit, localDay, recordCorrect, recordPlay, sanitizeHabit } from '../src/game/habit.ts'
import { sanitizeSave, loadSave } from '../src/game/save.ts'
import { parseBackup, serializeBackup } from '../src/game/backup.ts'

const lv = (n: number, ok = 0) => ({ lv: n, ok })

test('habit: sanitising never throws and drops junk', () => {
  for (const bad of [null, undefined, 5, 'x', [], { daysPlayed: -4, lastPlayed: 'yesterday', badges: ['nope', 7, 'known-10', 'known-10', ''], correct: 'many' }]) {
    const h = sanitizeHabit(bad)
    assert.ok(h.daysPlayed >= 0 && h.correct >= 0 && Array.isArray(h.badges))
    assert.ok(h.lastPlayed === '' || /^\d{4}-\d{2}-\d{2}$/.test(h.lastPlayed))
  }
  const h = sanitizeHabit({ daysPlayed: 3.9, lastPlayed: '2026-10-31', warmupDay: '2026-10-30', correct: 12, badges: ['known-10', 'known-10', 'bogus'] })
  // Milestone badges were removed; the saved list is kept (unique strings) so older saves round-trip unchanged.
  assert.deepEqual(h, { daysPlayed: 3, lastPlayed: '2026-10-31', warmupDay: '2026-10-30', correct: 12, bosses: 0, bossesMet: [], seed: 0, tipsSeen: [], badges: ['known-10', 'bogus'] })
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

test('saves: old saves load with an empty habit; the habit survives export and import', () => {
  const old = sanitizeSave({ version: 1, meta: { gold: 5, upgrades: [], bestFloor: 2, runs: 1 }, mastery: { 人: lv(1) }, run: null, lastRun: null })
  assert.deepEqual(old.habit, emptyHabit())
  assert.deepEqual(loadSave({ getItem: () => JSON.stringify({ version: 1, meta: { gold: 1 } }) }).habit, emptyHabit())
  const s = sanitizeSave({ ...old, habit: { daysPlayed: 4, lastPlayed: '2026-10-31', warmupDay: '2026-10-31', correct: 40, badges: ['known-10'] } })
  const back = parseBackup(serializeBackup(s))
  assert.deepEqual(back.habit, s.habit)
})
