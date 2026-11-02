// Observable comparison between one source record and one game entry. Pure, rule-based, no external service.
//
// Everything here is EVIDENCE: what the texts and readings are, and how they differ. Nothing here decides whether the two teach the
// same sense (meaning assessment) or which wording is better (wording assessment); those live in src/sources/assessment.ts and come
// from a person or a recorded AI-assisted editorial assessment. See docs/SOURCES.md §5.
import { LIMITS } from '../content/validate.ts'
import type { ReadingRelation } from '../content/recordings.ts'
import type { Word } from '../content/types.ts'
import { bestReading, recordReadings, type Suggestion } from './match.ts'
import type { SourceRecord } from './types.ts'

// ---- text ------------------------------------------------------------------------------------------------------------------

/**
 *  exact       the same characters, exactly. Says nothing about whether the definition is correct.
 *  formatting  equal after normalising case, whitespace and punctuation only ("I, me" / "I / me"). Words are never dropped,
 *              added or swapped: "to come" vs "come", synonyms, qualifiers and negations are all "different".
 *  different   any other difference in wording
 *  missing     one side has no text to compare
 */
export type TextComparison = 'exact' | 'formatting' | 'different' | 'missing'

/** The source's definition as one string (all its English meanings, in its order). */
export const sourceDefinition = (r: SourceRecord) => r.candidate.meanings.join('; ')

/** Case, whitespace and punctuation removed; every word kept, in order. */
export const formattingKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim()

export function compareText(source: string, game: string): TextComparison {
  if (!source.trim() || !game.trim()) return 'missing'
  if (source === game) return 'exact'
  const a = formattingKey(source), b = formattingKey(game)
  return a !== '' && a === b ? 'formatting' : 'different'
}

// ---- pronunciation -----------------------------------------------------------------------------------------------------------

export type PronunciationNote = { relation: ReadingRelation | 'neutral-tone'; differs: boolean; text: string }

/** What the readings are and how they differ. Describes the observation; never claims why they differ. */
export function describePronunciation(r: SourceRecord, w: Word): PronunciationNote {
  const { relation, reading, neutralToneOnly } = bestReading(r, w)
  const src = recordReadings(r).join(' / ') || '—'
  if (neutralToneOnly) return { relation: 'neutral-tone', differs: true, text: `The source gives ${src}; the game teaches ${w.pinyin}. Same syllables; the source marks a full tone where the game has a neutral tone. This comparison does not establish why (regional standard, citation form or another word). Check a recording before any listening use.` }
  switch (relation) {
    case 'main': return { relation, differs: false, text: `Same reading (${w.pinyin}).` }
    case 'variant': return { relation, differs: false, text: `The source gives ${reading}, which the game accepts as a variant of ${w.pinyin}.` }
    case 'speech': {
      const sp = w.speech.find(x => x.pinyin.normalize('NFC') === reading.normalize('NFC'))
      return { relation, differs: true, text: `The source gives ${reading}, which the game lists as connected speech${sp ? ` (${sp.context})` : ''}, not as its dictionary reading ${w.pinyin}. A recording may suit meaning questions, not pinyin questions, unless a person hears ${w.pinyin}.` }
    }
    case 'tone-differs': return { relation, differs: true, text: `The source gives ${src}; the game teaches ${w.pinyin}: same syllables, other tones. This comparison does not establish whether it is another word, another reading or a regional reading.` }
    case 'different': return { relation, differs: true, text: `Other syllables: the source gives ${src}; the game teaches ${w.pinyin}.` }
    default: return { relation, differs: true, text: 'The source gives no usable reading.' }
  }
}

// ---- terminology ---------------------------------------------------------------------------------------------------------------

/**
 * Grammar jargon in a short label and a plainer term for a beginner. A wording option only: it never establishes that two records
 * mean the same thing, and it is not proof that the replacement is better in every context. Keyed by English terms, never by
 * particular Chinese words.
 */
const TERMS: [RegExp, string][] = [[/\bclassifier(s?)\b/i, 'counting word$1'], [/\bmeasure word(s?)\b/i, 'counting word$1']]
export type TerminologySuggestion = { from: string; to: string; note: string }
export function terminologySuggestion(label: string): TerminologySuggestion | undefined {
  let out = label
  for (const [re, plain] of TERMS) out = out.replace(re, plain)
  if (out === label || out.length > LIMITS.meaning) return undefined
  return { from: label, to: out, note: 'Terminology suggestion: replaces a grammar term with a plainer one. Not a meaning assessment, and not proof that it is better in every context.' }
}

// ---- evidence headline -------------------------------------------------------------------------------------------------------

export const TEXT_LABEL: Record<TextComparison, string> = {
  exact: 'Exact text match—not a linguistic review.',
  formatting: 'Formatting-only difference—not a linguistic review.',
  different: 'Different wording.',
  missing: 'Missing comparable text.'
}

/** One line of matching evidence, e.g. "Same spelling and reading. Definitions differ; meaning assessment needed." */
export function evidenceHeadline(s: Suggestion, text: TextComparison, meaningPending: boolean): string {
  const spelled = s.evidence.find(e => e.aspect === 'spelling')?.level
  const sp = spelled === 'match' ? 'Same spelling' : spelled === 'partial' ? 'Matches one of the source\'s other forms' : 'Linked by a person; spelling differs'
  const rd = s.neutralToneOnly ? `${sp}; same syllables, neutral tone differs.`
    : ({ main: `${sp} and reading.`, variant: `${sp}; the source reading is an accepted variant.`, speech: `${sp}; the source gives the connected-speech form.`, 'tone-differs': `${sp}; other tones.`, different: `${sp}; other syllables.`, unknown: `${sp}; no reading to compare.` } as const)[s.reading]
  const tx = text === 'exact' ? 'Definitions are identical text' : text === 'formatting' ? 'Definitions differ only in formatting' : text === 'missing' ? 'No comparable definition' : 'Definitions differ'
  return `${rd} ${tx}${meaningPending ? '; meaning assessment needed.' : '.'}`
}
