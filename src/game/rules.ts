// Pure game rules: no React, Phaser or DOM. Covered by tests/*.test.ts.
import type { Enemy, GearItem, Word } from '../data.ts'

export type Saved = {
  level: number; xp: number; gold: number; maxHp: number; hp: number
  attack: number; learned: string[]; gear: string[]; potions: number; floor: number
  missed: string[]
}

export const SAVE_KEY = 'hanzi-hunters-save-v1'
export const defaultSave: Saved = {
  level: 1, xp: 0, gold: 0, maxHp: 30, hp: 30, attack: 5, learned: [], gear: [], potions: 1, floor: 1, missed: []
}

export const xpForLevel = (level: number) => level * 30
export const enemyMaxHp = (enemy: Enemy, floor: number) => enemy.hp + Math.max(0, floor - 1) * 3
export const enemyForFloor = (enemies: Enemy[], floor: number) => enemies[(Math.max(1, floor) - 1) % enemies.length]
export const gearBonus = (gear: GearItem[], key: 'attack' | 'hp') => gear.reduce((n, g) => n + g[key], 0)
export const equippedGear = (all: GearItem[], owned: string[]) => all.filter(g => owned.includes(g.name))

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback
const strings = (v: unknown, allowed: string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)))] : []

/** Turn anything found in localStorage into a valid save. Never throws. */
export function sanitizeSave(raw: unknown, gearList: GearItem[], hanziList: string[]): Saved {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = defaultSave
  const gear = strings(r.gear, gearList.map(g => g.name))
  const maxHp = int(r.maxHp, 10, 9999, d.maxHp)
  const effectiveMax = maxHp + gearBonus(equippedGear(gearList, gear), 'hp')
  let hp = int(r.hp, 0, effectiveMax, effectiveMax)
  if (hp <= 0) hp = effectiveMax // a saved defeat resumes as a fresh run
  return {
    level: int(r.level, 1, 999, d.level), xp: int(r.xp, 0, 1e9, d.xp), gold: int(r.gold, 0, 1e9, d.gold),
    maxHp, hp, attack: int(r.attack, 1, 9999, d.attack), potions: int(r.potions, 0, 999, d.potions),
    floor: int(r.floor, 1, 1e6, d.floor), gear,
    learned: strings(r.learned, hanziList), missed: strings(r.missed, hanziList)
  }
}

export type AnswerInput = {
  save: Saved; battleHp: number; enemyHp: number; enemy: Enemy; gear: GearItem[]
  word: Word; isCorrect: boolean
  /** random numbers in [0,1) so tests are deterministic */
  roll: { drop: number; item: number }
  allGear: GearItem[]
}
export type AnswerResult = {
  playerDamage: number; enemyHp: number; battleHp: number
  outcome: 'continue' | 'victory' | 'defeat'
  save: Saved; xpGained: number; goldGained: number; leveledUp: number; loot: GearItem | null; duplicateGold: number
}

export function resolveAnswer(i: AnswerInput): AnswerResult {
  const { save, enemy, isCorrect, word } = i
  const atkBonus = gearBonus(i.gear, 'attack'), hpBonus = gearBonus(i.gear, 'hp')
  const playerDamage = isCorrect ? 8 + save.attack + atkBonus : 2
  const enemyHp = Math.max(0, i.enemyHp - playerDamage)
  const killed = enemyHp === 0
  // The killing blow ends the fight before the enemy can counterattack.
  const battleHp = Math.max(0, i.battleHp - (killed ? 0 : enemy.damage))

  const charm = i.gear.some(g => g.name === 'Scholar Charm')
  let xpGained = Math.round((isCorrect ? 5 : 2) * (charm ? 1.1 : 1))
  let goldGained = 0, loot: GearItem | null = null, duplicateGold = 0
  let floor = save.floor, owned = save.gear
  if (killed) {
    xpGained += enemy.xp
    goldGained += enemy.gold + (i.gear.some(g => g.name === 'Lucky Coin') ? 3 : 0)
    floor += 1
    if (i.roll.drop < 0.65) {
      const item = i.allGear[Math.min(i.allGear.length - 1, Math.floor(i.roll.item * i.allGear.length))]
      if (owned.includes(item.name)) { duplicateGold = 4; goldGained += 4 } else { loot = item; owned = [...owned, item.name] }
    }
  }

  let xp = save.xp + xpGained, level = save.level, maxHp = save.maxHp, hp = battleHp, leveledUp = 0
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level); level += 1; maxHp += 5; leveledUp += 1
    hp = Math.min(maxHp + hpBonus, hp + 8)
  }
  if (battleHp <= 0) hp = 0

  const learned = isCorrect && !save.learned.includes(word.hanzi) ? [...save.learned, word.hanzi] : save.learned
  const missed = isCorrect ? save.missed.filter(h => h !== word.hanzi)
    : [word.hanzi, ...save.missed.filter(h => h !== word.hanzi)].slice(0, 10)

  return {
    playerDamage, enemyHp, battleHp: hp, xpGained, goldGained, leveledUp, loot, duplicateGold,
    outcome: killed ? 'victory' : battleHp <= 0 ? 'defeat' : 'continue',
    save: { ...save, xp, level, maxHp, hp, gold: save.gold + goldGained, floor, gear: owned, learned, missed }
  }
}

export function usePotion(battleHp: number, maxHp: number, potions: number) {
  if (potions < 1 || battleHp <= 0 || battleHp >= maxHp) return null
  return { battleHp: Math.min(maxHp, battleHp + 12), potions: potions - 1 }
}

export function shuffle<T>(items: T[], rng: () => number = Math.random) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Prefer a previously missed word about 40% of the time; never repeat the current word. */
export function pickWord(words: Word[], missed: string[], currentHanzi: string | null, rng: () => number = Math.random): Word {
  const missedWords = words.filter(w => missed.includes(w.hanzi) && w.hanzi !== currentHanzi)
  if (missedWords.length && rng() < 0.4) return missedWords[Math.floor(rng() * missedWords.length)]
  const pool = words.filter(w => w.hanzi !== currentHanzi)
  return pool[Math.floor(rng() * pool.length)]
}

export type Question = { type: Word['prompt']; text: string; options: string[] }
export function buildQuestion(word: Word, words: Word[], rng: () => number = Math.random): Question {
  const text = word.prompt === 'meaning' ? `What does ${word.hanzi} mean?`
    : word.prompt === 'pinyin' ? `Choose the correct pinyin for ${word.hanzi}`
      : `Which character means “${word.meaning}”?`
  const options = word.prompt === 'character'
    ? [word.hanzi, ...shuffle(words.filter(w => w.hanzi !== word.hanzi && w.meaning !== word.meaning), rng).slice(0, 3).map(w => w.hanzi)]
    : word.choices
  return { type: word.prompt, text, options: shuffle(options, rng) }
}
