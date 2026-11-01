// How much help events and boss trials show, from the player's own word levels (game/mastery.ts), per word:
// - English: never before answering (only with the free "Pinyin & translation" help, and after answering).
// - Pinyin: while the word is at most Familiar (level 2); from Remembered (level 3) on, only its characters.
// Pictures never stand in for a word option (they would give the answer away); a picture that IS the choice stays.
import { WORDS } from '../data.ts'
import { SESSION_LV } from './mastery.ts'
import type { Mastery } from './types.ts'

/** A word's level (0 when it has never been met). */
export type LevelOf = (id: string) => number
export const levelOf = (m: Mastery): LevelOf => id => m[id]?.lv ?? 0
/** Preview links: every word at the same level. */
export const fixedLevel = (lv: number): LevelOf => () => lv

/** Pinyin is shown while a word is at most Familiar; from Remembered on, only its characters. */
export const showPinyin = (lv: number) => lv <= SESSION_LV

const HANZI_OF = new Map(WORDS.map(w => [w.id, w.hanzi]))
/** The word ids (from `ids`) whose characters appear in `text`. */
export const wordsIn = (text: string, ids: string[]) => ids.filter(id => { const h = HANZI_OF.get(id); return !!h && text.includes(h) })
/** Should the pinyin of `text` be shown? While any of its words still needs it (and when none of `ids` can be found in it). */
export function pinyinFor(text: string, ids: string[], level: LevelOf): boolean {
  const found = wordsIn(text, ids)
  return !found.length || found.some(id => showPinyin(level(id)))
}
