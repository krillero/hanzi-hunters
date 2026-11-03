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
  assessmentId, candidateComparisons, checkAssessment, checkAssessmentsFile, compare, coverage, coverageLine, decisionOutdated, emptyAssessments, freshness,
  gameFingerprint, mergeAssessments, shortStatus, WORDING_NOT_ASSESSED, type AssessmentsFile, type SourceAssessment
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
  // A source broader than the included uses (included + deferred) is never adopted whole; an edited, narrower text is fine.
  const broader = { verdict: 'likely-equivalent' as const, scope: 'source-broader' as const, reason: 'The source adds a deferred use to the taught one.' }
  assert.ok(checkAssessment(assessment(REGRESSION.lai, '来', { meaning: broader, wording: { verdict: 'prefer-source', proposed: 'come; arrive; take place', reason: 'The source lists more uses than the game label.' } }), 'x').some(e => /broader than the entry's included uses/.test(e)))
  assert.deepEqual(checkAssessment(assessment(REGRESSION.lai, '来', { meaning: broader, wording: { verdict: 'keep-game', reason: 'The included use is already named; the extra uses are deferred.' } }), 'x'), [])
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
  const committed = JSON.parse(readFileSync(new URL('../src/content/assessments/accc-anki.json', import.meta.url), 'utf8')) as AssessmentsFile
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
  assert.deepEqual(Object.keys(res.file), ['kind', 'schemaVersion', 'assessments', 'records', 'examples'], 'only an assessments file is produced')
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

test('the committed assessments cover every current candidate pair of the imported source; outdated ones only by the fingerprint change', () => {
  const records = (JSON.parse(readFileSync(new URL('../public/sources/accc-anki/records.json', import.meta.url), 'utf8')) as { records: SourceRecord[] }).records
  const file = JSON.parse(readFileSync(new URL('../src/content/assessments/accc-anki.json', import.meta.url), 'utf8')) as AssessmentsFile
  assert.deepEqual(checkAssessmentsFile(file, { records: new Map(records.map(r => [r.key, r])), words: WORDS, explanations: EXPLANATIONS }), [])
  const cmp = [...candidateComparisons(records, WORDS, EXPLANATIONS, file).values()].flatMap(x => x.comparisons)
  const c = coverage(cmp)
  assert.equal(c.pairs, file.assessments.length, 'one assessment per candidate pair')
  // The 2026-11-03 fingerprint (example pinyin and notes) outdated 66 pairs. They stay outdated until really reassessed:
  // no tool refreshes their hashes, and every one is outdated for that reason only, not because content changed.
  assert.equal(c.outdated, 66); assert.equal(c.meaning['not-assessed'], 66)
  assert.ok(cmp.every(x => !x.outdated || x.outdated.freshness === 'check-changed'))
  assert.ok(c.records < records.length, 'records without a candidate are not assessed as if they had one')
  // Regression examples, as assessed in the data.
  const get = (id: string, entry: string) => cmp.find(x => x.record === `accc-anki:${id}` && x.entry === entry)!
  assert.equal(get('B1L01-I-05', '来').meaning.state, 'likely-equivalent')
  for (const [id, e] of [['B1L12-II-06', '好'], ['B1L14-II-04', '要']]) {
    assert.equal(get(id, e).meaning.state, 'different', id); assert.equal(get(id, e).wording.state, 'not-applicable', id)
  }
  // Outdated by the fingerprint change: kept as history with the original verdicts, not shown as advice.
  for (const [id, e] of [['B1L01-I-08', '吗'], ['B3L07-I-05', '叫'], ['B1L02-II-10', '个']]) assert.equal(get(id, e).outdated?.freshness, 'check-changed', id)
  const ge = get('B1L02-II-10', '个').outdated!.assessment
  assert.equal(ge.wording?.verdict, 'edited'); assert.equal(ge.wording?.proposed, 'general counting word'); assert.equal(ge.wording?.terminology, true)
  assert.equal(get('B3L07-I-05', '叫').outdated!.assessment.meaning.verdict, 'different')
})

test('outdated reviewer decisions keep their history but give no current verdict', () => {
  const r = REGRESSION.lai
  const linked: Mapping = { status: 'linked', entry: '来', recordHash: r.hash, decision: { by: 'Kim', on: '2026-11-02', how: 'person' } }
  assert.equal(decisionOutdated(linked, r), undefined)
  // Flagged by the importer for reassessment.
  const flagged = pair(r, '来', { mapping: { ...linked, reassess: 'source record changed' } })
  assert.equal(flagged.meaning.state, 'not-assessed'); assert.equal(flagged.meaning.basis, 'none')
  assert.doesNotMatch(flagged.meaning.label, /confirmed/)
  assert.deepEqual(flagged.outdatedDecision, { verdict: 'same', by: 'Kim', on: '2026-11-02', why: 'source record changed' })
  assert.match(shortStatus(flagged), /decision outdated/)
  // Made against an older version of the record (no flag yet).
  const older = pair(r, '来', { mapping: { ...linked, recordHash: 'ffffffffffffffff' } })
  assert.equal(older.meaning.state, 'not-assessed'); assert.equal(older.outdatedDecision?.why, 'the source record changed since this decision')
  // A current assessment still shows as advice, with its own provenance, not overridden by the stale decision.
  const advised = pair(r, '来', { mapping: { ...linked, reassess: 'source record changed' }, assessment: assessment(r, '来') })
  assert.equal(advised.meaning.state, 'likely-equivalent'); assert.equal(advised.meaning.basis, 'assessment')
  assert.equal(advised.meaning.label, 'Likely equivalent—AI-assisted assessment')
  assert.ok(advised.outdatedDecision)
  // A stale "different sense" decision: no current "different" verdict and wording is not forced to not-applicable.
  const sep: Mapping = { status: 'unresolved', distinctFrom: ['叫'], recordHash: 'ffffffffffffffff', decision: { by: 'Kim', on: '2026-11-02', how: 'person' } }
  const d = pair(REGRESSION.jiaoBark, '叫', { mapping: sep })
  assert.equal(d.meaning.state, 'not-assessed'); assert.notEqual(d.wording.state, 'not-applicable')
  assert.equal(d.outdatedDecision?.verdict, 'different')
  const d2 = pair(REGRESSION.jiaoBark, '叫', { mapping: { ...sep, recordHash: REGRESSION.jiaoBark.hash, reassess: 'record removed' } })
  assert.equal(d2.meaning.state, 'not-assessed')
  // Filters and summaries: counted apart from outdated assessments.
  const cov = coverage([flagged, older, d])
  assert.equal(cov.decisionsOutdated, 3); assert.equal(cov.meaning['same-confirmed'], 0); assert.equal(cov.meaning.different, 0)
  assert.match(coverageLine(cov), /3 reviewer decisions outdated/)
})

test('the game fingerprint covers example pinyin and teaching fields, and ignores presentation and provenance', () => {
  const w = word('叫')
  const ex = EXPLANATIONS['叫']!
  const base = gameFingerprint(w, ex)
  assert.equal(gameFingerprint(w, structuredClone(ex)), base, 'deterministic: the same content gives the same fingerprint')
  const firstExamples = ex.sections.findIndex(sec => sec.type === 'examples')
  assert.ok(firstExamples >= 0, '叫 has examples')
  const editExample = (fn: (x: { zh: string; pinyin: string; en: string; note?: string; audio?: boolean; review?: unknown }) => void) => {
    const copy = structuredClone(ex)
    const sec = copy.sections[firstExamples]
    if (sec.type === 'examples') fn(sec.items[0])
    return gameFingerprint(w, copy)
  }
  assert.notEqual(editExample(x => { x.pinyin = x.pinyin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC') }), base, 'example pinyin (tone marks)')
  assert.notEqual(editExample(x => { x.note = 'Another note.' }), base, 'example note')
  assert.equal(editExample(x => { x.audio = false }), base, 'the audio flag is playback policy')
  assert.equal(editExample(x => { x.review = { status: 'human-reviewed' } }), base, 'review status is provenance')
  const titled = structuredClone(ex); titled.title = 'Another title'; titled.related = ['来']
  assert.equal(gameFingerprint(w, titled), base, 'title and related links are presentation')
  assert.equal(gameFingerprint({ ...w, group: 'other', wrongPinyin: ['jiāo'], questions: ['meaning'] }, ex), base, 'group, distractors and question kinds are not assessed')
  assert.notEqual(gameFingerprint({ ...w, variants: ['jiāo'] }, ex), base)
  // A breakdown/compare part's pinyin counts too.
  const withPart = { sections: [{ type: 'breakdown' as const, parts: [{ char: '口', pinyin: 'kǒu', meaning: 'mouth' }] }] }
  assert.notEqual(gameFingerprint(w, withPart), gameFingerprint(w, { sections: [{ type: 'breakdown' as const, parts: [{ char: '口', pinyin: 'kou', meaning: 'mouth' }] }] }))
  // An assessment made against this content stays current; editing example pinyin outdates it.
  const r = REGRESSION.jiaoBark
  const a = assessment(r, '叫', { meaning: { verdict: 'different', scope: 'distinct', reason: 'An animal cry, not naming.' }, wording: { verdict: 'not-applicable', reason: 'Different senses: neither definition should replace the other.' } })
  assert.equal(freshness(a, r, w, ex), 'current')
  const copy = structuredClone(ex)
  const sec = copy.sections[firstExamples]
  if (sec.type === 'examples') sec.items[0].pinyin = `${sec.items[0].pinyin} ma`
  assert.equal(freshness(a, r, w, copy), 'game-changed')
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
