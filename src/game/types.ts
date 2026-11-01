export type MasteryEntry = { lv: number; ok: number }
/** Per-word mastery keyed by hanzi. A word with no entry has never been shown. */
export type Mastery = Record<string, MasteryEntry>

import type { Habit } from './habit.ts'

/** `wins`: expeditions won (final boss beaten); `depthCleared`: the deepest depth won (0 = none), which unlocks the next. */
export type Meta = { gold: number; upgrades: string[]; bestFloor: number; runs: number; wins: number; depthCleared: number }

import type { GearSlot } from '../data.ts'

export type RunPhase = 'fighting' | 'victory' | 'defeat'
export type Run = {
  /** The optional contextual encounter offered after a floor boss (at most one per expedition; kept as 'closed' once left). */
  encounter?: import('./encounters').EncounterState
  /** The boss trial of the current fight (Golem's Tone Trial; once per fight, never changes mastery). See game/trials.ts. */
  trial?: import('./trials').TrialState
  /** Echo Wraith calmed by its trial: the next wrong answer this expedition costs no heart (0 or 1; kept until used). */
  calm?: number
  /** Warden Sigil level for this expedition (depths cleared when it started; see rules.sigilBonus). Old saves: 0. */
  sigil?: number
  /** The expedition's depth (1..MAX_DEPTH): harder question mix, more gold, tougher final boss. */
  depth: number
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
  /** Second-chance charges left in this expedition: set when it starts, never refilled (not per floor, enemy, reload or gear swap). */
  secondLeft: number
  /** The last floor whose clear restored hearts (so the floor recovery is applied exactly once, also across reloads). */
  recoveredFloor: number
  phase: RunPhase
  /** What the last kill gave; `hearts` = hearts restored by clearing the floor (shown in the floor summary). */
  reward: { xp: number; gold: number; loot: string; levelUps: number; hearts: number }
}
/** How the expedition ended: `won` (final boss beaten), `defeat` (out of hearts) or `returned` ("Return to camp"). */
/** `goldBanked` includes the victory `bonus`; `unlocked`: the depth this win unlocked (0 = none). */
export type RunSummary = { floor: number; kills: number; level: number; goldBanked: number; bonus: number; result: 'won' | 'defeat' | 'returned'; depth: number; unlocked: number }

import type { CourseProgress, PeakLevels } from './course.ts'

export type Saved = {
  /** Save format version under SAVE_KEY. Restarted at 1 with expeditions; earlier formats (other keys) are not read. */
  version: 1
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
   * (no heart lost) battle question: its first question after the introduction.
   */
  practiced: string[]
  /** Local dates (YYYY-MM-DD, up to 30) on which each contextual encounter was completed; drives its support stage. */
  encounterHistory?: import('./encounters').History
  /** The last encounters and boss trials shown ("scene:<id>" / "trial:<id>", newest first): offers skip them while they can. */
  recentEvents?: string[]
}
