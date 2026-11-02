// Which sound an entry uses. A selected, suitable recording (content/recordings.json) always wins over text-to-speech; an entry
// with a recording never falls back to TTS (so a player never hears two different voices or readings for one entry). Entries
// without a recording use TTS only when it is reliable (audio: "ok" and no other entry with the same hanzi).
import recordingsJson from './content/recordings.json' with { type: 'json' }
import { WORDS } from './data'
import { audioReliable } from './content/entries'
import { canHearEntry, indexRecordings, playableRecording } from './content/recordings'
import type { RecordingsFile, SelectedRecording } from './sources/types'
import type { Word } from './content/types'

export const RECORDINGS = indexRecordings(recordingsJson as unknown as RecordingsFile)

/** The recording to play for this entry, unless it failed to play earlier this session. */
export const wordRecording = (w: Word, failed?: Set<string>): SelectedRecording | undefined => (failed?.has(w.id) ? undefined : playableRecording(w, RECORDINGS))
/** Does the entry have a recording selected at all (even one that failed)? Then TTS is not used for it. */
export const hasSelectedRecording = (w: Word) => !!playableRecording(w, RECORDINGS)
/** Can a speaker button play this entry? */
export const hasWordAudio = (w: Word, failed?: Set<string>) => (hasSelectedRecording(w) ? !!wordRecording(w, failed) : audioReliable(w, WORDS))
export const recordingUrl = (r: SelectedRecording) => `${import.meta.env.BASE_URL}${r.file}`

/** May a listening question of `kind` be asked about this entry? See canHearEntry (content/recordings.ts). */
export const canHear = (w: Word, kind: string, o: { muted: boolean; ttsVoice: boolean; failed?: Set<string> }) => canHearEntry(w, kind, WORDS, RECORDINGS, o)
