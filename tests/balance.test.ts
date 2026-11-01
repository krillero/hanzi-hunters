import test from 'node:test'
import assert from 'node:assert/strict'
import { firstWin, simulate } from '../tools/simulate.ts'

// Seeded bot play: guards the expedition targets, not exact numbers. Full table: node tools/simulate.ts --report (docs/GAME_DESIGN.md "Balance").
const seeds = [1, 2, 3, 4, 5]
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

test('perfect play always wins, from the very first expedition', () => {
  for (const sd of seeds) assert.ok(simulate(1, 5, sd).every(l => l.end === 'won' && l.heartsLost === 0), `seed ${sd}`)
})

test('win targets: 90% wins the first expedition, 75% within a handful, 60% rarely early but eventually', () => {
  assert.ok(seeds.filter(sd => simulate(0.9, 1, sd)[0].end === 'won').length >= 4, '90%: the first expedition is (almost) always won without upgrades')
  const mid = median(seeds.map(sd => firstWin(simulate(0.75, 15, sd))))
  assert.ok(mid >= 2 && mid <= 10, `75%: first win after ${mid} expeditions (target about 4-8)`)
  const weak = seeds.map(sd => simulate(0.6, 30, sd))
  assert.ok(weak.every(l => l.slice(0, 5).every(x => x.end === 'defeat')), '60%: no win in the first five expeditions')
  assert.ok(weak.some(l => l.some(x => x.end === 'won')), '60%: upgrades and mastery make a win possible over time')
})

test('expeditions and fights stay bounded', () => {
  for (const acc of [0.6, 0.75, 1]) for (const l of simulate(acc, 15, 3)) {
    assert.ok(l.answers <= 100, `acc ${acc}: expedition of ${l.answers} answers`)
    // Bound just above the observed tail: a 40-seed sweep at 0.75 accuracy has a rare 22-answer shield fight with and without boss
    // trials (1-2 of 1600 runs; trial answers are not counted). The old bound of 20 only held for this seed by luck.
    assert.ok(l.longestFight <= 24, `acc ${acc}: a fight took ${l.longestFight} answers`)
    assert.notEqual(l.end, 'returned', 'never needs the safety stop')
  }
})

test('hearts bookkeeping: hearts come back only from potions and Second Wind', () => {
  for (const acc of [0.6, 0.75, 0.9]) for (const maxed of [false, true]) for (const l of simulate(acc, 10, 3, { maxed })) {
    assert.equal(l.endHearts, l.startHearts - l.heartsLost + l.heartsRestored + l.potionsUsed * l.potionHearts, `acc ${acc} run ${l.run}`)
    if (!maxed && l.run === 1) assert.equal(l.heartsRestored, 0, 'no floor recovery without upgrades (the first expedition has none)')
    if (l.end === 'defeat') assert.equal(l.endHearts, 0)
  }
})

test('upgrades matter: at 75% a fully upgraded player wins far more often than a new one', () => {
  const fresh = seeds.flatMap(sd => simulate(0.75, 3, sd)), maxed = seeds.flatMap(sd => simulate(0.75, 3, sd, { maxed: true }))
  const rate = (xs: typeof fresh) => xs.filter(l => l.end === 'won').length / xs.length
  assert.ok(rate(maxed) > rate(fresh) + 0.3, `maxed ${rate(maxed)} vs fresh ${rate(fresh)}`)
  assert.ok(avg(maxed.map(l => l.secondChanceSaves)) > 0)
})
