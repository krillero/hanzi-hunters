import test from 'node:test'
import assert from 'node:assert/strict'
import { ENEMIES, GEAR, WORDS } from '../src/data.ts'
import {
  buildQuestion, defaultSave, enemyMaxHp, pickWord, resolveAnswer, sanitizeSave, usePotion, type AnswerInput
} from '../src/game/rules.ts'

const hanzi = WORDS.map(w => w.hanzi)
const base = (over: Partial<AnswerInput> = {}): AnswerInput => ({
  save: defaultSave, battleHp: 30, enemyHp: 24, enemy: ENEMIES[0], gear: [], word: WORDS[0], isCorrect: true,
  roll: { drop: 0.99, item: 0 }, allGear: GEAR, ...over
})

test('vocabulary data is consistent', () => {
  assert.equal(new Set(hanzi).size, WORDS.length, 'duplicate hanzi')
  for (const w of WORDS) {
    assert.ok(w.choices.includes(w.answer), `${w.hanzi}: answer not in choices`)
    assert.equal(new Set(w.choices).size, w.choices.length, `${w.hanzi}: duplicate choices`)
    assert.equal(w.answer, w.prompt === 'pinyin' ? w.pinyin : w.meaning, `${w.hanzi}: answer does not match prompt type`)
    if (w.prompt === 'pinyin') for (const c of w.choices) assert.equal(c.normalize('NFC'), c, `${w.hanzi}: choice not NFC`)
  }
})

test('every question has exactly one correct option', () => {
  for (const w of WORDS) {
    const q = buildQuestion(w, WORDS)
    const correct = q.options.filter(o => o === (q.type === 'character' ? w.hanzi : w.answer))
    assert.equal(correct.length, 1, w.hanzi)
    assert.equal(q.options.length, 4)
  }
  const ch = buildQuestion({ ...WORDS[0], prompt: 'character' }, WORDS)
  assert.ok(ch.options.includes(WORDS[0].hanzi))
})

test('correct answer damages, learns, awards xp; wrong answer takes counterattack', () => {
  const ok = resolveAnswer(base())
  assert.equal(ok.playerDamage, 13); assert.equal(ok.enemyHp, 11); assert.equal(ok.battleHp, 25)
  assert.deepEqual(ok.save.learned, ['人']); assert.equal(ok.save.xp, 5)
  const bad = resolveAnswer(base({ isCorrect: false }))
  assert.equal(bad.playerDamage, 2); assert.equal(bad.battleHp, 25); assert.deepEqual(bad.save.missed, ['人'])
  assert.deepEqual(bad.save.learned, [])
})

test('killing blow: no counterattack, rewards once, floor advances', () => {
  const r = resolveAnswer(base({ enemyHp: 5 }))
  assert.equal(r.outcome, 'victory'); assert.equal(r.battleHp, 30)
  assert.equal(r.goldGained, ENEMIES[0].gold); assert.equal(r.save.floor, 2); assert.equal(r.save.xp, 5 + ENEMIES[0].xp)
})

test('wrong answer that kills still counts as a kill', () => {
  const r = resolveAnswer(base({ enemyHp: 2, isCorrect: false }))
  assert.equal(r.outcome, 'victory'); assert.equal(r.battleHp, 30)
})

test('defeat clamps hp at 0', () => {
  const r = resolveAnswer(base({ battleHp: 3 }))
  assert.equal(r.outcome, 'defeat'); assert.equal(r.battleHp, 0); assert.equal(r.save.hp, 0)
})

test('loot: new item granted, duplicate converts to gold', () => {
  const drop = resolveAnswer(base({ enemyHp: 1, roll: { drop: 0.1, item: 0 } }))
  assert.equal(drop.loot?.name, GEAR[0].name); assert.deepEqual(drop.save.gear, [GEAR[0].name])
  const dup = resolveAnswer(base({ enemyHp: 1, roll: { drop: 0.1, item: 0 }, save: { ...defaultSave, gear: [GEAR[0].name] } }))
  assert.equal(dup.loot, null); assert.equal(dup.duplicateGold, 4); assert.equal(dup.goldGained, ENEMIES[0].gold + 4)
})

test('gear bonuses apply: blade attack, charm xp, coin gold', () => {
  const g = (n: string) => GEAR.find(x => x.name === n)!
  assert.equal(resolveAnswer(base({ gear: [g('Copper Blade')] })).playerDamage, 15)
  assert.equal(resolveAnswer(base({ gear: [g('Scholar Charm')], isCorrect: true })).xpGained, 6)
  assert.equal(resolveAnswer(base({ gear: [g('Lucky Coin')], enemyHp: 1 })).goldGained, ENEMIES[0].gold + 3)
})

test('multiple level-ups in one fight and hp heal capped', () => {
  const r = resolveAnswer(base({ enemyHp: 1, save: { ...defaultSave, xp: 29, level: 1 }, battleHp: 20 }))
  assert.equal(r.leveledUp, 1); assert.equal(r.save.level, 2); assert.equal(r.save.maxHp, 35)
  const big = resolveAnswer(base({ enemyHp: 1, save: { ...defaultSave, xp: 0, level: 1 }, enemy: { ...ENEMIES[0], xp: 200 } }))
  assert.ok(big.leveledUp >= 2); assert.ok(big.battleHp <= big.save.maxHp)
})

test('potion rules', () => {
  assert.deepEqual(usePotion(10, 30, 1), { battleHp: 22, potions: 0 })
  assert.equal(usePotion(30, 30, 1), null); assert.equal(usePotion(10, 30, 0), null); assert.equal(usePotion(0, 30, 1), null)
  assert.equal(usePotion(25, 30, 2)?.battleHp, 30)
})

test('enemy hp scaling', () => { assert.equal(enemyMaxHp(ENEMIES[0], 1), 24); assert.equal(enemyMaxHp(ENEMIES[0], 4), 33) })

test('sanitizeSave handles garbage and old shapes', () => {
  for (const bad of [null, undefined, 5, 'x', [], { level: 'a', gear: 'x', hp: NaN, learned: [1, 2] }]) {
    const s = sanitizeSave(bad, GEAR, hanzi)
    assert.equal(s.level, 1); assert.deepEqual(s.gear, []); assert.deepEqual(s.learned, []); assert.ok(s.hp > 0)
  }
  const old = sanitizeSave({ level: 3, xp: 4, gold: 9, maxHp: 40, hp: 0, attack: 6, learned: ['人', '??'], gear: ['Mossy Vest', 'Nope'], potions: 2, floor: 4 }, GEAR, hanzi)
  assert.deepEqual(old.learned, ['人']); assert.deepEqual(old.gear, ['Mossy Vest']); assert.equal(old.hp, 48); assert.deepEqual(old.missed, [])
  assert.equal(sanitizeSave({ hp: 9999 }, GEAR, hanzi).hp, 30)
})

test('pickWord never repeats the current word and can revisit missed words', () => {
  for (let i = 0; i < 200; i++) assert.notEqual(pickWord(WORDS, [], '人').hanzi, '人')
  assert.equal(pickWord(WORDS, ['火'], '人', () => 0).hanzi, '火')
})
