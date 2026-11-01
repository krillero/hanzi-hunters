import test from 'node:test'
import assert from 'node:assert/strict'
import { HAPTICS, sfxScore, totalDuration, type SfxName } from '../src/audio.ts'
import { RARITY_BY_NAME, compareGear, gearScore, gearVerdict, isUpgrade, rarityOf } from '../src/game/rarity.ts'
import { accuracyPct, emptyStats, recordAnswer } from '../src/game/runStats.ts'
import { GEAR } from '../src/data.ts'
import { MAX_LV } from '../src/game/mastery.ts'

const NAMES: SfxName[] = ['tap', 'correct', 'combo', 'wrong', 'kill', 'levelup', 'loot', 'mastered', 'defeat']

test('every sound is short, audible and has a haptic entry', () => {
  for (const n of NAMES) {
    const notes = sfxScore(n, { streak: 5, rarity: 'epic' })
    assert.ok(notes.length > 0, n)
    assert.ok(totalDuration(notes) <= 1.2, `${n} is at most 1.2 s`)
    for (const x of notes) { assert.ok(x.freq >= 80 && x.freq <= 4200, `${n} frequency`); assert.ok(x.gain > 0 && x.gain <= 0.2, `${n} gain`); assert.ok(x.dur > 0 && x.at >= 0) }
    assert.ok(n in HAPTICS)
  }
})

test('no fundamental is too low for a phone speaker, and the low sounds have overtones', () => {
  for (const n of NAMES) for (const x of sfxScore(n, { streak: 5, rarity: 'epic' })) if (x.type === 'sine' || x.type === 'triangle') assert.ok(x.freq >= 180, `${n}: a pure ${x.freq} Hz tone is too low to hear on a phone`)
  for (const n of ['wrong', 'defeat'] as SfxName[]) assert.ok(sfxScore(n).some(x => x.type === 'sawtooth' || x.type === 'square'), `${n} needs a harmonic-rich wave to be audible on small speakers`)
})

test('combo pitch rises with the streak but is capped; loot grows with rarity', () => {
  const top = (s: number) => Math.max(...sfxScore('combo', { streak: s }).map(n => n.freq))
  assert.ok(top(3) > top(2) && top(6) > top(3))
  assert.equal(top(14), top(40), 'capped at one octave')
  const len = (r: 'common' | 'rare' | 'epic') => sfxScore('loot', { rarity: r }).length
  assert.ok(len('common') < len('rare') && len('rare') < len('epic'))
})

test('haptic patterns are short and never required', () => {
  for (const n of NAMES) assert.ok(HAPTICS[n].reduce((a, b) => a + b, 0) <= 400, n)
})

test('every gear item has a rarity decision', () => {
  for (const g of GEAR) assert.ok(g.name in RARITY_BY_NAME, `${g.name} needs a rarity in rarity.ts`)
  assert.equal(rarityOf('Moonlit Katana'), 'epic')
  assert.equal(rarityOf('Not a real item'), 'common')
})

test('run stats: new words, promotions, mastery, misses, streak and accuracy', () => {
  let s = emptyStats()
  s = recordAnswer(s, { id: '石', isCorrect: true, streakAfter: 1, levelBefore: -1, levelAfter: 0, gold: 0 })
  s = recordAnswer(s, { id: '石', isCorrect: true, streakAfter: 2, levelBefore: 0, levelAfter: 0, gold: 0 })
  s = recordAnswer(s, { id: '石', isCorrect: true, streakAfter: 3, levelBefore: 0, levelAfter: 1, gold: 7 })
  s = recordAnswer(s, { id: '目', isCorrect: false, streakAfter: 0, levelBefore: 2, levelAfter: 1, gold: 0 })
  s = recordAnswer(s, { id: '好', isCorrect: true, streakAfter: 1, levelBefore: MAX_LV - 1, levelAfter: MAX_LV, gold: 0 })
  assert.deepEqual(s.newWords, ['石'])
  assert.deepEqual(s.leveled, ['石', '好'])
  assert.deepEqual(s.mastered, ['好'])
  assert.deepEqual(s.missed, ['目'])
  assert.equal(s.bestStreak, 3); assert.equal(s.gold, 7); assert.equal(s.total, 5)
  assert.equal(accuracyPct(s), 80)
  assert.equal(accuracyPct(emptyStats()), 0)
  const again = recordAnswer(s, { id: '石', isCorrect: true, streakAfter: 4, levelBefore: -1, levelAfter: 0, gold: 0 })
  assert.deepEqual(again.newWords, ['石'], 'no duplicates')
})

test('gear comparison: rows only for stats that matter, deltas, upgrade flag', () => {
  const g = (n: string) => GEAR.find(x => x.name === n)!
  const rows = compareGear(g('Windrunner Boots'), g('Mossy Vest'))
  assert.deepEqual(rows.map(r => [r.label, r.now, r.next, r.delta]), [['Max hearts', 1, 0, -1], ['Hints per fight', 0, 1, 1]])
  assert.deepEqual(compareGear(g('Guardian Helm'), g('Mossy Vest')).map(r => [r.label, r.delta]), [['Max hearts', 0], ['Hints per fight', 1]])
  assert.deepEqual(compareGear(g('Copper Blade'), null).map(r => r.label), ['Attack'], 'empty slot: everything is a gain')
  assert.ok(compareGear(g('Copper Blade'), null).every(r => r.delta > 0))
  assert.equal(isUpgrade(g('Copper Blade'), null), true)
  assert.equal(isUpgrade(g('Golem Plate'), g('Mossy Vest')), true)
  assert.equal(isUpgrade(g('Mossy Vest'), g('Golem Plate')), false)
  assert.ok(gearScore(g('Golem Plate')) > gearScore(g('Mossy Vest')))
})

test('one item per slot: new / better are worn, worse is left behind, a trade-off asks', () => {
  const g = (n: string) => GEAR.find(x => x.name === n)!
  assert.equal(gearVerdict(g('Copper Blade'), null), 'new')
  assert.equal(gearVerdict(g('Windrunner Boots'), g('Mossy Vest')), 'tradeoff', 'one heart less, one hint more')
  assert.equal(gearVerdict(g('Guardian Helm'), g('Mossy Vest')), 'better', 'same heart plus a hint')
  assert.equal(gearVerdict(g('Mossy Vest'), g('Mossy Vest')), 'worse', 'identical gives nothing')
  const slots = new Set(GEAR.map(x => x.slot))
  let sawBetter = false, sawWorse = false
  for (const a of GEAR) for (const b of GEAR) if (a !== b && a.slot === b.slot) {
    const v = gearVerdict(a, b), back = gearVerdict(b, a)
    if (v === 'better') { sawBetter = true; assert.equal(back, 'worse', `${a.name}/${b.name}: a strict upgrade reverses to a strict downgrade`) }
    if (v === 'tradeoff') assert.equal(back, 'tradeoff')
    if (v === 'worse') sawWorse = true
  }
  assert.ok(slots.size >= 2 && sawBetter && sawWorse, 'the data contains pure upgrades and pure downgrades')
})
