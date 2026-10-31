// Balance simulator: node tools/simulate.ts [accuracy]   (needs Node 22.18+)
import { ACTIVE_CURRICULUM, ENEMIES, GEAR, WORDS } from '../src/data.ts'
import { advance, bankRun, bossIdFor, drinkPotion, isBoss, newRun, playerStats, resolveAnswer } from '../src/game/rules.ts'
import { UPGRADES, buyUpgrade, computeBonuses, nodeState, upgradeCost } from '../src/game/upgrades.ts'
import { buildQuestion } from '../src/game/questions.ts'
import { updateMastery } from '../src/game/mastery.ts'
import { emptyCourse, selectIntroductions, selectReview, syncCourse, wordMap, type CourseProgress } from '../src/game/course.ts'
import type { Mastery, Meta } from '../src/game/types.ts'

export function simulate(accuracy: number, runsToPlay: number, seed = 1) {
  let s = seed
  const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  let meta: Meta = { gold: 0, upgrades: [], bestFloor: 1, runs: 0 }
  let mastery: Mastery = {}
  let course: CourseProgress = emptyCourse()
  const byId = wordMap(WORDS)
  // Like the game: introduction cards (curriculum order) at the start of each fight, then questions about known entries only.
  const introduce = () => {
    for (const id of selectIntroductions({ curriculum: ACTIVE_CURRICULUM, mastery, progress: course, words: byId }).ids) mastery = updateMastery(mastery, id, true)
  }
  const pick = (cur: string | null) => selectReview(WORDS, mastery, { currentId: cur, rng })!
  const log: { run: number; floor: number; gold: number; mastered: number; upgrades: number }[] = []
  for (let n = 1; n <= runsToPlay; n++) {
    const b = computeBonuses(meta.upgrades)
    introduce()
    let run = newRun(b, GEAR, ENEMIES), word = pick(null), guard = 0
    while (run.phase !== 'defeat' && guard++ < 5000) {
      if (run.phase === 'victory') { run = advance(run, b, ENEMIES); introduce(); continue }
      const max = playerStats(run, b, GEAR).maxHp
      if (run.hp < max * 0.4) { const p = drinkPotion(run, b, GEAR); if (p) run = p }
      const entry = mastery[word.id]
      const q = buildQuestion(word, entry, WORDS, { canListen: true, rng })
      // accuracy: intro is open-book; harder levels are a little easier as the word is learned
      // Boss questions are a little harder than average: tone questions (Golem shield), character questions (Scribe seals), look-alikes (Trickster)
      const boss = isBoss(run.floor, run.kill) ? bossIdFor(run.floor) : null
      const sealed = run.shield > 0
      const p = !entry ? 1 : Math.min(0.98, accuracy + 0.04 * entry.lv - (sealed ? (boss === 'golem' ? 0.06 : 0.04) : boss === 'trickster' ? 0.08 : 0))
      const ok = rng() < p
      const r = resolveAnswer({ run, bonuses: b, enemies: ENEMIES, allGear: GEAR, lv: entry?.lv ?? 0, isCorrect: ok, sealQuestion: sealed, roll: { drop: rng(), item: rng() } })
      run = r.run; mastery = updateMastery(mastery, word.id, ok); course = syncCourse(ACTIVE_CURRICULUM, mastery, course, byId); word = pick(word.id)
      void q
    }
    const banked = bankRun(meta, run); meta = banked.meta
    // greedy: always buy the cheapest affordable node
    for (;;) {
      const next = UPGRADES.filter(u => nodeState(meta.upgrades, u) === 'available' && upgradeCost(u.tier) <= meta.gold).sort((a, c) => a.tier - c.tier)[0]
      if (!next) break
      meta = buyUpgrade(meta, next.id)!
    }
    log.push({ run: n, floor: run.floor, gold: banked.summary.goldBanked, mastered: Object.values(mastery).filter(e => e.lv >= 4).length, upgrades: meta.upgrades.length })
  }
  return log
}

if (process.argv[1]?.endsWith('simulate.ts')) {
  const acc = Number(process.argv[2] ?? 0.7)
  const log = simulate(acc, 40)
  console.log(`accuracy ${acc}: run floor gold upgrades mastered`)
  for (const l of log.filter(l => l.run <= 10 || l.run % 5 === 0)) console.log(String(l.run).padStart(3), String(l.floor).padStart(5), String(l.gold).padStart(5), String(l.upgrades).padStart(8), String(l.mastered).padStart(8))
}
