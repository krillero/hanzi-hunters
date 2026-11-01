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
  /** Shield Golem only: segments left on the boss's shield (0 = down, or not a golem fight). */
  shield: number
  gold: number; potions: number; gear: string[]; loadout: Partial<Record<GearSlot, string>>; streak: number
  hintsLeft: number; secondLeft: number
  phase: RunPhase
  reward: { xp: number; gold: number; loot: string; levelUps: number }
}
export type RunSummary = { floor: number; kills: number; level: number; goldBanked: number }

import type { CourseProgress, PeakLevels } from './course.ts'

export type Saved = {
  /** 3 = adds `courses`; 4 = adds `peak` / `legacyPeak`. Older saves are migrated on load (save.ts). */
  version: 4
  meta: Meta
  mastery: Mastery
  /** Progress under ids that no current entry claims (removed entries, or a hanzi that became ambiguous). Kept so nothing is lost; retried on every load. */
  legacyMastery: Mastery
  run: Run | null
  lastRun: RunSummary | null
  /** Days played, correct total, badges (and the unused warm-up day). Additive: old saves load with an empty habit; no version bump. */
  habit: Habit
  /** Per curriculum id: lesson ids completed at least once (sticky). Entry progress stays in `mastery`, shared by every curriculum. */
  courses: Record<string, CourseProgress>
  /** Highest mastery level each entry has ever reached (entry readiness history, by entry id). Never decreases. */
  peak: PeakLevels
  /** Peaks under ids no current entry claims; kept and retried on every load, like legacyMastery. */
  legacyPeak: PeakLevels
}
