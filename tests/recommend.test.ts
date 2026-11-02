import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { recommend, categoryOnly, plainerLabel } from '../src/sources/recommend.ts'
import { suggest } from '../src/sources/match.ts'
import { parseCandidate } from '../tools/sources/adapters/anki.ts'
import type { SourceRecord } from '../src/sources/types.ts'

// Records with the ACCC deck's own field values (as imported on 2026-11-02).
const NAMES = { id: 'ID', traditional: 'Traditional', simplified: 'Simplified', pinyin: 'Pinyin', pos: 'POS', meaning: 'Meaning', audio: 'Audio', variants: 'Variants' }
function record(id: string, simplified: string, pinyin: string, pos: string, meaning: string): SourceRecord {
  const fields = { ID: id, Traditional: simplified, Simplified: simplified, Pinyin: pinyin, POS: pos, Meaning: meaning, Audio: '', Variants: '' }
  return { key: `accc-anki:${id}`, source: 'accc-anki', originalId: id, native: {}, snapshot: 'x', hash: '0123456789abcdef', fields, candidate: parseCandidate(fields, NAMES, []), media: [], issues: [] }
}
const word = (id: string) => WORDS.find(w => w.id === id)!

test('吗: a category label vs a function description is the same meaning; keep the game wording', () => {
  const r = record('B1L01-I-08', '吗', 'ma', 'Ptc', 'sentence final particle')
  const rec = recommend(r, word('吗'), WORDS)
  assert.equal(rec.meaning.verdict, 'same')
  assert.match(rec.meaning.reason, /names a grammatical category/)
  assert.equal(rec.wording.action, 'keep-game')
  assert.match(rec.wording.reason, /how to use/)
  assert.equal(rec.summary, 'Same meaning; keep the game wording.')
  const s = suggest(r, WORDS)[0]
  assert.notEqual(s.confidence, 'weak', 'no longer flagged as a weak match')
  assert.ok(!s.warnings.some(w => /different meaning/.test(w)), 'no misleading "different meaning" warning')
})

test('个: equivalent jargon labels; suggest a plain label; pronunciation is a separate, already-taught difference', () => {
  const rec = recommend(record('B1L02-II-10', '个', 'ge', 'M', 'general measure word'), word('个'), WORDS)
  assert.equal(rec.meaning.verdict, 'same')
  assert.equal(rec.wording.action, 'edit')
  assert.equal(rec.wording.suggestion, 'general counting word')
  assert.equal(rec.pronunciation.relation, 'speech')
  assert.match(rec.pronunciation.reason, /connected-speech form/)
  assert.equal(rec.summary, 'Same meaning; wording improvement suggested.')
})

test('other deck patterns: same wording, regional tones, homograph readings, several senses', () => {
  assert.equal(recommend(record('B1L01-II-04', '很', 'hěn', 'Adv', 'very'), word('很'), WORDS).wording.reason, 'Same wording.')
  const de = recommend(record('B1L02-I-03', '的', 'de', 'Ptc', 'modification marker'), word('的'), WORDS)
  assert.equal(de.meaning.verdict, 'same'); assert.equal(de.wording.action, 'keep-game')
  const py = recommend(record('B1L06-I-20', '朋友', 'péngyǒu', 'N', 'friend'), word('朋友'), WORDS)
  assert.equal(py.meaning.verdict, 'same'); assert.equal(py.pronunciation.relation, 'neutral-tone')
  const guard = recommend(record('B1L03-II-04', '看', 'kàn', 'V', 'to see, to watch'), word('看-guard'), WORDS)
  assert.equal(guard.meaning.verdict, 'different', 'kàn is the reading of 看-look, not 看-guard')
  const le = recommend(record('B2L08-I-14', '了', 'liǎo', 'Ptc', 'capability complement'), word('了'), WORDS)
  assert.equal(le.meaning.verdict, 'different', 'liǎo has other syllables than le')
  assert.ok(categoryOnly('sentence-final particle') && categoryOnly('general measure word') && !categoryOnly('measure word for books'))
  assert.equal(plainerLabel('measure word for books'), 'counting word for books')
  // A person's "different meaning" decision overrides the rules.
  assert.equal(recommend(record('B1L01-II-04', '很', 'hěn', 'Adv', 'very'), word('很'), WORDS, { distinctFrom: ['很'] }).meaning.verdict, 'different')
})

test('glosses made of common words still compare ("to be" vs "be (identity)")', () => {
  assert.equal(recommend(record('B1L01-I-06', '是', 'shì', 'Vst', 'to be'), word('是'), WORDS).meaning.verdict, 'same')
})
