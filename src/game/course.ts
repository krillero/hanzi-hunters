// Curriculum progression: which entry to introduce next, which known entries to review, and what counts as "ready".
// Pure (no DOM, no React). Rules and file format: docs/CURRICULUM.md. Tests: tests/course.test.ts.
//
// Vocabulary (words.json) says WHAT an entry is; a curriculum (curricula.json) says in WHICH ORDER entries are taught.
// The order of words.json never matters. Progress is keyed by entry id (mastery) and by lesson id (completion), never by position.
//
// Vocabulary states, from weakest to strongest:
//   introduced          the learner saw the entry's introduction card            mastery[id] exists
//   practiced           answered right at least once since (and not lost since)  lv >= 1 or ok >= 1
//   ready to advance    enough initial practice to continue the course           highest level ever reached >= readiness.minLevel
//   long-term mastery   a separate, later concept (MAX_LV). Lesson completion never claims it.
//
// Two different persistent facts, never confused:
//   lesson completion   (courses[id].completed)  keeps LESSON prerequisites unlocked after mistakes and curriculum updates.
//   entry readiness     (peak[entryId])          the highest mastery level an entry has actually reached. ENTRY prerequisites
//                                                (introductions and sentence questions) use only this, never lesson membership,
//                                                so a word added later to a completed lesson must still be introduced and practised.
import type { Curriculum, Introduction, Lesson, Readiness, Unit, Word } from '../content/types.ts'
import type { Mastery, MasteryEntry } from './types.ts'
import { MAX_LEARNING, MAX_LV, MIN_KNOWN, STARTING_POOL, isDue } from './mastery.ts'

// ---- configuration -----------------------------------------------------------------------------------

/** Default readiness rule: every required entry of a lesson has been introduced and reached mastery level 1. A curriculum may override it. */
export const DEFAULT_READINESS: Readiness = { minLevel: 1 }
export const readinessOf = (c: Pick<Curriculum, 'readiness'>): Readiness => ({ minLevel: Math.min(MAX_LV, Math.max(1, Math.floor(c.readiness?.minLevel ?? DEFAULT_READINESS.minLevel))) })

/** Limits on simultaneous new learning (unchanged from the pre-curriculum game). */
export type IntroLimits = {
  /** Never introduce a new entry while this many entries are still at level 0. */
  maxLearning: number
  /** A learner who has met fewer than this many entries gets enough introductions at once to start fighting. */
  minKnown: number
  /** Otherwise at most this many introductions per fight. */
  perFight: number
  /** Entries met may exceed the number of entries at level >= 1 by at most this much (keeps the pool of half-learned words small). */
  startingPool: number
}
export const DEFAULT_LIMITS: IntroLimits = { maxLearning: MAX_LEARNING, minKnown: MIN_KNOWN, perFight: 1, startingPool: STARTING_POOL }

// ---- vocabulary states ---------------------------------------------------------------------------------

export const isIntroduced = (m: Mastery, id: string) => !!m[id]
export const isPracticed = (e: MasteryEntry | undefined) => !!e && (e.lv >= 1 || e.ok >= 1)
export const isReady = (e: MasteryEntry | undefined, r: Readiness = DEFAULT_READINESS) => !!e && e.lv >= r.minLevel

/** Highest mastery level each entry has ever reached, by stable entry id (shared by every curriculum; each compares it with its own threshold). */
export type PeakLevels = Record<string, number>

/** Raises peaks to the current levels. Returns the same object when nothing changed. Peaks never go down. */
export function recordPeaks(peak: PeakLevels, m: Mastery): PeakLevels {
  let out: PeakLevels | null = null
  for (const [id, e] of Object.entries(m)) if (e.lv > (peak[id] ?? 0)) (out ??= { ...peak })[id] = Math.min(MAX_LV, e.lv)
  return out ?? peak
}

/** The highest level this entry has reached: -1 if it was never introduced (an unseen entry is never ready, whatever a peak says). */
export const reachedLevel = (m: Mastery, peak: PeakLevels, id: string) => (m[id] ? Math.max(m[id].lv, peak[id] ?? 0) : -1)

/** THE readiness rule (one implementation): introduced, and has reached the curriculum's threshold now or at some point before. */
export const entryReady = (m: Mastery, peak: PeakLevels, id: string, r: Readiness) => reachedLevel(m, peak, id) >= r.minLevel
export const isLongTermMastered = (e: MasteryEntry | undefined) => !!e && e.lv >= MAX_LV

// ---- the curriculum as a flat sequence ---------------------------------------------------------------------

export type Step = { unit: Unit; unitIndex: number; lesson: Lesson; lessonIndex: number; intro: Introduction; required: boolean }
export type LessonRef = { unit: Unit; unitIndex: number; lesson: Lesson; lessonIndex: number; number: number }

/** All lessons in declared order. `lessonIndex` is 0-based within its unit; `number` is 1-based across the whole course (shown to players). */
export const lessonsOf = (c: Curriculum): LessonRef[] =>
  c.units.flatMap((unit, unitIndex) => unit.lessons.map((lesson, lessonIndex) => ({ unit, unitIndex, lesson, lessonIndex })))
    .map((l, i) => ({ ...l, number: i + 1 }))

/** The effective introduction order: units, then lessons, then introductions, exactly as written. */
export const stepsOf = (c: Curriculum): Step[] =>
  lessonsOf(c).flatMap(l => l.lesson.introductions.map(intro => ({ ...l, intro, required: intro.required !== false })))

export const curriculumEntryIds = (c: Curriculum) => new Set(stepsOf(c).map(s => s.intro.entryId))

// ---- saved course progress -----------------------------------------------------------------------------

/** What the save remembers per curriculum. Only lesson ids: entry progress lives in `mastery` (shared by every curriculum). */
export type CourseProgress = {
  /** Curriculum version this progress was last synced with (informational; nothing depends on it matching). */
  version: number
  /** Lesson ids that have reached readiness at least once. Sticky: later mistakes never remove an id. Unknown ids are kept (recoverable). */
  completed: string[]
}
export const emptyCourse = (): CourseProgress => ({ version: 0, completed: [] })

/** Is this lesson completed (sticky), counting ids it had before a rename (`aliases`)? */
export const lessonCompleted = (lesson: Lesson, p: CourseProgress) => p.completed.includes(lesson.id) || (lesson.aliases ?? []).some(a => p.completed.includes(a))

/** Lesson readiness: every required entry introduced and ready (entryReady). A lesson without required entries is ready once all its entries are introduced. */
export function lessonReadyNow(lesson: Lesson, m: Mastery, r: Readiness, words?: Map<string, Word>, peak: PeakLevels = {}): boolean {
  const intros = lesson.introductions.filter(i => !words || words.has(i.entryId))
  const required = intros.filter(i => i.required !== false)
  if (!required.length) return intros.every(i => isIntroduced(m, i.entryId))
  return required.every(i => entryReady(m, peak, i.entryId, r))
}

/**
 * Brings saved progress up to date with the current mastery and curriculum. Never removes anything:
 * newly ready lessons are added, renamed lessons (aliases) pick up their old completion, ids that no longer exist are kept.
 * Returns the same object when nothing changed (cheap to call after every answer).
 */
export function syncCourse(c: Curriculum, m: Mastery, p: CourseProgress = emptyCourse(), words?: Map<string, Word>, peak: PeakLevels = {}): CourseProgress {
  const r = readinessOf(c)
  const add: string[] = []
  for (const { lesson } of lessonsOf(c)) {
    if (p.completed.includes(lesson.id)) continue
    if (lessonCompleted(lesson, p) || lessonReadyNow(lesson, m, r, words, peak)) add.push(lesson.id)
  }
  if (!add.length && p.version === c.version) return p
  return { version: c.version, completed: [...p.completed, ...add] }
}

/** Saved lesson ids that the current curriculum does not know (removed or renamed without an alias). Kept, reported in diagnostics. */
export function orphanLessons(c: Curriculum, p: CourseProgress): string[] {
  const known = new Set(lessonsOf(c).flatMap(l => [l.lesson.id, ...(l.lesson.aliases ?? [])]))
  return p.completed.filter(id => !known.has(id))
}

// ---- prerequisites -----------------------------------------------------------------------------------------

export type CourseState = { curriculum: Curriculum; mastery: Mastery; progress: CourseProgress; words: Map<string, Word>; peak: PeakLevels }
export const wordMap = (words: Word[]) => new Map(words.map(w => [w.id, w]))

/** A prerequisite lesson is satisfied when it was completed once (sticky) or is ready right now. */
export function lessonSatisfied(s: CourseState, lessonId: string): boolean {
  const ref = lessonsOf(s.curriculum).find(l => l.lesson.id === lessonId)
  if (!ref) return s.progress.completed.includes(lessonId)
  return lessonCompleted(ref.lesson, s.progress) || lessonReadyNow(ref.lesson, s.mastery, readinessOf(s.curriculum), s.words, s.peak)
}

/**
 * A prerequisite ENTRY is satisfied only by that entry's own readiness: reached the threshold now or earlier (peak), so later
 * mistakes never revoke it. Membership of a completed lesson never counts: a word inserted into a completed lesson stays
 * unsatisfied until it is introduced and practised. Used for introductions and sentence questions alike.
 */
export function entrySatisfied(s: CourseState, entryId: string): boolean {
  return entryReady(s.mastery, s.peak, entryId, readinessOf(s.curriculum))
}

// ---- which entries to introduce ------------------------------------------------------------------------------

export type IntroReason =
  | 'introduce'        // `ids` holds the next entries, in curriculum order
  | 'learning-limit'   // there are entries to introduce, but too many are still being learned: keep reviewing
  | 'prerequisites'    // the next entries wait for prerequisites to become ready: keep reviewing
  | 'complete'         // every entry of the curriculum has been introduced
  | 'empty'            // the curriculum has no entry that exists in words.json (content/configuration error)

export type IntroPlan = {
  ids: string[]
  reason: IntroReason
  /** The lesson the next introduction comes from (or is waiting in). */
  lesson: LessonRef | null
  /** Developer-facing explanation (never shown in normal gameplay). */
  detail: string
  /** Curriculum entries that do not exist in words.json (skipped). */
  missing: string[]
}

/** How many entries may be introduced right now (0 = keep reviewing). Counts every entry the learner has met, in any curriculum. */
export function introCapacity(m: Mastery, limits: IntroLimits = DEFAULT_LIMITS): number {
  const entries = Object.values(m)
  const seen = entries.length
  const learning = entries.filter(e => e.lv === 0).length
  const grown = entries.filter(e => e.lv >= 1).length
  const room = Math.max(0, limits.maxLearning - learning)
  const pool = Math.max(0, limits.startingPool + grown - seen)
  const want = Math.max(limits.perFight, limits.minKnown - seen)
  return Math.max(0, Math.min(room, pool, want))
}

/**
 * The entries to introduce now, in curriculum order. Deterministic: no randomness, no player seed.
 * Walks lessons in declared order. A lesson whose prerequisite lessons are not satisfied is skipped (a later unlocked lesson may go first).
 * Inside a lesson entries come strictly in order: an entry whose prerequisite entries are not ready yet makes the lesson wait.
 * Entries already introduced are skipped, so a word moved to another lesson is never introduced twice, and a word added to a
 * completed lesson is still introduced. Entries outside the curriculum are never introduced.
 */
export function selectIntroductions(s: CourseState, limits: IntroLimits = DEFAULT_LIMITS, capacity = introCapacity(s.mastery, limits)): IntroPlan {
  const steps = stepsOf(s.curriculum)
  const missing = [...new Set(steps.filter(st => !s.words.has(st.intro.entryId)).map(st => st.intro.entryId))]
  const usable = steps.filter(st => s.words.has(st.intro.entryId))
  if (!usable.length) return { ids: [], reason: 'empty', lesson: null, detail: `curriculum "${s.curriculum.id}" has no entry that exists in words.json`, missing }

  const taken = new Set<string>()
  const ids: string[] = []
  let waiting: { lesson: LessonRef; detail: string } | null = null
  let firstLesson: LessonRef | null = null
  for (const ref of lessonsOf(s.curriculum)) {
    const unseen = ref.lesson.introductions.filter(i => s.words.has(i.entryId) && !isIntroduced(s.mastery, i.entryId) && !taken.has(i.entryId))
    if (!unseen.length) continue
    const blockedBy = (ref.lesson.prerequisiteLessons ?? []).filter(id => !lessonSatisfied(s, id))
    if (blockedBy.length) { waiting ??= { lesson: ref, detail: `lesson "${ref.lesson.id}" waits for lesson(s) ${blockedBy.join(', ')}` }; continue }
    firstLesson ??= ref
    let stopped = false
    for (const intro of unseen) {
      if (ids.length >= capacity) break
      const need = (intro.prerequisiteEntries ?? []).filter(id => !entrySatisfied(s, id))
      if (need.length) { waiting ??= { lesson: ref, detail: `entry "${intro.entryId}" in lesson "${ref.lesson.id}" waits for ${need.join(', ')} to be ready` }; stopped = true; break }
      ids.push(intro.entryId); taken.add(intro.entryId)
    }
    // Stay in this lesson while it still has entries to give (in order); move on only once all of them are taken.
    if (stopped || ids.length >= capacity || unseen.some(i => !taken.has(i.entryId))) break
  }
  if (ids.length) return { ids, reason: 'introduce', lesson: firstLesson, detail: `introducing ${ids.join(', ')} from lesson "${firstLesson?.lesson.id}"`, missing }
  const anyUnseen = usable.some(st => !isIntroduced(s.mastery, st.intro.entryId))
  if (!anyUnseen) return { ids: [], reason: 'complete', lesson: null, detail: `every entry of "${s.curriculum.id}" has been introduced`, missing }
  if (firstLesson && capacity <= 0) return { ids: [], reason: 'learning-limit', lesson: firstLesson, detail: `next lesson "${firstLesson.lesson.id}" is ready, but ${s.curriculum.id}: learning limit reached (too many entries at level 0, or too few at level 1 yet)`, missing }
  return { ids: [], reason: 'prerequisites', lesson: waiting?.lesson ?? null, detail: waiting?.detail ?? 'remaining entries wait for prerequisites', missing }
}

// ---- which known entries to practise ----------------------------------------------------------------------------

/**
 * How often each level is reviewed while it is not due: entries still being learned (0-1) most; Familiar and later entries that
 * wait for their day less (repeating them cannot promote them today); mastered ones rarely. 0.8 for waiting entries keeps the old
 * pace of new words for strong players (simulator: 0.85 accuracy, 84 words after 40 expeditions) without slowing depth progress;
 * 0.6 introduces more words (95) but 0.75-accuracy players then clear depths about 2 expeditions later.
 */
export const LEVEL_WEIGHT = [3, 3, 0.8, 0.8, 0.8, 0.4]
/** A word whose time-gated step is due (game/mastery.ts isDue) is reviewed far more often: a session starts by checking it. */
export const DUE_WEIGHT = 6
/** At most this many due words are asked per fight, so new and still-learning words always keep slots (ReviewOptions.dueCapped). */
export const DUE_PER_FIGHT = 2
/** Entries asked a moment ago are less likely to come straight back (never impossible). Index 0 = most recent. */
export const RECENT_PENALTY = [0.1, 0.2, 0.3, 0.4, 0.6, 0.6]

/**
 * How much an introduced entry should be reviewed now. This is the seam for a future scheduler: a spaced-repetition policy can supply
 * its own weight from review dates without touching curriculum order or introduction selection.
 */
export type ReviewWeight = (word: Word, entry: MasteryEntry, today?: string) => number
export const levelWeight: ReviewWeight = (_w, e, today) => (today && isDue(e, today) ? DUE_WEIGHT : LEVEL_WEIGHT[Math.min(e.lv, LEVEL_WEIGHT.length - 1)])

export type ReviewOptions = {
  currentId?: string | null
  recent?: string[]
  rng?: () => number
  weight?: ReviewWeight
  /** Extra filter (e.g. no particles for boss questions). */
  filter?: (w: Word) => boolean
  /** Local date (YYYY-MM-DD): words due for a time-gated step are favoured. Without it, levels alone decide. */
  today?: string
  /** This fight has already asked DUE_PER_FIGHT due words: due words are not picked (unless nothing else is left). */
  dueCapped?: boolean
}

/**
 * A previously introduced entry to practise, or null when the learner has met nothing yet. NEVER returns an unseen entry:
 * introducing is selectIntroductions' job. Entries known from outside the active curriculum may be reviewed (their progress is kept).
 */
export function selectReview(words: Word[], m: Mastery, o: ReviewOptions = {}): Word | null {
  const rng = o.rng ?? Math.random, weight = o.weight ?? levelWeight, recent = o.recent ?? []
  const known = words.filter(w => m[w.id] && (!o.filter || o.filter(w)))
  if (!known.length) return null
  const others = known.filter(w => w.id !== o.currentId)
  const pool = others.length ? others : known   // a pool of one entry still works
  const weighted = pool.map(w => {
    const ri = recent.indexOf(w.id)
    const capped = o.dueCapped && o.today && isDue(m[w.id], o.today)
    const base = capped ? 0 : Math.max(0, weight(w, m[w.id], o.today))
    return { w, weight: ri >= 0 && ri < RECENT_PENALTY.length ? base * RECENT_PENALTY[ri] : base }
  })
  const total = weighted.reduce((n, x) => n + x.weight, 0)
  if (total <= 0) return pool[Math.floor(rng() * pool.length)]
  let r = rng() * total
  for (const x of weighted) { r -= x.weight; if (r < 0) return x.w }
  return weighted[weighted.length - 1].w
}

// ---- progress shown to the player -------------------------------------------------------------------------------

export type CourseStatus = {
  title: string
  provisional: boolean
  /** The lesson the learner is working on (null when everything is complete). */
  lesson: LessonRef | null
  /** Entries of that lesson already introduced / total entries of that lesson. */
  introduced: number
  total: number
  /** Required entries of that lesson that are ready / total required. */
  ready: number
  required: number
  lessonsCompleted: number
  lessonsTotal: number
  courseIntroduced: number
  courseTotal: number
  complete: boolean
}

export function courseStatus(s: CourseState, limits: IntroLimits = DEFAULT_LIMITS): CourseStatus {
  const r = readinessOf(s.curriculum)
  const lessons = lessonsOf(s.curriculum)
  const plan = selectIntroductions(s, limits, Number.POSITIVE_INFINITY)
  const current = plan.lesson ?? lessons.find(l => !lessonCompleted(l.lesson, s.progress) && !lessonReadyNow(l.lesson, s.mastery, r, s.words, s.peak)) ?? null
  const intros = current ? current.lesson.introductions.filter(i => s.words.has(i.entryId)) : []
  const req = intros.filter(i => i.required !== false)
  const all = stepsOf(s.curriculum).filter(st => s.words.has(st.intro.entryId))
  const completed = lessons.filter(l => lessonCompleted(l.lesson, s.progress) || lessonReadyNow(l.lesson, s.mastery, r, s.words, s.peak)).length
  return {
    title: s.curriculum.title, provisional: !!s.curriculum.provisional, lesson: current,
    introduced: intros.filter(i => isIntroduced(s.mastery, i.entryId)).length, total: intros.length,
    ready: req.filter(i => entryReady(s.mastery, s.peak, i.entryId, r)).length, required: req.length,
    lessonsCompleted: completed, lessonsTotal: lessons.length,
    courseIntroduced: all.filter(st => isIntroduced(s.mastery, st.intro.entryId)).length, courseTotal: all.length,
    complete: !current
  }
}

/** "Lesson 3 · Greetings": lesson number counted across the whole course (units may hold one lesson each), then the unit title. */
export const lessonLabel = (ref: LessonRef): string => `Lesson ${ref.number} · ${ref.unit.title}`

/** "Lesson 1 · Greetings · 2 of 5 introduced" (no ids, no schema words). */
export function courseLine(st: CourseStatus): string {
  if (!st.lesson) return `${st.title} · all lessons complete`
  const head = lessonLabel(st.lesson)
  if (st.introduced < st.total) return `${head} · ${st.introduced} of ${st.total} introduced`
  return `${head} · ${st.ready} of ${st.required} ready`
}

/** The short lesson label for an introduction card: "Lesson 1 · Greetings". Null outside the curriculum. */
export function introCardLine(s: CourseState, entryId: string): string | null {
  const ref = lessonsOf(s.curriculum).find(l => l.lesson.introductions.some(i => i.entryId === entryId))
  return ref ? lessonLabel(ref) : null
}

/** Are an authored sentence question's prerequisites met? Lessons may belong to any curriculum (`completedElsewhere`: their saved completion). */
export function sentencePrereqsMet(item: { prerequisiteEntries?: string[]; prerequisiteLessons?: string[] }, s: CourseState, completedElsewhere: ReadonlySet<string> = new Set()): boolean {
  return (item.prerequisiteEntries ?? []).every(id => entrySatisfied(s, id)) &&
    (item.prerequisiteLessons ?? []).every(id => lessonSatisfied(s, id) || completedElsewhere.has(id))
}
