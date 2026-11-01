import test from 'node:test'
import assert from 'node:assert/strict'
import { ENEMIES, GEAR } from '../src/data.ts'
import { OLD_SAVE_KEYS, SAVE_KEY, SAVE_VERSION, clearOldSaves, loadSave, sanitizeSave } from '../src/game/save.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { EXPEDITION_FLOORS, newRun } from '../src/game/rules.ts'

const store = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null })
const v1 = (o: Record<string, unknown>) => ({ version: SAVE_VERSION, ...o })

test('garbage never crashes and yields a valid fresh save', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, v1({ meta: 'x', mastery: 5, run: 'x' }), v1({ meta: { gold: 'a', upgrades: 'W1' }, run: { floor: 'x', hearts: NaN } })]) {
    const s = sanitizeSave(bad)
    assert.equal(s.version, 1); assert.equal(s.meta.gold, 0); assert.deepEqual(s.meta.upgrades, []); assert.ok(s.run === null || s.run.hearts > 0)
  }
  for (const raw of ['{not json', 'null', '[]']) assert.equal(loadSave(store({ [SAVE_KEY]: raw })).version, 1)
  assert.equal(loadSave(store({})).run, null)
})

test('saves from before expeditions are not read, and are deleted on start', () => {
  const old = { version: 5, meta: { gold: 999, upgrades: ['W1'], bestFloor: 9, runs: 4 }, mastery: { 人: { lv: 3, ok: 0 } } }
  const s = sanitizeSave(old)
  assert.equal(s.meta.gold, 0); assert.deepEqual(s.mastery, {}, 'another version is a fresh start')
  assert.equal(loadSave(store({ 'hanzi-hunters-save-v2': JSON.stringify(old) })).meta.gold, 0, 'old keys are never read')
  const removed: string[] = []
  clearOldSaves({ removeItem: k => { removed.push(k) } })
  assert.deepEqual(removed, OLD_SAVE_KEYS)
  assert.ok(!OLD_SAVE_KEYS.includes(SAVE_KEY))
})

test('upgrades are validated: unknown ids dropped, tiers need their prerequisite', () => {
  const s = sanitizeSave(v1({ meta: { gold: 5, upgrades: ['W1', 'W3', 'G1', 'XX', 'S2'] } }))
  assert.deepEqual(s.meta.upgrades.sort(), ['G1', 'W1'])
})

test('mastery is validated and unknown words dropped', () => {
  const s = sanitizeSave(v1({ mastery: { 人: { lv: 9, ok: 7 }, 大: { lv: 2, ok: 1 }, 龍: { lv: 1, ok: 0 }, 小: 'x' } }))
  assert.deepEqual(s.mastery, { 人: { lv: 4, ok: 1 }, 大: { lv: 2, ok: 1 } })
})

test('a saved expedition round-trips; impossible values are clamped', () => {
  const run = newRun(NO_BONUSES, GEAR, ENEMIES)
  const ok = sanitizeSave(v1({ run: { ...run, gold: 12, floor: 3, kill: 2 } })).run!
  assert.deepEqual([ok.gold, ok.floor, ok.kill, ok.hearts], [12, 3, 2, 5])
  const wild = sanitizeSave(v1({ run: { ...run, hearts: 9999, enemyHp: 9999, kill: 99, floor: 99, gear: ['Copper Blade', 'Fake'], potions: -3, pendingXp: -4 } })).run!
  assert.ok(wild.hearts === 5 && wild.kill === 3 && wild.potions === 0 && wild.pendingXp === 0)
  assert.equal(wild.floor, EXPEDITION_FLOORS, 'never beyond the last floor')
  assert.deepEqual(wild.gear, ['Copper Blade']); assert.equal(wild.loadout.Weapon, 'Copper Blade')
  assert.equal(sanitizeSave(v1({ run: { ...run, hearts: 0 } })).run!.phase, 'defeat', 'a run with no hearts is over')
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(sanitizeSave(v1({ run }))))), sanitizeSave(v1({ run })), 'reloading changes nothing')
})

test('gear is equipped once per slot and saved loadouts are validated', () => {
  const run = newRun(NO_BONUSES, GEAR, ENEMIES)
  const worn = sanitizeSave(v1({ run: { ...run, gear: ['Copper Blade', 'Mossy Vest', 'Lucky Coin'], loadout: {} } })).run!
  assert.deepEqual(worn.loadout, { Weapon: 'Copper Blade', Armor: 'Mossy Vest', Accessory: 'Lucky Coin' })
  const invalid = sanitizeSave(v1({ run: { ...run, gear: ['Copper Blade', 'Mossy Vest'], loadout: { Weapon: 'Mossy Vest', Armor: 'Copper Blade' } } })).run!
  assert.deepEqual(invalid.loadout, { Weapon: 'Copper Blade', Armor: 'Mossy Vest' })
})

test('the last expedition result and wins are kept', () => {
  const s = sanitizeSave(v1({ meta: { gold: 3, upgrades: [], bestFloor: 5, runs: 4, wins: 2 }, lastRun: { floor: 5, kills: 20, level: 7, goldBanked: 80, result: 'won' } }))
  assert.equal(s.meta.wins, 2); assert.equal(s.lastRun?.result, 'won')
  assert.equal(sanitizeSave(v1({ lastRun: { floor: 2, result: 'nonsense' } })).lastRun?.result, 'defeat')
})
