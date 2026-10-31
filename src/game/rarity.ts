// Item rarity is cosmetic (colour, sound, reveal). It does not change drop odds or stats.
import type { GearItem } from '../data.ts'

export type Rarity = 'common' | 'rare' | 'epic'

/** Every gear item must be listed here (a test enforces it), so new gear forces a conscious rarity choice. */
export const RARITY_BY_NAME: Record<string, Rarity> = {
  'Copper Blade': 'common', 'Mossy Vest': 'common', 'Windrunner Boots': 'common', 'Lucky Coin': 'common',
  'Scholar Charm': 'rare', 'Jade Pendant': 'rare', 'Guardian Helm': 'rare',
  'Moonlit Katana': 'epic'
}

export const rarityOf = (item: Pick<GearItem, 'name'> | string): Rarity => RARITY_BY_NAME[typeof item === 'string' ? item : item.name] ?? 'common'
