// Generated events from the noun data in words.json (see src/game/nouns.ts for the sentence patterns), so events scale to any
// vocabulary instead of a few hand-written scenes. Every word a generated scene uses is at least Familiar (like authored scenes),
// and every scene passes the same validator as authored ones (encounters.ts filters them).
// - Counting (point): 这里有 N 个 X。 → tap the group with N tiles of X (nouns counted with 个; N = 3..6).
// - Request (gather): 我要 X。 (or two items) → pick exactly what was asked for; the other options are known nouns, from the same
//   topic group first, so the choice cannot be made by category.
import { WORDS } from '../data.ts'
import type { Word } from '../content/types.ts'
import type { Mastery } from './types.ts'
import type { Scene } from './encounters.ts'
import { SESSION_LV } from './mastery.ts'
import { NUMBERS, hereCount, iWant, knownNouns, knows, nounEn } from './nouns.ts'

export const SCENE_GEN_PREFIX = 'gen-'
const GRAMMAR = "这里有… means “here there is / are…”. 个 goes between a number and the noun: 三个人, three people."

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Every event that can be generated now from words the player knows at least at Familiar. */
export function generatedScenes(m: Mastery, rng = Math.random): Scene[] {
  const out: Scene[] = [], nouns = shuffle(knownNouns(m, SESSION_LV), rng)
  // Counting: the right group and two others of 3-6 tiles (counting tiles needs no number word; the line's number is known).
  const numbers = NUMBERS.filter(n => knows(m, [n.id], SESSION_LV))
  if (knows(m, ['这里', '有', '个'], SESSION_LV) && numbers.length) for (const x of nouns.filter(w => w.measure === '个').slice(0, 8)) {
    const n = numbers[Math.floor(rng() * numbers.length)]
    const others = shuffle(NUMBERS.filter(k => k.n !== n.n), rng).slice(0, 2)
    const line = hereCount(n, x)
    out.push({
      id: `${SCENE_GEN_PREFIX}count-${x.id}-${n.n}`, kind: 'point', requires: line.requires, speaker: '🧙',
      situation: 'The traveler is looking for the right group.', zh: line.zh, py: line.py, en: line.en, grammar: GRAMMAR,
      options: [n, ...others].map(k => ({ id: `n${k.n}`, en: `${k.en} × ${nounEn(x)}`, picture: true, tiles: Array(k.n).fill(x.hanzi) })),
      answer: [`n${n.n}`], note: `${n.id} is ${n.en}: count the tiles. ${n.id}个${x.hanzi} = ${n.en} × ${x.hanzi}.`,
      result: 'You point the traveler to the right group.', resultIcon: '✅',
    })
  }
  // Requests: one item (3 other options) or, with enough nouns, two items (2 other options).
  if (knows(m, ['我', '要'], SESSION_LV) && nouns.length >= 4) for (const x of nouns.slice(0, 10)) {
    const pair = nouns.length >= 6 && rng() < 0.4
    const asked: Word[] = pair ? [x, nouns.find(w => w !== x && w.group === x.group) ?? nouns.find(w => w !== x)!] : [x]
    const rest = nouns.filter(w => !asked.includes(w))
    const sameGroup = shuffle(rest.filter(w => asked.some(a => a.group === w.group)), rng), elsewhere = shuffle(rest.filter(w => !sameGroup.includes(w)), rng)
    const wrong = [...sameGroup, ...elsewhere].slice(0, pair ? 2 : 3)
    const line = iWant(asked)
    out.push({
      id: `${SCENE_GEN_PREFIX}want-${asked.map(w => w.id).join('-')}`, kind: 'gather', requires: [...new Set([...line.requires, ...wrong.map(w => w.id)])],
      speaker: asked.every(w => w.group === 'food') ? '🧑‍🍳' : '🧙', situation: 'The traveler looks into your pack.',
      zh: line.zh, py: line.py, en: line.en, grammar: '我 means “I”; 要 means “would like / want”. 我要 X asks for X, nothing else.',
      options: shuffle([...asked, ...wrong], rng).map(w => ({ id: w.id, en: nounEn(w) })), answer: asked.map(w => w.id),
      note: `${line.zh} asks for ${asked.map(w => w.hanzi).join(' and ')} only. ${wrong.map(w => `${w.hanzi} is “${nounEn(w)}”.`).join(' ')}`,
      result: 'You hand the traveler exactly what they asked for.', resultIcon: '🎒',
    })
  }
  return out
}

/** Word ids in words.json, for the validator (generated scenes are checked like authored ones). */
export const WORD_IDS = WORDS.map(w => w.id)
