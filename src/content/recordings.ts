// Recorded audio selected for game entries (recordings.json) and the rules for what each recording may be used for. Pure.
// Text-to-speech policy is separate: an entry's `audio: "none"` only switches off TTS (see audioReliable in entries.ts).
// A selected recording is a specific file with its own reading information, so it can be used even when TTS is off.
import type { RecordingUse, RecordingsFile, SelectedRecording } from '../sources/types.ts'
import type { Word } from './types.ts'
import { soundKey } from './pinyin.ts'

/** How a reading relates to an entry's readings. */
export type ReadingRelation =
  | 'main'          // the entry's main pinyin
  | 'variant'       // an accepted pronunciation variant of the same word and meaning
  | 'speech'        // a connected-speech form (guidance only, never a pinyin answer)
  | 'tone-differs'  // same syllables, other tones: another reading or an error
  | 'different'     // other syllables
  | 'unknown'       // no reading given

const TONE_MARKS = /[̀́̄̌]/g
/** Syllables without tones (ü kept): "gè" and "ge" -> "ge". */
export const toneless = (pinyin: string) => soundKey(pinyin).normalize('NFD').replace(TONE_MARKS, '').normalize('NFC')

export function readingRelation(reading: string | undefined, word: Pick<Word, 'pinyin' | 'variants' | 'speech'>): ReadingRelation {
  if (!reading || !reading.trim()) return 'unknown'
  const k = soundKey(reading)
  if (k === soundKey(word.pinyin)) return 'main'
  if (word.variants.some(v => soundKey(v) === k)) return 'variant'
  if (word.speech.some(s => soundKey(s.pinyin) === k)) return 'speech'
  const t = toneless(reading)
  if ([word.pinyin, ...word.variants].some(p => toneless(p) === t)) return 'tone-differs'
  return 'different'
}

/** The reading a recording is assessed against: what a person verified, otherwise what the source declared. */
export const effectiveReading = (r: SelectedRecording) => r.reading.verified ?? r.reading.declared

/**
 * The uses a recording is actually eligible for, for this entry:
 *  - nothing if it is rejected, flagged for reassessment, not a word recording, or its reading is not compatible with the entry
 *  - display + listen (audio -> character) + listen2meaning when the reading is the main reading, a variant or a connected-speech form
 *  - listen2pinyin only when the reading is the main reading or an accepted variant: a learner is never tested on a pinyin answer
 *    the clip does not say (个: game "gè", clip declared "ge" -> no listen2pinyin)
 * Each use must ALSO have been explicitly allowed by a person (`uses`).
 */
export function eligibleUses(r: SelectedRecording, word: Pick<Word, 'id' | 'pinyin' | 'variants' | 'speech'>): Set<RecordingUse> {
  const out = new Set<RecordingUse>()
  if (r.entry !== word.id || r.validation === 'rejected' || r.reassess || r.scope !== 'word') return out
  const rel = readingRelation(effectiveReading(r), word)
  if (rel !== 'main' && rel !== 'variant' && rel !== 'speech') return out
  for (const u of r.uses) {
    if (u === 'listen2pinyin' && rel === 'speech') continue
    out.add(u)
  }
  // A listening use without display makes no sense to a player; listening implies the clip may be played.
  if (out.size > 0 && !out.has('display') && r.uses.includes('display')) out.add('display')
  return out
}

export type RecordingIndex = Map<string, SelectedRecording>

/** The recording each entry uses: the first non-rejected word recording listed for it (one per entry is the norm; order decides). */
export function indexRecordings(file: RecordingsFile | undefined): RecordingIndex {
  const out: RecordingIndex = new Map()
  for (const r of file?.recordings ?? []) if (r.scope === 'word' && r.validation !== 'rejected' && !out.has(r.entry)) out.set(r.entry, r)
  return out
}

/** The recording to play for this entry on speaker buttons, if any. */
export function playableRecording(word: Word, index: RecordingIndex): SelectedRecording | undefined {
  const r = index.get(word.id)
  return r && eligibleUses(r, word).has('display') ? r : undefined
}

/** May a listening question of this kind use this entry's recording? */
export function recordingAllows(word: Word, index: RecordingIndex, kind: string): boolean {
  const r = index.get(word.id)
  return !!r && eligibleUses(r, word).has(kind as RecordingUse)
}
