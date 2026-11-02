import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import wordsJson from '../src/content/words.json' with { type: 'json' }
import explanationsJson from '../src/content/explanations.json' with { type: 'json' }
import clozeJson from '../src/content/cloze.json' with { type: 'json' }
import sourcesJson from '../src/content/sources.json' with { type: 'json' }
import curriculaJson from '../src/content/curricula.json' with { type: 'json' }
import { buildApkg, fakeMp3, note } from './helpers/apkg.ts'
import { readAnkiPackage } from '../tools/sources/adapters/anki.ts'
import { readSentencesJson } from '../tools/sources/adapters/sentencesJson.ts'
import { applyChangeset, draftFromRecord, emptyMappings, emptyRecordings, emptySelections, promoteDraft, proposeEntryId, type RepoState, type SourceState } from '../src/sources/changeset.ts'
import { validateBundle } from '../src/sources/bundle.ts'
import { validateDecisions } from '../src/sources/validate.ts'
import { validateContent } from '../src/content/validate.ts'
import { decision, emptyWorking, loadWorking, mappingOp, fieldOp, opStatus, putOp, recordingOp, saveWorking, toChangeset } from '../src/review/store.ts'
import type { RawWord, Sources } from '../src/content/types.ts'
import type { SelectedRecording, SourceRecord } from '../src/sources/types.ts'

const WORDS = wordsJson as unknown as RawWord[]
const SOURCES = sourcesJson as unknown as Sources
const dir = mkdtempSync(join(tmpdir(), 'hh-cs-'))
writeFileSync(join(dir, 'deck.apkg'), buildApkg([
  note('B1-L01-01', '个', 'ge', 'measure word for people and things'),
  note('B1-L01-02', '人', 'rén', 'person; people'),
  note('B1-L03-07', '得', 'děi', 'must; to have to'),
  note('B1L04-I-01', '东西', 'dōngxi', 'thing, stuff', { Audio: '' }),
  note('B1L04-I-02', '吧', 'ba', 'suggestion particle', { POS: 'Ptc', Audio: '' }),
  note('B1L04-I-03', '台湾', 'Táiwān', 'Taiwan', { Audio: '' }),
  note('B1L04-I-04', '那边', 'nàbiān / nèibiān', 'there', { POS: 'N', Audio: '', Variants: '[{"Traditional": "那邊", "Simplified": "那边", "Pinyin": "nàbiān"}, {"Traditional": "那邊", "Simplified": "那边", "Pinyin": "nèibiān"}]' })
], { 'B1-L01-01.mp3': fakeMp3('a'), 'B1-L01-02.mp3': fakeMp3('b'), 'B1-L03-07.mp3': fakeMp3('c') }))
const bundle = readAnkiPackage({ source: 'accc-anki', file: join(dir, 'deck.apkg'), mediaDir: join(dir, 'media'), mediaPrefix: 'sources/accc-anki/media' })
const src: SourceState = { source: 'accc-anki', snapshot: bundle.snapshot.sha256, records: new Map(bundle.records.map(r => [r.key, r])) }
const rec = (k: string) => src.records.get(`accc-anki:${k}`)!
const repo = (): RepoState => ({ words: JSON.parse(JSON.stringify(WORDS)), mappings: emptyMappings(), recordings: emptyRecordings(), selections: emptySelections() })
const by = 'tester'

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const selected = (r: SourceRecord, entry: string, extra: Partial<SelectedRecording> = {}): SelectedRecording => ({
  id: `accc-anki:recording:${r.originalId}`, entry, scope: 'word', file: r.media[0].path!, sha256: r.media[0].sha256!, text: r.candidate.simplified[0],
  provenance: { source: 'accc-anki', record: r.key, recordHash: r.hash, mode: 'verbatim' }, reading: { declared: r.candidate.readings[0] },
  validation: 'unverified', uses: ['display'], decision: decision(by), ...extra
})

test('linking a record changes only the mapping: no teaching text, audio, lesson or progress id changes', () => {
  const s = repo()
  let w = emptyWorking('accc-anki', src.snapshot)
  w = putOp(w, mappingOp(s, rec('B1-L01-01'), { status: 'linked', entry: '个' }, by))
  const res = applyChangeset(s, toChangeset(w, by, src.snapshot), src)
  assert.ok(res.ok, res.conflicts.join('; '))
  assert.equal(res.state.mappings.mappings['accc-anki:B1-L01-01'].entry, '个')
  assert.deepEqual(res.state.words, s.words, 'words.json untouched')
  assert.deepEqual(res.state.recordings, s.recordings, 'no recording selected')
  assert.equal(validateContent(res.state.words, explanationsJson, clozeJson, sourcesJson, curriculaJson).errors.length, 0, 'curricula and ids still valid')
})

test('review decisions survive a reload and export to a changeset that applies', () => {
  const storage = memoryStorage()
  const s = repo()
  let w = loadWorking(storage, 'accc-anki', src.snapshot)
  w = putOp(w, mappingOp(s, rec('B1-L01-02'), { status: 'linked', entry: '人' }, by))
  w = putOp(w, recordingOp(s, rec('B1-L01-02'), '人', selected(rec('B1-L01-02'), '人', { uses: ['display', 'listen2meaning'] })))
  w = putOp(w, fieldOp(s, '人', 'meaning', s.words.find(x => x.hanzi === '人')!.meaning, { entry: '人', field: 'meaning', choice: 'game', decision: decision(by) }))
  assert.ok(saveWorking(storage, w))
  const reloaded = loadWorking(storage, 'accc-anki', src.snapshot)
  assert.deepEqual(reloaded, w)
  const res = applyChangeset(s, toChangeset(reloaded, by, src.snapshot), src)
  assert.ok(res.ok, res.conflicts.join('; '))
  assert.equal(res.state.recordings.recordings.length, 1)
  assert.deepEqual(res.state.words, s.words, '"keep the game\'s meaning" changes no text')
  assert.equal(res.state.selections.selections[0].choice, 'game')
  const v = validateDecisions(res.state.words, res.state.mappings, res.state.recordings, res.state.selections, SOURCES, src.records)
  assert.deepEqual(v.errors, [])
  // Corrupt storage starts empty instead of crashing.
  storage.setItem('hanzi-hunters-review-v1:accc-anki', '{oops')
  assert.deepEqual(loadWorking(storage, 'accc-anki', src.snapshot).ops, {})
})

test('a definition chosen from the source is written with provenance and its verbatim/adapted mode', () => {
  const s = repo()
  const cur = s.words.find(x => x.hanzi === '人')!.meaning
  const op = fieldOp(s, '人', 'meaning', cur, { entry: '人', field: 'meaning', choice: 'source', value: 'person', provenance: { source: 'accc-anki', record: rec('B1-L01-02').key, recordHash: rec('B1-L01-02').hash, mode: 'adapted' }, decision: decision(by) })
  const res = applyChangeset(s, toChangeset(putOp(emptyWorking('accc-anki', src.snapshot), op), by, src.snapshot), src)
  assert.ok(res.ok, res.conflicts.join('; '))
  const w = res.state.words.find(x => x.hanzi === '人')!
  assert.equal(w.meaning, 'person')
  assert.ok(w.source?.some(x => x.name === 'accc-anki' && x.ref === 'accc-anki:B1-L01-02' && /adapted/.test(x.note ?? '')))
})

test('stale changesets are refused as a whole: changed record, changed decision, changed game text', () => {
  const s = repo()
  let w = emptyWorking('accc-anki', src.snapshot)
  w = putOp(w, mappingOp(s, rec('B1-L01-01'), { status: 'linked', entry: '个' }, by))
  w = putOp(w, fieldOp(s, '人', 'meaning', s.words.find(x => x.hanzi === '人')!.meaning, { entry: '人', field: 'meaning', choice: 'game', decision: decision(by) }))
  const cs = toChangeset(w, by, src.snapshot)
  // 1. the source record changed in a newer import
  const changed = new Map(src.records); changed.set(rec('B1-L01-01').key, { ...rec('B1-L01-01'), hash: 'ffffffffffffffff' })
  const r1 = applyChangeset(s, cs, { ...src, snapshot: 'newer', records: changed })
  assert.equal(r1.ok, false); assert.match(r1.conflicts.join('|'), /changed since the review/)
  assert.deepEqual(r1.state, s, 'nothing applied')
  assert.equal(opStatus(cs.ops[0], s, changed), 'stale')
  // 2. someone else decided about the same record meanwhile
  const s2 = repo(); s2.mappings.mappings[rec('B1-L01-01').key] = { status: 'excluded', recordHash: rec('B1-L01-01').hash, decision: decision('other') }
  const r2 = applyChangeset(s2, cs, src)
  assert.equal(r2.ok, false); assert.match(r2.conflicts.join('|'), /mapping of accc-anki:B1-L01-01 changed/)
  // 3. the game's meaning was edited after the review
  const s3 = repo(); s3.words.find(x => x.hanzi === '人')!.meaning = 'edited by hand'
  const r3 = applyChangeset(s3, cs, src)
  assert.equal(r3.ok, false); assert.match(r3.conflicts.join('|'), /game's meaning of 人 changed/)
  assert.equal(r3.state.mappings.mappings[rec('B1-L01-01').key], undefined, 'all or nothing: the valid op is not applied either')
})

test('promoting a draft adds a validated entry but no lesson; ids distinguish readings, not English text', () => {
  const s = repo()
  assert.equal(proposeEntryId('得', 'děi', s.words), '得')
  assert.equal(proposeEntryId('看', 'kàn', s.words), '看-kan4', 'an existing spelling gets a reading-based id')
  assert.equal(proposeEntryId('人', 'rén', s.words), '人-ren2')
  s.mappings.mappings[rec('B1-L03-07').key] = { status: 'new-candidate', draft: { id: '得-dei3', hanzi: '得', pinyin: 'děi', meaning: 'must', note: 'Draft note for tests.', group: 'verbs' }, recordHash: rec('B1-L03-07').hash, decision: decision(by) }
  const p = promoteDraft(s, rec('B1-L03-07').key, src)
  assert.ok(p.ok, p.error)
  const e = p.state.words.find(w => w.id === '得-dei3')!
  assert.equal(e.review?.status, 'imported', 'never labelled human-reviewed')
  assert.equal(p.state.mappings.mappings[rec('B1-L03-07').key].status, 'linked')
  assert.deepEqual(validateContent(p.state.words, explanationsJson, clozeJson, sourcesJson, curriculaJson).errors, [])
  const inCourse = JSON.stringify(curriculaJson).includes('得-dei3')
  assert.equal(inCourse, false, 'promotion does not activate a lesson')
  // A draft missing playable fields is refused.
  const s2 = repo(); s2.mappings.mappings[rec('B1-L03-07').key] = { status: 'new-candidate', draft: { id: '得-dei3', hanzi: '得', pinyin: 'děi', meaning: 'must' }, recordHash: rec('B1-L03-07').hash, decision: decision(by) }
  assert.match(promoteDraft(s2, rec('B1-L03-07').key, src).error ?? '', /note, group/)
})

test('same spelling and same reading as an existing entry is refused explicitly (no ambiguous questions)', () => {
  const ren = WORDS.find(w => w.hanzi === '人')!
  const dup: RawWord = { id: '人-other', hanzi: '人', pinyin: ren.pinyin, meaning: 'another meaning', group: ren.group, note: 'x' }
  const errs = validateContent([...WORDS.map(w => (w.hanzi === '人' ? { ...w, id: '人' } : w)), dup], explanationsJson, clozeJson, sourcesJson).errors
  assert.match(errs.join('|'), /same hanzi and pinyin as entry "人"/)
})

test('a second adapter contributes sentences and exercises through the same model', () => {
  const b = readSentencesJson({ source: 'demo-sentences', file: new URL('./fixtures/sources/sentences-demo.json', import.meta.url).pathname })
  const ids = new Set(WORDS.map(w => w.id ?? w.hanzi))
  assert.deepEqual(validateBundle(b, ids), [])
  const s = b.content.find(c => c.type === 'sentence')!
  assert.ok(s.type === 'sentence' && s.links?.some(l => l.entry === '个' && l.role === 'contains'))
  assert.equal(s.links?.length, 5, 'exactly the declared links: nothing is inferred from the characters of the sentence')
  assert.equal(b.exercises.length, 2)
  assert.ok(b.exercises.every(e => e.content.includes(s.id)), 'one sentence supports two exercises; the sentence is stored once')
  assert.equal(b.content.filter(c => c.type === 'sentence').length, 1)
  // An accepted alternative offered next to the answer, and links to unknown entries, are rejected.
  const bad = { ...b, exercises: [{ ...b.exercises[0], answer: { accept: ['个', '的'], choices: ['个', '的', '很'] } }], content: [{ ...s, links: [{ entry: 'nope', role: 'contains' as const }] }] }
  const errs = validateBundle(bad, ids).join('|')
  assert.match(errs, /accepted alternative/); assert.match(errs, /unknown entry "nope"/)
})

test('drafts carry the game\'s pronunciation conventions and promote cleanly: neutral tone, particle, names, variants', () => {
  const promote = (key: string, group = 'test') => {
    const s = repo()
    const d = { ...draftFromRecord(rec(key), s.words), note: 'Draft note for tests.', group }
    s.mappings.mappings[rec(key).key] = { status: 'new-candidate', draft: d, recordHash: rec(key).hash, decision: decision(by) }
    const p = promoteDraft(s, rec(key).key, src)
    assert.ok(p.ok, p.error)
    assert.deepEqual(validateContent(p.state.words, explanationsJson, clozeJson, sourcesJson, curriculaJson).errors, [], `${key} must pass the playable-entry validation`)
    return { d, e: p.state.words.find(w => (w.id ?? w.hanzi) === p.id)! }
  }
  const dx = promote('B1L04-I-01')
  assert.deepEqual(dx.d.neutral, [2]); assert.deepEqual(dx.e.neutral, [2], 'dōngxi: the unmarked second syllable is declared neutral')
  const ba = promote('B1L04-I-02')
  assert.equal(ba.e.kind, 'particle'); assert.deepEqual(ba.e.neutral, [1])
  const tw = promote('B1L04-I-03')
  assert.equal(tw.e.pinyin, 'táiwān', 'the game requires lowercase pinyin; the source capitalises names')
  const na = promote('B1L04-I-04')
  assert.equal(na.e.pinyin, 'nàbiān'); assert.deepEqual(na.e.variants, ['nèibiān'], 'the other reading is kept as an accepted variant (never a wrong answer)')
  // A stale or missing neutral list in a hand-edited draft cannot break promotion: it is recomputed from the pinyin.
  const s = repo()
  s.mappings.mappings[rec('B1L04-I-01').key] = { status: 'new-candidate', draft: { id: '东西', hanzi: '东西', pinyin: 'dōngxi', meaning: 'thing', note: 'n', group: 'g' }, recordHash: rec('B1L04-I-01').hash, decision: decision(by) }
  assert.deepEqual(promoteDraft(s, rec('B1L04-I-01').key, src).state.words.at(-1)!.neutral, [2])
})

test('an edited wording is written as the reviewer\'s own text; "different meaning" is a recorded decision', () => {
  const s = repo()
  const ge = s.words.find(w => (w.id ?? w.hanzi) === '个')!
  let w = emptyWorking('accc-anki', src.snapshot)
  w = putOp(w, mappingOp(s, rec('B1-L01-01'), { status: 'linked', entry: '个' }, by))
  w = putOp(w, fieldOp(s, '个', 'meaning', ge.meaning, { entry: '个', field: 'meaning', choice: 'edited', value: 'general counting word', provenance: { source: 'accc-anki', record: rec('B1-L01-01').key, recordHash: rec('B1-L01-01').hash, mode: 'authored' }, decision: decision(by) }))
  // 人 record: a person says it is not the meaning of 人 (kept unresolved, but remembered).
  w = putOp(w, mappingOp(s, rec('B1-L01-02'), { status: 'unresolved', distinctFrom: ['人'] }, by))
  assert.equal(Object.keys(w.ops).length, 3, '"different meaning" on an unresolved record is a real decision, not a no-op')
  const res = applyChangeset(s, toChangeset(w, by, src.snapshot), src)
  assert.ok(res.ok, res.conflicts.join('; '))
  const after = res.state.words.find(x => (x.id ?? x.hanzi) === '个')!
  assert.equal(after.meaning, 'general counting word')
  assert.ok(after.source?.some(x => x.ref === rec('B1-L01-01').key && /written by a reviewer \(tester\)/.test(x.note ?? '')), 'labelled as the reviewer\'s wording, not as source text')
  assert.equal(after.review?.status, ge.review?.status, 'the entry\'s review status is not changed')
  assert.deepEqual(res.state.mappings.mappings[rec('B1-L01-02').key].distinctFrom, ['人'])
  assert.deepEqual(validateDecisions(res.state.words, res.state.mappings, res.state.recordings, res.state.selections, SOURCES, src.records).errors, [])
  assert.deepEqual(validateContent(res.state.words, explanationsJson, clozeJson, sourcesJson, curriculaJson).errors, [])
  // Linking to an entry that is also marked "different meaning" is refused.
  const bad = putOp(emptyWorking('accc-anki', src.snapshot), mappingOp(s, rec('B1-L01-02'), { status: 'linked', entry: '人', distinctFrom: ['人'] }, by))
  assert.match(applyChangeset(s, toChangeset(bad, by, src.snapshot), src).conflicts.join('|'), /also marked as a different meaning/)
})
