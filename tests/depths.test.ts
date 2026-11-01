// Depths: unlocking, rewards, the harder question mix (only eligible kinds), and saves.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ENEMIES, GEAR, WORDS } from '../src/data.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { DEPTHS, ENEMIES_PER_FLOOR, EXPEDITION_FLOORS, MAX_DEPTH, bankRun, challengeFor, enemyStats, newRun, resolveAnswer, unlockedDepth, victoryBonus } from '../src/game/rules.ts'
import { KIND_WEIGHTS, RECALL_KINDS, chooseKind, type QKind } from '../src/game/questions.ts'
import { sanitizeSave } from '../src/game/save.ts'

const none = { ...NO_BONUSES }
const meta = { gold: 0, upgrades: [], bestFloor: 1, runs: 0, wins: 0, depthCleared: 0 }

test('winning unlocks the next depth (up to the last); cleared depths stay playable', () => {
  assert.equal(MAX_DEPTH, DEPTHS.length); assert.equal(MAX_DEPTH, 5)
  assert.equal(unlockedDepth(0), 1); assert.equal(unlockedDepth(2), 3); assert.equal(unlockedDepth(MAX_DEPTH), MAX_DEPTH)
  const won = bankRun(meta, { ...newRun(none, GEAR, ENEMIES, 1), floor: EXPEDITION_FLOORS, gold: 30 }, 'won')
  assert.equal(won.meta.depthCleared, 1); assert.equal(won.summary.unlocked, 2)
  assert.equal(won.summary.bonus, victoryBonus(1)); assert.equal(won.meta.gold, 30 + victoryBonus(1)); assert.equal(won.summary.goldBanked, 30 + victoryBonus(1))
  const replay = bankRun({ ...meta, depthCleared: 3 }, newRun(none, GEAR, ENEMIES, 2), 'won')
  assert.equal(replay.meta.depthCleared, 3, 'replaying a cleared depth never lowers progress'); assert.equal(replay.summary.unlocked, 0)
  const last = bankRun({ ...meta, depthCleared: 4 }, newRun(none, GEAR, ENEMIES, 5), 'won')
  assert.equal(last.meta.depthCleared, 5); assert.equal(last.summary.unlocked, 0, 'nothing beyond the last depth')
  const lost = bankRun(meta, newRun(none, GEAR, ENEMIES, 1), 'defeat')
  assert.equal(lost.meta.depthCleared, 0); assert.equal(lost.summary.bonus, 0)
  assert.equal(newRun(none, GEAR, ENEMIES, 99).depth, MAX_DEPTH)
})

test('deeper depths pay more and have tougher enemies; perfect play still wins every depth', () => {
  const last = ENEMIES_PER_FLOOR - 1
  assert.ok(enemyStats(ENEMIES, 2, 0, 3).gold > enemyStats(ENEMIES, 2, 0, 1).gold)
  assert.ok(enemyStats(ENEMIES, 5, last, 4).hp > enemyStats(ENEMIES, 5, last, 1).hp)
  assert.ok(victoryBonus(5) > victoryBonus(1))
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    let r = newRun(none, GEAR, ENEMIES, depth), answers = 0
    while (!(r.phase === 'victory' && r.floor === EXPEDITION_FLOORS && r.kill === last) && answers < 500) {
      if (r.phase === 'victory') { r = { ...r, kill: (r.kill + 1) % ENEMIES_PER_FLOOR, floor: r.kill + 1 >= ENEMIES_PER_FLOOR ? r.floor + 1 : r.floor, phase: 'fighting', enemyHp: enemyStats(ENEMIES, r.kill + 1 >= ENEMIES_PER_FLOOR ? r.floor + 1 : r.floor, (r.kill + 1) % ENEMIES_PER_FLOOR, depth).hp, shield: 0 }; continue }
      r = resolveAnswer({ run: r, bonuses: none, enemies: ENEMIES, allGear: GEAR, lv: 1, isCorrect: true, sealQuestion: true, roll: { drop: 0.99, item: 0 } }).run; answers++
    }
    assert.equal(r.phase, 'victory', `depth ${depth}`); assert.equal(r.hearts, 5)
  }
})

test('challenge rises with depth and floor, and only re-weights kinds the word is already eligible for', () => {
  assert.equal(challengeFor(1, 1), 0); assert.ok(challengeFor(1, 5) > 0); assert.ok(challengeFor(3, 1) >= challengeFor(2, 5)); assert.equal(challengeFor(MAX_DEPTH, EXPEDITION_FLOORS), 1)
  const w = WORDS.find(x => x.hanzi === '水')!
  const known = new Set(WORDS.map(x => x.id))
  const draw = (lv: number, challenge: number) => { const c: Record<string, number> = {}; for (let i = 0; i < 1500; i++) { const k = chooseKind(w, { lv, ok: 0 }, WORDS, { canListen: true, known, challenge }); c[k] = (c[k] ?? 0) + 1 } return c }
  for (const lv of [1, 2, 3]) {
    const easy = draw(lv, 0), hard = draw(lv, 1)
    for (const k of Object.keys(hard)) assert.ok(k in KIND_WEIGHTS[lv], `lv${lv}: ${k} is not in this level's table`)
    const share = (c: Record<string, number>) => RECALL_KINDS.reduce((n, k) => n + (c[k] ?? 0), 0) / 1500
    assert.ok(share(hard) > share(easy), `lv${lv}: more recall at full challenge (${share(easy)} -> ${share(hard)})`)
  }
  // the first step of a new word and particles ignore challenge
  for (let i = 0; i < 200; i++) assert.equal(chooseKind(w, { lv: 0, ok: 0 }, WORDS, { canListen: true, known, challenge: 1 }), 'meaning')
  const noAudio = draw(3, 1)
  assert.ok(Object.keys(noAudio).length > 0)
  for (let i = 0; i < 200; i++) assert.ok(!(chooseKind(w, { lv: 3, ok: 0 }, WORDS, { canListen: false, known, challenge: 1 }) as QKind).startsWith('listen'), 'no audio kinds without sound, even at full challenge')
})

test('saves keep depth progress and the expedition depth, clamped', () => {
  const s = sanitizeSave({ version: 1, meta: { ...meta, depthCleared: 3 }, run: { ...newRun(none, GEAR, ENEMIES, 4) }, lastRun: { floor: 5, kills: 20, level: 6, goldBanked: 90, bonus: 40, result: 'won', depth: 1, unlocked: 2 } })
  assert.equal(s.meta.depthCleared, 3); assert.equal(s.run?.depth, 4); assert.equal(s.lastRun?.unlocked, 2); assert.equal(s.lastRun?.bonus, 40)
  const wild = sanitizeSave({ version: 1, meta: { depthCleared: 99 }, run: { ...newRun(none, GEAR, ENEMIES), depth: -3 } })
  assert.equal(wild.meta.depthCleared, MAX_DEPTH); assert.equal(wild.run?.depth, 1)
  assert.equal(sanitizeSave({ version: 1, meta: {} }).meta.depthCleared, 0, 'missing: nothing cleared yet')
})
