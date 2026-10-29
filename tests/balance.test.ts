import test from 'node:test'
import assert from 'node:assert/strict'
import { simulate } from '../tools/simulate.ts'

// Seeded bot play: guards the pacing of the roguelite loop, not exact numbers.
test('pacing: early deaths are shallow, the first upgrade comes within 2 runs, the max tree still plateaus', () => {
  for (const acc of [0.6, 0.75, 0.9]) {
    const log = simulate(acc, 40, 7)
    assert.ok(log[0].floor <= 3, `acc ${acc}: run 1 reached floor ${log[0].floor}`)
    assert.ok(log[1].upgrades >= 1, `acc ${acc}: nothing bought after 2 runs`)
    const first5 = log.slice(0, 5).reduce((n, l) => n + l.floor, 0) / 5
    assert.ok(first5 <= 5, `acc ${acc}: first five runs average floor ${first5}`)
    const late = log.slice(-10).reduce((n, l) => n + l.floor, 0) / 10
    assert.ok(late >= 6 && late <= 16, `acc ${acc}: late average floor ${late}`)
    const fullAt = log.findIndex(l => l.upgrades === 20)
    assert.ok(fullAt === -1 || fullAt >= 8, `acc ${acc}: tree complete after only ${fullAt + 1} runs`)
    assert.ok(log.some(l => l.run > 1 && l.gold > 0))
  }
})
