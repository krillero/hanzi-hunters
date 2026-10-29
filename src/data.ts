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
}

// Vocabulary lives in src/content/words.json (see docs/CONTENT_GUIDE.md).
// Order matters: the first words are introduced first (see mastery.ts).
import wordsJson from './content/words.json' with { type: 'json' }
export const WORDS: Word[] = wordsJson as Word[]

export type Enemy = { name: string; sprite: 'slime' | 'imp' | 'bat'; emoji: string; hp: number; damage: number; xp: number; gold: number }
export type GearItem = { name: string; slot: string; icon: string; bonus: string; attack: number; hp: number }

export const ENEMIES: Enemy[] = [
  { name: 'Moss Slime', sprite: 'slime', emoji: '🟢', hp: 24, damage: 5, xp: 12, gold: 7 },
  { name: 'Ember Imp', sprite: 'imp', emoji: '👹', hp: 30, damage: 6, xp: 16, gold: 10 },
  { name: 'Cave Bat', sprite: 'bat', emoji: '🦇', hp: 21, damage: 4, xp: 10, gold: 6 }
]

export const GEAR: GearItem[] = [
  { name: 'Copper Blade', slot: 'Weapon', icon: '⚔️', bonus: '+2 attack', attack: 2, hp: 0 },
  { name: 'Scholar Charm', slot: 'Charm', icon: '🔮', bonus: '+10% learning XP', attack: 0, hp: 0 },
  { name: 'Mossy Vest', slot: 'Armor', icon: '🛡️', bonus: '+8 max HP', attack: 0, hp: 8 },
  { name: 'Lucky Coin', slot: 'Charm', icon: '🪙', bonus: '+3 gold per win', attack: 0, hp: 0 }
]