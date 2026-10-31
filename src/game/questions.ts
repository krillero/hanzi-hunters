// Question generation + the scheduler that picks which kind of question a word gets.
// Pure (no DOM). Every option set has exactly one correct answer; see tests/questions.test.ts.
//
// Identity: entries are identified by `id` (the hanzi unless the entry declares another id), never by hanzi alone, because the same
// characters can be two entries (看 kàn "look" / 看 kān "guard"). Option TEXT is what the learner taps, so distractor selection
// guarantees that no wrong option can be a valid answer: not an accepted pronunciation variant, not a reading of another meaning that
// the question does not rule out, not a word with an overlapping meaning, and not a word that sounds the same when the question
// is decided by sound alone.
import type { Word } from '../data.ts'
import type { ClozeItem } from '../content/types.ts'
import { audioReliable, homographsOf, soundsOf } from '../content/entries.ts'
import { soundKey, splitSyllables, toneVariants } from '../content/pinyin.ts'
import type { MasteryEntry } from './types.ts'

export { toneVariants }

export type QKind =
  | 'intro'          // first exposure: everything shown, pick the meaning
  | 'meaning'        // character -> meaning
  | 'pinyin'         // character -> pinyin
  | 'character'      // meaning   -> character
  | 'listen'         // audio     -> character
  | 'meaning2pinyin' // meaning   -> pinyin
  | 'pinyin2char'    // pinyin    -> character
  | 'listen2meaning' // audio     -> meaning
  | 'listen2pinyin'  // audio     -> pinyin
  | 'homophone'      // pinyin + meaning -> character, among words that sound the same
  | 'lookalike'      // meaning   -> character, among characters that look alike
  | 'particle'       // authored sentence with a blank -> the particle that fits (grammar in context)
  
export const QUESTION_KINDS: QKind[] = ['intro', 'meaning', 'pinyin', 'character', 'listen', 'meaning2pinyin', 'pinyin2char', 'listen2meaning', 'listen2pinyin', 'homophone', 'lookalike', 'particle']

export type Question = {
  kind: QKind
  text: string
  options: string[]
  answer: string
  optionsAreHanzi: boolean
  /** What is being asked for: decides which field of the word card stays hidden until the player answers. */
  ask: 'meaning' | 'pinyin' | 'hanzi' | 'particle'
  /** True when the word is played aloud instead of (or as well as) being shown. */
  audio: boolean
  /** What the word card may show before the player answers (everything is revealed afterwards). */
  show: { hanzi: boolean; pinyin: boolean; meaning: boolean }
  /** Particle (cloze) questions: the authored sentence. The card shows it instead of the word. */
  cloze?: { itemId: string; zh: string; pinyin: string; en: string; why: Record<string, string>; note?: string }
}

export type KindResult = { kind: QKind; ok: boolean }

export type QuestionOptions = {
  canListen?: boolean
  rng?: () => number
  /** Force a kind (tests, previews). Falls back to a feasible kind when it cannot be built for this word. */
  kind?: QKind
  /** Entry ids the learner has met. Wrong answers and homophone / look-alike partners are drawn from these. */
  known?: Set<string>
  /** Authored fill-in-the-blank items (cloze.json). Without them, particle questions are not possible. */
  cloze?: ClozeItem[]
  /** Recent results this session, used to avoid repeats and to favour weaker kinds. */
  history?: KindResult[]
}

// ------------------------------------------------------------------------------------------
// Shuffling, helpers

export function shuffle<T>(items: T[], rng: () => number = Math.random) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

// ---- meaning overlap -------------------------------------------------------------------------
const STOP = new Set(['to', 'a', 'an', 'the', 'be', 'of', 'is', 'are'])
const glosses = (meaning: string) => meaning.split('/').map(t => t.trim()).filter(Boolean)
const contentWords = (gloss: string) => gloss.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w))
/** Two entries overlap in meaning when they share a gloss, or (for ordinary words) a content word: "sun / day" vs "sky / day",
 *  "look / watch" vs "look after". Particles are described by function, so for them only an identical description counts. */
const overlaps = (a: Word, b: Word) => glosses(a.meaning).some(ga => glosses(b.meaning).some(gb => {
  if (ga.toLowerCase() === gb.toLowerCase()) return true
  if (a.kind === 'particle' || b.kind === 'particle') return false
  const A = contentWords(ga), B = contentWords(gb)
  return A.some(w => B.includes(w))
}))
export const meaningsOverlap = overlaps
/** Too close to be a fair wrong answer: overlapping meaning, declared confusable, or the same hanzi (another reading of the written form). */
const tooClose = (a: Word, b: Word) => a.id === b.id || a.hanzi === b.hanzi || overlaps(a, b) || !!a.confusable?.includes(b.id) || !!b.confusable?.includes(a.id)

// ---- sound ----------------------------------------------------------------------------------
/** Dictionary pinyin and accepted variants (what counts as "the same word, said another way"). */
const dictSounds = (w: Word) => soundsOf(w)
/** Everything this entry may sound like in practice, including connected-speech forms (不 -> bú). Used when sound alone decides the answer. */
const anySounds = (w: Word) => { const s = soundsOf(w); for (const x of w.speech) s.add(soundKey(x.pinyin)); return s }
const intersects = (a: Set<string>, b: Set<string>) => [...a].some(x => b.has(x))

/** Other words that sound the same as `word` (same syllables and tones, e.g. 木 / 目 mù; or a shared accepted variant). */
export const homophonesOf = (word: Word, words: Word[]) => words.filter(w => w.id !== word.id && intersects(dictSounds(w), dictSounds(word)))
/** Other words that could be MISTAKEN for `word` by ear: same sound, including connected-speech forms. */
export const soundAlikesOf = (word: Word, words: Word[]) => words.filter(w => w.id !== word.id && intersects(anySounds(w), anySounds(word)))

/** Words that look similar to `word` (the relation is symmetric even if the data lists it once). */
export const lookalikesOf = (word: Word, words: Word[]) =>
  words.filter(w => w.id !== word.id && w.hanzi !== word.hanzi && (word.lookalike?.includes(w.id) || w.lookalike?.includes(word.id)))

const isKnown = (known: Set<string> | undefined, w: Word) => !known || known.has(w.id)

/** Homophone partners a *fair* question can use: known to the learner and not too close in meaning. */
export const usableHomophones = (word: Word, all: Word[], known?: Set<string>) =>
  homophonesOf(word, all).filter(w => isKnown(known, w) && !tooClose(w, word))
export const usableLookalikes = (word: Word, all: Word[], known?: Set<string>) =>
  lookalikesOf(word, all).filter(w => isKnown(known, w) && !tooClose(w, word))

/** Candidate wrong answers: words the learner has met (padded with the earliest words while the list is tiny). */
function poolFor(word: Word, all: Word[], known?: Set<string>) {
  if (!known) return all
  const pool = all.filter(w => known.has(w.id) || w.id === word.id)
  for (const w of all) { if (pool.length >= 9) break; if (!pool.includes(w)) pool.push(w) }
  return pool
}

/** How confusable the wrong answers are: easy = clearly different words, normal = mixed, hard = same family first. */
export type Difficulty = 'easy' | 'normal' | 'hard'
export const difficultyFor = (lv: number): Difficulty => (lv <= 0 ? 'easy' : lv === 1 ? 'normal' : 'hard')

/** Up to n fair wrong answers: not too close in meaning; ordered by difficulty; extra filter per question kind. */
function distractors(word: Word, pool: Word[], all: Word[], rng: () => number, n: number, ok: (w: Word) => boolean = () => true, difficulty: Difficulty = 'hard', sameLength = false, text: (w: Word) => string = w => w.hanzi) {
  const fair = (w: Word) => !tooClose(w, word) && ok(w)
  const look = new Set(lookalikesOf(word, all).map(w => w.id))
  const len = (w: Word) => [...w.hanzi].length
  const ranked = (list: Word[]) => {
    let s = shuffle(list.filter(fair), rng)
    // Written answers: wrong options of the same length first, so a 2-character word is not found just by being the odd one out
    if (sameLength) s = [...s.filter(w => len(w) === len(word)), ...s.filter(w => len(w) !== len(word))]
    const same = s.filter(w => w.group === word.group), other = s.filter(w => w.group !== word.group)
    const keepLen = (arr: Word[]) => (sameLength ? [...arr.filter(w => len(w) === len(word)), ...arr.filter(w => len(w) !== len(word))] : arr)
    if (difficulty === 'hard') return keepLen([...same, ...other])
    if (difficulty === 'normal') return s
    // easy: other families first, and look-alike entries last
    return keepLen([...other.filter(w => !look.has(w.id)), ...same.filter(w => !look.has(w.id)), ...s.filter(w => look.has(w.id))])
  }
  // Two wrong options must never read the same (e.g. 看 kàn and 看 kān are both written 看), and neither may read like the answer
  const seen = new Set([text(word)])
  const out: Word[] = []
  for (const w of [...ranked(pool), ...ranked(all)]) { if (out.length >= n) break; if (!out.includes(w) && !seen.has(text(w))) { seen.add(text(w)); out.push(w) } }
  return out
}

const uniqueHanzi = (list: Word[]) => list.filter((w, i) => list.findIndex(x => x.hanzi === w.hanzi) === i)

// ---- pronunciation options ---------------------------------------------------------------------
/**
 * Safe WRONG pinyin for `word`, best first. Never contains anything that is a valid way to say this word with this meaning:
 * its dictionary reading, accepted variants (谁 shéi / shuí) or connected-speech forms (不 bú).
 * A reading of the same hanzi for ANOTHER meaning (看 kān) is only offered when the question shows the intended meaning
 * (`meaningShown`), where it is a legitimate wrong answer; in audio-only questions it is never offered.
 * Tones are changed only for one-syllable entries with a lexical tone; multi-syllable and neutral-tone readings are NEVER
 * produced by editing marks, so the options are either authored (`wrongPinyin`) or real readings of other entries.
 */
export function wrongPinyinFor(word: Word, all: Word[], rng: () => number, meaningShown: boolean): string[] {
  const seen = new Set<string>([...dictSounds(word), ...word.speech.map(s => soundKey(s.pinyin))])
  const sibs = homographsOf(word, all)
  if (!meaningShown) for (const s of sibs) for (const k of anySounds(s)) seen.add(k)
  const out: string[] = []
  const add = (p: string) => { const k = soundKey(p); if (!seen.has(k)) { seen.add(k); out.push(p) } }
  word.wrongPinyin.forEach(add)
  if (meaningShown) sibs.forEach(sb => add(sb.pinyin))
  toneVariants(word.pinyin).forEach(add)
  const n = splitSyllables(word.pinyin)?.length ?? 0
  for (const w of shuffle(all.filter(x => x.id !== word.id && x.kind !== 'particle'), rng)) if ((splitSyllables(w.pinyin)?.length ?? 0) === n) add(w.pinyin)
  return out
}

/** One right pinyin and three safe wrong ones, or null when there are not enough safe wrong options. */
function pinyinOptions(word: Word, all: Word[], rng: () => number, meaningShown: boolean): string[] | null {
  const wrong = wrongPinyinFor(word, all, rng, meaningShown)
  return wrong.length < 3 ? null : shuffle([word.pinyin, ...wrong.slice(0, 3)], rng)
}

// ------------------------------------------------------------------------------------------
// Which kinds are allowed / how likely, per mastery level

/** Answer is decided by sound alone, so it is ambiguous when the learner knows a word that sounds the same. */
const SOUND_ONLY: QKind[] = ['listen', 'pinyin2char', 'listen2meaning']
const AUDIO: QKind[] = ['listen', 'listen2meaning', 'listen2pinyin']

/** Relative frequency of each kind. Early: recognise. Developing: all directions. Higher: mixed recall + discrimination. */
/** A word that was just introduced (or dropped back to level 0) gets its easiest question first: the character and pinyin are on screen. */
export const FIRST_STEP: Partial<Record<QKind, number>> = { meaning: 1 }

/** Particles are asked what they do (meaning) and, mostly, in an authored sentence. */
export const PARTICLE_WEIGHTS: Partial<Record<QKind, number>> = { particle: 3, meaning: 1 }

export const KIND_WEIGHTS: Record<number, Partial<Record<QKind, number>>> = {
  0: { meaning: 4, listen: 2, character: 2 },
  1: { pinyin: 3, pinyin2char: 2, character: 2, listen2meaning: 2, homophone: 2, lookalike: 2 },
  2: { meaning: 2, meaning2pinyin: 2, listen2pinyin: 2, pinyin2char: 2, lookalike: 2, homophone: 2, character: 1, listen2meaning: 1, listen: 1 },
  3: { character: 2, listen: 2, pinyin2char: 2, listen2pinyin: 2, listen2meaning: 2, meaning2pinyin: 2, lookalike: 3, homophone: 3, pinyin: 1, meaning: 1 },
  4: { character: 2, listen: 2, pinyin2char: 2, listen2pinyin: 2, listen2meaning: 2, meaning2pinyin: 2, lookalike: 3, homophone: 3, pinyin: 1, meaning: 1 }
}

/** Authored fill-in-the-blank items whose correct answer is this particle. */
const clozeFor = (word: Word, opts: Pick<QuestionOptions, 'cloze'>) => (opts.cloze ?? []).filter(c => c.answer === word.id)

/** A kind the entry's own `questions` list does not allow is never asked (the first exposure, `intro`, is always allowed). */
export const kindAllowed = (kind: QKind, word: Word) => kind === 'intro' || !word.questions || word.questions.includes(kind)

/** Can this kind be asked fairly for this word right now? */
export function isFeasible(kind: QKind, word: Word, all: Word[], opts: Pick<QuestionOptions, 'canListen' | 'known' | 'cloze'> = {}): boolean {
  if (kind === 'intro') return true
  if (!kindAllowed(kind, word)) return false
  if (kind === 'particle') return word.kind === 'particle' && clozeFor(word, opts).length > 0
  if (word.kind === 'particle' && kind !== 'meaning') return false
  // Audio is only used when it is reliable for this entry; sound-only questions also need that no known word sounds the same.
  if (AUDIO.includes(kind) && (!opts.canListen || !audioReliable(word, all))) return false
  if (SOUND_ONLY.includes(kind) && soundAlikesOf(word, all).some(w => isKnown(opts.known, w))) return false
  if (kind === 'homophone') return usableHomophones(word, all, opts.known).length > 0
  if (kind === 'lookalike') return usableLookalikes(word, all, opts.known).length > 0
  if (kind === 'pinyin' || kind === 'meaning2pinyin') return wrongPinyinFor(word, all, () => 0.5, true).length >= 3
  if (kind === 'listen2pinyin') return wrongPinyinFor(word, all, () => 0.5, false).length >= 3
  return true
}

/** The kind to fall back to when the wanted one is not possible: `meaning` if allowed, else the first allowed feasible kind. */
export function fallbackKind(word: Word, all: Word[], opts: Pick<QuestionOptions, 'canListen' | 'known' | 'cloze'> = {}): QKind {
  const order: QKind[] = ['meaning', 'particle', 'character', 'pinyin2char', 'pinyin', 'meaning2pinyin']
  return order.find(k => kindAllowed(k, word) && isFeasible(k, word, all, opts)) ?? 'meaning'
}

/** Weighted pick of the next kind: level table x feasibility x (not the same as last time) x (weaker kinds more often). */
export function chooseKind(word: Word, entry: MasteryEntry | undefined, all: Word[], opts: QuestionOptions = {}): QKind {
  if (!entry) return 'intro'
  const rng = opts.rng ?? Math.random
  const table = word.kind === 'particle' ? PARTICLE_WEIGHTS : entry.lv === 0 && entry.ok === 0 ? FIRST_STEP : KIND_WEIGHTS[Math.min(entry.lv, 4)]
  const history = opts.history ?? []
  const recent = history.slice(-2).map(h => h.kind)
  const weights: [QKind, number][] = []
  for (const [k, base] of Object.entries(table) as [QKind, number][]) {
    if (!isFeasible(k, word, all, opts)) continue
    const mine = history.filter(h => h.kind === k)
    const missRate = mine.length >= 2 ? mine.filter(h => !h.ok).length / mine.length : 0
    let w = base * (1 + 2 * missRate)
    if (recent[recent.length - 1] === k) w *= 0.15
    else if (recent.includes(k)) w *= 0.5
    weights.push([k, w])
  }
  if (!weights.length) return fallbackKind(word, all, opts)
  let r = rng() * weights.reduce((n, [, w]) => n + w, 0)
  for (const [k, w] of weights) { r -= w; if (r < 0) return k }
  return weights[weights.length - 1][0]
}

// ------------------------------------------------------------------------------------------

export function buildQuestion(word: Word, entry: MasteryEntry | undefined, words: Word[], opts: QuestionOptions = {}): Question {
  const rng = opts.rng ?? Math.random
  const lv = entry?.lv ?? 0
  let kind: QKind = !entry ? 'intro' : opts.kind ?? chooseKind(word, entry, words, opts)
  if (kind !== 'intro' && !isFeasible(kind, word, words, opts)) kind = fallbackKind(word, words, opts)

  const pool = poolFor(word, words, opts.known)
  const difficulty = difficultyFor(lv)
  const unit = word.kind === 'character' ? 'character' : 'word'        // what the answer buttons are called
  const hasSibling = homographsOf(word, words).length > 0                // same hanzi, other reading: show enough context to tell them apart
  const soundOk = (w: Word) => !intersects(anySounds(w), anySounds(word))
  const meaningOptions = (soundOnly = false) =>
    shuffle([word.meaning, ...distractors(word, pool, words, rng, 3, soundOnly ? soundOk : undefined, difficulty, false, w => w.meaning).map(w => w.meaning)], rng)
  const hanziOptions = (soundOnly = false) =>
    shuffle([word.hanzi, ...distractors(word, pool, words, rng, 3, soundOnly ? soundOk : undefined, difficulty, true).map(w => w.hanzi)], rng)
  const q = (p: Omit<Question, 'audio'> & { audio?: boolean }): Question => ({ audio: false, ...p })
  const pinyinChoices = (meaningShown: boolean) => pinyinOptions(word, words, rng, meaningShown) ?? [word.pinyin]

  switch (kind) {
    case 'intro': return q({
      kind, text: `New word! What does ${word.hanzi} mean?`, options: meaningOptions(), answer: word.meaning,
      optionsAreHanzi: false, ask: 'meaning', show: { hanzi: true, pinyin: true, meaning: true }
    })
    case 'meaning': return q({
      kind, text: hasSibling ? `What does ${word.hanzi} (${word.pinyin}) mean?` : `What does ${word.hanzi} mean?`, options: meaningOptions(), answer: word.meaning,
      optionsAreHanzi: false, ask: 'meaning', show: { hanzi: true, pinyin: lv === 0 || hasSibling, meaning: false }
    })
    case 'pinyin': return q({
      kind, text: hasSibling ? `Choose the correct pinyin for ${word.hanzi} meaning “${word.meaning}”` : `Choose the correct pinyin for ${word.hanzi}`,
      options: pinyinChoices(hasSibling), answer: word.pinyin,
      optionsAreHanzi: false, ask: 'pinyin', show: { hanzi: true, pinyin: false, meaning: hasSibling }
    })
    case 'character': return q({
      kind, text: `Which ${unit} means “${word.meaning}”?`, options: hanziOptions(), answer: word.hanzi,
      optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: false, meaning: true }
    })
    case 'listen': return q({
      kind, text: `Listen, then choose the ${unit} you heard`, options: hanziOptions(true), answer: word.hanzi,
      optionsAreHanzi: true, ask: 'hanzi', audio: true, show: { hanzi: false, pinyin: false, meaning: false }
    })
    case 'meaning2pinyin': return q({
      kind, text: `What is the pinyin for “${word.meaning}”?`, options: pinyinChoices(true), answer: word.pinyin,
      optionsAreHanzi: false, ask: 'pinyin', show: { hanzi: false, pinyin: false, meaning: true }
    })
    case 'pinyin2char': return q({
      kind, text: `Which ${unit} is ${word.pinyin}?`, options: hanziOptions(true), answer: word.hanzi,
      optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: true, meaning: false }
    })
    case 'listen2meaning': return q({
      kind, text: 'Listen, then choose the meaning', options: meaningOptions(true), answer: word.meaning,
      optionsAreHanzi: false, ask: 'meaning', audio: true, show: { hanzi: false, pinyin: false, meaning: false }
    })
    case 'listen2pinyin': return q({
      kind, text: 'Listen, then choose the pinyin you heard', options: pinyinChoices(false), answer: word.pinyin,
      optionsAreHanzi: false, ask: 'pinyin', audio: true, show: { hanzi: false, pinyin: false, meaning: false }
    })
    case 'homophone': {
      const partners = uniqueHanzi(shuffle(usableHomophones(word, words, opts.known), rng)).slice(0, 2)
      const fillers = distractors(word, pool, words, rng, 3 - partners.length, w => soundOk(w) && !partners.some(p => tooClose(p, w) || p.hanzi === w.hanzi), difficulty, true)
      return q({
        kind, text: `Same sound! Which ${unit} is “${word.pinyin}” and means “${word.meaning}”?`,
        options: shuffle([word.hanzi, ...partners.map(p => p.hanzi), ...fillers.map(f => f.hanzi)], rng), answer: word.hanzi,
        optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: true, meaning: true }
      })
    }
    case 'lookalike': {
      const partners = uniqueHanzi(shuffle(usableLookalikes(word, words, opts.known), rng)).slice(0, 3)
      const fillers = distractors(word, pool, words, rng, 3 - partners.length, w => !partners.some(p => tooClose(p, w) || p.hanzi === w.hanzi), difficulty, true)
      return q({
        kind, text: `These look alike. Which one means “${word.meaning}”?`,
        options: shuffle([word.hanzi, ...partners.map(p => p.hanzi), ...fillers.map(f => f.hanzi)], rng), answer: word.hanzi,
        optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: false, meaning: true }
      })
    }
    case 'particle': {
      // Authored sentence + authored options (cloze.json). Nothing here is generated from glosses.
      const items = clozeFor(word, opts)
      const item = items[Math.floor(rng() * items.length)]
      const optWords = item.options.map(id => words.find(w => w.id === id)).filter((w): w is Word => !!w)
      const why: Record<string, string> = {}
      for (const w of optWords) if (item.why[w.id]) why[w.hanzi] = item.why[w.id]
      return q({
        kind, text: 'Complete the sentence', options: shuffle(optWords.map(w => w.hanzi), rng), answer: word.hanzi,
        optionsAreHanzi: true, ask: 'particle', show: { hanzi: false, pinyin: false, meaning: false },
        cloze: { itemId: item.id, zh: item.zh, pinyin: item.pinyin, en: item.en, why, note: item.note }
      })
    }
  }
}

/** Tone questions are the ones that ask for the pinyin (the choices differ in tone). Only these break the Shield Golem's shield. */
export const isToneQuestion = (q: Pick<Question, 'ask'>) => q.ask === 'pinyin'
/** Character questions (pick the hanzi) break the Ink Scribe's seals. */
export const isCharacterQuestion = (q: Pick<Question, 'ask'>) => q.ask === 'hanzi'
/** The question kinds that ask for pinyin, in the order they are tried for the shield phase. */
export const TONE_KINDS: QKind[] = ['pinyin', 'meaning2pinyin', 'listen2pinyin']
/** Kinds the Ink Scribe asks while its seals are up / the Mirror Trickster always asks (the easy-to-confuse ones). */
export const CHARACTER_KINDS: QKind[] = ['character', 'pinyin2char', 'listen']
export const TRICK_KINDS: QKind[] = ['homophone', 'lookalike']
