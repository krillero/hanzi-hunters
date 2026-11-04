// Glue between a submitted answer and the saved scheduling state: one pure entry point per learning event. No DOM, no clock
// (callers pass `now`). Used by App.tsx and tools/simulate.ts so both follow the same rules. See docs/SCHEDULING.md.
import { splitSyllables } from '../content/pinyin.ts'
import type { QKind, Question } from './questions.ts'
import { INITIAL_SUCCESS_TARGET, MAX_LV, formatWait, introduce, recordAnswer, recordReveal, type Outcome } from './schedule.ts'
import { LEVEL_NAMES } from './mastery.ts'
import type { Mastery, Saved } from './types.ts'

/**
 * Question kinds whose correct answers can move the scheduler: those that reinforce the written character, either because it is
 * shown (character→meaning, character→pinyin) or because it is the answer (meaning/pinyin/homophone/look-alike/audio→character).
 * Meaning→pinyin and the other audio questions never involve the character, so they are recorded as evidence only. This is
 * chosen per kind: character→pinyin counts and meaning→pinyin does not.
 */
const PROMOTING_KINDS: readonly QKind[] = ['intro', 'meaning', 'pinyin', 'character', 'listen', 'pinyin2char', 'homophone', 'lookalike']
export const promotesProgress = (kind: QKind): boolean => PROMOTING_KINDS.includes(kind)

/** Was the answer shown on the question card before the player chose? (The intro question shows everything.) */
export const answerRevealed = (q: Question) => q.kind === 'intro' || (q.ask !== 'particle' && q.show[q.ask])

/** For pinyin answers: were the tones right? Undefined when the choice is a different syllable (nothing to say about tones). */
export function toneCorrect(answer: string, chosen: string): boolean | undefined {
  const a = splitSyllables(answer), c = splitSyllables(chosen)
  if (!a || !c || a.length !== c.length || a.some((s, i) => s.base !== c[i].base)) return undefined
  return a.every((s, i) => s.tone === c[i].tone)
}

export type Learned = { save: Saved; outcome: Outcome; before: number; after: number }

/** Reading a new-word card: creates the entry at level 0 with no credit. Already-known entries only record that the answer was shown. */
export function applyIntroduce(s: Saved, id: string, now: number): Saved {
  const e = s.mastery[id]
  return { ...s, mastery: { ...s.mastery, [id]: e ? recordReveal(e, now) : introduce(now, s.answerSeq) } }
}

/** An exposure that displayed the answer (details, wordbook). Never changes level or due dates. */
export function applyReveal(s: Saved, ids: string[], now: number): Saved {
  let m: Mastery | null = null
  for (const id of ids) {
    const e = s.mastery[id]; if (!e) continue
    const r = recordReveal(e, now)
    if (r !== e) { m = m ?? { ...s.mastery }; m[id] = r }
  }
  return m ? { ...s, mastery: m } : s
}

export type Submission = { id: string; kind: QKind; correct: boolean; assisted: boolean; now: number; chosen?: string; answer?: string }

/** One submitted answer: bumps the global answer number and records the evidence. Pass `seq` (the number this answer got) to make a replay a no-op. */
export function applyAnswer(s: Saved, a: Submission, seq = s.answerSeq + 1): Learned {
  const existing = s.mastery[a.id]
  const before = existing?.lv ?? -1
  const entry = existing ?? introduce(a.now, seq - 1)   // asked without an introduction: created now; the intro question shows the answer, so it is assisted
  const isPinyinAnswer = a.kind === 'pinyin' || a.kind === 'meaning2pinyin'   // the pinyin the player picked has a tone to check
  const toneOk = isPinyinAnswer && a.chosen !== undefined && a.answer !== undefined ? toneCorrect(a.answer, a.chosen) : undefined
  const r = recordAnswer(entry, { correct: a.correct, assisted: a.assisted || !existing, kind: a.kind, promotes: promotesProgress(a.kind), now: a.now, seq, toneOk })
  if (r.outcome === 'ignored') return { save: s, outcome: 'ignored', before, after: entry.lv }
  return { save: { ...s, answerSeq: Math.max(s.answerSeq, seq), mastery: { ...s.mastery, [a.id]: r.entry } }, outcome: r.outcome, before, after: r.entry.lv }
}

/** The short line shown after an answer: what the answer did to the word, in plain words. `now` and `e` are the state AFTER the answer. */
export function learningNote(outcome: Outcome, e: { lv: number; ok: number; due: number | null }, before: number, correct: boolean, now: number): string {
  const wait = e.due === null ? '' : formatWait(e.due - now)
  const next = wait && wait !== 'now' ? ` · next check ${wait}` : ''
  if (before < 0) return 'New word — added to your wordbook'
  switch (outcome) {
    case 'lapse': return "Let's practice this again."
    case 'spaced': return `${e.ok}/${INITIAL_SUCCESS_TARGET} spaced practices`
    case 'familiar': return `Level up! Now ${LEVEL_NAMES[e.lv]}${next}`
    case 'advanced': return e.lv >= MAX_LV ? `Mastered!${next ? ` Maintenance check ${wait}` : ''}` : `Level up! Now ${LEVEL_NAMES[e.lv]}${next}`
    case 'rechecked': return `Recovered — now ${LEVEL_NAMES[e.lv]}${next}`
    case 'maintained': return `Mastered — next maintenance ${wait}`
    case 'relearned': return e.due === null ? 'Good — spaced practice continues.' : `Good — practice recorded${next}`
    case 'assisted': return 'Correct with help — practice recorded.'
    case 'recorded': return correct ? 'Practice recorded.' : "Let's practice this again."
    case 'practice': return e.ok < INITIAL_SUCCESS_TARGET ? 'Practice — next memory check later.' : e.lv >= MAX_LV ? `Mastered — next maintenance ${wait}` : `Practice${next}`
    default: return ''
  }
}
