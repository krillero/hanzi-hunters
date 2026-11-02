import test from 'node:test'
import assert from 'node:assert/strict'
import wordsJson from '../src/content/words.json' with { type: 'json' }
import explanationsJson from '../src/content/explanations.json' with { type: 'json' }
import clozeJson from '../src/content/cloze.json' with { type: 'json' }
import sourcesJson from '../src/content/sources.json' with { type: 'json' }
import { validateContent } from '../src/content/validate.ts'
import { EXPLANATIONS, getExplanation, hasExplanation } from '../src/content/index.ts'

const W = [{ hanzi: '他', pinyin: 'tā', meaning: 'he', group: 'people', note: 'n' }, { hanzi: '她', pinyin: 'tā', meaning: 'she', group: 'people', note: 'n' }]
const ok = { summary: 's', sections: [{ type: 'text', body: 'b' }] }
const errs = (words: unknown, ex: unknown) => validateContent(words, ex).errors

test('the shipped content has no validation errors', () => {
  const { errors } = validateContent(wordsJson, explanationsJson, clozeJson, sourcesJson)
  assert.deepEqual(errors, [])
})

test('shipped explanations: him/her are explained, link to each other, and are reachable via the API', () => {
  assert.ok(hasExplanation('他') && hasExplanation('她') && !hasExplanation('七'))
  assert.ok(getExplanation('她')!.related!.includes('他') && getExplanation('他')!.related!.includes('她'))
  assert.ok(Object.keys(EXPLANATIONS).length >= 3)
})

test('validator accepts a minimal valid file', () => { assert.deepEqual(errs(W, { 他: ok }), []) })

test('validator catches bad words', () => {
  assert.match(errs([{ ...W[0], extra: 1 }], {}).join('|'), /unknown field "extra"/)
  assert.match(errs([W[0], W[0]], {}).join('|'), /duplicate id/)
  assert.match(errs([{ ...W[0], pinyin: 'ta1' }], {}).join('|'), /tone numbers/)
  assert.match(errs([{ ...W[0], pinyin: 'ma' }], {}).join('|'), /no tone mark/)
  assert.match(errs([{ ...W[0], pinyin: 'Tā' }], {}).join('|'), /lowercase/)
  assert.match(errs([{ ...W[0], meaning: '' }], {}).join('|'), /"meaning" must be a non-empty string/)
  assert.match(errs([{ ...W[0], confusable: ['x'] }], {}).join('|'), /confusable "x" is not an entry id/)
  assert.match(errs('nope', {}).join('|'), /must be an array/)
})

test('validator catches bad explanations with a precise path', () => {
  assert.match(errs(W, { 龙: ok }).join('|'), /key is not an entry id in words.json/)
  assert.match(errs(W, { 他: { sections: ok.sections } }).join('|'), /\.summary: required/)
  assert.match(errs(W, { 他: { summary: 's', sections: [] } }).join('|'), /sections: must be a non-empty array/)
  assert.match(errs(W, { 他: { ...ok, sections: [{ type: 'poem', body: 'x' }] } }).join('|'), /not one of text, tips, breakdown, compare, examples/)
  assert.match(errs(W, { 他: { ...ok, sections: [{ type: 'tips', items: [] }] } }).join('|'), /items: 1-6 strings/)
  assert.match(errs(W, { 他: { ...ok, sections: [{ type: 'text', body: 'x', bogus: 1 }] } }).join('|'), /unknown field "bogus"/)
  assert.match(errs(W, { 他: { ...ok, sections: [{ type: 'breakdown', parts: [{ char: '亻', meaning: '' }] }] } }).join('|'), /parts\[0\]\.meaning/)
  assert.match(errs(W, { 他: { ...ok, sections: [{ type: 'examples', items: [{ zh: '他。', pinyin: 'ta1', en: 'He.' }] }] } }).join('|'), /tone marks, not numbers/)
  assert.match(errs(W, { 他: { ...ok, related: ['她', '龙'] } }).join('|'), /"龙" is not an entry id/)
  assert.match(errs(W, { 他: { ...ok, related: ['他'] } }).join('|'), /must not list itself/)
  assert.match(errs(W, { 他: { ...ok, summary: 'x'.repeat(400) } }).join('|'), /max 300/)
  assert.match(errs(W, { 他: { ...ok, extra: 1 } }).join('|'), /unknown field "extra"/)
  assert.match(errs(W, []).join('|'), /must be an object keyed by hanzi/)
})

test('characters outside the vocabulary only warn', () => {
  const { errors, warnings } = validateContent(W, { 他: { ...ok, sections: [{ type: 'text', body: '也 is shared' }] } })
  assert.deepEqual(errors, []); assert.match(warnings.join('|'), /outside the vocabulary \(也\)/)
})

test('noun / measure fields: a noun is true or absent; a measure word is an entry id, only on nouns', () => {
  const base = { hanzi: '人', pinyin: 'rén', meaning: 'person', group: 'people', note: 'n' }, ge = { hanzi: '个', pinyin: 'gè', meaning: 'classifier', group: 'grammar', note: 'n' }
  assert.deepEqual(errs([{ ...base, noun: true, measure: '个' }, ge], {}), [])
  assert.match(errs([{ ...base, noun: 'yes' }, ge], {}).join(), /"noun" is either true/)
  assert.match(errs([{ ...base, measure: '个' }, ge], {}).join(), /only for nouns/)
  assert.match(errs([{ ...base, noun: true, measure: '本' }, ge], {}).join(), /measure "本" is not an entry id/)
  const shipped = (wordsJson as { hanzi: string; noun?: boolean; measure?: string }[])
  assert.ok(shipped.filter(w => w.noun).length >= 20, 'enough nouns for generated events')
  assert.ok(shipped.filter(w => w.measure).every(w => w.noun && shipped.some(x => x.hanzi === w.measure)))
})
