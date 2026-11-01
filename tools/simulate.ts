// Balance simulator for the hearts rules: node tools/simulate.ts [accuracy] [runs]   (needs Node 22.18+)
// Also: node tools/simulate.ts --report   compares new and upgraded players at several accuracies.
import { ACTIVE_CURRICULUM, ENEMIES, GEAR, WORDS } from '../src/data.ts'
import { TUNING, advance, bankRun, bossIdFor, drinkPotion, isBoss, newRun, playerStats, resolveAnswer } from '../src/game/rules.ts'
import { UPGRADES, buyUpgrade, computeBonuses, nodeState, upgradeCost } from '../src/game/upgrades.ts'
import { updateMastery } from '../src/game/mastery.ts'
import { emptyCourse, recordPeaks, selectIntroductions, selectReview, syncCourse, wordMap, type CourseProgress, type PeakLevels } from '../src/game/course.ts'
import type { Mastery, Meta } from '../src/game/types.ts'

/** A bot that keeps answering this long uses "Return to camp" (about 25-40 minutes of play). */
export const ANSWER_CAP = 500

export type RunLog = {
  run: number; floor: number; gold: number; mastered: number; upgrades: number
  /** Answers given in the run (its length). */
  answers: number
  /** How the run ended: out of hearts, or returned to camp at ANSWER_CAP. */
  end: 'defeat' | 'returned'
  heartsLost: number; practiceSaves: number; secondChanceSaves: number; heartsRestored: number; potionsUsed: number
  /** Hearts at the start of the run, hearts left at the end, and hearts each potion restored. */
  startHearts: number; endHearts: number; potionHearts: number
}

export type SimOptions = {
  /** Start with every upgrade bought (an "upgraded" player) instead of buying greedily after each run. */
  maxed?: boolean
}

export function simulate(accuracy: number, runsToPlay: number, seed = 1, opts: SimOptions = {}): RunLog[] {
  let s = seed
  const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  let meta: Meta = { gold: 0, upgrades: opts.maxed ? UPGRADES.map(u => u.id) : [], bestFloor: 1, runs: 0 }
  let mastery: Mastery = {}
  let course: CourseProgress = emptyCourse()
  let peak: PeakLevels = {}
  const practiced = new Set<string>()
  const byId = wordMap(WORDS)
  // Like the game: introduction cards (curriculum order) at the start of each fight, then questions about known entries only.
  // The intro question shows the meaning, so it is always answered right; the next question about the word is its protected practice.
  const introduce = () => {
    for (const id of selectIntroductions({ curriculum: ACTIVE_CURRICULUM, mastery, progress: course, words: byId, peak }).ids) mastery = updateMastery(mastery, id, true)
  }
  const pick = (cur: string | null) => selectReview(WORDS, mastery, { currentId: cur, rng })!
  const log: RunLog[] = []
  for (let n = 1; n <= runsToPlay; n++) {
    const b = computeBonuses(meta.upgrades)
    introduce()
    let run = newRun(b, GEAR, ENEMIES), word = pick(null), answers = 0
    const startHearts = run.hearts, potionHearts = playerStats(run, b, GEAR).potionHearts
    const stat = { heartsLost: 0, practiceSaves: 0, secondChanceSaves: 0, heartsRestored: 0, potionsUsed: 0 }
    while (run.phase !== 'defeat' && answers < ANSWER_CAP) {
      if (run.phase === 'victory') { run = advance(run, b, ENEMIES, GEAR); introduce(); continue }
      if (run.hearts <= 2) { const p = drinkPotion(run, b, GEAR); if (p) { run = p; stat.potionsUsed++ } }
      const entry = mastery[word.id]
      const practice = !practiced.has(word.id)
      // Accuracy rises a little as a word is learned; boss questions are a little harder:
      // tone questions (Golem shield), character questions (Scribe seals), look-alikes (Trickster).
      const boss = isBoss(run.floor, run.kill) ? bossIdFor(run.floor) : null
      const sealed = run.shield > 0
      const p = Math.min(0.98, accuracy + 0.04 * (entry?.lv ?? 0) - (sealed ? (boss === 'golem' ? 0.06 : 0.04) : boss === 'trickster' ? 0.08 : 0))
      const ok = rng() < p
      const r = resolveAnswer({ run, bonuses: b, enemies: ENEMIES, allGear: GEAR, lv: entry?.lv ?? 0, isCorrect: ok, practice, sealQuestion: sealed, roll: { drop: rng(), item: rng() } })
      practiced.add(word.id); answers++
      stat.heartsLost += r.heartsLost; stat.practiceSaves += r.practiceSaved ? 1 : 0; stat.secondChanceSaves += r.savedBySecondChance ? 1 : 0; stat.heartsRestored += r.heartsRestored
      run = r.run; mastery = updateMastery(mastery, word.id, ok); peak = recordPeaks(peak, mastery); course = syncCourse(ACTIVE_CURRICULUM, mastery, course, byId, peak); word = pick(word.id)
    }
    const returned = run.phase !== 'defeat'
    const banked = bankRun(meta, run, returned); meta = banked.meta
    // greedy: always buy the cheapest affordable node
    for (;;) {
      const next = UPGRADES.filter(u => nodeState(meta.upgrades, u) === 'available' && upgradeCost(u.tier) <= meta.gold).sort((a, c) => a.tier - c.tier)[0]
      if (!next) break
      meta = buyUpgrade(meta, next.id)!
    }
    log.push({ run: n, floor: run.floor, gold: banked.summary.goldBanked, mastered: Object.values(mastery).filter(e => e.lv >= 4).length, upgrades: meta.upgrades.length, answers, end: returned ? 'returned' : 'defeat', ...stat, startHearts, endHearts: run.hearts, potionHearts })
  }
  return log
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
export function summarize(log: RunLog[]) {
  return {
    floor: avg(log.map(l => l.floor)), answers: avg(log.map(l => l.answers)),
    returned: log.filter(l => l.end === 'returned').length / Math.max(1, log.length),
    heartsLost: avg(log.map(l => l.heartsLost)), restored: avg(log.map(l => l.heartsRestored)),
    saves: avg(log.map(l => l.practiceSaves + l.secondChanceSaves))
  }
}

/** Fresh player (greedy buying over 30 runs: first 5 and last 10 runs) and a fully upgraded player (10 runs), several seeds. */
export function report(accuracies = [0.6, 0.75, 0.85, 0.9, 0.95], seeds = [1, 2, 3]) {
  const rows: string[] = []
  const f = (x: number, d = 1) => x.toFixed(d).padStart(6)
  rows.push(`tuning ${JSON.stringify(TUNING)}`)
  rows.push('   acc | new: floor answers (first 5 runs) | late: floor answers returned | maxed: floor answers returned lost restored saves')
  for (const acc of accuracies) {
    const fresh = seeds.flatMap(sd => simulate(acc, 30, sd))
    const early = fresh.filter(l => l.run <= 5), late = fresh.filter(l => l.run > 20)
    const maxed = seeds.flatMap(sd => simulate(acc, 10, sd + 100, { maxed: true }))
    const e = summarize(early), la = summarize(late), m = summarize(maxed)
    rows.push(`  ${acc.toFixed(2)} | ${f(e.floor)} ${f(e.answers, 0)}                      | ${f(la.floor)} ${f(la.answers, 0)} ${f(la.returned * 100, 0)}% | ${f(m.floor)} ${f(m.answers, 0)} ${f(m.returned * 100, 0)}% ${f(m.heartsLost)} ${f(m.restored)} ${f(m.saves)}`)
  }
  return rows.join('\n')
}

if (process.argv[1]?.endsWith('simulate.ts')) {
  if (process.argv[2] === '--report') {
    for (const arg of process.argv.slice(3)) { const [k, v] = arg.split('='); if (k in TUNING) (TUNING as Record<string, number>)[k] = Number(v) }
    console.log(report())
  } else {
    const acc = Number(process.argv[2] ?? 0.7), runs = Number(process.argv[3] ?? 40)
    const log = simulate(acc, runs)
    console.log(`accuracy ${acc}: run floor answers end gold upgrades mastered heartsLost restored`)
    for (const l of log.filter(l => l.run <= 10 || l.run % 5 === 0)) console.log([l.run, l.floor, l.answers, l.end, l.gold, l.upgrades, l.mastered, l.heartsLost, l.heartsRestored].map(String).map(x => x.padStart(8)).join(''))
  }
}
