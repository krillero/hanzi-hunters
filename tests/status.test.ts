import test from 'node:test'
import assert from 'node:assert/strict'
import { entryStatus, reviewLine, reviewSummary } from '../src/game/status.ts'
import { entryAtLevel, introduce, type SchedEntry } from '../src/game/schedule.ts'
import type { Mastery } from '../src/game/types.ts'

const T = Date.UTC(2026, 10, 1, 12), H = 3_600_000
const at = (lv: number, due: number, over: Partial<SchedEntry> = {}): SchedEntry => ({ ...entryAtLevel(lv, T), due, ...over })

test('entry status: initial progress, due, maintenance, relearning, recovery and next-check estimates', () => {
  assert.deepEqual(entryStatus({ ...introduce(T, 0), ok: 1, lv: 1 }, T), { tag: null, text: '1/3 spaced practices' })
  assert.equal(entryStatus(at(3, T + 72 * H), T).text, 'Next check in 3 days')
  assert.deepEqual(entryStatus(at(3, T), T), { tag: 'review', text: 'Review due' })
  assert.deepEqual(entryStatus(at(5, T), T), { tag: 'maintenance', text: 'Maintenance due' })
  assert.equal(entryStatus(at(5, T + 14 * 24 * H), T).text, 'Next maintenance in 14 days')
  assert.deepEqual(entryStatus(at(3, null as never, { rel: 'relearn' }), T), { tag: 'practise', text: "Let's practice this again" })
  assert.equal(entryStatus(at(3, T + 24 * H, { rel: 'recheck' }), T).text, 'Recovering · next check in 1 day')
})

test('review line: due words, maintenance wording, words to practise again, next review, nothing', () => {
  const m: Mastery = { a: at(3, T), b: at(5, T), c: at(4, T + 50 * H) }
  assert.equal(reviewLine(m, T), '2 words ready for review (1 maintenance)')
  assert.equal(reviewLine({ b: m.b }, T), 'Maintenance due: 1 word')
  assert.equal(reviewLine({ c: m.c }, T), 'Next word review in 2 days')
  assert.equal(reviewLine({ r: at(3, null as never, { rel: 'relearn' }) }, T), '1 word to practice again')
  assert.equal(reviewLine({}, T), null); assert.equal(reviewLine({ n: introduce(T, 0) }, T), null)
  assert.deepEqual(reviewSummary(m, T), { due: 2, maintenance: 1, practise: 0, nextAt: T + 50 * H })
})
