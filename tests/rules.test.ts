import test from 'node:test'
import assert from 'node:assert/strict'
import { ENEMIES, GEAR } from '../src/data.ts'
import { NO_BONUSES, computeBonuses, type Bonuses } from '../src/game/upgrades.ts'
import {
  ENEMIES_PER_FLOOR, advance, bankRun, drinkPotion, enemyStats, equipGear, newRun, playerStats, resolveAnswer, startFight
} from '../src/game/rules.ts'

const none: Bonuses = { ...NO_BONUSES }
const run0 = () => newRun(none, GEAR, ENEMIES)
const ask = (run = run0(), over: Partial<Parameters<typeof resolveAnswer>[0]> = {}) =>
  resolveAnswer({ run, bonuses: none, enemies: ENEMIES, allGear: GEAR, lv: 0, isCorrect: true, roll: { drop: 0.99, item: 0 }, ...over })

test('a new run is level 1, no gear, full hp, floor 1', () => {
  const r = run0()
  assert.deepEqual([r.floor, r.kill, r.level, r.gear.length, r.hp, r.potions], [1, 0, 1, 0, 30, 1])
  assert.equal(r.enemyHp, ENEMIES[0].hp)
})

test('upgrades shape the start of a run but gear/level never carry over', () => {
  const b = computeBonuses(['G1', 'G2', 'S1', 'S3', 'F3'])
  const r = newRun(b, GEAR, ENEMIES)
  assert.equal(r.hp, 38); assert.equal(r.potions, 2); assert.equal(r.hintsLeft, 1); assert.equal(r.secondLeft, 1)
  assert.deepEqual(r.gear, ['Copper Blade']); assert.equal(r.loadout.Weapon, 'Copper Blade'); assert.equal(r.level, 1); assert.equal(r.gold, 0)
  assert.equal(playerStats(r, b, GEAR).attack, 7)
})

test('enemies scale with floor; the 4th enemy is an elite', () => {
  const f1 = enemyStats(ENEMIES, 1, 0), f5 = enemyStats(ENEMIES, 5, 0)
  assert.ok(f5.hp > f1.hp && f5.damage > f1.damage && f5.xp > f1.xp && f5.gold > f1.gold)
  const elite = enemyStats(ENEMIES, 1, ENEMIES_PER_FLOOR - 1), normal = enemyStats(ENEMIES, 1, ENEMIES_PER_FLOOR - 2)
  assert.ok(elite.elite && !normal.elite && elite.xp >= normal.xp * 1.5 && elite.gold >= normal.gold * 1.5)
  assert.equal(enemyStats(ENEMIES, 1, 0).hp, 24)
})

test('correct answer: damage, learning xp; wrong answer: weak hit and counterattack', () => {
  const ok = ask(); assert.equal(ok.damage, 13); assert.equal(ok.run.enemyHp, 11); assert.equal(ok.run.hp, 25); assert.equal(ok.run.xp, 5)
  const bad = ask(run0(), { isCorrect: false }); assert.equal(bad.damage, 2); assert.equal(bad.run.hp, 25); assert.equal(bad.run.streak, 0)
})

test('harder (higher mastery) questions deal more damage', () => {
  const dmg = [0, 1, 2, 3, 4].map(lv => ask(run0(), { lv }).damage)
  assert.deepEqual(dmg, [13, 14, 16, 18, 18])
  assert.ok(ask(run0(), { lv: 3, bonuses: computeBonuses(['S1', 'S2', 'S3', 'S4']) }).damage > 18)
})

test('killing blow: no counterattack, rewards once, hp never below 0 or above max', () => {
  const r = { ...run0(), enemyHp: 5 }
  const k = ask(r); assert.equal(k.outcome, 'victory'); assert.equal(k.run.hp, 30); assert.equal(k.run.phase, 'victory')
  assert.equal(k.run.gold, ENEMIES[0].gold); assert.equal(k.run.kills, 1); assert.equal(k.run.reward.gold, ENEMIES[0].gold)
  const d = ask({ ...run0(), hp: 3 }); assert.equal(d.outcome, 'defeat'); assert.equal(d.run.hp, 0); assert.equal(d.run.phase, 'defeat')
})

test('armor reduces counters (min 1); second chance blocks one counter per fight', () => {
  const arm = { ...none, armor: 2 }
  assert.equal(ask(run0(), { bonuses: arm, isCorrect: false }).run.hp, 27)
  const bootsRun = { ...run0(), gear: ['Windrunner Boots'], loadout: { Armor: 'Windrunner Boots' } }
  assert.equal(ask(bootsRun, { isCorrect: false }).run.hp, 26)
  assert.equal(ask(run0(), { bonuses: { ...none, armor: 99 }, isCorrect: false }).run.hp, 29)
  const b = { ...none, secondChance: 1 }, r = startFight(run0(), b, ENEMIES)
  const first = ask(r, { bonuses: b, isCorrect: false }); assert.ok(first.savedBySecondChance); assert.equal(first.run.hp, 30)
  const second = ask(first.run, { bonuses: b, isCorrect: false }); assert.ok(!second.savedBySecondChance); assert.equal(second.run.hp, 25)
})

test('combo and execute bonuses', () => {
  const b = { ...none, streakDmgPct: 0.25, executeDmgPct: 0.35 }
  assert.equal(ask({ ...run0(), streak: 1 }, { bonuses: b }).damage, 13)
  assert.equal(ask({ ...run0(), streak: 2 }, { bonuses: b }).damage, Math.round(13 * 1.25))
  assert.equal(ask({ ...run0(), enemyHp: 8 }, { bonuses: b }).damage, Math.round(13 * 1.35))
})

test('loot: new gear is added, duplicates become gold; elites drop more often', () => {
  const r = { ...run0(), enemyHp: 1 }
  const drop = ask(r, { roll: { drop: 0.1, item: 0 } }); assert.equal(drop.loot?.name, GEAR[0].name); assert.deepEqual(drop.run.gear, [GEAR[0].name]); assert.equal(drop.run.loadout.Weapon, GEAR[0].name)
  const dup = ask({ ...r, gear: [GEAR[0].name] }, { roll: { drop: 0.1, item: 0 } }); assert.equal(dup.loot, null); assert.equal(dup.duplicateGold, 4)
  const elite = { ...r, kill: ENEMIES_PER_FLOOR - 1 }
  assert.ok(ask(elite, { roll: { drop: 0.7, item: 0.5 } }).loot, 'elite drops at 0.7')
  assert.equal(ask(r, { roll: { drop: 0.7, item: 0.5 } }).loot, null, 'normal does not')
})

test('gold, xp, heal-on-kill bonuses and gear', () => {
  const b = computeBonuses(['F1', 'S2', 'G1', 'G2', 'G3', 'G4'])
  const r = { ...newRun(b, GEAR, ENEMIES), enemyHp: 1, hp: 20 }
  const k = ask(r, { bonuses: b }); assert.equal(k.run.reward.gold, Math.round(ENEMIES[0].gold * 1.2)); assert.equal(k.run.hp, 25)
  assert.equal(ask({ ...r, gear: ['Lucky Coin'], loadout: { Accessory: 'Lucky Coin' } }, { bonuses: none }).run.reward.gold, ENEMIES[0].gold + 3)
})

test('multiple level-ups in one fight; level raises max hp and attack', () => {
  const r = { ...run0(), enemyHp: 1, xp: 29 }
  const k = ask(r); assert.equal(k.run.level, 2); assert.equal(k.run.reward.levelUps, 1)
  assert.deepEqual([playerStats(k.run, none, GEAR).maxHp, playerStats(k.run, none, GEAR).attack], [35, 6])
  const big = resolveAnswer({ run: { ...r, xp: 0 }, bonuses: none, enemies: ENEMIES, allGear: GEAR, lv: 0, isCorrect: true, roll: { drop: 1, item: 0 } })
  assert.ok(big.run.hp <= playerStats(big.run, none, GEAR).maxHp)
})

test('advance walks 4 enemies then the next floor, resetting per-fight charges', () => {
  const b = { ...none, hints: 2 }
  let r = newRun(b, GEAR, ENEMIES)
  for (let i = 1; i < ENEMIES_PER_FLOOR; i++) { r = advance({ ...r, hintsLeft: 0 }, b, ENEMIES); assert.equal(r.floor, 1); assert.equal(r.kill, i); assert.equal(r.hintsLeft, 2) }
  r = advance(r, b, ENEMIES); assert.deepEqual([r.floor, r.kill], [2, 0]); assert.equal(r.enemyHp, enemyStats(ENEMIES, 2, 0).hp); assert.equal(r.phase, 'fighting')
})

test('gear can be swapped within a slot and HP adjusts safely', () => {
  const r = { ...run0(), gear: ['Mossy Vest', 'Guardian Helm'], loadout: { Armor: 'Mossy Vest' }, hp: 38 }
  const swapped = equipGear(r, 'Guardian Helm', GEAR)!
  assert.equal(swapped.loadout.Armor, 'Guardian Helm')
  assert.equal(playerStats(swapped, none, GEAR).maxHp, 34)
  assert.equal(swapped.hp, 34)
  assert.equal(equipGear(swapped, 'Copper Blade', GEAR), null, 'cannot equip an item not owned')
})

test('potions', () => {
  const r = { ...run0(), hp: 10 }
  assert.equal(drinkPotion(r, none, GEAR)?.hp, 22)
  assert.equal(drinkPotion(r, { ...none, potionHeal: 8 }, GEAR)?.hp, 30)
  assert.equal(drinkPotion(run0(), none, GEAR), null); assert.equal(drinkPotion({ ...r, potions: 0 }, none, GEAR), null)
  assert.equal(drinkPotion({ ...r, hp: 0 }, none, GEAR), null); assert.equal(drinkPotion({ ...r, phase: 'victory' }, none, GEAR), null)
})

test('dying banks all gold, records best floor, and loses nothing else permanent', () => {
  const meta = { gold: 10, upgrades: ['W1'], bestFloor: 3, runs: 2 }
  const { meta: m, summary } = bankRun(meta, { ...run0(), gold: 55, floor: 5, kills: 17, level: 4 })
  assert.deepEqual(m, { gold: 65, upgrades: ['W1'], bestFloor: 5, runs: 3 })
  assert.deepEqual(summary, { floor: 5, kills: 17, level: 4, goldBanked: 55 })
  assert.equal(bankRun(meta, { ...run0(), floor: 2 }).meta.bestFloor, 3)
})
