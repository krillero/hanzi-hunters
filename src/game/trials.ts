// Boss trials: a one-question challenge inside a boss fight (see docs/CONTEXTUAL_ENCOUNTERS.md "Boss trials").
// The Golem's Tone Trial is offered once per Golem fight, right after its first shield segment breaks: the Golem carves a line
// of words the player has met and the player picks the correct tone-marked pinyin. Right: the shield shatters and the Golem
// takes a heavy hit that never kills it. Wrong: an ordinary wrong answer (resolveAnswer decides hearts / second chance / defeat).
// Skipping is free. The trial never changes mastery. Pure functions; the content is src/content/trials.json.
import trialsJson from '../content/trials.json' with { type: 'json' }
import { WORDS } from '../data.ts'
import { TUNING, bossIdFor, enemyStats, isBoss, resolveAnswer, shieldFor, type AnswerInput } from './rules.ts'
import type { Mastery, Run } from './types.ts'

export type Trial = { id: string; boss: 'golem'; requires: string[]; zh: string; en: string; options: string[]; answer: string; note: string }
/** The trial of the current fight, saved in the run: the same line survives a reload and is answered at most once. */
export type TrialState = { id: string; floor: number; order: string[]; status: 'pending' | 'answered' | 'done'; chosen?: string }

const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''
const HANZI = /\p{Script=Han}/u
const MARK = /\p{M}/u
const TONE_MARKS = /[̀́̄̌]/u
/** Base letters and, per letter, its tone mark (if any): 'nǐ' -> ['n','i'] and [undefined,'̌']. */
function letters(pinyin: string) {
  const base: string[] = [], marks: (string | undefined)[] = []
  for (const ch of pinyin.normalize('NFD')) {
    if (MARK.test(ch)) { if (TONE_MARKS.test(ch)) marks[base.length - 1] = ch; else base[base.length - 1] += ch }   // ü keeps its diaeresis
    else { base.push(ch.toLowerCase()); marks.push(undefined) }
  }
  return { base: base.join(''), marks }
}

/** Structural problems of trials.json (empty = fine). Used by validate:content, the tests, and to drop broken trials. */
export function validateTrials(raw: unknown, wordIds: string[]): string[] {
  const list = (raw as { trials?: unknown })?.trials
  if (!Array.isArray(list)) return ['trials.json: "trials" must be an array']
  const errors: string[] = [], seen = new Set<string>()
  list.forEach((t, i) => {
    const where = `trials.json ${isStr(t?.id) ? t.id : `#${i + 1}`}`
    for (const e of trialErrors(t, wordIds)) errors.push(`${where}: ${e}`)
    if (isStr(t?.id)) { if (seen.has(t.id)) errors.push(`${where}: duplicate id`); seen.add(t.id) }
  })
  return errors
}

function trialErrors(t: Trial, wordIds: string[]): string[] {
  const out: string[] = []
  if (!t || typeof t !== 'object') return ['must be an object']
  if (!isStr(t.id) || !/^[a-z][a-z0-9-]*$/.test(t.id)) out.push('id must be lower-case letters, digits or dashes')
  if (t.boss !== 'golem') out.push('boss must be "golem" (the only boss with a trial so far)')
  for (const f of ['zh', 'en', 'answer', 'note'] as const) if (!isStr(t[f])) out.push(`${f} is required`)
  const requires = Array.isArray(t.requires) ? t.requires : []
  if (!requires.length) out.push('requires must list the words the line uses')
  for (const id of requires) if (!wordIds.includes(id)) out.push(`requires "${id}", which is not in words.json`)
  const known = new Set(requires.join(''))
  for (const ch of t.zh ?? '') if (HANZI.test(ch) && !known.has(ch)) out.push(`"${ch}" appears in zh but no required word contains it`)
  const options = Array.isArray(t.options) ? t.options : []
  if (options.length < 3 || options.length > 4 || new Set(options).size !== options.length || !options.every(isStr)) out.push('needs 3-4 distinct options')
  if (!options.includes(t.answer)) out.push('answer must be one of the options')
  // A tone trial: every option is the answer with different tone marks only, and never turns a written third tone into a
  // second tone (that is what tone sandhi does in speech, so such a distractor would also be "right").
  const a = letters(t.answer ?? '')
  for (const o of options.filter(o => o !== t.answer)) {
    const l = letters(o)
    if (l.base !== a.base) { out.push(`option "${o}" must differ from the answer only in tone marks`); continue }
    if (l.marks.some((m, k) => a.marks[k] === '̌' && m === '́')) out.push(`option "${o}" turns a third tone into a second tone (tone sandhi makes that ambiguous)`)
  }
  return out
}

export const TRIALS: Trial[] = ((trialsJson as { trials?: Trial[] }).trials ?? []).filter(t => trialErrors(t, WORDS.map(w => w.id)).length === 0)
export const trialById = (id: string | undefined) => TRIALS.find(t => t.id === id)

const golemFight = (run: Run) => isBoss(run.floor, run.kill) && bossIdFor(run.floor) === 'golem'

/**
 * After an answer: offer the Golem's trial when its first shield segment has just broken (once per fight, only with a line
 * whose words the player has met). Returns the run unchanged otherwise.
 */
export function offerTrial(run: Run, mastery: Mastery, rng = Math.random): Run {
  if (!TUNING.golemTrial || !golemFight(run) || run.phase !== 'fighting' || run.trial?.floor === run.floor) return run
  if (run.shield <= 0 || run.shield !== shieldFor(run.floor, 'golem') - 1) return run
  const pool = TRIALS.filter(t => t.boss === 'golem' && t.requires.every(id => Object.prototype.hasOwnProperty.call(mastery, id)))
  if (!pool.length) return run
  const t = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
  const order = [...t.options]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [order[i], order[j]] = [order[j], order[i]] }
  return { ...run, trial: { id: t.id, floor: run.floor, order, status: 'pending' } }
}

export type TrialResult = { run: Run; correct: boolean; hit: number; heartsLost: number; savedBySecondChance: boolean; outcome: 'continue' | 'defeat' }

/** Answer the pending trial (one submission). Anything but a pending trial in a live fight is a no-op (returns null). */
export function resolveTrial(i: Omit<AnswerInput, 'lv' | 'isCorrect' | 'practice' | 'sealQuestion'> & { chosen: string }): TrialResult | null {
  const { run } = i, state = run.trial, trial = trialById(state?.id)
  if (!state || !trial || state.status !== 'pending' || run.phase !== 'fighting' || !trial.options.includes(i.chosen)) return null
  const answered: TrialState = { ...state, status: 'answered', chosen: i.chosen }
  if (i.chosen === trial.answer) {
    const foe = enemyStats(i.enemies, run.floor, run.kill, run.depth)
    const hit = Math.max(0, Math.min(run.enemyHp - 1, Math.round(foe.hp * TUNING.golemTrialHit)))
    return { run: { ...run, shield: 0, enemyHp: run.enemyHp - hit, streak: run.streak + 1, trial: answered }, correct: true, hit, heartsLost: 0, savedBySecondChance: false, outcome: 'continue' }
  }
  // A wrong trial answer is an ordinary wrong answer: same heart / second-chance / defeat rules, never a practice save.
  const r = resolveAnswer({ ...i, lv: 0, isCorrect: false, practice: false, sealQuestion: false })
  return { run: { ...r.run, trial: answered }, correct: false, hit: 0, heartsLost: r.heartsLost, savedBySecondChance: r.savedBySecondChance, outcome: r.outcome === 'defeat' ? 'defeat' : 'continue' }
}

/** Close the trial: after reading the result, or to skip it unanswered (no effect at all). */
export const closeTrial = (run: Run): Run => (run.trial ? { ...run, trial: { ...run.trial, status: 'done' } } : run)

export function cleanTrial(raw: unknown): TrialState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const t = raw as TrialState, trial = trialById(t.id)
  const floor = Number.isInteger(t.floor) && t.floor > 0 ? t.floor : 0
  if (!trial || !floor) return floor ? { id: String(t.id ?? ''), floor, order: [], status: 'done' } : undefined
  const order = Array.isArray(t.order) && t.order.length === trial.options.length && trial.options.every(o => t.order.includes(o)) ? t.order : [...trial.options]
  const status = t.status === 'pending' || t.status === 'answered' ? t.status : 'done'
  const chosen = status === 'answered' && trial.options.includes(t.chosen ?? '') ? t.chosen : undefined
  return { id: trial.id, floor, order, status: status === 'answered' && !chosen ? 'done' : status, ...(chosen ? { chosen } : {}) }
}
