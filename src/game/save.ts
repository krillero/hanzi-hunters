// Save format v2 with a safe migration from the v1 prototype save. Never throws.
import { ENEMIES, GEAR, WORDS } from '../data.ts'
import type { Mastery, Meta, Run, RunSummary, Saved } from './types.ts'
import { UPGRADES, computeBonuses, nodeState, type UpgradeNode } from './upgrades.ts'
import { ENEMIES_PER_FLOOR, enemyStats, playerStats } from './rules.ts'
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

function sanitizeMastery(raw: unknown): Mastery {
  const out: Mastery = {}
  if (!isObj(raw)) return out
  for (const w of WORDS) {
    const e = raw[w.hanzi]
    if (isObj(e)) out[w.hanzi] = { lv: int(e.lv, 0, MAX_LV, 0), ok: int(e.ok, 0, 1, 0) }
  }
  return out
}

function sanitizeRun(raw: unknown, upgrades: string[]): Run | null {
  if (!isObj(raw)) return null
  const b = computeBonuses(upgrades)
  const gear = strs(raw.gear, GEAR.map(g => g.name))
  const floor = int(raw.floor, 1, 1e6, 1), kill = int(raw.kill, 0, ENEMIES_PER_FLOOR - 1, 0), level = int(raw.level, 1, 999, 1)
  const stats = playerStats({ level, gear }, b, GEAR)
  const foeHp = enemyStats(ENEMIES, floor, kill).hp
  const phase = raw.phase === 'victory' || raw.phase === 'defeat' ? raw.phase : 'fighting'
  const hp = int(raw.hp, 0, stats.maxHp, stats.maxHp)
  if (hp <= 0 && phase !== 'defeat') return null
  const rw = isObj(raw.reward) ? raw.reward : {}
  const run: Run = {
    floor, kill, level, gear, phase, hp,
    kills: int(raw.kills, 0, 1e9, 0), xp: int(raw.xp, 0, 1e9, 0), gold: int(raw.gold, 0, 1e9, 0),
    potions: int(raw.potions, 0, 999, 0), streak: int(raw.streak, 0, 999, 0),
    enemyHp: phase === 'victory' ? 0 : int(raw.enemyHp, 1, foeHp, foeHp),
    hintsLeft: int(raw.hintsLeft, 0, b.hints, b.hints), secondLeft: int(raw.secondLeft, 0, b.secondChance, b.secondChance),
    reward: { xp: int(rw.xp, 0, 1e9, 0), gold: int(rw.gold, 0, 1e9, 0), loot: typeof rw.loot === 'string' && GEAR.some(g => g.name === rw.loot) ? rw.loot : '', levelUps: int(rw.levelUps, 0, 999, 0), dupGold: int(rw.dupGold, 0, 999, 0) }
  }
  return run
}

export function sanitizeSave(raw: unknown): Saved {
  const r = isObj(raw) ? raw : {}
  const m = isObj(r.meta) ? r.meta : {}
  const upgrades = validUpgrades(m.upgrades)
  const meta: Meta = { gold: int(m.gold, 0, 1e9, 0), upgrades, bestFloor: int(m.bestFloor, 1, 1e6, 1), runs: int(m.runs, 0, 1e9, 0) }
  const ls = isObj(r.lastRun) ? r.lastRun : null
  const lastRun: RunSummary | null = ls ? { floor: int(ls.floor, 1, 1e6, 1), kills: int(ls.kills, 0, 1e9, 0), level: int(ls.level, 1, 999, 1), goldBanked: int(ls.goldBanked, 0, 1e9, 0) } : null
  return { version: 2, meta, mastery: sanitizeMastery(r.mastery), run: sanitizeRun(r.run, upgrades), lastRun }
}

/** v1 prototype save -> v2: learned words become level 1, old gold is banked, the old floor becomes the best floor. */
export function migrateV1(raw: unknown): Saved {
  const r = isObj(raw) ? raw : {}
  const mastery: Mastery = {}
  for (const h of strs(r.learned, WORDS.map(w => w.hanzi))) mastery[h] = { lv: 1, ok: 0 }
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

