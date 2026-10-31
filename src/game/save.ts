// Save format v2 with a safe migration from the v1 prototype save. Never throws.
import { sanitizeHabit } from './habit.ts'
import { CURRICULA, ENEMIES, GEAR, WORDS, type GearSlot, type Word } from '../data.ts'
import type { Curriculum } from '../content/types.ts'
import type { Mastery, Meta, Run, RunSummary, Saved } from './types.ts'
import { emptyCourse, recordPeaks, syncCourse, wordMap, type CourseProgress, type PeakLevels } from './course.ts'
import { UPGRADES, computeBonuses, nodeState, type UpgradeNode } from './upgrades.ts'
import { ENEMIES_PER_FLOOR, bossIdFor, enemyStats, hasShield, isBoss, playerStats, shieldFor } from './rules.ts'
import { MAX_LV } from './mastery.ts'

export const SAVE_KEY = 'hanzi-hunters-save-v2'
export const LEGACY_KEY = 'hanzi-hunters-save-v1'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback
const strs = (v: unknown, allowed: string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.includes(x)))] : []

export const emptyMeta = (): Meta => ({ gold: 0, upgrades: [], bestFloor: 1, runs: 0 })

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
 * Entry readiness history (v4): the highest mastery level each entry has reached. Migrates through ids / aliases exactly like
 * mastery; unclaimed peaks are parked in `legacyPeak`. Then raised to the current mastery levels.
 * Saves older than v4 have no history: their peaks are derived from the CURRENT level only (conservative). An entry that was ready
 * once but has since dropped below the threshold is not ready again until it is re-earned. Lesson membership never counts.
 */
export function migratePeaks(raw: unknown, legacyRaw: unknown, mastery: Mastery, words: Word[] = WORDS): { peak: PeakLevels; legacy: PeakLevels } {
  const lvl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? int(v, 0, MAX_LV, 0) : null)
  const r = migrateById(raw, legacyRaw, words, lvl, (a, b) => Math.max(a, b))
  return { peak: recordPeaks(r.claimed, mastery), legacy: r.legacy }
}

function sanitizeRun(raw: unknown, upgrades: string[]): Run | null {
  if (!isObj(raw)) return null
  const b = computeBonuses(upgrades)
  const gear = strs(raw.gear, GEAR.map(g => g.name))
  const rawLoadout = isObj(raw.loadout) ? raw.loadout : {}
  const loadout: Partial<Record<GearSlot, string>> = {}
  for (const slot of ['Weapon', 'Armor', 'Accessory'] as GearSlot[]) {
    const candidate = rawLoadout[slot]
    const valid = typeof candidate === 'string' && gear.includes(candidate) && GEAR.some(g => g.name === candidate && g.slot === slot)
    const legacy = gear.find(name => GEAR.some(g => g.name === name && g.slot === slot))
    const chosen = valid ? candidate as string : legacy
    if (chosen) loadout[slot] = chosen
  }
  const floor = int(raw.floor, 1, 1e6, 1), kill = int(raw.kill, 0, ENEMIES_PER_FLOOR - 1, 0), level = int(raw.level, 1, 999, 1)
  const stats = playerStats({ level, gear, loadout }, b, GEAR)
  const foeHp = enemyStats(ENEMIES, floor, kill).hp
  const phase = raw.phase === 'victory' || raw.phase === 'defeat' ? raw.phase : 'fighting'
  const hp = int(raw.hp, 0, stats.maxHp, stats.maxHp)
  if (hp <= 0 && phase !== 'defeat') return null
  const rw = isObj(raw.reward) ? raw.reward : {}
  const run: Run = {
    floor, kill, level, gear, loadout, phase, hp,
    kills: int(raw.kills, 0, 1e9, 0), xp: int(raw.xp, 0, 1e9, 0), pendingXp: int(raw.pendingXp, 0, 1e9, 0),
    shield: isBoss(floor, kill) && hasShield(bossIdFor(floor)) && phase === 'fighting' ? int(raw.shield, 0, shieldFor(floor), shieldFor(floor)) : 0, gold: int(raw.gold, 0, 1e9, 0),
    potions: int(raw.potions, 0, 999, 0), streak: int(raw.streak, 0, 999, 0),
    enemyHp: phase === 'victory' ? 0 : int(raw.enemyHp, 1, foeHp, foeHp),
    hintsLeft: int(raw.hintsLeft, 0, b.hints, b.hints), secondLeft: int(raw.secondLeft, 0, b.secondChance, b.secondChance),
    reward: { xp: int(rw.xp, 0, 1e9, 0), gold: int(rw.gold, 0, 1e9, 0), loot: typeof rw.loot === 'string' && GEAR.some(g => g.name === rw.loot) ? rw.loot : '', levelUps: int(rw.levelUps, 0, 999, 0) }
  }
  return run
}

const ID = /^[^\s]{1,64}$/
/**
 * Course progress (v3+). Kept for EVERY curriculum id found in the save, also ones the content no longer has, and every lesson id is kept,
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

export function sanitizeSave(raw: unknown, words: Word[] = WORDS, curricula: Curriculum[] = CURRICULA): Saved {
  const r = isObj(raw) ? raw : {}
  const migrated = migrateMastery(r.mastery, r.legacyMastery, words)
  const peaks = migratePeaks(r.peak, r.legacyPeak, migrated.mastery, words)
  const m = isObj(r.meta) ? r.meta : {}
  const upgrades = validUpgrades(m.upgrades)
  const meta: Meta = { gold: int(m.gold, 0, 1e9, 0), upgrades, bestFloor: int(m.bestFloor, 1, 1e6, 1), runs: int(m.runs, 0, 1e9, 0) }
  const ls = isObj(r.lastRun) ? r.lastRun : null
  const lastRun: RunSummary | null = ls ? { floor: int(ls.floor, 1, 1e6, 1), kills: int(ls.kills, 0, 1e9, 0), level: int(ls.level, 1, 999, 1), goldBanked: int(ls.goldBanked, 0, 1e9, 0) } : null
  return {
    version: 4, meta, mastery: migrated.mastery, legacyMastery: migrated.legacy, run: sanitizeRun(r.run, upgrades), lastRun, habit: sanitizeHabit(r.habit),
    peak: peaks.peak, legacyPeak: peaks.legacy,
    courses: sanitizeCourses(r.courses, migrated.mastery, curricula, words, peaks.peak)
  }
}

/** v1 prototype save -> v2: learned words become level 1, old gold is banked, the old floor becomes the best floor. */
export function migrateV1(raw: unknown): Saved {
  const r = isObj(raw) ? raw : {}
  const mastery: Mastery = {}
  for (const h of strs(r.learned, WORDS.map(w => w.hanzi))) { const w = WORDS.find(x => x.hanzi === h && x.id === x.hanzi) ?? WORDS.find(x => x.hanzi === h); if (w) mastery[w.id] = { lv: 1, ok: 0 } }
  return sanitizeSave({
    meta: { gold: r.gold, upgrades: [], bestFloor: r.floor, runs: 0 }, mastery, run: null, lastRun: null
  })
}

export function loadSave(storage: Pick<Storage, 'getItem'>): Saved {
  try {
    const cur = storage.getItem(SAVE_KEY)
    if (cur) return sanitizeSave(JSON.parse(cur))
    const old = storage.getItem(LEGACY_KEY)
    if (old) return migrateV1(JSON.parse(old))
  } catch { /* fall through to a fresh save */ }
  return sanitizeSave(null)
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
