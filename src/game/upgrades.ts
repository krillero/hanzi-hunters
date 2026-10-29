// Permanent upgrade tree bought with banked gold between runs. Pure; no DOM.
import type { Meta } from './types.ts'

export type Bonuses = {
  attack: number; maxHp: number; startPotions: number; potionHeal: number; armor: number; healOnKill: number
  goldPct: number; xpPct: number; lootPct: number; hints: number; secondChance: number
  streakDmgPct: number; executeDmgPct: number; masteryDmgPct: number; startGear: string[]
}
export const NO_BONUSES: Bonuses = {
  attack: 0, maxHp: 0, startPotions: 0, potionHeal: 0, armor: 0, healOnKill: 0, goldPct: 0, xpPct: 0, lootPct: 0,
  hints: 0, secondChance: 0, streakDmgPct: 0, executeDmgPct: 0, masteryDmgPct: 0, startGear: []
}

export type UpgradeNode = { id: string; branch: string; tier: number; name: string; icon: string; desc: string; fx: Partial<Bonuses> }
export type Branch = { id: string; name: string; tagline: string; icon: string }

export const BRANCHES: Branch[] = [
  { id: 'W', name: 'Blade', tagline: 'Hit harder, finish faster', icon: '⚔️' },
  { id: 'G', name: 'Aegis', tagline: 'Outlast every fight', icon: '🛡️' },
  { id: 'S', name: 'Lore', tagline: 'Turn study into power', icon: '📖' },
  { id: 'F', name: 'Fortune', tagline: 'More gold, better loot', icon: '🪙' }
]

export const UPGRADES: UpgradeNode[] = [
  { id: 'W1', branch: 'W', tier: 1, name: 'Sharpened Blade', icon: '🗡️', desc: '+2 attack', fx: { attack: 2 } },
  { id: 'W2', branch: 'W', tier: 2, name: 'Combo Strikes', icon: '🔥', desc: '+25% damage on the 3rd correct answer in a row', fx: { streakDmgPct: 0.25 } },
  { id: 'W3', branch: 'W', tier: 3, name: 'Heavy Hands', icon: '💪', desc: '+3 attack', fx: { attack: 3 } },
  { id: 'W4', branch: 'W', tier: 4, name: 'Executioner', icon: '💀', desc: '+35% damage to enemies under 35% HP', fx: { executeDmgPct: 0.35 } },
  { id: 'W5', branch: 'W', tier: 5, name: 'Dragon Fang', icon: '🐉', desc: '+4 attack and +35% more combo damage', fx: { attack: 4, streakDmgPct: 0.35 } },

  { id: 'G1', branch: 'G', tier: 1, name: 'Tough Skin', icon: '🧱', desc: '+8 max HP', fx: { maxHp: 8 } },
  { id: 'G2', branch: 'G', tier: 2, name: 'Spare Vial', icon: '🧪', desc: 'Start each run with +1 potion', fx: { startPotions: 1 } },
  { id: 'G3', branch: 'G', tier: 3, name: 'Iron Will', icon: '⛓️', desc: 'Enemy hits do 2 less damage', fx: { armor: 2 } },
  { id: 'G4', branch: 'G', tier: 4, name: 'Second Wind', icon: '💨', desc: 'Heal 5 HP after every victory', fx: { healOnKill: 5 } },
  { id: 'G5', branch: 'G', tier: 5, name: 'Titan Heart', icon: '❤️', desc: '+15 max HP and potions heal 8 more', fx: { maxHp: 15, potionHeal: 8 } },

  { id: 'S1', branch: 'S', tier: 1, name: 'Eagle Eye', icon: '💡', desc: '1 hint per fight: removes a wrong answer', fx: { hints: 1 } },
  { id: 'S2', branch: 'S', tier: 2, name: 'Quick Study', icon: '✨', desc: '+15% XP', fx: { xpPct: 0.15 } },
  { id: 'S3', branch: 'S', tier: 3, name: 'Second Chance', icon: '🔁', desc: 'Once per fight, a wrong answer is not countered', fx: { secondChance: 1 } },
  { id: 'S4', branch: 'S', tier: 4, name: 'Deep Study', icon: '🧠', desc: '+15% damage bonus from word mastery', fx: { masteryDmgPct: 0.15 } },
  { id: 'S5', branch: 'S', tier: 5, name: 'Sage', icon: '🎓', desc: '+1 hint, +1 second chance, +15% XP', fx: { hints: 1, secondChance: 1, xpPct: 0.15 } },

  { id: 'F1', branch: 'F', tier: 1, name: 'Pickpocket', icon: '👛', desc: '+20% gold', fx: { goldPct: 0.2 } },
  { id: 'F2', branch: 'F', tier: 2, name: 'Treasure Sense', icon: '🧭', desc: '+15% loot drop chance', fx: { lootPct: 0.15 } },
  { id: 'F3', branch: 'F', tier: 3, name: 'Packed Light', icon: '🎒', desc: 'Start each run with a Copper Blade', fx: { startGear: ['Copper Blade'] } },
  { id: 'F4', branch: 'F', tier: 4, name: 'Midas Touch', icon: '👑', desc: '+30% gold', fx: { goldPct: 0.3 } },
  { id: 'F5', branch: 'F', tier: 5, name: 'Dragon Hoard', icon: '💎', desc: 'Start with a Mossy Vest and +20% loot chance', fx: { startGear: ['Mossy Vest'], lootPct: 0.2 } }
]

export const COST_BASE = 25
/** Triangular cost curve: 25, 75, 150, 250, 375 for tiers 1-5. */
export const upgradeCost = (tier: number) => (COST_BASE * tier * (tier + 1)) / 2
export const nodeById = (id: string) => UPGRADES.find(u => u.id === id)
export const branchNodes = (branch: string) => UPGRADES.filter(u => u.branch === branch).sort((a, b) => a.tier - b.tier)

export type NodeState = 'owned' | 'available' | 'locked'
export function nodeState(upgrades: string[], node: UpgradeNode): NodeState {
  if (upgrades.includes(node.id)) return 'owned'
  const prev = branchNodes(node.branch).find(n => n.tier === node.tier - 1)
  return !prev || upgrades.includes(prev.id) ? 'available' : 'locked'
}

export function buyUpgrade(meta: Meta, id: string): Meta | null {
  const node = nodeById(id)
  if (!node || nodeState(meta.upgrades, node) !== 'available' || meta.gold < upgradeCost(node.tier)) return null
  return { ...meta, gold: meta.gold - upgradeCost(node.tier), upgrades: [...meta.upgrades, id] }
}

export function computeBonuses(upgrades: string[]): Bonuses {
  const b: Bonuses = { ...NO_BONUSES, startGear: [] }
  const nums = b as unknown as Record<string, number>
  for (const id of upgrades) {
    const fx = nodeById(id)?.fx
    if (!fx) continue
    for (const [k, v] of Object.entries(fx)) {
      if (k === 'startGear') b.startGear = [...new Set([...b.startGear, ...(v as string[])])]
      else nums[k] = (nums[k] ?? 0) + (v as number)
    }
  }
  return b
}
