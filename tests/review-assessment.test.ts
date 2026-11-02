// Review screen comparisons: matching evidence, meaning assessment and wording assessment stay separate.
// Regression examples (来, 吗, 好, 要, 叫, 个) are test data, not production rules: no Chinese word is special-cased in src/sources.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WORDS } from '../src/data.ts'
import { EXPLANATIONS } from '../src/content/index.ts'
import { suggest } from '../src/sources/match.ts'
import { compareText, describePronunciation, terminologySuggestion } from '../src/sources/compare.ts'
import {
  assessmentId, candidateComparisons, checkAssessment, checkAssessmentsFile, compare, coverage, coverageLine, emptyAssessments, freshness,
  gameFingerprint, mergeAssessments, WORDING_NOT_ASSESSED, type AssessmentsFile, type SourceAssessment
} from '../src/sources/assessment.ts'
import { parseCandidate } from '../tools/sources/adapters/anki.ts'
import { loadWorkingWithNotice, REVIEW_KEY_PREFIX, LEGACY_KEY_PREFIX } from '../src/review/store.ts'
import type { Mapping, SourceRecord } from '../src/sources/types.ts'
import type { Word } from '../src/content/types.ts'

// Records with the ACCC deck's own field values (as imported on 2026-11-02).
const NAMES = { id: 'ID', traditional: 'Traditional', simplified: 'Simplified', pinyin: 'Pinyin', pos: 'POS', meaning: 'Meaning', audio: 'Audio', variants: 'Variants' }
function record(id: string, simplified: string, pinyin: string, pos: string, meaning: string, hash = '0123456789abcdef'): SourceRecord {
  const fields = { ID: id, Traditional: simplified, Simplified: simplified, Pinyin: pinyin, POS: pos, Meaning: meaning, Audio: '', Variants: '' }
  return { key: `accc-anki:${id}`, source: 'accc-anki', originalId: id, native: {}, snapshot: 'x', hash, fields, candidate: parseCandidate(fields, NAMES, []), media: [], issues: [] }
}
const word = (id: string) => WORDS.find(w => w.id === id)!
const pair = (r: SourceRecord, id: string, opts: Parameters<typeof compare>[3] = {}) => {
  const s = suggest(r, WORDS).find(x => x.entry === id)!
  return compare(r, word(id), s, { explanation: EXPLANATIONS[id], ...opts })
}
const assessment = (r: SourceRecord, id: string, over: Partial<SourceAssessment> = {}): SourceAssessment => ({
  id: assessmentId(r.key, id), record: r.key, recordHash: r.hash, entry: id, gameFingerprint: gameFingerprint(word(id), EXPLANATIONS[id]),
  meaning: { verdict: 'likely-equivalent', scope: 'same', reason: 'Same verb and reading; only the infinitive marker differs.' },
  wording: { verdict: 'keep-game', reason: 'The game omits “to” in every verb label; changing one label would be inconsistent.' },
  method: 'ai-assisted', assessor: 'test assistant', on: '2026-11-02', review: 'unreviewed', uncertainty: 'low', ...over
})
const REGRESSION = {
  lai: record('B1L01-I-05', '来', 'lái', 'V', 'to come'),
  ma: record('B1L01-I-08', '吗', 'ma', 'Ptc', 'sentence final particle'),
  haoEasy: record('B1L12-II-06', '好', 'hǎo', 'Vs', 'easy to'),
  yaoWill: record('B1L14-II-04', '要', 'yào', 'Adv', 'will, going to'),
  jiaoBark: record('B3L07-I-05', '叫', 'jiào', 'Vi', 'to bark'),
  ge: record('B1L02-II-10', '个', 'ge', 'M', 'general measure word')
}

test('same spelling and reading do not establish the same sense', () => {
  const c = pair(REGRESSION.jiaoBark, '叫')
  assert.equal(c.strength, 'strong', 'a strong candidate worth comparing…')
  assert.equal(c.meaning.state, 'not-assessed', '…but no meaning verdict without an assessment')
  assert.equal(c.headline, 'Same spelling and reading. Definitions differ; meaning assessment needed.')
  assert.ok(!/same meaning|probably/i.test(JSON.stringify(c)), 'no “same meaning” / “probably” inference anywhere')
  // The game having only one entry written with these characters changes nothing.
  assert.equal(WORDS.filter(w => w.hanzi === '叫').length, 1)
  // Generalises: unrelated words with the same spelling and reading.
  for (const [r, id] of [[record('B1L05-I-16', '点', 'diǎn', 'V', 'to order (meals)'), '点'], [record('B2L01-I-05', '下', 'xià', 'Det', 'next'), '下'], [REGRESSION.haoEasy, '好'], [REGRESSION.yaoWill, '要']] as [SourceRecord, string][])
    assert.equal(pair(r, id).meaning.state, 'not-assessed', `${r.key}`)
})

test('shared English words do not produce “same meaning”, and no shared words do not produce “different”', () => {
  const call = pair(record('B2L08-I-02', '叫', 'jiào', 'V', "to call (for someone's attention)"), '叫')
  const s = suggest(record('B2L08-I-02', '叫', 'jiào', 'V', "to call (for someone's attention)"), WORDS)[0]
  assert.deepEqual(s.sharedWords, ['call'])
  assert.equal(call.meaning.state, 'not-assessed')
  assert.equal(pair(record('B1L05-I-06', '少', 'shǎo', 'Vs-pred', 'few in number'), '少').meaning.state, 'not-assessed')
  assert.equal(pair(REGRESSION.lai, '来').meaning.state, 'not-assessed', '“to come” vs “come” is still only evidence')
  // No shared words: neutral evidence, no conflict, no “different meaning” warning, strength unaffected.
  const ma = suggest(REGRESSION.ma, WORDS)[0]
  assert.equal(ma.strength, 'strong')
  assert.ok(ma.evidence.some(e => e.aspect === 'english' && e.level === 'neutral'))
  assert.ok(!ma.warnings.some(w => /different meaning|do not overlap/.test(w)))
  assert.equal(pair(REGRESSION.ma, '吗').meaning.state, 'not-assessed')
  assert.equal(pair(REGRESSION.ge, '个').meaning.state, 'not-assessed', 'a grammatical category label is not evidence of the same use')
})

test('text comparison: exact, formatting-only, different, missing — and exact text is not a linguistic review', () => {
  assert.equal(compareText('tea', 'tea'), 'exact')
  assert.equal(compareText('I, me', 'I / me'), 'formatting')
  assert.equal(compareText('Thank you.', 'thank you'), 'formatting')
  assert.equal(compareText('to come', 'come'), 'different', 'dropping a word is not formatting')
  assert.equal(compareText('not tired', 'tired'), 'different', 'an omitted negation is not formatting')
  assert.equal(compareText('you (honorific)', 'you (polite)'), 'different', 'a synonym is not formatting')
  assert.equal(compareText('store, shop', 'shop / store'), 'different', 'word order is wording')
  assert.equal(compareText('', 'tea'), 'missing')
  const tea = pair(record('B1L01-II-03', '茶', 'chá', 'N', 'tea'), '茶')
  assert.equal(tea.text, 'exact')
  assert.equal(tea.textLabel, 'Exact text match—not a linguistic review.')
  assert.equal(tea.meaning.state, 'not-assessed', 'equal text does not confirm the definition or the sense')
  assert.equal(tea.wording.state, 'not-assessed')
  assert.equal(pair(REGRESSION.lai, '来').textLabel, 'Different wording—assessment pending.')
})

test('“not assessed” is distinguishable from an assessment to keep the game wording', () => {
  const none = pair(REGRESSION.lai, '来')
  assert.equal(none.wording.state, 'not-assessed')
  assert.equal(none.wording.label, WORDING_NOT_ASSESSED)
  assert.equal(none.wording.label, 'No change proposed. This wording has not been assessed.')
  assert.equal(none.wording.basis, 'none')
  const kept = pair(REGRESSION.lai, '来', { assessment: assessment(REGRESSION.lai, '来') })
  assert.equal(kept.wording.state, 'keep-game')
  assert.equal(kept.wording.basis, 'assessment')
  assert.match(kept.wording.label, /Keep game wording—AI-assisted assessment/)
  assert.match(kept.wording.reason!, /omits “to”/)
  assert.ok(![none, kept].some(c => /No clear improvement/.test(JSON.stringify(c))))
  // A placeholder reason is refused.
  assert.ok(checkAssessment(assessment(REGRESSION.lai, '来', { wording: { verdict: 'keep-game', reason: 'No clear improvement.' } }), 'x').some(e => /substantive/.test(e)))
})

test('AI-assisted assessments are never labelled human-reviewed or reviewer-confirmed', () => {
  const r = REGRESSION.lai
  assert.ok(checkAssessment(assessment(r, '来', { review: 'human-reviewed' }), 'x').some(e => /only a person/.test(e)))
  assert.ok(checkAssessment(assessment(r, '来', { meaning: { verdict: 'same-confirmed', reason: 'Reviewed and confirmed by me.' } }), 'x').some(e => /needs a person/.test(e)))
  assert.ok(checkAssessment(assessment(r, '来', { method: 'heuristic', wording: undefined }), 'x').some(e => /heuristic can only record "uncertain"/.test(e)))
  const c = pair(r, '来', { assessment: assessment(r, '来') })
  assert.equal(c.meaning.label, 'Likely equivalent—AI-assisted assessment')
  assert.doesNotMatch(c.meaning.label, /confirm|review/i)
  // Only a person's decision (a mapping made by a person) shows as confirmed.
  const by = (how: 'person' | 'tool'): Mapping => ({ status: 'linked', entry: '来', recordHash: r.hash, decision: { by: 'Kim', on: '2026-11-02', how } })
  assert.equal(pair(r, '来', { mapping: by('person') }).meaning.state, 'same-confirmed')
  assert.equal(pair(r, '来', { mapping: by('tool') }).meaning.state, 'not-assessed')
  const sep: Mapping = { status: 'unresolved', distinctFrom: ['叫'], recordHash: REGRESSION.jiaoBark.hash, decision: { by: 'Kim', on: '2026-11-02', how: 'person' } }
  const d = pair(REGRESSION.jiaoBark, '叫', { mapping: sep })
  assert.equal(d.meaning.state, 'different'); assert.equal(d.meaning.basis, 'reviewer'); assert.equal(d.wording.state, 'not-applicable')
  // The committed dataset: every assessment is AI-assisted and unreviewed; none claims confirmation.
  const committed = JSON.parse(readFileSync(new URL('../src/content/sourceAssessments.json', import.meta.url), 'utf8')) as AssessmentsFile
  assert.ok(committed.assessments.length > 0)
  assert.ok(committed.assessments.every(a => a.method === 'ai-assisted' && a.review === 'unreviewed' && a.meaning.verdict !== 'same-confirmed'))
})

test('editing the source record or the relevant game content makes an assessment outdated', () => {
  const r = REGRESSION.jiaoBark
  const a = assessment(r, '叫', { meaning: { verdict: 'different', scope: 'distinct', reason: 'An animal cry, not naming.' }, wording: { verdict: 'not-applicable', reason: 'Different senses: neither definition should replace the other.' } })
  assert.equal(freshness(a, r, word('叫'), EXPLANATIONS['叫']), 'current')
  const changed = { ...r, hash: 'ffffffffffffffff' }
  assert.equal(freshness(a, changed, word('叫'), EXPLANATIONS['叫']), 'source-changed')
  const edited: Word = { ...word('叫'), note: 'Another note.' }
  assert.equal(freshness(a, r, edited, EXPLANATIONS['叫']), 'game-changed')
  assert.equal(freshness(a, r, { ...word('叫'), meaning: 'be called' }, EXPLANATIONS['叫']), 'game-changed')
  assert.equal(freshness(a, r, word('叫'), { sections: [] }), 'game-changed', 'the explanation is part of what was assessed')
  const s = suggest(changed, WORDS)[0]
  const c = compare(changed, word('叫'), s, { assessment: a, explanation: EXPLANATIONS['叫'] })
  assert.equal(c.meaning.state, 'not-assessed', 'an outdated assessment is not current advice')
  assert.equal(c.outdated?.freshness, 'source-changed')
  assert.equal(c.assessment, undefined)
  assert.equal(coverage([c]).outdated, 1)
})

test('assessments never change mappings, wording, recordings or curricula', () => {
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8'))
  const files = ['words.json', 'sourceMappings.json', 'recordings.json', 'selections.json', 'curricula.json'].map(f => [f, read(f)] as const)
  const before = JSON.stringify(files) + JSON.stringify(WORDS)
  const r = REGRESSION.lai
  const ctx = { records: new Map([[r.key, r]]), words: WORDS, explanations: EXPLANATIONS }
  const res = mergeAssessments(emptyAssessments(), { ...emptyAssessments(), assessments: [{ ...assessment(r, '来'), context: { note: 'stripped on import' } }] }, ctx)
  assert.ok(res.ok, res.errors.join('; '))
  assert.deepEqual(Object.keys(res.file), ['kind', 'schemaVersion', 'assessments'], 'only an assessments file is produced')
  assert.ok(!('context' in res.file.assessments[0]))
  candidateComparisons([r], WORDS, EXPLANATIONS, res.file)
  assert.equal(JSON.stringify(files) + JSON.stringify(WORDS), before, 'no content object was mutated')
  // An edited-wording proposal is advice only: the game meaning stays.
  const proposal = assessment(REGRESSION.ge, '个', { wording: { verdict: 'edited', proposed: 'general counting word', terminology: true, reason: 'Plainer than the jargon; same function; the game note already says counting word.' } })
  const c = pair(REGRESSION.ge, '个', { assessment: proposal })
  assert.equal(c.wording.state, 'edited'); assert.equal(word('个').meaning, 'general classifier')
  // Refused imports: stale hash, or replacing a person's assessment with an AI one.
  assert.ok(!mergeAssessments(emptyAssessments(), { ...emptyAssessments(), assessments: [{ ...assessment(r, '来'), recordHash: 'aaaaaaaaaaaaaaaa' }] }, ctx).ok)
  const human = { ...emptyAssessments(), assessments: [assessment(r, '来', { method: 'human', assessor: 'Kim', review: 'human-reviewed' })] }
  assert.ok(!mergeAssessments(human, { ...emptyAssessments(), assessments: [assessment(r, '来')] }, ctx).ok)
})

test('coverage counts candidate pairs and states what was not assessed', () => {
  const recs = [REGRESSION.lai, REGRESSION.ma, REGRESSION.ge, record('X-1', '鱼', 'yú', 'N', 'fish'), record('X-2', '龙卷风', 'lóngjuǎnfēng', 'N', 'tornado')]
  const file = { ...emptyAssessments(), assessments: [assessment(REGRESSION.lai, '来'), assessment(REGRESSION.ge, '个', { wording: { verdict: 'edited', proposed: 'general counting word', terminology: true, reason: 'Plainer than the jargon; same function; the game note already says counting word.' } })] }
  const all = candidateComparisons(recs, WORDS, EXPLANATIONS, file)
  assert.equal(all.get('accc-anki:X-2')!.comparisons.length, 0, 'no matching game entry')
  const c = coverage([...all.values()].flatMap(x => x.comparisons))
  assert.equal(c.pairs, 4); assert.equal(c.records, 4); assert.equal(c.entries, 4)
  assert.equal(c.meaning['not-assessed'], 2); assert.equal(c.wording.edited, 1); assert.equal(c.wording['keep-game'], 1)
  assert.equal(coverageLine(c), '1 wording change proposed · 2 comparisons not yet assessed')
})

test('the committed assessments cover every current candidate pair of the imported source, and are current', () => {
  const records = (JSON.parse(readFileSync(new URL('../public/sources/accc-anki/records.json', import.meta.url), 'utf8')) as { records: SourceRecord[] }).records
  const file = JSON.parse(readFileSync(new URL('../src/content/sourceAssessments.json', import.meta.url), 'utf8')) as AssessmentsFile
  assert.deepEqual(checkAssessmentsFile(file, { records: new Map(records.map(r => [r.key, r])), words: WORDS, explanations: EXPLANATIONS }), [])
  const cmp = [...candidateComparisons(records, WORDS, EXPLANATIONS, file).values()].flatMap(x => x.comparisons)
  const c = coverage(cmp)
  assert.equal(c.pairs, file.assessments.length, 'one assessment per candidate pair')
  assert.equal(c.meaning['not-assessed'], 0); assert.equal(c.outdated, 0)
  assert.ok(c.records < records.length, 'records without a candidate are not assessed as if they had one')
  // Regression examples, as assessed in the data.
  const get = (id: string, entry: string) => cmp.find(x => x.record === `accc-anki:${id}` && x.entry === entry)!
  assert.equal(get('B1L01-I-05', '来').meaning.state, 'likely-equivalent')
  assert.equal(get('B1L01-I-08', '吗').meaning.state, 'likely-equivalent')
  for (const [id, e] of [['B1L12-II-06', '好'], ['B1L14-II-04', '要'], ['B3L07-I-05', '叫']]) {
    assert.equal(get(id, e).meaning.state, 'different', id); assert.equal(get(id, e).wording.state, 'not-applicable', id)
  }
  const ge = get('B1L02-II-10', '个')
  assert.equal(ge.wording.state, 'edited'); assert.equal(ge.wording.proposed, 'general counting word'); assert.equal(ge.wording.terminology, true)
  assert.match(ge.wording.reason!, /preserves the meaning/)
})

test('terminology suggestions are generic, labelled, and say nothing about meaning', () => {
  assert.equal(terminologySuggestion('general classifier')?.to, 'general counting word')
  assert.equal(terminologySuggestion('two (before classifiers)')?.to, 'two (before counting words)')
  assert.equal(terminologySuggestion('measure word for books')?.to, 'counting word for books')
  assert.equal(terminologySuggestion('tea'), undefined)
  assert.match(terminologySuggestion('general classifier')!.note, /Not a meaning assessment/)
  // A neutral-tone difference is described, not explained.
  const p = describePronunciation(record('B1L06-I-20', '朋友', 'péngyǒu', 'N', 'friend'), word('朋友'))
  assert.equal(p.relation, 'neutral-tone'); assert.match(p.text, /does not establish why/)
  assert.doesNotMatch(p.text, /regional or style difference/)
})

test('existing browser drafts survive the move to review state v2', () => {
  const mem = new Map<string, string>()
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
  const r = REGRESSION.lai
  const op = { op: 'mapping', record: r.key, recordHash: r.hash, before: null, after: { status: 'linked', entry: '来', recordHash: r.hash, decision: { by: 'Kim', on: '2026-10-01', how: 'person' } } }
  const v1 = JSON.stringify({ schemaVersion: 1, source: 'accc-anki', snapshot: 'abc', ops: { [`mapping:${r.key}`]: op, junk: { nope: 1 } } })
  mem.set(LEGACY_KEY_PREFIX + 'accc-anki', v1)
  const { state, notice } = loadWorkingWithNotice(storage, 'accc-anki', 'abc')
  assert.equal(notice?.kind, 'migrated')
  assert.deepEqual(state.ops[`mapping:${r.key}`], op, 'the decision and its provenance are kept')
  assert.equal(Object.keys(state.ops).length, 1, 'unreadable items are skipped, not invented')
  assert.equal(state.migratedFrom, 'v1')
  assert.equal(mem.get(LEGACY_KEY_PREFIX + 'accc-anki'), v1, 'the v1 drafts are left untouched')
  assert.ok(mem.has(REVIEW_KEY_PREFIX + 'accc-anki'))
  // The decision still counts as a reviewer's confirmation, not as an assessment.
  assert.equal(pair(r, '来', { mapping: (op.after as Mapping) }).meaning.basis, 'reviewer')
  // Second load: no repeated migration.
  assert.equal(loadWorkingWithNotice(storage, 'accc-anki', 'abc').notice, undefined)
  // Unreadable v2 drafts are backed up, not overwritten.
  mem.set(REVIEW_KEY_PREFIX + 'accc-anki', '{"reviewVersion":9}')
  const bad = loadWorkingWithNotice(storage, 'accc-anki', 'abc')
  assert.equal(bad.notice?.kind, 'incompatible'); assert.deepEqual(bad.state.ops, {})
  assert.equal(mem.get(bad.notice!.backupKey!), '{"reviewVersion":9}')
})

test('search ranks exact matches first and matches English only from word starts', async () => {
  const { searchScore } = await import('../src/sources/search.ts')
  const ge = record('B1L02-II-10', '个', 'ge', 'M', 'general measure word')
  const gege = record('B1L02-II-06', '哥哥', 'gēge', 'N', 'older brother')
  const sister = record('B1L02-I-19', '妹妹', 'mèimei', 'N', 'younger sister')
  const aunt = record('B1L02-II-02', '伯母', 'bómǔ', 'N', 'aunt; a polite term regardless of age')
  assert.equal(searchScore(sister, 'ge'), 0, '"younger" does not match "ge"')
  assert.equal(searchScore(aunt, 'ge'), 0, '"age" does not match "ge"')
  assert.ok(searchScore(ge, 'ge') > searchScore(gege, 'ge') && searchScore(gege, 'ge') > 0)
  assert.ok(searchScore(ge, 'gè') > 0 && searchScore(ge, '个') > searchScore(gege, '个'))
  assert.ok(searchScore(sister, 'sister') > 0 && searchScore(ge, 'measure') > 0)
})
