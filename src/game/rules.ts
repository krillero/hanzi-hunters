// Pure run / combat rules: no React, Phaser or DOM. Covered by tests/.
import type { Enemy, GearItem } from '../data.ts'
import type { Meta, Run, RunSummary } from './types.ts'
import type { Bonuses } from './upgrades.ts'
import { MASTERY_DAMAGE } from './mastery.ts'

export const ENEMIES_PER_FLOOR = 4
export const BASE_HP = 30
export const BASE_ATTACK = 5
export const HP_PER_LEVEL = 5
export const ATTACK_PER_LEVEL = 1
export const POTION_HEAL = 12
export const xpForLevel = (level: number) => level * 30

export const isElite = (kill: number) => kill === ENEMIES_PER_FLOOR - 1
export const equippedGear = (all: GearItem[], owned: string[]) => all.filter(g => owned.includes(g.name))
const gearSum = (gear: GearItem[], key: 'attack' | 'hp') => gear.reduce((n, g) => n + g[key], 0)

export type EnemyStats = { enemy: Enemy; hp: number; damage: number; xp: number; gold: number; elite: boolean }
/** Per floor (compounding): enemy HP +16 %, damage +11 %, rewards +8 %; the last enemy of a floor is an elite. */
export function enemyStats(enemies: Enemy[], floor: number, kill: number): EnemyStats {
  const enemy = enemies[(((floor - 1) * ENEMIES_PER_FLOOR) + kill) % enemies.length]
  const elite = isElite(kill), f = floor - 1
  return {
    enemy, elite,
    hp: Math.round(enemy.hp * 1.16 ** f * (elite ? 1.6 : 1)),
    damage: Math.round(enemy.damage * 1.11 ** f * (elite ? 1.25 : 1)),
    xp: Math.round(enemy.xp * 1.08 ** f * (elite ? 2 : 1)),
    gold: Math.round(enemy.gold * 1.08 ** f * (elite ? 2 : 1))
  }
}

export function playerStats(run: Pick<Run, 'level' | 'gear'>, b: Bonuses, allGear: GearItem[]) {
  const gear = equippedGear(allGear, run.gear)
  return {
    maxHp: BASE_HP + b.maxHp + HP_PER_LEVEL * (run.level - 1) + gearSum(gear, 'hp'),
    attack: BASE_ATTACK + b.attack + ATTACK_PER_LEVEL * (run.level - 1) + gearSum(gear, 'attack')
  }
}

const noReward = { xp: 0, gold: 0, loot: '', levelUps: 0 }

export function startFight(run: Run, b: Bonuses, enemies: Enemy[]): Run {
  return { ...run, phase: 'fighting', enemyHp: enemyStats(enemies, run.floor, run.kill).hp, hintsLeft: b.hints, secondLeft: b.secondChance, reward: noReward }
}

export function newRun(b: Bonuses, allGear: GearItem[], enemies: Enemy[]): Run {
  const base: Run = {
    floor: 1, kill: 0, kills: 0, level: 1, xp: 0, hp: 0, enemyHp: 0, gold: 0, potions: 1 + b.startPotions,
    gear: allGear.filter(g => b.startGear.includes(g.name)).map(g => g.name), streak: 0, hintsLeft: 0, secondLeft: 0,
    phase: 'fighting', reward: noReward
  }
  return startFight({ ...base, hp: playerStats(base, b, allGear).maxHp }, b, enemies)
}

/** After a victory: move to the next enemy, or the next floor after the elite. */
export function advance(run: Run, b: Bonuses, enemies: Enemy[]): Run {
  const done = run.kill + 1 >= ENEMIES_PER_FLOOR
  return startFight({ ...run, floor: done ? run.floor + 1 : run.floor, kill: done ? 0 : run.kill + 1, streak: run.streak }, b, enemies)
}

export type AnswerInput = {
  run: Run; bonuses: Bonuses; enemies: Enemy[]; allGear: GearItem[]
  /** Mastery level of the word when asked (0 for a first-time intro). */
  lv: number
  isCorrect: boolean
  roll: { drop: number; item: number }
}
export type AnswerResult = {
  run: Run; damage: number; counter: number; savedBySecondChance: boolean
  outcome: 'continue' | 'victory' | 'defeat'; loot: GearItem | null; duplicateGold: number; comboHit: boolean
}

export function resolveAnswer(i: AnswerInput): AnswerResult {
  const { run, bonuses: b, isCorrect } = i
  const gear = equippedGear(i.allGear, run.gear)
  const stats = playerStats(run, b, i.allGear)
  const foe = enemyStats(i.enemies, run.floor, run.kill)

  let damage = 2, comboHit = false
  if (isCorrect) {
    let pct = MASTERY_DAMAGE[Math.min(i.lv, MASTERY_DAMAGE.length - 1)] + (i.lv >= 1 ? b.masteryDmgPct : 0)
    if (run.streak >= 2) { pct += b.streakDmgPct; comboHit = b.streakDmgPct > 0 }
    if (run.enemyHp <= foe.hp * 0.35) pct += b.executeDmgPct
    damage = Math.round((8 + stats.attack) * (1 + pct))
  }
  const enemyHp = Math.max(0, run.enemyHp - damage)
  const killed = enemyHp === 0

  let counter = 0, savedBySecondChance = false, secondLeft = run.secondLeft
  if (!killed) {
    if (!isCorrect && secondLeft > 0) { secondLeft -= 1; savedBySecondChance = true }
    else counter = Math.max(1, foe.damage - b.armor)
  }
  let hp = Math.max(0, run.hp - counter)

  let xpGained = Math.round((isCorrect ? 5 : 2) * (1 + b.xpPct + (gear.some(g => g.name === 'Scholar Charm') ? 0.1 : 0)))
  let goldGained = 0, loot: GearItem | null = null, duplicateGold = 0, owned = run.gear
  if (killed) {
    xpGained += foe.xp
    goldGained = Math.round(foe.gold * (1 + b.goldPct)) + (gear.some(g => g.name === 'Lucky Coin') ? 3 : 0)
    const dropChance = Math.min(0.95, 0.5 + b.lootPct + (foe.elite ? 0.3 : 0))
    if (i.roll.drop < dropChance) {
      const item = i.allGear[Math.min(i.allGear.length - 1, Math.floor(i.roll.item * i.allGear.length))]
      if (owned.includes(item.name)) { duplicateGold = 4; goldGained += 4 } else { loot = item; owned = [...owned, item.name] }
    }
  }

  let xp = run.xp + xpGained, level = run.level, levelUps = 0
  while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level += 1; levelUps += 1 }
  const next: Run = { ...run, level, xp, gear: owned, enemyHp, hp, secondLeft, streak: isCorrect ? run.streak + 1 : 0 }
  const grown = playerStats(next, b, i.allGear)
  if (levelUps && hp > 0) hp = Math.min(grown.maxHp, hp + 8 * levelUps)
  if (killed && hp > 0) hp = Math.min(grown.maxHp, hp + b.healOnKill)

  const outcome = killed ? 'victory' : hp <= 0 ? 'defeat' : 'continue'
  return {
    damage, counter, savedBySecondChance, outcome, loot, duplicateGold, comboHit,
    run: {
      ...next, hp,
      gold: run.gold + goldGained, kills: run.kills + (killed ? 1 : 0),
      phase: outcome === 'continue' ? 'fighting' : outcome,
      reward: killed ? { xp: xpGained, gold: goldGained, loot: loot?.name ?? '', levelUps } : noReward
    }
  }
}

export function drinkPotion(run: Run, b: Bonuses, allGear: GearItem[]): Run | null {
  const max = playerStats(run, b, allGear).maxHp
  if (run.phase !== 'fighting' || run.potions < 1 || run.hp <= 0 || run.hp >= max) return null
  return { ...run, potions: run.potions - 1, hp: Math.min(max, run.hp + POTION_HEAL + b.potionHeal) }
}

/** Dying banks every gold coin; level, gear and potions are lost with the run. */
export function bankRun(meta: Meta, run: Run): { meta: Meta; summary: RunSummary } {
  return {
    meta: { ...meta, gold: meta.gold + run.gold, bestFloor: Math.max(meta.bestFloor, run.floor), runs: meta.runs + 1 },
    summary: { floor: run.floor, kills: run.kills, level: run.level, goldBanked: run.gold }
  }
}
