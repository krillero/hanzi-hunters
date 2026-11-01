import test from 'node:test'
import assert from 'node:assert/strict'
import { ENEMIES, GEAR } from '../src/data.ts'
import { NO_BONUSES, computeBonuses, type Bonuses } from '../src/game/upgrades.ts'
import { gearVerdict } from '../src/game/rarity.ts'
import {
  ENEMIES_PER_FLOOR, MAX_HEARTS, START_HEARTS, TUNING, advance, bankRun, drinkPotion, enemyStats, equipGear, newRun, playerStats, resolveAnswer, startFight
} from '../src/game/rules.ts'
import type { Run } from '../src/game/types.ts'

const none: Bonuses = { ...NO_BONUSES }
const run0 = () => newRun(none, GEAR, ENEMIES)
const ask = (run = run0(), over: Partial<Parameters<typeof resolveAnswer>[0]> = {}) =>
  resolveAnswer({ run, bonuses: none, enemies: ENEMIES, allGear: GEAR, lv: 0, isCorrect: true, roll: { drop: 0.99, item: 0 }, ...over })
// The boss item is already owned, so the kill's loot cannot change maximum hearts in these tests.
const lastFight = (r: Run): Run => ({ ...r, kill: ENEMIES_PER_FLOOR - 1, shield: 0, enemyHp: 1, gear: [...r.gear, 'Golem Plate'] })

test('a new run: 5 full hearts, 1 potion, level 1, no gear, floor 1', () => {
  const r = run0()
  assert.deepEqual([r.floor, r.kill, r.level, r.gear.length, r.hearts, r.potions], [1, 0, 1, 0, START_HEARTS, 1])
  assert.equal(START_HEARTS, 5); assert.equal(playerStats(r, none, GEAR).maxHearts, 5)
  assert.equal(r.enemyHp, ENEMIES[0].hp)
})

test('upgrades shape the start of a run: Tough Skin heart starts filled, Spare Vial potion, per-floor charges', () => {
  const b = computeBonuses(['G1', 'G2', 'G3', 'S1', 'S2', 'S3'])
  const r = newRun(b, GEAR, ENEMIES)
  assert.equal(r.hearts, 6); assert.equal(playerStats(r, b, GEAR).maxHearts, 6)
  assert.equal(r.potions, 2); assert.equal(r.hintsLeft, 1)
  assert.equal(r.secondLeft, 2, 'Iron Will + Second Chance stack')
  const hoard = computeBonuses(['F1', 'F2', 'F3', 'F4', 'F5'])
  const h = newRun(hoard, GEAR, ENEMIES)
  assert.equal(h.loadout.Armor, 'Mossy Vest'); assert.equal(h.hearts, 6, 'starting gear: the run starts at its final equipped maximum')
})

test('maximum hearts are capped at 8', () => {
  const b = computeBonuses(['G1', 'G2', 'G3', 'G4', 'G5'])
  const r = { ...newRun(b, GEAR, ENEMIES), gear: ['Golem Plate'], loadout: { Armor: 'Golem Plate' } }
  assert.equal(playerStats(r, b, GEAR).maxHearts, 8)
  assert.equal(playerStats(r, { ...b, maxHearts: 99 }, GEAR).maxHearts, MAX_HEARTS)
})

test('a correct answer attacks and never costs a heart (no counterattack)', () => {
  const ok = ask()
  assert.equal(ok.damage, 13); assert.equal(ok.run.enemyHp, ENEMIES[0].hp - 13)
  assert.equal(ok.heartsLost, 0); assert.equal(ok.run.hearts, START_HEARTS); assert.equal(ok.run.pendingXp, 5)
  for (const floor of [1, 4, 9, 20]) for (let kill = 0; kill < ENEMIES_PER_FLOOR; kill++) {
    const r = { ...run0(), floor, kill, enemyHp: enemyStats(ENEMIES, floor, kill).hp, shield: 0, hearts: 1 }
    assert.equal(ask(r).run.hearts, 1, `floor ${floor} fight ${kill}`)
  }
})

test('a wrong answer costs exactly one heart on every floor and boss, and deals no damage', () => {
  for (const floor of [1, 2, 3, 4, 7, 15, 40]) for (let kill = 0; kill < ENEMIES_PER_FLOOR; kill++) {
    const r = { ...run0(), floor, kill, enemyHp: 3, shield: 0 }
    const bad = ask(r, { isCorrect: false })
    assert.equal(bad.heartsLost, 1); assert.equal(bad.run.hearts, START_HEARTS - 1)
    assert.equal(bad.damage, 0); assert.equal(bad.run.enemyHp, 3, 'cannot kill the enemy'); assert.equal(bad.outcome, 'continue')
  }
})

test('zero hearts ends the run; gold earned is kept for banking', () => {
  const d = ask({ ...run0(), hearts: 1, gold: 33 }, { isCorrect: false })
  assert.equal(d.outcome, 'defeat'); assert.equal(d.run.hearts, 0); assert.equal(d.run.phase, 'defeat'); assert.equal(d.run.gold, 33)
  assert.equal(ask({ ...run0(), hearts: 2 }, { isCorrect: false }).outcome, 'continue')
})

test('protected first practice: no heart, no second chance used, still wrong (combo resets)', () => {
  const b = computeBonuses(['S1', 'S2', 'S3'])
  const r = { ...newRun(b, GEAR, ENEMIES), streak: 4 }
  const p = ask(r, { bonuses: b, isCorrect: false, practice: true })
  assert.ok(p.practiceSaved); assert.equal(p.heartsLost, 0); assert.equal(p.run.hearts, r.hearts)
  assert.equal(p.run.secondLeft, r.secondLeft, 'second-chance charge kept'); assert.ok(!p.savedBySecondChance)
  assert.equal(p.run.streak, 0, 'not counted as correct'); assert.equal(p.damage, 0)
  const right = ask(r, { bonuses: b, practice: true }); assert.ok(!right.practiceSaved); assert.ok(right.damage > 0)
})

test('second chances: saved heart, still wrong, used up per floor; refilled only on a new floor', () => {
  const b = computeBonuses(['S1', 'S2', 'S3'])
  let r = newRun(b, GEAR, ENEMIES)
  assert.equal(r.secondLeft, 1)
  const first = ask(r, { bonuses: b, isCorrect: false }); assert.ok(first.savedBySecondChance); assert.equal(first.heartsLost, 0); assert.equal(first.run.secondLeft, 0); assert.equal(first.run.streak, 0)
  const second = ask(first.run, { bonuses: b, isCorrect: false }); assert.ok(!second.savedBySecondChance); assert.equal(second.heartsLost, 1)
  // next enemy on the same floor: no refill
  r = advance({ ...first.run, phase: 'victory' }, b, ENEMIES, GEAR); assert.equal(r.kill, 1); assert.equal(r.secondLeft, 0, 'not refilled per enemy')
  r = startFight(r, b, ENEMIES, GEAR); assert.equal(r.secondLeft, 0, 'restarting a fight does not refill')
  // swapping gear back and forth does not refill
  const boots = { ...r, gear: ['Windrunner Boots', 'Mossy Vest'], loadout: { Armor: 'Mossy Vest' } }
  const swapped = equipGear(equipGear(boots, 'Windrunner Boots', GEAR, b)!, 'Mossy Vest', GEAR, b)!
  assert.equal(equipGear(boots, 'Windrunner Boots', GEAR, b)!.secondLeft, 0, 'equipping +1 charge adds no charge'); assert.equal(swapped.secondLeft, 0)
  // a new floor refills all stacked charges
  const next = advance({ ...r, kill: ENEMIES_PER_FLOOR - 1, phase: 'victory' }, b, ENEMIES, GEAR)
  assert.equal(next.floor, 2); assert.equal(next.secondLeft, 1)
  const stacked = computeBonuses(['S1', 'S2', 'S3', 'S4', 'S5', 'G1', 'G2', 'G3'])
  assert.equal(newRun(stacked, GEAR, ENEMIES).secondLeft, 3, 'S3 + S5 + G3')
})

test('clearing a floor restores 1 heart exactly once, capped, before the floor summary', () => {
  const r = lastFight({ ...run0(), hearts: 3 })
  const k = ask(r)
  assert.equal(k.outcome, 'victory'); assert.equal(k.heartsRestored, 1); assert.equal(k.run.hearts, 4); assert.equal(k.run.reward.hearts, 1)
  assert.equal(k.run.recoveredFloor, 1)
  // the same floor can never award it again (e.g. a stale state replayed)
  assert.equal(ask({ ...k.run, phase: 'fighting', enemyHp: 1 }).heartsRestored, 0)
  // advancing does not heal
  assert.equal(advance(k.run, none, ENEMIES, GEAR).hearts, 4)
  assert.equal(ask(lastFight(run0())).heartsRestored, 0, 'capped at full')
  // a boss item that raises the maximum is worn first; the recovery then fills one heart of the new capacity at most
  const plate = ask({ ...run0(), kill: ENEMIES_PER_FLOOR - 1, shield: 0, enemyHp: 1 })
  assert.equal(plate.loot?.name, 'Golem Plate'); assert.equal(plate.run.hearts, 6); assert.equal(plate.heartsRestored, 1)
  assert.equal(ask({ ...run0(), enemyHp: 1, hearts: 2 }).heartsRestored, 0, 'normal enemies never restore hearts')
  const wind = computeBonuses(['G1', 'G2', 'G3', 'G4'])
  assert.equal(ask(lastFight({ ...newRun(wind, GEAR, ENEMIES), hearts: 2 }), { bonuses: wind }).heartsRestored, 2, 'Second Wind: 2 in total')
  assert.equal(TUNING.recoveryEvery, 1)
})

test('potions restore 1 heart (+1 with Titan Heart), capped, and are never wasted at full hearts', () => {
  const r = { ...run0(), hearts: 3 }
  const p = drinkPotion(r, none, GEAR)!; assert.equal(p.hearts, 4); assert.equal(p.potions, 0)
  assert.equal(drinkPotion(run0(), none, GEAR), null, 'full hearts: not consumed')
  const titan = computeBonuses(['G1', 'G2', 'G3', 'G4', 'G5'])
  const t = { ...newRun(titan, GEAR, ENEMIES), hearts: 4 }
  assert.equal(drinkPotion(t, titan, GEAR)!.hearts, 6)
  assert.equal(drinkPotion({ ...t, hearts: 6 }, titan, GEAR)!.hearts, 7, 'capped at the maximum')
  assert.equal(drinkPotion({ ...r, potions: 0 }, none, GEAR), null)
})

test('equipment cannot heal: a higher maximum is not filled, a lower one clamps, swapping never refills', () => {
  const r = { ...run0(), hearts: 3, gear: ['Mossy Vest', 'Windrunner Boots'], loadout: { Armor: 'Windrunner Boots' } }
  const vest = equipGear(r, 'Mossy Vest', GEAR, none)!
  assert.equal(playerStats(vest, none, GEAR).maxHearts, 6); assert.equal(vest.hearts, 3, 'new capacity is empty')
  let x: Run = vest
  for (let k = 0; k < 10; k++) x = equipGear(equipGear(x, 'Windrunner Boots', GEAR, none)!, 'Mossy Vest', GEAR, none)!
  assert.equal(x.hearts, 3, 'repeated swaps never heal')
  const full = { ...vest, hearts: 6 }
  assert.equal(equipGear(full, 'Windrunner Boots', GEAR, none)!.hearts, 5, 'a lower maximum clamps')
  assert.equal(equipGear(r, 'Copper Blade', GEAR, none), null, 'only owned gear')
})

test('loot that raises maximum hearts is worn without filling the new heart', () => {
  const r = { ...run0(), enemyHp: 1, hearts: 4 }
  const idx = GEAR.filter(g => !g.boss).findIndex(g => g.name === 'Mossy Vest')
  const k = ask(r, { roll: { drop: 0.1, item: idx / GEAR.filter(g => !g.boss).length + 0.0001 } })
  assert.equal(k.loot?.name, 'Mossy Vest'); assert.equal(k.run.loadout.Armor, 'Mossy Vest'); assert.equal(k.run.hearts, 4)
})

test('level-ups add attack only: no healing, no extra hearts', () => {
  const r = { ...run0(), enemyHp: 1, xp: 9999, hearts: 2 }
  const k = ask(r)
  assert.ok(k.run.level > 2); assert.equal(k.run.hearts, 2)
  assert.equal(playerStats(k.run, none, GEAR).maxHearts, 5)
  assert.ok(playerStats(k.run, none, GEAR).attack > playerStats(r, none, GEAR).attack)
})

test('enemies scale with floor (HP and rewards); the last enemy of every floor is a boss', () => {
  const f1 = enemyStats(ENEMIES, 1, 0), f5 = enemyStats(ENEMIES, 5, 0)
  assert.ok(f5.hp > f1.hp && f5.xp > f1.xp && f5.gold > f1.gold)
  const boss = enemyStats(ENEMIES, 3, ENEMIES_PER_FLOOR - 1), normal = enemyStats(ENEMIES, 3, 0)
  assert.ok(boss.boss && !normal.boss && boss.xp >= normal.xp * 1.5 && boss.gold >= normal.gold * 1.5 && boss.hp > normal.hp)
  assert.equal(enemyStats(ENEMIES, 1, 0).hp, 24)
  assert.ok(!('damage' in f1), 'enemies have no attack stat any more')
})

test('harder (higher mastery) questions deal more damage', () => {
  const dmg = [0, 1, 2, 3, 4].map(lv => ask(run0(), { lv }).damage)
  assert.deepEqual(dmg, [13, 14, 16, 18, 18])
  assert.ok(ask(run0(), { lv: 3, bonuses: computeBonuses(['S1', 'S2', 'S3', 'S4']) }).damage > 18)
})

test('combo and execute bonuses', () => {
  const b = { ...none, streakDmgPct: 0.25, executeDmgPct: 0.35 }
  assert.equal(ask({ ...run0(), streak: 1 }, { bonuses: b }).damage, 13)
  assert.equal(ask({ ...run0(), streak: 2 }, { bonuses: b }).damage, Math.round(13 * 1.25))
  assert.equal(ask({ ...run0(), enemyHp: 8 }, { bonuses: b }).damage, Math.round(13 * 1.35))
})

test('loot: only gear you do not own can drop; bosses drop more often', () => {
  const r = { ...run0(), enemyHp: 1 }
  const drop = ask(r, { roll: { drop: 0.1, item: 0 } }); assert.equal(drop.loot?.name, GEAR[0].name); assert.deepEqual(drop.run.gear, [GEAR[0].name]); assert.equal(drop.run.loadout.Weapon, GEAR[0].name)
  const second = ask({ ...r, gear: [GEAR[0].name] }, { roll: { drop: 0.1, item: 0 } }); assert.equal(second.loot?.name, GEAR[1].name, 'skips owned gear')
  const all = ask({ ...r, gear: GEAR.map(g => g.name) }, { roll: { drop: 0.1, item: 0 } }); assert.equal(all.loot, null, 'owning everything drops nothing')
  for (let k = 0; k < 20; k++) { const x = ask({ ...r, gear: [GEAR[0].name] }, { roll: { drop: 0.1, item: k / 20 } }); assert.notEqual(x.loot?.name, GEAR[0].name) }
  const boss = { ...r, kill: ENEMIES_PER_FLOOR - 1, gear: [GEAR.find(g => g.boss === 'golem')!.name] }
  assert.ok(ask({ ...boss, shield: 0 }, { roll: { drop: 0.7, item: 0.5 } }).loot, 'a boss drops at 0.7')
  assert.equal(ask(r, { roll: { drop: 0.7, item: 0.5 } }).loot, null, 'normal does not')
})

test('gold and xp bonuses and gear', () => {
  const b = computeBonuses(['F1', 'S2'])
  const r = { ...newRun(b, GEAR, ENEMIES), enemyHp: 1 }
  assert.equal(ask(r, { bonuses: b }).run.reward.gold, Math.round(ENEMIES[0].gold * 1.2))
  assert.equal(ask({ ...r, gear: ['Lucky Coin'], loadout: { Accessory: 'Lucky Coin' } }, { bonuses: none }).run.reward.gold, ENEMIES[0].gold + 3)
})

test('advance walks 4 enemies then the next floor; hints refill per fight', () => {
  const b = computeBonuses(['S1'])
  let r = { ...newRun(b, GEAR, ENEMIES), hintsLeft: 0 }
  for (let k = 1; k < ENEMIES_PER_FLOOR; k++) { r = advance(r, b, ENEMIES, GEAR); assert.deepEqual([r.floor, r.kill], [1, k]); assert.equal(r.hintsLeft, 1) }
  r = advance(r, b, ENEMIES, GEAR); assert.deepEqual([r.floor, r.kill], [2, 0]); assert.equal(r.enemyHp, enemyStats(ENEMIES, 2, 0).hp)
})

test('ending a run banks all gold; "return to camp" is not a defeat; learning is not touched here', () => {
  const meta = { gold: 10, upgrades: ['W1'], bestFloor: 3, runs: 2 }
  const { meta: m, summary } = bankRun(meta, { ...run0(), gold: 55, floor: 5, kills: 17, level: 4 })
  assert.deepEqual(m, { gold: 65, upgrades: ['W1'], bestFloor: 5, runs: 3 })
  assert.deepEqual(summary, { floor: 5, kills: 17, level: 4, goldBanked: 55, returned: false })
  assert.equal(bankRun(meta, { ...run0(), floor: 2 }).meta.bestFloor, 3)
  const back = bankRun(meta, { ...run0(), gold: 40, floor: 4 }, true)
  assert.equal(back.summary.returned, true); assert.equal(back.meta.gold, 50)
})

test('XP is paid only when the monster is killed (answers bank it, the kill pays it out)', () => {
  const foe = enemyStats(ENEMIES, 1, 0)
  let r = run0()
  const a1 = ask(r); r = a1.run; assert.equal(r.xp, 0); assert.equal(r.pendingXp, 5)
  const a2 = ask({ ...r, enemyHp: 500 }, { isCorrect: false }); assert.equal(a2.run.xp, 0); assert.equal(a2.run.pendingXp, 7, 'a wrong answer banks 2')
  const kill = ask({ ...a2.run, enemyHp: 1 })
  assert.equal(kill.outcome, 'victory')
  assert.equal(kill.run.reward.xp, 7 + 5 + foe.xp, 'banked + this answer + monster XP')
  assert.equal(kill.run.pendingXp, 0, 'bank is emptied')
  assert.equal(startFight({ ...kill.run, pendingXp: 9 }, none, ENEMIES, GEAR).pendingXp, 0, 'a new fight starts empty')
  const dead = ask({ ...run0(), hearts: 1, pendingXp: 20 }, { isCorrect: false })
  assert.equal(dead.outcome, 'defeat'); assert.equal(dead.run.xp, 0, 'dying pays nothing')
})

test('loot with one item per slot: empty slot and pure upgrades are worn, pure downgrades are left behind, trade-offs wait for the player', () => {
  const g = (n: string) => GEAR.find(x => x.name === n)!
  const r = { ...run0(), enemyHp: 1 }
  const drop = (worn: string | null, item: string) => {
    const pool = GEAR.filter(x => !x.boss && x.name !== worn)
    const idx = pool.findIndex(x => x.name === item)
    const base = { ...r, gear: worn ? [worn] : [], loadout: worn ? { [g(worn).slot]: worn } : {} }
    return ask(base, { roll: { drop: 0.1, item: idx / pool.length + 0.0001 } })
  }
  assert.equal(drop(null, 'Copper Blade').run.loadout.Weapon, 'Copper Blade')
  const same = GEAR.filter(x => !x.boss)
  for (const a of same) for (const b of same) if (a !== b && a.slot === b.slot) {
    const v = gearVerdict(b, a); const out = drop(a.name, b.name)
    assert.equal(out.loot?.name, b.name)
    assert.ok(out.run.gear.includes(b.name), 'found items are remembered even when left behind')
    assert.equal(out.run.loadout[a.slot], v === 'better' ? b.name : a.name, `${a.name} -> ${b.name} (${v})`)
  }
})
