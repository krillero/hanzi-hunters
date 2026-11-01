import test from 'node:test'
import assert from 'node:assert/strict'
import trialsJson from '../src/content/trials.json' with { type: 'json' }
import { TRIALS, validateTrials, offerTrial, resolveTrial, closeTrial, cleanTrial, trialById } from '../src/game/trials.ts'
import { enemyStats, newRun, shieldFor } from '../src/game/rules.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { ENEMIES, GEAR, WORDS } from '../src/data.ts'
import type { Mastery, Run } from '../src/game/types.ts'

const wordIds = WORDS.map(w => w.id)
const known: Mastery = Object.fromEntries([...new Set(TRIALS.flatMap(t => t.requires))].map(id => [id, { lv: 1, ok: 0 }]))
/** The floor-1 Golem fight with its first shield segment just broken. */
const golem = (over: Partial<Run> = {}): Run => {
  const r = newRun(NO_BONUSES, GEAR, ENEMIES)
  const hp = enemyStats(ENEMIES, 1, 3, r.depth).hp
  return { ...r, floor: 1, kill: 3, phase: 'fighting', enemyHp: hp, shield: shieldFor(1, 'golem') - 1, ...over }
}
const io = (run: Run, chosen: string) => ({ run, bonuses: NO_BONUSES, enemies: ENEMIES, allGear: GEAR, roll: { drop: 0.99, item: 0.5 }, chosen })

test('trials.json is valid, loads completely and only uses early course words', () => {
  assert.deepEqual(validateTrials(trialsJson, wordIds), [])
  assert.equal(TRIALS.length, trialsJson.trials.length)
})

test('the validator keeps trials to tone differences and rejects sandhi-ambiguous distractors', () => {
  const hello = trialsJson.trials.find(t => t.id === 'hello')!
  const bad = (patch: object) => validateTrials({ trials: [{ ...hello, ...patch }] }, wordIds).join()
  assert.match(bad({ options: ['Nǐ hǎo!', 'Nǐ hǎo ma!', 'Nǐ hào!'] }), /only in tone marks/)
  assert.match(bad({ options: ['Nǐ hǎo!', 'Ní hǎo!', 'Nǐ hào!'] }), /third tone into a second tone/)
  assert.match(bad({ zh: '你好吗？' }), /"吗"/)
  assert.match(bad({ answer: 'Nǐ hāo!' }), /answer must be one of the options/)
})

test('offered once per Golem fight, after the first shield segment breaks, with a line of known words', () => {
  const offered = offerTrial(golem(), known, () => 0)
  assert.equal(offered.trial?.status, 'pending'); assert.equal(offered.trial?.floor, 1)
  const full = golem({ shield: shieldFor(1, 'golem') }); assert.equal(offerTrial(full, known), full)
  const none = golem(); assert.equal(offerTrial(none, {}), none)
  const done = closeTrial(offered); assert.equal(offerTrial(done, known), done)
  const scribe = golem({ floor: 3 }); assert.equal(offerTrial(scribe, known), scribe)
})

test('a right answer shatters the shield and staggers the Golem without killing it; answering twice does nothing', () => {
  const run = offerTrial(golem(), known, () => 0), t = trialById(run.trial!.id)!
  const res = resolveTrial(io(run, t.answer))!
  assert.ok(res.correct); assert.equal(res.run.shield, 0); assert.equal(res.run.hearts, run.hearts)
  assert.ok(res.hit > 0 && res.run.enemyHp === run.enemyHp - res.hit && res.run.enemyHp >= 1)
  assert.equal(resolveTrial(io(res.run, t.answer)), null)
  const nearlyDead = { ...run, enemyHp: 3 }
  assert.equal(resolveTrial(io(nearlyDead, t.answer))!.run.enemyHp, 1)
})

test('a wrong answer is an ordinary wrong answer: a heart (or a second chance), the shield holds, defeat at zero', () => {
  const run = offerTrial(golem(), known, () => 0), t = trialById(run.trial!.id)!
  const wrong = t.options.find(o => o !== t.answer)!
  const res = resolveTrial(io({ ...run, secondLeft: 0 }, wrong))!
  assert.equal(res.correct, false); assert.equal(res.run.hearts, run.hearts - 1); assert.equal(res.run.shield, run.shield); assert.equal(res.run.trial?.status, 'answered')
  const saved = resolveTrial(io({ ...run, secondLeft: 1 }, wrong))!
  assert.equal(saved.run.hearts, run.hearts); assert.ok(saved.savedBySecondChance)
  const last = resolveTrial(io({ ...run, hearts: 1, secondLeft: 0 }, wrong))!
  assert.equal(last.outcome, 'defeat'); assert.equal(last.run.phase, 'defeat')
})

test('skipping changes nothing but the trial status; a pending trial survives a reload; junk is dropped', () => {
  const run = offerTrial(golem(), known, () => 0.7)
  const skipped = closeTrial(run)
  assert.deepEqual({ ...skipped, trial: undefined }, { ...run, trial: undefined }); assert.equal(skipped.trial?.status, 'done')
  const s = sanitizeSave(null); s.run = run; s.mastery = known
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(s))).run!.trial, run.trial)
  assert.equal(cleanTrial('junk'), undefined)
  assert.equal(cleanTrial({ id: 'gone', floor: 1, status: 'pending' })!.status, 'done')
  assert.equal(cleanTrial({ ...run.trial, status: 'answered' })!.status, 'done')   // answered without a valid choice
})
