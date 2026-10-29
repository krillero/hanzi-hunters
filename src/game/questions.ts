// Question generation + the scheduler that picks which kind of question a word gets.
// Pure (no DOM). Every option set has exactly one correct answer; see tests/questions.test.ts.
import type { Word } from '../data.ts'
import type { MasteryEntry } from './types.ts'

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

export type Question = {
  kind: QKind
  text: string
  options: string[]
  answer: string
  optionsAreHanzi: boolean
  /** What is being asked for: decides which field of the word card stays hidden until the player answers. */
  ask: 'meaning' | 'pinyin' | 'hanzi'
  /** True when the word is played aloud instead of (or as well as) being shown. */
  audio: boolean
  /** What the word card may show before the player answers (everything is revealed afterwards). */
  show: { hanzi: boolean; pinyin: boolean; meaning: boolean }
}

export type KindResult = { kind: QKind; ok: boolean }

export type QuestionOptions = {
  canListen?: boolean
  rng?: () => number
  /** Force a kind (tests, previews). Falls back to a feasible kind when it cannot be built for this word. */
  kind?: QKind
  /** Hanzi the learner has met. Wrong answers and homophone / look-alike partners are drawn from these. */
  known?: Set<string>
  /** Recent results this session, used to avoid repeats and to favour weaker kinds. */
  history?: KindResult[]
}

// ------------------------------------------------------------------------------------------
// Tone variants, shuffling, helpers

const TONES: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }
const MARKED = new Map<string, [string, number]>()
for (const [base, marks] of Object.entries(TONES)) [...marks].forEach((c, i) => MARKED.set(c, [base, i]))

/** The three other tones of the same syllable, e.g. shān -> shán, shǎn, shàn. */
export function toneVariants(pinyin: string): string[] {
  const chars = [...pinyin]
  const idx = chars.findIndex(c => MARKED.has(c))
  if (idx < 0) return []
  const [base, tone] = MARKED.get(chars[idx])!
  return [0, 1, 2, 3].filter(t => t !== tone).map(t => chars.map((c, i) => (i === idx ? TONES[base][t] : c)).join(''))
}

export function shuffle<T>(items: T[], rng: () => number = Math.random) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

const tokens = (meaning: string) => meaning.split('/').map(t => t.trim().toLowerCase())
const overlaps = (a: Word, b: Word) => tokens(a.meaning).some(t => tokens(b.meaning).includes(t))
const tooClose = (a: Word, b: Word) => overlaps(a, b) || !!a.confusable?.includes(b.hanzi) || !!b.confusable?.includes(a.hanzi)

/** Other words with exactly the same pinyin (same syllable and tone), e.g. 木 / 目 (mù). */
export const homophonesOf = (word: Word, words: Word[]) => words.filter(w => w.hanzi !== word.hanzi && w.pinyin === word.pinyin)

/** Words that look similar to `word` (the relation is symmetric even if the data lists it once). */
export const lookalikesOf = (word: Word, words: Word[]) =>
  words.filter(w => w.hanzi !== word.hanzi && (word.lookalike?.includes(w.hanzi) || w.lookalike?.includes(word.hanzi)))

const isKnown = (known: Set<string> | undefined, w: Word) => !known || known.has(w.hanzi)

/** Homophone partners a *fair* question can use: known to the learner and not too close in meaning. */
export const usableHomophones = (word: Word, all: Word[], known?: Set<string>) =>
  homophonesOf(word, all).filter(w => isKnown(known, w) && !tooClose(w, word))
export const usableLookalikes = (word: Word, all: Word[], known?: Set<string>) =>
  lookalikesOf(word, all).filter(w => isKnown(known, w) && !tooClose(w, word))

/** Candidate wrong answers: words the learner has met (padded with the earliest words while the list is tiny). */
function poolFor(word: Word, all: Word[], known?: Set<string>) {
  if (!known) return all
  const pool = all.filter(w => known.has(w.hanzi) || w.hanzi === word.hanzi)
  for (const w of all) { if (pool.length >= 9) break; if (!pool.includes(w)) pool.push(w) }
  return pool
}

/** How confusable the wrong answers are: easy = clearly different words, normal = mixed, hard = same family first. */
export type Difficulty = 'easy' | 'normal' | 'hard'
export const difficultyFor = (lv: number): Difficulty => (lv <= 0 ? 'easy' : lv === 1 ? 'normal' : 'hard')

/** Up to n fair wrong answers: not too close in meaning; ordered by difficulty; extra filter per question kind. */
function distractors(word: Word, pool: Word[], all: Word[], rng: () => number, n: number, ok: (w: Word) => boolean = () => true, difficulty: Difficulty = 'hard') {
  const fair = (w: Word) => w.hanzi !== word.hanzi && !tooClose(w, word) && ok(w)
  const look = new Set(lookalikesOf(word, all).map(w => w.hanzi))
  const ranked = (list: Word[]) => {
    const s = shuffle(list.filter(fair), rng)
    const same = s.filter(w => w.group === word.group), other = s.filter(w => w.group !== word.group)
    if (difficulty === 'hard') return [...same, ...other]
    if (difficulty === 'normal') return s
    // easy: other families first, and look-alike characters last
    return [...other.filter(w => !look.has(w.hanzi)), ...same.filter(w => !look.has(w.hanzi)), ...s.filter(w => look.has(w.hanzi))]
  }
  const out = ranked(pool).slice(0, n)
  if (out.length < n) for (const w of ranked(all)) { if (out.length >= n) break; if (!out.includes(w)) out.push(w) }
  return out
}

function pinyinOptions(word: Word, all: Word[], rng: () => number) {
  const avoid = new Set([word.pinyin, ...(word.alt ?? [])])
  const out = toneVariants(word.pinyin).filter(p => !avoid.has(p))
  for (const w of shuffle(all, rng)) {
    if (out.length >= 3) break
    if (!avoid.has(w.pinyin) && !out.includes(w.pinyin)) out.push(w.pinyin)
  }
  return shuffle([word.pinyin, ...out.slice(0, 3)], rng)
}

// ------------------------------------------------------------------------------------------
// Which kinds are allowed / how likely, per mastery level

/** Answer is decided by sound alone, so it is ambiguous when the learner knows a word that sounds the same. */
const SOUND_ONLY: QKind[] = ['listen', 'pinyin2char', 'listen2meaning']
const AUDIO: QKind[] = ['listen', 'listen2meaning', 'listen2pinyin']

/** Relative frequency of each kind. Early: recognise. Developing: all directions. Higher: mixed recall + discrimination. */
/** A word that was just introduced (or dropped back to level 0) gets its easiest question first: the character and pinyin are on screen. */
export const FIRST_STEP: Partial<Record<QKind, number>> = { meaning: 1 }

export const KIND_WEIGHTS: Record<number, Partial<Record<QKind, number>>> = {
  0: { meaning: 4, listen: 2, character: 2 },
  1: { pinyin: 3, pinyin2char: 2, character: 2, listen2meaning: 2, homophone: 2, lookalike: 2 },
  2: { meaning: 2, meaning2pinyin: 2, listen2pinyin: 2, pinyin2char: 2, lookalike: 2, homophone: 2, character: 1, listen2meaning: 1, listen: 1 },
  3: { character: 2, listen: 2, pinyin2char: 2, listen2pinyin: 2, listen2meaning: 2, meaning2pinyin: 2, lookalike: 3, homophone: 3, pinyin: 1, meaning: 1 },
  4: { character: 2, listen: 2, pinyin2char: 2, listen2pinyin: 2, listen2meaning: 2, meaning2pinyin: 2, lookalike: 3, homophone: 3, pinyin: 1, meaning: 1 }
}

/** Can this kind be asked fairly for this word right now? */
export function isFeasible(kind: QKind, word: Word, all: Word[], opts: Pick<QuestionOptions, 'canListen' | 'known'> = {}): boolean {
  if (kind === 'intro') return true
  if (AUDIO.includes(kind) && !opts.canListen) return false
  if (SOUND_ONLY.includes(kind) && homophonesOf(word, all).some(w => isKnown(opts.known, w))) return false
  if (kind === 'homophone') return usableHomophones(word, all, opts.known).length > 0
  if (kind === 'lookalike') return usableLookalikes(word, all, opts.known).length > 0
  return true
}

/** Weighted pick of the next kind: level table x feasibility x (not the same as last time) x (weaker kinds more often). */
export function chooseKind(word: Word, entry: MasteryEntry | undefined, all: Word[], opts: QuestionOptions = {}): QKind {
  if (!entry) return 'intro'
  const rng = opts.rng ?? Math.random
  const table = entry.lv === 0 && entry.ok === 0 ? FIRST_STEP : KIND_WEIGHTS[Math.min(entry.lv, 4)]
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
  if (!weights.length) return 'meaning'
  let r = rng() * weights.reduce((n, [, w]) => n + w, 0)
  for (const [k, w] of weights) { r -= w; if (r < 0) return k }
  return weights[weights.length - 1][0]
}

// ------------------------------------------------------------------------------------------

export function buildQuestion(word: Word, entry: MasteryEntry | undefined, words: Word[], opts: QuestionOptions = {}): Question {
  const rng = opts.rng ?? Math.random
  const lv = entry?.lv ?? 0
  let kind: QKind = !entry ? 'intro' : opts.kind ?? chooseKind(word, entry, words, opts)
  if (kind !== 'intro' && !isFeasible(kind, word, words, opts)) kind = 'meaning'

  const pool = poolFor(word, words, opts.known)
  const difficulty = difficultyFor(lv)
  const meaningOptions = (soundOnly = false) =>
    shuffle([word.meaning, ...distractors(word, pool, words, rng, 3, soundOnly ? w => w.pinyin !== word.pinyin : undefined, difficulty).map(w => w.meaning)], rng)
  const hanziOptions = (soundOnly = false) =>
    shuffle([word.hanzi, ...distractors(word, pool, words, rng, 3, soundOnly ? w => w.pinyin !== word.pinyin && !word.alt?.includes(w.pinyin) : undefined, difficulty).map(w => w.hanzi)], rng)
  const q = (p: Omit<Question, 'audio'> & { audio?: boolean }): Question => ({ audio: false, ...p })

  switch (kind) {
    case 'intro': return q({
      kind, text: `New word! What does ${word.hanzi} mean?`, options: meaningOptions(), answer: word.meaning,
      optionsAreHanzi: false, ask: 'meaning', show: { hanzi: true, pinyin: true, meaning: true }
    })
    case 'meaning': return q({
      kind, text: `What does ${word.hanzi} mean?`, options: meaningOptions(), answer: word.meaning,
      optionsAreHanzi: false, ask: 'meaning', show: { hanzi: true, pinyin: lv === 0, meaning: false }
    })
    case 'pinyin': return q({
      kind, text: `Choose the correct pinyin for ${word.hanzi}`, options: pinyinOptions(word, words, rng), answer: word.pinyin,
      optionsAreHanzi: false, ask: 'pinyin', show: { hanzi: true, pinyin: false, meaning: false }
    })
    case 'character': return q({
      kind, text: `Which character means “${word.meaning}”?`, options: hanziOptions(), answer: word.hanzi,
      optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: false, meaning: true }
    })
    case 'listen': return q({
      kind, text: 'Listen, then choose the character you heard', options: hanziOptions(true), answer: word.hanzi,
      optionsAreHanzi: true, ask: 'hanzi', audio: true, show: { hanzi: false, pinyin: false, meaning: false }
    })
    case 'meaning2pinyin': return q({
      kind, text: `What is the pinyin for “${word.meaning}”?`, options: pinyinOptions(word, words, rng), answer: word.pinyin,
      optionsAreHanzi: false, ask: 'pinyin', show: { hanzi: false, pinyin: false, meaning: true }
    })
    case 'pinyin2char': return q({
      kind, text: `Which character is ${word.pinyin}?`, options: hanziOptions(true), answer: word.hanzi,
      optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: true, meaning: false }
    })
    case 'listen2meaning': return q({
      kind, text: 'Listen, then choose the meaning', options: meaningOptions(true), answer: word.meaning,
      optionsAreHanzi: false, ask: 'meaning', audio: true, show: { hanzi: false, pinyin: false, meaning: false }
    })
    case 'listen2pinyin': return q({
      kind, text: 'Listen, then choose the pinyin you heard', options: pinyinOptions(word, words, rng), answer: word.pinyin,
      optionsAreHanzi: false, ask: 'pinyin', audio: true, show: { hanzi: false, pinyin: false, meaning: false }
    })
    case 'homophone': {
      const partners = shuffle(usableHomophones(word, words, opts.known), rng).slice(0, 2)
      const fillers = distractors(word, pool, words, rng, 3 - partners.length, w => w.pinyin !== word.pinyin && !partners.some(p => tooClose(p, w) || p.hanzi === w.hanzi), difficulty)
      return q({
        kind, text: `Same sound! Which character is “${word.pinyin}” and means “${word.meaning}”?`,
        options: shuffle([word.hanzi, ...partners.map(p => p.hanzi), ...fillers.map(f => f.hanzi)], rng), answer: word.hanzi,
        optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: true, meaning: true }
      })
    }
    case 'lookalike': {
      const partners = shuffle(usableLookalikes(word, words, opts.known), rng).slice(0, 3)
      const fillers = distractors(word, pool, words, rng, 3 - partners.length, w => !partners.some(p => tooClose(p, w) || p.hanzi === w.hanzi), difficulty)
      return q({
        kind, text: `These look alike. Which one means “${word.meaning}”?`,
        options: shuffle([word.hanzi, ...partners.map(p => p.hanzi), ...fillers.map(f => f.hanzi)], rng), answer: word.hanzi,
        optionsAreHanzi: true, ask: 'hanzi', show: { hanzi: false, pinyin: false, meaning: true }
      })
    }
  }
}
