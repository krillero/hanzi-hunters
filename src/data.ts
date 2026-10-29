export type Word = {
  hanzi: string
  pinyin: string
  meaning: string
  prompt: 'meaning' | 'pinyin' | 'character'
  choices: string[]
  answer: string
  note: string
}

export const WORDS: Word[] = [
  { hanzi: '人', pinyin: 'rén', meaning: 'person', prompt: 'meaning', choices: ['person', 'water', 'fire', 'mountain'], answer: 'person', note: 'Second tone: your voice rises, like asking a short question.' },
  { hanzi: '口', pinyin: 'kǒu', meaning: 'mouth', prompt: 'pinyin', choices: ['kōu', 'kǒu', 'kòu', 'kóu'], answer: 'kǒu', note: 'Third tone: it dips low before rising in careful, isolated pronunciation.' },
  { hanzi: '日', pinyin: 'rì', meaning: 'sun / day', prompt: 'meaning', choices: ['moon', 'sun / day', 'person', 'mouth'], answer: 'sun / day', note: 'The pinyin begins with an English “r”-like sound, but Mandarin r is pronounced farther back.' },
  { hanzi: '山', pinyin: 'shān', meaning: 'mountain', prompt: 'pinyin', choices: ['shǎn', 'shàn', 'shān', 'shán'], answer: 'shān', note: 'First tone: keep the pitch high and level.' },
  { hanzi: '水', pinyin: 'shuǐ', meaning: 'water', prompt: 'meaning', choices: ['fire', 'wood', 'water', 'earth'], answer: 'water', note: 'Third tone. The “sh” sound is made with the tongue curled slightly back.' },
  { hanzi: '火', pinyin: 'huǒ', meaning: 'fire', prompt: 'pinyin', choices: ['huō', 'huǒ', 'huó', 'huò'], answer: 'huǒ', note: 'Third tone. 火 means fire and powers your first spell.' },
  { hanzi: '木', pinyin: 'mù', meaning: 'wood / tree', prompt: 'meaning', choices: ['wood / tree', 'mouth', 'sun / day', 'person'], answer: 'wood / tree', note: 'Fourth tone: a short, decisive falling pitch.' },
  { hanzi: '月', pinyin: 'yuè', meaning: 'moon / month', prompt: 'pinyin', choices: ['yuē', 'yuě', 'yuè', 'yúe'], answer: 'yuè', note: 'Fourth tone. 月 can mean moon or month depending on context.' },
  { hanzi: '大', pinyin: 'dà', meaning: 'big', prompt: 'meaning', choices: ['small', 'big', 'water', 'mountain'], answer: 'big', note: 'Fourth tone: let the pitch fall clearly.' },
  { hanzi: '小', pinyin: 'xiǎo', meaning: 'small', prompt: 'pinyin', choices: ['xiāo', 'xiáo', 'xiǎo', 'xiào'], answer: 'xiǎo', note: 'Third tone. The initial x is a light, tongue-forward sound.' },
  { hanzi: '天', pinyin: 'tiān', meaning: 'sky / day', prompt: 'meaning', choices: ['sky / day', 'fire', 'wood', 'mouth'], answer: 'sky / day', note: 'First tone: high and level.' },
  { hanzi: '好', pinyin: 'hǎo', meaning: 'good', prompt: 'pinyin', choices: ['hāo', 'hǎo', 'hào', 'háo'], answer: 'hǎo', note: 'Third tone. You will meet 好 in useful words such as 你好 (hello).' },
  { hanzi: '女', pinyin: 'nǚ', meaning: 'woman / female', prompt: 'meaning', choices: ['man', 'woman / female', 'sun / day', 'mountain'], answer: 'woman / female', note: 'The ü vowel is made with rounded lips and the tongue positioned like “ee”.' },
  { hanzi: '子', pinyin: 'zǐ', meaning: 'child', prompt: 'pinyin', choices: ['zī', 'zǐ', 'zì', 'zí'], answer: 'zǐ', note: 'Third tone. 子 appears in many common words.' },
  { hanzi: '中', pinyin: 'zhōng', meaning: 'middle / China', prompt: 'meaning', choices: ['middle / China', 'water', 'small', 'person'], answer: 'middle / China', note: 'First tone. 中国 (Zhōngguó) is the Chinese name for China.' },
  { hanzi: '国', pinyin: 'guó', meaning: 'country', prompt: 'pinyin', choices: ['guō', 'guó', 'guǒ', 'guò'], answer: 'guó', note: 'Second tone rises. 中国 means China.' },
  { hanzi: '我', pinyin: 'wǒ', meaning: 'I / me', prompt: 'meaning', choices: ['you', 'I / me', 'he / him', 'person'], answer: 'I / me', note: 'Third tone. 我 is one of the most useful beginner characters.' },
  { hanzi: '你', pinyin: 'nǐ', meaning: 'you', prompt: 'pinyin', choices: ['nī', 'ní', 'nǐ', 'nì'], answer: 'nǐ', note: 'Third tone. 你好 (nǐ hǎo) is a common greeting.' },
  { hanzi: '他', pinyin: 'tā', meaning: 'he / him', prompt: 'meaning', choices: ['she / her', 'he / him', 'I / me', 'you'], answer: 'he / him', note: 'First tone. In speech, 他 and 她 are both tā.' },
  { hanzi: '她', pinyin: 'tā', meaning: 'she / her', prompt: 'meaning', choices: ['she / her', 'he / him', 'country', 'child'], answer: 'she / her', note: 'First tone. 他 and 她 sound the same but are written differently.' },
  { hanzi: '是', pinyin: 'shì', meaning: 'to be / yes', prompt: 'pinyin', choices: ['shī', 'shí', 'shǐ', 'shì'], answer: 'shì', note: 'Fourth tone. 是 is common in simple statements.' },
  { hanzi: '不', pinyin: 'bù', meaning: 'not / no', prompt: 'meaning', choices: ['yes', 'not / no', 'good', 'big'], answer: 'not / no', note: 'Normally fourth tone, but it often changes to bú before another fourth-tone syllable.' },
  { hanzi: '一', pinyin: 'yī', meaning: 'one', prompt: 'pinyin', choices: ['yī', 'yí', 'yǐ', 'yì'], answer: 'yī', note: 'First tone in isolation. 一 changes tone in many spoken contexts.' },
  { hanzi: '二', pinyin: 'èr', meaning: 'two', prompt: 'meaning', choices: ['one', 'two', 'three', 'ten'], answer: 'two', note: 'Fourth tone. Listen for the final r-colored vowel.' },
  { hanzi: '三', pinyin: 'sān', meaning: 'three', prompt: 'pinyin', choices: ['sǎn', 'sàn', 'sān', 'sán'], answer: 'sān', note: 'First tone: high and level.' },
  { hanzi: '四', pinyin: 'sì', meaning: 'four', prompt: 'meaning', choices: ['three', 'four', 'five', 'six'], answer: 'four', note: 'Fourth tone. The initial s is unvoiced.' },
  { hanzi: '五', pinyin: 'wǔ', meaning: 'five', prompt: 'pinyin', choices: ['wū', 'wú', 'wǔ', 'wù'], answer: 'wǔ', note: 'Third tone.' },
  { hanzi: '六', pinyin: 'liù', meaning: 'six', prompt: 'meaning', choices: ['four', 'five', 'six', 'seven'], answer: 'six', note: 'Fourth tone. The vowel glides into the final u.' },
  { hanzi: '八', pinyin: 'bā', meaning: 'eight', prompt: 'pinyin', choices: ['bǎ', 'bà', 'bā', 'bá'], answer: 'bā', note: 'First tone. 八 means eight.' },
  { hanzi: '十', pinyin: 'shí', meaning: 'ten', prompt: 'meaning', choices: ['one', 'seven', 'ten', 'eight'], answer: 'ten', note: 'Second tone. 十 means ten.' }
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