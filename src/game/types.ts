export type MasteryEntry = { lv: number; ok: number }
/** Per-word mastery keyed by hanzi. A word with no entry has never been shown. */
export type Mastery = Record<string, MasteryEntry>

import type { Habit } from './habit.ts'

export type Meta = { gold: number; upgrades: string[]; bestFloor: number; runs: number }

import type { GearSlot } from '../data.ts'

export type RunPhase = 'fighting' | 'victory' | 'defeat'
export type Run = {
  floor: number; kill: number; kills: number
  level: number; xp: number; hp: number; enemyHp: number
  /** XP earned by answers in the current fight; paid out (with the monster's XP) only when it is killed. */
  pendingXp: number
  gold: number; potions: number; gear: string[]; loadout: Partial<Record<GearSlot, string>>; streak: number
  hintsLeft: number; secondLeft: number
  phase: RunPhase
  reward: { xp: number; gold: number; loot: string; levelUps: number }
}
export type RunSummary = { floor: number; kills: number; level: number; goldBanked: number }

export type Saved = {
  version: 2
  meta: Meta
  mastery: Mastery
  run: Run | null
  lastRun: RunSummary | null
  /** Days played, warm-up day, correct total, badges. Additive: old saves load with an empty habit; no version bump. */
  habit: Habit
}
