import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBackup, serializeBackup } from '../src/game/backup.ts'
import { sanitizeSave } from '../src/game/save.ts'

const sample = sanitizeSave({ meta: { gold: 120, upgrades: ['W1', 'G1'], bestFloor: 7, runs: 9 }, mastery: { 人: { lv: 3, ok: 1 }, 大: { lv: 1, ok: 0 } }, run: null, lastRun: { floor: 3, kills: 8, level: 4, goldBanked: 50 } })

test('export then import restores the save exactly', () => {
  const back = parseBackup(serializeBackup(sample))
  assert.deepEqual(back, sample)
})

test('a bare v2 save and a v1 prototype save are accepted; garbage is rejected', () => {
  assert.deepEqual(parseBackup(JSON.stringify(sample)), sample)
  const v1 = parseBackup(JSON.stringify({ level: 6, gold: 91, floor: 11, learned: ['人', '大'], gear: [] }))
  assert.equal(v1?.meta.gold, 91); assert.equal(v1?.mastery['人'].lv, 1)
  for (const bad of ['', 'not json', '[]', '5', 'null', '{"hello":1}', '{"format":"other","x":1}']) assert.equal(parseBackup(bad), null, bad)
})

test('imported data is sanitised: unknown upgrades, words and wild numbers are dropped or clamped', () => {
  const evil = parseBackup(JSON.stringify({ format: 'hanzi-hunters-backup', save: { version: 2, meta: { gold: -5, upgrades: ['W3', 'ZZ', 'W1'], bestFloor: 'x' }, mastery: { 龙: { lv: 9 }, 人: { lv: 99, ok: 99 } }, run: { hp: 1e9, floor: 'a' } } }))!
  assert.deepEqual(evil.meta.upgrades, ['W1']); assert.equal(evil.meta.gold, 0); assert.equal(evil.meta.bestFloor, 1)
  assert.deepEqual(Object.keys(evil.mastery), ['人']); assert.equal(evil.mastery['人'].lv, 4)
})
