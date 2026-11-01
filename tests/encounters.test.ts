import test from 'node:test'
import assert from 'node:assert/strict'
import encountersJson from '../src/content/encounters.json' with { type: 'json' }
import { offer, complete, choose, cleanEncounter, stageFor, previewEncounter, validateEncounters, sceneById, SCENES } from '../src/game/encounters.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { newRun, bankRun } from '../src/game/rules.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { ENEMIES, GEAR, WORDS, ACTIVE_CURRICULUM } from '../src/data.ts'
import type { Saved } from '../src/game/types.ts'
import { stepsOf } from '../src/game/course.ts'

const wordIds = WORDS.map(w => w.id)
/** A save right after a floor-1 boss, with the given words introduced (default: every word any scene needs). */
const ready = (ids: string[] = [...new Set(SCENES.flatMap(s => s.requires))]): Saved => {
  const s = sanitizeSave(null)
  s.run = { ...newRun(NO_BONUSES, GEAR, ENEMIES), phase: 'victory' as const, kill: 3, enemyHp: 0 }
  s.mastery = Object.fromEntries(ids.map(id => [id, { lv: 2, ok: 0 }]))
  return s
}
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
  const base = previewEncounter('hello', '0')!
  assert.deepEqual(choose(choose(base, reply, '你好'), reply, '再见').selected, ['再见'])
  const g = previewEncounter('tea', '0')!
  assert.deepEqual(choose(choose(g, gather, '茶'), gather, '水').selected, ['茶', '水'])
  assert.deepEqual(cleanEncounter({ ...base, selected: ['你好', '再见'] })!.selected, ['你好'])
})

test('wrong choices and repeated completion change nothing; a right one gives 3 gold once', () => {
  const s = offer(ready(), () => 0.5)
  const scene = sceneById(s.run!.encounter!.id)!
  const wrong = scene.options.map(o => o.id).filter(id => !scene.answer.includes(id)).slice(0, 1)
  const w = active(s, wrong); assert.equal(complete(w, '2026-11-01'), w)
  const r = active(s, [...scene.answer].reverse())
  const done = complete(r, '2026-11-01')
  assert.equal(done.run!.gold, r.run!.gold + 3); assert.equal(done.run!.hearts, r.run!.hearts)
  assert.deepEqual(done.mastery, r.mastery); assert.deepEqual(done.practiced, r.practiced)
  assert.equal(complete(done, '2026-11-01'), done)
  const reloaded = sanitizeSave(JSON.parse(JSON.stringify(done)))
  assert.equal(complete(reloaded, '2026-11-02'), reloaded); assert.equal(offer(reloaded), reloaded)
  assert.equal(bankRun(reloaded.meta, reloaded.run!, 'returned').meta.gold, reloaded.run!.gold)
})

test('old saves default safely; a pending encounter survives a reload; a removed scene is closed', () => {
  const old = ready(); assert.deepEqual(sanitizeSave(old).encounterHistory, {})
  const s = offer(ready(['我', '要', '谢谢', '茶', '水', '米饭', '菜']), () => 0.2)
  s.run!.encounter = { ...s.run!.encounter!, status: 'active', selected: ['水'], help: true }
  const loaded = sanitizeSave(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(loaded.run!.encounter, s.run!.encounter)
  // A tea scene saved before the scenes moved to encounters.json keeps its order of four items.
  const legacy = { id: 'tea', stage: 1, status: 'active', selected: ['茶'], order: ['菜', '米饭', '茶', '水'], help: false }
  assert.deepEqual(cleanEncounter(legacy), legacy)
  assert.equal(cleanEncounter({ id: 'removed' })!.status, 'closed')
})

test('stages require distinct completion days and current mastery of the scene’s own words', () => {
  const req = sceneById('hello')!.requires
  const m = ready(req).mastery
  assert.equal(stageFor(m, [], req), 0)
  assert.equal(stageFor(m, ['2026-11-01', '2026-11-01'], req), 1)
  assert.equal(stageFor(m, ['2026-11-01', '2026-11-02'], req), 2)
  m['你好'].lv = 0; assert.equal(stageFor(m, ['2026-11-01', '2026-11-02'], req), 0)
})

test('preview link builds a playable scene only for known ids and clamps the stage', () => {
  assert.equal(previewEncounter('nope', '1'), null); assert.equal(previewEncounter(null, null), null)
  const p = previewEncounter('meal', '2')!; assert.equal(p.status, 'active'); assert.equal(p.stage, 2)
  assert.equal(previewEncounter('hello', '9')!.stage, 0)
})
