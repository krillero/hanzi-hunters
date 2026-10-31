// Per-floor / per-run learning summary shown on the floor-clear and defeat cards. Pure; lives in React state (not saved).
import { MAX_LV } from './mastery.ts'

export type RunStats = {
  correct: number; total: number; bestStreak: number; gold: number
  newWords: string[]; leveled: string[]; mastered: string[]; missed: string[]
}
export const emptyStats = (): RunStats => ({ correct: 0, total: 0, bestStreak: 0, gold: 0, newWords: [], leveled: [], mastered: [], missed: [] })

const add = (list: string[], h: string) => (list.includes(h) ? list : [...list, h])

export type AnswerRecord = { hanzi: string; isCorrect: boolean; streakAfter: number; levelBefore: number; levelAfter: number; gold: number }

/** `levelBefore` is -1 for a word met for the first time (same convention as the mastery note in App). */
export function recordAnswer(s: RunStats, a: AnswerRecord): RunStats {
  const promoted = a.levelBefore >= 0 && a.levelAfter > a.levelBefore
  return {
    correct: s.correct + (a.isCorrect ? 1 : 0), total: s.total + 1, bestStreak: Math.max(s.bestStreak, a.streakAfter), gold: s.gold + a.gold,
    newWords: a.levelBefore < 0 ? add(s.newWords, a.hanzi) : s.newWords,
    leveled: promoted ? add(s.leveled, a.hanzi) : s.leveled,
    mastered: promoted && a.levelAfter >= MAX_LV && a.levelBefore < MAX_LV ? add(s.mastered, a.hanzi) : s.mastered,
    missed: a.isCorrect ? s.missed : add(s.missed, a.hanzi)
  }
}

export const accuracyPct = (s: RunStats) => (s.total === 0 ? 0 : Math.round((s.correct / s.total) * 100))
