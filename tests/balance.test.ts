import test from 'node:test'
import assert from 'node:assert/strict'
import { ANSWER_CAP, simulate } from '../tools/simulate.ts'

// Seeded bot play: guards the pacing of the roguelite loop under the hearts rules, not exact numbers.
// Full comparison table: node tools/simulate.ts --report (see docs/GAME_DESIGN.md "Balance").
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

test('hearts bookkeeping: every heart lost is paid for by the start, floor recovery or a potion (no hidden healing)', () => {
  for (const acc of [0.6, 0.75, 0.9]) for (const maxed of [false, true]) for (const l of simulate(acc, 12, 3, { maxed })) {
    // end = start - lost + restored + potion hearts. Gear raising the maximum mid-run never fills it, so nothing else can add hearts.
    assert.equal(l.endHearts, l.startHearts - l.heartsLost + l.heartsRestored + l.potionsUsed * l.potionHearts, `acc ${acc} run ${l.run}`)
    if (l.end === 'defeat') assert.equal(l.endHearts, 0)
    assert.ok(l.heartsRestored <= 2 * (l.floor - 1), 'at most one recovery per floor cleared (two with Second Wind)')
  }
})

test('pacing: early deaths are shallow, the first upgrade comes within 2 runs, runs get deeper, the tree takes time', () => {
  for (const acc of [0.6, 0.75, 0.9]) {
    const log = simulate(acc, 30, 7)
    assert.ok(log[0].floor <= 3 || acc >= 0.9, `acc ${acc}: run 1 reached floor ${log[0].floor}`)
    assert.ok(log[1].upgrades >= 1, `acc ${acc}: nothing bought after 2 runs`)
    const early = avg(log.slice(0, 5).map(l => l.floor)), late = avg(log.slice(-10).map(l => l.floor))
    assert.ok(late > early, `acc ${acc}: late runs (${late}) are not deeper than early ones (${early})`)
    // Hearts runs are longer, so the tree is measured in answers (play time), not runs. The old HP rules needed about
    // 480-830 answers to buy everything; hearts must not make progression faster than that.
    const fullAt = log.findIndex(l => l.upgrades === 20)
    const answersToFull = log.slice(0, fullAt === -1 ? log.length : fullAt + 1).reduce((n, l) => n + l.answers, 0)
    assert.ok(fullAt === -1 || answersToFull >= 600, `acc ${acc}: tree complete after only ${answersToFull} answers`)
    assert.ok(log.every(l => l.answers <= ANSWER_CAP))
  }
})

test('runs end by running out of hearts for weaker players; only strong players reach the "return to camp" cap', () => {
  const weak = simulate(0.6, 30, 11)
  assert.ok(weak.every(l => l.end === 'defeat'), 'at 60% accuracy every run ends in defeat')
  assert.ok(avg(weak.slice(0, 5).map(l => l.answers)) >= 10, 'but not instantly: practice protection and 5 hearts give a real first run')
  const mid = simulate(0.75, 30, 11).slice(-10)
  assert.ok(mid.filter(l => l.end === 'defeat').length >= 3, `at 75% accuracy late runs still end in defeat (${mid.filter(l => l.end === 'defeat').length}/10)`)
})

test('upgrades matter: at the same accuracy a fully upgraded player goes deeper and is saved more often', () => {
  const fresh = simulate(0.75, 5, 21), maxed = simulate(0.75, 5, 21, { maxed: true })
  assert.ok(avg(maxed.map(l => l.floor)) > avg(fresh.map(l => l.floor)), 'deeper')
  assert.ok(avg(maxed.map(l => l.secondChanceSaves)) > avg(fresh.map(l => l.secondChanceSaves)), 'second chances save hearts')
})
