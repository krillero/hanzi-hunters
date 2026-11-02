// Candidate matching between source records and game entries. Pure, no external services.
// The matcher only SUGGESTS: it explains its evidence and uncertainty, and never decides a mapping. Exact spelling alone is never
// enough for a strong suggestion; reading (with tones) and meaning must agree too.
import type { Word } from '../content/types.ts'
import { readingRelation, type ReadingRelation } from '../content/recordings.ts'
import type { SourceRecord } from './types.ts'

export type EvidenceLevel = 'match' | 'partial' | 'mismatch' | 'unknown'
export type Evidence = { aspect: 'spelling' | 'reading' | 'meaning' | 'kind'; level: EvidenceLevel; detail: string }
export type Confidence = 'strong' | 'probable' | 'weak' | 'conflict'
export type Suggestion = { entry: string; confidence: Confidence; score: number; reading: ReadingRelation; evidence: Evidence[]; warnings: string[] }

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'be', 'is', 'for', 'and', 'or', 'in', 'on', 'at', 'with', 'one', "one's", 'sb', 'sth', 'someone', 'something', 'etc', 'used', 'as', 'by', 'it', 'up', 'out'])
/** A few gloss words that dictionaries use interchangeably (kept small and explicit). */
const SYNONYM: Record<string, string> = { classifier: 'measure', mw: 'measure', cl: 'measure', father: 'dad', mother: 'mom', mum: 'mom' }
/** Lower-case content words of an English gloss ("to like / be fond of" -> like, fond). */
export function glossWords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z']+/)) {
    const w = raw.replace(/^'+|'+$/g, '')
    if (w.length < 2 || STOP.has(w)) continue
    const base = w.endsWith('s') && w.length > 3 && !w.endsWith('ss') ? w.slice(0, -1) : w
    out.add(SYNONYM[base] ?? base)
  }
  return out
}

export function meaningOverlap(a: string, b: string[]): { shared: string[]; level: EvidenceLevel } {
  const left = glossWords(a)
  const right = new Set<string>(); for (const m of b) for (const w of glossWords(m)) right.add(w)
  if (left.size === 0 || right.size === 0) return { shared: [], level: 'unknown' }
  const shared = [...left].filter(w => right.has(w))
  if (shared.length === 0) return { shared, level: 'mismatch' }
  return { shared, level: shared.length >= Math.min(left.size, right.size) ? 'match' : 'partial' }
}

/** Source parts of speech that correspond to the game's `kind`s (only where the correspondence is clear). */
const POS_PARTICLE = /^(ptc|particle|助詞|助词)$/i

/** All game entries a record could be about, best first. Records whose spelling matches no entry get no suggestion. */
export function suggest(record: SourceRecord, words: Word[]): Suggestion[] {
  const forms = new Set(record.candidate.simplified)
  for (const v of record.candidate.variants) if (v.form) forms.add(v.form)
  const main = record.candidate.simplified[0]
  const hits = words.filter(w => forms.has(w.hanzi))
  const out: Suggestion[] = []
  for (const w of hits) {
    const evidence: Evidence[] = []
    const warnings: string[] = []
    const exact = w.hanzi === main
    evidence.push({ aspect: 'spelling', level: exact ? 'match' : 'partial', detail: exact ? `same simplified spelling ${w.hanzi}` : `${w.hanzi} matches one of the source's other forms, not its main form ${main ?? '?'}` })

    // Reading: the best relation among the record's readings (and variant readings).
    const readings = [...record.candidate.readings, ...record.candidate.variants.flatMap(v => (v.reading ? [v.reading] : []))]
    const order: ReadingRelation[] = ['main', 'variant', 'speech', 'tone-differs', 'different', 'unknown']
    let rel: ReadingRelation = 'unknown', relReading = ''
    for (const r of readings) { const x = readingRelation(r, w); if (order.indexOf(x) < order.indexOf(rel)) { rel = x; relReading = r } }
    const rd = { main: 'match', variant: 'match', speech: 'partial', 'tone-differs': 'mismatch', different: 'mismatch', unknown: 'unknown' } as const
    const readingText: Record<ReadingRelation, string> = {
      main: `source reading ${relReading} = game pinyin ${w.pinyin}`,
      variant: `source reading ${relReading} is an accepted variant of ${w.pinyin}`,
      speech: `source reading ${relReading} is the game's connected-speech form, not its dictionary reading ${w.pinyin}`,
      'tone-differs': `source reading ${readings.join(' / ')} has other tones than game ${w.pinyin}: another reading, or a different word`,
      different: `source reading ${readings.join(' / ')} differs from game ${w.pinyin}`,
      unknown: 'the source gives no usable reading'
    }
    evidence.push({ aspect: 'reading', level: rd[rel], detail: readingText[rel] })
    if (rel === 'speech') warnings.push('A recording from this record must not be used for pinyin listening questions unless a person verifies it says the dictionary reading.')

    const m = meaningOverlap(w.meaning, record.candidate.meanings)
    evidence.push({ aspect: 'meaning', level: m.level, detail: m.level === 'unknown' ? 'no meaning to compare' : m.shared.length ? `shared meaning words: ${m.shared.join(', ')}` : `no shared meaning words ("${w.meaning}" vs "${record.candidate.meanings.join('; ')}")` })

    const pos = record.candidate.pos
    if (pos.length > 0) {
      const srcParticle = pos.some(p => POS_PARTICLE.test(p))
      if (srcParticle !== (w.kind === 'particle')) evidence.push({ aspect: 'kind', level: 'partial', detail: `source part of speech ${pos.join('/')} vs game kind ${w.kind}` })
      else if (srcParticle) evidence.push({ aspect: 'kind', level: 'match', detail: 'both are particles' })
    }

    const sameSpelling = words.filter(x => x.hanzi === w.hanzi)
    if (sameSpelling.length > 1) warnings.push(`The game has ${sameSpelling.length} entries written ${w.hanzi} (${sameSpelling.map(x => `${x.id}: ${x.pinyin} ${x.meaning}`).join('; ')}). Check which meaning the source means.`)
    if (record.candidate.flags.length) warnings.push(`Source flags: ${record.candidate.flags.join(', ')}`)

    // Confidence from the combination; spelling alone never reaches "probable".
    let confidence: Confidence
    const readOk = rel === 'main' || rel === 'variant'
    if (rel === 'different' || rel === 'tone-differs') confidence = 'conflict'
    else if (readOk && exact && (m.level === 'match' || m.level === 'partial')) confidence = 'strong'
    else if ((readOk || rel === 'speech') && m.level !== 'mismatch') confidence = 'probable'
    else confidence = 'weak'
    if (m.level === 'mismatch') warnings.push('Meanings do not overlap: this may be a different meaning written with the same characters.')
    if (confidence === 'strong' && sameSpelling.length > 1) confidence = 'probable'
    const score = { strong: 3, probable: 2, weak: 1, conflict: 0 }[confidence] + (exact ? 0.5 : 0) + (m.shared.length * 0.1)
    out.push({ entry: w.id, confidence, score, reading: rel, evidence, warnings })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** A suggestion list is "conflicting" when the best one conflicts, or several are equally good. */
export function isConflicting(s: Suggestion[]): boolean {
  if (s.length === 0) return false
  if (s[0].confidence === 'conflict' || s[0].confidence === 'weak') return true
  return s.length > 1 && s[1].confidence === s[0].confidence
}
