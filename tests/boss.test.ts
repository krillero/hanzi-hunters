import test from 'node:test'
import assert from 'node:assert/strict'
import { BOSSES, BOSS_INFO, ENEMIES, GEAR } from '../src/data.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { sanitizeSave } from '../src/game/save.ts'
import {
  BOSS_HP, BOSS_ORDER, EXPEDITION_FLOORS, TRICKSTER_HIT, TUNING, WARDEN_SEALS, WARDEN_WARDS, sealAsk, hasShield, bossHpMult, ENEMIES_PER_FLOOR, SHIELD_SEGMENTS, advance, bossIdFor, bossPhase, enemyStats, isBoss, isFinalFight, newRun, resolveAnswer, startFight
} from '../src/game/rules.ts'
import type { Run } from '../src/game/types.ts'

const none = { ...NO_BONUSES }
const last = ENEMIES_PER_FLOOR - 1
/** A run at the boss fight of `floor`. */
const bossRun = (floor: number, over: Partial<Run> = {}): Run => ({ ...startFight({ ...newRun(none, GEAR, ENEMIES), floor, kill: last, level: 10 }, none, ENEMIES, GEAR), ...over })
const ask = (run: Run, over: Partial<Parameters<typeof resolveAnswer>[0]> = {}) =>
  resolveAnswer({ run, bonuses: none, enemies: ENEMIES, allGear: GEAR, lv: 0, isCorrect: true, roll: { drop: 0.99, item: 0 }, ...over })

test('every floor ends with a boss: Golem, Wraith, Scribe, Trickster, then the Cavern Warden on floor 5', () => {
  for (const f of [1, 2, 3, 4, 5]) assert.ok(isBoss(f, last) && isFinalFight(last), `floor ${f}`)
  for (const f of [1, 3, 5]) assert.ok(!isBoss(f, 0) && !isBoss(f, 2), 'only the last fight of the floor')
  assert.deepEqual([1, 2, 3, 4, 5].map(bossIdFor), ['golem', 'wraith', 'scribe', 'trickster', 'warden'])
  assert.equal(EXPEDITION_FLOORS, 5)
})
test('boss stats: own name and sprite, bigger than a normal enemy of the same floor', () => {
  const b = enemyStats(ENEMIES, 3, last), normal = enemyStats(ENEMIES, 3, 0)
  assert.equal(b.boss, 'scribe'); assert.equal(b.enemy.name, 'Ink Scribe')
  assert.equal(b.hp, Math.round(BOSSES.scribe.hp * TUNING.enemyHpScale * TUNING.enemyHpGrowth ** 2 * bossHpMult(3)))
  assert.ok(b.hp > normal.hp && b.xp > normal.xp && b.gold > normal.gold)
  assert.equal(enemyStats(ENEMIES, 1, last).enemy.name, 'Shield Golem'); assert.equal(enemyStats(ENEMIES, 2, last).enemy.name, 'Echo Wraith')
  assert.equal(enemyStats(ENEMIES, 4, last).enemy.name, 'Mirror Trickster')
  const warden = enemyStats(ENEMIES, 5, last)
  assert.equal(warden.enemy.name, 'Cavern Warden'); assert.equal(warden.enemy.sprite, 'golem', 'placeholder art: the golem sprite')
  assert.ok(warden.hp > enemyStats(ENEMIES, 4, last).hp, 'the final boss is the toughest')
  assert.equal(normal.boss, null)
})
test('shields: golem 2 segments, scribe 3 seals, warden 2 wards + 2 seals; nobody else', () => {
  assert.equal(bossRun(1).shield, 2); assert.equal(bossRun(3).shield, SHIELD_SEGMENTS); assert.equal(bossRun(5).shield, WARDEN_WARDS + WARDEN_SEALS)
  assert.equal(bossRun(2).shield, 0, 'the wraith has no shield'); assert.equal(bossRun(4).shield, 0, 'nor the trickster')
  assert.equal(startFight({ ...newRun(none, GEAR, ENEMIES), floor: 5, kill: 0 }, none, ENEMIES, GEAR).shield, 0, 'not the last fight')
  const next = advance({ ...bossRun(1), kill: last - 1, phase: 'victory' }, none, ENEMIES, GEAR)!
  assert.equal(next.shield, 2, 'arriving at the boss raises the shield')
  assert.equal(advance({ ...bossRun(1), phase: 'victory' }, none, ENEMIES, GEAR)!.shield, 0, 'floor 2 starts with a normal enemy and no shield')
})
test('the shield blocks damage; only a correct seal answer breaks a segment', () => {
  const r = bossRun(1)
  const tone = ask(r, { sealQuestion: true })
  assert.equal(tone.damage, 0); assert.equal(tone.run.enemyHp, r.enemyHp); assert.equal(tone.run.shield, 1); assert.ok(tone.shieldBroken && tone.shieldBlocked)
  const notTone = ask(r, { sealQuestion: false })
  assert.equal(notTone.damage, 0); assert.equal(notTone.run.shield, 2); assert.ok(!notTone.shieldBroken && notTone.shieldBlocked)
  const wrong = ask(r, { sealQuestion: true, isCorrect: false })
  assert.equal(wrong.run.shield, 2, 'a wrong answer never breaks and never repairs')
  assert.equal(tone.heartsLost, 0, 'a correct answer never costs a heart, shield or not'); assert.equal(wrong.heartsLost, 1)
  const cur = ask(tone.run, { sealQuestion: true }).run
  assert.equal(cur.shield, 0)
  const open = ask(cur, { sealQuestion: false })
  assert.ok(open.damage > 0 && !open.shieldBlocked, 'shield down: normal damage')
  assert.equal(bossPhase(r, enemyStats(ENEMIES, 1, last).hp), 1); assert.equal(bossPhase(cur, enemyStats(ENEMIES, 1, last).hp), 2)
})

test('cavern warden: tone wards, then ink seals, then the echo phase', () => {
  const foe = enemyStats(ENEMIES, 5, last)
  let r = bossRun(5)
  assert.equal(sealAsk('warden', r.shield), 'pinyin'); assert.equal(bossPhase(r, foe.hp), 1)
  r = ask(r, { sealQuestion: true }).run; r = ask(r, { sealQuestion: true }).run
  assert.equal(r.shield, WARDEN_SEALS); assert.equal(sealAsk('warden', r.shield), 'hanzi', 'wards down: character questions now'); assert.equal(bossPhase(r, foe.hp), 2)
  r = ask(r, { sealQuestion: true }).run; r = ask(r, { sealQuestion: true }).run
  assert.equal(r.shield, 0); assert.equal(bossPhase(r, foe.hp), 3, 'echo phase')
  assert.ok(ask(r).damage > 0)
  assert.equal(sealAsk('golem', 2), 'pinyin'); assert.equal(sealAsk('scribe', 3), 'hanzi'); assert.equal(sealAsk('wraith', 0), null)
})
test('wraith: phase 2 starts below 60% HP', () => {
  const foe = enemyStats(ENEMIES, 2, last), r = bossRun(2)
  assert.equal(bossPhase(r, foe.hp), 1)
  assert.equal(bossPhase({ ...r, enemyHp: Math.floor(foe.hp * 0.6) }, foe.hp), 2)
  assert.equal(bossPhase({ ...newRun(none, GEAR, ENEMIES), floor: 3, kill: 0 }, 10), 1, 'not a boss fight (an earlier fight of the floor)')
})

test('a boss kill guarantees its own item once, whatever the roll; normal fights never drop boss gear', () => {
  const golem = ask({ ...bossRun(1), enemyHp: 1, shield: 0 }, { roll: { drop: 0.999, item: 0.5 } })
  assert.equal(golem.outcome, 'victory'); assert.equal(golem.loot?.name, 'Golem Plate'); assert.equal(golem.run.loadout.Armor, golem.run.loadout.Armor)
  const wraith = ask({ ...bossRun(2), enemyHp: 1 }, { roll: { drop: 0.999, item: 0.5 } })
  assert.equal(wraith.loot?.name, 'Wraith Lantern')
  assert.equal(ask({ ...bossRun(5), enemyHp: 1, shield: 0 }, { roll: { drop: 0.999, item: 0.5 } }).loot?.name, 'Warden Sigil')
  const owned = { ...bossRun(1), enemyHp: 1, shield: 0, gear: ['Golem Plate'] }
  const again = ask(owned, { roll: { drop: 0.1, item: 0 } })
  assert.ok(again.loot && !again.loot.boss, 'own item already owned: it rolls like a lucky kill for other gear')
  assert.equal(ask(owned, { roll: { drop: 0.99, item: 0 } }).loot, null, 'and can miss')
  for (let k = 0; k < 40; k++) {
    const normal = ask({ ...newRun(none, GEAR, ENEMIES), enemyHp: 1, kill: 0 }, { roll: { drop: 0.1, item: k / 40 } })
    assert.ok(normal.loot && !normal.loot.boss, 'no boss gear from normal fights')
  }
})

test('saves: the shield is only kept for shield bosses, and clamped', () => {
  const base = { version: 1, meta: { gold: 0, upgrades: [], bestFloor: 5, runs: 1 }, mastery: {}, lastRun: null }
  const run = (floor: number, kill: number, extra: object = {}) => ({ floor, kill, kills: 0, level: 1, xp: 0, pendingXp: 0, hearts: 5, enemyHp: 9999, gold: 0, potions: 1, gear: [], streak: 0, hintsLeft: 0, secondLeft: 0, phase: 'fighting', reward: { xp: 0, gold: 0, loot: '', levelUps: 0, hearts: 0 }, ...extra })
  assert.equal(sanitizeSave({ ...base, run: run(1, last, { shield: 1 }) }).run?.shield, 1)
  assert.equal(sanitizeSave({ ...base, run: run(1, last, { shield: 3 }) }).run?.shield, 2, 'floor 1: clamped to 2 segments')
  assert.equal(sanitizeSave({ ...base, run: run(2, last, { shield: 3 }) }).run?.shield, 0, 'wraith: no shield')
  assert.equal(sanitizeSave({ ...base, run: run(3, last, { shield: 3 }) }).run?.shield, 3, 'floor 3 is the scribe: seals are kept')
  assert.equal(sanitizeSave({ ...base, run: run(4, last, { shield: 3 }) }).run?.shield, 0, 'trickster: no shield')
  assert.equal(sanitizeSave({ ...base, run: run(5, last, { shield: 99 }) }).run?.shield, 4, 'warden: clamped to 4')
  assert.equal(sanitizeSave({ ...base, run: run(5, 1, { shield: 3 }) }).run?.shield, 0, 'not the last fight')
})
test('early bosses are gentler and ramp up to the full values', () => {
  assert.ok(bossHpMult(1) < bossHpMult(3) && bossHpMult(3) < bossHpMult(5))
  assert.equal(bossHpMult(50), BOSS_HP, 'capped')
  assert.ok(enemyStats(ENEMIES, 1, last).hp < enemyStats(ENEMIES, 1, 0).hp * 2.5, 'floor-1 boss is beatable')
})

test('ink scribe: seals break only on correct character answers; mistakes never regrow them', () => {
  const r = bossRun(3), foe = enemyStats(ENEMIES, 3, last)
  assert.ok(hasShield('scribe') && r.shield === SHIELD_SEGMENTS)
  const ok = ask(r, { sealQuestion: true }); assert.equal(ok.run.shield, SHIELD_SEGMENTS - 1); assert.equal(ok.damage, 0); assert.ok(ok.shieldBroken)
  assert.equal(ask(r, { sealQuestion: false }).run.shield, SHIELD_SEGMENTS, 'a non-character answer does not break a seal')
  const wrongSealed = ask(r, { isCorrect: false, sealQuestion: true }); assert.equal(wrongSealed.run.shield, SHIELD_SEGMENTS); assert.equal(wrongSealed.heartsLost, 1)
  const down = { ...r, shield: 0 }
  assert.ok(ask(down).damage > 0, 'seals down: normal damage')
  const miss = ask(down, { isCorrect: false }); assert.equal(miss.run.shield, 0, 'a wrong answer no longer regrows a seal'); assert.equal(miss.heartsLost, 1)
  assert.equal(ask({ ...down, enemyHp: 1 }).outcome, 'victory')
  assert.equal(bossPhase(r, foe.hp), 1); assert.equal(bossPhase(down, foe.hp), 2)
})

test('mirror trickster: right answers hit +40%; a wrong answer costs one heart and never heals it', () => {
  const foe = enemyStats(ENEMIES, 4, last), full = bossRun(4), plain = bossRun(2)   // the wraith is a plain boss with the same stats basis
  const hit = ask({ ...full, enemyHp: foe.hp }), base = ask({ ...plain, enemyHp: enemyStats(ENEMIES, 2, last).hp })
  assert.equal(hit.damage, Math.round(base.damage * TRICKSTER_HIT))
  const hurt = { ...full, enemyHp: Math.round(foe.hp * 0.3) }
  const miss = ask(hurt, { isCorrect: false })
  assert.equal(miss.damage, 0); assert.equal(miss.run.enemyHp, hurt.enemyHp, 'no healing'); assert.equal(miss.heartsLost, 1)
  assert.equal(ask({ ...hurt, enemyHp: 1 }, { isCorrect: false }).outcome, 'continue', 'a wrong answer never kills it')
  const practice = ask(hurt, { isCorrect: false, practice: true })
  assert.equal(practice.heartsLost, 0); assert.equal(practice.run.enemyHp, hurt.enemyHp, 'protected practice: no extra boss penalty either')
})

test('every boss mistake costs at most one heart, before protection', () => {
  for (const floor of [1, 2, 3, 4, 5, 8]) for (const shield of [0, 2]) {
    const r = bossRun(floor, { shield: hasShield(bossIdFor(floor)) ? shield : 0 })
    assert.equal(ask(r, { isCorrect: false }).heartsLost, 1, `floor ${floor}`)
    assert.equal(ask(r, { isCorrect: false, practice: true }).heartsLost, 0)
    assert.equal(ask(r).heartsLost, 0)
  }
})

test('every boss has info text, an item to drop and a sprite name', () => {
  for (const id of [...BOSS_ORDER, 'warden'] as const) {
    assert.ok(BOSS_INFO[id].rule.length > 20 && BOSS_INFO[id].phases.length >= 1, id)
    assert.ok(!/heal|regrow|grow back|max HP|armor/i.test(BOSS_INFO[id].rule + BOSS_INFO[id].phases.join(' ') + BOSS_INFO[id].reward), `${id}: no obsolete HP / healing text`)
    assert.equal(BOSSES[id].sprite, id === 'warden' ? 'golem' : id)
    assert.equal(GEAR.filter(g => g.boss === id).length, 1, `${id} drops exactly one item`)
  }
})
