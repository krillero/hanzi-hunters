// Sentence templates over the `noun` / `measure` fields of words.json, shared by generated boss trials and events. Only a few fixed
// patterns are produced, each reviewed once; every character comes from a word the player has met (callers pass known ids):
//   这里有 X。 / 这里没有 X。   (there is / is no X here)          — any noun
//   这里有 N 个 X。              (there are N X here, N = 3..6)     — nouns whose measure word is 个
//   我要 X。                     (I would like X)                    — any noun
// English glosses are quoted (“tea”, “person”): the data does not say which nouns are countable, and a quoted gloss reads right
// for any noun. Numbers start at three: 一 changes its tone and 两 (not 二) is used before a measure word.
import { WORDS } from '../data.ts'
import type { Word } from '../content/types.ts'
import type { Mastery } from './types.ts'

export type Sentence = { zh: string; py: string; en: string; requires: string[] }

const byId = new Map(WORDS.map(w => [w.id, w]))
export const NUMBERS: { id: string; n: number; en: string }[] = [
  { id: '三', n: 3, en: 'three' }, { id: '四', n: 4, en: 'four' }, { id: '五', n: 5, en: 'five' }, { id: '六', n: 6, en: 'six' },
]
/** The English noun of an entry: the first meaning ("shop / store" -> "shop"). */
export const nounEn = (w: Word) => w.meaning.split('/')[0].trim()
const IRREGULAR: Record<string, string> = { person: 'people', child: 'children' }
export const plural = (en: string) => IRREGULAR[en] ?? (/(s|sh|ch|x)$/.test(en) ? `${en}es` : `${en}s`)
const cap = (py: string) => py.charAt(0).toUpperCase() + py.slice(1)

/** Entries met at least at this level (0 = introduced). */
const atLeast = (m: Mastery, id: string, lv: number) => Object.prototype.hasOwnProperty.call(m, id) && m[id].lv >= lv
export const knownNouns = (m: Mastery, lv = 0) => WORDS.filter(w => w.noun === true && atLeast(m, w.id, lv))
/** Can these template words be used (这里 有 没有 个 我 要 …)? */
export const knows = (m: Mastery, ids: string[], lv = 0) => ids.every(id => atLeast(m, id, lv))

const py = (id: string) => byId.get(id)?.pinyin ?? ''

export function hereHas(x: Word): Sentence {
  return { zh: `这里有${x.hanzi}。`, py: cap(`${py('这里')} ${py('有')} ${x.pinyin}.`), en: `There is “${nounEn(x)}” here.`, requires: ['这里', '有', x.id] }
}
export function hereHasNot(x: Word): Sentence {
  return { zh: `这里没有${x.hanzi}。`, py: cap(`${py('这里')} ${py('没有')} ${x.pinyin}.`), en: `There is no “${nounEn(x)}” here.`, requires: ['这里', '没有', x.id] }
}
/** 这里有三个人。 `x.measure` must be 个 (the only measure word pattern so far; 个 is toneless here: ge). */
export function hereCount(n: (typeof NUMBERS)[number], x: Word): Sentence {
  return { zh: `这里有${n.id}个${x.hanzi}。`, py: cap(`${py('这里')} ${py('有')} ${py(n.id)} ge ${x.pinyin}.`), en: `There are ${n.en} ${plural(nounEn(x))} here.`, requires: ['这里', '有', n.id, '个', x.id] }
}
export function iWant(xs: Word[]): Sentence {
  const zh = xs.map(x => `我要${x.hanzi}。`).join(''), en = xs.map(x => `I would like “${nounEn(x)}”.`).join(' ')
  return { zh, py: xs.map(x => cap(`${py('我')} ${py('要')} ${x.pinyin}.`)).join(' '), en, requires: ['我', '要', ...xs.map(x => x.id)] }
}
