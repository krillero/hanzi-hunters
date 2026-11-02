// Shapes of the content files (words.json, explanations.json, cloze.json, sources.json). Rules and examples: docs/CONTENT_GUIDE.md

// ---- provenance ---------------------------------------------------------------------------------
/** Review state of a piece of content. Never write 'human-reviewed' unless a person really did review it. */
export type Review = {
  /** ai-draft = written by an AI assistant, not checked by a person. imported = taken from a dataset, not yet checked by a person. human-reviewed = checked by `reviewer` on `date`. */
  status: 'ai-draft' | 'imported' | 'human-reviewed'
  reviewer?: string
  /** YYYY-MM-DD */
  date?: string
  note?: string
}
/** Pointer into sources.json plus where in that source the content comes from. */
export type SourceRef = {
  /** Key of an entry in sources.json (e.g. "CC-CEDICT", "Tatoeba", "HSK"). */
  name: string
  /** Entry, sentence id, level or page in that source, e.g. "朋友 peng2you5" or "sentence 1234 by <author>". */
  ref?: string
  /** YYYY-MM-DD the source was consulted (datasets change). */
  retrieved?: string
  note?: string
}
export type SourceInfo = { title: string; url?: string; license: string; attribution: string; usage?: string }
export type Sources = Record<string, SourceInfo>

/** One character (or component) with its sound and meaning. Used by `breakdown` and `compare` sections. */
export type Part = { char: string; pinyin?: string; meaning: string; note?: string }
/** One example sentence. `note`, `source`, `review` and `audio` are optional; see docs/CONTENT_GUIDE.md. */
export type Example = {
  zh: string; pinyin: string; en: string
  /** Short usage note (why this sentence, what to notice). */
  note?: string
  /** Where the sentence comes from. Names must exist in sources.json. */
  source?: SourceRef[]
  review?: Review
  /** Set to false when the sentence must NOT be read aloud (the text-to-speech reading is not trusted). Default: true. */
  audio?: boolean
}

export type Section =
  | { type: 'text'; heading?: string; body: string }
  | { type: 'tips'; heading?: string; items: string[] }
  | { type: 'breakdown'; heading?: string; intro?: string; parts: Part[] }
  | { type: 'compare'; heading?: string; intro?: string; items: Part[] }
  | { type: 'examples'; heading?: string; items: Example[] }

export type Explanation = {
  /** Popup title. Defaults to "About <hanzi>". */
  title?: string
  /** One or two sentences: the key idea. Always shown first. */
  summary: string
  sections: Section[]
  /** Other entry ids to link to (shown as buttons; opens their details). */
  related?: string[]
  source?: SourceRef[]
  review?: Review
}

export type Explanations = Record<string, Explanation>

// ---- vocabulary entries (words.json) -------------------------------------------------------------
/** word = a vocabulary word (one or more characters). character = a single character taught for its own sake (the original entries). particle = a grammar word taught by function. */
export type WordKind = 'word' | 'character' | 'particle'

/** Guidance for how the word sounds in connected speech. Never a dictionary reading and never accepted as the answer of a pinyin question. */
export type SpeechChange = { pinyin: string; context: string; note?: string }

/** One entry as written in words.json. Everything except hanzi / pinyin / meaning / group / note is optional. */
export type RawWord = {
  /** Stable identity used by saved progress and by explanations.json. Default: the hanzi. Required (and unique) when two entries share the same hanzi. */
  id?: string
  hanzi: string
  /** Dictionary pinyin with tone marks and standard spacing: "nǐ hǎo", "péngyou", "māma". Unmarked syllables must be declared in `neutral`. */
  pinyin: string
  meaning: string
  group: string
  note: string
  kind?: WordKind
  /** 1-based positions of neutral-tone syllables (those without a tone mark): 妈妈 māma -> [2]. */
  neutral?: number[]
  /** Accepted alternative pronunciations of the SAME word and meaning (谁: shéi / shuí). Never offered as wrong answers. */
  variants?: string[]
  /** Pronunciation changes in connected speech (不 -> bú, 一 -> yí / yì). Guidance only; excluded from wrong answers. */
  speech?: SpeechChange[]
  /** Reviewed wrong readings that make good pinyin distractors (used for multi-syllable or neutral-tone entries). */
  wrongPinyin?: string[]
  /** "none" = text-to-speech cannot be trusted to read this entry with the intended reading: no speaker button, no listening questions. Default "ok". */
  audio?: 'ok' | 'none'
  /** Only these question kinds may be asked for this entry (e.g. ["meaning", "particle"]). Default: automatic. */
  questions?: string[]
  /** Earlier ids of this same entry. Saved progress under an alias moves to this entry. */
  aliases?: string[]
  /** Ids of entries whose meaning is too close to be a fair wrong answer. */
  confusable?: string[]
  /** Ids of same-length entries that look similar (look-alike questions). */
  lookalike?: string[]
  /**
   * A concrete noun that reads naturally in generated sentences such as 这里有 X ("there is X here") and 我要 X ("I would like X"):
   * food, objects, animals, places, people. Abstract words, body parts and literary single characters are left out.
   */
  noun?: boolean
  /** The measure word used when counting this noun (an entry id, e.g. "个"): 三个人. Only set when it is the usual one. */
  measure?: string
  source?: SourceRef[]
  review?: Review
}

/** A normalised entry, as used by the game. `id`, `kind`, `neutral`, `variants`, `speech`, `wrongPinyin`, `audio` and `aliases` always have a value. */
export type Word = Omit<RawWord, 'id' | 'kind' | 'neutral' | 'variants' | 'speech' | 'wrongPinyin' | 'audio' | 'aliases' | 'confusable' | 'lookalike' | 'questions'> & {
  id: string
  kind: WordKind
  neutral: number[]
  variants: string[]
  speech: SpeechChange[]
  wrongPinyin: string[]
  audio: 'ok' | 'none'
  aliases: string[]
  confusable?: string[]
  lookalike?: string[]
  questions?: string[]
}

// ---- grammar-in-context questions (cloze.json) -----------------------------------------------------
/** One authored fill-in-the-blank question. Options are particle entry ids; `why` explains every wrong option. */
export type ClozeItem = {
  id: string
  /** Entry id of the correct particle (also the entry whose progress this question updates). */
  answer: string
  /** Sentence with one blank written as ___ */
  zh: string
  pinyin: string
  /** The intended meaning: it is shown to the learner so only one option fits. */
  en: string
  /** 2-4 entry ids including the answer. */
  options: string[]
  /** For every wrong option: one short reason it does not fit here. */
  why: Record<string, string>
  note?: string
  /** Entries the learner must be ready on before this sentence is assessed (the words and constructions it relies on). Authored, never inferred from characters. */
  prerequisiteEntries?: string[]
  /** Lessons (any curriculum) that must be completed before this sentence is assessed. */
  prerequisiteLessons?: string[]
  source?: SourceRef[]
  review: Review
}

// ---- curricula (curricula.json) ----------------------------------------------------------------------
// A curriculum is the TEACHING ORDER. It only references vocabulary entries by their stable `id`; definitions stay in words.json,
// and progress stays keyed by entry id, so the same entry can belong to several curricula without duplicating either.
// Ordering has exactly one representation: array position (units, then lessons, then introductions). There are no numeric ranks.

/** Where an entry sits in an official syllabus. Metadata only: never used to order teaching. Missing = unknown (never inferred). */
export type OfficialLevel = {
  /** Key in sources.json, e.g. "HSK". */
  source: string
  /** The exact edition, e.g. "HSK 3.0 (2021)" or "HSK 2.0 (2012)". Required: editions differ. */
  edition: string
  /** The level as that edition names it, e.g. "1" or "1-3". */
  level: string
  /** Optional page / list reference in that edition. */
  ref?: string
}

/** One vocabulary entry introduced by a lesson. */
export type Introduction = {
  /** Entry id in words.json (the hanzi unless the entry declares an explicit id). */
  entryId: string
  /** Entries that must be ready (see `readiness`) before this one is introduced. Explicit only: nothing is inferred from characters. */
  prerequisiteEntries?: string[]
  /** false = taught in order, but not needed for the lesson to count as ready. Default true. */
  required?: boolean
  officialLevels?: OfficialLevel[]
}

export type Lesson = {
  /** Stable id: saved lesson completion is keyed by it, never by position. Never reuse an id for different content. */
  id: string
  title: string
  /** Lessons that must be ready (or were completed before) before this lesson introduces anything. */
  prerequisiteLessons?: string[]
  /** Earlier ids of this same lesson; their saved completion carries over. */
  aliases?: string[]
  introductions: Introduction[]
}

export type Unit = { id: string; title: string; lessons: Lesson[] }

/** When is an entry "ready to advance"? It has been introduced and reached `minLevel` (mastery level, 1 to 4). Default { minLevel: 1 }. */
export type Readiness = { minLevel: number }

export type Curriculum = {
  /** Stable id (lowercase letters, digits, dashes). Saved course progress is keyed by it. */
  id: string
  /** Positive integer. Raise it whenever units, lessons or introductions change (see docs/CURRICULUM.md). */
  version: number
  title: string
  description?: string
  /** true = the order is a placeholder that has not been pedagogically designed or reviewed. */
  provisional?: boolean
  readiness?: Readiness
  units: Unit[]
  source?: SourceRef[]
  review?: Review
}

export type CurriculaFile = {
  /** Id of the curriculum the game uses. */
  default: string
  curricula: Curriculum[]
}
