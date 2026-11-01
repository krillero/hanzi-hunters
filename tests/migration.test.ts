import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWords } from '../src/content/entries.ts'
import type { RawWord } from '../src/content/types.ts'
import { migrateMastery, sanitizeSave } from '../src/game/save.ts'
import { WORDS } from '../src/data.ts'

const raw = (over: Partial<RawWord> & { hanzi: string; pinyin: string; meaning: string }): RawWord => ({ group: 'g', note: 'n', ...over })
const lv = (n: number, ok = 0) => ({ lv: n, ok })

test('migration: existing saves (progress keyed by hanzi) keep every entry', () => {
  const words = normalizeWords([raw({ hanzi: '人', pinyin: 'rén', meaning: 'person' }), raw({ hanzi: '大', pinyin: 'dà', meaning: 'big' })])
  const { mastery, legacy } = migrateMastery({ 人: lv(3, 1), 大: lv(1) }, undefined, words)
  assert.deepEqual(mastery, { 人: lv(3, 1), 大: lv(1) }); assert.deepEqual(legacy, {})
})

test('migration: the shipped 50 entries still read an old save written before ids existed', () => {
  const old = Object.fromEntries(WORDS.slice(0, 12).map((w, i) => [w.hanzi, lv(i % 5, i % 2)]))
  const s = sanitizeSave({ version: 1, meta: { gold: 5, upgrades: [], bestFloor: 3, runs: 2 }, mastery: old, run: null, lastRun: null })
  for (const w of WORDS.slice(0, 12)) assert.deepEqual(s.mastery[w.id], old[w.hanzi], `${w.hanzi} keeps its level`)
  assert.deepEqual(s.legacyMastery, {})
})

test('migration: an alias moves progress to the renamed entry (same meaning), the old key disappears', () => {
  const words = normalizeWords([raw({ id: '看-look', hanzi: '看', pinyin: 'kàn', meaning: 'look / watch', aliases: ['看'], audio: 'none' }), raw({ id: '看-guard', hanzi: '看', pinyin: 'kān', meaning: 'guard / look after', audio: 'none' })])
  const { mastery, legacy } = migrateMastery({ 看: lv(3, 1) }, undefined, words)
  assert.deepEqual(mastery['看-look'], lv(3, 1))
  assert.equal(mastery['看-guard'], undefined, 'a distinct meaning never inherits progress it did not earn')
  assert.equal(mastery['看'], undefined); assert.deepEqual(legacy, {})
})

test('migration: two entries for one hanzi without an alias are never merged and nothing is lost', () => {
  const words = normalizeWords([raw({ id: 'a', hanzi: '看', pinyin: 'kàn', meaning: 'look', audio: 'none' }), raw({ id: 'b', hanzi: '看', pinyin: 'kān', meaning: 'guard', audio: 'none' })])
  const { mastery, legacy } = migrateMastery({ 看: lv(2, 1) }, undefined, words)
  assert.deepEqual(mastery, {}, 'ambiguous: not guessed')
  assert.deepEqual(legacy, { 看: lv(2, 1) }, 'kept for later')
  // once an alias is declared, the next load recovers it from `legacy`
  const fixed = normalizeWords([raw({ id: 'a', hanzi: '看', pinyin: 'kàn', meaning: 'look', audio: 'none', aliases: ['看'] }), raw({ id: 'b', hanzi: '看', pinyin: 'kān', meaning: 'guard', audio: 'none' })])
  const again = migrateMastery(mastery, legacy, fixed)
  assert.deepEqual(again.mastery, { a: lv(2, 1) }); assert.deepEqual(again.legacy, {})
})

test('migration: a hanzi that is used by exactly one entry follows that entry to its new id', () => {
  const words = normalizeWords([raw({ id: 'tian-1', hanzi: '天', pinyin: 'tiān', meaning: 'sky / day' })])
  assert.deepEqual(migrateMastery({ 天: lv(2) }, undefined, words).mastery, { 'tian-1': lv(2) })
})

test('migration: if both the old and the new id have progress, the higher level wins', () => {
  const words = normalizeWords([raw({ id: 'x2', hanzi: '好', pinyin: 'hǎo', meaning: 'good', aliases: ['好'] })])
  assert.deepEqual(migrateMastery({ 好: lv(1, 1), x2: lv(3) }, undefined, words).mastery, { x2: lv(3) })
  assert.deepEqual(migrateMastery({ 好: lv(3, 1), x2: lv(3) }, undefined, words).mastery, { x2: lv(3, 1) })
})

test('migration: progress for a removed entry is parked, and comes back if the entry returns', () => {
  const some = normalizeWords([raw({ hanzi: '人', pinyin: 'rén', meaning: 'person' })])
  const gone = migrateMastery({ 人: lv(2), 龙: lv(4) }, undefined, some)
  assert.deepEqual(gone.mastery, { 人: lv(2) }); assert.deepEqual(gone.legacy, { 龙: lv(4) })
  const back = normalizeWords([...some, raw({ hanzi: '龙', pinyin: 'lóng', meaning: 'dragon' })])
  assert.deepEqual(migrateMastery(gone.mastery, gone.legacy, back).mastery, { 人: lv(2), 龙: lv(4) })
})

test('migration: garbage in saved progress is cleaned, the rest survives', () => {
  const words = normalizeWords([raw({ hanzi: '人', pinyin: 'rén', meaning: 'person' })])
  const { mastery, legacy } = migrateMastery({ 人: { lv: 99, ok: -3 }, 大: 'x', 小: null }, 'nope', words)
  assert.deepEqual(mastery, { 人: lv(4, 0) }); assert.deepEqual(legacy, {})
})
