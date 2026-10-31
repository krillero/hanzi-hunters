export type Word = {
  hanzi: string
  pinyin: string
  meaning: string
  /** Used to pick plausible distractors from the same family. */
  group: string
  note: string
  /** Other valid readings in context (tone change); never offered as a wrong pinyin option. */
  alt?: string[]
  /** Hanzi whose meaning is too close to be a fair wrong answer. */
  confusable?: string[]
  /** Hanzi that LOOK similar (used for look-alike discrimination questions). Symmetry is applied in code. */
  lookalike?: string[]
}

// Vocabulary lives in src/content/words.json (see docs/CONTENT_GUIDE.md).
// Order matters: the first words are introduced first (see mastery.ts).
import wordsJson from './content/words.json' with { type: 'json' }
export const WORDS: Word[] = wordsJson as Word[]

export type BossId = 'golem' | 'wraith' | 'scribe' | 'trickster'
export type Enemy = { name: string; sprite: 'slime' | 'imp' | 'bat' | 'golem' | 'wraith' | 'scribe' | 'trickster'; emoji: string; hp: number; damage: number; xp: number; gold: number }
export type GearSlot = 'Weapon' | 'Armor' | 'Accessory'
export type GearItem = { name: string; slot: GearSlot; icon: string; bonus: string; attack: number; hp: number; armor: number; xpPct: number; masteryPct: number; goldFlat: number
  /** Boss-only gear: never drops from normal fights, a boss kill guarantees it. */
  boss?: BossId }

export const ENEMIES: Enemy[] = [
  { name: 'Moss Slime', sprite: 'slime', emoji: '🟢', hp: 24, damage: 5, xp: 12, gold: 7 },
  { name: 'Ember Imp', sprite: 'imp', emoji: '👹', hp: 30, damage: 6, xp: 16, gold: 10 },
  { name: 'Cave Bat', sprite: 'bat', emoji: '🦇', hp: 21, damage: 4, xp: 10, gold: 6 }
]

export const GEAR: GearItem[] = [
  { name: 'Copper Blade', slot: 'Weapon', icon: '⚔️', bonus: '+2 attack', attack: 2, hp: 0, armor: 0, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Moonlit Katana', slot: 'Weapon', icon: '🌙', bonus: '+1 attack · +10% mastery damage', attack: 1, hp: 0, armor: 0, xpPct: 0, masteryPct: 0.1, goldFlat: 0 },
  { name: 'Mossy Vest', slot: 'Armor', icon: '🛡️', bonus: '+8 max HP', attack: 0, hp: 8, armor: 0, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Windrunner Boots', slot: 'Armor', icon: '🥾', bonus: '+1 armor', attack: 0, hp: 0, armor: 1, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Guardian Helm', slot: 'Armor', icon: '⛑️', bonus: '+4 max HP · +1 armor', attack: 0, hp: 4, armor: 1, xpPct: 0, masteryPct: 0, goldFlat: 0 },
  { name: 'Scholar Charm', slot: 'Accessory', icon: '🔮', bonus: '+10% learning XP', attack: 0, hp: 0, armor: 0, xpPct: 0.1, masteryPct: 0, goldFlat: 0 },
  { name: 'Lucky Coin', slot: 'Accessory', icon: '🪙', bonus: '+3 gold per win', attack: 0, hp: 0, armor: 0, xpPct: 0, masteryPct: 0, goldFlat: 3 },
  { name: 'Jade Pendant', slot: 'Accessory', icon: '🟢', bonus: '+10% mastery damage', attack: 0, hp: 0, armor: 0, xpPct: 0, masteryPct: 0.1, goldFlat: 0 },
  // Boss-only gear (a boss kill drops its own item first)
  { name: 'Golem Plate', slot: 'Armor', icon: '🗿', bonus: '+12 max HP · +1 armor', attack: 0, hp: 12, armor: 1, xpPct: 0, masteryPct: 0, goldFlat: 0, boss: 'golem' },
  { name: 'Wraith Lantern', slot: 'Accessory', icon: '🏮', bonus: '+15% XP · +10% mastery damage', attack: 0, hp: 0, armor: 0, xpPct: 0.15, masteryPct: 0.1, goldFlat: 0, boss: 'wraith' },
  { name: 'Scribe Brush', slot: 'Weapon', icon: '🖌️', bonus: '+3 attack', attack: 3, hp: 0, armor: 0, xpPct: 0, masteryPct: 0, goldFlat: 0, boss: 'scribe' },
  { name: 'Trick Mantle', slot: 'Armor', icon: '🧥', bonus: '+6 max HP · +2 armor', attack: 0, hp: 6, armor: 2, xpPct: 0, masteryPct: 0, goldFlat: 0, boss: 'trickster' }
]

/** Every floor ends with a boss (they take turns, see BOSS_ORDER in rules.ts). Base stats are scaled in rules.ts (BOSS_*). */
export const BOSSES: Record<BossId, Enemy> = {
  golem: { name: 'Shield Golem', sprite: 'golem', emoji: '🗿', hp: 30, damage: 6, xp: 16, gold: 10 },
  wraith: { name: 'Echo Wraith', sprite: 'wraith', emoji: '👻', hp: 26, damage: 6, xp: 16, gold: 10 },
  scribe: { name: 'Ink Scribe', sprite: 'scribe', emoji: '🖋️', hp: 28, damage: 6, xp: 16, gold: 10 },
  trickster: { name: 'Mirror Trickster', sprite: 'trickster', emoji: '🎭', hp: 24, damage: 6, xp: 16, gold: 10 }
}

export const BOSS_INFO: Record<BossId, { title: string; rule: string; phases: string[]; reward: string }> = {
  golem: {
    title: 'Shield Golem',
    rule: 'A shield of 3 segments protects the Golem and blocks all damage. Only a correct answer to a pinyin (tone) question breaks a segment. Wrong answers do not repair it.',
    phases: ['Break the shield with tone questions', 'Shield down: fight normally'],
    reward: 'Golem Plate (+12 max HP, +1 armor)'
  },
  wraith: {
    title: 'Echo Wraith',
    rule: 'The Wraith fights normally at first. Once it drops below 60% HP it echoes: it keeps asking the kind of question you got wrong most recently.',
    phases: ['Normal fight', 'Below 60% HP: your weak spot comes back'],
    reward: 'Wraith Lantern (+15% XP, +10% mastery damage)'
  },
  scribe: {
    title: 'Ink Scribe',
    rule: 'Ink seals (2 on the first floors, then 3) protect the Scribe and block all damage. Only a correct answer to a character question (pick the right hanzi) breaks a seal. When the seals are down, a wrong answer makes one seal grow back.',
    phases: ['Break the seals with character questions', 'Seals down: fight, but do not miss or a seal regrows'],
    reward: 'Scribe Brush (+3 attack)'
  },
  trickster: {
    title: 'Mirror Trickster',
    rule: 'The Trickster only asks look-alike and same-sound questions, the easy ones to mix up. A right answer hits it for +40% damage. A wrong answer deals nothing and it heals 8% of its HP (16% once it is below half).',
    phases: ['Tricky questions: right = +40% damage, wrong = it heals', 'Below 50% HP: a wrong answer heals it twice as much'],
    reward: 'Trick Mantle (+6 max HP, +2 armor)'
  }
}