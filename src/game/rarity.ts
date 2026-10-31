// Item rarity is cosmetic (colour, sound, reveal). It does not change drop odds or stats.
import type { GearItem } from '../data.ts'

export type Rarity = 'common' | 'rare' | 'epic'

/** Every gear item must be listed here (a test enforces it), so new gear forces a conscious rarity choice. */
export const RARITY_BY_NAME: Record<string, Rarity> = {
  'Copper Blade': 'common', 'Mossy Vest': 'common', 'Windrunner Boots': 'common', 'Lucky Coin': 'common',
  'Scholar Charm': 'rare', 'Jade Pendant': 'rare', 'Guardian Helm': 'rare',
  'Moonlit Katana': 'epic',
  'Golem Plate': 'epic', 'Wraith Lantern': 'epic', 'Scribe Brush': 'epic', 'Trick Mantle': 'epic'   // boss-only gear
}

export const rarityOf = (item: Pick<GearItem, 'name'> | string): Rarity => RARITY_BY_NAME[typeof item === 'string' ? item : item.name] ?? 'common'

// ---- comparing two items (for the loot reveal) -------------------------------------------------
export type StatRow = { label: string; now: number; next: number; delta: number; fmt: 'num' | 'pct' }
const STATS: { key: 'attack' | 'hp' | 'armor' | 'xpPct' | 'masteryPct' | 'goldFlat'; label: string; fmt: 'num' | 'pct' }[] = [
  { key: 'attack', label: 'Attack', fmt: 'num' }, { key: 'hp', label: 'Max HP', fmt: 'num' }, { key: 'armor', label: 'Armor', fmt: 'num' },
  { key: 'xpPct', label: 'XP', fmt: 'pct' }, { key: 'masteryPct', label: 'Mastery damage', fmt: 'pct' }, { key: 'goldFlat', label: 'Gold per win', fmt: 'num' }
]
/** One rough number for "is this better?". Only used to decide whether to offer "Equip now" and to show an arrow; never in the rules. */
export const gearScore = (g: Pick<GearItem, 'attack' | 'hp' | 'armor' | 'xpPct' | 'masteryPct' | 'goldFlat'>) =>
  g.attack * 3 + g.hp * 0.5 + g.armor * 3 + g.xpPct * 30 + g.masteryPct * 30 + g.goldFlat
/** Rows for every stat that either item has, new item against the one in the slot (null = empty slot). */
export function compareGear(next: GearItem, now: GearItem | null | undefined): StatRow[] {
  return STATS.map(s => ({ label: s.label, fmt: s.fmt, now: now ? now[s.key] : 0, next: next[s.key], delta: next[s.key] - (now ? now[s.key] : 0) }))
    .filter(r => r.now !== 0 || r.next !== 0)
}
export const isUpgrade = (next: GearItem, now: GearItem | null | undefined) => !now || gearScore(next) > gearScore(now)
