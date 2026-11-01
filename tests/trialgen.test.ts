import test from 'node:test'
import assert from 'node:assert/strict'
import { toneTrials, noteTrials, EXAMPLE_LINES, GEN_PREFIX } from '../src/game/trialgen.ts'
import { validateTrials, offerTrial, trialFor, trialKey, cleanTrial, generatedTrials, TRIALS, optionKeys } from '../src/game/trials.ts'
import { noteRecent, freshFirst, cleanRecent, RECENT_MAX } from '../src/game/recent.ts'
import { offer, sceneKey } from '../src/game/encounters.ts'
import { splitSyllables, soundKey } from '../src/content/pinyin.ts'
import { enemyStats, newRun, shieldFor } from '../src/game/rules.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { ENEMIES, GEAR, WORDS, ACTIVE_CURRICULUM } from '../src/data.ts'
import { stepsOf } from '../src/game/course.ts'
import type { Mastery, Run } from '../src/game/types.ts'

const wordIds = WORDS.map(w => w.id)
const course = [...new Set(stepsOf(ACTIVE_CURRICULUM).map(s => s.intro.entryId))]
const knowing = (ids: string[]): Mastery => Object.fromEntries(ids.map(id => [id, { lv: 1, ok: 0 }]))
const everything = knowing(wordIds)
const seeded = (seed: number) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) }
const HANZI = /\p{Script=Han}/u

test('recent list: newest first, no duplicates, capped; fresh items first, everything when all are recent', () => {
  let r: string[] = []
  for (let i = 0; i < RECENT_MAX + 3; i++) r = noteRecent(r, `trial:${i}`)
  assert.equal(r.length, RECENT_MAX); assert.equal(r[0], `trial:${RECENT_MAX + 2}`)
  assert.deepEqual(noteRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'])
  assert.deepEqual(freshFirst([1, 2, 3], String, ['1', '2']), [3])
  assert.deepEqual(freshFirst([1, 2], String, ['1', '2']), [1, 2])
  assert.deepEqual(cleanRecent(['a', 'a', 5, '', 'b']), ['a', 'b']); assert.deepEqual(cleanRecent('junk'), [])
})

test('every generated tone trial is valid and changes one stable syllable by one tone, never into a sandhi or variant reading', () => {
  for (const seed of [1, 2, 3]) {
    const made = toneTrials(everything, seeded(seed))
    assert.ok(made.length > 50, `only ${made.length}`)
    assert.deepEqual(validateTrials({ trials: made }, wordIds), [])
    for (const t of made) {
      assert.ok(t.id.startsWith(GEN_PREFIX)); assert.equal(t.options[0], t.answer); assert.equal(new Set(t.options).size, 3)
      const chars = [...t.zh].filter(ch => HANZI.test(ch)), a = splitSyllables(t.answer.replace(/[^\p{L}\s'’-]/gu, ' '))!
      for (const o of t.options.slice(1)) {
        const b = splitSyllables(o.replace(/[^\p{L}\s'’-]/gu, ' '))!
        const diff = a.map((s, k) => (s.tone !== b[k].tone ? k : -1)).filter(k => k >= 0)
        assert.equal(diff.length, 1, `${t.zh}: ${o}`)
        const k = diff[0]
        assert.notEqual(a[k].tone, 0); assert.ok(!(a[k].tone === 3 && b[k].tone === 2), `${t.zh}: ${o} is a sandhi reading`)
        assert.ok(!['一', '不'].includes(chars[k]), `${t.zh}: changed ${chars[k]}`)
        for (const w of WORDS.filter(x => x.hanzi === t.zh)) for (const v of [w.pinyin, ...w.variants, ...w.speech.map(s => s.pinyin)]) assert.notEqual(soundKey(o), soundKey(v), `${t.zh}: ${o} is a reading of ${w.id}`)
      }
    }
  }
})

test('every generated torn note is valid, hides a character that is not shown elsewhere, and no wrong option makes a real word', () => {
  const real = new Set(WORDS.map(w => w.hanzi))
  for (const seed of [1, 2, 3]) {
    const made = noteTrials(everything, seeded(seed))
    assert.ok(made.length > 20, `only ${made.length}`)
    assert.deepEqual(validateTrials({ trials: made }, wordIds), [])
    for (const t of made) {
      assert.ok(!t.zh.replace('＿', '').includes(t.answer), `${t.zh} shows ${t.answer}`)
      assert.ok(real.has(t.zh.replace('＿', t.answer)))
      for (const o of t.options.filter(o => o !== t.answer)) assert.ok(!real.has(t.zh.replace('＿', o)), `${t.zh} + ${o} is a word`)
      for (const o of t.options) assert.ok(WORDS.some(w => w.hanzi === o || w.hanzi.includes(o)))
    }
  }
})

test('generation follows what the player knows: tone trials from the first words, notes once there are two-character words', () => {
  const first5 = knowing(course.slice(0, 5)), first40 = knowing(course.slice(0, 40))
  assert.ok(toneTrials(first5).length >= 3)
  for (const t of [...toneTrials(first40), ...noteTrials(first40)]) assert.ok(t.requires.every(id => id in first40), t.id)
  assert.ok(noteTrials(first40).length >= 5)
  assert.ok(EXAMPLE_LINES.length > 10)
})

/** The floor-1 Golem fight with its first shield segment just broken. */
const golem = (): Run => {
  const r = newRun(NO_BONUSES, GEAR, ENEMIES)
  return { ...r, floor: 1, kill: 3, phase: 'fighting', enemyHp: enemyStats(ENEMIES, 1, 3, r.depth).hp, shield: shieldFor(1, 'golem') - 1 }
}

test('offers mix authored and generated trials and skip recent ones while others exist', () => {
  const m = knowing(course.slice(0, 20)), rng = seeded(7)
  const seen = new Set<string>()
  let recent: string[] = [], repeats = 0, authored = 0, generated = 0
  for (let i = 0; i < 30; i++) {
    const t = offerTrial(golem(), m, ENEMIES, rng, recent).trial!
    if (recent.includes(trialKey(t.id))) repeats++
    recent = noteRecent(recent, trialKey(t.id)); seen.add(t.id)
    if (t.id.startsWith(GEN_PREFIX)) { generated++; assert.ok(t.data) } else authored++
  }
  assert.equal(repeats, 0); assert.ok(authored > 3 && generated > 3, `${authored}/${generated}`); assert.ok(seen.size >= 20)
})

test('a generated trial survives a reload; tampered data is dropped (the trial closes)', () => {
  const m = knowing(course.slice(0, 20))
  const gen = generatedTrials('golem', m, seeded(3))[0]
  const run: Run = { ...golem(), trial: { id: gen.id, floor: 1, order: optionKeys(gen), status: 'pending', data: gen } }
  const s = sanitizeSave(null); s.run = run; s.mastery = m
  const loaded = sanitizeSave(JSON.parse(JSON.stringify(s))).run!.trial!
  assert.deepEqual(loaded, run.trial); assert.deepEqual(trialFor(loaded), gen)
  assert.equal(cleanTrial({ ...run.trial, data: { ...gen, answer: 'nonsense' } })!.status, 'done')
  assert.equal(cleanTrial({ ...run.trial, data: { ...gen, id: 'hello' } })!.status, 'done')
  assert.ok(TRIALS.every(t => !t.id.startsWith(GEN_PREFIX)))
})

test('encounter offers skip recently offered scenes and remember the new one', () => {
  const s = sanitizeSave(null)
  s.run = { ...newRun(NO_BONUSES, GEAR, ENEMIES), phase: 'victory' as const, kill: 3, enemyHp: 0 }
  s.mastery = knowing(['你好', '再见', '谢谢', '对不起'])
  const first = offer(s, seeded(1))
  const id = first.run!.encounter!.id
  assert.equal(first.recentEvents![0], sceneKey(id))
  const again = offer({ ...s, recentEvents: [sceneKey(id)] }, seeded(1))
  assert.notEqual(again.run!.encounter!.id, id)
})
