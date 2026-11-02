// The source layer: imported learning material kept separate from the game's own content.
// Full description, identity rules and data flow: docs/SOURCES.md.
//
//   source            a dataset or book we import from               id = key in src/content/sources.json ("accc-anki")
//   source record     one original item of that source               key = "<source>:<original id>" ("accc-anki:B1-L01-03")
//   game entry        one vocabulary entry the game teaches          id = words.json entry id ("个", "看-look")
//   content item      a reusable piece of content (recording, ...)    id = "<source>:<type>:<local id>"
//   course / lesson   teaching order                                 ids in curricula.json
//
// Chinese text is a matching aid, never an identity: the same characters can be different readings, meanings, words or names.
import type { Review, SpeechChange, WordKind } from '../content/types.ts'

/** Bumped when the shape of the files below changes; readers refuse unknown versions instead of guessing. */
export const SOURCE_SCHEMA_VERSION = 1

// ---- imported source data (public/sources/<source>/) ---------------------------------------------------------------

/** Where an imported record sat in its own source (book / lesson / item). Placement metadata only: never activates anything. */
export type Placement = {
  /** The source's own course or series name, when it has several. */
  course?: string
  book?: number
  lesson?: number
  /** Part of the lesson's vocabulary list, as the source names it ("I", "II"). */
  part?: string
  /** Section inside a part, when the source has one (ACCC "B5L01-I-0-05" -> "0", "B6L01-III-T-01" -> "T"). */
  section?: string
  item?: number
  /** Human-readable position, e.g. "B1 L01 I #3". */
  label?: string
  /** Global order within the source (0-based), for sorting. */
  order: number
}

/** One media file belonging to a record. `path` is a generated, safe path relative to the site root (never the archive's own name). */
export type MediaRef = {
  /** Stable id: "<source>:media:<sha256 prefix>". */
  id: string
  kind: 'audio' | 'image' | 'font' | 'other'
  /** The file name as the source referenced it (verbatim, for traceability only). */
  original: string
  path?: string
  sha256?: string
  bytes?: number
  /** Checks that actually ran on the file, e.g. "present", "non-empty", "mp3-signature". Not proof of correct speech. */
  checks: string[]
  problems: string[]
}

/** Normalised fields used for matching and as game candidates. Derived from `fields`; the original values are never modified. */
export type Candidate = {
  /** Simplified written forms (the first is the main one). Matching only. */
  simplified: string[]
  traditional: string[]
  /** Readings as declared by the source (tone marks kept). The first is the main reading. */
  readings: string[]
  pos: string[]
  /** English meanings split from the source's meaning text. */
  meanings: string[]
  /** Structured variants: another written form and/or reading of the same item. `raw` keeps the original text. */
  variants: { form?: string; reading?: string; raw: string }[]
  /** Facts that may need adaptation before the record could become a playable entry, e.g. "phrase", "name", "too-long". */
  flags: string[]
  /**
   * The source's short-meaning field exists in this source but is empty for this record (kept explicitly missing: `meanings` is
   * then empty, and any short label proposed later is an editorial proposal, not the source's).
   */
  meaningMissing?: boolean
  /**
   * Fuller dictionary definitions, one block per reading, as the source structures them. Never merged into `meanings`: a
   * definition under another reading is another word or sense, not the record's main meaning.
   */
  definitions?: DefinitionBlock[]
  /** Part of speech the source marks as dominant (others stay in `pos`). */
  posDominant?: string
  /** Source metadata used as evidence only, e.g. { frequency: "Top 100", level: "HSK 1" }. Never a teaching order. */
  meta?: Record<string, string>
}

/** One reading's definitions in a source dictionary field. `senses` keep the source's numbering order and qualifiers. */
export type DefinitionBlock = { reading: string; zhuyin?: string; senses: string[]; classifiers?: { form: string; reading?: string }[] }

export type SourceRecord = {
  /** Stable source-record key: "<source>:<original id>". Unique within the source (validated on import). */
  key: string
  source: string
  /** The source's own identifier for the item (Anki: the note's "ID" field). */
  originalId: string
  /** Other native identifiers kept for traceability (Anki: note id, guid, card ids). */
  native: Record<string, string>
  /** Snapshot (package sha256 prefix) this version of the record comes from. */
  snapshot: string
  /** sha256 (hex, 16 chars) of the original fields plus media hashes. Changes whenever the source content changes. */
  hash: string
  /** The original fields, verbatim (no trimming, no normalisation). */
  fields: Record<string, string>
  candidate: Candidate
  placement?: Placement
  media: MediaRef[]
  /** Parse problems and unsupported cases for this record. */
  issues: string[]
}

/** Provenance of a reusable content item. `mode` tells verbatim imported material from editorial adaptations. */
export type Provenance = {
  source: string
  /** Source-record key, when the item comes from one record. */
  record?: string
  /** The record's hash when the item was taken (stale detection). */
  recordHash?: string
  /** Free-form pointer inside the source (page, sentence number). */
  ref?: string
  mode: 'verbatim' | 'adapted' | 'authored'
}

/**
 * Relationship between content and what it is about. Never inferred from Chinese substrings: a character inside a word is not an
 * occurrence of the standalone entry. Exactly one of `entry` (game entry id), `record` (source-record key) or `objective` is set.
 *  teaches   the intended meaning or construction
 *  contains  vocabulary that occurs in the content
 *  requires  knowledge needed before the content can be assessed
 */
export type ContentLink = { entry?: string; record?: string; objective?: string; role: 'teaches' | 'contains' | 'requires' }

type ContentBase = { id: string; provenance: Provenance; review: Review; links?: ContentLink[] }

/** A specific recording. The declared reading is what the source says; it is not assumed to match what is actually spoken. */
export type RecordingItem = ContentBase & {
  type: 'recording'
  /** Word recordings and sentence recordings are kept apart. */
  scope: 'word' | 'sentence'
  /** Media id in the record's `media`. */
  media: string
  file: string
  sha256: string
  /** The text that is spoken (as the source gives it; simplified where available). */
  text: string
  /** Reading as declared by the source (verbatim). */
  declaredReading?: string
  /** Language variety, only when the source states it. */
  variety?: string
  /**
   * Where the recording comes from, when known (speaker, collection, or text-to-speech). "unknown" when the source does not say
   * per file; an included file is never assumed to be a human recording.
   */
  origin?: { status: 'known' | 'unknown'; note?: string }
  /** unverified = nobody has listened and confirmed what it says. Imported recordings always start unverified. */
  pronunciation?: 'unverified'
}
export type SentenceItem = ContentBase & { type: 'sentence'; zh: string; en: string; pinyin?: string; /** Recording item id. */ audio?: string }
export type DefinitionItem = ContentBase & { type: 'definition'; text: string; pos?: string }
export type ExplanationItem = ContentBase & { type: 'explanation'; title?: string; body: string }
export type ContentItem = RecordingItem | SentenceItem | DefinitionItem | ExplanationItem

/** A task with explicit learning targets. Kept separate from the sentence it uses: one sentence can support several exercises. */
export type Exercise = {
  id: string
  /** Mechanic family, e.g. "cloze", "choice", "order". The game decides later which mechanics it supports. */
  type: string
  /** What the exercise assesses (role "teaches"): entries, source records or explicit learning objectives. */
  targets: ContentLink[]
  /** Content item ids the exercise is built on (sentences, recordings). */
  content: string[]
  prerequisites?: { entries?: string[]; lessons?: string[]; records?: string[] }
  answer: {
    /** The correct answer(s). */
    accept: string[]
    /** Offered choices, when the mechanic has any. Accepted alternatives are never offered as wrong choices. */
    choices?: string[]
    /** Which part of the sentence is blanked, e.g. the blank marker "___" position or a token index. */
    blank?: string
  }
  feedback?: { correct?: string; wrong?: Record<string, string> }
  difficulty?: number
  tags?: string[]
  provenance: Provenance
  review: Review
}

/** What a source adapter produces. Every part except `records` is optional: a source supplies whatever subset it has. */
export type SourceBundle = {
  schemaVersion: typeof SOURCE_SCHEMA_VERSION
  source: string
  adapter: string
  snapshot: { id: string; sha256: string; file: string; bytes: number; retrieved?: string; detail?: Record<string, string> }
  records: SourceRecord[]
  content: ContentItem[]
  exercises: Exercise[]
  /** Import report: counts and problems. */
  report: ImportReport
}

export type ImportReport = {
  counts: Record<string, number>
  /** Problems grouped by kind ("missing-field", "missing-media", "duplicate-id", "parse", "unsupported"), with examples. */
  problems: Record<string, string[]>
  /** What was actually checked, in plain words. */
  checksRan: string[]
  notChecked: string[]
}

/** public/sources/<source>/manifest.json */
export type SourceManifest = {
  schemaVersion: typeof SOURCE_SCHEMA_VERSION
  source: string
  adapter: string
  snapshot: SourceBundle['snapshot']
  counts: Record<string, number>
}

/** public/sources/index.json: the imported sources the review screen can open. */
export type SourceIndex = { schemaVersion: typeof SOURCE_SCHEMA_VERSION; sources: { id: string; title: string; snapshot: string; records: number }[] }

/** Result of comparing a new import with the previous one. */
export type ImportDiff = {
  from: string | null
  to: string
  added: string[]
  removed: string[]
  changed: string[]
  unchanged: number
  /** Committed decisions (mappings, recordings, selections) whose record changed or disappeared: flagged for reassessment. */
  flagged: string[]
}

// ---- decisions about source records (src/content/*.json, committed) -------------------------------------------------

/** Who made a decision. A mechanical or suggested link is never a person's linguistic review. */
export type Decision = { by: string; on: string; how: 'person' | 'tool' }

/** A proposed new game entry prepared from a record. Not playable until promoted (npm run source:promote) and placed in a course. */
export type EntryDraft = {
  id: string; hanzi: string
  /** Lowercase dictionary pinyin with tone marks, as the game requires. */
  pinyin: string
  meaning: string; note?: string; group?: string
  /** 1-based neutral-tone positions. Always equal to the syllables without a tone mark; promotion recomputes it from `pinyin`. */
  neutral?: number[]
  /** word / character / particle; omitted = automatic (by length). */
  kind?: WordKind
  /** Other accepted readings of the same word and meaning (ACCC "zhè / zhèi"). */
  variants?: string[]
  /** Connected-speech guidance, if a person adds it. */
  speech?: SpeechChange[]
}

/**
 * Mapping between ONE source record and the game. Review status (`status` + `decision`) is separate from match confidence, which
 * is computed by the matcher and never stored here.
 *  unresolved      nobody decided yet (the default for every record)
 *  linked          this record is about the game entry `entry` (same meaning and reading). Changes nothing else by itself.
 *  new-candidate   could become a new entry; `draft` holds the proposal
 *  excluded        not wanted; optional `reason`
 */
export type Mapping = {
  status: 'unresolved' | 'linked' | 'new-candidate' | 'excluded'
  entry?: string
  reason?: string
  draft?: EntryDraft
  /** Entries a person decided this record does NOT mean (same characters, different meaning). Kept with any status. */
  distinctFrom?: string[]
  recordHash: string
  decision: Decision
  /** Set by the importer when the record changed or disappeared after this decision. Cleared by the next decision. */
  reassess?: string
}
export type MappingsFile = { schemaVersion: typeof SOURCE_SCHEMA_VERSION; mappings: Record<string, Mapping> }

/** Uses a recording may be put to. `display` = speaker buttons only. The listening kinds are question kinds. */
export type RecordingUse = 'display' | 'listen' | 'listen2meaning' | 'listen2pinyin'

/**
 * A recording selected for a game entry (src/content/recordings.json, loaded by the game). Copied from the source's RecordingItem
 * at selection time, so the game never loads the source data.
 */
export type SelectedRecording = {
  id: string
  entry: string
  scope: 'word' | 'sentence'
  /** Path relative to the site root (BASE_URL). */
  file: string
  sha256: string
  text: string
  provenance: Provenance
  reading: {
    /** What the source declares (verbatim). */
    declared?: string
    /** What a person heard and confirmed. Never filled by tools. */
    verified?: string
    verifiedBy?: string
    verifiedOn?: string
  }
  variety?: string
  /** unverified = nobody listened yet; verified = a person confirmed the reading; rejected = must not be played. */
  validation: 'unverified' | 'verified' | 'rejected'
  /** Uses a person explicitly allowed. Eligibility is still checked against the entry's readings (content/recordings.ts). */
  uses: RecordingUse[]
  decision: Decision
  reassess?: string
}
export type RecordingsFile = { schemaVersion: typeof SOURCE_SCHEMA_VERSION; recordings: SelectedRecording[] }

/**
 * A field-specific content choice for one entry, written into words.json when applied:
 *  game    a deliberate "keep the game's own text" (nothing changes)
 *  source  the source's text, verbatim or shortened (`provenance.mode` verbatim / adapted)
 *  edited  a reviewer's own wording, written after comparing with a record (`provenance.mode` authored; the record is the
 *          one consulted, not the origin of the text)
 */
export type FieldSelection = {
  entry: string
  field: 'meaning' | 'note'
  choice: 'game' | 'source' | 'edited'
  value?: string
  provenance?: Provenance
  decision: Decision
  reassess?: string
}
export type SelectionsFile = { schemaVersion: typeof SOURCE_SCHEMA_VERSION; selections: FieldSelection[] }

// ---- changesets (exported by the review screen, applied by npm run source:apply) -------------------------------------

/** Every operation carries the state it was made against (`before`), so a stale changeset cannot overwrite newer decisions. */
export type ChangeOp =
  | { op: 'mapping'; record: string; recordHash: string; before: Mapping | null; after: Mapping }
  | { op: 'recording'; record: string; recordHash: string; entry: string; before: SelectedRecording | null; after: SelectedRecording | null }
  | { op: 'field'; entry: string; field: FieldSelection['field']; currentValue: string; before: FieldSelection | null; after: FieldSelection }

export type Changeset = {
  kind: 'hanzi-hunters-changeset'
  schemaVersion: typeof SOURCE_SCHEMA_VERSION
  source: string
  /** Snapshot sha256 of the source data the reviewer saw. */
  snapshot: string
  createdAt: string
  reviewer: string
  ops: ChangeOp[]
}
