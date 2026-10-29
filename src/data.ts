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

export type Enemy = { name: string; sprite: 'slime' | 'imp' | 'bat'; emoji: string; hp: number; damage: number; xp: number; gold: number }
export type GearSlot = 'Weapon' | 'Armor' | 'Accessory'
export type GearItem = { name: string; slot: GearSlot; icon: string; bonus: string; attack: number; hp: number; armor: number; xpPct: number; masteryPct: number; goldFlat: number }

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
  { name: 'Jade Pendant', slot: 'Accessory', icon: '🟢', bonus: '+10% mastery damage', attack: 0, hp: 0, armor: 0, xpPct: 0, masteryPct: 0.1, goldFlat: 0 }
]