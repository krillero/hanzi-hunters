// Hearts: save migration, protected practice, export/import, and that every boss stays beatable with real vocabulary.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVE_CURRICULUM, ENEMIES, GEAR, WORDS } from '../src/data.ts'
import { LEGACY_HP, SAVE_KEY, legacyMaxHp, loadSave, sanitizeSave } from '../src/game/save.ts'
import { parseBackup, serializeBackup } from '../src/game/backup.ts'
import { NO_BONUSES, computeBonuses } from '../src/game/upgrades.ts'
import { BOSS_ORDER, ENEMIES_PER_FLOOR, bossIdFor, newRun, playerStats, resolveAnswer, startFight } from '../src/game/rules.ts'
import { CHARACTER_KINDS, TONE_KINDS, isCharacterQuestion, isToneQuestion, pickSealCard, tryBuildQuestion } from '../src/game/questions.ts'
import { selectReview } from '../src/game/course.ts'
import type { Mastery } from '../src/game/types.ts'

const last = ENEMIES_PER_FLOOR - 1
/** A run object exactly as save v4 stored it (player HP, no hearts / recoveredFloor / practiced). */
const v4Run = (over: Record<string, unknown> = {}) => ({
  floor: 3, kill: 1, kills: 9, level: 4, xp: 12, pendingXp: 7, hp: 20, enemyHp: 25, gold: 41, potions: 1, gear: ['Copper Blade', 'Mossy Vest'],
  loadout: { Weapon: 'Copper Blade', Armor: 'Mossy Vest' }, streak: 2, hintsLeft: 0, secondLeft: 1, shield: 0, phase: 'fighting',
  reward: { xp: 0, gold: 0, loot: '', levelUps: 0 }, ...over
})
const v4Save = (run: unknown, extra: Record<string, unknown> = {}) => ({
  version: 4, meta: { gold: 300, upgrades: ['G1', 'S1', 'S2', 'S3'], bestFloor: 6, runs: 11 },
  mastery: { 你好: { lv: 3, ok: 1 }, 谢谢: { lv: 1, ok: 0 }, 我: { lv: 4, ok: 0 } }, legacyMastery: { 旧: { lv: 2, ok: 0 } },
  run, lastRun: { floor: 5, kills: 18, level: 6, goldBanked: 90 },
  habit: { daysPlayed: 4, correct: 120, badges: ['known-10'], bossesMet: ['golem'], tipsSeen: ['我'] },
  courses: { [ACTIVE_CURRICULUM.id]: { version: 1, completed: [ACTIVE_CURRICULUM.units[0].lessons[0].id] } },
  peak: { 你好: 3, 谢谢: 2, 我: 4 }, ...extra
})

test('migration v4 -> v5: an active run keeps its health share as hearts (old max HP, rounded up), and every kind of progress', () => {
  const raw = v4Save(v4Run())
  const s = sanitizeSave(raw)
  assert.equal(s.version, 5)
  // old max HP: 30 + 5*3 (level 4) + 8 (Tough Skin) + 8 (Mossy Vest) = 61; new max hearts: 5 + 1 (Tough Skin) + 1 (Mossy Vest) = 7
  assert.equal(legacyMaxHp(4, ['G1', 'S1', 'S2', 'S3'], { Weapon: 'Copper Blade', Armor: 'Mossy Vest' }), 61)
  assert.equal(playerStats(s.run!, computeBonuses(s.meta.upgrades), GEAR).maxHearts, 7)
  assert.equal(s.run!.hearts, Math.ceil(20 / 61 * 7))   // 3
  assert.deepEqual([s.run!.floor, s.run!.kill, s.run!.enemyHp, s.run!.xp, s.run!.pendingXp, s.run!.gold, s.run!.kills, s.run!.streak, s.run!.potions], [3, 1, 25, 12, 7, 41, 9, 2, 1])
  assert.deepEqual(s.run!.gear, ['Copper Blade', 'Mossy Vest'], 'inventory identities resolve unchanged')
  assert.equal(s.run!.secondLeft, 1, 'charges are kept (clamped), never refilled by the migration')
  assert.equal(s.run!.recoveredFloor, 2, 'the current floor can still be cleared for its recovery')
  // progress that must survive
  assert.equal(s.meta.gold, 300); assert.deepEqual(s.meta.upgrades.sort(), ['G1', 'S1', 'S2', 'S3'])
  assert.equal(s.mastery['你好'].lv, 3); assert.equal(s.legacyMastery['旧'].lv, 2); assert.equal(s.peak['谢谢'], 2)
  assert.ok(s.courses[ACTIVE_CURRICULUM.id].completed.includes(ACTIVE_CURRICULUM.units[0].lessons[0].id))
  assert.equal(s.habit.correct, 120); assert.deepEqual(s.habit.badges, ['known-10'])
  assert.equal(s.lastRun?.returned, false)
  // conservative protection: every entry already met counts as practiced (no fresh protection for old words)
  assert.deepEqual([...s.practiced].sort(), ['你好', '我', '旧', '谢谢'].sort())
})

test('migration: health share edge cases (full, nearly dead, defeated, cap) and no floor recovery', () => {
  const up = { meta: { gold: 0, upgrades: [], bestFloor: 1, runs: 0 } }
  const conv = (over: Record<string, unknown>) => sanitizeSave({ ...v4Save(v4Run({ gear: [], loadout: {}, level: 1, ...over })), ...up }).run
  assert.equal(conv({ hp: 30 })!.hearts, 5, 'full HP -> full hearts')
  assert.equal(conv({ hp: 1 })!.hearts, 1, 'a living run keeps at least one heart')
  assert.equal(conv({ hp: 7 })!.hearts, 2, '7/30 of 5 = 1.17, rounded up')
  assert.equal(conv({ hp: 999 })!.hearts, 5, 'clamped')
  assert.equal(conv({ hp: 0, phase: 'defeat' })!.hearts, 0, 'a defeated run stays at 0')
  assert.equal(conv({ hp: 0 }), null, 'a "living" run with no HP was never valid (unchanged v4 behaviour)')
  const bossBeaten = conv({ hp: 10, kill: last, phase: 'victory', enemyHp: 0 })!
  assert.equal(bossBeaten.recoveredFloor, bossBeaten.floor, 'a boss beaten before the migration grants no recovery afterwards')
  assert.equal(bossBeaten.hearts, 2, 'and the migration itself restores nothing')
  assert.equal(LEGACY_HP.base, 30)
})

test('repeated loading and export/import round trips are stable (no refill, no fresh protection)', () => {
  const once = sanitizeSave(v4Save(v4Run({ secondLeft: 0 })))
  const twice = sanitizeSave(JSON.parse(JSON.stringify(once)))
  assert.deepEqual(twice, once, 'loading a v5 save again changes nothing')
  assert.equal(twice.run!.secondLeft, 0, 'charges are not refilled on reload')
  const thrice = sanitizeSave(JSON.parse(JSON.stringify(twice)))
  assert.deepEqual(thrice, once)
  // export / import
  assert.deepEqual(parseBackup(serializeBackup(once)), once)
  assert.deepEqual(parseBackup(JSON.stringify(v4Save(v4Run()))), sanitizeSave(v4Save(v4Run())), 'a v4 export still imports')
  const store = { getItem: (k: string) => (k === SAVE_KEY ? JSON.stringify(v4Save(v4Run())) : null) }
  assert.equal(loadSave(store).version, 5)
})

test('a v5 run keeps hearts, recovered floor and floor charges exactly; 0 hearts means the run is over', () => {
  const b = computeBonuses(['S1', 'S2', 'S3'])
  const run = { ...newRun(b, GEAR, ENEMIES), hearts: 2, recoveredFloor: 0, secondLeft: 0 }
  const s = sanitizeSave({ version: 5, meta: { gold: 0, upgrades: ['S1', 'S2', 'S3'], bestFloor: 1, runs: 0 }, run })
  assert.deepEqual([s.run!.hearts, s.run!.recoveredFloor, s.run!.secondLeft], [2, 0, 0])
  const over = sanitizeSave({ version: 5, meta: {}, run: { ...run, hearts: 0 } })
  assert.equal(over.run!.phase, 'defeat', 'no hearts: shown as a defeat (its gold is still banked)')
  assert.equal(sanitizeSave({ version: 5, meta: {}, run: { ...run, hearts: 99 } }).run!.hearts, 5, 'clamped to the maximum')
})

test('protected practice is persisted per entry and never reset by reloads, dying or a new run', () => {
  const fresh = sanitizeSave({ version: 5, mastery: { 你好: { lv: 0, ok: 1 } }, practiced: [] })
  assert.deepEqual(fresh.practiced, [], 'a newly introduced entry is still protected (not in the list)')
  const used = sanitizeSave({ ...fresh, practiced: ['你好'], run: null })
  assert.deepEqual(used.practiced, ['你好'])
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(used))).practiced, ['你好'], 'survives a reload')
  assert.deepEqual(sanitizeSave({ ...used, run: null, lastRun: { floor: 2, kills: 3, level: 2, goldBanked: 5 } }).practiced, ['你好'], 'and a death')
  assert.deepEqual(sanitizeSave({ version: 5, practiced: ['你好', 7, '', 'x'.repeat(99)] }).practiced, ['你好'], 'junk is dropped')
  assert.deepEqual(sanitizeSave({ version: 5, practiced: ['gone-entry'] }).practiced, ['gone-entry'], 'ids of removed entries are kept (parked), never lost')
})

// ---- bosses stay beatable --------------------------------------------------------------------

/** Play one boss fight like the game: seal questions while the shield is up (with the safe fallback), all answers correct. */
function fightBoss(floor: number, mastery: Mastery) {
  const b = { ...NO_BONUSES }
  let run = startFight({ ...newRun(b, GEAR, ENEMIES), floor, kill: last, level: 1 }, b, ENEMIES, GEAR)
  const boss = bossIdFor(floor)
  let rng = 7
  const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648)
  let answers = 0, fallbacks = 0
  while (run.phase === 'fighting' && answers < 300) {
    const shieldKinds = boss === 'golem' ? TONE_KINDS : CHARACTER_KINDS
    const isSeal = boss === 'golem' ? isToneQuestion : isCharacterQuestion
    const build = () => {
      const word = selectReview(WORDS, mastery, { rng: rand }); if (!word) return null
      const question = tryBuildQuestion(word, mastery[word.id], WORDS, { canListen: false, rng: rand, kind: run.shield > 0 ? shieldKinds[Math.floor(rand() * shieldKinds.length)] : undefined })
      return question ? { word, question } : null
    }
    const card = run.shield > 0 ? pickSealCard(build, isSeal) : build()
    assert.ok(card, `floor ${floor}: some fair question can always be asked`)
    const fallback = 'sealFallback' in card! && card!.sealFallback === true
    if (fallback) fallbacks++
    run = resolveAnswer({ run, bonuses: b, enemies: ENEMIES, allGear: GEAR, lv: mastery[card!.word.id].lv, isCorrect: true, sealQuestion: fallback || isSeal(card!.question), roll: { drop: 0.99, item: 0 } }).run
    answers++
  }
  return { won: run.phase === 'victory', answers, fallbacks }
}

test('every boss is beatable with the vocabulary of the first lesson, of the first 10 entries, and of the whole course', () => {
  const ids = ACTIVE_CURRICULUM.units.flatMap(u => u.lessons.flatMap(l => l.introductions.map(i => i.entryId)))
  const sets: [string, string[]][] = [['lesson 1', ids.slice(0, 5)], ['first 10', ids.slice(0, 10)], ['course', ids]]
  for (const [name, set] of sets) {
    const mastery: Mastery = Object.fromEntries(set.map(id => [id, { lv: 1, ok: 0 }]))
    for (let floor = 1; floor <= BOSS_ORDER.length; floor++) {
      const r = fightBoss(floor, mastery)
      assert.ok(r.won, `${name}: the ${bossIdFor(floor)} on floor ${floor} was not beaten in ${r.answers} correct answers`)
    }
  }
})

test('shield fallback: when no seal question can be built, a correct answer still breaks a segment', () => {
  // only particles known: they are never asked pinyin or character questions, so the Golem's shield needs the fallback
  const mastery: Mastery = Object.fromEntries(WORDS.filter(w => w.kind === 'particle').map(w => [w.id, { lv: 1, ok: 0 }]))
  const r = fightBoss(1, mastery)
  assert.ok(r.won, 'the Golem is beaten'); assert.ok(r.fallbacks > 0, 'via the fallback')
  const noSeal = pickSealCard(() => ({ question: { ask: 'meaning' as const, kind: 'meaning' as const } }), q => q.ask === 'pinyin', 5)
  assert.equal(noSeal?.sealFallback, true)
  const seal = pickSealCard(() => ({ question: { ask: 'pinyin' as const, kind: 'pinyin' as const } }), q => q.ask === 'pinyin', 5)
  assert.equal(seal?.sealFallback, false)
  assert.equal(pickSealCard(() => null, () => true, 5), null, 'no fair question at all: null (the game shows its "no words" screen)')
})
