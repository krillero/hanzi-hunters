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

// Order matters: the first words are introduced first (see mastery.ts).
export const WORDS: Word[] = [
  { hanzi: '人', pinyin: 'rén', meaning: 'person', group: 'people', note: 'Second tone: your voice rises, like asking a short question.' },
  { hanzi: '大', pinyin: 'dà', meaning: 'big', group: 'size', note: 'Fourth tone: let the pitch fall clearly.' },
  { hanzi: '小', pinyin: 'xiǎo', meaning: 'small', group: 'size', note: 'Third tone. The initial x is a light, tongue-forward sound.' },
  { hanzi: '一', pinyin: 'yī', meaning: 'one', group: 'number', alt: ['yí', 'yì'], note: 'First tone in isolation. 一 changes tone in many spoken contexts.' },
  { hanzi: '二', pinyin: 'èr', meaning: 'two', group: 'number', note: 'Fourth tone. Listen for the final r-colored vowel.' },
  { hanzi: '三', pinyin: 'sān', meaning: 'three', group: 'number', note: 'First tone: high and level.' },
  { hanzi: '日', pinyin: 'rì', meaning: 'sun / day', group: 'nature', note: 'The pinyin begins with an English “r”-like sound, but Mandarin r is pronounced farther back.' },
  { hanzi: '月', pinyin: 'yuè', meaning: 'moon / month', group: 'nature', note: 'Fourth tone. 月 can mean moon or month depending on context.' },
  { hanzi: '水', pinyin: 'shuǐ', meaning: 'water', group: 'nature', note: 'Third tone. The “sh” sound is made with the tongue curled slightly back.' },
  { hanzi: '火', pinyin: 'huǒ', meaning: 'fire', group: 'nature', note: 'Third tone. 火 means fire and powers your first spell.' },
  { hanzi: '山', pinyin: 'shān', meaning: 'mountain', group: 'nature', note: 'First tone: keep the pitch high and level.' },
  { hanzi: '木', pinyin: 'mù', meaning: 'wood / tree', group: 'nature', note: 'Fourth tone: a short, decisive falling pitch.' },
  { hanzi: '口', pinyin: 'kǒu', meaning: 'mouth', group: 'body', note: 'Third tone: it dips low before rising in careful, isolated pronunciation.' },
  { hanzi: '天', pinyin: 'tiān', meaning: 'sky / day', group: 'nature', note: 'First tone: high and level.' },
  { hanzi: '好', pinyin: 'hǎo', meaning: 'good', group: 'grammar', note: 'Third tone. You will meet 好 in useful words such as 你好 (hello).' },
  { hanzi: '我', pinyin: 'wǒ', meaning: 'I / me', group: 'people', note: 'Third tone. 我 is one of the most useful beginner characters.' },
  { hanzi: '你', pinyin: 'nǐ', meaning: 'you', group: 'people', note: 'Third tone. 你好 (nǐ hǎo) is a common greeting.' },
  { hanzi: '他', pinyin: 'tā', meaning: 'he / him', group: 'people', note: 'First tone. In speech, 他 and 她 are both tā.' },
  { hanzi: '她', pinyin: 'tā', meaning: 'she / her', group: 'people', note: 'First tone. 他 and 她 sound the same but are written differently.' },
  { hanzi: '女', pinyin: 'nǚ', meaning: 'woman / female', group: 'people', note: 'The ü vowel is made with rounded lips and the tongue positioned like “ee”.' },
  { hanzi: '子', pinyin: 'zǐ', meaning: 'child', group: 'people', note: 'Third tone. 子 appears in many common words.' },
  { hanzi: '中', pinyin: 'zhōng', meaning: 'middle / China', group: 'place', confusable: ['国'], note: 'First tone. 中国 (Zhōngguó) is the Chinese name for China.' },
  { hanzi: '国', pinyin: 'guó', meaning: 'country', group: 'place', confusable: ['中'], note: 'Second tone rises. 中国 means China.' },
  { hanzi: '是', pinyin: 'shì', meaning: 'to be / yes', group: 'grammar', note: 'Fourth tone. 是 is common in simple statements.' },
  { hanzi: '不', pinyin: 'bù', meaning: 'not / no', group: 'grammar', alt: ['bú'], note: 'Normally fourth tone, but it often changes to bú before another fourth-tone syllable.' },
  { hanzi: '四', pinyin: 'sì', meaning: 'four', group: 'number', note: 'Fourth tone. The initial s is unvoiced.' },
  { hanzi: '五', pinyin: 'wǔ', meaning: 'five', group: 'number', note: 'Third tone.' },
  { hanzi: '六', pinyin: 'liù', meaning: 'six', group: 'number', note: 'Fourth tone. The vowel glides into the final u.' },
  { hanzi: '八', pinyin: 'bā', meaning: 'eight', group: 'number', note: 'First tone. 八 means eight.' },
  { hanzi: '十', pinyin: 'shí', meaning: 'ten', group: 'number', note: 'Second tone. 十 means ten.' }
]

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