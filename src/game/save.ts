// Save format v1 under SAVE_KEY (restarted with expeditions). Saves from before (other keys) are deleted on start and never read. Never throws.
import { sanitizeHabit } from './habit.ts'
import { CURRICULA, ENEMIES, GEAR, WORDS, type GearSlot, type Word } from '../data.ts'
import type { Curriculum } from '../content/types.ts'
import type { Mastery, Meta, Run, RunSummary, Saved } from './types.ts'
import { emptyCourse, recordPeaks, syncCourse, wordMap, type CourseProgress, type PeakLevels } from './course.ts'
import { UPGRADES, computeBonuses, nodeState, type UpgradeNode } from './upgrades.ts'
import { ENEMIES_PER_FLOOR, EXPEDITION_FLOORS, bossIdFor, enemyStats, hasShield, isBoss, playerStats, shieldFor } from './rules.ts'
import { MAX_LV } from './mastery.ts'

export const SAVE_KEY = 'hanzi-hunters-save'
export const SAVE_VERSION = 1
/** Storage keys of the saves used before expeditions: cleared once (clearOldSaves) and never read. */
export const OLD_SAVE_KEYS = ['hanzi-hunters-save-v1', 'hanzi-hunters-save-v2']

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback
const strs = (v: unknown, allowed: string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)))] : []

export const emptyMeta = (): Meta => ({ gold: 0, upgrades: [], bestFloor: 1, runs: 0, wins: 0 })

/** Keep only upgrades whose previous tier is also owned. */
function validUpgrades(raw: unknown): string[] {
  const wanted = strs(raw, UPGRADES.map(u => u.id))
  const out: string[] = []
  for (const n of [...UPGRADES].sort((a, b) => a.tier - b.tier) as UpgradeNode[]) {
    if (wanted.includes(n.id) && nodeState(out, n) !== 'locked') out.push(n.id)
  }
  return out
}

const cleanEntry = (e: unknown) => (isObj(e) ? { lv: int(e.lv, 0, MAX_LV, 0), ok: int(e.ok, 0, 1, 0) } : null)
const better = (a: { lv: number; ok: number }, b: { lv: number; ok: number }) => (b.lv > a.lv || (b.lv === a.lv && b.ok > a.ok) ? b : a)

/**
 * Progress is stored per entry id (the hanzi, unless the entry declares another id). When the content changes, saved progress is
 * carried over, never reset and never merged across different meanings:
 *  - an entry's own id, or an id listed in its `aliases` (an earlier id of the SAME entry): that progress belongs to the entry (the higher level wins if both exist);
 *  - a key that is the hanzi of exactly one entry (the entry later got an explicit id): moves to that entry;
 *  - anything else (an entry that was removed, or a hanzi that is now shared by several entries without an alias) is kept in `legacy`
 *    so nothing is lost, and is tried again on every load.
 */
export function migrateMastery(raw: unknown, legacyRaw: unknown, words: Word[] = WORDS): { mastery: Mastery; legacy: Mastery } {
  const r = migrateById(raw, legacyRaw, words, cleanEntry, better)
  return { mastery: r.claimed, legacy: r.legacy }
}

/** The id rules above, for any per-entry value (mastery entries, peak levels), so both always move together. */
function migrateById<T>(raw: unknown, legacyRaw: unknown, words: Word[], clean: (v: unknown) => T | null, pick: (a: T, b: T) => T): { claimed: Record<string, T>; legacy: Record<string, T> } {
  const pool = new Map<string, T>()
  for (const src of [legacyRaw, raw]) if (isObj(src)) for (const [k, v] of Object.entries(src)) {
    const e = clean(v); if (e !== null) pool.set(k, pool.has(k) ? pick(pool.get(k)!, e) : e)
  }
  const hanziCount = new Map<string, number>()
  for (const w of words) hanziCount.set(w.hanzi, (hanziCount.get(w.hanzi) ?? 0) + 1)
  const claimed: Record<string, T> = {}, used = new Set<string>()
  for (const w of words) {
    const keys = [w.id, ...w.aliases]
    if (w.id !== w.hanzi && hanziCount.get(w.hanzi) === 1 && !words.some(o => o.id === w.hanzi)) keys.push(w.hanzi)
    let best: T | null = null
    for (const k of keys) { const e = pool.get(k); if (e !== undefined && !used.has(k)) { best = best !== null ? pick(best, e) : e; used.add(k) } }
    if (best !== null) claimed[w.id] = best
  }
  const legacy: Record<string, T> = {}
  for (const [k, e] of pool) if (!used.has(k)) legacy[k] = e
  return { claimed, legacy }
}

/**
 * Entry readiness history: the highest mastery level each entry has reached. Moves through ids / aliases exactly like
 * mastery; unclaimed peaks are parked in `legacyPeak`. Then raised to the current mastery levels. Lesson membership never counts.
 */
export function migratePeaks(raw: unknown, legacyRaw: unknown, mastery: Mastery, words: Word[] = WORDS): { peak: PeakLevels; legacy: PeakLevels } {
  const lvl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? int(v, 0, MAX_LV, 0) : null)
  const r = migrateById(raw, legacyRaw, words, lvl, (a, b) => Math.max(a, b))
  return { peak: recordPeaks(r.claimed, mastery), legacy: r.legacy }
}

/** A saved expedition, every field validated and clamped. A run saved beyond the last floor is not valid (null). */
function sanitizeRun(raw: unknown, upgrades: string[]): Run | null {
  if (!isObj(raw)) return null
  const b = computeBonuses(upgrades)
  const gear = strs(raw.gear, GEAR.map(g => g.name))
  const rawLoadout = isObj(raw.loadout) ? raw.loadout : {}
  const loadout: Partial<Record<GearSlot, string>> = {}
  for (const slot of ['Weapon', 'Armor', 'Accessory'] as GearSlot[]) {
    const candidate = rawLoadout[slot]
    const valid = typeof candidate === 'string' && gear.includes(candidate) && GEAR.some(g => g.name === candidate && g.slot === slot)
    const old = gear.find(name => GEAR.some(g => g.name === name && g.slot === slot))
    const chosen = valid ? candidate as string : old
    if (chosen) loadout[slot] = chosen
  }
  const floor = int(raw.floor, 1, EXPEDITION_FLOORS, 1), kill = int(raw.kill, 0, ENEMIES_PER_FLOOR - 1, 0), level = int(raw.level, 1, 999, 1)
  const stats = playerStats({ level, loadout }, b, GEAR)
  const foeHp = enemyStats(ENEMIES, floor, kill).hp
  let phase: Run['phase'] = raw.phase === 'victory' || raw.phase === 'defeat' ? raw.phase : 'fighting'
  let hearts = int(raw.hearts, 0, stats.maxHearts, stats.maxHearts)
  if (phase === 'defeat') hearts = 0
  else if (hearts <= 0) phase = 'defeat'   // no hearts left: the run is over (its gold is still banked by the defeat screen)
  const recoveredFloor = int(raw.recoveredFloor, 0, floor, floor - 1)
  const boss = isBoss(floor, kill) ? bossIdFor(floor) : null
  const rw = isObj(raw.reward) ? raw.reward : {}
  const run: Run = {
    floor, kill, level, gear, loadout, phase, hearts, recoveredFloor,
    kills: int(raw.kills, 0, 1e9, 0), xp: int(raw.xp, 0, 1e9, 0), pendingXp: int(raw.pendingXp, 0, 1e9, 0),
    shield: boss && hasShield(boss) && phase === 'fighting' ? int(raw.shield, 0, shieldFor(floor, boss), shieldFor(floor, boss)) : 0, gold: int(raw.gold, 0, 1e9, 0),
    potions: int(raw.potions, 0, 999, 0), streak: int(raw.streak, 0, 999, 0),
    enemyHp: phase === 'victory' ? 0 : int(raw.enemyHp, 1, foeHp, foeHp),
    hintsLeft: int(raw.hintsLeft, 0, stats.hints, stats.hints),
    secondLeft: int(raw.secondLeft, 0, stats.secondChances, 0),
    reward: { xp: int(rw.xp, 0, 1e9, 0), gold: int(rw.gold, 0, 1e9, 0), loot: typeof rw.loot === 'string' && GEAR.some(g => g.name === rw.loot) ? rw.loot : '', levelUps: int(rw.levelUps, 0, 999, 0), hearts: int(rw.hearts, 0, 99, 0) }
  }
  return run
}

/** Entries whose protected first practice is used up (ids moved through aliases like mastery; unknown ids are kept, parked). */
export function sanitizePracticed(raw: unknown, words: Word[] = WORDS): string[] {
  const asRecord = Array.isArray(raw) ? Object.fromEntries(raw.filter((x): x is string => typeof x === 'string' && ID.test(x)).map(k => [k, true])) : {}
  const r = migrateById(asRecord, {}, words, v => (v === true ? true : null), () => true)
  return [...new Set([...Object.keys(r.claimed), ...Object.keys(r.legacy)])]
}

const ID = /^[^\s]{1,64}$/
/**
 * Course progress. Kept for EVERY curriculum id found in the save, also ones the content no longer has, and every lesson id is kept,
 * also ones no lesson claims any more: nothing is discarded, so a curriculum that comes back (or an alias added later) recovers it.
 * Then every known curriculum is synced with the current mastery: a v2 save gets its lesson readiness derived from existing entry progress,
 * and lessons that became ready are added. Entries with progress already count as introduced (mastery[id] exists), so nothing is replayed.
 */
export function sanitizeCourses(raw: unknown, mastery: Mastery, curricula: Curriculum[] = CURRICULA, words: Word[] = WORDS, peak: PeakLevels = recordPeaks({}, mastery)): Record<string, CourseProgress> {
  const out: Record<string, CourseProgress> = {}
  if (isObj(raw)) for (const [id, v] of Object.entries(raw)) {
    if (!ID.test(id) || !isObj(v)) continue
    const completed = Array.isArray(v.completed) ? [...new Set(v.completed.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, 5000) : []
    out[id] = { version: int(v.version, 0, 1e6, 0), completed }
  }
  const byId = wordMap(words)
  for (const c of curricula) if (c && typeof c.id === 'string' && Array.isArray(c.units)) {
    try { out[c.id] = syncCourse(c, mastery, out[c.id] ?? emptyCourse(), byId, peak) } catch { /* malformed curriculum: the validator reports it; keep what was saved */ }
  }
  return out
}

/** Validates a v1 save; anything else (no object, another version) yields a fresh save. */
export function sanitizeSave(raw: unknown, words: Word[] = WORDS, curricula: Curriculum[] = CURRICULA): Saved {
  const r = isObj(raw) && raw.version === SAVE_VERSION ? raw : {}
  const migrated = migrateMastery(r.mastery, r.legacyMastery, words)
  const peaks = migratePeaks(r.peak, r.legacyPeak, migrated.mastery, words)
  const m = isObj(r.meta) ? r.meta : {}
  const upgrades = validUpgrades(m.upgrades)
  const meta: Meta = { gold: int(m.gold, 0, 1e9, 0), upgrades, bestFloor: int(m.bestFloor, 1, EXPEDITION_FLOORS, 1), runs: int(m.runs, 0, 1e9, 0), wins: int(m.wins, 0, 1e9, 0) }
  const ls = isObj(r.lastRun) ? r.lastRun : null
  const result = ls && (ls.result === 'won' || ls.result === 'returned') ? ls.result : 'defeat'
  const lastRun: RunSummary | null = ls ? { floor: int(ls.floor, 1, EXPEDITION_FLOORS, 1), kills: int(ls.kills, 0, 1e9, 0), level: int(ls.level, 1, 999, 1), goldBanked: int(ls.goldBanked, 0, 1e9, 0), result } : null
  return {
    version: SAVE_VERSION, meta, mastery: migrated.mastery, legacyMastery: migrated.legacy, run: sanitizeRun(r.run, upgrades), lastRun, habit: sanitizeHabit(r.habit),
    peak: peaks.peak, legacyPeak: peaks.legacy,
    practiced: sanitizePracticed(r.practiced, words),
    courses: sanitizeCourses(r.courses, migrated.mastery, curricula, words, peaks.peak)
  }
}

export function loadSave(storage: Pick<Storage, 'getItem'>): Saved {
  try {
    const cur = storage.getItem(SAVE_KEY)
    if (cur) return sanitizeSave(JSON.parse(cur))
  } catch { /* fall through to a fresh save */ }
  return sanitizeSave(null)
}

/** Deletes the saves used before expeditions (the game restarted at save v1; they are never read). */
export function clearOldSaves(storage: Pick<Storage, 'removeItem'>) {
  for (const k of OLD_SAVE_KEYS) { try { storage.removeItem(k) } catch { /* ignore */ } }
}

/**
 * Call after every mastery change (the app does it in the same state update): raises entry peaks to the current levels and records
 * newly ready lessons of `curriculum`. Returns the same object when nothing changed. Peaks and completed lessons never go down.
 */
export function withLearning(s: Saved, curriculum: Curriculum, words: Map<string, Word>): Saved {
  const peak = recordPeaks(s.peak, s.mastery)
  const cur = s.courses[curriculum.id] ?? emptyCourse()
  const next = syncCourse(curriculum, s.mastery, cur, words, peak)
  if (peak === s.peak && next === cur) return s
  return { ...s, peak, courses: next === cur ? s.courses : { ...s.courses, [curriculum.id]: next } }
}
