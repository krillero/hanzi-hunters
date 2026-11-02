// Editorial assessments of source-record / game-entry comparisons, kept separate from source data, mappings and selections.
//
//   matching evidence    src/sources/match.ts, compare.ts   spelling, readings, text equality, English overlap: computed, never stored
//   meaning assessment   this file                          do the two records teach the same sense?
//   wording assessment   this file                          which description teaches that sense more clearly?
//   reviewer decisions   src/content/sourceMappings.json, selections.json (via changesets)
//
// An assessment is advice with provenance (who/what, how, when, why, how sure). It never links a record, changes game text, selects
// a recording or activates content. It becomes OUTDATED when the source record or the game fields it considered change, and is
// then no longer presented as current advice. Stored in src/content/sourceAssessments.json; workflow: `npm run source:assess`.
import { LIMITS } from '../content/validate.ts'
import type { Explanation, Word } from '../content/types.ts'
import { compareText, describePronunciation, evidenceHeadline, sourceDefinition, terminologySuggestion, TEXT_LABEL, type PronunciationNote, type TerminologySuggestion, type TextComparison } from './compare.ts'
import { suggest, type Suggestion } from './match.ts'
import type { Mapping, SourceRecord } from './types.ts'

export const ASSESSMENT_SCHEMA_VERSION = 1

/**
 *  likely-equivalent  an assessor judged them to teach the same sense (not confirmed by a reviewer's decision)
 *  same-confirmed     a person reviewed and confirmed the same sense (method "human" only)
 *  different          they teach different senses or uses: keep separate (the record may become a new-entry candidate)
 *  uncertain          assessed, but the evidence does not settle it
 */
export type MeaningVerdict = 'likely-equivalent' | 'same-confirmed' | 'different' | 'uncertain'
/** How the source's sense relates to the game's, as the assessor sees it. */
export type SenseScope = 'same' | 'source-broader' | 'source-narrower' | 'overlapping' | 'distinct'
/**
 *  keep-game       keep the game's short meaning (with a substantive reason)
 *  prefer-source   the source wording teaches the sense better (`proposed` = that wording)
 *  edited          neither as is; `proposed` is the suggested text
 *  not-applicable  the senses differ, so one definition must not replace the other
 */
export type WordingVerdict = 'keep-game' | 'prefer-source' | 'edited' | 'not-applicable'
export type AssessmentMethod = 'heuristic' | 'ai-assisted' | 'human'
export type AssessmentReference = { name: string; ref?: string; url?: string; note?: string }

export type SourceAssessment = {
  /** "<source record key>|<game entry id>": stable ids, never Chinese text alone. */
  id: string
  record: string
  /** The record's hash when assessed (stale when the record changes). */
  recordHash: string
  entry: string
  /** gameFingerprint() of the game fields considered (stale when they change). */
  gameFingerprint: string
  meaning: { verdict: MeaningVerdict; scope?: SenseScope; reason: string }
  /** Absent = the wording was not assessed. */
  wording?: { verdict: WordingVerdict; reason: string; proposed?: string; /** The proposal is a terminology substitution. */ terminology?: boolean }
  /** Remarks on recording suitability. Never a verification of what a clip says. */
  recording?: string
  method: AssessmentMethod
  /** Person, or tool/model identity for AI-assisted and heuristic assessments. */
  assessor: string
  /** YYYY-MM-DD */
  on: string
  /** Only a person's review is "human-reviewed"; AI-assisted and heuristic assessments are always "unreviewed". */
  review: 'unreviewed' | 'human-reviewed'
  uncertainty: 'low' | 'medium' | 'high'
  references?: AssessmentReference[]
}
export type AssessmentsFile = { kind: 'hanzi-hunters-assessments'; schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION; assessments: SourceAssessment[] }
export const emptyAssessments = (): AssessmentsFile => ({ kind: 'hanzi-hunters-assessments', schemaVersion: ASSESSMENT_SCHEMA_VERSION, assessments: [] })
export const assessmentId = (record: string, entry: string) => `${record}|${entry}`

// ---- fingerprint and freshness --------------------------------------------------------------------------------------------------

/** Game fields an assessment considers: the entry's identity, readings, short meaning, note, and its explanation text/examples. */
export const ASSESSED_GAME_FIELDS = ['hanzi', 'pinyin', 'variants', 'speech', 'kind', 'meaning', 'note', 'explanation'] as const

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}
/** 64-bit FNV-1a as two 32-bit halves (no BigInt, same result in Node and browsers). */
export function hash16(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c ^ (a >>> 7), 0x01000193) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}
/** Explanation content an assessor reads: summary, text, tips and examples (not titles or provenance). */
function explanationContent(e: Explanation | undefined) {
  if (!e) return null
  return { summary: e.summary, sections: e.sections.map(s => s.type === 'text' ? s.body : s.type === 'tips' ? s.items : s.type === 'examples' ? s.items.map(x => [x.zh, x.en]) : s.type === 'breakdown' ? s.parts.map(p => [p.char, p.meaning]) : s.items.map(p => [p.char, p.meaning])) }
}
export function gameFingerprint(w: Word, explanation?: Explanation): string {
  return hash16(stable({ id: w.id, hanzi: w.hanzi, pinyin: w.pinyin, variants: w.variants, speech: w.speech, kind: w.kind, meaning: w.meaning, note: w.note, explanation: explanationContent(explanation) }))
}

/** current, or why it is outdated. Outdated assessments are shown as history only, never as current advice. */
export type Freshness = 'current' | 'source-changed' | 'game-changed' | 'missing'
export function freshness(a: SourceAssessment, record: SourceRecord | undefined, word: Word | undefined, explanation?: Explanation): Freshness {
  if (!record || !word) return 'missing'
  if (record.hash !== a.recordHash) return 'source-changed'
  if (gameFingerprint(word, explanation) !== a.gameFingerprint) return 'game-changed'
  return 'current'
}
export const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'Current',
  'source-changed': 'Assessment outdated—content changed (the source record changed).',
  'game-changed': 'Assessment outdated—content changed (the game entry or its explanation changed).',
  missing: 'Assessment outdated—the record or entry no longer exists.'
}

// ---- validation and import -------------------------------------------------------------------------------------------------------

export type AssessmentContext = { records: Map<string, SourceRecord>; words: Word[]; explanations: Record<string, Explanation | undefined> }
const MEANINGS: MeaningVerdict[] = ['likely-equivalent', 'same-confirmed', 'different', 'uncertain']
const SCOPES: SenseScope[] = ['same', 'source-broader', 'source-narrower', 'overlapping', 'distinct']
const WORDINGS: WordingVerdict[] = ['keep-game', 'prefer-source', 'edited', 'not-applicable']
/** Placeholder reasons that do not explain anything are refused. */
const EMPTY_REASON = /^(n\/?a|none|ok|same|fine|no clear improvement\.?|keep\.?|tbd|todo)$/i

/** Shape and rule checks for one assessment. `ctx` adds existence checks (stale hashes are reported by `freshness`, not here). */
export function checkAssessment(a: SourceAssessment, at: string, ctx?: AssessmentContext): string[] {
  const e: string[] = []
  const str = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  if (!a || typeof a !== 'object') return [`${at}: not an object`]
  for (const k of ['id', 'record', 'recordHash', 'entry', 'gameFingerprint', 'assessor', 'on'] as const) if (!str(a[k])) e.push(`${at}: "${k}" is required`)
  if (str(a.record) && str(a.entry) && a.id !== assessmentId(a.record, a.entry)) e.push(`${at}: id must be "${assessmentId(a.record, a.entry)}"`)
  if (str(a.on) && !/^\d{4}-\d{2}-\d{2}$/.test(a.on)) e.push(`${at}: "on" must be YYYY-MM-DD`)
  if (!['heuristic', 'ai-assisted', 'human'].includes(a.method)) e.push(`${at}: unknown method "${a.method}"`)
  if (!['unreviewed', 'human-reviewed'].includes(a.review)) e.push(`${at}: review must be "unreviewed" or "human-reviewed"`)
  if (a.review === 'human-reviewed' && a.method !== 'human') e.push(`${at}: only a person's assessment (method "human") can be human-reviewed`)
  if (!['low', 'medium', 'high'].includes(a.uncertainty)) e.push(`${at}: uncertainty must be low, medium or high`)
  if (!a.meaning || !MEANINGS.includes(a.meaning.verdict)) e.push(`${at}: meaning.verdict must be one of ${MEANINGS.join(', ')}`)
  else {
    if (!str(a.meaning.reason) || EMPTY_REASON.test(a.meaning.reason.trim())) e.push(`${at}: meaning.reason must explain the verdict`)
    if (a.meaning.scope !== undefined && !SCOPES.includes(a.meaning.scope)) e.push(`${at}: unknown meaning.scope "${a.meaning.scope}"`)
    if (a.meaning.verdict === 'same-confirmed' && a.method !== 'human') e.push(`${at}: "same-confirmed" needs a person (method "human")`)
    if (a.method === 'heuristic' && a.meaning.verdict !== 'uncertain') e.push(`${at}: a heuristic can only record "uncertain"; matching evidence is not a meaning assessment`)
  }
  if (a.wording) {
    const w = a.wording
    if (!WORDINGS.includes(w.verdict)) e.push(`${at}: wording.verdict must be one of ${WORDINGS.join(', ')}`)
    if (!str(w.reason) || EMPTY_REASON.test(w.reason.trim()) || w.reason.trim().length < 20) e.push(`${at}: wording.reason must give a substantive reason`)
    if (a.method === 'heuristic') e.push(`${at}: a heuristic cannot assess wording`)
    if (w.verdict === 'not-applicable' && a.meaning?.verdict !== 'different') e.push(`${at}: wording "not-applicable" is only for different senses`)
    if (a.meaning?.verdict === 'different' && w.verdict !== 'not-applicable') e.push(`${at}: different senses: one definition must not replace the other (wording must be "not-applicable")`)
    if ((w.verdict === 'edited' || w.verdict === 'prefer-source') && !str(w.proposed)) e.push(`${at}: wording "${w.verdict}" needs the proposed text`)
    const word = ctx?.words.find(x => x.id === a.entry)
    const max = word?.kind === 'particle' ? LIMITS.particleMeaning : LIMITS.meaning
    if (str(w.proposed) && w.proposed!.length > max) e.push(`${at}: proposed text has ${w.proposed!.length} characters; answer buttons allow ${max}`)
    if (word && str(w.proposed) && w.proposed === word.meaning) e.push(`${at}: proposed text equals the current game meaning; use "keep-game"`)
  }
  for (const [i, r] of (a.references ?? []).entries()) if (!str(r?.name)) e.push(`${at}: references[${i}].name is required`)
  if (ctx) {
    if (str(a.record) && !ctx.records.has(a.record)) e.push(`${at}: unknown source record ${a.record}`)
    if (str(a.entry) && !ctx.words.some(w => w.id === a.entry)) e.push(`${at}: unknown game entry ${a.entry}`)
  }
  return e
}

export function checkAssessmentsFile(f: unknown, ctx?: AssessmentContext): string[] {
  const file = f as AssessmentsFile
  if (!file || file.kind !== 'hanzi-hunters-assessments') return ['not an assessments file (kind must be "hanzi-hunters-assessments")']
  if (file.schemaVersion !== ASSESSMENT_SCHEMA_VERSION) return [`unsupported assessments schemaVersion ${String(file.schemaVersion)} (expected ${ASSESSMENT_SCHEMA_VERSION})`]
  if (!Array.isArray(file.assessments)) return ['"assessments" must be an array']
  const errors: string[] = []
  const seen = new Set<string>()
  file.assessments.forEach((a, i) => {
    errors.push(...checkAssessment(a, `assessments[${i}] ${a?.id ?? ''}`.trim(), ctx))
    if (a?.id && seen.has(a.id)) errors.push(`assessments[${i}]: duplicate id ${a.id}`)
    seen.add(a?.id)
  })
  return errors
}

/**
 * Merge validated assessments into the committed file. Refused (nothing changes) when any incoming assessment is invalid, was made
 * against another version of the record or game entry, or would replace a person's assessment with a non-human one.
 * Only the assessments file is produced: mappings, selections, recordings, words and curricula are never touched.
 */
export function mergeAssessments(current: AssessmentsFile, incoming: unknown, ctx: AssessmentContext): { ok: boolean; errors: string[]; file: AssessmentsFile; added: number; replaced: number } {
  const inc = incoming as AssessmentsFile
  const stripped = inc && Array.isArray(inc.assessments) ? { ...inc, assessments: inc.assessments.map(a => { const x = { ...a } as SourceAssessment & { context?: unknown }; delete x.context; return x as SourceAssessment }) } : inc
  const errors = checkAssessmentsFile(stripped, ctx)
  if (errors.length) return { ok: false, errors, file: current, added: 0, replaced: 0 }
  const byId = new Map(current.assessments.map(a => [a.id, a]))
  let added = 0, replaced = 0
  for (const a of stripped.assessments) {
    const f = freshness(a, ctx.records.get(a.record), ctx.words.find(w => w.id === a.entry), ctx.explanations[a.entry])
    if (f !== 'current') { errors.push(`${a.id}: ${FRESHNESS_LABEL[f]} Re-export a template and assess the current content.`); continue }
    const old = byId.get(a.id)
    if (old?.method === 'human' && a.method !== 'human') { errors.push(`${a.id}: would replace a person's assessment with a ${a.method} one`); continue }
    if (old) replaced++; else added++
    byId.set(a.id, a)
  }
  if (errors.length) return { ok: false, errors, file: current, added: 0, replaced: 0 }
  const assessments = [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  return { ok: true, errors, file: { kind: 'hanzi-hunters-assessments', schemaVersion: ASSESSMENT_SCHEMA_VERSION, assessments }, added, replaced }
}

// ---- resolution: evidence + assessment + reviewer decision -------------------------------------------------------------------------

export type MeaningState = 'not-assessed' | MeaningVerdict
export type WordingState = 'not-assessed' | WordingVerdict
/** Where a state comes from: a reviewer's decision (mapping), a current assessment, or nothing (the application's default). */
export type Basis = 'reviewer' | 'assessment' | 'none'

export const METHOD_LABEL: Record<AssessmentMethod, string> = { heuristic: 'heuristic', 'ai-assisted': 'AI-assisted assessment', human: 'human review' }
export const WORDING_NOT_ASSESSED = 'No change proposed. This wording has not been assessed.'
export const SCOPE_LABEL: Record<SenseScope, string> = { same: 'same sense', 'source-broader': 'source is broader', 'source-narrower': 'source is narrower', overlapping: 'senses overlap', distinct: 'distinct use' }

export type Comparison = {
  record: string
  entry: string
  strength: Suggestion['strength']
  text: TextComparison
  textLabel: string
  pronunciation: PronunciationNote
  headline: string
  meaning: { state: MeaningState; basis: Basis; label: string; reason?: string; scope?: SenseScope }
  wording: { state: WordingState; basis: Basis; label: string; reason?: string; proposed?: string; terminology?: boolean }
  /** The current assessment, if any. */
  assessment?: SourceAssessment
  /** An assessment that exists but no longer matches the content (shown as history, not advice). */
  outdated?: { assessment: SourceAssessment; freshness: Exclude<Freshness, 'current'> }
  /** A plain-term option for the game label, offered whatever the assessment says (wording only). */
  terminology?: TerminologySuggestion
}

export function compare(r: SourceRecord, w: Word, s: Suggestion, opts: { assessment?: SourceAssessment; explanation?: Explanation; mapping?: Mapping | null } = {}): Comparison {
  const text = compareText(sourceDefinition(r), w.meaning)
  const a = opts.assessment
  const f = a ? freshness(a, r, w, opts.explanation) : undefined
  const cur = a && f === 'current' ? a : undefined
  const m = opts.mapping
  const by = (x: Mapping) => `${x.decision.by}, ${x.decision.on}`

  let meaning: Comparison['meaning']
  if (m?.distinctFrom?.includes(w.id) && m.decision.how === 'person') meaning = { state: 'different', basis: 'reviewer', label: 'Different sense—keep separate (reviewer decision)', reason: `Decided by ${by(m)}.` }
  else if (m?.status === 'linked' && m.entry === w.id && m.decision.how === 'person') meaning = { state: 'same-confirmed', basis: 'reviewer', label: 'Same sense—confirmed by a reviewer', reason: `Linked by ${by(m)}.` }
  else if (cur) {
    const v = cur.meaning.verdict, how = METHOD_LABEL[cur.method]
    const label = { 'likely-equivalent': `Likely equivalent—${how}`, 'same-confirmed': 'Same sense—confirmed by a reviewer', different: `Different sense—keep separate (${how})`, uncertain: `Uncertain—${how}; a reviewer should decide` }[v]
    meaning = { state: v, basis: 'assessment', label, reason: cur.meaning.reason, scope: cur.meaning.scope }
  } else meaning = { state: 'not-assessed', basis: 'none', label: 'Meaning not assessed', ...(f && f !== 'current' ? { reason: 'An earlier assessment is outdated because the content changed.' } : {}) }

  let wording: Comparison['wording']
  if (meaning.state === 'different') wording = { state: 'not-applicable', basis: meaning.basis, label: 'Not applicable—the senses differ; do not replace one definition with the other', reason: cur?.wording?.verdict === 'not-applicable' ? cur.wording.reason : undefined }
  else if (cur?.wording && cur.wording.verdict !== 'not-applicable') {
    const v = cur.wording.verdict
    const label = { 'keep-game': `Keep game wording—${METHOD_LABEL[cur.method]}`, 'prefer-source': `Source wording preferred—${METHOD_LABEL[cur.method]}`, edited: `Edited wording proposed—${METHOD_LABEL[cur.method]}` }[v]
    wording = { state: v, basis: 'assessment', label, reason: cur.wording.reason, proposed: cur.wording.proposed, terminology: cur.wording.terminology }
  } else wording = { state: 'not-assessed', basis: 'none', label: WORDING_NOT_ASSESSED }

  const textLabel = text === 'different' && wording.state === 'not-assessed' ? 'Different wording—assessment pending.' : TEXT_LABEL[text]
  return {
    record: r.key, entry: w.id, strength: s.strength, text, textLabel, pronunciation: describePronunciation(r, w),
    headline: evidenceHeadline(s, text, meaning.state === 'not-assessed'), meaning, wording,
    ...(cur ? { assessment: cur } : {}), ...(a && f && f !== 'current' ? { outdated: { assessment: a, freshness: f } } : {}),
    ...(terminologySuggestion(w.meaning) ? { terminology: terminologySuggestion(w.meaning) } : {})
  }
}

/** One short line for list rows, e.g. "叫: different wording · different sense · wording n/a". */
export function shortStatus(c: Comparison): string {
  const t = { exact: 'exact text', formatting: 'formatting only', different: 'different wording', missing: 'no text' }[c.text]
  const m = { 'not-assessed': 'meaning pending', 'likely-equivalent': 'likely equivalent', 'same-confirmed': 'same (reviewer)', different: 'different sense', uncertain: 'uncertain' }[c.meaning.state]
  const w = { 'not-assessed': 'wording pending', 'keep-game': 'keep game wording', 'prefer-source': 'source wording proposed', edited: 'edit proposed', 'not-applicable': 'wording n/a' }[c.wording.state]
  return `${c.entry}: ${t} · ${m} · ${w}${c.outdated ? ' · outdated' : ''}`
}

// ---- coverage -----------------------------------------------------------------------------------------------------------------------

/** Counts of candidate PAIRS (one source record compared with one game entry), plus the distinct records and entries involved. */
export type Coverage = {
  pairs: number; records: number; entries: number
  meaning: Record<MeaningState, number>
  wording: Record<WordingState, number>
  text: Record<TextComparison, number>
  outdated: number; pronunciation: number
  byMethod: Record<AssessmentMethod, number>
}
export function coverage(cs: Comparison[]): Coverage {
  const c: Coverage = {
    pairs: cs.length, records: new Set(cs.map(x => x.record)).size, entries: new Set(cs.map(x => x.entry)).size,
    meaning: { 'not-assessed': 0, 'likely-equivalent': 0, 'same-confirmed': 0, different: 0, uncertain: 0 },
    wording: { 'not-assessed': 0, 'keep-game': 0, 'prefer-source': 0, edited: 0, 'not-applicable': 0 },
    text: { exact: 0, formatting: 0, different: 0, missing: 0 }, outdated: 0, pronunciation: 0,
    byMethod: { heuristic: 0, 'ai-assisted': 0, human: 0 }
  }
  for (const x of cs) {
    c.meaning[x.meaning.state]++; c.wording[x.wording.state]++; c.text[x.text]++
    if (x.outdated) c.outdated++
    if (x.pronunciation.differs) c.pronunciation++
    if (x.assessment) c.byMethod[x.assessment.method]++
  }
  return c
}
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
/** e.g. "1 wording change proposed · 75 comparisons not yet assessed" (units: candidate pairs). */
export function coverageLine(c: Coverage): string {
  const proposed = c.wording['prefer-source'] + c.wording.edited
  const pending = c.meaning['not-assessed']
  const wordingPending = c.wording['not-assessed']
  return [
    `${n(proposed, 'wording change')} proposed`,
    `${n(pending, 'comparison')} not yet assessed`,
    ...(wordingPending !== pending ? [`wording not assessed in ${n(wordingPending, 'comparison')}`] : []),
    ...(c.outdated ? [`${n(c.outdated, 'assessment')} outdated`] : [])
  ].join(' · ')
}

// ---- all candidate pairs ---------------------------------------------------------------------------------------------------------

export type RecordComparisons = { suggestions: Suggestion[]; comparisons: Comparison[] }
/**
 * Every candidate pair of the given records (records without a candidate get an empty list: "no matching game entry").
 * `mappings` supplies reviewer decisions; assessments supply advice. Nothing is written anywhere.
 */
export function candidateComparisons(records: SourceRecord[], words: Word[], explanations: Record<string, Explanation | undefined>, assessments: AssessmentsFile, mappings: Record<string, Mapping | undefined> = {}): Map<string, RecordComparisons> {
  const byId = new Map(assessments.assessments.map(a => [a.id, a]))
  const byWord = new Map(words.map(w => [w.id, w]))
  const out = new Map<string, RecordComparisons>()
  for (const r of records) {
    const mapping = mappings[r.key] ?? null
    const suggestions = suggest(r, words, { linkedTo: mapping?.status === 'linked' ? mapping.entry : undefined })
    const comparisons = suggestions.map(s => compare(r, byWord.get(s.entry)!, s, { assessment: byId.get(assessmentId(r.key, s.entry)), explanation: explanations[s.entry], mapping }))
    out.set(r.key, { suggestions, comparisons })
  }
  return out
}
