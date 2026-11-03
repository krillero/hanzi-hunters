import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { canHearEntry, eligibleUses, indexRecordings, playableRecording, readingRelation, selectedRecording } from '../src/content/recordings.ts'
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

test('谁: a clip saying the variant shuí never enables a pinyin question whose answer is shéi', () => {
  const shei = word('谁')
  assert.equal(shei.pinyin, 'shéi'); assert.ok(shei.variants.includes('shuí'))
  const shui = eligibleUses(rec('谁', 'shuí'), shei)
  assert.ok(shui.has('display') && shui.has('listen') && shui.has('listen2meaning'), 'a variant may still be played and used for character and meaning')
  assert.ok(!shui.has('listen2pinyin'))
  // The same holds when a person verified the variant reading: verification does not change which answer the question expects.
  assert.ok(!eligibleUses(rec('谁', 'shéi', { reading: { declared: 'shéi', verified: 'shuí', verifiedBy: 'tester' }, validation: 'verified' }), shei).has('listen2pinyin'))
  // 谁's own `questions` list leaves out listen2pinyin; lifted here to test the recording rule alone.
  const open = { ...shei, questions: undefined }
  const all = WORDS.map(w => (w.id === '谁' ? open : w))
  const opts = (r: SelectedRecording) => ({ known: new Set(['谁']), audioFor: (w: typeof WORDS[number], k: QKind) => canHearEntry(w, k, all, indexRecordings({ schemaVersion: 1, recordings: [r] }), { muted: false, ttsVoice: true }) })
  assert.equal(isFeasible('listen2pinyin', open, all, opts(rec('谁', 'shuí'))), false, 'no TTS fallback either')
  assert.equal(isFeasible('listen2pinyin', open, all, opts(rec('谁', 'shéi'))), true, 'a main-reading clip enables it when otherwise permitted')
})

test('listen2pinyin: main reading only; formatting differences are harmless, tone differences are not', () => {
  const w = word('人')
  assert.ok(eligibleUses(rec('人', 'rén'), w).has('listen2pinyin'))
  assert.ok(eligibleUses(rec('人', ' Rén '), w).has('listen2pinyin'), 'case and spacing are formatting')
  assert.ok(!eligibleUses(rec('人', 'rén', { uses: ['display', 'listen'] }), w).has('listen2pinyin'), 'still needs a person\'s explicit permission')
  assert.equal(eligibleUses(rec('人', 'rèn'), w).size, 0, 'another tone is another reading')
  assert.ok(!eligibleUses(rec('个', 'ge'), word('个')).has('listen2pinyin'), '个: connected-speech ge is not the gè answer')
})

test('a selected recording that cannot be used never lets text-to-speech take over', () => {
  const w = word('人')
  const tts = { muted: false, ttsVoice: true }
  const none = indexRecordings(undefined)
  assert.equal(canHearEntry(w, 'listen', WORDS, none, tts), true, 'no selection: ordinary TTS behaviour')
  assert.equal(canHearEntry(w, 'listen', WORDS, none, { muted: true, ttsVoice: true }), false, 'muted: never')
  for (const [why, r] of [
    ['outdated (flagged for reassessment)', rec('人', 'rén', { reassess: 'source record changed' })],
    ['incompatible reading', rec('人', 'rèn')],
    ['rejected', rec('人', 'rén', { validation: 'rejected' })],
    ['no reading', rec('人', '')]
  ] as [string, SelectedRecording][]) {
    const idx = indexRecordings({ schemaVersion: 1, recordings: [r] })
    assert.ok(selectedRecording(w, idx), `${why}: still selected`)
    assert.equal(playableRecording(w, idx), undefined, `${why}: not playable`)
    for (const k of ['listen', 'listen2meaning', 'listen2pinyin']) assert.equal(canHearEntry(w, k, WORDS, idx, tts), false, `${why}: ${k} not asked, and not via TTS`)
    assert.ok(WORDS.filter(x => x.id === '人').every(x => !isFeasible('listen', x, WORDS, { known, audioFor: hear(idx) })))
  }
  // Playback failure: the clip stays selected, so TTS does not take its place.
  const ok = indexRecordings({ schemaVersion: 1, recordings: [rec('人', 'rén')] })
  assert.equal(canHearEntry(w, 'listen', WORDS, ok, { ...tts, failed: new Set(['人']) }), false)
  // A rejected clip listed after a usable one does not displace it; one listed alone still blocks TTS.
  const both = indexRecordings({ schemaVersion: 1, recordings: [rec('人', 'rén', { id: 'a', validation: 'rejected' }), rec('人', 'rén', { id: 'b' })] })
  assert.equal(selectedRecording(w, both)?.id, 'b')
  // Muted: a playable recording is not heard either.
  assert.equal(canHearEntry(w, 'listen', WORDS, ok, { muted: true, ttsVoice: true }), false)
})
