// Generated boss trials: built from the words the player has met, so the same trial rarely comes back (see
// docs/CONTEXTUAL_ENCOUNTERS.md "Generated trials"). Every generated trial must still pass the same validator as authored ones
// (trials.ts filters them), and the rules below keep each one unambiguous:
// - Tone (Golem): a known word, or an example sentence (explanations.json) whose characters are all known. Wrong options change
//   ONE syllable's tone mark: never a written third tone into a second tone (tone sandhi), never the syllable of 一 or 不 (their
//   spoken tones change), never a toneless syllable, and never into an accepted variant, a connected-speech reading or the
//   reading of another entry written the same way (看 kàn / kān).
// - Torn note (Scribe): one character of a known multi-character word is blanked. Wrong options are known single-character
//   words, preferably same-sound or look-alike; a wrong option may not turn the word into another real word, and a character
//   that appears twice (谢谢) is never blanked. Sentences are NOT
//   used: a wrong character can silently make a different valid sentence (很大 -> 很好), and no rule can rule that out.
import { WORDS } from '../data.ts'
import { EXPLANATIONS } from '../content/index.ts'
import { retoneSyllable, soundKey, splitSyllables, type Syllable } from '../content/pinyin.ts'
import type { Word } from '../content/types.ts'
import type { Mastery } from './types.ts'
import type { NoteTrial, ToneTrial, TruthTrial } from './trials.ts'
import { NUMBERS, hereCount, hereHas, hereHasNot, knownNouns, knows, type Sentence } from './nouns.ts'

export const GEN_PREFIX = 'gen-'
const BLANK = '＿'
const HANZI = /\p{Script=Han}/u
const TONE_NAMES = ['light, toneless', 'high and level, 1st tone', 'rising, 2nd tone', 'dipping, 3rd tone', 'falling, 4th tone']
/** Characters whose spoken tone changes with the next syllable: their syllables are never altered. */
const UNSTABLE = new Set(['一', '不'])

type Line = { zh: string; pinyin: string; en: string }
/** Authored example sentences (explanations.json, sections of type "examples"). */
export const EXAMPLE_LINES: Line[] = (() => {
  const out: Line[] = [], seen = new Set<string>()
  const walk = (o: unknown) => {
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (!o || typeof o !== 'object') return
    const r = o as Record<string, unknown>
    if (r.type === 'examples' && Array.isArray(r.items)) for (const it of r.items as Record<string, unknown>[]) {
      if (typeof it?.zh === 'string' && typeof it.pinyin === 'string' && typeof it.en === 'string' && !seen.has(it.zh)) { seen.add(it.zh); out.push({ zh: it.zh, pinyin: it.pinyin, en: it.en }) }
    }
    Object.values(r).forEach(walk)
  }
  walk(EXPLANATIONS)
  return out
})()

/** Where each syllable sits in a pinyin string (letters only; spaces and punctuation are kept as they are). */
function syllableSpans(pinyin: string): { start: number; end: number; syl: Syllable }[] | null {
  const spans: { start: number; end: number; syl: Syllable }[] = []
  const text = pinyin.normalize('NFC')
  for (const m of text.matchAll(/\p{L}+/gu)) {
    const parts = splitSyllables(m[0])
    if (!parts) return null
    let pos = m.index!
    for (const p of parts) { spans.push({ start: pos, end: pos + p.text.length, syl: p }); pos += p.text.length }
  }
  return spans
}

const introducedWords = (m: Mastery) => WORDS.filter(w => Object.prototype.hasOwnProperty.call(m, w.id))
const pick = <T>(xs: T[], rng: () => number) => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]
function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
/** Known words whose characters cover every character of `zh` (the validator's "no untaught character" rule). */
function coveringWords(zh: string, known: Word[]): string[] | null {
  const ids = new Set<string>()
  for (const ch of zh) {
    if (!HANZI.test(ch)) continue
    const w = known.find(k => k.hanzi === ch) ?? known.find(k => k.hanzi.includes(ch))
    if (!w) return null
    ids.add(w.id)
  }
  return [...ids]
}

/**
 * Two wrong tone versions of `pinyin` for the text `zh` (one hanzi per syllable), changing one syllable each, preferably
 * different syllables. `avoid`: readings that must never be offered (variants, connected speech). Null when not possible.
 */
function toneDistractors(zh: string, pinyin: string, avoid: string[], rng: () => number): { options: string[]; changed: number[] } | null {
  const spans = syllableSpans(pinyin), chars = [...zh].filter(ch => HANZI.test(ch))
  if (!spans || spans.length !== chars.length) return null
  const bad = new Set([pinyin, ...avoid].map(soundKey))
  const bySyllable = new Map<number, string[]>()
  spans.forEach((s, k) => {
    if (s.syl.tone === 0 || UNSTABLE.has(chars[k])) return
    const found: string[] = []
    for (const t of [1, 2, 3, 4] as const) {
      if (t === s.syl.tone || (s.syl.tone === 3 && t === 2)) continue
      const re = retoneSyllable(pinyin.normalize('NFC').slice(s.start, s.end), t)
      if (!re) continue
      const v = pinyin.normalize('NFC').slice(0, s.start) + re + pinyin.normalize('NFC').slice(s.end)
      if (!bad.has(soundKey(v))) found.push(v)
    }
    if (found.length) bySyllable.set(k, found)
  })
  const syllables = shuffle([...bySyllable.keys()], rng)
  const options: string[] = [], changed: number[] = []
  for (const k of syllables) { if (options.length < 2) { options.push(pick(bySyllable.get(k)!, rng)); changed.push(k) } }
  // Only one syllable can change (a one-syllable word): take a second tone of the same syllable.
  if (options.length === 1) { const rest = bySyllable.get(changed[0])!.filter(v => v !== options[0]); if (rest.length) { options.push(pick(rest, rng)); changed.push(changed[0]) } }
  return options.length === 2 ? { options, changed } : null
}

const toneNote = (zh: string, pinyin: string, changed: number[]) => {
  const spans = syllableSpans(pinyin)!, chars = [...zh].filter(ch => HANZI.test(ch))
  const parts = [...new Set(changed)].map(k => `${chars[k]} is ${spans[k].syl.text} (${TONE_NAMES[spans[k].syl.tone]})`)
  if (chars.length === 1) return `${parts[0]}.`
  return `${zh} is read ${pinyin}${/[.!?。！？]$/.test(pinyin) ? '' : '.'} ${parts.join('; ')}.`
}

/** Every tone trial that can be built right now from known words and fully known example sentences. */
export function toneTrials(mastery: Mastery, rng = Math.random): ToneTrial[] {
  const known = introducedWords(mastery), out: ToneTrial[] = []
  for (const w of known) {
    if (w.kind === 'particle' || [...w.hanzi].some(ch => !HANZI.test(ch))) continue
    // Another entry written the same way (看 kàn / kān) has a reading that is right too: never offer it.
    const homographs = WORDS.filter(x => x.hanzi === w.hanzi && x.id !== w.id).flatMap(x => [x.pinyin, ...x.variants])
    const d = toneDistractors(w.hanzi, w.pinyin, [...w.variants, ...w.speech.map(s => s.pinyin), ...homographs], rng)
    if (d) out.push({ id: `${GEN_PREFIX}tone-${w.id}`, boss: 'golem', requires: [w.id], zh: w.hanzi, en: w.meaning, options: [w.pinyin, ...d.options], answer: w.pinyin, note: toneNote(w.hanzi, w.pinyin, d.changed) })
  }
  for (const line of EXAMPLE_LINES) {
    const requires = coveringWords(line.zh, known)
    if (!requires) continue
    // The connected-speech readings in words.json (一, 不, third-tone pairs, toneless 个) are all excluded by the syllable rules.
    const d = toneDistractors(line.zh, line.pinyin, [], rng)
    if (!d) continue
    out.push({ id: `${GEN_PREFIX}tone-${line.zh}`, boss: 'golem', requires, zh: line.zh, en: line.en, options: [line.pinyin, ...d.options], answer: line.pinyin, note: toneNote(line.zh, line.pinyin, d.changed) })
  }
  return out
}

/** Every torn-note trial that can be built right now from known multi-character words. */
export function noteTrials(mastery: Mastery, rng = Math.random): NoteTrial[] {
  const known = introducedWords(mastery), out: NoteTrial[] = []
  const singles = known.filter(w => [...w.hanzi].length === 1 && HANZI.test(w.hanzi))
  const realWords = new Set(WORDS.map(w => w.hanzi))
  const sounds = (w: Word) => splitSyllables(w.pinyin)?.map(s => s.base) ?? []
  for (const w of known) {
    const chars = [...w.hanzi]
    if (chars.length < 2 || chars.some(ch => !HANZI.test(ch))) continue
    const syl = splitSyllables(w.pinyin)
    if (!syl || syl.length !== chars.length) continue
    const positions = shuffle(chars.map((_, i) => i), rng)
    for (const i of positions) {
      const answer = chars[i]
      if (chars.filter(c => c === answer).length > 1) continue   // 谢＿ would show the answer next to the blank
      const fits = (d: Word) => d.hanzi !== answer && !realWords.has(chars.map((c, k) => (k === i ? d.hanzi : c)).join(''))
      const pool = singles.filter(fits)
      const similar = pool.filter(d => sounds(d).includes(syl[i].base) || (d.lookalike ?? []).includes(answer) || (WORDS.find(x => x.hanzi === answer)?.lookalike ?? []).includes(d.id))
      const others = pool.filter(d => !similar.includes(d))
      const wrong = [...shuffle(similar, rng), ...shuffle(others, rng)].slice(0, 2)
      if (wrong.length < 2) continue
      const zh = chars.map((c, k) => (k === i ? BLANK : c)).join('')
      const note = `${w.hanzi} (${w.pinyin}, ${w.meaning}) is written with ${answer}. ` + wrong.map(d => `${d.hanzi} (${d.pinyin}) means ${d.meaning}.`).join(' ')
      out.push({ id: `${GEN_PREFIX}note-${w.id}-${i}`, boss: 'scribe', requires: [w.id, ...wrong.map(d => d.id)], zh, py: w.pinyin, en: w.meaning, options: [answer, ...wrong.map(d => d.hanzi)], answer, note })
      break   // one note per word, so long words do not crowd out short ones
    }
  }
  return out
}

/**
 * The pinyin of a torn note with the missing character's syllable blanked too ("Wǒ shì nǐ péng＿."), so pinyin can be shown before
 * answering without giving the answer away. Null when the syllables cannot be matched one-to-one with the characters.
 */
export function blankedPinyin(zh: string, py: string): string | null {
  const slots = [...zh].filter(ch => HANZI.test(ch) || ch === BLANK)
  const i = slots.indexOf(BLANK), spans = syllableSpans(py)
  if (i < 0 || !spans || spans.length !== slots.length) return null
  const p = py.normalize('NFC')
  return p.slice(0, spans[i].start) + BLANK + p.slice(spans[i].end)
}

/**
 * Mirror Trickster: a tray of noun tiles (characters, not pictures) and three statements, exactly one true by construction.
 * Presence (any noun): the tray holds two nouns, a third is absent; true = 这里有 <present> or 这里没有 <absent>.
 * Counting (nouns counted with 个): the tray holds N of one noun (3-6); true = 这里有 N 个 X, false = another number, 没有 X.
 * Works for every noun the player has met, so it scales with the vocabulary.
 */
export function truthTrials(mastery: Mastery, rng = Math.random): TruthTrial[] {
  const out: TruthTrial[] = [], nouns = shuffle(knownNouns(mastery), rng)
  const reply = (x: Sentence) => ({ zh: x.zh, py: x.py, en: x.en })
  // `onTray`: the nouns on the tray are words the trial uses too (a tray noun need not appear in any statement).
  const make = (id: string, onTray: Word[], tiles: string[], right: Sentence, wrong: Sentence[], note: string): TruthTrial => ({
    id: `${GEN_PREFIX}truth-${id}`, boss: 'trickster', tiles: shuffle(tiles, rng), en: `The tray holds: ${tiles.join(' ')}.`,
    requires: [...new Set([...[right, ...wrong].flatMap(x => x.requires), ...onTray.map(w => w.id)])], options: [right, ...wrong].map(reply), answer: right.zh, note,
  })
  if (knows(mastery, ['这里', '有', '没有'])) for (let i = 0; i + 2 < nouns.length && out.length < 12; i += 3) {
    const [a, b, c] = nouns.slice(i, i + 3)
    const tiles = [...Array(1 + Math.floor(rng() * 2)).fill(a.hanzi), ...Array(1 + Math.floor(rng() * 2)).fill(b.hanzi)]
    const presence = rng() < 0.5
    const note = `这里有 means "there is … here"; 没有 means "there is no …". The tray holds ${a.hanzi} and ${b.hanzi}, but no ${c.hanzi}.`
    out.push(presence
      ? make(`${a.id}-${b.id}-${c.id}-has`, [a, b], tiles, hereHas(a), [hereHasNot(b), hereHas(c)], note)
      : make(`${a.id}-${b.id}-${c.id}-not`, [a, b], tiles, hereHasNot(c), [hereHasNot(a), hereHas(c)], note))
  }
  const counted = nouns.filter(w => w.measure === '个')
  const numbers = NUMBERS.filter(n => knows(mastery, [n.id]))
  if (knows(mastery, ['这里', '有', '没有', '个']) && numbers.length >= 2) for (const x of counted.slice(0, 6)) {
    const [n, m] = shuffle(numbers, rng)
    out.push(make(`${x.id}-count-${n.n}`, [x], Array(n.n).fill(x.hanzi), hereCount(n, x), [hereCount(m, x), hereHasNot(x)],
      `${n.id}个${x.hanzi}: number + 个 + noun. Count the tiles: ${n.n}. 没有 would mean there is none.`))
  }
  return out
}
