// Balance simulator for expeditions: node tools/simulate.ts [accuracy] [expeditions]   (needs Node 22.18+)
// Also: node tools/simulate.ts --report   compares new and upgraded players at several accuracies.
import { ACTIVE_CURRICULUM, ENEMIES, GEAR, WORDS } from '../src/data.ts'
import { closeTrial, offerTrial, optionKeys, resolveTrial, trialById } from '../src/game/trials.ts'
import { MAX_DEPTH, TUNING, advance, bankRun, bossIdFor, challengeFor, drinkPotion, isBoss, isExpeditionWon, newRun, playerStats, resolveAnswer, sealAsk, unlockedDepth } from '../src/game/rules.ts'
import { UPGRADES, buyUpgrade, computeBonuses, nodeState, upgradeCost } from '../src/game/upgrades.ts'
import { updateMastery } from '../src/game/mastery.ts'
import { emptyCourse, recordPeaks, selectIntroductions, selectReview, syncCourse, wordMap, type CourseProgress, type PeakLevels } from '../src/game/course.ts'
import type { Mastery, Meta } from '../src/game/types.ts'

/** Safety stop only: an expedition is bounded (5 floors of bounded fights) and never gets near this. */
export const ANSWER_CAP = 1000

export type RunLog = {
  run: number; depth: number; floor: number; gold: number; mastered: number; upgrades: number
  /** Deepest depth cleared after this expedition. */
  depthCleared: number
  /** Answers given in the run (its length). */
  answers: number
  /** How the expedition ended: won (final boss beaten) or out of hearts ('returned' only at the safety stop). */
  end: 'won' | 'defeat' | 'returned'
  /** The most answers any single fight took in this expedition. */
  longestFight: number
  heartsLost: number; practiceSaves: number; secondChanceSaves: number; heartsRestored: number; potionsUsed: number
  /** Boss trials taken / answered right, and wrong answers saved by the calmed Wraith. */
  trials: number; trialsRight: number; calmSaves: number
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
  let meta: Meta = { gold: 0, upgrades: opts.maxed ? UPGRADES.map(u => u.id) : [], bestFloor: 1, runs: 0, wins: 0, depthCleared: 0 }
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
    // the bot always plays the deepest depth it has unlocked
    let run = newRun(b, GEAR, ENEMIES, unlockedDepth(meta.depthCleared)), word = pick(null), answers = 0
    const startHearts = run.hearts, potionHearts = playerStats(run, b, GEAR).potionHearts
    const stat = { heartsLost: 0, practiceSaves: 0, secondChanceSaves: 0, heartsRestored: 0, potionsUsed: 0, trials: 0, trialsRight: 0, calmSaves: 0 }
    let fightAnswers = 0, longestFight = 0
    while (run.phase !== 'defeat' && !isExpeditionWon(run) && answers < ANSWER_CAP) {
      if (run.phase === 'victory') { run = advance(run, b, ENEMIES, GEAR)!; introduce(); fightAnswers = 0; continue }
      if (run.hearts <= 2) { const p = drinkPotion(run, b, GEAR); if (p) { run = p; stat.potionsUsed++ } }
      const entry = mastery[word.id]
      const practice = !practiced.has(word.id)
      // Accuracy rises a little as a word is learned; boss questions are a little harder:
      // tone questions (Golem shield), character questions (Scribe seals), look-alikes (Trickster).
      const boss = isBoss(run.floor, run.kill) ? bossIdFor(run.floor) : null
      const sealed = run.shield > 0
      const harder = sealed ? (sealAsk(boss!, run.shield) === 'pinyin' ? 0.06 : 0.04) : boss === 'trickster' ? 0.08 : 0
      // Model assumption: a recall-heavy mix (deeper depths) is a little harder, up to -6 points at full challenge.
      const recall = entry && !(entry.lv === 0 && entry.ok === 0) ? 0.06 * challengeFor(run.depth, run.floor) : 0
      const p = accuracy >= 1 ? 1 : Math.min(0.98, accuracy + 0.04 * (entry?.lv ?? 0) - harder - recall)
      const ok = rng() < p
      const r = resolveAnswer({ run, bonuses: b, enemies: ENEMIES, allGear: GEAR, lv: entry?.lv ?? 0, isCorrect: ok, practice, sealQuestion: sealed, roll: { drop: rng(), item: rng() } })
      practiced.add(word.id); answers++; fightAnswers++; longestFight = Math.max(longestFight, fightAnswers)
      stat.heartsLost += r.heartsLost; stat.practiceSaves += r.practiceSaved ? 1 : 0; stat.secondChanceSaves += r.savedBySecondChance ? 1 : 0; stat.calmSaves += r.savedByCalm ? 1 : 0; stat.heartsRestored += r.heartsRestored
      run = r.run
      // Boss trials: the bot takes them with more than 2 hearts left. The Golem's is a tone question (as hard as its seal
      // questions), the Scribe's a character question (as hard as its seal questions); the Wraith's is a reply (plain accuracy).
      {
        run = offerTrial(run, mastery, ENEMIES, rng)
        const t = run.trial?.status === 'pending' ? trialById(run.trial.id) : undefined
        if (t && run.hearts <= 2) run = closeTrial(run)   // a careful player says "Not now" when a heart matters
        else if (t) {
          const right = rng() < (accuracy >= 1 ? 1 : Math.min(0.98, accuracy - (t.boss === 'golem' ? 0.06 : t.boss === 'scribe' ? 0.04 : 0)))
          const tr = resolveTrial({ run, bonuses: b, enemies: ENEMIES, allGear: GEAR, roll: { drop: rng(), item: rng() }, chosen: right ? t.answer : optionKeys(t).find(o => o !== t.answer)! })
          if (tr) { run = closeTrial(tr.run); answers++; stat.trials++; stat.trialsRight += tr.correct ? 1 : 0; stat.heartsLost += tr.heartsLost; stat.secondChanceSaves += tr.savedBySecondChance ? 1 : 0 }
        }
      }
      mastery = updateMastery(mastery, word.id, ok); peak = recordPeaks(peak, mastery); course = syncCourse(ACTIVE_CURRICULUM, mastery, course, byId, peak); word = pick(word.id)
    }
    const end: RunLog['end'] = isExpeditionWon(run) ? 'won' : run.phase === 'defeat' ? 'defeat' : 'returned'
    const banked = bankRun(meta, run, end); meta = banked.meta
    // greedy: always buy the cheapest affordable node
    for (;;) {
      const next = UPGRADES.filter(u => nodeState(meta.upgrades, u) === 'available' && upgradeCost(u.tier) <= meta.gold).sort((a, c) => a.tier - c.tier)[0]
      if (!next) break
      meta = buyUpgrade(meta, next.id)!
    }
    log.push({ run: n, depth: run.depth, depthCleared: meta.depthCleared, floor: run.floor, gold: banked.summary.goldBanked, mastered: Object.values(mastery).filter(e => e.lv >= 4).length, upgrades: meta.upgrades.length, answers, end, longestFight, ...stat, startHearts, endHearts: run.hearts, potionHearts })
  }
  return log
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const winRate = (log: RunLog[]) => log.filter(l => l.end === 'won').length / Math.max(1, log.length)
/** Expedition number of the first win (Infinity if none). */
export const firstWin = (log: RunLog[]) => { const i = log.findIndex(l => l.end === 'won'); return i === -1 ? Infinity : i + 1 }

/** Fresh players (greedy buying, 30 expeditions) and fully upgraded players, several seeds. */
export function report(accuracies = [0.6, 0.75, 0.85, 0.9, 1], seeds = [1, 2, 3, 4, 5]) {
  const rows: string[] = []
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'never').padStart(6)
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const clearedAt = (log: RunLog[], d: number) => { const i = log.findIndex(l => l.depthCleared >= d); return i === -1 ? Infinity : i + 1 }
  rows.push(`tuning ${JSON.stringify(TUNING)} · 40 expeditions per player, ${seeds.length} seeds; the bot plays the deepest unlocked depth`)
  rows.push('   acc | expeditions to clear depth 1 / 2 / 3 / 4 / 5 (median) | win% | answers avg max | longest fight | maxed: depth cleared after 10')
  for (const acc of accuracies) {
    const logs = seeds.map(sd => simulate(acc, 40, sd))
    const all = logs.flat()
    const cleared = Array.from({ length: MAX_DEPTH }, (_, d) => f(med(logs.map(l => clearedAt(l, d + 1))), 0)).join(' ')
    const maxed = seeds.map(sd => simulate(acc, 10, sd + 100, { maxed: true }))
    rows.push(`  ${acc.toFixed(2)} | ${cleared}             | ${f(winRate(all) * 100, 0)} | ${f(avg(all.map(l => l.answers)), 0)} ${f(Math.max(...all.map(l => l.answers)), 0)} | ${f(Math.max(...all.map(l => l.longestFight)), 0)}        | ${f(med(maxed.map(l => l[l.length - 1].depthCleared)), 0)}`)
  }
  return rows.join('\n')
}

if (process.argv[1]?.endsWith('simulate.ts')) {
  if (process.argv[2] === '--report') {
    for (const arg of process.argv.slice(3)) { const [k, v] = arg.split('='); if (k in TUNING) (TUNING as Record<string, number>)[k] = Number(v) }
    console.log(report())
  } else {
    const acc = Number(process.argv[2] ?? 0.7), runs = Number(process.argv[3] ?? 30)
    const log = simulate(acc, runs)
    console.log(`accuracy ${acc}: run floor answers end gold upgrades mastered heartsLost longestFight`)
    for (const l of log.filter(l => l.run <= 10 || l.run % 5 === 0)) console.log([l.run, l.floor, l.answers, l.end, l.gold, l.upgrades, l.mastered, l.heartsLost, l.longestFight].map(String).map(x => x.padStart(8)).join(''))
  }
}
