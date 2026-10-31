import test from 'node:test'
import assert from 'node:assert/strict'
import { HAPTICS, sfxScore, totalDuration, type SfxName } from '../src/audio.ts'
import { RARITY_BY_NAME, rarityOf } from '../src/game/rarity.ts'
import { accuracyPct, emptyStats, recordAnswer } from '../src/game/runStats.ts'
import { GEAR } from '../src/data.ts'

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
  s = recordAnswer(s, { hanzi: '石', isCorrect: true, streakAfter: 1, levelBefore: -1, levelAfter: 0, gold: 0 })
  s = recordAnswer(s, { hanzi: '石', isCorrect: true, streakAfter: 2, levelBefore: 0, levelAfter: 0, gold: 0 })
  s = recordAnswer(s, { hanzi: '石', isCorrect: true, streakAfter: 3, levelBefore: 0, levelAfter: 1, gold: 7 })
  s = recordAnswer(s, { hanzi: '目', isCorrect: false, streakAfter: 0, levelBefore: 2, levelAfter: 1, gold: 0 })
  s = recordAnswer(s, { hanzi: '好', isCorrect: true, streakAfter: 1, levelBefore: 3, levelAfter: 4, gold: 0 })
  assert.deepEqual(s.newWords, ['石'])
  assert.deepEqual(s.leveled, ['石', '好'])
  assert.deepEqual(s.mastered, ['好'])
  assert.deepEqual(s.missed, ['目'])
  assert.equal(s.bestStreak, 3); assert.equal(s.gold, 7); assert.equal(s.total, 5)
  assert.equal(accuracyPct(s), 80)
  assert.equal(accuracyPct(emptyStats()), 0)
  const again = recordAnswer(s, { hanzi: '石', isCorrect: true, streakAfter: 4, levelBefore: -1, levelAfter: 0, gold: 0 })
  assert.deepEqual(again.newWords, ['石'], 'no duplicates')
})
