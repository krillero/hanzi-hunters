// Candidate matching between source records and game entries. Pure, no external services.
// The matcher FINDS CANDIDATES worth comparing and lists the observable evidence (spelling, reading, English-word overlap, part of
// speech). It never concludes that two definitions mean the same thing or differ: that is a meaning assessment
// (src/sources/assessment.ts), made by a person or recorded as an AI-assisted editorial assessment, never by these rules.
// `strength` says how worth comparing a candidate is (spelling + reading), not whether its definition is correct or equivalent.
import type { Word } from '../content/types.ts'
import { readingRelation, type ReadingRelation } from '../content/recordings.ts'
import { splitSyllables } from '../content/pinyin.ts'
import type { SourceRecord } from './types.ts'

/** match / partial / mismatch describe an observation; `neutral` = observed, but says nothing either way (e.g. no shared words). */
export type EvidenceLevel = 'match' | 'partial' | 'mismatch' | 'neutral' | 'unknown'
export type Evidence = { aspect: 'spelling' | 'reading' | 'english' | 'kind' | 'mapping'; level: EvidenceLevel; detail: string }
/**
 * How worth comparing a candidate is, from spelling and reading only:
 *  strong    same main spelling and the game's reading (or an accepted variant)
 *  possible  same spelling, reading differs only by connected speech / neutral tone, or another of the source's forms
 *  weak      same spelling, other tones
 *  unlikely  same spelling, but other syllables, or the reading belongs to another entry written the same way
 * Never a statement about meaning.
 */
export type CandidateStrength = 'strong' | 'possible' | 'weak' | 'unlikely'
export type Suggestion = { entry: string; strength: CandidateStrength; score: number; reading: ReadingRelation; neutralToneOnly: boolean; sharedWords: string[]; evidence: Evidence[]; warnings: string[] }
export const STRENGTH_LABEL: Record<CandidateStrength, string> = { strong: 'strong candidate', possible: 'possible candidate', weak: 'weak candidate', unlikely: 'unlikely candidate' }

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'be', 'is', 'for', 'and', 'or', 'in', 'on', 'at', 'with', 'one', "one's", 'sb', 'sth', 'someone', 'something', 'etc', 'used', 'as', 'by', 'it', 'up', 'out'])
/** Lower-case content words of an English gloss ("to like / be fond of" -> like, fond). */
export function glossWords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z']+/)) {
    const w = raw.replace(/^'+|'+$/g, '')
    if (w.length < 2 || STOP.has(w)) continue
    const base = w.endsWith('s') && w.length > 3 && !w.endsWith('ss') ? w.slice(0, -1) : w
    out.add(base)
  }
  return out
}

/** Literal English-word overlap (no synonyms). Evidence for ranking candidates only: sharing a word does not make two senses the same,
 *  and sharing none does not make them different. */
export function meaningOverlap(a: string, b: string[]): { shared: string[]; level: EvidenceLevel } {
  let left = glossWords(a)
  let right = new Set<string>(); for (const m of b) for (const w of glossWords(m)) right.add(w)
  // Glosses made only of common words ("to be") are compared with only the articles removed.
  if (left.size === 0 || right.size === 0) {
    const loose = (t: string) => new Set(t.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z']+/).filter(x => x && !['a', 'an', 'the', 'to'].includes(x)))
    left = loose(a); right = new Set(b.flatMap(m => [...loose(m)]))
  }
  if (left.size === 0 || right.size === 0) return { shared: [], level: 'unknown' }
  const shared = [...left].filter(w => right.has(w))
  if (shared.length === 0) return { shared, level: 'neutral' }
  return { shared, level: shared.length >= Math.min(left.size, right.size) ? 'match' : 'partial' }
}

/** Same syllables and the only differences are a neutral tone on one side (péngyǒu vs péngyou). An observation only: it may be a
 *  regional standard, a citation form or another word; the cause is not established by this check. */
export function neutralToneOnly(a: string, b: string): boolean {
  const x = splitSyllables(a.normalize('NFC').toLowerCase()), y = splitSyllables(b.normalize('NFC').toLowerCase())
  if (!x || !y || x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) {
    if (x[i].base !== y[i].base) return false
    if (x[i].tone !== y[i].tone) { if (x[i].tone !== 0 && y[i].tone !== 0) return false; diff++ }
  }
  return diff > 0
}

/** A gloss that only names a grammatical category ("sentence final particle", "general measure word", "modification marker").
 *  Descriptive evidence only: a category label is not evidence that two records teach the same use. */
export function categoryOnly(gloss: string): boolean {
  return /^(an? )?(general |sentence[- ]final |verbal |adverbial |aspect(ual)? |modal |structural |question |modification |complement |disposal )?(particle|marker|measure word|classifier)$/i.test(gloss.trim())
}

/** Source parts of speech that correspond to the game's `kind`s (only where the correspondence is clear). */
const POS_PARTICLE = /^(ptc|particle|助詞|助词)$/i

/** All game entries a record could be about, best first. Records whose spelling matches no entry get no suggestion. */
/** The record's readings, main ones first, then variant readings. */
export const recordReadings = (r: SourceRecord) => [...r.candidate.readings, ...r.candidate.variants.flatMap(v => (v.reading ? [v.reading] : []))]
const ORDER: ReadingRelation[] = ['main', 'variant', 'speech', 'tone-differs', 'different', 'unknown']
/** Best relation between any of the record's readings and the entry's readings (main, variants, connected speech). */
export function bestReading(r: SourceRecord, w: Word): { relation: ReadingRelation; reading: string; neutralToneOnly: boolean } {
  const readings = recordReadings(r)
  let relation: ReadingRelation = 'unknown', reading = ''
  for (const x of readings) { const y = readingRelation(x, w); if (ORDER.indexOf(y) < ORDER.indexOf(relation)) { relation = y; reading = x } }
  const neutralOnly = relation === 'tone-differs' && readings.some(x => [w.pinyin, ...w.variants].some(p => neutralToneOnly(x, p)))
  return { relation, reading, neutralToneOnly: neutralOnly }
}

/**
 * All game entries a record could be about, most worth comparing first. Records whose spelling matches no entry get none.
 * `linkedTo`: an entry a person already linked this record to (an existing mapping), reported as evidence.
 */
export function suggest(record: SourceRecord, words: Word[], opts: { linkedTo?: string } = {}): Suggestion[] {
  const forms = new Set(record.candidate.simplified)
  for (const v of record.candidate.variants) if (v.form) forms.add(v.form)
  const main = record.candidate.simplified[0]
  const hits = words.filter(w => forms.has(w.hanzi) || w.id === opts.linkedTo)
  const readings = recordReadings(record)
  const out: Suggestion[] = []
  for (const w of hits) {
    const evidence: Evidence[] = []
    const warnings: string[] = []
    const exact = w.hanzi === main
    const spelled = forms.has(w.hanzi)
    evidence.push(exact ? { aspect: 'spelling', level: 'match', detail: `same simplified spelling ${w.hanzi}` }
      : spelled ? { aspect: 'spelling', level: 'partial', detail: `${w.hanzi} matches one of the source's other forms (${[...forms].join(', ')}), not its main form ${main ?? '?'}` }
      : { aspect: 'spelling', level: 'mismatch', detail: `${w.hanzi} is not one of the source's forms (${[...forms].join(', ')})` })

    const { relation: rel, reading: relReading, neutralToneOnly: neutralOnly } = bestReading(record, w)
    const all = readings.join(' / ') || '—'
    const readingText: Record<ReadingRelation, [EvidenceLevel, string]> = {
      main: ['match', `source reading ${relReading} = game pinyin ${w.pinyin}`],
      variant: ['match', `source reading ${relReading} is a variant the game already accepts for ${w.pinyin}`],
      speech: ['partial', `source reading ${relReading} is the game's connected-speech form; the game's dictionary reading is ${w.pinyin}`],
      'tone-differs': neutralOnly
        ? ['partial', `source reading ${all} vs game ${w.pinyin}: same syllables; the source marks a full tone where the game teaches a neutral tone (observed difference; its cause is not established here)`]
        : ['mismatch', `source reading ${all} vs game ${w.pinyin}: same syllables, other tones`],
      different: ['mismatch', `source reading ${all} vs game ${w.pinyin}: other syllables`],
      unknown: ['unknown', 'the source gives no usable reading']
    }
    evidence.push({ aspect: 'reading', level: readingText[rel][0], detail: readingText[rel][1] })
    if (rel === 'tone-differs') warnings.push(`Tones differ from the game's ${w.pinyin}: a recording from this record is not used for any listening question unless a person verifies a reading the game accepts.`)
    if (rel === 'speech') warnings.push('A recording from this record must not be used for pinyin listening questions unless a person verifies it says the dictionary reading.')

    const m = meaningOverlap(w.meaning, record.candidate.meanings)
    evidence.push({ aspect: 'english', level: m.level === 'unknown' ? 'unknown' : m.shared.length ? 'partial' : 'neutral',
      detail: m.level === 'unknown' ? 'no English text to compare'
        : m.shared.length ? `English words in common: ${m.shared.join(', ')} (overlap only; not evidence that the senses are the same)`
        : 'no English words in common (not evidence that the senses differ)' })
    if (record.candidate.meanings.some(categoryOnly)) evidence.push({ aspect: 'english', level: 'neutral', detail: `the source gloss names a grammatical category (“${record.candidate.meanings.join('; ')}”), which does not say which use it teaches` })

    const pos = record.candidate.pos
    if (pos.length > 0) {
      const srcParticle = pos.some(p => POS_PARTICLE.test(p))
      if (srcParticle !== (w.kind === 'particle')) evidence.push({ aspect: 'kind', level: 'partial', detail: `source part of speech ${pos.join('/')} vs game kind ${w.kind}` })
      else evidence.push({ aspect: 'kind', level: 'neutral', detail: `source part of speech ${pos.join('/')}; game kind ${w.kind}` })
    }
    if (opts.linkedTo === w.id) evidence.push({ aspect: 'mapping', level: 'match', detail: 'a person linked this record to this entry (existing mapping)' })

    const sameSpelling = words.filter(x => x.hanzi === w.hanzi)
    if (sameSpelling.length > 1) warnings.push(`The game has ${sameSpelling.length} entries written ${w.hanzi} (${sameSpelling.map(x => `${x.id}: ${x.pinyin} ${x.meaning}`).join('; ')}). Check which one the source means.`)
    if (record.candidate.flags.length) warnings.push(`Source flags: ${record.candidate.flags.join(', ')}`)

    // Strength from spelling and reading only. English overlap only orders candidates of equal strength.
    const readOk = rel === 'main' || rel === 'variant'
    let strength: CandidateStrength
    if (!spelled) strength = opts.linkedTo === w.id ? 'possible' : 'weak'
    else if (rel === 'different') strength = 'unlikely'
    else if (rel === 'tone-differs') strength = neutralOnly ? 'possible' : 'weak'
    else if (readOk && exact) strength = 'strong'
    else strength = 'possible'
    const score = { strong: 3, possible: 2, weak: 1, unlikely: 0 }[strength] + (exact ? 0.5 : 0) + (m.shared.length * 0.1) + (opts.linkedTo === w.id ? 1 : 0)
    out.push({ entry: w.id, strength, score, reading: rel, neutralToneOnly: neutralOnly, sharedWords: m.shared, evidence, warnings })
  }
  // When the source's reading is exactly one entry's reading, other entries with the same characters are another reading.
  const exactReading = out.find(x => x.reading === 'main' || x.reading === 'variant')
  if (exactReading) for (const x of out) if (x !== exactReading && (x.reading === 'tone-differs' || x.reading === 'different') && WORD_HANZI(words, x.entry) === WORD_HANZI(words, exactReading.entry)) {
    x.strength = 'unlikely'; x.score = Math.min(x.score, 0.5)
    x.warnings.unshift(`The source reading is exactly that of ${exactReading.entry}; this entry is another reading of the same characters.`)
  }
  return out.sort((a, b) => b.score - a.score)
}
const WORD_HANZI = (words: Word[], id: string) => words.find(w => w.id === id)?.hanzi

/** Several candidates of equal strength, or none strong: a person has to pick which entry (if any) the record is about. */
export function isAmbiguous(s: Suggestion[]): boolean {
  if (s.length === 0) return false
  if (s[0].strength === 'unlikely' || s[0].strength === 'weak') return true
  return s.length > 1 && s[1].strength === s[0].strength
}
