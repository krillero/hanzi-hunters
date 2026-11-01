// Hearts: saved hearts and protected practice, and that every boss stays beatable with real vocabulary.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVE_CURRICULUM, ENEMIES, GEAR, WORDS } from '../src/data.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { NO_BONUSES, computeBonuses } from '../src/game/upgrades.ts'
import { ENEMIES_PER_FLOOR, EXPEDITION_FLOORS, bossIdFor, sealAsk, newRun, playerStats, resolveAnswer, startFight } from '../src/game/rules.ts'
import { CHARACTER_KINDS, TONE_KINDS, isCharacterQuestion, isToneQuestion, pickSealCard, tryBuildQuestion } from '../src/game/questions.ts'
import { selectReview } from '../src/game/course.ts'
import type { Mastery } from '../src/game/types.ts'

const last = ENEMIES_PER_FLOOR - 1

test('a saved run keeps hearts, recovered floor and charges exactly; 0 hearts means the run is over', () => {
  const b = computeBonuses(['S1', 'S2', 'S3'])
  const run = { ...newRun(b, GEAR, ENEMIES), hearts: 2, recoveredFloor: 0, secondLeft: 0 }
  const s = sanitizeSave({ version: 1, meta: { gold: 0, upgrades: ['S1', 'S2', 'S3'], bestFloor: 1, runs: 0 }, run })
  assert.deepEqual([s.run!.hearts, s.run!.recoveredFloor, s.run!.secondLeft], [2, 0, 0])
  const over = sanitizeSave({ version: 1, meta: {}, run: { ...run, hearts: 0 } })
  assert.equal(over.run!.phase, 'defeat', 'no hearts: shown as a defeat (its gold is still banked)')
  assert.equal(sanitizeSave({ version: 1, meta: {}, run: { ...run, hearts: 99 } }).run!.hearts, 5, 'clamped to the maximum')
})

test('protected practice is persisted per entry and never reset by reloads, dying or a new run', () => {
  const fresh = sanitizeSave({ version: 1, mastery: { 你好: { lv: 0, ok: 1 } }, practiced: [] })
  assert.deepEqual(fresh.practiced, [], 'a newly introduced entry is still protected (not in the list)')
  const used = sanitizeSave({ ...fresh, practiced: ['你好'], run: null })
  assert.deepEqual(used.practiced, ['你好'])
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(used))).practiced, ['你好'], 'survives a reload')
  assert.deepEqual(sanitizeSave({ ...used, run: null, lastRun: { floor: 2, kills: 3, level: 2, goldBanked: 5 } }).practiced, ['你好'], 'and a death')
  assert.deepEqual(sanitizeSave({ version: 1, practiced: ['你好', 7, '', 'x'.repeat(99)] }).practiced, ['你好'], 'junk is dropped')
  assert.deepEqual(sanitizeSave({ version: 1, practiced: ['gone-entry'] }).practiced, ['gone-entry'], 'ids of removed entries are kept (parked), never lost')
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
    const tone = sealAsk(boss, run.shield) === 'pinyin'
    const shieldKinds = tone ? TONE_KINDS : CHARACTER_KINDS
    const isSeal = tone ? isToneQuestion : isCharacterQuestion
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
    for (let floor = 1; floor <= EXPEDITION_FLOORS; floor++) {
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
  const w = fightBoss(EXPEDITION_FLOORS, mastery)
  assert.ok(w.won, 'the Warden too (wards and seals)'); assert.ok(w.fallbacks > 0)
  const noSeal = pickSealCard(() => ({ question: { ask: 'meaning' as const, kind: 'meaning' as const } }), q => q.ask === 'pinyin', 5)
  assert.equal(noSeal?.sealFallback, true)
  const seal = pickSealCard(() => ({ question: { ask: 'pinyin' as const, kind: 'pinyin' as const } }), q => q.ask === 'pinyin', 5)
  assert.equal(seal?.sealFallback, false)
  assert.equal(pickSealCard(() => null, () => true, 5), null, 'no fair question at all: null (the game shows its "no words" screen)')
})
