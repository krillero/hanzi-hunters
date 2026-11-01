// Turns the raw entries of words.json into the normalised `Word`s the game uses, plus small helpers about entries.
// Pure (no DOM, no fs): tests and tools use it with their own lists.
import type { RawWord, Word } from './types.ts'
import { soundKey } from './pinyin.ts'

export function normalizeWords(raw: RawWord[]): Word[] {
  return raw.map(r => {
    const kind = r.kind ?? ([...r.hanzi].length > 1 ? 'word' : 'character')
    const w: Word = {
      ...r, id: r.id ?? r.hanzi, kind, neutral: r.neutral ?? [], variants: r.variants ?? [], speech: r.speech ?? [],
      wrongPinyin: r.wrongPinyin ?? [], audio: r.audio ?? 'ok', aliases: r.aliases ?? []
    }
    // Particles are taught by function: their meaning is a description, so they are only asked what they do, and in sentences.
    if (kind === 'particle' && !w.questions) w.questions = ['meaning', 'particle']
    return w
  })
}

/** Other entries written with exactly the same hanzi (different meaning or reading), e.g. 看 kàn and 看 kān. */
export const homographsOf = (word: Word, all: Word[]) => all.filter(w => w.id !== word.id && w.hanzi === word.hanzi)

/** All sound spellings that count as THIS word: its pinyin plus accepted variants. */
const soundCache = new WeakMap<Word, string[]>()
/** A fresh Set each call (callers may add to it); the keys themselves are cached per entry. */
export const soundsOf = (word: Word) => { let k = soundCache.get(word); if (!k) { k = [soundKey(word.pinyin), ...word.variants.map(soundKey)]; soundCache.set(word, k) } return new Set(k) }

/** Can this entry be read aloud reliably? Text-to-speech reads the written form, so a hanzi shared by several entries
 *  (看 kàn / kān) cannot be trusted to choose the intended reading, and an entry can opt out with audio: "none". */
export const audioReliable = (word: Word, all: Word[]) => word.audio === 'ok' && homographsOf(word, all).length === 0

export const entryById = (all: Word[], id: string) => all.find(w => w.id === id)
export const entryLabel = (w: Word) => (w.kind === 'particle' ? 'PARTICLE' : w.kind === 'word' ? 'WORD' : 'CHARACTER')
