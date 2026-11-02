import test from 'node:test'
import assert from 'node:assert/strict'
import trialsJson from '../src/content/trials.json' with { type: 'json' }
import { TRIALS, validateTrials, validateTrialsFile, offerTrial, resolveTrial, closeTrial, cleanTrial, trialById, trialFor, optionKeys } from '../src/game/trials.ts'
import { WARDEN_SEALS, WRAITH_ECHO_AT, enemyStats, newRun, resolveAnswer, shieldFor, startFight } from '../src/game/rules.ts'
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
  assert.deepEqual(validateTrialsFile(trialsJson, wordIds), [])
  assert.match(validateTrialsFile({ trials: [{ ...trialsJson.trials[0], id: 'gen-hello' }] }, wordIds).join(), /reserved/)
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
  const offered = offerTrial(golem(), known, ENEMIES, () => 0)
  assert.equal(offered.trial?.status, 'pending'); assert.equal(offered.trial?.floor, 1)
  const full = golem({ shield: shieldFor(1, 'golem') }); assert.equal(offerTrial(full, known, ENEMIES), full)
  const none = golem(); assert.equal(offerTrial(none, {}, ENEMIES), none)
  const done = closeTrial(offered); assert.equal(offerTrial(done, known, ENEMIES), done)
  const scribe = golem({ floor: 3 }); assert.equal(offerTrial(scribe, known, ENEMIES), scribe)
})

test('a right answer shatters the shield and staggers the Golem without killing it; answering twice does nothing', () => {
  const run = offerTrial(golem(), known, ENEMIES, () => 0), t = trialFor(run.trial)!
  const res = resolveTrial(io(run, t.answer))!
  assert.ok(res.correct); assert.equal(res.run.shield, 0); assert.equal(res.run.hearts, run.hearts)
  assert.ok(res.hit > 0 && res.run.enemyHp === run.enemyHp - res.hit && res.run.enemyHp >= 1)
  assert.equal(resolveTrial(io(res.run, t.answer)), null)
  const nearlyDead = { ...run, enemyHp: 3 }
  assert.equal(resolveTrial(io(nearlyDead, t.answer))!.run.enemyHp, 1)
})

test('a wrong answer is an ordinary wrong answer: a heart (or a second chance), the shield holds, defeat at zero', () => {
  const run = offerTrial(golem(), known, ENEMIES, () => 0), t = trialFor(run.trial)!
  const wrong = t.options.find(o => o !== t.answer)!
  const res = resolveTrial(io({ ...run, secondLeft: 0 }, wrong))!
  assert.equal(res.correct, false); assert.equal(res.run.hearts, run.hearts - 1); assert.equal(res.run.shield, run.shield); assert.equal(res.run.trial?.status, 'answered')
  const saved = resolveTrial(io({ ...run, secondLeft: 1 }, wrong))!
  assert.equal(saved.run.hearts, run.hearts); assert.ok(saved.savedBySecondChance)
  const last = resolveTrial(io({ ...run, hearts: 1, secondLeft: 0 }, wrong))!
  assert.equal(last.outcome, 'defeat'); assert.equal(last.run.phase, 'defeat')
})

test('a pending trial cannot be closed unanswered and survives a reload; an answered one closes; junk is dropped', () => {
  const run = offerTrial(golem(), known, ENEMIES, () => 0.7)
  assert.equal(closeTrial(run), run)
  const answered = resolveTrial(io(run, trialFor(run.trial)!.answer))!.run
  assert.equal(closeTrial(answered).trial?.status, 'done')
  const s = sanitizeSave(null); s.run = run; s.mastery = known
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(s))).run!.trial, run.trial)
  assert.equal(cleanTrial('junk'), undefined)
  assert.equal(cleanTrial({ id: 'gone', floor: 1, status: 'pending' })!.status, 'done')
  assert.equal(cleanTrial({ ...run.trial, status: 'answered' })!.status, 'done')   // answered without a valid choice
})

/** The floor-2 Wraith fight at the given share of its HP. */
const wraith = (share: number, over: Partial<Run> = {}): Run => {
  const r = newRun(NO_BONUSES, GEAR, ENEMIES), hp = enemyStats(ENEMIES, 2, 3, r.depth).hp
  return { ...r, floor: 2, kill: 3, phase: 'fighting', enemyHp: Math.round(hp * share), shield: 0, ...over }
}

test('the Wraith offers its trial once it drops below its echo threshold, never above it', () => {
  assert.equal(offerTrial(wraith(0.9), known, ENEMIES).trial, undefined)
  const t = offerTrial(wraith(WRAITH_ECHO_AT - 0.05), known, ENEMIES, () => 0).trial!
  assert.equal(trialFor(t)!.boss, 'wraith'); assert.equal(t.floor, 2); assert.equal(t.status, 'pending')
})

test('the validator checks reply trials: every shown character known, options complete', () => {
  const who = trialsJson.trials.find(t => t.id === 'wraith-who')!
  const bad = (patch: object) => validateTrials({ trials: [{ ...who, ...patch }] }, wordIds).join()
  assert.match(bad({ options: [...who.options.slice(0, 2), { zh: '吃饭！', py: 'Chīfàn!', en: 'Eat!' }] }), /"吃" is shown/)
  assert.match(bad({ options: [...who.options.slice(0, 2), { zh: '再见！' }] }), /needs zh, py and en/)
  assert.match(bad({ py: '' }), /py \(pinyin of the line\) is required/)
})

test('a right reply calms the Wraith: the next wrong answer costs no heart, then hearts count again', () => {
  const run = offerTrial(wraith(0.5), known, ENEMIES, () => 0), t = trialFor(run.trial)!
  const calmed = resolveTrial(io({ ...run, secondLeft: 0 }, t.answer))!
  assert.ok(calmed.correct); assert.equal(calmed.run.calm, 1); assert.equal(calmed.run.enemyHp, run.enemyHp); assert.equal(calmed.run.hearts, run.hearts)
  const wrong1 = resolveAnswer({ run: closeTrial(calmed.run), bonuses: NO_BONUSES, enemies: ENEMIES, allGear: GEAR, lv: 1, isCorrect: false, roll: { drop: 0.99, item: 0.5 } })
  assert.ok(wrong1.savedByCalm); assert.equal(wrong1.heartsLost, 0); assert.equal(wrong1.run.calm, 0)
  const wrong2 = resolveAnswer({ run: wrong1.run, bonuses: NO_BONUSES, enemies: ENEMIES, allGear: GEAR, lv: 1, isCorrect: false, roll: { drop: 0.99, item: 0.5 } })
  assert.equal(wrong2.heartsLost, 1)
  // A practice question uses its own protection first and leaves the calm charge for later.
  const practice = resolveAnswer({ run: closeTrial(calmed.run), bonuses: NO_BONUSES, enemies: ENEMIES, allGear: GEAR, lv: 0, isCorrect: false, practice: true, roll: { drop: 0.99, item: 0.5 } })
  assert.ok(practice.practiceSaved); assert.equal(practice.run.calm, 1)
  // The charge is kept until used (the next fight still has it), and a wrong reply is an ordinary wrong answer.
  assert.equal(startFight(calmed.run, NO_BONUSES, ENEMIES, GEAR).calm, 1)
  const miss = resolveTrial(io({ ...run, secondLeft: 0 }, optionKeys(t).find(o => o !== t.answer)!))!
  assert.equal(miss.run.hearts, run.hearts - 1); assert.equal(miss.run.calm ?? 0, 0)
})

test('a calm charge survives a reload, also between fights; junk is clamped', () => {
  const s = sanitizeSave(null); s.run = { ...wraith(0.5), calm: 1 }
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(s))).run!.calm, 1)
  s.run = { ...wraith(0.5), calm: 1, phase: 'victory', enemyHp: 0 }
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(s))).run!.calm, 1)
  s.run = { ...wraith(0.5), calm: 7 as number }
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(s))).run!.calm, 1)
})

/** The floor-3 Scribe fight with the given number of ink seals left. */
const scribe = (seals: number, over: Partial<Run> = {}): Run => {
  const r = newRun(NO_BONUSES, GEAR, ENEMIES)
  return { ...r, floor: 3, kill: 3, phase: 'fighting', enemyHp: enemyStats(ENEMIES, 3, 3, r.depth).hp, shield: seals, ...over }
}

test('the Scribe offers its torn note right after its first seal breaks, not before or later', () => {
  const max = shieldFor(3, 'scribe')
  assert.equal(offerTrial(scribe(max), known, ENEMIES).trial, undefined)
  assert.equal(offerTrial(scribe(max - 2), known, ENEMIES).trial, undefined)
  const t = offerTrial(scribe(max - 1), known, ENEMIES, () => 0).trial!
  assert.equal(trialFor(t)!.boss, 'scribe'); assert.equal(t.status, 'pending')
})

test('the validator checks torn notes: one blank, Chinese options, known characters', () => {
  const n = trialsJson.trials.find(t => t.id === 'scribe-friend')!
  const bad = (patch: object) => validateTrials({ trials: [{ ...n, ...patch }] }, wordIds).join()
  assert.match(bad({ zh: '我是你朋友。' }), /exactly one blank/)
  assert.match(bad({ zh: '＿是你朋＿。' }), /exactly one blank/)
  assert.match(bad({ options: ['友', 'you', '人'] }), /Chinese characters only/)
  assert.match(bad({ options: ['友', '有', '吃'] }), /"吃" is shown/)
})

test('a right character breaks every remaining seal without damage; a wrong one is an ordinary wrong answer', () => {
  const run = offerTrial(scribe(shieldFor(3, 'scribe') - 1), known, ENEMIES, () => 0), t = trialFor(run.trial)!
  const res = resolveTrial(io(run, t.answer))!
  assert.ok(res.correct); assert.equal(res.run.shield, 0); assert.equal(res.run.enemyHp, run.enemyHp); assert.equal(res.run.hearts, run.hearts)
  const miss = resolveTrial(io({ ...run, secondLeft: 0 }, optionKeys(t).find(o => o !== t.answer)!))!
  assert.equal(miss.run.hearts, run.hearts - 1); assert.equal(miss.run.shield, run.shield)
})

/** The floor-4 Trickster fight at the given share of its HP. */
const trickster = (share: number, over: Partial<Run> = {}): Run => {
  const r = newRun(NO_BONUSES, GEAR, ENEMIES), hp = enemyStats(ENEMIES, 4, 3, r.depth).hp
  return { ...r, floor: 4, kill: 3, phase: 'fighting', enemyHp: Math.round(hp * share), shield: 0, ...over }
}

test('the Trickster offers its mirrors once below half HP; the validator needs a picture and full statements', () => {
  assert.equal(offerTrial(trickster(0.8), known, ENEMIES).trial, undefined)
  const t = offerTrial(trickster(0.4), known, ENEMIES, () => 0).trial!
  assert.equal(trialFor(t)!.boss, 'trickster')
  const her = trialsJson.trials.find(x => x.id === 'trickster-her')!
  const bad = (patch: object) => validateTrials({ trials: [{ ...her, ...patch }] }, wordIds).join()
  assert.match(bad({ picture: '' }), /picture \(or tiles\) is required/)
  assert.match(bad({ options: [her.options[0], her.options[1], { zh: '这是你。' }] }), /needs zh, py and en/)
  assert.match(bad({ options: [her.options[0], her.options[1], { zh: '这是猫。', py: 'Zhè shì māo.', en: 'This is a cat.' }] }), /"猫" is shown/)
})

test('the true statement lands a heavy blow that never kills; a false one is an ordinary wrong answer', () => {
  const run = offerTrial(trickster(0.45), known, ENEMIES, () => 0), t = trialFor(run.trial)!
  const hp = enemyStats(ENEMIES, 4, 3, run.depth).hp
  const res = resolveTrial(io(run, t.answer))!
  assert.ok(res.correct); assert.equal(res.hit, Math.min(run.enemyHp - 1, Math.round(hp * 0.3))); assert.equal(res.run.hearts, run.hearts); assert.equal(res.run.calm, 1)
  assert.equal(resolveTrial(io({ ...run, enemyHp: 2 }, t.answer))!.run.enemyHp, 1)
  const miss = resolveTrial(io({ ...run, secondLeft: 0 }, optionKeys(t).find(o => o !== t.answer)!))!
  assert.equal(miss.run.hearts, run.hearts - 1); assert.equal(miss.run.enemyHp, run.enemyHp)
})

/** The floor-5 Cavern Warden fight with the given number of shield segments (2 tone wards on top of 2 ink seals). */
const warden = (segments: number, over: Partial<Run> = {}): Run => {
  const r = newRun(NO_BONUSES, GEAR, ENEMIES)
  return { ...r, floor: 5, kill: 3, phase: 'fighting', enemyHp: enemyStats(ENEMIES, 5, 3, r.depth).hp, shield: segments, ...over }
}
const everyWord: Mastery = Object.fromEntries(WORDS.map(w => [w.id, { lv: 1, ok: 0 }]))

test('the Warden offers its gauntlet right after the first ward breaks: a tone step, then a note step', () => {
  const max = shieldFor(5, 'warden')
  assert.equal(offerTrial(warden(max), everyWord, ENEMIES).trial, undefined)
  assert.equal(offerTrial(warden(max - 2), everyWord, ENEMIES).trial, undefined)
  const t = offerTrial(warden(max - 1), everyWord, ENEMIES, () => 0.3).trial!
  assert.equal(t.step, 1); assert.equal(trialFor(t)!.boss, 'golem'); assert.equal(trialFor(t.next)!.boss, 'scribe')
  // Only single-character words known: no note can be built, so the gauntlet is the tone step alone.
  const singles: Mastery = Object.fromEntries(WORDS.filter(w => [...w.hanzi].length === 1 && TRIALS.every(x => x.boss !== 'scribe' || !x.requires.includes(w.id))).map(w => [w.id, { lv: 1, ok: 0 }]))
  const lone = offerTrial(warden(max - 1), singles, ENEMIES, () => 0.3).trial
  assert.ok(lone && !lone.next)
})

test('gauntlet: right tones break the last ward, the note follows, a right character breaks every seal, then it ends', () => {
  let run = offerTrial(warden(shieldFor(5, 'warden') - 1), everyWord, ENEMIES, () => 0.3)
  const tone = trialFor(run.trial)!
  let res = resolveTrial(io(run, tone.answer))!
  assert.ok(res.correct); assert.equal(res.run.shield, WARDEN_SEALS); assert.equal(res.run.enemyHp, run.enemyHp)
  run = closeTrial(res.run)
  assert.equal(run.trial?.status, 'pending'); assert.equal(run.trial?.step, 2)
  const note = trialFor(run.trial)!
  assert.equal(note.boss, 'scribe')
  res = resolveTrial(io(run, note.answer))!
  assert.equal(res.run.shield, 0)
  run = closeTrial(res.run)
  assert.equal(run.trial?.status, 'done'); assert.equal(closeTrial(run), run)
  assert.equal(offerTrial(run, everyWord, ENEMIES), run)
})

test('gauntlet: a wrong step is an ordinary wrong answer and the next step still follows; defeat ends it', () => {
  const run = offerTrial(warden(shieldFor(5, 'warden') - 1), everyWord, ENEMIES, () => 0.3), tone = trialFor(run.trial)!
  const wrong = optionKeys(tone).find(o => o !== tone.answer)!
  const miss = resolveTrial(io({ ...run, secondLeft: 0 }, wrong))!
  assert.equal(miss.run.hearts, run.hearts - 1); assert.equal(miss.run.shield, run.shield)
  const after = closeTrial(miss.run)
  assert.equal(after.trial?.step, 2)
  assert.equal(resolveTrial(io(after, trialFor(after.trial)!.answer))!.run.shield, 0)
  const dead = resolveTrial(io({ ...run, hearts: 1, secondLeft: 0 }, wrong))!
  assert.equal(dead.outcome, 'defeat'); assert.equal(closeTrial(dead.run).trial?.status, 'done')
})

test('gauntlet survives a reload at every step; a broken next step is dropped', () => {
  const run = offerTrial(warden(shieldFor(5, 'warden') - 1), everyWord, ENEMIES, () => 0.3)
  const s = sanitizeSave(null); s.mastery = everyWord
  for (const r of [run, resolveTrial(io(run, trialFor(run.trial)!.answer))!.run, closeTrial(resolveTrial(io(run, trialFor(run.trial)!.answer))!.run)]) {
    s.run = r
    assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(s))).run!.trial, r.trial)
  }
  assert.equal(cleanTrial({ ...run.trial, next: { id: 'nope', order: [] } })!.next, undefined)
  assert.equal(cleanTrial({ ...run.trial, next: { ...run.trial!.next!, order: ['x'] } })!.next, undefined)
})
