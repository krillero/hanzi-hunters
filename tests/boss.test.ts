import test from 'node:test'
import assert from 'node:assert/strict'
import { BOSSES, ENEMIES, GEAR } from '../src/data.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { sanitizeSave } from '../src/game/save.ts'
import {
  BOSS_HP, ENEMIES_PER_FLOOR, SHIELD_SEGMENTS, advance, bossIdFor, bossPhase, enemyStats, isBoss, isElite, isFinalFight, newRun, resolveAnswer, startFight
} from '../src/game/rules.ts'
import type { Run } from '../src/game/types.ts'

const none = { ...NO_BONUSES }
const last = ENEMIES_PER_FLOOR - 1
/** A run at the boss fight of `floor`. */
const bossRun = (floor: number, over: Partial<Run> = {}): Run => ({ ...startFight({ ...newRun(none, GEAR, ENEMIES), floor, kill: last, level: 10 }, none, ENEMIES), hp: 400, ...over })
const ask = (run: Run, over: Partial<Parameters<typeof resolveAnswer>[0]> = {}) =>
  resolveAnswer({ run, bonuses: none, enemies: ENEMIES, allGear: GEAR, lv: 0, isCorrect: true, roll: { drop: 0.99, item: 0 }, ...over })

test('a boss replaces the elite at the end of every 5th floor', () => {
  for (const f of [5, 10, 15]) { assert.ok(isBoss(f, last)); assert.ok(!isElite(f, last)); assert.ok(isFinalFight(last)) }
  for (const f of [1, 4, 6, 9]) { assert.ok(!isBoss(f, last)); assert.ok(isElite(f, last)) }
  assert.ok(!isBoss(5, 0) && !isBoss(5, 2), 'only the last fight of the floor')
  assert.deepEqual([5, 10, 15, 20].map(bossIdFor), ['golem', 'wraith', 'golem', 'wraith'])
})

test('boss stats: own name and sprite, bigger than an elite of the same floor', () => {
  const b = enemyStats(ENEMIES, 5, last), normal = enemyStats(ENEMIES, 4, last)
  assert.equal(b.boss, 'golem'); assert.equal(b.enemy.name, 'Shield Golem'); assert.equal(b.enemy.sprite, 'golem'); assert.equal(b.elite, false)
  assert.equal(b.hp, Math.round(BOSSES.golem.hp * 1.16 ** 4 * BOSS_HP))
  assert.ok(b.hp > enemyStats(ENEMIES, 5, 0).hp * 2 && b.xp > normal.xp && b.gold > normal.gold)
  assert.equal(enemyStats(ENEMIES, 10, last).enemy.name, 'Echo Wraith')
  assert.equal(normal.boss, null); assert.ok(normal.elite)
})

test('only the golem fight starts with a shield', () => {
  assert.equal(bossRun(5).shield, SHIELD_SEGMENTS)
  assert.equal(bossRun(10).shield, 0, 'the wraith has no shield')
  assert.equal(startFight({ ...newRun(none, GEAR, ENEMIES), floor: 5, kill: 0 }, none, ENEMIES).shield, 0)
  const next = advance({ ...bossRun(5), kill: last - 1, phase: 'victory' }, none, ENEMIES)
  assert.equal(next.shield, SHIELD_SEGMENTS, 'arriving at the boss raises the shield')
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
  const foe = enemyStats(ENEMIES, 10, last), r = bossRun(10)
  assert.equal(bossPhase(r, foe.hp), 1)
  assert.equal(bossPhase({ ...r, enemyHp: Math.floor(foe.hp * 0.6) }, foe.hp), 2)
  assert.equal(bossPhase({ ...newRun(none, GEAR, ENEMIES), floor: 3, kill: 0 }, 10), 1, 'not a boss fight')
})

test('a boss kill guarantees its own item, whatever the roll; normal fights never drop boss gear', () => {
  const golem = ask({ ...bossRun(5), enemyHp: 1, shield: 0 }, { roll: { drop: 0.999, item: 0.5 } })
  assert.equal(golem.outcome, 'victory'); assert.equal(golem.loot?.name, 'Golem Plate'); assert.equal(golem.run.loadout.Armor, golem.run.loadout.Armor)
  const wraith = ask({ ...bossRun(10), enemyHp: 1 }, { roll: { drop: 0.999, item: 0.5 } })
  assert.equal(wraith.loot?.name, 'Wraith Lantern')
  const again = ask({ ...bossRun(5), enemyHp: 1, shield: 0, gear: ['Golem Plate'] }, { roll: { drop: 0.999, item: 0 } })
  assert.ok(again.loot && !again.loot.boss, 'own item already owned: any other unowned gear')
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
  assert.equal(sanitizeSave({ ...base, run: run(10, last, { shield: 3 }) }).run?.shield, 0, 'wraith: no shield')
  assert.equal(sanitizeSave({ ...base, run: run(3, last, { shield: 3 }) }).run?.shield, 0, 'not a boss floor')
  assert.equal(sanitizeSave({ ...base, run: run(5, 1, { shield: 3 }) }).run?.shield, 0, 'not the last fight')
})
