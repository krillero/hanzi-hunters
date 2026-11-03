// Vocabulary scheduling: pure functions, no DOM, no Date.now (every time and sequence number is passed in).
// See docs/SCHEDULING.md for the research basis (and its limits), the state-transition table and the migration rules.
//
// One scheduler per entry. Levels 0-5 keep their meaning (see LEVEL_NAMES in mastery.ts). Evidence for every tested dimension is
// recorded, but only answers the caller marks as promoting can move the scheduler (per question kind: PROMOTING_KINDS in game/learning.ts).

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000

// ---- Product defaults informed by research (not proven optimal intervals) --------------------------------------------------
export const INITIAL_SUCCESS_TARGET = 3
/** Gap before the 1st, 2nd and 3rd initial success: other answered questions AND time since the previous anchor. */
export const INITIAL_GAPS = [
  { otherAnswers: 2, minimumMs: 30_000 },
  { otherAnswers: 4, minimumMs: 90_000 },
  { otherAnswers: 8, minimumMs: 180_000 }
] as const
/** A break this long satisfies any gap without intervening answers. */
export const LONG_BREAK_MS = 20 * MIN
export const RELEARN_GAP = { otherAnswers: 2, minimumMs: 30_000 } as const
/** A delayed success must come this long after the last exposure that displayed the entry's answer. */
export const REVEAL_QUIET_MS = 10 * MIN
/** Wait after reaching level 2, 3, 4, 5 (level 5 = first maintenance). Elapsed time, never calendar dates. */
export const STAGE_INTERVAL_MS: Readonly<Record<number, number>> = { 2: 24 * HOUR, 3: 24 * HOUR, 4: 72 * HOUR, 5: 14 * DAY }
export const MAINTENANCE_INTERVAL_MS = 30 * DAY
/** Wait after a successful relearning answer on an established word. */
export const RECHECK_MS = 24 * HOUR
export const MAX_LV = 5
export const MAX_COUNT = 9999

export const DIMENSIONS = ['meaning', 'reading', 'listening', 'reverse', 'sentence'] as const
export type Dimension = typeof DIMENSIONS[number]
/** Default for an answer that does not say whether it promotes: these dimensions can change level, due dates or relearning. */
export const PROMOTING_DIMENSIONS: readonly Dimension[] = ['meaning', 'reverse']

// ---- Types -------------------------------------------------------------------------------------------------------------------
/** Anchor of the current spacing requirement: when and at which global answer number it started, and how many answers of THIS entry followed. */
export type Gap = { at: number; seq: number; own: number }
/** Evidence per tested dimension. `toneOk` / `toneBad` (reading only) count answers with the right / wrong tone. */
export type DimStat = { n: number; ok: number; last: number; lastOk: number; lastQual: number; toneOk?: number; toneBad?: number }
export type Recovery = 'relearn' | 'recheck'
export type SchedEntry = {
  lv: number                 // 0-5
  ok: number                 // spaced initial successes, 0..INITIAL_SUCCESS_TARGET (3 once lv >= 2)
  g: Gap                     // anchor of the current gap (introduction, last initial success, last failure or relearning success)
  lastSeq: number            // global answer number of this entry's latest answer (0 = none); duplicates and replays are ignored
  adv: number                // time of the last successful advancement (the start of the current interval)
  due: number | null         // earliest time a delayed / maintenance / recheck success counts; null in initial learning and relearning
  reveal: number             // last exposure that displayed this entry's answer (0 = never)
  rel?: Recovery             // relearning (after a miss, before the recovery answer) or recheck (waiting for the next-day check)
  dims: Partial<Record<Dimension, DimStat>>
}
export type Answer = {
  correct: boolean
  assisted: boolean          // the answer was revealed before submission, or a hint removed options
  dim: Dimension
  now: number                // ms timestamp
  seq: number                // global answer number, increasing by one per submitted answer
  toneOk?: boolean           // reading questions only
  /** Can this answer move the scheduler? The caller decides per question kind (PROMOTING_KINDS in learning.ts); when omitted the dimension decides. */
  promotes?: boolean
}
export type Outcome = 'ignored' | 'recorded' | 'assisted' | 'practice' | 'spaced' | 'familiar' | 'advanced' | 'maintained' | 'lapse' | 'relearned' | 'rechecked'

// ---- Helpers -----------------------------------------------------------------------------------------------------------------
const bump = (n: number | undefined, by = 1) => Math.min(MAX_COUNT, (n ?? 0) + by)
export const isInitial = (e: SchedEntry) => e.ok < INITIAL_SUCCESS_TARGET
/** The wait that starts when the entry reaches level `lv`. */
export const intervalFor = (lv: number) => STAGE_INTERVAL_MS[lv] ?? MAINTENANCE_INTERVAL_MS

/** A new entry, created when the new-word card is read. Reading creates no retrieval credit. */
export function introduce(now: number, seq: number): SchedEntry {
  return { lv: 0, ok: 0, g: { at: now, seq, own: 0 }, lastSeq: 0, adv: now, due: null, reveal: now, dims: {} }
}

/** An exposure that displayed the answer (details, translation, new-word card). */
export const recordReveal = (e: SchedEntry, now: number): SchedEntry => (now > e.reveal ? { ...e, reveal: now } : e)

/** Is the spacing requirement met for an answer that would get number `seq` at time `now`? */
export function gapMet(g: Gap, need: { otherAnswers: number; minimumMs: number }, now: number, seq: number): boolean {
  const elapsed = now - g.at
  if (elapsed >= LONG_BREAK_MS) return true
  return elapsed >= need.minimumMs && seq - g.seq - 1 - g.own >= need.otherAnswers
}
const needFor = (e: SchedEntry) => (e.rel === 'relearn' ? RELEARN_GAP : INITIAL_GAPS[Math.min(e.ok, INITIAL_SUCCESS_TARGET - 1)])
const reset = (now: number, seq: number): Gap => ({ at: now, seq, own: 0 })
const quietSince = (e: SchedEntry, now: number) => now - e.reveal >= REVEAL_QUIET_MS

/** What kind of question this entry is right now. `seq` = the number the NEXT answer would get. Used for selection priority. */
export type Standing = 'relearn' | 'due' | 'initial' | 'other'
export function standing(e: SchedEntry, now: number, seq: number): Standing {
  if (e.rel === 'relearn') return gapMet(e.g, RELEARN_GAP, now, seq) ? 'relearn' : 'other'
  if (isInitial(e)) return gapMet(e.g, needFor(e), now, seq) ? 'initial' : 'other'
  return e.due !== null && now >= e.due && quietSince(e, now) ? 'due' : 'other'
}
/** True when a correct unassisted promoting-dimension answer now would change this entry. */
export const earnsCredit = (e: SchedEntry, now: number, seq: number) => standing(e, now, seq) !== 'other'
/** Time of the next delayed / maintenance / recheck review, or null (initial learning, relearning). */
export const nextReviewAt = (e: SchedEntry) => e.due

// ---- The one scheduling API --------------------------------------------------------------------------------------------------
/** Evidence + scheduling for one submitted answer. Returns the same entry for a repeated or out-of-order answer number. */
export function recordAnswer(e: SchedEntry, a: Answer): { entry: SchedEntry; outcome: Outcome } {
  if (!(a.seq > e.lastSeq)) return { entry: e, outcome: 'ignored' }
  const d = e.dims[a.dim] ?? { n: 0, ok: 0, last: 0, lastOk: 0, lastQual: 0 }
  const stat: DimStat = { ...d, n: bump(d.n), ok: a.correct ? bump(d.ok) : d.ok, last: a.now, lastOk: a.correct ? a.now : d.lastOk }
  if (a.dim === 'reading' && a.toneOk !== undefined) { if (a.toneOk) stat.toneOk = bump(d.toneOk); else stat.toneBad = bump(d.toneBad) }
  // Every answer shows the correction or confirmation, so it is also an answer-revealing exposure (checked AFTER the decision below).
  const touched: SchedEntry = { ...e, lastSeq: a.seq, reveal: Math.max(e.reveal, a.now), g: { ...e.g, own: bump(e.g.own) }, dims: { ...e.dims, [a.dim]: stat } }
  const done = (patch: Partial<SchedEntry>, outcome: Outcome, qualified = false): { entry: SchedEntry; outcome: Outcome } => {
    const dims = qualified ? { ...touched.dims, [a.dim]: { ...stat, lastQual: a.now } } : touched.dims
    return { entry: { ...touched, ...patch, dims }, outcome }
  }
  const promotes = a.promotes ?? PROMOTING_DIMENSIONS.includes(a.dim)
  if (!promotes) return done({}, 'recorded')

  if (!a.correct) {
    // One failure transition per recovery period: a miss while already relearning / rechecking only restarts the relearning gap.
    const lv = e.rel || isInitial(e) ? e.lv : Math.max(2, e.lv - 1)
    return done({ lv, rel: 'relearn', due: null, g: reset(a.now, a.seq) }, 'lapse')
  }
  if (a.assisted) return done({}, 'assisted')

  if (e.rel === 'relearn') {
    if (!gapMet(e.g, RELEARN_GAP, a.now, a.seq)) return done({}, 'practice')
    // The recovery answer is not also an initial success or a promotion.
    return isInitial(e)
      ? done({ rel: undefined, g: reset(a.now, a.seq) }, 'relearned', true)
      : done({ rel: 'recheck', due: a.now + RECHECK_MS, g: reset(a.now, a.seq) }, 'relearned', true)
  }
  if (isInitial(e)) {
    if (!gapMet(e.g, needFor(e), a.now, a.seq)) return done({}, 'practice')
    const ok = e.ok + 1
    if (ok < INITIAL_SUCCESS_TARGET) return done({ ok, lv: 1, g: reset(a.now, a.seq) }, 'spaced', true)
    return done({ ok, lv: 2, adv: a.now, due: a.now + intervalFor(2), g: reset(a.now, a.seq) }, 'familiar', true)
  }
  // Established (Familiar or higher), including a recheck after a lapse: a delayed, unassisted success after the answer was last shown.
  if (e.due === null || a.now < e.due || !quietSince(e, a.now)) return done({}, 'practice')   // early practice never moves the due time
  const lv = Math.min(MAX_LV, e.lv + 1)   // at most one stage, however overdue
  const wasMax = e.lv >= MAX_LV && !e.rel
  const due = wasMax ? a.now + MAINTENANCE_INTERVAL_MS : a.now + intervalFor(lv)
  return done({ lv, rel: undefined, adv: a.now, due }, e.rel ? 'rechecked' : wasMax ? 'maintained' : 'advanced', true)
}

// ---- Display -----------------------------------------------------------------------------------------------------------------
/** "in 2 hours", "in 3 days"; due or past = "now". Derived from timestamps only. */
export function formatWait(ms: number): string {
  if (ms <= 0) return 'now'
  if (ms < HOUR) return 'in under an hour'
  if (ms < DAY) { const h = Math.round(ms / HOUR); return h >= 24 ? 'in 1 day' : `in ${h} hour${h === 1 ? '' : 's'}` }
  const d = Math.round(ms / DAY)
  return `in ${d} day${d === 1 ? '' : 's'}`
}

// ---- Validation and migration ------------------------------------------------------------------------------------------------
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback)
/** A timestamp that cannot lie in the future (a future value is clamped to `now`, which only makes a requirement wait, never pass). */
const past = (v: unknown, now: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(now, Math.max(0, Math.floor(v))) : fallback)

function cleanDims(raw: unknown, now: number): SchedEntry['dims'] {
  const out: SchedEntry['dims'] = {}
  if (!isObj(raw)) return out
  for (const k of DIMENSIONS) {
    const v = raw[k]; if (!isObj(v)) continue
    const n = num(v.n, 0, MAX_COUNT, 0)
    const s: DimStat = { n, ok: num(v.ok, 0, n, 0), last: past(v.last, now, 0), lastOk: past(v.lastOk, now, 0), lastQual: past(v.lastQual, now, 0) }
    if (k === 'reading') { s.toneOk = num(v.toneOk, 0, MAX_COUNT, 0); s.toneBad = num(v.toneBad, 0, MAX_COUNT, 0) }
    out[k] = s
  }
  return out
}

/** Validates a stored entry (ids are handled by the caller). Null when it is not an entry. Preserves overdue dates, clamps future ones. */
export function sanitizeSched(raw: unknown, now: number, maxSeq: number): SchedEntry | null {
  if (!isObj(raw)) return null
  const lv = num(raw.lv, 0, MAX_LV, 0)
  const ok = lv >= 2 ? INITIAL_SUCCESS_TARGET : lv === 0 ? 0 : num(raw.ok, 1, INITIAL_SUCCESS_TARGET - 1, 1)
  const rel: Recovery | undefined = raw.rel === 'relearn' || raw.rel === 'recheck' ? raw.rel : undefined
  // A recheck only exists for an established word; an initial word can only be relearning.
  const recovery: Recovery | undefined = rel === 'recheck' && ok < INITIAL_SUCCESS_TARGET ? 'relearn' : rel
  const g = isObj(raw.g) ? raw.g : {}
  let due: number | null = null
  if (ok >= INITIAL_SUCCESS_TARGET && recovery !== 'relearn') {
    const latest = now + (recovery === 'recheck' ? RECHECK_MS : intervalFor(lv))   // beyond this a date is nonsense: no instant promotion, no endless wait
    due = typeof raw.due === 'number' && Number.isFinite(raw.due) ? Math.min(latest, Math.max(0, Math.floor(raw.due))) : now
  }
  return {
    lv, ok, due, ...(recovery ? { rel: recovery } : {}),
    g: { at: past(g.at, now, now), seq: num(g.seq, 0, maxSeq, 0), own: num(g.own, 0, MAX_COUNT, 0) },
    lastSeq: num(raw.lastSeq, 0, maxSeq, 0), adv: past(raw.adv, now, now), reveal: past(raw.reveal, now, 0), dims: cleanDims(raw.dims, now)
  }
}

/** Local noon of a YYYY-MM-DD date (ms), or null. Noon keeps a DST shift from moving the date. */
export function localNoon(date: unknown): number | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(y, m - 1, d, 12, 0, 0, 0)
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? t.getTime() : null
}

/**
 * One-time migration of an expedition-save entry { lv, ok, at? }. Keeps the level, grants no credit for imaginary past answers:
 * level 0 has 0 initial successes, level 1 has 1, level 2+ has finished initial learning. Established words are due at their old
 * date + the interval of their level (a missing or invalid date = due now; nothing is promoted). Sequence anchors start at `seq`.
 */
export function fromLegacyEntry(raw: unknown, now: number, seq = 0): SchedEntry | null {
  if (!isObj(raw)) return null
  const noon = localNoon(raw.at)
  const lv = num(raw.lv, 0, noon === null ? MAX_LV - 1 : MAX_LV, 0)   // a level-5 word without a date cannot have been earned
  const e: SchedEntry = { lv, ok: lv >= 2 ? INITIAL_SUCCESS_TARGET : lv, g: reset(now, seq), lastSeq: 0, adv: noon === null ? now : Math.min(noon, now), due: null, reveal: 0, dims: {} }
  if (lv >= 2) e.due = noon === null ? now : Math.min(noon + intervalFor(lv), now + intervalFor(lv))
  return e
}

/** An entry at a given level without history, for fixtures, previews and tools: established words (level 2+) are due at `now`. */
export const entryAtLevel = (lv: number, now = 0, seq = 0): SchedEntry => {
  const l = num(lv, 0, MAX_LV, 0)
  return { lv: l, ok: l >= 2 ? INITIAL_SUCCESS_TARGET : l, g: reset(now, seq), lastSeq: 0, adv: now, due: l >= 2 ? now : null, reveal: 0, dims: {} }
}
