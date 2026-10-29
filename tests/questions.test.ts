import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { buildQuestion, toneVariants } from '../src/game/questions.ts'

test('vocabulary data is consistent', () => {
  assert.ok(WORDS.length >= 8, 'need enough words for 4 distinct options')
  assert.equal(new Set(WORDS.map(w => w.hanzi)).size, WORDS.length, 'duplicate hanzi')
  for (const w of WORDS) {
    assert.equal(w.pinyin.normalize('NFC'), w.pinyin, `${w.hanzi}: pinyin not NFC`)
    assert.ok(toneVariants(w.pinyin).includes(w.pinyin) === false)
    assert.equal(toneVariants(w.pinyin).length, 3, `${w.hanzi}: needs a tone mark`)
    for (const c of w.confusable ?? []) assert.ok(WORDS.some(x => x.hanzi === c))
  }
})

test('toneVariants keeps the syllable and swaps only the tone', () => {
  assert.deepEqual(toneVariants('shān').sort(), ['shán', 'shǎn', 'shàn'].sort())
  assert.deepEqual(toneVariants('nǚ').sort(), ['nǖ', 'nǘ', 'nǜ'].sort())
  assert.deepEqual(toneVariants('xiǎo').sort(), ['xiāo', 'xiáo', 'xiào'].sort())
  assert.deepEqual(toneVariants('liù').sort(), ['liū', 'liú', 'liǔ'].sort())
})

const LEVELS = [undefined, { lv: 0, ok: 0 }, { lv: 1, ok: 0 }, { lv: 2, ok: 0 }, { lv: 3, ok: 0 }, { lv: 4, ok: 0 }]

test('every word at every level has 4 unique options and exactly one correct answer', () => {
  for (const w of WORDS) for (const e of LEVELS) for (let rep = 0; rep < 20; rep++) {
    const q = buildQuestion(w, e, WORDS, { canListen: true })
    const tag = `${w.hanzi} lv=${e?.lv} ${q.kind}`
    assert.equal(q.options.length, 4, tag)
    assert.equal(new Set(q.options).size, 4, `${tag}: duplicate options`)
    assert.equal(q.options.filter(o => o === q.answer).length, 1, tag)
    const expected = q.kind === 'pinyin' ? w.pinyin : q.optionsAreHanzi ? w.hanzi : w.meaning
    assert.equal(q.answer, expected, tag)
  }
})

test('levels use the intended question types and hide the tested field', () => {
  const w = WORDS[0]
  const kinds = LEVELS.map(e => buildQuestion(w, e, WORDS, { canListen: false }))
  assert.deepEqual(kinds.map(q => q.kind), ['intro', 'meaning', 'pinyin', 'meaning', 'character', 'character'])
  assert.deepEqual(kinds[0].show, { hanzi: true, pinyin: true, meaning: true })
  assert.equal(kinds[1].show.meaning, false)       // level 0 hides the meaning being tested
  assert.deepEqual(kinds[2].show, { hanzi: true, pinyin: false, meaning: false })
  assert.deepEqual(kinds[3].show, { hanzi: true, pinyin: false, meaning: false })
  assert.equal(kinds[4].show.hanzi, false)         // level 3 shows the meaning, hides the character
  assert.equal(kinds[4].show.meaning, true)
})

test('no unfair distractors: homophones in listening, overlapping meanings, tone-change readings', () => {
  const ta = WORDS.find(w => w.hanzi === '他')!, she = WORDS.find(w => w.hanzi === '她')!
  for (let i = 0; i < 200; i++) {
    const q = buildQuestion(ta, { lv: 3, ok: 0 }, WORDS, { canListen: true, rng: Math.random })
    if (q.kind === 'listen') assert.ok(!q.options.includes(she.hanzi), '她 is a homophone of 他')
  }
  const day = WORDS.find(w => w.hanzi === '日')!
  for (let i = 0; i < 100; i++) assert.ok(!buildQuestion(day, { lv: 2, ok: 0 }, WORDS).options.includes('sky / day'))
  const bu = WORDS.find(w => w.hanzi === '不')!, yi = WORDS.find(w => w.hanzi === '一')!
  for (let i = 0; i < 100; i++) {
    assert.ok(!buildQuestion(bu, { lv: 1, ok: 0 }, WORDS).options.includes('bú'))
    const o = buildQuestion(yi, { lv: 1, ok: 0 }, WORDS).options
    assert.ok(!o.includes('yí') && !o.includes('yì'))
  }
  const zhong = WORDS.find(w => w.hanzi === '中')!
  for (let i = 0; i < 100; i++) assert.ok(!buildQuestion(zhong, { lv: 2, ok: 0 }, WORDS).options.includes('country'))
})
