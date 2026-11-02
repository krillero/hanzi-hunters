// Pure run / combat rules: no React, Phaser or DOM. Covered by tests/.
//
// Hearts (docs/GAME_DESIGN.md):
//  - a correct answer attacks the enemy and never costs a heart;
//  - a wrong answer deals no damage and costs exactly one heart, unless it is protected
//    (first practice of a new word, then a second-chance charge);
//  - zero hearts ends the run. Enemies have HP but no attack.
//
// Expeditions: a run is EXPEDITION_FLOORS floors; beating the final boss (the Cavern Warden on the last floor) wins it.
// Nothing restores hearts by itself: only potions and the Second Wind upgrade (+1 heart per floor cleared).
// Second-chance charges are one pool for the whole expedition (capped), never refilled during it.
import { BOSSES, type BossId, type Enemy, type GearItem, type GearSlot } from '../data.ts'
import type { Meta, Run, RunSummary } from './types.ts'
import type { Bonuses } from './upgrades.ts'
import { MASTERY_DAMAGE } from './mastery.ts'
import { gearVerdict } from './rarity.ts'

export const ENEMIES_PER_FLOOR = 4
/** Floors per expedition; the last one ends with the final boss. */
export const EXPEDITION_FLOORS = 5

/**
 * Depths: winning an expedition at depth d unlocks depth d+1 (cleared depths can be replayed). A deeper expedition asks harder kinds
 * of questions (see `challengeFor`; only kinds each word is already eligible for), pays more gold and a bigger victory bonus,
 * and its final boss is tougher. Names only for now (placeholder art).
 */
export const DEPTHS = [
  { name: 'Mosslight Cavern', note: 'Recognise your words' },
  { name: 'Ember Halls', note: 'More recall questions' },
  { name: 'Frost Archive', note: 'Pinyin and listening come often' },
  { name: 'Sunken Library', note: 'Mostly recall' },
  { name: 'Jade Throne', note: 'The hardest mix' }
]
export const MAX_DEPTH = DEPTHS.length
export const depthName = (depth: number) => DEPTHS[Math.min(MAX_DEPTH, Math.max(1, depth)) - 1].name
/** Depths you may start: every cleared one and the next. */
export const unlockedDepth = (depthCleared: number) => Math.min(MAX_DEPTH, depthCleared + 1)
/** 0..1: how far the question mix leans toward recall kinds. Rises with depth and, a little, with the floor. */
export const challengeFor = (depth: number, floor: number) => Math.min(1, Math.max(0, ((depth - 1) + (floor - 1) / 4) / MAX_DEPTH))
/** Gold and XP from enemies: +25 % per depth below the first. */
export const depthRewardMult = (depth: number) => 1 + 0.25 * (Math.max(1, depth) - 1)
/** The final boss gets +15 % HP per depth below the first. */
export const depthBossHpMult = (depth: number) => 1 + 0.15 * (Math.max(1, depth) - 1)
/** Gold added when an expedition is won. */
export const victoryBonus = (depth: number) => 40 * Math.max(1, depth)
/**
 * Warden Sigil: a relic kept forever instead of loot (the expedition ends right after the Cavern Warden). Its level is the number
 * of depths cleared (Meta.depthCleared), fixed for each expedition when it starts (Run.sigil). No slot, nothing to manage.
 * Mutable only so the simulator can compare settings; the game never changes it.
 */
export const SIGIL = { hints: 1, masteryBase: 0.10, masteryPerLevel: 0.05 }
export const sigilBonus = (level = 0) => level > 0
  ? { hints: SIGIL.hints, masteryPct: SIGIL.masteryBase + SIGIL.masteryPerLevel * (level - 1) }
  : { hints: 0, masteryPct: 0 }
/** "+15% mastery damage · +1 hint per fight" for a Sigil level (empty below level 1). */
export const sigilText = (level = 0) => { const s = sigilBonus(level); return level > 0 ? `+${Math.round(s.masteryPct * 100)}% mastery damage · +${s.hints} hint per fight` : '' }
export const BASE_ATTACK = 5
export const ATTACK_PER_LEVEL = 1
export const xpForLevel = (level: number) => level * 30

/** Hearts: a run starts with START_HEARTS full hearts; upgrades and gear add more, up to MAX_HEARTS in total. */
export const START_HEARTS = 5
export const MAX_HEARTS = 8
export const START_POTIONS = 1
/** A potion restores this many hearts (+ Titan Heart). */
export const POTION_HEARTS = 1
/** Clearing a floor restores this many hearts without upgrades: none. Second Wind adds its own (floorHearts). */
export const FLOOR_HEARTS = 0
/** The most second-chance charges an expedition can start with (upgrades). */
export const SECOND_CHANCE_CAP = 3
/**
 * Enemy HP grows this much per floor of the expedition (compounding), roughly matching the attack the player gains from levels,
 * so fights keep a similar, bounded length. Chosen with tools/simulate.ts (see docs/GAME_DESIGN.md "Balance").
 * golemTrial: 1 offers the Golem's Tone Trial, 0 never (simulator comparisons). golemTrialHit: share of the Golem's max HP a right Tone Trial answer removes (game/trials.ts; never the killing blow).
 * wardenTrial: 1 offers the Cavern Warden's Gauntlet (tones break its last ward, a character every seal), 0 never.
 * tricksterTrial: 1 offers the Mirror Trickster's Mirrors; tricksterTrialHit: share of its max HP a right answer removes (never the killing blow).
 * scribeTrial: 1 offers the Ink Scribe's Torn Note (a right character breaks every remaining seal), 0 never.
 * wraithTrial: 1 offers the Echo Wraith's Wail (a right reply calms it: the next wrong answer this expedition costs no heart), 0 never.
 * Mutable only so the simulator can compare settings; the game never changes it.
 */
export const TUNING = { enemyHpGrowth: 1.16, enemyHpScale: 1, depthEnemyHp: 0.3, golemTrial: 1, golemTrialHit: 0.25, wraithTrial: 1, scribeTrial: 1, tricksterTrial: 1, tricksterTrialHit: 0.3, wardenTrial: 1 }

export const SHIELD_SEGMENTS = 3   // the most a shield ever has
/** Boss multipliers over the base enemy stats (before the per-floor scaling). Early floors get a gentler boss: they ramp up to the full values. */
export const BOSS_HP = 1.7, BOSS_REWARD = 2
export const bossHpMult = (floor: number) => Math.min(BOSS_HP, 1.3 + 0.15 * (floor - 1))
/** Bosses with a shield / seals. The Cavern Warden has both: tone wards first, then ink seals. */
export const hasShield = (id: BossId) => id === 'golem' || id === 'scribe' || id === 'warden'
/** Cavern Warden: tone wards and ink seals (the shield counts both: the top WARDEN_WARDS segments are wards). */
export const WARDEN_WARDS = 2, WARDEN_SEALS = 2
/** Which question kind breaks the shield right now (the question's `ask`): tone (pinyin) or character (hanzi) questions. */
export function sealAsk(boss: BossId, shield: number): 'pinyin' | 'hanzi' | null {
  if (boss === 'golem') return 'pinyin'
  if (boss === 'scribe') return 'hanzi'
  if (boss === 'warden') return shield > WARDEN_SEALS ? 'pinyin' : 'hanzi'
  return null
}
/** Mirror Trickster: a right answer hits harder. */
export const TRICKSTER_HIT = 1.4
/** Mirror Trickster: below this share of its HP it offers its Mirrors trial (game/trials.ts). */
export const TRICKSTER_LOW = 0.5
/** Shield / seals: 2 segments on the first floors, 3 from floor 3; the Warden has 2 wards + 2 seals. */
export const shieldFor = (floor: number, boss: BossId | null = null) => (boss === 'warden' ? WARDEN_WARDS + WARDEN_SEALS : floor <= 2 ? 2 : SHIELD_SEGMENTS)

/** The last fight of a floor. Every floor ends with a boss. */
export const isFinalFight = (kill: number) => kill === ENEMIES_PER_FLOOR - 1
/** `floor` is kept in the signature so a later design can skip bosses on some floors. */
export const isBoss = (_floor: number, kill: number) => isFinalFight(kill)
/** Floors 1-4: Golem, Wraith, Scribe, Trickster. The last floor of the expedition: the Cavern Warden. */
export const BOSS_ORDER: BossId[] = ['golem', 'wraith', 'scribe', 'trickster']
export const FINAL_BOSS: BossId = 'warden'
export const bossIdFor = (floor: number): BossId => (floor >= EXPEDITION_FLOORS ? FINAL_BOSS : BOSS_ORDER[(Math.max(1, floor) - 1) % BOSS_ORDER.length])
/** The final boss is beaten: the expedition is won (the run ends after the floor summary). */
export const isExpeditionWon = (run: Pick<Run, 'floor' | 'kill' | 'phase'>) => run.phase === 'victory' && run.floor >= EXPEDITION_FLOORS && isFinalFight(run.kill)
/** Echo Wraith: below this share of its HP it starts echoing the question kind you missed. */
export const WRAITH_ECHO_AT = 0.6
export const equippedGear = (all: GearItem[], loadout: Partial<Record<GearSlot, string>>) =>
  all.filter(g => loadout[g.slot] === g.name)
const gearSum = (gear: GearItem[], key: 'attack' | 'maxHearts' | 'hints' | 'xpPct' | 'masteryPct' | 'goldFlat') => gear.reduce((n, g) => n + g[key], 0)

export type EnemyStats = { enemy: Enemy; hp: number; xp: number; gold: number; boss: BossId | null }
/** Per floor (compounding): enemy HP x TUNING.enemyHpGrowth, rewards +8 %; the last enemy of a floor is a boss. */
export function enemyStats(enemies: Enemy[], floor: number, kill: number, depth = 1): EnemyStats {
  const boss = isBoss(floor, kill) ? bossIdFor(floor) : null
  const reward = depthRewardMult(depth)
  const enemy = boss ? BOSSES[boss] : enemies[(((floor - 1) * ENEMIES_PER_FLOOR) + kill) % enemies.length]
  const f = floor - 1
  return {
    enemy, boss,
    hp: Math.round(enemy.hp * TUNING.enemyHpScale * TUNING.enemyHpGrowth ** f * (boss ? bossHpMult(floor) : 1) * (boss === FINAL_BOSS ? depthBossHpMult(depth) : 1) * (1 + TUNING.depthEnemyHp * (Math.max(1, depth) - 1))),
    xp: Math.round(enemy.xp * 1.08 ** f * (boss ? BOSS_REWARD : 1) * reward),
    gold: Math.round(enemy.gold * 1.08 ** f * (boss ? BOSS_REWARD : 1) * reward)
  }
}

/** Everything the equipped gear and upgrades give. Levels add attack only (never hearts). */
export function playerStats(run: Pick<Run, 'level' | 'loadout'> & { sigil?: number }, b: Bonuses, allGear: GearItem[]) {
  const gear = equippedGear(allGear, run.loadout)
  return {
    maxHearts: Math.min(MAX_HEARTS, START_HEARTS + b.maxHearts + gearSum(gear, 'maxHearts')),
    attack: BASE_ATTACK + b.attack + ATTACK_PER_LEVEL * (run.level - 1) + gearSum(gear, 'attack'),
    /** Second-chance charges an expedition starts with (capped). */
    secondChances: Math.min(SECOND_CHANCE_CAP, b.secondChance),
    /** Hints a fight starts with. */
    hints: b.hints + gearSum(gear, 'hints') + sigilBonus(run.sigil).hints,
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

/** Start the fight at (floor, kill). Hints refill per fight; second-chance charges never refill during an expedition. */
export function startFight(run: Run, b: Bonuses, enemies: Enemy[], allGear: GearItem[]): Run {
  const s = playerStats(run, b, allGear)
  const boss = isBoss(run.floor, run.kill) ? bossIdFor(run.floor) : null
  return {
    ...run, phase: 'fighting', enemyHp: enemyStats(enemies, run.floor, run.kill, run.depth).hp, hintsLeft: s.hints, secondLeft: Math.min(run.secondLeft, s.secondChances),
    reward: noReward, pendingXp: 0,
    shield: boss && hasShield(boss) ? shieldFor(run.floor, boss) : 0
  }
}

/** A new expedition at `depth`: full hearts at the final equipped maximum (starting gear included), START_POTIONS (+ Spare Vial). */
/** `sigil`: the Warden Sigil's level for this expedition (Meta.depthCleared when it starts). */
export function newRun(b: Bonuses, allGear: GearItem[], enemies: Enemy[], depth = 1, sigil = 0): Run {
  const start = allGear.filter(g => b.startGear.includes(g.name))
  const base: Run = {
    depth: Math.min(MAX_DEPTH, Math.max(1, depth)), floor: 1, kill: 0, kills: 0, level: 1, xp: 0, hearts: 0, enemyHp: 0, gold: 0, potions: START_POTIONS + b.startPotions,
    gear: start.map(g => g.name), loadout: Object.fromEntries(start.map(g => [g.slot, g.name])) as Partial<Record<GearSlot, string>>, streak: 0, hintsLeft: 0, secondLeft: 0,
    recoveredFloor: 0, phase: 'fighting', reward: noReward, pendingXp: 0, shield: 0, sigil: Math.min(MAX_DEPTH, Math.max(0, Math.floor(sigil)))
  }
  const s = playerStats(base, b, allGear)
  return startFight({ ...base, hearts: s.maxHearts, secondLeft: s.secondChances }, b, enemies, allGear)
}

/** After a victory: move to the next enemy, or the next floor after the boss. Never restores hearts. A won expedition does not advance (null). */
export function advance(run: Run, b: Bonuses, enemies: Enemy[], allGear: GearItem[]): Run | null {
  if (isExpeditionWon(run)) return null
  const done = run.kill + 1 >= ENEMIES_PER_FLOOR
  return startFight({ ...run, floor: done ? run.floor + 1 : run.floor, kill: done ? 0 : run.kill + 1 }, b, enemies, allGear)
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
  /** A wrong answer whose heart was saved by the calmed Echo Wraith (`Run.calm`, from its trial). */
  savedByCalm: boolean
  /** An event's Blessing saved this heart (`Run.omen`). */
  savedByBlessing: boolean
  /** Hearts restored by clearing the floor (Second Wind only); 0 otherwise, when already full, or on the final floor. */
  heartsRestored: number
  outcome: 'continue' | 'victory' | 'defeat'; loot: GearItem | null; comboHit: boolean
  /** Shield / seals: a segment was broken by this answer / the shield was up and blocked the hit. */
  shieldBroken: boolean; shieldBlocked: boolean
}

export function resolveAnswer(i: AnswerInput): AnswerResult {
  const { run, bonuses: b, isCorrect } = i
  const gear = equippedGear(i.allGear, run.loadout)
  const stats = playerStats(run, b, i.allGear)
  const foe = enemyStats(i.enemies, run.floor, run.kill, run.depth)

  // A correct answer attacks; a wrong answer never damages the enemy.
  let damage = 0, comboHit = false
  if (isCorrect) {
    let pct = MASTERY_DAMAGE[Math.min(i.lv, MASTERY_DAMAGE.length - 1)] + (i.lv >= 1 ? b.masteryDmgPct : 0) + gearSum(gear, 'masteryPct') + sigilBonus(run.sigil).masteryPct
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

  // Hearts: only an unprotected wrong answer costs one. Protection order: first practice, then the calmed Wraith's charge
  // (kept until used, this expedition), then a second-chance charge.
  let heartsLost = 0, practiceSaved = false, savedBySecondChance = false, savedByCalm = false, savedByBlessing = false
  let secondLeft = run.secondLeft, calm = run.calm ?? 0, omen = run.omen
  // An event's Blessing counts only on the floor it was given for, once (see game/encounters.ts).
  const omenNow = omen && omen.floor === run.floor ? omen.kind : null
  if (!isCorrect) {
    if (i.practice) practiceSaved = true
    else if (omenNow === 'blessing') { savedByBlessing = true; omen = undefined }
    else if (calm > 0) { calm -= 1; savedByCalm = true }
    else if (secondLeft > 0) { secondLeft -= 1; savedBySecondChance = true }
    else heartsLost = 1
  }
  heartsLost = Math.min(heartsLost, run.hearts)   // never more hearts than are left
  let hearts = run.hearts - heartsLost

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
    // The Cavern Warden ends the expedition: loot would vanish at once, so it drops nothing (its reward is the Warden Sigil).
    if (foe.boss === FINAL_BOSS) item = undefined
    else if (bossItem) item = bossItem
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
  let next: Run = { ...run, level, xp, gear: owned, loadout, enemyHp, hearts, secondLeft, calm, omen, streak: isCorrect ? run.streak + 1 : 0, pendingXp: killed ? 0 : run.pendingXp + answerXp, shield: shieldBroken ? run.shield - 1 : run.shield }
  // Newly worn loot: a higher maximum is not filled, a lower one clamps.
  next = clampToGear(next, b, i.allGear)
  hearts = next.hearts

  // Clearing a floor (the boss kill) restores hearts only with Second Wind, exactly once per floor, before the floor summary.
  // The final floor ends the expedition, so nothing is restored there.
  let heartsRestored = 0, recoveredFloor = run.recoveredFloor
  if (killed && isFinalFight(run.kill) && run.recoveredFloor < run.floor && hearts > 0 && run.floor < EXPEDITION_FLOORS && stats.floorHearts > 0) {
    const after = Math.min(playerStats(next, b, i.allGear).maxHearts, hearts + stats.floorHearts)
    heartsRestored = after - hearts; hearts = after; recoveredFloor = run.floor
  }

  const outcome = killed ? 'victory' : hearts <= 0 ? 'defeat' : 'continue'
  return {
    damage, heartsLost, practiceSaved, savedBySecondChance, savedByCalm, savedByBlessing, heartsRestored, outcome, loot, comboHit, shieldBroken, shieldBlocked: shieldUp,
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

export type RunResult = 'won' | 'defeat' | 'returned'
/**
 * End an expedition and bank every gold coin earned in it; level, gear and potions are lost with the run.
 * `won`: the final boss was beaten (adds the victory bonus and clears the depth); `returned`: "Return to camp" (not a defeat).
 * Learning progress is never touched here.
 */
export function bankRun(meta: Meta, run: Run, result: RunResult): { meta: Meta; summary: RunSummary } {
  const won = result === 'won'
  const bonus = won ? victoryBonus(run.depth) : 0
  const depthCleared = won ? Math.max(meta.depthCleared, run.depth) : meta.depthCleared
  return {
    meta: { ...meta, gold: meta.gold + run.gold + bonus, bestFloor: Math.max(meta.bestFloor, run.floor), runs: meta.runs + 1, wins: meta.wins + (won ? 1 : 0), depthCleared },
    summary: { floor: run.floor, kills: run.kills, level: run.level, goldBanked: run.gold + bonus, bonus, result, depth: run.depth, unlocked: won && run.depth > meta.depthCleared && run.depth < MAX_DEPTH ? run.depth + 1 : 0 }
  }
}

/** Which phase of the boss fight this is (for the header and for choosing questions). The Warden has 3: wards, seals, echo. */
export function bossPhase(run: Pick<Run, 'floor' | 'kill' | 'shield' | 'enemyHp'>, foeHp: number): 1 | 2 | 3 {
  if (!isBoss(run.floor, run.kill)) return 1
  const id = bossIdFor(run.floor)
  if (id === 'warden') return run.shield > WARDEN_SEALS ? 1 : run.shield > 0 ? 2 : 3
  if (hasShield(id)) return run.shield > 0 ? 1 : 2
  if (id === 'trickster') return 1
  return run.enemyHp <= foeHp * WRAITH_ECHO_AT ? 2 : 1
}
