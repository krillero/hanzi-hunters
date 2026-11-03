// Second source (Anki-xiehanzi New HSK 2025, HSK 1 subdeck): import scope, field parsing, audio provenance, separation of
// sources / assessments / decisions, and the committed assessed proposal. Fixtures are synthetic; the last tests read the
// committed import and assessments.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WORDS } from '../src/data.ts'
import { EXPLANATIONS } from '../src/content/index.ts'
import { readAnkiPackage } from '../tools/sources/adapters/anki.ts'
import { XIEHANZI_HSK1, parseDefinitions, parseExamples, parseXiehanzi, splitTopLevel, textOf, parseHtml } from '../tools/sources/adapters/xiehanzi.ts'
import { importSource } from '../tools/sources/importer.ts'
import { suggest } from '../src/sources/match.ts'
import {
  candidateComparisons, checkAssessmentsFile, compare, coverage, exampleFreshness, exampleHash, recordFreshness, upgradeAssessments, type AssessmentsFile
} from '../src/sources/assessment.ts'
import { validateDecisions } from '../src/sources/validate.ts'
import type { SentenceItem, SourceRecord } from '../src/sources/types.ts'
import { buildXiehanziApkg, DECKS, defs, examples, simple, type XNote } from './helpers/xiehanzi.ts'
import { fakeMp3 } from './helpers/apkg.ts'

const SRC = 'xiehanzi-new-hsk-2025-v24'
const HSK1 = DECKS['11'], HSK2 = DECKS['12']
const NOTES: XNote[] = [
  { guid: 'g1kaiopen', deck: HSK1, fields: { Simplified: '开', Pinyin: 'kāi', SimpleMeaning: simple('to switch on; open'), PartOfSpeech: '<span class="pos-chip pos-dominant">Verb</span><span class="pos-chip">Classifier</span>', Definitions: defs([['kāi', ['to open', 'to drive (a vehicle)']]]), HskLevel: 'HSK 1', Frequency: 'Top 500', Examples: examples([['门开了。', 'mén kāi le 。', 'The door opened.'], ['这车容易开。', 'zhè chē róng yì kāi 。', 'This car is easy to drive.']]), Audio: '[sound:cmn-开.mp3]' } },
  { guid: 'g2noshort', deck: HSK1, fields: { Simplified: '会', Pinyin: 'huì', SimpleMeaning: '', Definitions: defs([['kuài', ['(bound form) to reckon accounts']], ['huì', ['can', 'to know how to', 'meeting']]]), HskLevel: '', Frequency: '', Examples: '', Audio: '[sound:cmn-会.mp3]' } },
  { guid: 'g3hsk2', deck: HSK2, fields: { Simplified: '旅游', Pinyin: 'lǚ yóu', SimpleMeaning: simple('to travel'), HskLevel: 'HSK 1', Audio: '[sound:cmn-旅游.mp3]' } },
  { guid: 'g4brackets', deck: HSK1, fields: { Simplified: '吗', Pinyin: 'ma', SimpleMeaning: simple('[makes a yes; no question]'), Definitions: '<script>alert(1)</script>' + defs([['ma', ['(question particle)']]]), HskLevel: 'HSK 1', Audio: '[sound:cmn-missing.mp3]' } }
]
const MEDIA = { 'cmn-开.mp3': fakeMp3('kai'), 'cmn-会.mp3': fakeMp3('hui'), 'cmn-旅游.mp3': fakeMp3('lvyou') }
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'xh-')); const pkg = join(dir, 'x.apkg'); writeFileSync(pkg, buildXiehanziApkg(NOTES, MEDIA)); return { dir, pkg } }
const read = (s: { dir: string; pkg: string }) => readAnkiPackage({ source: SRC, file: s.pkg, mediaDir: join(s.dir, 'media'), mediaPrefix: `sources/${SRC}/media`, profile: XIEHANZI_HSK1 })

test('the beginner subset is selected by card deck membership, not by the HskLevel field', () => {
  const b = read(scratch())
  assert.deepEqual(b.records.map(r => r.originalId).sort(), ['g1kaiopen', 'g2noshort', 'g4brackets'])
  assert.ok(!b.records.some(r => r.candidate.simplified.includes('旅游')), 'HskLevel "HSK 1" in the HSK 2 deck does not pull a note in')
  assert.equal(b.report.counts.notesSelected, 3); assert.equal(b.report.counts.notesOutsideScope, 1)
  assert.ok(b.records.find(r => r.originalId === 'g2noshort')!.issues.some(i => /HskLevel is empty/.test(i)), 'an empty level field is reported, not used to drop the note')
  assert.equal(b.report.counts.mediaOutsideScope, 1, 'media of notes outside the deck are not extracted')
  assert.equal(b.report.problems['unreferenced-media'], undefined, 'and not reported one by one')
  assert.ok(b.records.every(r => r.key === `${SRC}:${r.originalId}` && r.native.guid === r.originalId && r.native.deck === HSK1), 'keys from the note GUID; deck kept')
  assert.ok(b.report.checksRan.some(c => /card membership/.test(c)))
})

test('HTML fields are parsed by structure: headings removed, readings and senses kept apart, brackets kept, missing stays missing', () => {
  const b = read(scratch())
  const kai = b.records.find(r => r.originalId === 'g1kaiopen')!.candidate
  assert.deepEqual(kai.meanings, ['to switch on', 'open'], 'the "Common Meaning" heading is not part of the meaning')
  assert.equal(kai.readings[0], 'kāi', 'decomposed Unicode pinyin is normalised to NFC with its tone mark')
  assert.deepEqual(kai.pos, ['Verb', 'Classifier']); assert.equal(kai.posDominant, 'Verb')
  assert.deepEqual(kai.definitions![0].senses, ['to open', 'to drive (a vehicle)'], 'numbered senses kept; the measure-word row does not leak into a sense')
  assert.deepEqual(kai.definitions![0].classifiers, [{ form: '个', reading: 'ge4' }])
  const hui = b.records.find(r => r.originalId === 'g2noshort')!.candidate
  assert.equal(hui.meaningMissing, true); assert.deepEqual(hui.meanings, [], 'no short meaning is invented from the definitions')
  assert.deepEqual(hui.definitions!.map(d => d.reading), ['kuài', 'huì'], 'one block per reading')
  assert.deepEqual(hui.definitions![0].senses, ['(bound form) to reckon accounts'], 'senses of another reading stay with that reading')
  const ma = b.records.find(r => r.originalId === 'g4brackets')!.candidate
  assert.deepEqual(ma.meanings, ['[makes a yes; no question]'], 'a separator inside brackets does not split')
  assert.ok(!JSON.stringify(ma.definitions).includes('alert'), 'script content in a field contributes no text and is never run')
  assert.deepEqual(splitTopLevel('yuan [unit of Chinese currency]; dollar'), ['yuan [unit of Chinese currency]', 'dollar'])
  assert.equal(textOf(parseHtml('a<script>x()</script>b<br>c')), 'ab\nc')
  // The raw fields stay verbatim.
  assert.equal(b.records.find(r => r.originalId === 'g1kaiopen')!.fields.SimpleMeaning, simple('to switch on; open'))
})

test('every example becomes its own sentence item with Chinese, pinyin and translation, linked to nothing', () => {
  const b = read(scratch())
  const s = b.content.filter((c): c is SentenceItem => c.type === 'sentence')
  assert.equal(s.length, 2)
  assert.deepEqual(s.map(x => [x.id, x.zh, x.pinyin, x.en]), [
    [`${SRC}:sentence:g1kaiopen-1`, '门开了。', 'mén kāi le 。', 'The door opened.'],
    [`${SRC}:sentence:g1kaiopen-2`, '这车容易开。', 'zhè chē róng yì kāi 。', 'This car is easy to drive.']
  ])
  assert.ok(s.every(x => x.provenance.record === `${SRC}:g1kaiopen` && x.provenance.mode === 'verbatim' && x.review.status === 'imported'))
  assert.ok(s.every(x => !x.links), 'containing 开 does not link the sentence to 开 (or to any game entry)')
  assert.deepEqual(parseExamples(examples([['一。', 'yī 。', 'One.'], ['二。', 'èr 。', 'Two.'], ['三。', 'sān 。', 'Three.']])).map(x => x.zh), ['一。', '二。', '三。'])
  assert.deepEqual(parseDefinitions(''), [])
})

test('audio: references resolve, missing files are reported, origin is unknown and pronunciation unverified', () => {
  const b = read(scratch())
  const recs = b.content.filter(c => c.type === 'recording')
  assert.equal(recs.length, 2)
  for (const r of recs) if (r.type === 'recording') {
    assert.equal(r.origin?.status, 'unknown', 'an included MP3 is never assumed to be a human recording')
    assert.equal(r.pronunciation, 'unverified')
  }
  const missing = b.records.find(r => r.originalId === 'g4brackets')!.media[0]
  assert.ok(missing.problems.includes('referenced file is not in the package') && !missing.path)
  const kai = b.records.find(r => r.originalId === 'g1kaiopen')!.media[0]
  assert.ok(kai.checks.includes('present') && kai.checks.includes('non-empty') && kai.sha256 && kai.original === 'cmn-开.mp3')
  // Decoding is reported honestly: either it ran (and this fake file fails it) or the report says it did not run.
  const ran = b.report.checksRan.find(c => /ffprobe/.test(c))!
  if (/NOT run/.test(ran)) assert.ok(!kai.checks.some(c => c.startsWith('decoded:')))
  else assert.ok(kai.problems.some(p => /ffprobe/.test(p)), 'a fake MP3 header is not reported as decoded audio')
  assert.ok(b.report.notChecked.some(n => /human speaker or text-to-speech/.test(n)))
})

test('importing the second source is idempotent and leaves the first source, mappings and game content untouched', () => {
  const s = scratch()
  const sources = join(s.dir, 'sources'), content = join(s.dir, 'content')
  mkdirSync(join(sources, 'accc-anki'), { recursive: true }); mkdirSync(content)
  for (const f of ['words.json', 'recordings.json', 'selections.json', 'sources.json', 'curricula.json']) cpSync(new URL(`../src/content/${f}`, import.meta.url), join(content, f))
  const accc = { key: 'accc-anki:B1-L01-01', hash: '0123456789abcdef' }
  writeFileSync(join(content, 'sourceMappings.json'), JSON.stringify({ schemaVersion: 1, mappings: { [accc.key]: { status: 'linked', entry: '个', recordHash: accc.hash, decision: { by: 'Kim', on: '2026-11-01', how: 'person' } } } }))
  writeFileSync(join(sources, 'accc-anki', 'manifest.json'), JSON.stringify({ schemaVersion: 1, source: 'accc-anki', adapter: 'anki-apkg', snapshot: { id: 'x', sha256: 'x', file: 'x', bytes: 1 }, counts: {} }))
  writeFileSync(join(sources, 'accc-anki', 'records.json'), JSON.stringify({ schemaVersion: 1, source: 'accc-anki', snapshot: 'x', records: [{ ...accc, source: 'accc-anki', originalId: 'B1-L01-01', native: {}, snapshot: 'x', fields: {}, candidate: { simplified: ['个'], traditional: [], readings: ['ge'], pos: [], meanings: ['measure word'], variants: [], flags: [] }, media: [], issues: [] }] }))
  writeFileSync(join(sources, 'index.json'), JSON.stringify({ schemaVersion: 1, sources: [{ id: 'accc-anki', title: 'ACCC', snapshot: 'x', records: 1 }] }))
  const snapshot = (dir: string) => Object.fromEntries(readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('.json')).map(f => [f, readFileSync(join(dir, f), 'utf8')]))
  const before = { accc: snapshot(join(sources, 'accc-anki')), content: snapshot(content) }
  importSource({ source: SRC, file: s.pkg, sourcesDir: sources, contentDir: content })
  const first = snapshot(join(sources, SRC))
  const again = importSource({ source: SRC, file: s.pkg, sourcesDir: sources, contentDir: content })
  assert.equal(again.snapshotChanged, false)
  assert.deepEqual(snapshot(join(sources, SRC)), first, 'the same package produces byte-identical files')
  assert.deepEqual(snapshot(join(sources, 'accc-anki')), before.accc, 'the first source is untouched')
  assert.deepEqual(snapshot(content), before.content, 'mappings, words, recordings, selections and curricula are untouched')
  const index = JSON.parse(readFileSync(join(sources, 'index.json'), 'utf8')) as { sources: { id: string }[] }
  assert.deepEqual(index.sources.map(x => x.id), ['accc-anki', SRC])
  assert.ok(!existsSync(join(sources, SRC, 'placement.json')), 'no book/lesson placement: nothing that looks like a course')
})

test('a local-only source\'s recordings can never be selected for gameplay', () => {
  const srcs = JSON.parse(readFileSync(new URL('../src/content/sources.json', import.meta.url), 'utf8'))
  assert.equal(srcs[SRC].media, 'local-only')
  const words = JSON.parse(readFileSync(new URL('../src/content/words.json', import.meta.url), 'utf8'))
  const rec = { id: `${SRC}:recording:x`, entry: '个', scope: 'word', file: `sources/${SRC}/media/0123456789abcdef.mp3`, sha256: 'a'.repeat(64), text: '个', provenance: { source: SRC, mode: 'verbatim' }, reading: {}, validation: 'unverified', uses: ['display'], decision: { by: 'Kim', on: '2026-11-02', how: 'person' } }
  const v = validateDecisions(words, { schemaVersion: 1, mappings: {} }, { schemaVersion: 1, recordings: [rec as never] }, { schemaVersion: 1, selections: [] }, srcs)
  assert.ok(v.errors.some(e => /local-only/.test(e)))
})

// ---- the committed import and assessed proposal -------------------------------------------------------------------------------

const committed = () => {
  const records = (JSON.parse(readFileSync(new URL(`../public/sources/${SRC}/records.json`, import.meta.url), 'utf8')) as { records: SourceRecord[] }).records
  const content = (JSON.parse(readFileSync(new URL(`../public/sources/${SRC}/content.json`, import.meta.url), 'utf8')) as { content: SentenceItem[] }).content
  const file = upgradeAssessments(JSON.parse(readFileSync(new URL(`../src/content/assessments/${SRC}.json`, import.meta.url), 'utf8')) as AssessmentsFile)
  const sentences = new Map(content.filter(c => c.type === 'sentence').map(c => [c.id, c]))
  const byWord = (w: string) => records.find(r => r.candidate.simplified[0] === w)!
  return { records, sentences, file, byWord, ctx: { records: new Map(records.map(r => [r.key, r])), words: WORDS, explanations: EXPLANATIONS, sentences } }
}

test('the committed import matches the verified package counts', () => {
  const { records, sentences } = committed()
  assert.equal(records.length, 321)
  assert.equal(records.filter(r => r.candidate.meanings.length).length, 180)
  assert.equal(records.filter(r => r.candidate.meaningMissing).length, 141)
  assert.equal(new Set([...sentences.values()].map(s => s.provenance.record)).size, 301)
  assert.equal(sentences.size, 896)
  assert.ok(records.every(r => r.media.length === 1 && r.media[0].sha256 && r.media[0].checks.includes('non-empty')))
  assert.equal(records.filter(r => r.candidate.meta?.level === '(empty)').length, 20)
})

test('same spelling does not merge meanings; example inclusion does not establish a teaching-sense link', () => {
  const { byWord, file, sentences } = committed()
  // Without assessments, every pair is only evidence.
  const bare = candidateComparisons([byWord('叫'), byWord('要'), byWord('下'), byWord('个')], WORDS, EXPLANATIONS, { kind: 'hanzi-hunters-assessments', schemaVersion: 2, assessments: [] })
  for (const { comparisons } of bare.values()) for (const c of comparisons) assert.equal(c.meaning.state, 'not-assessed', c.record)
  // 了: the declared reading is liǎo; the game reading le is found in the definitions, reported as evidence, never as the reading.
  const le = suggest(byWord('了'), WORDS)[0]
  assert.equal(le.reading, 'different'); assert.equal(le.strength, 'possible')
  assert.ok(le.evidence.some(e => /Definitions list le/.test(e.detail)))
  // The observed examples are not linked blindly: they are assessed as another sense (or not proposed at all).
  const verdict = (word: string, zh: string, entry?: string) => {
    const s = [...sentences.values()].find(x => x.provenance.record === byWord(word).key && x.zh === zh)!
    return file.examples!.find(a => a.sentence === s.id && (entry ? a.target.entry === entry : true))?.verdict
  }
  assert.equal(verdict('下', '他们下了车。', '下'), 'other-sense')
  assert.equal(verdict('会', '你会在哪里？'), 'other-sense')
  assert.equal(verdict('叫', '我叫他来的。', '叫'), 'other-sense')
  assert.equal(verdict('开', '这车容易开。'), undefined, '开 is not proposed yet, so its driving example is not linked to anything')
  assert.ok([...sentences.values()].every(s => !s.links))
})

test('assessments: complete, current, AI-assisted and unreviewed, and stale when example pinyin changes', () => {
  const { file, ctx, records, sentences } = committed()
  assert.deepEqual(checkAssessmentsFile(file, ctx), [])
  assert.equal(file.records!.length, 321, 'every source record has a disposition')
  assert.ok(file.records!.every(a => recordFreshness(a, ctx.records.get(a.record), WORDS, EXPLANATIONS) === 'current'))
  assert.ok([...file.assessments, ...file.records!, ...file.examples!].every(a => a.method === 'ai-assisted' && a.review === 'unreviewed'))
  const cov = coverage([...candidateComparisons(records, WORDS, EXPLANATIONS, file).values()].flatMap(x => x.comparisons))
  assert.equal(cov.pairs, file.assessments.length); assert.equal(cov.meaning['not-assessed'], 0)
  // Units stay apart: 107 records with candidates, 108 pairs (看 has two entries), 108 unique entries.
  assert.deepEqual([cov.records, cov.pairs, cov.entries], [107, 108, 108])
  const first = file.records!.filter(a => a.expansion === 'first')
  assert.ok(first.length >= 20 && first.length <= 30)
  assert.ok(first.every(a => a.draft && !WORDS.some(w => w.id === a.draft!.id)), 'drafts use new, stable ids')
  // Example freshness covers the pinyin.
  const a = file.examples!.find(x => x.verdict === 'suitable')!
  const s = sentences.get(a.sentence)!
  assert.equal(exampleFreshness(a, s, WORDS, EXPLANATIONS), 'current')
  assert.equal(exampleFreshness(a, { ...s, pinyin: `${s.pinyin} ` + 'x' }, WORDS, EXPLANATIONS), 'source-changed')
  assert.notEqual(exampleHash(s), exampleHash({ ...s, pinyin: s.pinyin!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC') }), 'a tone-mark change alone makes the example outdated')
  // Pair assessments become stale when the record (including its Examples field) changes.
  const pair = file.assessments[0]
  const r = ctx.records.get(pair.record)!
  const s2 = suggest(r, WORDS).find(x => x.entry === pair.entry)!
  assert.equal(compare({ ...r, hash: 'ffffffffffffffff' }, WORDS.find(w => w.id === pair.entry)!, s2, { assessment: pair, explanation: EXPLANATIONS[pair.entry] }).outdated?.freshness, 'source-changed')
})

test('nothing in the game was changed by this source: words, curricula and decisions', () => {
  const words = JSON.parse(readFileSync(new URL('../src/content/words.json', import.meta.url), 'utf8')) as { id?: string; hanzi: string }[]
  const { file } = committed()
  for (const a of file.records!.filter(x => x.draft)) assert.ok(!words.some(w => (w.id ?? w.hanzi) === a.draft!.id), `${a.draft!.id} is a draft, not an entry`)
  const curricula = readFileSync(new URL('../src/content/curricula.json', import.meta.url), 'utf8')
  assert.ok(!curricula.includes(SRC), 'no course references the source')
  const mappings = readFileSync(new URL('../src/content/sourceMappings.json', import.meta.url), 'utf8')
  const recordings = readFileSync(new URL('../src/content/recordings.json', import.meta.url), 'utf8')
  assert.ok(!mappings.includes(SRC) && !recordings.includes(SRC), 'no mapping or recording selected')
  // A source label must be the source's text; otherwise it is editorial.
  const { byWord } = committed()
  const fake = { ...file.records!.find(a => a.record === byWord('他').key)!, shortLabel: { text: 'he', basis: 'source' as const, reason: 'Pretending the source said this.' } }
  assert.ok(checkAssessmentsFile({ ...file, assessments: [], examples: [], records: [fake] }, committed().ctx).some(e => /no short meaning/.test(e)))
})

test('schema 1 assessment files are still readable', () => {
  const v1 = { kind: 'hanzi-hunters-assessments', schemaVersion: 1, assessments: [] }
  assert.deepEqual(checkAssessmentsFile(v1), [])
  assert.deepEqual(upgradeAssessments(v1 as AssessmentsFile).records, [])
  assert.ok(checkAssessmentsFile({ ...v1, records: [] }).some(e => /schemaVersion 2/.test(e)))
  assert.deepEqual(parseXiehanzi({ Simplified: '茶', Pinyin: 'chá', SimpleMeaning: simple('tea') }, []).candidate.meanings, ['tea'])
})
