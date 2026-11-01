import test from 'node:test'
import assert from 'node:assert/strict'
import { SIGIL, sigilBonus, sigilText, newRun, playerStats, resolveAnswer, enemyStats, startFight, MAX_DEPTH, bankRun } from '../src/game/rules.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { ENEMIES, GEAR } from '../src/data.ts'

test('the Warden Sigil grows with every depth cleared: +1 hint, +10% mastery damage, +5% per further level', () => {
  assert.deepEqual(sigilBonus(0), { hints: 0, masteryPct: 0 })
  assert.equal(sigilBonus(1).hints, SIGIL.hints); assert.equal(sigilBonus(1).masteryPct, 0.10)
  assert.ok(Math.abs(sigilBonus(MAX_DEPTH).masteryPct - (0.10 + 0.05 * (MAX_DEPTH - 1))) < 1e-9)
  assert.equal(sigilText(0), ''); assert.equal(sigilText(2), '+15% mastery damage · +1 hint per fight')
  assert.ok(GEAR.every(g => g.name !== 'Warden Sigil'), 'not gear any more: nothing to equip or manage')
})

test('an expedition takes the Sigil level it starts with: more hints per fight and harder right answers', () => {
  const plain = newRun(NO_BONUSES, GEAR, ENEMIES, 1, 0), sigil = newRun(NO_BONUSES, GEAR, ENEMIES, 1, 3)
  assert.equal(plain.sigil, 0); assert.equal(sigil.sigil, 3)
  assert.equal(playerStats(sigil, NO_BONUSES, GEAR).hints, playerStats(plain, NO_BONUSES, GEAR).hints + 1)
  assert.equal(sigil.hintsLeft, plain.hintsLeft + 1)
  const hit = (run: typeof plain) => resolveAnswer({ run, bonuses: NO_BONUSES, enemies: ENEMIES, allGear: GEAR, lv: 2, isCorrect: true, roll: { drop: 0.99, item: 0 } }).damage
  assert.ok(hit(sigil) > hit(plain), `${hit(sigil)} vs ${hit(plain)}`)
  assert.equal(newRun(NO_BONUSES, GEAR, ENEMIES, 1, 99).sigil, MAX_DEPTH)
  assert.equal(startFight({ ...sigil, kill: 1 }, NO_BONUSES, ENEMIES, GEAR).sigil, 3)
})

test('the Sigil level of a saved expedition survives a reload; old saves have none; banking a first clear raises the next level', () => {
  const s = sanitizeSave(null); s.run = newRun(NO_BONUSES, GEAR, ENEMIES, 2, 1)
  const loaded = sanitizeSave(JSON.parse(JSON.stringify(s))).run!
  assert.equal(loaded.sigil, 1); assert.equal(loaded.hintsLeft, s.run.hintsLeft)
  const old = JSON.parse(JSON.stringify(s)); delete old.run.sigil
  assert.equal(sanitizeSave(old).run!.sigil, 0)
  const won = { ...newRun(NO_BONUSES, GEAR, ENEMIES, 2, 1), floor: 5, kill: 3, phase: 'victory' as const, enemyHp: 0 }
  assert.equal(bankRun({ ...s.meta, depthCleared: 1 }, won, 'won').meta.depthCleared, 2, 'the next expedition starts with level 2')
  assert.ok(enemyStats(ENEMIES, 5, 3, 2).hp > 0)
})
