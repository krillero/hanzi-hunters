import test from 'node:test'
import assert from 'node:assert/strict'
import encountersJson from '../src/content/encounters.json' with { type: 'json' }
import { offer, submitEncounter, payHelp, helpHintsLeft, choose, cleanEncounter, previewEncounter, validateEncounters, sceneById, SCENES } from '../src/game/encounters.ts'
import { pinyinFor, showPinyin, wordsIn, fixedLevel, levelOf } from '../src/game/support.ts'
import { blankedPinyin } from '../src/game/trialgen.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { newRun, advance, resolveAnswer } from '../src/game/rules.ts'
import { computeBonuses } from '../src/game/upgrades.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { ENEMIES, GEAR, WORDS, ACTIVE_CURRICULUM } from '../src/data.ts'
import type { Run, Saved } from '../src/game/types.ts'
import { stepsOf } from '../src/game/course.ts'

const wordIds = WORDS.map(w => w.id)
/** A save right after a floor-1 boss, with the given words introduced (default: every word any scene needs). */
const ready = (ids: string[] = [...new Set(SCENES.flatMap(s => s.requires))]): Saved => {
  const s = sanitizeSave(null)
  s.run = { ...newRun(NO_BONUSES, GEAR, ENEMIES), phase: 'victory' as const, kill: 3, enemyHp: 0 }
  s.mastery = Object.fromEntries(ids.map(id => [id, { lv: 2, ok: 0 }]))
  return s
}
const closeIt = (s: Saved) => ({ ...s.run!, encounter: { ...s.run!.encounter!, status: 'closed' as const } })
const active = (s: Saved, selected: string[]) => ({ ...s, run: { ...s.run!, encounter: { ...s.run!.encounter!, status: 'active' as const, selected } } })

test('encounters.json is valid and every shipped scene loads', () => {
  assert.deepEqual(validateEncounters(encountersJson, wordIds), [])
  assert.equal(SCENES.length, encountersJson.scenes.length)
})

test('the validator catches untaught characters, unknown options and ambiguous replies', () => {
  const hello = encountersJson.scenes.find(s => s.id === 'hello')!
  const bad = (patch: object) => validateEncounters({ scenes: [{ ...hello, ...patch }] }, wordIds)
  assert.match(bad({ zh: '你好吗？' }).join(), /"吗"/)
  assert.match(bad({ options: [...hello.options, { id: '吃', en: 'eat', icon: '🍽' }] }).join(), /must be listed in requires/)
  assert.match(bad({ answer: ['你好', '再见'] }).join(), /exactly one answer/)
  assert.match(validateEncounters({ scenes: [hello, hello] }, wordIds).join(), /duplicate id/)
})

test('a greeting scene is offered from the very first course words; a scene needs all its own words', () => {
  const first = [...new Set(stepsOf(ACTIVE_CURRICULUM).map(st => st.intro.entryId))]
  const s = ready(first.slice(0, 5))
  const e = offer(s).run!.encounter!
  assert.ok(['hello', 'goodbye', 'sorry'].includes(e.id), e.id)
  const missing = ready(['你好', '谢谢'])
  assert.equal(offer(missing).run!.encounter, undefined)
  let t = ready(); t.run!.floor = 5; assert.equal(offer(t), t)
  t = ready(); t.run!.phase = 'fighting'; assert.equal(offer(t), t)
})

test('the scene completed on the fewest days is offered first; file order breaks ties', () => {
  const s = ready()
  assert.equal(offer(s).run!.encounter!.id, SCENES[0].id)
  s.encounterHistory = { [SCENES[0].id]: { dates: ['2026-11-01'] } }
  assert.equal(offer(s).run!.encounter!.id, SCENES[1].id)
})

test('a reply scene keeps one choice; a gather scene several', () => {
  const reply = sceneById('hello')!, gather = sceneById('tea')!
  const base = previewEncounter('hello')!
  assert.deepEqual(choose(choose(base, reply, '你好'), reply, '再见').selected, ['再见'])
  const g = previewEncounter('tea')!
  assert.deepEqual(choose(choose(g, gather, '茶'), gather, '水').selected, ['茶', '水'])
  assert.deepEqual(cleanEncounter({ ...base, selected: ['你好', '再见'] })!.selected, ['你好'])
})

test('right on the first try: Blessing for the next floor, no gold; repeats change nothing', () => {
  const s = offer(ready(), () => 0.5)
  const scene = sceneById(s.run!.encounter!.id)!
  const r = active(s, [...scene.answer].reverse())
  const done = submitEncounter(r, '2026-11-01')
  assert.equal(done.run!.encounter!.status, 'complete'); assert.equal(done.run!.encounter!.first, 'right')
  assert.deepEqual(done.run!.omen, { kind: 'blessing', floor: r.run!.floor + 1 })
  assert.equal(done.run!.gold, r.run!.gold, 'no gold any more'); assert.equal(done.run!.hearts, r.run!.hearts)
  assert.deepEqual(done.mastery, r.mastery); assert.deepEqual(done.practiced, r.practiced)
  assert.equal(submitEncounter(done, '2026-11-01'), done)
  const reloaded = sanitizeSave(JSON.parse(JSON.stringify(done)))
  assert.deepEqual(reloaded.run!.omen, done.run!.omen); assert.equal(reloaded.run!.encounter!.first, 'right')
  assert.equal(submitEncounter(reloaded, '2026-11-02'), reloaded); assert.equal(offer(reloaded), reloaded)
})

test('wrong first choice: Shaken for the next floor; fixing it completes without a Blessing; later misses add nothing', () => {
  const s = offer(ready(), () => 0.5)
  const scene = sceneById(s.run!.encounter!.id)!
  const wrong = scene.options.map(o => o.id).filter(id => !scene.answer.includes(id)).slice(0, 1)
  const w = submitEncounter(active(s, wrong), '2026-11-01')
  assert.equal(w.run!.encounter!.status, 'active'); assert.equal(w.run!.encounter!.first, 'wrong')
  assert.deepEqual(w.run!.omen, { kind: 'shaken', floor: s.run!.floor + 1 })
  assert.equal(submitEncounter(w, '2026-11-01'), w, 'a second wrong choice changes nothing')
  const fixed = submitEncounter({ ...w, run: { ...w.run!, encounter: { ...w.run!.encounter!, selected: [...scene.answer] } } }, '2026-11-01')
  assert.equal(fixed.run!.encounter!.status, 'complete'); assert.equal(fixed.run!.omen!.kind, 'shaken', 'still Shaken')
})

test('help costs one hint of the next fight, once; without hints it cannot be bought', () => {
  const s = offer(ready(), () => 0.5)
  assert.equal(helpHintsLeft(s), 0, 'a new player has no hints'); assert.equal(payHelp(s), s)
  const rich = { ...s, meta: { ...s.meta, upgrades: ['S1'] } }   // Eagle Eye: 1 hint per fight
  assert.equal(helpHintsLeft(rich), 1)
  const paid = payHelp(rich)
  assert.equal(paid.run!.hintDebt, 1); assert.equal(paid.run!.encounter!.paid, true); assert.equal(paid.run!.encounter!.help, true)
  assert.equal(payHelp(paid), paid, 'bought once'); assert.equal(helpHintsLeft(paid), 0)
  const next = advance(closeIt(paid), computeBonuses(['S1']), ENEMIES, GEAR)!
  assert.equal(next.hintsLeft, 0, 'the next fight starts one hint short'); assert.equal(next.hintDebt, 0)
  assert.equal(advance({ ...next, phase: 'victory', enemyHp: 0 }, computeBonuses(['S1']), ENEMIES, GEAR)!.hintsLeft, 1, 'and the fight after is back to normal')
})


test('old saves default safely; a pending encounter survives a reload; a removed scene is closed', () => {
  const old = ready(); assert.deepEqual(sanitizeSave(old).encounterHistory, {})
  const s = offer(ready(['我', '要', '谢谢', '茶', '水', '米饭', '菜']), () => 0.2)
  s.run!.encounter = { ...s.run!.encounter!, status: 'active', selected: ['水'], help: true }
  const loaded = sanitizeSave(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(loaded.run!.encounter, s.run!.encounter)
  // A tea scene saved before the scenes moved to encounters.json keeps its order of four items.
  const legacy = { id: 'tea', stage: 1, status: 'active', selected: ['茶'], order: ['菜', '米饭', '茶', '水'], help: false }
  const { stage: _old, ...current } = legacy   // the old day-based support stage is dropped on load
  assert.deepEqual(cleanEncounter(legacy), current)
  assert.equal(cleanEncounter({ id: 'removed' })!.status, 'closed')
})

test('an event needs every word at Familiar or higher; help follows each word: pinyin up to Familiar, English never by default', () => {
  const hello = sceneById('hello')!
  const at = (lv: number) => Object.fromEntries(hello.requires.map(id => [id, { lv, ok: 0 }]))
  const run = (lv: number) => { const s = ready(hello.requires); s.mastery = at(lv); return offer(s).run!.encounter }
  assert.equal(run(1), undefined, 'Learning words: not offered yet')
  assert.ok(run(2), 'Familiar: offered')
  assert.equal(showPinyin(2), true); assert.equal(showPinyin(3), false)
  assert.deepEqual(wordsIn('我是你朋友。', ['我', '是', '朋友', '茶']), ['我', '是', '朋友'])
  const m = { 我: { lv: 3, ok: 0 }, 是: { lv: 4, ok: 0 }, 朋友: { lv: 2, ok: 0 } }
  assert.equal(pinyinFor('我是你朋友。', ['我', '是', '朋友'], levelOf(m)), true, 'the weakest word (朋友, Familiar) still needs pinyin')
  assert.equal(pinyinFor('我是', ['我', '是', '朋友'], levelOf(m)), false, 'all Remembered or higher: characters only')
  assert.equal(pinyinFor('…', ['我'], fixedLevel(5)), true, 'no known word found in the text: pinyin shown')
  for (const sc of SCENES) for (const o of sc.options) assert.equal(o.icon !== undefined, o.picture === true, `${sc.id}/${o.id}: only picture options have an icon`)
})

test('a torn note can show its pinyin with the missing syllable blanked too', () => {
  assert.equal(blankedPinyin('我是你朋＿。', 'Wǒ shì nǐ péngyou.'), 'Wǒ shì nǐ péng＿.')
  assert.equal(blankedPinyin('对＿起！', 'Duìbuqǐ!'), 'Duì＿qǐ!')
  assert.equal(blankedPinyin('你＿！', 'Nǐ hǎo ma?'), null, 'syllables do not match the characters: no pinyin')
})

test('preview link builds a playable scene only for known ids', () => {
  assert.equal(previewEncounter('nope'), null); assert.equal(previewEncounter(null), null)
  const p = previewEncounter('meal')!; assert.equal(p.status, 'active'); assert.deepEqual(p.selected, [])
})

test('scenes unlock early in the default course: greetings by word 5, who-is-it by 20, counting by 35', () => {
  const course = [...new Set(stepsOf(ACTIVE_CURRICULUM).map(st => st.intro.entryId))]
  const unlockAt = (id: string) => Math.max(...sceneById(id)!.requires.map(w => course.indexOf(w) + 1))
  assert.ok(unlockAt('hello') <= 3 && unlockAt('sorry') <= 5)
  assert.ok(unlockAt('friend-he') <= 20 && unlockAt('friend-she') <= 20)
  assert.ok(['count-three', 'count-four', 'count-five'].every(id => unlockAt(id) <= 35))
  for (const s of SCENES) assert.ok(s.requires.every(w => course.includes(w)), `${s.id} uses a word outside the course`)
})

test('point scenes: picture options only, one answer, and the pictures stay out of other kinds', () => {
  const he = encountersJson.scenes.find(s => s.id === 'friend-he')!
  const bad = (patch: object) => validateEncounters({ scenes: [{ ...he, ...patch }] }, wordIds).join()
  assert.match(bad({ answer: ['man', 'woman'] }), /exactly one answer|at least one option must be wrong/)
  assert.match(bad({ options: [...he.options, { id: '朋友', en: 'friend', icon: '🧑' }] }), /picture options only/)
  const hello = encountersJson.scenes.find(s => s.id === 'hello')!
  assert.match(validateEncounters({ scenes: [{ ...hello, options: [...hello.options, { id: 'x', en: 'x', icon: '❓', picture: true }] }] }, wordIds).join(), /only for point scenes/)
  const scene = sceneById('friend-he')!, p = previewEncounter('friend-he')!
  assert.deepEqual(choose(choose(p, scene, 'man'), scene, 'woman').selected, ['woman'])
})

test('an encounter opens straight into the scene; a save from the old intro step loads as active', () => {
  assert.equal(offer(ready(), () => 0.5).run!.encounter!.status, 'active')
  assert.equal(cleanEncounter({ id: 'hello', stage: 0, status: 'offer', selected: [], order: ['你好', '再见', '谢谢'], help: false })!.status, 'active')
})

test('omens count once, on their floor: Blessing saves a heart first; Shaken ignores calm and second chances, not practice', () => {
  const base = { ...newRun(NO_BONUSES, GEAR, ENEMIES), floor: 2, kill: 0, phase: 'fighting' as const, enemyHp: 30, secondLeft: 1, calm: 1 }
  const wrong = (run: Run, practice = false) => resolveAnswer({ run, bonuses: NO_BONUSES, enemies: ENEMIES, allGear: GEAR, lv: 1, isCorrect: false, practice, roll: { drop: 0.99, item: 0 } })
  const blessed = wrong({ ...base, omen: { kind: 'blessing', floor: 2 } })
  assert.ok(blessed.savedByBlessing); assert.equal(blessed.heartsLost, 0); assert.equal(blessed.run.omen, undefined); assert.equal(blessed.run.calm, 1, 'calm kept for later')
  const shaken = wrong({ ...base, omen: { kind: 'shaken', floor: 2 } })
  assert.ok(shaken.shakenHit); assert.equal(shaken.heartsLost, 1); assert.equal(shaken.savedBySecondChance, false); assert.equal(shaken.run.calm, 1); assert.equal(shaken.run.omen, undefined)
  const practice = wrong({ ...base, omen: { kind: 'shaken', floor: 2 } }, true)
  assert.ok(practice.practiceSaved); assert.deepEqual(practice.run.omen, { kind: 'shaken', floor: 2 }, 'a protected practice question does not use it up')
  const later = wrong({ ...base, floor: 3, omen: { kind: 'shaken', floor: 2 } })
  assert.equal(later.shakenHit, false, 'another floor: no effect'); assert.ok(later.savedByCalm)
})
