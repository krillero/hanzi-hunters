// Question generation for every mastery level. Pure; every option set has exactly one correct answer.
import type { Word } from '../data.ts'
import type { MasteryEntry } from './types.ts'

export type QKind = 'intro' | 'pinyin' | 'meaning' | 'character' | 'listen'
export type Question = {
  kind: QKind
  text: string
  options: string[]
  answer: string
  optionsAreHanzi: boolean
  /** What the word card may show before the player answers (everything is revealed afterwards). */
  show: { hanzi: boolean; pinyin: boolean; meaning: boolean }
}

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

/** Other words that are a fair wrong answer for `word`; same group first. */
function distractors(word: Word, words: Word[], rng: () => number, extra: (w: Word) => boolean = () => true) {
  const ok = words.filter(w => w.hanzi !== word.hanzi && !overlaps(w, word) && !word.confusable?.includes(w.hanzi) && !w.confusable?.includes(word.hanzi) && extra(w))
  const shuffled = shuffle(ok, rng)
  return [...shuffled.filter(w => w.group === word.group), ...shuffled.filter(w => w.group !== word.group)]
}

function pinyinOptions(word: Word, words: Word[], rng: () => number) {
  const avoid = new Set([word.pinyin, ...(word.alt ?? [])])
  const out = toneVariants(word.pinyin).filter(p => !avoid.has(p))
  for (const w of shuffle(words, rng)) {
    if (out.length >= 3) break
    if (!avoid.has(w.pinyin) && !out.includes(w.pinyin)) out.push(w.pinyin)
  }
  return shuffle([word.pinyin, ...out.slice(0, 3)], rng)
}

export type QuestionOptions = { canListen?: boolean; rng?: () => number }

export function buildQuestion(word: Word, entry: MasteryEntry | undefined, words: Word[], opts: QuestionOptions = {}): Question {
  const rng = opts.rng ?? Math.random
  const meaningOptions = () => shuffle([word.meaning, ...distractors(word, words, rng).slice(0, 3).map(w => w.meaning)], rng)

  if (!entry) return {
    kind: 'intro', text: `New word! What does ${word.hanzi} mean?`, options: meaningOptions(), answer: word.meaning,
    optionsAreHanzi: false, show: { hanzi: true, pinyin: true, meaning: true }
  }
  switch (entry.lv) {
    case 0: return {
      kind: 'meaning', text: `What does ${word.hanzi} mean?`, options: meaningOptions(), answer: word.meaning,
      optionsAreHanzi: false, show: { hanzi: true, pinyin: true, meaning: false }
    }
    case 1: return {
      kind: 'pinyin', text: `Choose the correct pinyin for ${word.hanzi}`, options: pinyinOptions(word, words, rng), answer: word.pinyin,
      optionsAreHanzi: false, show: { hanzi: true, pinyin: false, meaning: false }
    }
    case 2: return {
      kind: 'meaning', text: `What does ${word.hanzi} mean?`, options: meaningOptions(), answer: word.meaning,
      optionsAreHanzi: false, show: { hanzi: true, pinyin: false, meaning: false }
    }
    default: {
      const listen = !!opts.canListen && rng() < 0.5
      const others = distractors(word, words, rng, w => !listen || (w.pinyin !== word.pinyin && !word.alt?.includes(w.pinyin)))
      return {
        kind: listen ? 'listen' : 'character',
        text: listen ? 'Listen, then choose the character you heard' : `Which character means “${word.meaning}”?`,
        options: shuffle([word.hanzi, ...others.slice(0, 3).map(w => w.hanzi)], rng), answer: word.hanzi, optionsAreHanzi: true,
        show: { hanzi: false, pinyin: false, meaning: !listen }
      }
    }
  }
}
