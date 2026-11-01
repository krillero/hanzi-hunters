export type { Word } from './content/types.ts'

// Vocabulary lives in src/content/words.json (see docs/CONTENT_GUIDE.md). Its order does NOT matter:
// the teaching order is the curriculum in src/content/curricula.json (see docs/CURRICULUM.md and game/course.ts).
import wordsJson from './content/words.json' with { type: 'json' }
import curriculaJson from './content/curricula.json' with { type: 'json' }
import { normalizeWords } from './content/entries.ts'
import type { CurriculaFile, Curriculum, RawWord, Word } from './content/types.ts'
export const WORDS: Word[] = normalizeWords(wordsJson as unknown as RawWord[])

export const CURRICULA_FILE = curriculaJson as unknown as CurriculaFile
export const CURRICULA: Curriculum[] = Array.isArray(CURRICULA_FILE.curricula) ? CURRICULA_FILE.curricula : []
/** Used only when curricula.json is broken, so the game can show a configuration error instead of crashing. */
export const NO_CURRICULUM: Curriculum = { id: 'none', version: 1, title: 'No course configured', units: [] }
/** The curriculum the game teaches. Only one is selectable for now: the file's `default`. */
export const ACTIVE_CURRICULUM: Curriculum = CURRICULA.find(c => c.id === CURRICULA_FILE.default) ?? CURRICULA[0] ?? NO_CURRICULUM

export type BossId = 'golem' | 'wraith' | 'scribe' | 'trickster' | 'warden'
/** Enemies have HP (a correct answer damages it) but no attack: a wrong answer costs the player one heart, the same on every floor (rules.ts). */
export type Enemy = { name: string; sprite: 'slime' | 'imp' | 'bat' | 'golem' | 'wraith' | 'scribe' | 'trickster'; emoji: string; hp: number; xp: number; gold: number }
export type GearSlot = 'Weapon' | 'Armor' | 'Accessory'
/**
 * Gear effects are whole numbers or percentages of existing bonuses only:
 *  maxHearts     extra maximum hearts (total capped at MAX_HEARTS in rules.ts); equipping never fills the new heart
 *  hints         extra hints per fight
 * `name` is the item's identity in saves: never rename an item.
 */
export type GearItem = { name: string; slot: GearSlot; icon: string; bonus: string; attack: number; maxHearts: number; hints: number; xpPct: number; masteryPct: number; goldFlat: number
  /** Boss-only gear: never drops from normal fights, a boss kill guarantees it. */
  boss?: BossId }

export const ENEMIES: Enemy[] = [
  { name: 'Moss Slime', sprite: 'slime', emoji: '🟢', hp: 24, xp: 12, gold: 7 },
  { name: 'Ember Imp', sprite: 'imp', emoji: '👹', hp: 30, xp: 16, gold: 10 },
  { name: 'Cave Bat', sprite: 'bat', emoji: '🦇', hp: 21, xp: 10, gold: 6 }
]

export const GEAR: GearItem[] = [
  { name: 'Copper Blade', slot: 'Weapon', icon: '⚔️', bonus: '+2 attack', attack: 2, maxHearts: 0, hints: 0, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Moonlit Katana', slot: 'Weapon', icon: '🌙', bonus: '+1 attack · +10% mastery damage', attack: 1, maxHearts: 0, hints: 0, xpPct: 0, masteryPct: 0.1, goldFlat: 0 },
  { name: 'Mossy Vest', slot: 'Armor', icon: '🛡️', bonus: '+1 max heart', attack: 0, maxHearts: 1, hints: 0, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Windrunner Boots', slot: 'Armor', icon: '🥾', bonus: '+1 hint per fight', attack: 0, maxHearts: 0, hints: 1, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Guardian Helm', slot: 'Armor', icon: '⛑️', bonus: '+1 max heart · +1 hint per fight', attack: 0, maxHearts: 1, hints: 1, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Scholar Charm', slot: 'Accessory', icon: '🔮', bonus: '+10% learning XP', attack: 0, maxHearts: 0, hints: 0, xpPct: 0.1, masteryPct: 0, goldFlat: 0 },
  { name: 'Lucky Coin', slot: 'Accessory', icon: '🪙', bonus: '+3 gold per win', attack: 0, maxHearts: 0, hints: 0, xpPct: 0, masteryPct: 0, goldFlat: 3 },
  { name: 'Jade Pendant', slot: 'Accessory', icon: '🟢', bonus: '+10% mastery damage', attack: 0, maxHearts: 0, hints: 0, xpPct: 0, masteryPct: 0.1, goldFlat: 0 },
  // Boss-only gear (a boss kill drops its own item first)
  { name: 'Golem Plate', slot: 'Armor', icon: '🗿', bonus: '+1 max heart · +1 hint per fight', attack: 0, maxHearts: 1, hints: 1, xpPct: 0, masteryPct: 0, goldFlat: 0, boss: 'golem' },
  { name: 'Wraith Lantern', slot: 'Accessory', icon: '🏮', bonus: '+15% XP · +10% mastery damage', attack: 0, maxHearts: 0, hints: 0, xpPct: 0.15, masteryPct: 0.1, goldFlat: 0, boss: 'wraith' },
  { name: 'Scribe Brush', slot: 'Weapon', icon: '🖌️', bonus: '+3 attack', attack: 3, maxHearts: 0, hints: 0, xpPct: 0, masteryPct: 0, goldFlat: 0, boss: 'scribe' },
  { name: 'Trick Mantle', slot: 'Armor', icon: '🧥', bonus: '+1 max heart · +10% mastery damage', attack: 0, maxHearts: 1, hints: 0, xpPct: 0, masteryPct: 0.1, goldFlat: 0, boss: 'trickster' }
]

/** Every floor ends with a boss (they take turns, see BOSS_ORDER in rules.ts). Base stats are scaled in rules.ts (BOSS_*). */
export const BOSSES: Record<BossId, Enemy> = {
  golem: { name: 'Shield Golem', sprite: 'golem', emoji: '🗿', hp: 30, xp: 16, gold: 10 },
  wraith: { name: 'Echo Wraith', sprite: 'wraith', emoji: '👻', hp: 26, xp: 16, gold: 10 },
  scribe: { name: 'Ink Scribe', sprite: 'scribe', emoji: '🖋️', hp: 28, xp: 16, gold: 10 },
  trickster: { name: 'Mirror Trickster', sprite: 'trickster', emoji: '🎭', hp: 24, xp: 16, gold: 10 },
  // The final boss of every expedition (floor 5). Placeholder art: the Golem sprite with its own glow (PixelScene BOSS_GLOW).
  warden: { name: 'Cavern Warden', sprite: 'golem', emoji: '👑', hp: 30, xp: 24, gold: 16 }
}

export const BOSS_INFO: Record<BossId, { title: string; rule: string; phases: string[]; reward: string }> = {
  golem: {
    title: 'Shield Golem',
    rule: 'A shield of 3 segments protects the Golem and blocks all damage. Only a correct answer to a pinyin (tone) question breaks a segment. Wrong answers do not repair it.',
    phases: ['Break the shield with tone questions', 'Shield down: fight normally'],
    reward: 'Golem Plate (+1 max heart, +1 hint per fight)'
  },
  wraith: {
    title: 'Echo Wraith',
    rule: 'The Wraith fights normally at first. Once it drops below 60% HP it echoes: it keeps asking the kind of question you got wrong most recently.',
    phases: ['Normal fight', 'Below 60% HP: your weak spot comes back'],
    reward: 'Wraith Lantern (+15% XP, +10% mastery damage)'
  },
  scribe: {
    title: 'Ink Scribe',
    rule: 'Ink seals (2 on the first floors, then 3) protect the Scribe and block all damage. Only a correct answer to a character question (pick the right hanzi) breaks a seal. Wrong answers do not repair them.',
    phases: ['Break the seals with character questions', 'Seals down: fight normally'],
    reward: 'Scribe Brush (+3 attack)'
  },
  trickster: {
    title: 'Mirror Trickster',
    rule: 'The Trickster only asks look-alike and same-sound questions, the easy ones to mix up. A right answer hits it for +40% damage.',
    phases: ['Tricky questions: a right answer hits +40% harder'],
    reward: 'Trick Mantle (+1 max heart, +10% mastery damage)'
  },
  warden: {
    title: 'Cavern Warden',
    rule: 'The final boss of the expedition. Two tone wards, then two ink seals block all damage: answer tone (pinyin) questions, then character questions to break them. Then it echoes the kind of question you missed most recently. Beat it to win the expedition.',
    phases: ['Tone wards: answer tone questions', 'Ink seals: answer character questions', 'Echo: your weak spot comes back'],
    reward: 'The Warden Sigil, kept forever: it grows stronger with every depth you clear'
  }
}