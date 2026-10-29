import test from 'node:test'
import assert from 'node:assert/strict'
import { ENEMIES, GEAR, WORDS } from '../src/data.ts'
import { LEGACY_KEY, SAVE_KEY, loadSave, migrateV1, sanitizeSave } from '../src/game/save.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { newRun } from '../src/game/rules.ts'

const store = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null })

test('garbage never crashes and yields a valid fresh save', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, { meta: 'x', mastery: 5, run: 'x' }, { meta: { gold: 'a', upgrades: 'W1' }, run: { floor: 'x', hp: NaN } }]) {
    const s = sanitizeSave(bad)
    assert.equal(s.version, 2); assert.equal(s.meta.gold, 0); assert.deepEqual(s.meta.upgrades, []); assert.ok(s.run === null || s.run.hp > 0)
  }
  for (const raw of ['{not json', 'null', '[]']) assert.equal(loadSave(store({ [SAVE_KEY]: raw })).version, 2)
  assert.equal(loadSave(store({})).run, null)
})

test('upgrades are validated: unknown ids dropped, tiers need their prerequisite', () => {
  const s = sanitizeSave({ meta: { gold: 5, upgrades: ['W1', 'W3', 'G1', 'XX', 'S2'] } })
  assert.deepEqual(s.meta.upgrades.sort(), ['G1', 'W1'])
})

test('mastery is validated and unknown words dropped', () => {
  const s = sanitizeSave({ mastery: { 人: { lv: 9, ok: 7 }, 大: { lv: 2, ok: 1 }, 龍: { lv: 1, ok: 0 }, 小: 'x' } })
  assert.deepEqual(s.mastery, { 人: { lv: 4, ok: 1 }, 大: { lv: 2, ok: 1 } })
})

test('a saved run round-trips; impossible values are clamped', () => {
  const run = newRun(NO_BONUSES, GEAR, ENEMIES)
  const ok = sanitizeSave({ run: { ...run, gold: 12, floor: 3, kill: 2 } }).run!
  assert.deepEqual([ok.gold, ok.floor, ok.kill, ok.hp], [12, 3, 2, 30])
  const wild = sanitizeSave({ run: { ...run, hp: 9999, enemyHp: 9999, kill: 99, gear: ['Copper Blade', 'Fake'], potions: -3 } }).run!
  assert.ok(wild.hp <= 35 && wild.kill === 3 && wild.potions === 0 && wild.enemyHp < 100); assert.deepEqual(wild.gear, ['Copper Blade']); assert.equal(wild.loadout.Weapon, 'Copper Blade')
  assert.equal(sanitizeSave({ run: { ...run, hp: 0 } }).run, null, 'a 0-hp fighting run is not resumable')
  assert.equal(sanitizeSave({ run: { ...run, hp: 0, phase: 'defeat' } }).run!.phase, 'defeat', 'but a defeat screen is')
})

test('legacy gear is equipped once per slot and saved loadouts are validated', () => {
  const run = newRun(NO_BONUSES, GEAR, ENEMIES)
  const legacy = sanitizeSave({ run: { ...run, gear: ['Copper Blade', 'Mossy Vest', 'Lucky Coin'] } }).run!
  assert.deepEqual(legacy.loadout, { Weapon: 'Copper Blade', Armor: 'Mossy Vest', Accessory: 'Lucky Coin' })
  const invalid = sanitizeSave({ run: { ...run, gear: ['Copper Blade', 'Mossy Vest'], loadout: { Weapon: 'Mossy Vest', Armor: 'Copper Blade' } } }).run!
  assert.deepEqual(invalid.loadout, { Weapon: 'Copper Blade', Armor: 'Mossy Vest' })
})

test('v1 prototype saves migrate: learned -> level 1, gold banked, floor -> best floor', () => {
  const v1 = { level: 6, xp: 61, gold: 91, maxHp: 55, hp: 28, attack: 5, potions: 1, floor: 11, gear: ['Copper Blade'], learned: ['人', '大', 'bogus'] }
  const s = loadSave(store({ [LEGACY_KEY]: JSON.stringify(v1) }))
  assert.deepEqual(s.mastery, { 人: { lv: 1, ok: 0 }, 大: { lv: 1, ok: 0 } })
  assert.equal(s.meta.gold, 91); assert.equal(s.meta.bestFloor, 11); assert.equal(s.run, null); assert.deepEqual(s.meta.upgrades, [])
  assert.deepEqual(migrateV1('garbage').mastery, {})
  // v2 wins over v1 when both exist
  assert.equal(loadSave(store({ [LEGACY_KEY]: JSON.stringify(v1), [SAVE_KEY]: JSON.stringify({ meta: { gold: 7 } }) })).meta.gold, 7)
  assert.ok(WORDS.length)
})
