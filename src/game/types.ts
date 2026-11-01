export type MasteryEntry = { lv: number; ok: number }
/** Per-word mastery keyed by hanzi. A word with no entry has never been shown. */
export type Mastery = Record<string, MasteryEntry>

import type { Habit } from './habit.ts'

export type Meta = { gold: number; upgrades: string[]; bestFloor: number; runs: number }

import type { GearSlot } from '../data.ts'

export type RunPhase = 'fighting' | 'victory' | 'defeat'
export type Run = {
  floor: number; kill: number; kills: number
  level: number; xp: number
  /** The player's hearts: the only player-health value. Whole numbers, 0..maxHearts (rules.ts playerStats). 0 = the run is lost. */
  hearts: number
  /** The current enemy's HP (enemies keep HP; only the player has hearts). */
  enemyHp: number
  /** XP earned by answers in the current fight; paid out (with the monster's XP) only when it is killed. */
  pendingXp: number
  /** Shield Golem only: segments left on the boss's shield (0 = down, or not a golem fight). */
  shield: number
  gold: number; potions: number; gear: string[]; loadout: Partial<Record<GearSlot, string>>; streak: number
  /** Hints left in this fight (refilled per fight). */
  hintsLeft: number
  /** Second-chance charges left on this floor: refilled only on entering a floor (never per enemy, reload or gear swap). */
  secondLeft: number
  /** The last floor whose clear restored hearts (so the floor recovery is applied exactly once, also across reloads). */
  recoveredFloor: number
  phase: RunPhase
  /** What the last kill gave; `hearts` = hearts restored by clearing the floor (shown in the floor summary). */
  reward: { xp: number; gold: number; loot: string; levelUps: number; hearts: number }
}
/** `returned`: the run ended with "Return to camp" (not a defeat). */
export type RunSummary = { floor: number; kills: number; level: number; goldBanked: number; returned: boolean }

import type { CourseProgress, PeakLevels } from './course.ts'

export type Saved = {
  /** 3 = adds `courses`; 4 = adds `peak` / `legacyPeak`; 5 = hearts (run.hearts, secondLeft per floor, recoveredFloor) and `practiced`. Older saves are migrated on load (save.ts). */
  version: 5
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
  /**
   * Entry ids whose protected first practice has been used (v5). An introduced entry NOT in this list gets one protected
   * (no heart lost) battle question: its first question after the introduction. Migrated saves mark every entry they already
   * know as practiced, so old words do not all get fresh protection.
   */
  practiced: string[]
}
