import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWords } from '../src/content/entries.ts'
import type { RawWord } from '../src/content/types.ts'
import { migrateMastery, sanitizeSave } from '../src/game/save.ts'
import { WORDS } from '../src/data.ts'
import { STAGE_INTERVAL_MS, localNoon } from '../src/game/schedule.ts'
import { levels } from './clock.ts'

const raw = (over: Partial<RawWord> & { hanzi: string; pinyin: string; meaning: string }): RawWord => ({ group: 'g', note: 'n', ...over })
const lv = (n: number, ok = 0) => ({ lv: n, ok })
const NOW = new Date(2026, 10, 10, 8, 0).getTime()
/** Migrating a v1 map (the stored shape of the expedition saves) and re-reading already-migrated (v2) entries. */
const v1 = (r: unknown, legacy: unknown, words: Parameters<typeof migrateMastery>[2]) => migrateMastery(r, legacy, words, { version: 1, now: NOW, maxSeq: 0 })
const v2 = (r: unknown, legacy: unknown, words: Parameters<typeof migrateMastery>[2]) => migrateMastery(r, legacy, words, { version: 2, now: NOW, maxSeq: 0 })

test('migration: existing saves (progress keyed by hanzi) keep every entry', () => {
  const words = normalizeWords([raw({ hanzi: '人', pinyin: 'rén', meaning: 'person' }), raw({ hanzi: '大', pinyin: 'dà', meaning: 'big' })])
  const { mastery, legacy } = v1({ 人: lv(3, 1), 大: lv(1) }, undefined, words)
  assert.deepEqual(levels(mastery), { 人: 3, 大: 1 }); assert.deepEqual(legacy, {})
})

test('migration: the shipped 50 entries still read an old save written before ids existed', () => {
  const old = Object.fromEntries(WORDS.slice(0, 12).map((w, i) => [w.hanzi, lv(i % 5, i % 2)]))
  const s = sanitizeSave({ version: 1, meta: { gold: 5, upgrades: [], bestFloor: 3, runs: 2 }, mastery: old, run: null, lastRun: null })
  for (const w of WORDS.slice(0, 12)) assert.equal(s.mastery[w.id].lv, old[w.hanzi].lv, `${w.hanzi} keeps its level`)
  assert.deepEqual(s.legacyMastery, {})
})

test('migration: an alias moves progress to the renamed entry (same meaning), the old key disappears', () => {
  const words = normalizeWords([raw({ id: '看-look', hanzi: '看', pinyin: 'kàn', meaning: 'look / watch', aliases: ['看'], audio: 'none' }), raw({ id: '看-guard', hanzi: '看', pinyin: 'kān', meaning: 'guard / look after', audio: 'none' })])
  const { mastery, legacy } = v1({ 看: lv(3, 1) }, undefined, words)
  assert.equal(mastery['看-look'].lv, 3)
  assert.equal(mastery['看-guard'], undefined, 'a distinct meaning never inherits progress it did not earn')
  assert.equal(mastery['看'], undefined); assert.deepEqual(legacy, {})
})

test('migration: two entries for one hanzi without an alias are never merged and nothing is lost', () => {
  const words = normalizeWords([raw({ id: 'a', hanzi: '看', pinyin: 'kàn', meaning: 'look', audio: 'none' }), raw({ id: 'b', hanzi: '看', pinyin: 'kān', meaning: 'guard', audio: 'none' })])
  const { mastery, legacy } = v1({ 看: lv(2, 1) }, undefined, words)
  assert.deepEqual(mastery, {}, 'ambiguous: not guessed')
  assert.deepEqual(levels(legacy), { 看: 2 }, 'kept for later')
  // once an alias is declared, the next load recovers it from `legacy`
  const fixed = normalizeWords([raw({ id: 'a', hanzi: '看', pinyin: 'kàn', meaning: 'look', audio: 'none', aliases: ['看'] }), raw({ id: 'b', hanzi: '看', pinyin: 'kān', meaning: 'guard', audio: 'none' })])
  const again = v2(mastery, legacy, fixed)
  assert.deepEqual(levels(again.mastery), { a: 2 }); assert.deepEqual(again.legacy, {})
})

test('migration: a hanzi that is used by exactly one entry follows that entry to its new id', () => {
  const words = normalizeWords([raw({ id: 'tian-1', hanzi: '天', pinyin: 'tiān', meaning: 'sky / day' })])
  assert.deepEqual(levels(v1({ 天: lv(2) }, undefined, words).mastery), { 'tian-1': 2 })
})

test('migration: if both the old and the new id have progress, the higher level wins', () => {
  const words = normalizeWords([raw({ id: 'x2', hanzi: '好', pinyin: 'hǎo', meaning: 'good', aliases: ['好'] })])
  assert.deepEqual(levels(v1({ 好: lv(1, 1), x2: lv(3) }, undefined, words).mastery), { x2: 3 })
  assert.deepEqual(levels(v1({ 好: lv(3, 1), x2: lv(2) }, undefined, words).mastery), { x2: 3 })
})

test('migration: progress for a removed entry is parked, and comes back if the entry returns', () => {
  const some = normalizeWords([raw({ hanzi: '人', pinyin: 'rén', meaning: 'person' })])
  const gone = v1({ 人: lv(2), 龙: lv(4) }, undefined, some)
  assert.deepEqual(levels(gone.mastery), { 人: 2 }); assert.deepEqual(levels(gone.legacy), { 龙: 4 })
  const back = normalizeWords([...some, raw({ hanzi: '龙', pinyin: 'lóng', meaning: 'dragon' })])
  assert.deepEqual(levels(v2(gone.mastery, gone.legacy, back).mastery), { 人: 2, 龙: 4 })
})

test('migration: garbage in saved progress is cleaned, the rest survives', () => {
  const words = normalizeWords([raw({ hanzi: '人', pinyin: 'rén', meaning: 'person' })])
  const { mastery, legacy } = v1({ 人: { lv: 99, ok: -3 }, 大: 'x', 小: null }, 'nope', words)
  assert.deepEqual(levels(mastery), { 人: 4 }); assert.deepEqual(legacy, {})
})


test('v1 to v2: levels kept, due dates derived once, and a second load never postpones them again', () => {
  const day = '2026-11-08'
  const v1save = { version: 1, meta: {}, mastery: { 人: { lv: 3, ok: 0, at: day }, 大: { lv: 1, ok: 1 }, 小: { lv: 4, ok: 0 }, 水: { lv: 2, ok: 0, at: '2099-01-01' } } }
  const a = sanitizeSave(v1save, WORDS, [], NOW)
  assert.equal(a.version, 2); assert.equal(a.answerSeq, 0)
  assert.equal(a.mastery['人'].due, localNoon(day)! + STAGE_INTERVAL_MS[3], 'old date at local noon + the interval of the level')
  assert.equal(a.mastery['小'].due, NOW, 'no date: due now, not promoted'); assert.equal(a.mastery['小'].lv, 4)
  assert.equal(a.mastery['水'].due, NOW + STAGE_INTERVAL_MS[2], 'a future date is clamped')
  assert.equal(a.mastery['大'].ok, 1)
  // the app saves v2; reloading it hours later changes nothing
  const b = sanitizeSave(JSON.parse(JSON.stringify(a)), WORDS, [], NOW + 5 * 3_600_000)
  assert.deepEqual(b.mastery, a.mastery); assert.equal(b.answerSeq, 0)
})

test('v2 saves: malformed scheduling data is repaired, never reset to zero', () => {
  const a = sanitizeSave({ version: 1, meta: {}, mastery: { 人: { lv: 3, ok: 0, at: '2026-11-08' } } }, WORDS, [], NOW)
  const bad = { ...JSON.parse(JSON.stringify(a)), answerSeq: 'x', mastery: { 人: { ...a.mastery['人'], due: 'soon', lastSeq: 1e12, g: 7 }, 大: 5 } }
  const s = sanitizeSave(bad, WORDS, [], NOW)
  assert.equal(s.answerSeq, 0); assert.equal(s.mastery['人'].lv, 3); assert.equal(s.mastery['人'].due, NOW); assert.equal(s.mastery['人'].lastSeq, 0)
  assert.equal(s.mastery['大'], undefined)
  assert.equal(sanitizeSave({ version: 3, meta: {} }, WORDS, [], NOW).version, 2, 'an unknown version yields a fresh save')
})
