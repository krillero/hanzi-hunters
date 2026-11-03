// Editorial assessments of source-record / game-entry comparisons, kept separate from source data, mappings and selections.
//
//   matching evidence    src/sources/match.ts, compare.ts   spelling, readings, text equality, English overlap: computed, never stored
//   meaning assessment   this file                          do the two records teach the same sense?
//   wording assessment   this file                          which description teaches that sense more clearly?
//   reviewer decisions   src/content/sourceMappings.json, selections.json (via changesets)
//
// An assessment is advice with provenance (who/what, how, when, why, how sure). It never links a record, changes game text, selects
// a recording or activates content. It becomes OUTDATED when the source record or the game fields it considered change, and is
// then no longer presented as current advice. Stored per source in src/content/assessments/<source>.json; workflow:
// `npm run source:assess`. Schema 2 adds record-level dispositions (match / additional sense / new candidate / uncertain /
// excluded, with an optional new-entry draft) and example assessments (which sense a sentence teaches); schema 1 files (pair
// assessments only) are read unchanged.
import { LIMITS } from '../content/validate.ts'
import type { Explanation, Part, Word } from '../content/types.ts'
import { compareText, describePronunciation, evidenceHeadline, sourceDefinition, terminologySuggestion, TEXT_LABEL, type PronunciationNote, type TerminologySuggestion, type TextComparison } from './compare.ts'
import { suggest, type Suggestion } from './match.ts'
import type { EntryDraft, Mapping, SentenceItem, SourceRecord } from './types.ts'

export const ASSESSMENT_SCHEMA_VERSION = 2
/** Versions this code reads. 1 = pair assessments only (the same shape as the `assessments` list of version 2). */
export const READABLE_ASSESSMENT_VERSIONS = [1, 2]

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
/** Provenance shared by every kind of assessment. */
type AssessedBy = Pick<SourceAssessment, 'method' | 'assessor' | 'on' | 'review' | 'uncertainty' | 'references'>

/**
 * What a source record contributes to the course, as a whole (all its candidate pairs considered together):
 *  match             teaches the sense of an existing entry (its pair assessments say how well)
 *  additional-sense  same written word as an existing entry, but its main sense is one the entry does not teach
 *  new-candidate     beginner vocabulary the game does not have
 *  uncertain         cannot be settled from the evidence
 *  excluded          not proposed for the beginner course (reason required)
 */
export type Disposition = 'match' | 'additional-sense' | 'new-candidate' | 'uncertain' | 'excluded'
export type SenseNote = { label: string; status: 'taught-by-entry' | 'not-taught' | 'separate-entry-proposed' | 'out-of-scope'; note?: string }
export type RecordAssessment = AssessedBy & {
  /** "<record key>|record" */
  id: string
  record: string
  recordHash: string
  disposition: Disposition
  reason: string
  /** Game entries considered (match / additional sense) and their fingerprint at the time (stale when they change). */
  relatedEntries?: string[]
  relatedFingerprint?: string
  /** The record covers several senses or uses that must not become one undifferentiated answer. */
  multipleSenses?: boolean
  senses?: SenseNote[]
  /** A proposed short English label. `basis: "source"` = the source's own short meaning (verbatim or trimmed);
   *  "editorial" = written by the assessor (e.g. from the full definitions), never presented as the source's. */
  shortLabel?: { text: string; basis: 'source' | 'editorial'; reason: string }
  /** New-entry proposal (not playable; becomes an entry only through a reviewer's decision and promotion). */
  draft?: EntryDraft & { related?: string[] }
  /** Whether it is proposed for the first beginner expansion. */
  expansion?: 'first' | 'later' | 'not-proposed'
  /** Remark on the recording (not a verification). */
  recording?: string
}
/** Whether one example sentence is suitable to illustrate one target (a game entry, or a source record proposed as a new entry). */
export type ExampleVerdict = 'suitable' | 'needs-editing' | 'other-sense' | 'not-beginner' | 'uncertain'
export type ExampleAssessment = AssessedBy & {
  /** "<sentence id>|<entry id or record key>" */
  id: string
  sentence: string
  /** exampleHash() of the sentence's Chinese, pinyin and translation when assessed: any change (including pinyin) makes it outdated. */
  sentenceHash: string
  record: string
  target: { entry?: string; record?: string }
  /** gameFingerprint of the target entry (when the target is an entry). */
  targetFingerprint?: string
  /** The sense of the target word the sentence actually shows. */
  sense: string
  verdict: ExampleVerdict
  /** Other vocabulary in the sentence (written forms), and the part of it the game does not teach yet. */
  contains: string[]
  prerequisites: string[]
  /** An editorial adaptation (the original stays in the source item). */
  edited?: { zh?: string; pinyin?: string; en?: string; reason: string }
  reason: string
}
export type AssessmentsFile = {
  kind: 'hanzi-hunters-assessments'; schemaVersion: number; source?: string
  assessments: SourceAssessment[]; records?: RecordAssessment[]; examples?: ExampleAssessment[]
}
export const emptyAssessments = (source?: string): AssessmentsFile => ({ kind: 'hanzi-hunters-assessments', schemaVersion: ASSESSMENT_SCHEMA_VERSION, ...(source ? { source } : {}), assessments: [], records: [], examples: [] })
export const recordAssessmentId = (record: string) => `${record}|record`
export const exampleAssessmentId = (sentence: string, target: { entry?: string; record?: string }) => `${sentence}|${target.entry ?? target.record}`
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
/** A character or component as taught: its sound, meaning and note. */
const partContent = (p: Part) => ({ char: p.char, pinyin: p.pinyin, meaning: p.meaning, note: p.note })
/**
 * Explanation content an assessor reads: everything that teaches (summary, text, tips, intros, every part's and every example's
 * Chinese, pinyin, English and note). Left out on purpose: headings and the title (presentation), `related` (navigation),
 * `source` / `review` (provenance) and an example's `audio` flag (playback policy), so editing those does not outdate advice.
 */
function explanationContent(e: Explanation | undefined) {
  if (!e) return null
  const sections = e.sections.map(sec => {
    switch (sec.type) {
      case 'text': return { text: sec.body }
      case 'tips': return { tips: sec.items }
      case 'breakdown': return { intro: sec.intro, parts: sec.parts.map(partContent) }
      case 'compare': return { intro: sec.intro, parts: sec.items.map(partContent) }
      case 'examples': return { examples: sec.items.map(x => ({ zh: x.zh, pinyin: x.pinyin, en: x.en, note: x.note })) }
    }
  })
  return { summary: e.summary, sections }
}
/** The entry fields an assessment considers (see ASSESSED_GAME_FIELDS). Group, question kinds, distractors and TTS policy are not. */
const entryContent = (w: Word) => ({ id: w.id, hanzi: w.hanzi, pinyin: w.pinyin, variants: w.variants, speech: w.speech, kind: w.kind, meaning: w.meaning, note: w.note })
export function gameFingerprint(w: Word, explanation?: Explanation): string {
  return hash16(stable({ ...entryContent(w), explanation: explanationContent(explanation) }))
}

/**
 * The fingerprint used until 2026-11-03. It left out example pinyin and notes, part pinyin and notes, and breakdown/compare intros,
 * so a pronunciation edit left an assessment looking current. Used ONLY to label assessments made under it as outdated for that
 * reason ("check-changed"): it cannot show that the fields it skipped are unchanged, so it never makes an assessment current.
 */
function legacyExplanationContent(e: Explanation | undefined) {
  if (!e) return null
  return { summary: e.summary, sections: e.sections.map(s => s.type === 'text' ? s.body : s.type === 'tips' ? s.items : s.type === 'examples' ? s.items.map(x => [x.zh, x.en]) : s.type === 'breakdown' ? s.parts.map(p => [p.char, p.meaning]) : s.items.map(p => [p.char, p.meaning])) }
}
function legacyGameFingerprint(w: Word, explanation?: Explanation): string {
  return hash16(stable({ ...entryContent(w), explanation: legacyExplanationContent(explanation) }))
}
/** Why a stored entry fingerprint no longer matches: an assessment made under the old fingerprint, or a real content change. */
function gameMismatch(stored: string | undefined, w: Word, explanation?: Explanation): Exclude<Freshness, 'current' | 'source-changed' | 'missing'> {
  return stored === legacyGameFingerprint(w, explanation) ? 'check-changed' : 'game-changed'
}
/** Fingerprint of several entries (in the given order). */
export const entriesFingerprint = (ids: string[], words: Word[], explanations: Record<string, Explanation | undefined>) =>
  hash16(ids.map(id => { const w = words.find(x => x.id === id); return w ? gameFingerprint(w, explanations[id]) : `missing:${id}` }).join(','))
/** Hash of what an example says: Chinese, pinyin and translation. */
export const exampleHash = (s: Pick<SentenceItem, 'zh' | 'pinyin' | 'en'>) => hash16(stable({ zh: s.zh, pinyin: s.pinyin ?? '', en: s.en }))

export function recordFreshness(a: RecordAssessment, record: SourceRecord | undefined, words: Word[], explanations: Record<string, Explanation | undefined>): Freshness {
  if (!record) return 'missing'
  if (record.hash !== a.recordHash) return 'source-changed'
  if (a.relatedEntries?.length && entriesFingerprint(a.relatedEntries, words, explanations) !== a.relatedFingerprint) {
    const legacy = hash16(a.relatedEntries.map(id => { const w = words.find(x => x.id === id); return w ? legacyGameFingerprint(w, explanations[id]) : `missing:${id}` }).join(','))
    return legacy === a.relatedFingerprint ? 'check-changed' : 'game-changed'
  }
  return 'current'
}
export function exampleFreshness(a: ExampleAssessment, sentence: SentenceItem | undefined, words: Word[], explanations: Record<string, Explanation | undefined>): Freshness {
  if (!sentence) return 'missing'
  if (exampleHash(sentence) !== a.sentenceHash) return 'source-changed'
  if (a.target.entry) { const w = words.find(x => x.id === a.target.entry); if (!w) return 'missing'; if (gameFingerprint(w, explanations[w.id]) !== a.targetFingerprint) return gameMismatch(a.targetFingerprint, w, explanations[w.id]) }
  return 'current'
}

/**
 * current, or why it is outdated. Outdated assessments are shown as history only, never as current advice.
 *  check-changed  made under the older game fingerprint, which did not cover example pinyin and notes: whether those changed
 *                 since is unknown, so the assessment needs a real reassessment (its hashes are never refreshed by a tool)
 */
export type Freshness = 'current' | 'source-changed' | 'game-changed' | 'check-changed' | 'missing'
export function freshness(a: SourceAssessment, record: SourceRecord | undefined, word: Word | undefined, explanation?: Explanation): Freshness {
  if (!record || !word) return 'missing'
  if (record.hash !== a.recordHash) return 'source-changed'
  if (gameFingerprint(word, explanation) !== a.gameFingerprint) return gameMismatch(a.gameFingerprint, word, explanation)
  return 'current'
}
export const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'Current',
  'source-changed': 'Assessment outdated—content changed (the source record changed).',
  'game-changed': 'Assessment outdated—content changed (the game entry or its explanation changed).',
  'check-changed': 'Assessment outdated—made before the check covered example pinyin and notes, so it is unknown whether what it considered still matches; it needs reassessment.',
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
    // The source also covers uses the entry defers (docs/SENSES.md §1.1): adopting its whole definition would teach them.
    if (w.verdict === 'prefer-source' && a.meaning?.scope === 'source-broader') e.push(`${at}: the source is broader than the entry's included uses; do not adopt it whole (propose an "edited" text with the included part, or "keep-game")`)
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

function checkProvenance(a: AssessedBy & { id?: string }, at: string): string[] {
  const e: string[] = []
  if (!a.assessor || !String(a.assessor).trim()) e.push(`${at}: "assessor" is required`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.on ?? '')) e.push(`${at}: "on" must be YYYY-MM-DD`)
  if (!['heuristic', 'ai-assisted', 'human'].includes(a.method)) e.push(`${at}: unknown method "${a.method}"`)
  if (!['unreviewed', 'human-reviewed'].includes(a.review)) e.push(`${at}: review must be "unreviewed" or "human-reviewed"`)
  if (a.review === 'human-reviewed' && a.method !== 'human') e.push(`${at}: only a person's assessment (method "human") can be human-reviewed`)
  if (!['low', 'medium', 'high'].includes(a.uncertainty)) e.push(`${at}: uncertainty must be low, medium or high`)
  for (const [i, r] of (a.references ?? []).entries()) if (!r?.name) e.push(`${at}: references[${i}].name is required`)
  return e
}
const substantive = (s: unknown) => typeof s === 'string' && s.trim().length >= 12 && !EMPTY_REASON.test(s.trim())
const DISPOSITIONS: Disposition[] = ['match', 'additional-sense', 'new-candidate', 'uncertain', 'excluded']
const SENSE_STATUS = ['taught-by-entry', 'not-taught', 'separate-entry-proposed', 'out-of-scope']

export function checkRecordAssessment(a: RecordAssessment, at: string, ctx?: AssessmentContext): string[] {
  const e = checkProvenance(a, at)
  if (!a.record || a.id !== recordAssessmentId(a.record)) e.push(`${at}: id must be "<record>|record"`)
  if (!a.recordHash) e.push(`${at}: recordHash is required`)
  if (!DISPOSITIONS.includes(a.disposition)) e.push(`${at}: disposition must be one of ${DISPOSITIONS.join(', ')}`)
  if (!substantive(a.reason)) e.push(`${at}: reason must explain the disposition`)
  if (a.method === 'heuristic' && a.disposition !== 'uncertain') e.push(`${at}: a heuristic can only record "uncertain"`)
  if ((a.disposition === 'match' || a.disposition === 'additional-sense') && !a.relatedEntries?.length) e.push(`${at}: ${a.disposition} needs relatedEntries`)
  if (a.relatedEntries?.length && !a.relatedFingerprint) e.push(`${at}: relatedEntries need relatedFingerprint`)
  for (const sn of a.senses ?? []) if (!sn.label || !SENSE_STATUS.includes(sn.status)) e.push(`${at}: each sense needs a label and a known status`)
  if (a.shortLabel) {
    if (!['source', 'editorial'].includes(a.shortLabel.basis)) e.push(`${at}: shortLabel.basis must be "source" or "editorial"`)
    if (!substantive(a.shortLabel.reason)) e.push(`${at}: shortLabel.reason must explain the label`)
    if (a.shortLabel.text.length > LIMITS.particleMeaning) e.push(`${at}: shortLabel has ${a.shortLabel.text.length} characters (max ${LIMITS.meaning}, particles ${LIMITS.particleMeaning})`)
    const r = ctx?.records.get(a.record)
    if (r && a.shortLabel.basis === 'source' && r.candidate.meaningMissing) e.push(`${at}: the source has no short meaning for this record; a label written from its definitions is "editorial"`)
    else if (r && a.shortLabel.basis === 'source' && !r.candidate.meanings.includes(a.shortLabel.text) && sourceDefinition(r) !== a.shortLabel.text) e.push(`${at}: shortLabel "${a.shortLabel.text}" is not the source's text; mark it "editorial"`)
  }
  if (a.draft) {
    if (a.disposition !== 'new-candidate' && a.disposition !== 'additional-sense') e.push(`${at}: a draft belongs to a new-candidate or additional-sense record`)
    if (!a.draft.id || !a.draft.hanzi || !a.draft.pinyin || !a.draft.meaning) e.push(`${at}: a draft needs id, hanzi, pinyin and meaning`)
    if (ctx?.words.some(w => w.id === a.draft!.id)) e.push(`${at}: draft id "${a.draft.id}" is already a game entry`)
    if (ctx?.words.some(w => w.hanzi === a.draft!.hanzi && w.pinyin === a.draft!.pinyin)) e.push(`${at}: the game already has an entry written ${a.draft.hanzi} ${a.draft.pinyin}; two entries with the same hanzi and pinyin are not supported (record the sense on the existing entry instead)`)
    const max = a.draft.kind === 'particle' ? LIMITS.particleMeaning : LIMITS.meaning
    if (a.draft.meaning.length > max) e.push(`${at}: draft meaning is longer than ${max} characters`)
  }
  if (a.expansion === 'first' && !a.draft) e.push(`${at}: a first-expansion proposal needs a draft`)
  if (ctx) {
    if (!ctx.records.has(a.record)) e.push(`${at}: unknown source record ${a.record}`)
    for (const id of a.relatedEntries ?? []) if (!ctx.words.some(w => w.id === id)) e.push(`${at}: unknown game entry ${id}`)
  }
  return e
}
const EX_VERDICTS: ExampleVerdict[] = ['suitable', 'needs-editing', 'other-sense', 'not-beginner', 'uncertain']
export function checkExampleAssessment(a: ExampleAssessment, at: string, ctx?: AssessmentContext & { sentences?: Map<string, SentenceItem> }): string[] {
  const e = checkProvenance(a, at)
  const t = a.target ?? {}
  if ([t.entry, t.record].filter(Boolean).length !== 1) e.push(`${at}: target names exactly one of entry or record`)
  if (a.id !== exampleAssessmentId(a.sentence, t)) e.push(`${at}: id must be "<sentence>|<target>"`)
  if (!a.sentenceHash) e.push(`${at}: sentenceHash is required`)
  if (t.entry && !a.targetFingerprint) e.push(`${at}: an entry target needs targetFingerprint`)
  if (!EX_VERDICTS.includes(a.verdict)) e.push(`${at}: verdict must be one of ${EX_VERDICTS.join(', ')}`)
  if (!a.sense?.trim()) e.push(`${at}: sense is required`)
  if (!substantive(a.reason)) e.push(`${at}: reason must explain the verdict`)
  if (!Array.isArray(a.contains) || !Array.isArray(a.prerequisites)) e.push(`${at}: contains and prerequisites must be lists`)
  if (a.verdict === 'needs-editing' && !a.edited) e.push(`${at}: "needs-editing" needs the proposed edit`)
  if (a.edited && !substantive(a.edited.reason)) e.push(`${at}: edited.reason must explain the edit`)
  if (ctx) {
    if (ctx.sentences && !ctx.sentences.has(a.sentence)) e.push(`${at}: unknown sentence ${a.sentence}`)
    if (t.entry && !ctx.words.some(w => w.id === t.entry)) e.push(`${at}: unknown game entry ${t.entry}`)
    if (t.record && !ctx.records.has(t.record)) e.push(`${at}: unknown source record ${t.record}`)
  }
  return e
}

export function checkAssessmentsFile(f: unknown, ctx?: AssessmentContext & { sentences?: Map<string, SentenceItem> }): string[] {
  const file = f as AssessmentsFile
  if (!file || file.kind !== 'hanzi-hunters-assessments') return ['not an assessments file (kind must be "hanzi-hunters-assessments")']
  if (!READABLE_ASSESSMENT_VERSIONS.includes(file.schemaVersion)) return [`unsupported assessments schemaVersion ${String(file.schemaVersion)} (readable: ${READABLE_ASSESSMENT_VERSIONS.join(', ')})`]
  if (!Array.isArray(file.assessments)) return ['"assessments" must be an array']
  if (file.schemaVersion === 1 && (file.records || file.examples)) return ['record and example assessments need schemaVersion 2']
  const errors: string[] = []
  const seen = new Set<string>()
  const each = <T extends { id: string }>(list: T[] | undefined, name: string, check: (x: T, at: string) => string[]) => (list ?? []).forEach((a, i) => {
    errors.push(...check(a, `${name}[${i}] ${a?.id ?? ''}`.trim()))
    if (a?.id && seen.has(a.id)) errors.push(`${name}[${i}]: duplicate id ${a.id}`)
    seen.add(a?.id)
  })
  each(file.assessments, 'assessments', (a, at) => checkAssessment(a, at, ctx))
  each(file.records, 'records', (a, at) => checkRecordAssessment(a, at, ctx))
  each(file.examples, 'examples', (a, at) => checkExampleAssessment(a, at, ctx))
  return errors
}
/** A version-1 file read as version 2 (same pair assessments, empty record and example lists). */
export const upgradeAssessments = (f: AssessmentsFile): AssessmentsFile => ({ ...f, schemaVersion: ASSESSMENT_SCHEMA_VERSION, records: f.records ?? [], examples: f.examples ?? [] })

/**
 * Merge validated assessments into the committed file. Refused (nothing changes) when any incoming assessment is invalid, was made
 * against another version of the record or game entry, or would replace a person's assessment with a non-human one.
 * Only the assessments file is produced: mappings, selections, recordings, words and curricula are never touched.
 */
export function mergeAssessments(current: AssessmentsFile, incoming: unknown, ctx: AssessmentContext & { sentences?: Map<string, SentenceItem> }): { ok: boolean; errors: string[]; file: AssessmentsFile; added: number; replaced: number } {
  const inc = incoming as AssessmentsFile
  const strip = <T>(list: T[] | undefined) => (list ?? []).map(a => { const x = { ...a } as T & { context?: unknown }; delete x.context; return x as T })
  const stripped: AssessmentsFile | undefined = inc && Array.isArray(inc.assessments) ? { ...inc, assessments: strip(inc.assessments), ...(inc.records ? { records: strip(inc.records) } : {}), ...(inc.examples ? { examples: strip(inc.examples) } : {}) } : undefined
  const errors = checkAssessmentsFile(stripped ?? inc, ctx)
  if (errors.length || !stripped) return { ok: false, errors, file: current, added: 0, replaced: 0 }
  const cur = upgradeAssessments(current)
  let added = 0, replaced = 0
  const merge = <T extends AssessedBy & { id: string }>(old: T[], next: T[], fresh: (a: T) => Freshness): T[] => {
    const byId = new Map(old.map(a => [a.id, a]))
    for (const a of next) {
      const f = fresh(a)
      if (f !== 'current') { errors.push(`${a.id}: ${FRESHNESS_LABEL[f]} Re-export a template and assess the current content.`); continue }
      const prev = byId.get(a.id)
      if (prev?.method === 'human' && a.method !== 'human') { errors.push(`${a.id}: would replace a person's assessment with a ${a.method} one`); continue }
      if (prev) replaced++; else added++
      byId.set(a.id, a)
    }
    return [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  }
  const assessments = merge(cur.assessments, stripped.assessments, a => freshness(a, ctx.records.get(a.record), ctx.words.find(w => w.id === a.entry), ctx.explanations[a.entry]))
  const records = merge(cur.records ?? [], stripped.records ?? [], a => recordFreshness(a, ctx.records.get(a.record), ctx.words, ctx.explanations))
  const examples = merge(cur.examples ?? [], stripped.examples ?? [], a => exampleFreshness(a, ctx.sentences?.get(a.sentence), ctx.words, ctx.explanations))
  if (errors.length) return { ok: false, errors, file: current, added: 0, replaced: 0 }
  return { ok: true, errors, file: { kind: 'hanzi-hunters-assessments', schemaVersion: ASSESSMENT_SCHEMA_VERSION, ...(cur.source ? { source: cur.source } : {}), assessments, records, examples }, added, replaced }
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
  /** A reviewer's decision about this pair that is no longer current (history, not a verdict): see decisionOutdated. */
  outdatedDecision?: { verdict: 'same' | 'different'; by: string; on: string; why: string }
}

/**
 * Why a reviewer decision (mapping) no longer applies to the record as it is now, or undefined when it is current: the importer
 * flagged it for reassessment, or it was made against another version of the record (`recordHash`). An outdated decision keeps
 * its history (who, when, what) but must not supply a current "confirmed" verdict.
 */
export function decisionOutdated(m: Mapping | null | undefined, r: SourceRecord): string | undefined {
  if (!m) return undefined
  if (m.reassess) return m.reassess
  if (m.recordHash !== r.hash) return 'the source record changed since this decision'
  return undefined
}

export function compare(r: SourceRecord, w: Word, s: Suggestion, opts: { assessment?: SourceAssessment; explanation?: Explanation; mapping?: Mapping | null } = {}): Comparison {
  const text = compareText(sourceDefinition(r), w.meaning)
  const a = opts.assessment
  const f = a ? freshness(a, r, w, opts.explanation) : undefined
  const cur = a && f === 'current' ? a : undefined
  const m = opts.mapping
  const by = (x: Mapping) => `${x.decision.by}, ${x.decision.on}`
  // What a person decided about THIS pair, if anything; it is a verdict only while the decision is current.
  let decided: 'same' | 'different' | undefined
  if (m && m.decision.how === 'person') {
    if (m.distinctFrom?.includes(w.id)) decided = 'different'
    else if (m.status === 'linked' && m.entry === w.id) decided = 'same'
  }
  const staleWhy = decided ? decisionOutdated(m, r) : undefined
  const outdatedDecision = decided && staleWhy ? { verdict: decided, by: m!.decision.by, on: m!.decision.on, why: staleWhy } : undefined

  let meaning: Comparison['meaning']
  if (decided === 'different' && !staleWhy) meaning = { state: 'different', basis: 'reviewer', label: 'Different sense—keep separate (reviewer decision)', reason: `Decided by ${by(m!)}.` }
  else if (decided === 'same' && !staleWhy) meaning = { state: 'same-confirmed', basis: 'reviewer', label: 'Same sense—confirmed by a reviewer', reason: `Linked by ${by(m!)}.` }
  else if (cur) {
    const v = cur.meaning.verdict, how = METHOD_LABEL[cur.method]
    const label = { 'likely-equivalent': `Likely equivalent—${how}`, 'same-confirmed': 'Same sense—confirmed by a reviewer', different: `Different sense—keep separate (${how})`, uncertain: `Uncertain—${how}; a reviewer should decide` }[v]
    meaning = { state: v, basis: 'assessment', label, reason: cur.meaning.reason, scope: cur.meaning.scope }
  } else {
    const why = [
      ...(f && f !== 'current' ? ['An earlier assessment is outdated.'] : []),
      ...(outdatedDecision ? ['An earlier reviewer decision is outdated.'] : [])
    ].join(' ')
    meaning = { state: 'not-assessed', basis: 'none', label: 'Meaning not assessed', ...(why ? { reason: why } : {}) }
  }

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
    ...(terminologySuggestion(w.meaning) ? { terminology: terminologySuggestion(w.meaning) } : {}),
    ...(outdatedDecision ? { outdatedDecision } : {})
  }
}

/** One short line for list rows, e.g. "叫: different wording · different sense · wording n/a". */
export function shortStatus(c: Comparison): string {
  const t = { exact: 'exact text', formatting: 'formatting only', different: 'different wording', missing: 'no text' }[c.text]
  const m = { 'not-assessed': 'meaning pending', 'likely-equivalent': 'likely equivalent', 'same-confirmed': 'same (reviewer)', different: 'different sense', uncertain: 'uncertain' }[c.meaning.state]
  const w = { 'not-assessed': 'wording pending', 'keep-game': 'keep game wording', 'prefer-source': 'source wording proposed', edited: 'edit proposed', 'not-applicable': 'wording n/a' }[c.wording.state]
  const stale = [...(c.outdated ? ['outdated'] : []), ...(c.outdatedDecision ? ['decision outdated'] : [])]
  return [`${c.entry}: ${t}`, m, w, ...stale].join(' · ')
}

// ---- coverage -----------------------------------------------------------------------------------------------------------------------

/** Counts of candidate PAIRS (one source record compared with one game entry), plus the distinct records and entries involved. */
export type Coverage = {
  pairs: number; records: number; entries: number
  meaning: Record<MeaningState, number>
  wording: Record<WordingState, number>
  text: Record<TextComparison, number>
  outdated: number; pronunciation: number
  /** Pairs whose reviewer decision is outdated (counted apart from outdated assessments). */
  decisionsOutdated: number
  byMethod: Record<AssessmentMethod, number>
}
export function coverage(cs: Comparison[]): Coverage {
  const c: Coverage = {
    pairs: cs.length, records: new Set(cs.map(x => x.record)).size, entries: new Set(cs.map(x => x.entry)).size,
    meaning: { 'not-assessed': 0, 'likely-equivalent': 0, 'same-confirmed': 0, different: 0, uncertain: 0 },
    wording: { 'not-assessed': 0, 'keep-game': 0, 'prefer-source': 0, edited: 0, 'not-applicable': 0 },
    text: { exact: 0, formatting: 0, different: 0, missing: 0 }, outdated: 0, pronunciation: 0, decisionsOutdated: 0,
    byMethod: { heuristic: 0, 'ai-assisted': 0, human: 0 }
  }
  for (const x of cs) {
    c.meaning[x.meaning.state]++; c.wording[x.wording.state]++; c.text[x.text]++
    if (x.outdated) c.outdated++
    if (x.outdatedDecision) c.decisionsOutdated++
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
    ...(c.outdated ? [`${n(c.outdated, 'assessment')} outdated`] : []),
    ...(c.decisionsOutdated ? [`${n(c.decisionsOutdated, 'reviewer decision')} outdated`] : [])
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
