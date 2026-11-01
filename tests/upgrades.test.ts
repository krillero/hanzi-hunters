import test from 'node:test'
import assert from 'node:assert/strict'
import { BRANCHES, UPGRADES, branchNodes, buyUpgrade, computeBonuses, nodeState, upgradeCost } from '../src/game/upgrades.ts'
import { GEAR } from '../src/data.ts'

test('cost curve rises with tier and is the same shape in every branch', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(upgradeCost), [25, 75, 150, 250, 375])
  for (const b of BRANCHES) assert.deepEqual(branchNodes(b.id).map(n => n.tier), [1, 2, 3, 4, 5])
  assert.equal(UPGRADES.length, 20); assert.equal(new Set(UPGRADES.map(u => u.id)).size, 20)
})

test('tiers must be bought in order and cost gold', () => {
  const meta = { gold: 1000, upgrades: [], bestFloor: 1, runs: 0 }
  assert.equal(buyUpgrade(meta, 'W2'), null, 'tier 2 locked')
  const a = buyUpgrade(meta, 'W1')!; assert.deepEqual(a.upgrades, ['W1']); assert.equal(a.gold, 975)
  assert.equal(buyUpgrade(a, 'W1'), null, 'cannot buy twice')
  assert.ok(buyUpgrade(a, 'W2'))
  assert.equal(buyUpgrade({ ...a, gold: 74 }, 'W2'), null, 'not enough gold')
  assert.equal(buyUpgrade(a, 'nope'), null)
  assert.equal(nodeState(a.upgrades, UPGRADES.find(u => u.id === 'W3')!), 'locked')
})

test('bonuses add up across branches', () => {
  const b = computeBonuses(['W1', 'W2', 'W3', 'G1', 'S1', 'S2', 'F1', 'F2', 'F3'])
  assert.equal(b.attack, 5); assert.equal(b.streakDmgPct, 0.25); assert.equal(b.maxHearts, 1); assert.equal(b.hints, 1)
  assert.equal(b.xpPct, 0.15); assert.equal(b.goldPct, 0.2); assert.equal(b.lootPct, 0.15); assert.deepEqual(b.startGear, ['Copper Blade'])
  const all = computeBonuses(UPGRADES.map(u => u.id))
  assert.equal(all.hints, 2); assert.equal(all.secondChance, 3, 'Iron Will, Second Chance, Sage'); assert.equal(all.maxHearts, 2); assert.equal(all.floorHearts, 1); assert.equal(all.potionHearts, 1); assert.deepEqual(all.startGear.sort(), ['Copper Blade', 'Mossy Vest'])
  for (const g of all.startGear) assert.ok(GEAR.some(x => x.name === g), 'start gear exists')
})

test('no upgrade answers questions for the player (every effect is power or convenience)', () => {
  const allowed = new Set(['attack', 'maxHearts', 'startPotions', 'potionHearts', 'floorHearts', 'goldPct', 'xpPct', 'lootPct', 'hints', 'secondChance', 'streakDmgPct', 'executeDmgPct', 'masteryDmgPct', 'startGear'])
  for (const u of UPGRADES) for (const k of Object.keys(u.fx)) assert.ok(allowed.has(k), `${u.id}.${k}`)
})

test('upgrade descriptions match the hearts rules (no HP, armor, healing or per-fight second chances)', () => {
  for (const u of UPGRADES) assert.ok(!/max HP|\d+ HP|armor|heal|per fight, a wrong|countered/i.test(u.desc), `${u.id}: ${u.desc}`)   // 'enemies under 35% HP' is enemy HP and fine
  assert.match(UPGRADES.find(u => u.id === 'S3')!.desc, /per expedition/)
})
