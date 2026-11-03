// Recorded audio selected for game entries (recordings.json) and the rules for what each recording may be used for. Pure.
// Text-to-speech policy is separate: an entry's `audio: "none"` only switches off TTS (see audioReliable in entries.ts).
// A selected recording is a specific file with its own reading information, so it can be used even when TTS is off.
import type { RecordingUse, RecordingsFile, SelectedRecording } from '../sources/types.ts'
import type { Word } from './types.ts'
import { soundKey } from './pinyin.ts'
import { audioReliable } from './entries.ts'

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
 *  - listen2pinyin only when the reading is the entry's MAIN reading: that question's answer is always `word.pinyin`, so a clip
 *    saying a variant or a connected-speech form would test an answer it does not say (谁: clip "shuí", answer "shéi";
 *    个: clip "ge", answer "gè"). soundKey() absorbs formatting only (case, spacing, ü/v); a tone difference is never absorbed.
 * Each use must ALSO have been explicitly allowed by a person (`uses`).
 */
export function eligibleUses(r: SelectedRecording, word: Pick<Word, 'id' | 'pinyin' | 'variants' | 'speech'>): Set<RecordingUse> {
  const out = new Set<RecordingUse>()
  if (r.entry !== word.id || r.validation === 'rejected' || r.reassess || r.scope !== 'word') return out
  const rel = readingRelation(effectiveReading(r), word)
  if (rel !== 'main' && rel !== 'variant' && rel !== 'speech') return out
  for (const u of r.uses) {
    if (u === 'listen2pinyin' && rel !== 'main') continue
    out.add(u)
  }
  // A listening use without display makes no sense to a player; listening implies the clip may be played.
  if (out.size > 0 && !out.has('display') && r.uses.includes('display')) out.add('display')
  return out
}

export type RecordingIndex = Map<string, SelectedRecording>

/**
 * The word recording SELECTED for each entry: the first non-rejected one listed for it (one per entry is the norm; order decides),
 * else a rejected one. A rejected clip is kept in the index on purpose: while any selection is attached to an entry, the entry
 * never falls back to text-to-speech (see selectedRecording). Removing the selection from recordings.json restores TTS.
 */
export function indexRecordings(file: RecordingsFile | undefined): RecordingIndex {
  const out: RecordingIndex = new Map()
  for (const r of file?.recordings ?? []) {
    if (r.scope !== 'word') continue
    const prev = out.get(r.entry)
    if (!prev || (prev.validation === 'rejected' && r.validation !== 'rejected')) out.set(r.entry, r)
  }
  return out
}

/**
 * The recording selected for this entry, whether or not it can be played now (rejected, flagged for reassessment, incompatible
 * reading, or failed). Selection, not playability, decides that the entry does not use text-to-speech.
 */
export const selectedRecording = (word: Pick<Word, 'id'>, index: RecordingIndex): SelectedRecording | undefined => index.get(word.id)

/** The recording to play for this entry on speaker buttons, if the selected one is eligible for display. */
export function playableRecording(word: Word, index: RecordingIndex): SelectedRecording | undefined {
  const r = selectedRecording(word, index)
  return r && eligibleUses(r, word).has('display') ? r : undefined
}

/** May a listening question of this kind use this entry's recording? */
export function recordingAllows(word: Word, index: RecordingIndex, kind: string): boolean {
  const r = selectedRecording(word, index)
  return !!r && eligibleUses(r, word).has(kind as RecordingUse)
}

/**
 * May a listening question of `kind` be asked about this entry right now?
 *  - muted: never
 *  - the entry has a selected recording (playable or not): only the uses its reading and a person allow, and only if it has not
 *    failed to play; never text-to-speech instead, even when the clip is ineligible (one voice and one reading per entry)
 *  - no recording: text-to-speech, when a Mandarin voice exists and TTS is reliable for the entry (audio "ok", no homograph)
 */
export function canHearEntry(w: Word, kind: string, all: Word[], index: RecordingIndex, o: { muted: boolean; ttsVoice: boolean; failed?: Set<string> }): boolean {
  if (o.muted) return false
  if (selectedRecording(w, index)) return !o.failed?.has(w.id) && recordingAllows(w, index, kind)
  return o.ttsVoice && audioReliable(w, all)
}
