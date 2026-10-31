import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { ORDER_BLOCK, RECENT_PENALTY, orderedWords, pickWord, updateMastery } from '../src/game/mastery.ts'
import { sanitizeHabit } from '../src/game/habit.ts'
import type { Mastery } from '../src/game/types.ts'

test('word order: seed 0 is the file order; a seed shuffles only inside blocks', () => {
  assert.deepEqual(orderedWords(WORDS, 0).map(w => w.hanzi), WORDS.map(w => w.hanzi))
  const o = orderedWords(WORDS, 12345)
  assert.equal(o.length, WORDS.length); assert.deepEqual(new Set(o.map(w => w.hanzi)), new Set(WORDS.map(w => w.hanzi)), 'same words, nothing lost')
  assert.deepEqual(o.map(w => w.hanzi), orderedWords(WORDS, 12345).map(w => w.hanzi), 'same seed, same order')
  o.forEach((w, i) => assert.equal(Math.floor(WORDS.findIndex(x => x.hanzi === w.hanzi) / ORDER_BLOCK), Math.floor(i / ORDER_BLOCK), `${w.hanzi} stays in its block (easy words stay early)`))
  assert.notDeepEqual(o.map(w => w.hanzi), orderedWords(WORDS, 999).map(w => w.hanzi))
})

/** First `n` questions of a fresh profile, always answered right. */
function firstWords(seed: number, n: number, recent: boolean) {
  const words = orderedWords(WORDS, seed); let m: Mastery = {}; let cur: string | null = null; const seen: string[] = []; const last: string[] = []
  let s = seed || 1; const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  for (let k = 0; k < n; k++) {
    const w = pickWord(words, m, cur, rng, recent ? last : []); cur = w.hanzi; if (!seen.includes(w.hanzi)) seen.push(w.hanzi)
    last.unshift(w.hanzi); last.length = Math.min(last.length, 8); m = updateMastery(m, w.hanzi, true)
  }
  return seen
}

test('fresh profiles with different seeds start with different words (the old behaviour: always the same 8)', () => {
  const all = new Set<string>(); const sixes = new Set<string>()
  for (let seed = 1; seed <= 60; seed++) { const seen = firstWords(seed, 12, true); seen.forEach(h => all.add(h)); sixes.add(seen.slice(0, 4).join('')) }
  const legacy = new Set<string>(); for (let k = 0; k < 20; k++) firstWords(0, 12, false).forEach(h => legacy.add(h))
  assert.ok(legacy.size <= 10, `file order only ever shows ${legacy.size} words`)
  assert.ok(all.size >= 14, `seeded profiles reach ${all.size} different words in their first 12 questions`)
  assert.ok(sixes.size >= 30, `${sixes.size} different openings in 60 profiles`)
})

test('recently asked words come back less often, but still can', () => {
  const m: Mastery = Object.fromEntries(WORDS.slice(0, 10).map(w => [w.hanzi, { lv: 2, ok: 0 }]))
  let s = 7; const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const recent = [WORDS[1].hanzi, WORDS[2].hanzi, WORDS[3].hanzi]
  const count = (r: string[]) => { const c: Record<string, number> = {}; for (let k = 0; k < 4000; k++) { const h = pickWord(WORDS, m, WORDS[0].hanzi, rng, r).hanzi; c[h] = (c[h] ?? 0) + 1 } return c }
  const plain = count([]), pen = count(recent)
  for (const h of recent) { assert.ok(pen[h] < plain[h] * 0.5, `${h} is asked clearly less right after being asked`); assert.ok(pen[h] > 0, 'but not never') }
  assert.equal(RECENT_PENALTY.every(p => p > 0 && p < 1), true)
  // a pool of one word still works
  assert.equal(pickWord([WORDS[0], WORDS[1]], { [WORDS[1].hanzi]: { lv: 1, ok: 0 } }, WORDS[0].hanzi, rng, [WORDS[1].hanzi]).hanzi, WORDS[1].hanzi)
})

test('habit seed is validated; old saves have seed 0', () => {
  assert.equal(sanitizeHabit({}).seed, 0); assert.equal(sanitizeHabit({ seed: 42.9 }).seed, 42)
  assert.equal(sanitizeHabit({ seed: 'x' }).seed, 0); assert.equal(sanitizeHabit({ seed: -5 }).seed, 0)
})
