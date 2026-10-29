// When does the game keep going by itself after an answer? Pure; see tests/flow.test.ts.
export type AutoContinue = 'quick' | 'relaxed' | 'off'
export type AutoPlan = { mode: 'question' | 'enemy'; delay: number } | null

export const AUTO_DELAYS: Record<Exclude<AutoContinue, 'off'>, { question: number; enemy: number }> = {
  quick: { question: 1000, enemy: 1500 },
  relaxed: { question: 2500, enemy: 3000 }
}

/**
 * Right answers keep the flow going (next question, or next monster after a kill).
 * The game always pauses for: a wrong answer (that is where the explanation is), defeat, and clearing a floor (the elite).
 * Loot, level-ups and new words do NOT pause; they are shown in the scene and the counters instead.
 */
export function autoContinuePlan(a: { isCorrect: boolean; outcome: 'continue' | 'victory' | 'defeat'; eliteKill: boolean; setting: AutoContinue }): AutoPlan {
  if (a.setting === 'off' || !a.isCorrect || a.outcome === 'defeat') return null
  if (a.outcome === 'victory') return a.eliteKill ? null : { mode: 'enemy', delay: AUTO_DELAYS[a.setting].enemy }
  return { mode: 'question', delay: AUTO_DELAYS[a.setting].question }
}
