// Boss trials: a one-question challenge inside a boss fight (see docs/CONTEXTUAL_ENCOUNTERS.md "Boss trials").
// Golem's Tone Trial — offered right after its first shield segment breaks: the Golem carves a line of words the player has met
//   and the player picks the correct tone-marked pinyin. Right: the shield shatters and the Golem takes a heavy hit that never
//   kills it.
// Echo Wraith's Wail — offered once it drops below WRAITH_ECHO_AT of its HP (when its echo starts): the Wraith says a line and the
//   player picks the reply that answers it. Right: the Wraith is calmed and the next wrong answer this expedition costs no heart
//   (kept until used: the rest of the Wraith fight is often too short to need it).
// Ink Scribe's Torn Note — offered right after its first ink seal breaks: a note of known words with one character missing (the
//   English meaning is shown); the player picks the character that completes it. Right: every remaining seal breaks.
// Mirror Trickster's Mirrors — offered once it drops below TRICKSTER_LOW of its HP: a picture and three statements about it from its
//   mirror images; the player picks the true one. Right: a heavy blow (never the killing blow).
// Either way a wrong answer is an ordinary wrong answer (resolveAnswer decides hearts / second chance / defeat); skipping is free;
// mastery never changes; once per fight. Pure functions; the content is src/content/trials.json.
import trialsJson from '../content/trials.json' with { type: 'json' }
import { WORDS } from '../data.ts'
import { TRICKSTER_LOW, TUNING, WRAITH_ECHO_AT, bossIdFor, enemyStats, isBoss, resolveAnswer, shieldFor, type AnswerInput } from './rules.ts'
import type { Mastery, Run } from './types.ts'

type TrialBase = { id: string; requires: string[]; zh: string; en: string; answer: string; note: string }
/** Options are the same pinyin with different tone marks; `answer` is one of them. */
export type ToneTrial = TrialBase & { boss: 'golem'; options: string[] }
export type ReplyOption = { zh: string; py: string; en: string }
/** Options are short Chinese replies; `answer` is the `zh` of the one that answers the line. */
export type ReplyTrial = TrialBase & { boss: 'wraith'; py: string; options: ReplyOption[] }
/** `zh` has exactly one blank (＿); options are characters (or short words); `answer` is the one that completes the note. */
export type NoteTrial = TrialBase & { boss: 'scribe'; py: string; options: string[] }
/** `picture` (emoji) is what the statements describe; `en` describes it; options are statements, exactly one true. No `zh` line. */
export type TruthTrial = Omit<TrialBase, 'zh'> & { boss: 'trickster'; zh?: undefined; picture: string; options: ReplyOption[] }
export type Trial = ToneTrial | ReplyTrial | NoteTrial | TruthTrial
export const BLANK = '＿'
export type TrialBoss = Trial['boss']
const BOSSES: TrialBoss[] = ['golem', 'wraith', 'scribe', 'trickster']
/** The trial of the current fight, saved in the run: the same line survives a reload and is answered at most once. */
export type TrialState = { id: string; floor: number; order: string[]; status: 'pending' | 'answered' | 'done'; chosen?: string }

/** What identifies an option (and is stored in TrialState.order / chosen): the pinyin, or the reply's Chinese. */
export const optionKeys = (t: Trial): string[] => (t.boss === 'wraith' || t.boss === 'trickster' ? t.options.map(o => o.zh) : t.options)
/** The note with its blank filled in (scribe trials). */
export const filledNote = (t: NoteTrial, with_ = t.answer) => t.zh.replace(BLANK, with_)

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
  if (!BOSSES.includes(t.boss)) out.push(`boss must be one of ${BOSSES.join(', ')}`)
  for (const f of ['en', 'answer', 'note'] as const) if (!isStr(t[f])) out.push(`${f} is required`)
  if (t.boss === 'trickster') { if (!isStr(t.picture)) out.push('picture is required') }
  else if (!isStr(t.zh)) out.push('zh is required')
  const requires = Array.isArray(t.requires) ? t.requires : []
  if (!requires.length) out.push('requires must list the words the trial uses')
  for (const id of requires) if (!wordIds.includes(id)) out.push(`requires "${id}", which is not in words.json`)
  // No untaught vocabulary: every character shown (the line and, for replies, every option) belongs to a required word.
  const known = new Set(requires.join(''))
  const shown = [t.zh ?? '', ...((t.boss === 'wraith' || t.boss === 'trickster') && Array.isArray(t.options) ? (t.options as ReplyOption[]).map(o => o?.zh ?? '') : []), ...(t.boss === 'scribe' && Array.isArray(t.options) ? t.options : [])].join('')
  for (const ch of new Set(shown)) if (HANZI.test(ch) && !known.has(ch)) out.push(`"${ch}" is shown but no required word contains it`)
  const options = Array.isArray(t.options) ? t.options : []
  const keys = BOSSES.includes(t.boss) ? optionKeys({ ...t, options } as Trial) : []
  if (options.length < 3 || options.length > 4 || new Set(keys).size !== keys.length || !keys.every(isStr)) out.push('needs 3-4 distinct options')
  if (!keys.includes(t.answer)) out.push('answer must be one of the options')
  if (t.boss === 'scribe') {
    if (!isStr(t.py)) out.push('py (pinyin of the completed note) is required')
    if ((t.zh ?? '').split(BLANK).length !== 2) out.push(`zh needs exactly one blank (${BLANK})`)
    for (const o of keys) if (![...o].every(ch => HANZI.test(ch))) out.push(`option "${o}" must be Chinese characters only`)
  }
  if (t.boss === 'golem') {
    // A tone trial: every option is the answer with different tone marks only, and never turns a written third tone into a
    // second tone (that is what tone sandhi does in speech, so such a distractor would also be "right").
    const a = letters(t.answer ?? '')
    for (const o of keys.filter(o => o !== t.answer)) {
      const l = letters(o)
      if (l.base !== a.base) { out.push(`option "${o}" must differ from the answer only in tone marks`); continue }
      if (l.marks.some((m, k) => a.marks[k] === '̌' && m === '́')) out.push(`option "${o}" turns a third tone into a second tone (tone sandhi makes that ambiguous)`)
    }
  }
  if (t.boss === 'wraith' && !isStr(t.py)) out.push('py (pinyin of the line) is required')
  if (t.boss === 'wraith' || t.boss === 'trickster') {
    for (const o of options as ReplyOption[]) if (!isStr(o?.zh) || !isStr(o?.py) || !isStr(o?.en)) out.push(`option "${o?.zh}" needs zh, py and en`)
  }
  return out
}

export const TRIALS: Trial[] = ((trialsJson as { trials?: Trial[] }).trials ?? []).filter(t => trialErrors(t, WORDS.map(w => w.id)).length === 0)
export const trialById = (id: string | undefined) => TRIALS.find(t => t.id === id)

const fightBoss = (run: Run) => (isBoss(run.floor, run.kill) ? bossIdFor(run.floor) : null)
/** Has the fight just reached the moment this boss calls its trial? */
function trialMoment(run: Run, boss: TrialBoss, enemies: AnswerInput['enemies']) {
  if (boss === 'golem') return TUNING.golemTrial > 0 && run.shield > 0 && run.shield === shieldFor(run.floor, 'golem') - 1
  if (boss === 'trickster') return TUNING.tricksterTrial > 0 && run.enemyHp > 0 && run.enemyHp <= enemyStats(enemies, run.floor, run.kill, run.depth).hp * TRICKSTER_LOW
  if (boss === 'scribe') return TUNING.scribeTrial > 0 && run.shield > 0 && run.shield === shieldFor(run.floor, 'scribe') - 1
  return TUNING.wraithTrial > 0 && run.enemyHp > 0 && run.enemyHp <= enemyStats(enemies, run.floor, run.kill, run.depth).hp * WRAITH_ECHO_AT
}

/**
 * After an answer: offer the boss's trial when the fight has reached its moment (once per fight, only with a line whose words
 * the player has met). Returns the run unchanged otherwise.
 */
export function offerTrial(run: Run, mastery: Mastery, enemies: AnswerInput['enemies'], rng = Math.random): Run {
  const boss = fightBoss(run)
  if (!boss || !BOSSES.includes(boss as TrialBoss) || run.phase !== 'fighting' || run.trial?.floor === run.floor || !trialMoment(run, boss as TrialBoss, enemies)) return run
  const pool = TRIALS.filter(t => t.boss === boss && t.requires.every(id => Object.prototype.hasOwnProperty.call(mastery, id)))
  if (!pool.length) return run
  const t = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
  const order = optionKeys(t)
  for (let i = order.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [order[i], order[j]] = [order[j], order[i]] }
  return { ...run, trial: { id: t.id, floor: run.floor, order, status: 'pending' } }
}

export type TrialResult = { run: Run; correct: boolean; hit: number; heartsLost: number; savedBySecondChance: boolean; outcome: 'continue' | 'defeat' }

/** Answer the pending trial (one submission). Anything but a pending trial in a live fight is a no-op (returns null). */
export function resolveTrial(i: Omit<AnswerInput, 'lv' | 'isCorrect' | 'practice' | 'sealQuestion'> & { chosen: string }): TrialResult | null {
  const { run } = i, state = run.trial, trial = trialById(state?.id)
  if (!state || !trial || state.status !== 'pending' || run.phase !== 'fighting' || !optionKeys(trial).includes(i.chosen)) return null
  const answered: TrialState = { ...state, status: 'answered', chosen: i.chosen }
  if (i.chosen === trial.answer) {
    const ok = { correct: true, heartsLost: 0, savedBySecondChance: false, outcome: 'continue' as const }
    if (trial.boss === 'wraith') return { ...ok, run: { ...run, calm: 1, streak: run.streak + 1, trial: answered }, hit: 0 }
    if (trial.boss === 'scribe') return { ...ok, run: { ...run, shield: 0, streak: run.streak + 1, trial: answered }, hit: 0 }
    const foe = enemyStats(i.enemies, run.floor, run.kill, run.depth)
    const share = trial.boss === 'trickster' ? TUNING.tricksterTrialHit : TUNING.golemTrialHit
    const hit = Math.max(0, Math.min(run.enemyHp - 1, Math.round(foe.hp * share)))
    return { ...ok, run: { ...run, shield: trial.boss === 'golem' ? 0 : run.shield, enemyHp: run.enemyHp - hit, streak: run.streak + 1, trial: answered }, hit }
  }
  // A wrong trial answer is an ordinary wrong answer: same heart / calm / second-chance / defeat rules, never a practice save.
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
  const keys = optionKeys(trial)
  const order = Array.isArray(t.order) && t.order.length === keys.length && keys.every(o => t.order.includes(o)) ? t.order : [...keys]
  const status = t.status === 'pending' || t.status === 'answered' ? t.status : 'done'
  const chosen = status === 'answered' && keys.includes(t.chosen ?? '') ? t.chosen : undefined
  return { id: trial.id, floor, order, status: status === 'answered' && !chosen ? 'done' : status, ...(chosen ? { chosen } : {}) }
}
