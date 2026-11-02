import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { canHearEntry, eligibleUses, indexRecordings, playableRecording, readingRelation } from '../src/content/recordings.ts'
import { isFeasible, type QKind } from '../src/game/questions.ts'
import type { SelectedRecording } from '../src/sources/types.ts'
import recordingsJson from '../src/content/recordings.json' with { type: 'json' }

const word = (id: string) => WORDS.find(w => w.id === id)!
const rec = (entry: string, declared: string, extra: Partial<SelectedRecording> = {}): SelectedRecording => ({
  id: `accc-anki:recording:${entry}`, entry, scope: 'word', file: 'sources/accc-anki/media/0123456789abcdef.mp3', sha256: '0'.repeat(64), text: word(entry).hanzi,
  provenance: { source: 'accc-anki', record: `accc-anki:${entry}`, recordHash: '0123456789abcdef', mode: 'verbatim' },
  reading: { declared }, validation: 'unverified', uses: ['display', 'listen', 'listen2meaning', 'listen2pinyin'],
  decision: { by: 'tester', on: '2026-11-02', how: 'person' }, ...extra
})
const known = new Set(WORDS.map(w => w.id))
const hear = (index: ReturnType<typeof indexRecordings>, o = { muted: false, ttsVoice: true }) => (w: typeof WORDS[number], k: QKind) => canHearEntry(w, k, WORDS, index, o)

test('the shipped recordings file is valid and starts empty of unreviewed selections', () => {
  assert.equal((recordingsJson as { schemaVersion: number }).schemaVersion, 1)
})

test('个: a clip declared "ge" (connected speech) may be played and used for meaning, never for a pinyin question', () => {
  const ge = word('个')
  assert.equal(ge.pinyin, 'gè'); assert.ok(ge.speech.some(s => s.pinyin === 'ge'))
  assert.equal(readingRelation('ge', ge), 'speech')
  const uses = eligibleUses(rec('个', 'ge'), ge)
  assert.ok(uses.has('display') && uses.has('listen2meaning'))
  assert.ok(!uses.has('listen2pinyin'), 'the learner is never tested on gè with a clip that says ge')
  // A person who listened and confirmed the dictionary reading unlocks the pinyin question.
  const verified = eligibleUses(rec('个', 'ge', { reading: { declared: 'ge', verified: 'gè', verifiedBy: 'tester' }, validation: 'verified' }), ge)
  assert.ok(verified.has('listen2pinyin'))
})

test('recordings: uses must be allowed by a person, and rejected / changed / incompatible clips are never used', () => {
  const w = word('人')
  assert.deepEqual([...eligibleUses(rec('人', 'rén', { uses: ['display'] }), w)], ['display'])
  assert.equal(eligibleUses(rec('人', 'rén', { validation: 'rejected' }), w).size, 0)
  assert.equal(eligibleUses(rec('人', 'rén', { reassess: 'source record changed' }), w).size, 0)
  assert.equal(eligibleUses(rec('人', 'rèn'), w).size, 0, 'another tone: not this entry\'s reading')
  assert.equal(eligibleUses(rec('人', 'rén', { scope: 'sentence' }), w).size, 0, 'sentence recordings are not word recordings')
  assert.equal(readingRelation('shuí', word('谁')), 'variant')
})

test('recorded audio overrides the TTS block of audio:"none" but only for the uses it is eligible for', () => {
  const ge = word('个')
  // 个's own `questions` list excludes listening kinds (and still would, recording or not); lifted here to test TTS policy alone.
  const none = { ...ge, audio: 'none' as const, questions: undefined }
  const all = WORDS.map(w => (w.id === '个' ? none : w))
  // Only 个 is known, so no known sound-alike blocks the sound-only question (that rule is tested in questions.test.ts).
  const opts = (index: ReturnType<typeof indexRecordings>, o = { muted: false, ttsVoice: true }) => ({ known: new Set(['个']), audioFor: (w: typeof WORDS[number], k: QKind) => canHearEntry(w, k, all, index, o) })
  const empty = indexRecordings(undefined)
  assert.equal(isFeasible('listen2meaning', none, all, opts(empty)), false, 'TTS disabled and no recording: no listening question')
  const idx = indexRecordings({ schemaVersion: 1, recordings: [rec('个', 'ge')] })
  assert.equal(isFeasible('listen2meaning', none, all, opts(idx)), true, 'a suitable recording is preferred over (disabled) TTS')
  assert.equal(isFeasible('listen2pinyin', none, all, opts(idx)), false)
  assert.equal(isFeasible('listen2meaning', none, all, opts(idx, { muted: true, ttsVoice: true })), false, 'muted: never')
})

test('missing or failed audio never produces a listening question, and a recording is never replaced by TTS', () => {
  const w = word('人')
  const idx = indexRecordings({ schemaVersion: 1, recordings: [rec('人', 'rén', { uses: ['display'] })] })
  assert.equal(canHearEntry(w, 'listen2meaning', WORDS, idx, { muted: false, ttsVoice: true }), false, 'display-only recording: no listening questions, even with a TTS voice')
  assert.ok(playableRecording(w, idx))
  const full = indexRecordings({ schemaVersion: 1, recordings: [rec('人', 'rén')] })
  assert.equal(canHearEntry(w, 'listen', WORDS, full, { muted: false, ttsVoice: false }), true, 'a recording needs no TTS voice')
  assert.equal(canHearEntry(w, 'listen', WORDS, full, { muted: false, ttsVoice: true, failed: new Set(['人']) }), false, 'failed to play: not asked')
  // No recording and no voice: none of the listening kinds is feasible for any entry.
  const none = indexRecordings(undefined)
  for (const k of ['listen', 'listen2meaning', 'listen2pinyin'] as QKind[]) assert.ok(WORDS.every(x => !isFeasible(k, x, WORDS, { known, audioFor: hear(none, { muted: false, ttsVoice: false }) })))
})
