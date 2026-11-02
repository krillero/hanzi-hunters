// Review recommendations: three separate judgements for one source record and one game entry, each with a plain reason.
//   1. meaning        do they teach the same meaning?          (decides: link / keep separate / leave unresolved)
//   2. wording        which text teaches that meaning best?   (decides: keep game text / use source text / use an edited text)
//   3. pronunciation  how do the readings relate?             (informs the recording check; never a meaning question)
// Rule-based and explainable, no external service. A recommendation is never a decision and never a linguistic review.
import { LIMITS } from '../content/validate.ts'
import { readingRelation, type ReadingRelation } from '../content/recordings.ts'
import type { Word } from '../content/types.ts'
import { categoryOnly, glossWords, meaningOverlap, neutralToneOnly } from './match.ts'
import type { SourceRecord } from './types.ts'

export { categoryOnly }
export type MeaningVerdict = 'same' | 'check' | 'different'
export type WordingAction = 'keep-game' | 'use-source' | 'edit'
export type Recommendation = {
  entry: string
  meaning: { verdict: MeaningVerdict; reason: string }
  wording: { action: WordingAction; reason: string; suggestion?: string }
  pronunciation: { relation: ReadingRelation | 'neutral-tone'; reason: string }
  /** One line, e.g. "Same meaning; keep the game wording." */
  summary: string
}

const GRAMMAR_TERM = /\b(particle|marker|measure word|classifier|complement)\b/i
/** "marks a yes/no question", "measure word for books": a gloss that says what the word does or is used for. */
const describesUse = (gloss: string) => /\b(marks?|for|used|indicat\w*|shows?|asks?|turns?|makes?)\b/i.test(gloss) && !categoryOnly(gloss)
const isGrammarWord = (w: Word, r: SourceRecord) => w.kind === 'particle' || GRAMMAR_TERM.test(w.meaning) || r.candidate.pos.some(p => /^(ptc|m|particle)$/i.test(p))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Grammar jargon in a short label, replaced by what it does for a beginner. Only these explicit substitutions. */
const PLAIN: [RegExp, string][] = [[/\bclassifier\b/i, 'counting word'], [/\bmeasure word\b/i, 'counting word']]
export function plainerLabel(label: string): string | undefined {
  let out = label
  for (const [re, plain] of PLAIN) out = out.replace(re, plain)
  return out !== label && out.length <= LIMITS.meaning ? out : undefined
}

function judgeMeaning(r: SourceRecord, w: Word, words: Word[], rel: ReadingRelation, neutralOnly: boolean, distinct: boolean): Recommendation['meaning'] {
  const src = r.candidate.meanings.join('; ')
  if (distinct) return { verdict: 'different', reason: `A reviewer decided this record does not have the meaning of ${w.id}.` }
  if (rel === 'different') return { verdict: 'different', reason: `Different syllables (${r.candidate.readings.join(' / ')} vs ${w.pinyin}): probably a different word written the same way.` }
  const m = meaningOverlap(w.meaning, r.candidate.meanings)
  const sameSpelling = words.filter(x => x.hanzi === w.hanzi)
  if (rel === 'tone-differs' && !neutralOnly) {
    if (sameSpelling.length > 1 && sameSpelling.some(x => x.id !== w.id && ['main', 'variant'].includes(readingRelation(r.candidate.readings[0], x)))) return { verdict: 'different', reason: `The source reading matches another entry written ${w.hanzi}; this is another reading of the characters.` }
    return { verdict: 'check', reason: `The tones differ (${r.candidate.readings.join(' / ')} vs ${w.pinyin}). That can be a regional reading of the same word or a different word: check the meaning.` }
  }
  if (m.level === 'match' || m.level === 'partial') return { verdict: 'same', reason: `Both describe the same thing (shared: ${m.shared.join(', ')}). Differences are in wording only.` }
  if (r.candidate.meanings.some(categoryOnly) && isGrammarWord(w, r)) return { verdict: 'same', reason: `“${src}” names a grammatical category; “${w.meaning}” describes what the word does. A wording difference, not a meaning conflict.` }
  if (glossWords(src).size === 0) return { verdict: 'check', reason: 'The source gives no English meaning to compare.' }
  if (sameSpelling.length === 1 && (rel === 'main' || rel === 'variant' || rel === 'speech' || neutralOnly)) return { verdict: 'check', reason: `Same characters and reading, and the game has only one entry written ${w.hanzi}, but the English wordings share no words (“${src}” vs “${w.meaning}”). Probably the same meaning; check that it is not another sense.` }
  return { verdict: 'check', reason: `The wordings share nothing (“${src}” vs “${w.meaning}”): check whether this is the same sense.` }
}

function judgeWording(r: SourceRecord, w: Word): Recommendation['wording'] {
  const srcs = r.candidate.meanings
  const src = srcs.join('; ')
  if (srcs.some(s => norm(s) === norm(w.meaning))) return { action: 'keep-game', reason: 'Same wording.' }
  const plain = plainerLabel(w.meaning)
  // "classifier" is the linguists' term; beginner textbooks (this one included) say "measure word".
  const textbook = srcs.find(s => /\bmeasure word\b/i.test(s) && s.length <= LIMITS.meaning)
  if (/\bclassifier\b/i.test(w.meaning) && textbook) return { action: 'use-source', suggestion: plain, reason: `“${textbook}” uses the term beginner textbooks use; “classifier” is the linguists' term for the same thing.${plain ? ` A plainer alternative: “${plain}”.` : ''} Keep the game's note and explanation.` }
  if (plain && srcs.some(s => GRAMMAR_TERM.test(s))) return { action: 'edit', suggestion: plain, reason: `Both labels use grammar terms (“${w.meaning}”, “${src}”). “${plain}” says what the word does, which helps a beginner. Keep the game's note and explanation.` }
  if (srcs.some(categoryOnly) && !categoryOnly(w.meaning)) return { action: 'keep-game', reason: `“${src}” only names a grammatical category; “${w.meaning}” tells the learner how to use the word.` }
  if (plain) return { action: 'edit', suggestion: plain, reason: `“${w.meaning}” is a grammar term; “${plain}” says what the word does.` }
  if (src.length > LIMITS.meaning && srcs.every(s => s.length > LIMITS.meaning)) return { action: 'keep-game', reason: `The source text is too long for an answer button (${LIMITS.meaning} characters).` }
  if (srcs.some(s => /,/.test(s)) && !/[,/]/.test(w.meaning)) return { action: 'keep-game', reason: 'The source lists several senses; the game label is focused on the one it teaches.' }
  if (GRAMMAR_TERM.test(w.meaning) && srcs.some(describesUse) && src.length <= LIMITS.meaning) return { action: 'use-source', reason: `“${src}” says how the word is used; “${w.meaning}” only names a category.` }
  return { action: 'keep-game', reason: 'No clear improvement. Keep the game text unless the source corrects an error or explains the meaning better.' }
}

function judgePronunciation(r: SourceRecord, w: Word, rel: ReadingRelation, neutralOnly: boolean): Recommendation['pronunciation'] {
  const src = r.candidate.readings.join(' / ') || '?'
  if (neutralOnly) return { relation: 'neutral-tone', reason: `${src} vs ${w.pinyin}: only the neutral tone differs (a regional or style difference, e.g. Taiwan Mandarin keeps full tones). Check a recording before using it for listening questions.` }
  switch (rel) {
    case 'main': return { relation: rel, reason: `Same reading (${w.pinyin}).` }
    case 'variant': return { relation: rel, reason: `The source gives ${src}, an accepted variant the game already lists.` }
    case 'speech': return { relation: rel, reason: `The source gives ${src}, the connected-speech form. The game teaches ${w.pinyin} and already explains ${src}. Not a meaning difference; a recording may be used for meaning questions, not pinyin questions, unless you hear ${w.pinyin}.` }
    case 'tone-differs': return { relation: rel, reason: `Other tones (${src} vs ${w.pinyin}). If the meaning is the same, it is a regional or alternative reading; a recording needs your check before any listening use.` }
    case 'different': return { relation: rel, reason: `Different syllables (${src} vs ${w.pinyin}).` }
    default: return { relation: rel, reason: 'The source gives no usable reading.' }
  }
}

export function recommend(r: SourceRecord, w: Word, words: Word[], opts: { distinctFrom?: string[] } = {}): Recommendation {
  const readings = [...r.candidate.readings, ...r.candidate.variants.flatMap(v => (v.reading ? [v.reading] : []))]
  const order: ReadingRelation[] = ['main', 'variant', 'speech', 'tone-differs', 'different', 'unknown']
  let rel: ReadingRelation = 'unknown'
  for (const x of readings) { const y = readingRelation(x, w); if (order.indexOf(y) < order.indexOf(rel)) rel = y }
  const neutralOnly = rel === 'tone-differs' && readings.some(x => [w.pinyin, ...w.variants].some(p => neutralToneOnly(x, p)))
  const meaning = judgeMeaning(r, w, words, rel, neutralOnly, !!opts.distinctFrom?.includes(w.id))
  const wording = meaning.verdict === 'different' ? { action: 'keep-game' as const, reason: 'Not the same meaning: nothing to adopt.' } : judgeWording(r, w)
  const pronunciation = judgePronunciation(r, w, rel, neutralOnly)
  const head = { same: 'Same meaning', check: 'Check the meaning', different: 'Different meaning' }[meaning.verdict]
  const tail = meaning.verdict === 'different' ? 'keep separate' : wording.action === 'keep-game' ? 'keep the game wording' : wording.action === 'edit' ? 'wording improvement suggested' : 'the source wording may be clearer'
  return { entry: w.id, meaning, wording, pronunciation, summary: `${head}; ${tail}.` }
}
