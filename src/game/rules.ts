// Pure run / combat rules: no React, Phaser or DOM. Covered by tests/.
//
// Hearts (docs/GAME_DESIGN.md):
//  - a correct answer attacks the enemy and never costs a heart;
//  - a wrong answer deals no damage and costs exactly one heart, unless it is protected
//    (first practice of a new word, then a second-chance charge);
//  - zero hearts ends the run. Enemies have HP but no attack.
import { BOSSES, type BossId, type Enemy, type GearItem, type GearSlot } from '../data.ts'
import type { Meta, Run, RunSummary } from './types.ts'
import type { Bonuses } from './upgrades.ts'
import { MASTERY_DAMAGE } from './mastery.ts'
import { gearVerdict } from './rarity.ts'

export const ENEMIES_PER_FLOOR = 4
export const BASE_ATTACK = 5
export const ATTACK_PER_LEVEL = 1
export const xpForLevel = (level: number) => level * 30

/** Hearts: a run starts with START_HEARTS full hearts; upgrades and gear add more, up to MAX_HEARTS in total. */
export const START_HEARTS = 5
export const MAX_HEARTS = 8
export const START_POTIONS = 1
/** A potion restores this many hearts (+ Titan Heart). */
export const POTION_HEARTS = 1
/** Clearing a floor (beating its boss) restores this many hearts (+ Second Wind). */
export const FLOOR_HEARTS = 1
/**
 * Danger scaling, chosen with tools/simulate.ts (see docs/GAME_DESIGN.md "Balance"). A mistake always costs exactly one heart, so
 * deeper floors are harder because they take more answers (enemy HP grows) and hearts come back only every `recoveryEvery` floors.
 * Mutable only so the simulator can compare settings; the game never changes it.
 */
export const TUNING = { enemyHpGrowth: 1.25, recoveryEvery: 1 }

export const SHIELD_SEGMENTS = 3   // the most a shield ever has
/** Boss multipliers over the base enemy stats (before the per-floor scaling). Early floors get a gentler boss: they ramp up to the full values. */
export const BOSS_HP = 1.7, BOSS_REWARD = 2
export const bossHpMult = (floor: number) => Math.min(BOSS_HP, 1.3 + 0.15 * (floor - 1))
/** Bosses with a shield / seals, and which question kind breaks it (the question's `ask`). */
export const SEAL_ASK: Partial<Record<BossId, 'pinyin' | 'hanzi'>> = { golem: 'pinyin', scribe: 'hanzi' }
export const hasShield = (id: BossId) => id in SEAL_ASK
/** Mirror Trickster: a right answer hits harder. */
export const TRICKSTER_HIT = 1.4, TRICKSTER_LOW = 0.5
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
const gearSum = (gear: GearItem[], key: 'attack' | 'maxHearts' | 'secondChance' | 'hints' | 'xpPct' | 'masteryPct' | 'goldFlat') => gear.reduce((n, g) => n + g[key], 0)

export type EnemyStats = { enemy: Enemy; hp: number; xp: number; gold: number; boss: BossId | null }
/** Per floor (compounding): enemy HP x TUNING.enemyHpGrowth, rewards +8 %; the last enemy of a floor is a boss. */
export function enemyStats(enemies: Enemy[], floor: number, kill: number): EnemyStats {
  const boss = isBoss(floor, kill) ? bossIdFor(floor) : null
  const enemy = boss ? BOSSES[boss] : enemies[(((floor - 1) * ENEMIES_PER_FLOOR) + kill) % enemies.length]
  const f = floor - 1
  return {
    enemy, boss,
    hp: Math.round(enemy.hp * TUNING.enemyHpGrowth ** f * (boss ? bossHpMult(floor) : 1)),
    xp: Math.round(enemy.xp * 1.08 ** f * (boss ? BOSS_REWARD : 1)),
    gold: Math.round(enemy.gold * 1.08 ** f * (boss ? BOSS_REWARD : 1))
  }
}

/** Everything the equipped gear and upgrades give. Levels add attack only (never hearts). */
export function playerStats(run: Pick<Run, 'level' | 'loadout'>, b: Bonuses, allGear: GearItem[]) {
  const gear = equippedGear(allGear, run.loadout)
  return {
    maxHearts: Math.min(MAX_HEARTS, START_HEARTS + b.maxHearts + gearSum(gear, 'maxHearts')),
    attack: BASE_ATTACK + b.attack + ATTACK_PER_LEVEL * (run.level - 1) + gearSum(gear, 'attack'),
    /** Second-chance charges a floor starts with. */
    secondChances: b.secondChance + gearSum(gear, 'secondChance'),
    /** Hints a fight starts with. */
    hints: b.hints + gearSum(gear, 'hints'),
    potionHearts: POTION_HEARTS + b.potionHearts,
    floorHearts: FLOOR_HEARTS + b.floorHearts
  }
}

/**
 * Swap the item worn in a slot. Raising maximum hearts does NOT fill the new heart; lowering it clamps the current hearts.
 * Second-chance charges and hints are never refilled by a swap (only clamped when the new maximum is lower).
 */
export function equipGear(run: Run, name: string, allGear: GearItem[], b: Bonuses): Run | null {
  const item = allGear.find(g => g.name === name)
  if (!item || !run.gear.includes(name) || run.loadout[item.slot] === name) return null
  return clampToGear({ ...run, loadout: { ...run.loadout, [item.slot]: name } }, b, allGear)
}
const clampToGear = (run: Run, b: Bonuses, allGear: GearItem[]): Run => {
  const s = playerStats(run, b, allGear)
  return { ...run, hearts: Math.min(run.hearts, s.maxHearts), secondLeft: Math.min(run.secondLeft, s.secondChances), hintsLeft: Math.min(run.hintsLeft, s.hints) }
}

const noReward = { xp: 0, gold: 0, loot: '', levelUps: 0, hearts: 0 }

/** Start the fight at (floor, kill). `newFloor` refills the per-floor second-chance charges: only on entering a floor (incl. floor 1). */
export function startFight(run: Run, b: Bonuses, enemies: Enemy[], allGear: GearItem[], newFloor = false): Run {
  const s = playerStats(run, b, allGear)
  return {
    ...run, phase: 'fighting', enemyHp: enemyStats(enemies, run.floor, run.kill).hp, hintsLeft: s.hints, secondLeft: newFloor ? s.secondChances : Math.min(run.secondLeft, s.secondChances),
    reward: noReward, pendingXp: 0,
    shield: isBoss(run.floor, run.kill) && hasShield(bossIdFor(run.floor)) ? shieldFor(run.floor) : 0
  }
}

/** A new run: full hearts at the final equipped maximum (starting gear included), START_POTIONS (+ Spare Vial). */
export function newRun(b: Bonuses, allGear: GearItem[], enemies: Enemy[]): Run {
  const start = allGear.filter(g => b.startGear.includes(g.name))
  const base: Run = {
    floor: 1, kill: 0, kills: 0, level: 1, xp: 0, hearts: 0, enemyHp: 0, gold: 0, potions: START_POTIONS + b.startPotions,
    gear: start.map(g => g.name), loadout: Object.fromEntries(start.map(g => [g.slot, g.name])) as Partial<Record<GearSlot, string>>, streak: 0, hintsLeft: 0, secondLeft: 0,
    recoveredFloor: 0, phase: 'fighting', reward: noReward, pendingXp: 0, shield: 0
  }
  return startFight({ ...base, hearts: playerStats(base, b, allGear).maxHearts }, b, enemies, allGear, true)
}

/** After a victory: move to the next enemy, or the next floor after the boss. Never restores hearts (the floor recovery happens on the boss kill). */
export function advance(run: Run, b: Bonuses, enemies: Enemy[], allGear: GearItem[]): Run {
  const done = run.kill + 1 >= ENEMIES_PER_FLOOR
  return startFight({ ...run, floor: done ? run.floor + 1 : run.floor, kill: done ? 0 : run.kill + 1 }, b, enemies, allGear, done)
}

export type AnswerInput = {
  run: Run; bonuses: Bonuses; enemies: Enemy[]; allGear: GearItem[]
  /** Mastery level of the word when asked (0 for a first-time intro). */
  lv: number
  isCorrect: boolean
  /** First practice of a newly introduced word: a wrong answer costs no heart and uses no second chance (it is still wrong). */
  practice?: boolean
  /** This answer can break the boss's shield / seals: a seal question (tone for the Golem, character for the Scribe), or the safe fallback when none can be asked. */
  sealQuestion?: boolean
  roll: { drop: number; item: number }
}
export type AnswerResult = {
  run: Run
  /** Damage dealt to the enemy (0 on any wrong answer). */
  damage: number
  /** Hearts the player lost: 0 or 1. Never on a correct answer. */
  heartsLost: number
  /** A wrong answer that was protected because it was the word's first practice. */
  practiceSaved: boolean
  /** A wrong answer whose heart was saved by a second-chance charge. */
  savedBySecondChance: boolean
  /** Hearts restored by clearing the floor (beating its boss); 0 otherwise or when already full. */
  heartsRestored: number
  outcome: 'continue' | 'victory' | 'defeat'; loot: GearItem | null; comboHit: boolean
  /** Shield / seals: a segment was broken by this answer / the shield was up and blocked the hit. */
  shieldBroken: boolean; shieldBlocked: boolean
}

export function resolveAnswer(i: AnswerInput): AnswerResult {
  const { run, bonuses: b, isCorrect } = i
  const gear = equippedGear(i.allGear, run.loadout)
  const stats = playerStats(run, b, i.allGear)
  const foe = enemyStats(i.enemies, run.floor, run.kill)

  // A correct answer attacks; a wrong answer never damages the enemy.
  let damage = 0, comboHit = false
  if (isCorrect) {
    let pct = MASTERY_DAMAGE[Math.min(i.lv, MASTERY_DAMAGE.length - 1)] + (i.lv >= 1 ? b.masteryDmgPct : 0) + gearSum(gear, 'masteryPct')
    if (run.streak >= 2) { pct += b.streakDmgPct; comboHit = b.streakDmgPct > 0 }
    if (run.enemyHp <= foe.hp * 0.35) pct += b.executeDmgPct
    damage = Math.round((8 + stats.attack) * (1 + pct))
    if (foe.boss === 'trickster') damage = Math.round(damage * TRICKSTER_HIT)
  }
  // Shield Golem / Ink Scribe: while the shield is up it blocks all damage; a correct seal answer breaks one segment.
  const shieldUp = run.shield > 0
  const shieldBroken = shieldUp && isCorrect && !!i.sealQuestion
  if (shieldUp) damage = 0
  const enemyHp = Math.max(0, run.enemyHp - damage)
  const killed = enemyHp === 0

  // Hearts: only an unprotected wrong answer costs one. Protection order: first practice, then a second-chance charge.
  let heartsLost = 0, practiceSaved = false, savedBySecondChance = false, secondLeft = run.secondLeft
  if (!isCorrect) {
    if (i.practice) practiceSaved = true
    else if (secondLeft > 0) { secondLeft -= 1; savedBySecondChance = true }
    else heartsLost = 1
  }
  let hearts = Math.max(0, run.hearts - heartsLost)

  // Experience is paid only when the monster dies: what each answer earned is banked in `pendingXp` and paid out with the kill.
  const answerXp = Math.round((isCorrect ? 5 : 2) * (1 + b.xpPct + gearSum(gear, 'xpPct')))
  let xpGained = 0
  let goldGained = 0, loot: GearItem | null = null, owned = run.gear, loadout = run.loadout
  if (killed) {
    xpGained = answerXp + run.pendingXp + foe.xp
    goldGained = Math.round(foe.gold * (1 + b.goldPct)) + gearSum(gear, 'goldFlat')
    const dropChance = Math.min(0.95, 0.5 + b.lootPct + (foe.boss ? 0.3 : 0))
    // Only gear you do not have yet can drop; once you own everything, kills simply drop nothing.
    // Boss-only gear never drops from normal fights; a boss kill guarantees its own item (once); after that bosses roll with a better chance.
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

  // Levels add attack only: no heart refill, no maximum-heart growth.
  let xp = run.xp + xpGained, level = run.level, levelUps = 0
  while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level += 1; levelUps += 1 }
  let next: Run = { ...run, level, xp, gear: owned, loadout, enemyHp, hearts, secondLeft, streak: isCorrect ? run.streak + 1 : 0, pendingXp: killed ? 0 : run.pendingXp + answerXp, shield: shieldBroken ? run.shield - 1 : run.shield }
  // Newly worn loot: a higher maximum is not filled, a lower one clamps.
  next = clampToGear(next, b, i.allGear)
  hearts = next.hearts

  // Clearing the floor (the boss kill) restores hearts exactly once per floor, before the floor summary.
  let heartsRestored = 0, recoveredFloor = run.recoveredFloor
  if (killed && isFinalFight(run.kill) && run.recoveredFloor < run.floor && hearts > 0 && run.floor % TUNING.recoveryEvery === 0) {
    const after = Math.min(playerStats(next, b, i.allGear).maxHearts, hearts + stats.floorHearts)
    heartsRestored = after - hearts; hearts = after; recoveredFloor = run.floor
  }

  const outcome = killed ? 'victory' : hearts <= 0 ? 'defeat' : 'continue'
  return {
    damage, heartsLost, practiceSaved, savedBySecondChance, heartsRestored, outcome, loot, comboHit, shieldBroken, shieldBlocked: shieldUp,
    run: {
      ...next, hearts, recoveredFloor,
      gold: run.gold + goldGained, kills: run.kills + (killed ? 1 : 0),
      phase: outcome === 'continue' ? 'fighting' : outcome,
      reward: killed ? { xp: xpGained, gold: goldGained, loot: loot?.name ?? '', levelUps, hearts: heartsRestored } : noReward
    }
  }
}

/** A potion restores POTION_HEARTS (+ Titan Heart), capped at the maximum. Not usable (and not used up) at full hearts. */
export function drinkPotion(run: Run, b: Bonuses, allGear: GearItem[]): Run | null {
  const s = playerStats(run, b, allGear)
  if (run.phase !== 'fighting' || run.potions < 1 || run.hearts <= 0 || run.hearts >= s.maxHearts) return null
  return { ...run, potions: run.potions - 1, hearts: Math.min(s.maxHearts, run.hearts + s.potionHearts) }
}

/**
 * End a run and bank every gold coin earned in it; level, gear and potions are lost with the run.
 * `returned`: the player chose "Return to camp" (not a defeat). Learning progress is never touched here.
 */
export function bankRun(meta: Meta, run: Run, returned = false): { meta: Meta; summary: RunSummary } {
  return {
    meta: { ...meta, gold: meta.gold + run.gold, bestFloor: Math.max(meta.bestFloor, run.floor), runs: meta.runs + 1 },
    summary: { floor: run.floor, kills: run.kills, level: run.level, goldBanked: run.gold, returned }
  }
}

/** 1 or 2: which phase of the boss fight this is (for the header and for choosing questions). */
export function bossPhase(run: Pick<Run, 'floor' | 'kill' | 'shield' | 'enemyHp'>, foeHp: number): 1 | 2 {
  if (!isBoss(run.floor, run.kill)) return 1
  const id = bossIdFor(run.floor)
  if (hasShield(id)) return run.shield > 0 ? 1 : 2
  if (id === 'trickster') return 1
  return run.enemyHp <= foeHp * WRAITH_ECHO_AT ? 2 : 1
}
