import test from 'node:test'
import assert from 'node:assert/strict'
import { BOSSES, ENEMIES, GEAR } from '../src/data.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { sanitizeSave } from '../src/game/save.ts'
import {
  BOSS_HP, BOSS_ORDER, bossDamageMult, bossHpMult, ENEMIES_PER_FLOOR, SHIELD_SEGMENTS, advance, bossIdFor, bossPhase, enemyStats, isBoss, isFinalFight, newRun, resolveAnswer, startFight
} from '../src/game/rules.ts'
import type { Run } from '../src/game/types.ts'

const none = { ...NO_BONUSES }
const last = ENEMIES_PER_FLOOR - 1
/** A run at the boss fight of `floor`. */
const bossRun = (floor: number, over: Partial<Run> = {}): Run => ({ ...startFight({ ...newRun(none, GEAR, ENEMIES), floor, kill: last, level: 10 }, none, ENEMIES), hp: 400, ...over })
const ask = (run: Run, over: Partial<Parameters<typeof resolveAnswer>[0]> = {}) =>
  resolveAnswer({ run, bonuses: none, enemies: ENEMIES, allGear: GEAR, lv: 0, isCorrect: true, roll: { drop: 0.99, item: 0 }, ...over })

test('every floor ends with a boss, and the bosses take turns', () => {
  for (const f of [1, 2, 3, 4, 5, 10, 15]) assert.ok(isBoss(f, last) && isFinalFight(last), `floor ${f}`)
  for (const f of [1, 5, 9]) assert.ok(!isBoss(f, 0) && !isBoss(f, 2), 'only the last fight of the floor')
  assert.deepEqual([1, 2, 3, 4, 5, 10].map(bossIdFor), ['golem', 'wraith', 'golem', 'wraith', 'golem', 'wraith'])
  assert.deepEqual(BOSS_ORDER, ['golem', 'wraith'])
})

test('boss stats: own name and sprite, bigger than a normal enemy of the same floor', () => {
  const b = enemyStats(ENEMIES, 5, last), normal = enemyStats(ENEMIES, 5, 0)
  assert.equal(b.boss, 'golem'); assert.equal(b.enemy.name, 'Shield Golem'); assert.equal(b.enemy.sprite, 'golem')
  assert.equal(b.hp, Math.round(BOSSES.golem.hp * 1.16 ** 4 * BOSS_HP))
  assert.ok(b.hp > normal.hp && b.xp > normal.xp && b.gold > normal.gold)
  assert.equal(enemyStats(ENEMIES, 2, last).enemy.name, 'Echo Wraith'); assert.equal(enemyStats(ENEMIES, 1, last).enemy.name, 'Shield Golem')
  assert.equal(normal.boss, null)
})

test('only the golem fight starts with a shield', () => {
  assert.equal(bossRun(1).shield, 2, 'floors 1-2: a 2-segment shield'); assert.equal(bossRun(3).shield, SHIELD_SEGMENTS); assert.equal(bossRun(5).shield, SHIELD_SEGMENTS)
  assert.equal(bossRun(2).shield, 0, 'the wraith has no shield')
  assert.equal(startFight({ ...newRun(none, GEAR, ENEMIES), floor: 5, kill: 0 }, none, ENEMIES).shield, 0, 'not the last fight')
  const next = advance({ ...bossRun(5), kill: last - 1, phase: 'victory' }, none, ENEMIES)
  assert.equal(next.shield, SHIELD_SEGMENTS, 'arriving at the boss raises the shield')
  assert.equal(advance({ ...bossRun(5), phase: 'victory' }, none, ENEMIES).shield, 0, 'floor 6 starts with a normal enemy and no shield')
})

test('the shield blocks damage; only a correct tone answer breaks a segment', () => {
  const r = bossRun(5)
  const tone = ask(r, { toneQuestion: true })
  assert.equal(tone.damage, 0); assert.equal(tone.run.enemyHp, r.enemyHp); assert.equal(tone.run.shield, SHIELD_SEGMENTS - 1); assert.ok(tone.shieldBroken && tone.shieldBlocked)
  const notTone = ask(r, { toneQuestion: false })
  assert.equal(notTone.damage, 0); assert.equal(notTone.run.shield, SHIELD_SEGMENTS); assert.ok(!notTone.shieldBroken && notTone.shieldBlocked)
  const wrong = ask(r, { toneQuestion: true, isCorrect: false })
  assert.equal(wrong.run.shield, SHIELD_SEGMENTS, 'a wrong answer never breaks and never repairs')
  assert.ok(tone.counter > 0, 'the boss still hits back while shielded')
  let cur = r
  for (let k = 0; k < SHIELD_SEGMENTS; k++) cur = ask(cur, { toneQuestion: true }).run
  assert.equal(cur.shield, 0)
  const open = ask(cur, { toneQuestion: false })
  assert.ok(open.damage > 0 && !open.shieldBlocked, 'shield down: normal damage')
  assert.equal(bossPhase(r, enemyStats(ENEMIES, 5, last).hp), 1); assert.equal(bossPhase(cur, enemyStats(ENEMIES, 5, last).hp), 2)
})

test('wraith: phase 2 starts below 60% HP', () => {
  const foe = enemyStats(ENEMIES, 2, last), r = bossRun(2)
  assert.equal(bossPhase(r, foe.hp), 1)
  assert.equal(bossPhase({ ...r, enemyHp: Math.floor(foe.hp * 0.6) }, foe.hp), 2)
  assert.equal(bossPhase({ ...newRun(none, GEAR, ENEMIES), floor: 3, kill: 0 }, 10), 1, 'not a boss fight (an earlier fight of the floor)')
})

test('a boss kill guarantees its own item once, whatever the roll; normal fights never drop boss gear', () => {
  const golem = ask({ ...bossRun(5), enemyHp: 1, shield: 0 }, { roll: { drop: 0.999, item: 0.5 } })
  assert.equal(golem.outcome, 'victory'); assert.equal(golem.loot?.name, 'Golem Plate'); assert.equal(golem.run.loadout.Armor, golem.run.loadout.Armor)
  const wraith = ask({ ...bossRun(2), enemyHp: 1 }, { roll: { drop: 0.999, item: 0.5 } })
  assert.equal(wraith.loot?.name, 'Wraith Lantern')
  const owned = { ...bossRun(5), enemyHp: 1, shield: 0, gear: ['Golem Plate'] }
  const again = ask(owned, { roll: { drop: 0.1, item: 0 } })
  assert.ok(again.loot && !again.loot.boss, 'own item already owned: it rolls like a lucky kill for other gear')
  assert.equal(ask(owned, { roll: { drop: 0.99, item: 0 } }).loot, null, 'and can miss')
  for (let k = 0; k < 40; k++) {
    const normal = ask({ ...newRun(none, GEAR, ENEMIES), enemyHp: 1, kill: 0 }, { roll: { drop: 0.1, item: k / 40 } })
    assert.ok(normal.loot && !normal.loot.boss, 'no boss gear from normal fights')
  }
})

test('saves: the shield is only kept for a golem fight, and clamped', () => {
  const base = { version: 2, meta: { gold: 0, upgrades: [], bestFloor: 5, runs: 1 }, mastery: {}, lastRun: null }
  const run = (floor: number, kill: number, extra: object = {}) => ({ floor, kill, kills: 0, level: 1, xp: 0, pendingXp: 0, hp: 30, enemyHp: 9999, gold: 0, potions: 1, gear: [], streak: 0, hintsLeft: 0, secondLeft: 0, phase: 'fighting', reward: { xp: 0, gold: 0, loot: '', levelUps: 0 }, ...extra })
  assert.equal(sanitizeSave({ ...base, run: run(5, last, { shield: 2 }) }).run?.shield, 2)
  assert.equal(sanitizeSave({ ...base, run: run(5, last, { shield: 99 }) }).run?.shield, SHIELD_SEGMENTS)
  assert.equal(sanitizeSave({ ...base, run: run(5, last, { shield: 0 }) }).run?.shield, 0)
  assert.equal(sanitizeSave({ ...base, run: run(2, last, { shield: 3 }) }).run?.shield, 0, 'wraith: no shield')
  assert.equal(sanitizeSave({ ...base, run: run(3, last, { shield: 3 }) }).run?.shield, 3, 'floor 3 is a golem floor')
  assert.equal(sanitizeSave({ ...base, run: run(5, 1, { shield: 3 }) }).run?.shield, 0, 'not the last fight')
})

test('early bosses are gentler and ramp up to the full values', () => {
  assert.ok(bossHpMult(1) < bossHpMult(3) && bossHpMult(3) < bossHpMult(5))
  assert.equal(bossHpMult(50), BOSS_HP, 'capped'); assert.ok(bossDamageMult(1) < 1 && bossDamageMult(99) > 1)
  assert.ok(enemyStats(ENEMIES, 1, last).hp < enemyStats(ENEMIES, 1, 0).hp * 2.5, 'floor-1 boss is beatable')
})
