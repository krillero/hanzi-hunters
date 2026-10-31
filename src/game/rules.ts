// Pure run / combat rules: no React, Phaser or DOM. Covered by tests/.
import { BOSSES, type BossId, type Enemy, type GearItem, type GearSlot } from '../data.ts'
import type { Meta, Run, RunSummary } from './types.ts'
import type { Bonuses } from './upgrades.ts'
import { MASTERY_DAMAGE } from './mastery.ts'
import { gearVerdict } from './rarity.ts'

export const ENEMIES_PER_FLOOR = 4
export const BASE_HP = 30
export const BASE_ATTACK = 5
export const HP_PER_LEVEL = 5
export const ATTACK_PER_LEVEL = 1
export const POTION_HEAL = 12
export const xpForLevel = (level: number) => level * 30

export const SHIELD_SEGMENTS = 3   // the most a shield ever has
/** Boss multipliers over the base enemy stats (before the per-floor scaling). Early floors get a gentler boss: they ramp up to the full values. */
export const BOSS_HP = 1.7, BOSS_DAMAGE = 1.15, BOSS_REWARD = 2
export const bossHpMult = (floor: number) => Math.min(BOSS_HP, 1.3 + 0.15 * (floor - 1))
export const bossDamageMult = (floor: number) => Math.min(BOSS_DAMAGE, 0.8 + 0.1 * (floor - 1))
/** Bosses with a shield / seals, and which question kind breaks it (the question's `ask`). */
export const SEAL_ASK: Partial<Record<BossId, 'pinyin' | 'hanzi'>> = { golem: 'pinyin', scribe: 'hanzi' }
export const hasShield = (id: BossId) => id in SEAL_ASK
/** Mirror Trickster: a right answer hits harder, a wrong one heals it (more below half HP). */
export const TRICKSTER_HIT = 1.4, TRICKSTER_HEAL = 0.08, TRICKSTER_HEAL_LOW = 0.16, TRICKSTER_LOW = 0.5
/** Shield / seals: 2 segments on the first floors, 3 from floor 3. */
export const shieldFor = (floor: number) => (floor <= 2 ? 2 : SHIELD_SEGMENTS)

/** The last fight of a floor. Every floor ends with a boss. */
export const isFinalFight = (kill: number) => kill === ENEMIES_PER_FLOOR - 1
/** `floor` is kept in the signature so a later design can skip bosses on some floors. */
export const isBoss = (_floor: number, kill: number) => isFinalFight(kill)
/** The bosses take turns: Golem, Wraith, Scribe, Trickster, then again. Add a boss here (and in data.ts) to lengthen the cycle. */
export const BOSS_ORDER: BossId[] = ['golem', 'wraith', 'scribe', 'trickster']
export const bossIdFor = (floor: number): BossId => BOSS_ORDER[(Math.max(1, floor) - 1) % BOSS_ORDER.length]
/** Echo Wraith: below this share of its HP it starts echoing the question kind you missed. */
export const WRAITH_ECHO_AT = 0.6
export const equippedGear = (all: GearItem[], loadout: Partial<Record<GearSlot, string>>) =>
  all.filter(g => loadout[g.slot] === g.name)
const gearSum = (gear: GearItem[], key: 'attack' | 'hp' | 'armor') => gear.reduce((n, g) => n + g[key], 0)
const gearPct = (gear: GearItem[], key: 'xpPct' | 'masteryPct') => gear.reduce((n, g) => n + g[key], 0)
export function equipGear(run: Run, name: string, allGear: GearItem[], b: Bonuses): Run | null {
  const item = allGear.find(g => g.name === name)
  if (!item || !run.gear.includes(name) || run.loadout[item.slot] === name) return null
  const beforeMax = playerStats(run, b, allGear).maxHp
  const next = { ...run, loadout: { ...run.loadout, [item.slot]: name } }
  const afterMax = playerStats(next, b, allGear).maxHp
  return { ...next, hp: Math.max(0, Math.min(afterMax, run.hp + (afterMax - beforeMax))) }
}

export type EnemyStats = { enemy: Enemy; hp: number; damage: number; xp: number; gold: number; boss: BossId | null }
/** Per floor (compounding): enemy HP +16 %, damage +11 %, rewards +8 %; the last enemy of a floor is a boss. */
export function enemyStats(enemies: Enemy[], floor: number, kill: number): EnemyStats {
  const boss = isBoss(floor, kill) ? bossIdFor(floor) : null
  const enemy = boss ? BOSSES[boss] : enemies[(((floor - 1) * ENEMIES_PER_FLOOR) + kill) % enemies.length]
  const f = floor - 1
  return {
    enemy, boss,
    hp: Math.round(enemy.hp * 1.16 ** f * (boss ? bossHpMult(floor) : 1)),
    damage: Math.round(enemy.damage * 1.11 ** f * (boss ? bossDamageMult(floor) : 1)),
    xp: Math.round(enemy.xp * 1.08 ** f * (boss ? BOSS_REWARD : 1)),
    gold: Math.round(enemy.gold * 1.08 ** f * (boss ? BOSS_REWARD : 1))
  }
}

export function playerStats(run: Pick<Run, 'level' | 'gear' | 'loadout'>, b: Bonuses, allGear: GearItem[]) {
  const gear = equippedGear(allGear, run.loadout)
  return {
    maxHp: BASE_HP + b.maxHp + HP_PER_LEVEL * (run.level - 1) + gearSum(gear, 'hp'),
    attack: BASE_ATTACK + b.attack + ATTACK_PER_LEVEL * (run.level - 1) + gearSum(gear, 'attack')
  }
}

const noReward = { xp: 0, gold: 0, loot: '', levelUps: 0 }

export function startFight(run: Run, b: Bonuses, enemies: Enemy[]): Run {
  return { ...run, phase: 'fighting', enemyHp: enemyStats(enemies, run.floor, run.kill).hp, hintsLeft: b.hints, secondLeft: b.secondChance, reward: noReward, pendingXp: 0,
    shield: isBoss(run.floor, run.kill) && hasShield(bossIdFor(run.floor)) ? shieldFor(run.floor) : 0 }
}

export function newRun(b: Bonuses, allGear: GearItem[], enemies: Enemy[]): Run {
  const base: Run = {
    floor: 1, kill: 0, kills: 0, level: 1, xp: 0, hp: 0, enemyHp: 0, gold: 0, potions: 1 + b.startPotions,
    gear: allGear.filter(g => b.startGear.includes(g.name)).map(g => g.name), loadout: Object.fromEntries(allGear.filter(g => b.startGear.includes(g.name)).map(g => [g.slot, g.name])) as Partial<Record<GearSlot, string>>, streak: 0, hintsLeft: 0, secondLeft: 0,
    phase: 'fighting', reward: noReward, pendingXp: 0, shield: 0
  }
  return startFight({ ...base, hp: playerStats(base, b, allGear).maxHp }, b, enemies)
}

/** After a victory: move to the next enemy, or the next floor after the boss. */
export function advance(run: Run, b: Bonuses, enemies: Enemy[]): Run {
  const done = run.kill + 1 >= ENEMIES_PER_FLOOR
  return startFight({ ...run, floor: done ? run.floor + 1 : run.floor, kill: done ? 0 : run.kill + 1, streak: run.streak }, b, enemies)
}

export type AnswerInput = {
  run: Run; bonuses: Bonuses; enemies: Enemy[]; allGear: GearItem[]
  /** Mastery level of the word when asked (0 for a first-time intro). */
  lv: number
  isCorrect: boolean
  /** True when this is the kind of question that breaks the boss's shield / seals (tone question for the Golem, character question for the Scribe). */
  sealQuestion?: boolean
  roll: { drop: number; item: number }
}
export type AnswerResult = {
  run: Run; damage: number; counter: number; savedBySecondChance: boolean
  outcome: 'continue' | 'victory' | 'defeat'; loot: GearItem | null; comboHit: boolean
  /** HP actually restored by the Second Wind upgrade (healOnKill) on this kill; 0 without the upgrade or at full HP. */
  healedOnKill: number
  /** Shield / seals: a segment was broken by this answer / the shield was up and blocked the hit / a seal grew back (Scribe). */
  shieldBroken: boolean; shieldBlocked: boolean; shieldRegrown: boolean
  /** Mirror Trickster: HP it healed because of a wrong answer. */
  bossHealed: number
}

export function resolveAnswer(i: AnswerInput): AnswerResult {
  const { run, bonuses: b, isCorrect } = i
  const gear = equippedGear(i.allGear, run.loadout)
  const stats = playerStats(run, b, i.allGear)
  const foe = enemyStats(i.enemies, run.floor, run.kill)

  let damage = 2, comboHit = false
  if (isCorrect) {
    let pct = MASTERY_DAMAGE[Math.min(i.lv, MASTERY_DAMAGE.length - 1)] + (i.lv >= 1 ? b.masteryDmgPct : 0) + gearPct(gear, 'masteryPct')
    if (run.streak >= 2) { pct += b.streakDmgPct; comboHit = b.streakDmgPct > 0 }
    if (run.enemyHp <= foe.hp * 0.35) pct += b.executeDmgPct
    damage = Math.round((8 + stats.attack) * (1 + pct))
  }
  // Shield Golem: while the shield is up it blocks all damage; a correct tone answer breaks one segment.
  const shieldUp = run.shield > 0
  const shieldBroken = shieldUp && isCorrect && !!i.sealQuestion
  if (shieldUp) damage = 0
  // Mirror Trickster: a right answer hits harder; a wrong one is dodged and heals it
  let bossHealed = 0
  if (foe.boss === 'trickster') {
    if (isCorrect) damage = Math.round(damage * TRICKSTER_HIT)
    else { damage = 0; bossHealed = Math.max(0, Math.min(foe.hp, run.enemyHp + Math.round(foe.hp * (run.enemyHp <= foe.hp * TRICKSTER_LOW ? TRICKSTER_HEAL_LOW : TRICKSTER_HEAL))) - run.enemyHp) }
  }
  const enemyHp = Math.max(0, run.enemyHp - damage) + bossHealed
  const killed = enemyHp === 0
  // Ink Scribe: with the seals down, a wrong answer lets one grow back
  const shieldRegrown = foe.boss === 'scribe' && !shieldUp && !isCorrect && !killed

  let counter = 0, savedBySecondChance = false, secondLeft = run.secondLeft
  if (!killed) {
    if (!isCorrect && secondLeft > 0) { secondLeft -= 1; savedBySecondChance = true }
    else counter = Math.max(1, foe.damage - b.armor - gearSum(gear, 'armor'))
  }
  let hp = Math.max(0, run.hp - counter)

  // Experience is paid only when the monster dies: what each answer earned is banked in `pendingXp` and paid out with the kill.
  const answerXp = Math.round((isCorrect ? 5 : 2) * (1 + b.xpPct + gearPct(gear, 'xpPct')))
  let xpGained = 0
  let goldGained = 0, loot: GearItem | null = null, owned = run.gear, loadout = run.loadout
  if (killed) {
    xpGained = answerXp + run.pendingXp + foe.xp
    goldGained = Math.round(foe.gold * (1 + b.goldPct)) + gear.reduce((n, g) => n + g.goldFlat, 0)
    const dropChance = Math.min(0.95, 0.5 + b.lootPct + (foe.boss ? 0.3 : 0))
    // Only gear you do not have yet can drop; once you own everything, kills simply drop nothing.
    // Boss-only gear never drops from normal fights; a boss kill guarantees its own item (once); after that bosses roll with a better chance, like the old elite.
    const unowned = i.allGear.filter(g => !owned.includes(g.name))
    const pool = unowned.filter(g => !g.boss)
    const bossItem = foe.boss ? unowned.find(g => g.boss === foe.boss) : undefined
    let item: GearItem | undefined
    if (bossItem) item = bossItem
    else if (pool.length > 0 && i.roll.drop < dropChance) item = pool[Math.min(pool.length - 1, Math.floor(i.roll.item * pool.length))]
    if (item) {
      // One item per slot, no bag: an empty slot or a pure upgrade is worn at once; a pure downgrade is left behind;
      // a trade-off stays unworn until the player chooses (equipGear). `gear` remembers what was found so it cannot drop twice.
      loot = item; owned = [...owned, item.name]
      const worn = loadout[item.slot] ? i.allGear.find(g => g.name === loadout[item.slot]) : null
      const verdict = gearVerdict(item, worn)
      if (verdict === 'new' || verdict === 'better') loadout = { ...loadout, [item.slot]: item.name }
    }
  }

  let xp = run.xp + xpGained, level = run.level, levelUps = 0
  while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level += 1; levelUps += 1 }
  const next: Run = { ...run, level, xp, gear: owned, loadout, enemyHp, hp, secondLeft, streak: isCorrect ? run.streak + 1 : 0, pendingXp: killed ? 0 : run.pendingXp + answerXp, shield: shieldBroken ? run.shield - 1 : shieldRegrown ? 1 : run.shield }
  const grown = playerStats(next, b, i.allGear)
  const oldMax = playerStats(run, b, i.allGear).maxHp
  if (loadout !== run.loadout && grown.maxHp > oldMax && hp > 0) hp = Math.min(grown.maxHp, hp + grown.maxHp - oldMax)
  if (levelUps && hp > 0) hp = Math.min(grown.maxHp, hp + 8 * levelUps)
  const hpBeforeKillHeal = hp
  if (killed && hp > 0) hp = Math.min(grown.maxHp, hp + b.healOnKill)
  const healedOnKill = hp - hpBeforeKillHeal

  const outcome = killed ? 'victory' : hp <= 0 ? 'defeat' : 'continue'
  return {
    damage, counter, savedBySecondChance, outcome, loot, comboHit, healedOnKill, shieldBroken, shieldBlocked: shieldUp, shieldRegrown, bossHealed,
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

/** 1 or 2: which phase of the boss fight this is (for the header and for choosing questions). */
export function bossPhase(run: Pick<Run, 'floor' | 'kill' | 'shield' | 'enemyHp'>, foeHp: number): 1 | 2 {
  if (!isBoss(run.floor, run.kill)) return 1
  const id = bossIdFor(run.floor)
  if (hasShield(id)) return run.shield > 0 ? 1 : 2
  if (id === 'trickster') return run.enemyHp <= foeHp * TRICKSTER_LOW ? 2 : 1
  return run.enemyHp <= foeHp * WRAITH_ECHO_AT ? 2 : 1
}
