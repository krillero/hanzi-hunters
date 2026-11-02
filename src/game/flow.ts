// When does the game keep going by itself after an answer? Pure; see tests/flow.test.ts.
export type AutoContinue = 'learning' | 'quick' | 'relaxed' | 'off'
export type AutoPlan = { mode: 'question' | 'enemy'; delay: number } | null

export const AUTO_DELAYS: Record<Exclude<AutoContinue, 'off' | 'learning'>, { question: number; enemy: number }> = {
  quick: { question: 500, enemy: 500 },
  relaxed: { question: 2500, enemy: 3000 }
}

export const AUTO_MASTERY_LEVEL = 2
/** Long enough to read the revealed answer of a Familiar word before the game moves on (0.5 s hid it too quickly). */
export const LEARNING_AUTO_DELAY = 1000

/**
 * The default learning mode pauses after every answer until the current word reaches level 2.
 * Once it does, correct answers auto-advance quickly. Quick and Relaxed keep their existing timings.
 * The game always pauses for wrong answers, defeat, and clearing a floor (the boss).
 */
export function autoContinuePlan(a: {
  isCorrect: boolean
  outcome: 'continue' | 'victory' | 'defeat'
  floorCleared: boolean
  setting: AutoContinue
  masteryLevel: number
}): AutoPlan {
  if (a.setting === 'off' || !a.isCorrect || a.outcome === 'defeat') return null
  if (a.setting === 'learning' && a.masteryLevel < AUTO_MASTERY_LEVEL) return null
  if (a.outcome === 'victory') {
    if (a.floorCleared) return null
    return { mode: 'enemy', delay: a.setting === 'learning' ? LEARNING_AUTO_DELAY : AUTO_DELAYS[a.setting].enemy }
  }
  return { mode: 'question', delay: a.setting === 'learning' ? LEARNING_AUTO_DELAY : AUTO_DELAYS[a.setting].question }
}
