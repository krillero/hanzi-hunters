import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INITIAL_GAPS, LONG_BREAK_MS, MAINTENANCE_INTERVAL_MS, RECHECK_MS, REVEAL_QUIET_MS, STAGE_INTERVAL_MS,
  earnsCredit, formatWait, fromLegacyEntry, introduce, localNoon, recordAnswer, recordReveal, sanitizeSched, standing,
  type Answer, type SchedEntry
} from '../src/game/schedule.ts'

const S = 1000, H = 3_600_000, T0 = 1_800_000_000_000
const KINDS = ['meaning', 'pinyin', 'character'] as const   // stands in for QUESTION_KINDS
const ans = (now: number, seq: number, o: Partial<Answer> = {}): Answer => ({ correct: true, assisted: false, kind: 'meaning', promotes: true, now, seq, ...o })
/** Answer by the entry at (now, seq); the other entries' answers in between are just sequence numbers. */
const go = (e: SchedEntry, now: number, seq: number, o: Partial<Answer> = {}) => recordAnswer(e, ans(now, seq, o))

/** Walks an entry through the three spaced initial successes. Returns it at Familiar at time `t`. */
function familiar(t = T0) {
  let e = introduce(t, 0), now = t, seq = 0
  for (const gap of INITIAL_GAPS) { now += gap.minimumMs; seq += gap.otherAnswers + 1; e = go(e, now, seq).entry }
  assert.equal(e.lv, 2); return { e, now, seq }
}

test('introduction creates level 0 with no retrieval credit', () => {
  const e = introduce(T0, 5)
  assert.deepEqual([e.lv, e.ok, e.lastSeq, e.due, e.reveal], [0, 0, 0, null, T0])
})

test('three sufficiently spaced successes reach Familiar and schedule the first review', () => {
  let e = introduce(T0, 0), now = T0, seq = 0
  const levels: number[] = [], outcomes: string[] = []
  for (const gap of INITIAL_GAPS) { now += gap.minimumMs; seq += gap.otherAnswers + 1; const r = go(e, now, seq); e = r.entry; levels.push(e.lv); outcomes.push(r.outcome) }
  assert.deepEqual(levels, [1, 1, 2]); assert.deepEqual(outcomes, ['spaced', 'spaced', 'familiar'])
  assert.equal(e.due, now + STAGE_INTERVAL_MS[2])
})

test('immediate repeats cannot progress; both the count AND the time must be met', () => {
  const e = introduce(T0, 0)
  assert.equal(go(e, T0 + 5 * S, 1).outcome, 'practice')            // no other answers, no time
  assert.equal(go(e, T0 + 29 * S, 3).outcome, 'practice')           // enough answers (2 others), 1 s too early
  assert.equal(go(e, T0 + 30 * S, 2).outcome, 'practice')           // time met, only 1 other answer
  assert.equal(go(e, T0 + 30 * S, 3).outcome, 'spaced')             // exactly both
})

test('answers of the same entry never count as other answers', () => {
  let e = introduce(T0, 0)
  for (let i = 1; i <= 6; i++) e = go(e, T0 + 60 * S + i, i).entry  // six answers of this entry alone, 60 s later
  assert.equal(e.ok, 0)
  assert.equal(go(e, T0 + 60 * S + 7, 7).outcome, 'practice')
  assert.equal(go(e, T0 + 60 * S + 8, 10).outcome, 'spaced')       // seq 8 and 9 were other entries
})

test('a 20 minute break satisfies the gap without other answers, also after a reload', () => {
  const e = JSON.parse(JSON.stringify(introduce(T0, 0))) as SchedEntry   // saved and loaded
  assert.equal(go(e, T0 + LONG_BREAK_MS - 1, 1).outcome, 'practice')
  assert.equal(go(e, T0 + LONG_BREAK_MS, 1).outcome, 'spaced')
})

test('assisted answers are recorded as practice and never advance initial or delayed stages', () => {
  assert.equal(go(introduce(T0, 0), T0 + LONG_BREAK_MS, 1, { assisted: true }).outcome, 'assisted')
  const { e, now } = familiar()
  const r = go(e, e.due! + REVEAL_QUIET_MS, 99, { assisted: true })
  assert.equal(r.outcome, 'assisted'); assert.equal(r.entry.lv, 2); assert.equal(r.entry.due, e.due)
  assert.ok(now > 0)
})

test('delayed review: one millisecond before the due time versus at it', () => {
  const { e } = familiar(); const due = e.due!
  const at = (t: number) => go({ ...e, reveal: 0 }, t, 99)
  assert.equal(at(due - 1).outcome, 'practice'); assert.equal(at(due - 1).entry.lv, 2)
  const r = at(due); assert.equal(r.outcome, 'advanced'); assert.equal(r.entry.lv, 3)
  assert.equal(r.entry.due, due + STAGE_INTERVAL_MS[3])
})

test('waits are elapsed time: midnight and daylight-saving shifts cannot bypass them', () => {
  const { e } = familiar(new Date(2026, 2, 28, 23, 59).getTime())     // just before local midnight, DST change the next night in many zones
  const justAfterMidnight = new Date(2026, 2, 29, 0, 1).getTime()
  assert.equal(go({ ...e, reveal: 0 }, justAfterMidnight, 99).outcome, 'practice')
  assert.equal(go({ ...e, reveal: 0 }, e.adv + 24 * H - 1, 99).outcome, 'practice')
  assert.equal(go({ ...e, reveal: 0 }, e.adv + 24 * H, 99).outcome, 'advanced')
})

test('an answer displayed recently cannot qualify as delayed retrieval', () => {
  const { e } = familiar(); const due = e.due!
  const shown = recordReveal(e, due - 60 * S)                        // details opened a minute before it was due
  assert.equal(go(shown, due, 99).outcome, 'practice')
  assert.equal(go(shown, due - 60 * S + REVEAL_QUIET_MS - 1, 99).outcome, 'practice')
  assert.equal(go(shown, due + REVEAL_QUIET_MS, 99).outcome, 'advanced')
  assert.equal(standing(shown, due, 99), 'other'); assert.equal(standing(shown, due + REVEAL_QUIET_MS, 99), 'due')
})

test('early practice does not postpone the due date and an overdue answer advances only once', () => {
  const { e } = familiar(); const due = e.due!
  const early = go({ ...e, reveal: 0 }, due - H, 99).entry
  assert.equal(early.due, due)
  const late = go({ ...e, reveal: 0 }, due + 40 * 24 * H, 99)
  assert.equal(late.entry.lv, 3)
  assert.equal(go(late.entry, due + 40 * 24 * H + S, 100).entry.lv, 3)  // an immediate second answer: not due again
  assert.equal(go(late.entry, due + 40 * 24 * H + S, 99).outcome, 'ignored')   // a replayed submission
})

test('stages 3 to 5 then maintenance stay at level 5 with a 30 day interval', () => {
  let { e } = familiar(); let seq = 100
  for (const lv of [3, 4, 5]) { const t = e.due!; const r = go({ ...e, reveal: 0 }, t, ++seq); assert.equal(r.entry.lv, lv); e = r.entry }
  assert.equal(e.due, e.adv + STAGE_INTERVAL_MS[5])
  const m1 = go({ ...e, reveal: 0 }, e.due!, ++seq)
  assert.equal(m1.outcome, 'maintained'); assert.equal(m1.entry.lv, 5); assert.equal(m1.entry.due, e.due! + MAINTENANCE_INTERVAL_MS)
  const m2 = go({ ...m1.entry, reveal: 0 }, m1.entry.due!, ++seq)
  assert.equal(m2.entry.lv, 5); assert.equal(m2.entry.due, m1.entry.due! + MAINTENANCE_INTERVAL_MS)
})

test('a miss in initial learning keeps earlier successes; the recovery answer is not an initial success', () => {
  let e = introduce(T0, 0), now = T0 + 30 * S
  e = go(e, now, 3).entry; assert.equal(e.ok, 1)
  const miss = go(e, now + 1, 4, { correct: false }); assert.equal(miss.outcome, 'lapse')
  e = miss.entry; assert.deepEqual([e.ok, e.lv, e.rel], [1, 1, 'relearn'])
  assert.equal(go(e, now + 40 * S, 5).outcome, 'practice')                // relearning gap not met (1 other answer)
  const rec = go(e, now + 40 * S, 7); assert.equal(rec.outcome, 'relearned'); assert.equal(rec.entry.ok, 1); assert.equal(rec.entry.rel, undefined)
  assert.equal(go(rec.entry, now + 41 * S, 20).outcome, 'practice')       // next initial credit still needs its own 90 s / 4 answers
})

test('lapse of an established word: one level down (floor 2), relearn, 24 h recheck, then at most one promotion', () => {
  let { e } = familiar(); e = { ...e, lv: 4, due: e.adv }
  const miss = go({ ...e, reveal: 0 }, e.adv + H, 50, { correct: false }); assert.equal(miss.entry.lv, 3)
  const again = go(miss.entry, e.adv + H + S, 51, { correct: false }); assert.equal(again.entry.lv, 3)   // repeated failures do not cascade
  const t = e.adv + 2 * H, rec = go(again.entry, t + 1_000_000, 55)
  assert.equal(rec.outcome, 'relearned'); assert.equal(rec.entry.lv, 3); assert.equal(rec.entry.rel, 'recheck'); assert.equal(rec.entry.due, t + 1_000_000 + RECHECK_MS)
  assert.equal(go({ ...rec.entry, reveal: 0 }, rec.entry.due! - 1, 60).entry.lv, 3)
  const chk = go({ ...rec.entry, reveal: 0 }, rec.entry.due!, 60)
  assert.equal(chk.outcome, 'rechecked'); assert.equal(chk.entry.lv, 4); assert.equal(chk.entry.rel, undefined); assert.equal(chk.entry.due, rec.entry.due! + STAGE_INTERVAL_MS[4])
  const floor = go({ ...familiar().e, reveal: 0 }, 1, 9, { correct: false }); assert.equal(floor.entry.lv, 2)
})

test('answers to non-promoting question kinds are recorded (with tone evidence) but never change the scheduler', () => {
  const { e } = familiar(); const due = e.due!
  const r = go({ ...e, reveal: 0 }, due, 99, { kind: 'meaning2pinyin', promotes: false, toneOk: true }); assert.equal(r.outcome, 'recorded'); assert.equal(r.entry.lv, 2); assert.equal(r.entry.due, due)
  const w = go(r.entry, due + S, 100, { kind: 'meaning2pinyin', promotes: false, toneOk: false, correct: false }); assert.equal(w.entry.lv, 2); assert.equal(w.entry.rel, undefined)
  assert.deepEqual([w.entry.kinds.meaning2pinyin!.n, w.entry.kinds.meaning2pinyin!.ok, w.entry.kinds.meaning2pinyin!.toneOk, w.entry.kinds.meaning2pinyin!.toneBad], [2, 1, 1, 1])
  assert.equal(w.entry.lastSeq, 100)
})

test('double submission with the same answer number produces one update', () => {
  const e = introduce(T0, 0), a = ans(T0 + 40 * S, 3), once = recordAnswer(e, a).entry
  const twice = recordAnswer(once, a); assert.equal(twice.outcome, 'ignored'); assert.equal(twice.entry, once); assert.equal(once.ok, 1)
})

test('standing and earnsCredit never loop: an entry with no spaced credit available is simply "other"', () => {
  const e = introduce(T0, 0)
  assert.equal(earnsCredit(e, T0 + S, 1), false); assert.equal(standing(e, T0 + 40 * S, 3), 'initial')
  assert.equal(standing(go(e, T0 + 40 * S, 3, { correct: false }).entry, T0 + 41 * S, 4), 'other')
})

test('sanitizeSched validates, preserves overdue dates and clamps future timestamps without instant promotion', () => {
  const now = T0, { e } = familiar(T0 - 10 * 24 * H)
  const keep = sanitizeSched(JSON.parse(JSON.stringify(e)), now, 1e6, KINDS)!; assert.equal(keep.due, e.due)       // overdue date preserved
  const future = sanitizeSched({ ...e, due: now + 400 * 24 * H, reveal: now + 99 * H, adv: now + 5 * H, g: { at: now + H, seq: 5, own: 1 } }, now, 1e6, KINDS)!
  assert.equal(future.due, now + STAGE_INTERVAL_MS[2]); assert.equal(future.reveal, now); assert.equal(future.adv, now); assert.equal(future.g.at, now)
  assert.equal(sanitizeSched(null, now, 1, KINDS), null); assert.equal(sanitizeSched([], now, 1, KINDS), null)
  const bad = sanitizeSched({ lv: 'x', ok: NaN, g: 5, due: 'soon', lastSeq: -4, kinds: { meaning: { n: 'a' }, nope: {} }, dims: { reading: { n: 4 } } }, now, 10, KINDS)!
  assert.deepEqual([bad.lv, bad.ok, bad.due, bad.lastSeq], [0, 0, null, 0]); assert.deepEqual(bad.kinds.meaning, { n: 0, ok: 0, last: 0, lastOk: 0, lastQual: 0 }); assert.deepEqual(Object.keys(bad.kinds), ['meaning'], 'unknown kinds and the old per-dimension data (dims) are dropped')
  assert.equal(sanitizeSched({ lv: 3, ok: 0, rel: 'recheck' }, now, 1, KINDS)!.due, now)                          // missing date on an established word: due now
  assert.equal(sanitizeSched({ lv: 1, ok: 9, rel: 'recheck' }, now, 1, KINDS)!.rel, 'relearn')                    // an initial word cannot be rechecking
  assert.equal(sanitizeSched({ lv: 1, lastSeq: 50 }, now, 10, KINDS)!.lastSeq, 10)                                // bounded by the save's sequence
})

test('legacy migration keeps levels, grants no credit and derives due dates from the old date at local noon', () => {
  const now = new Date(2026, 10, 10, 8, 0).getTime()
  assert.deepEqual([fromLegacyEntry({ lv: 0, ok: 0, at: '2026-11-09' }, now)!.ok, fromLegacyEntry({ lv: 1, ok: 1, at: '2026-11-09' }, now)!.ok, fromLegacyEntry({ lv: 4, ok: 0, at: '2026-11-09' }, now)!.ok], [0, 1, 3])
  const l3 = fromLegacyEntry({ lv: 3, ok: 0, at: '2026-11-08' }, now)!
  assert.equal(l3.lv, 3); assert.equal(l3.due, localNoon('2026-11-08')! + STAGE_INTERVAL_MS[3]); assert.equal(l3.lastSeq, 0); assert.deepEqual(l3.g, { at: now, seq: 0, own: 0 })
  const l5 = fromLegacyEntry({ lv: 5, ok: 0, at: '2026-11-01' }, now)!; assert.equal(l5.due, localNoon('2026-11-01')! + STAGE_INTERVAL_MS[5])
  const undated = fromLegacyEntry({ lv: 4, ok: 0 }, now)!; assert.deepEqual([undated.lv, undated.due], [4, now])             // due now, not promoted
  assert.equal(fromLegacyEntry({ lv: 5, ok: 0 }, now)!.lv, 4)                                                              // a level-5 word needs a date
  assert.equal(fromLegacyEntry({ lv: 3, ok: 0, at: '2099-01-01' }, now)!.due, now + STAGE_INTERVAL_MS[3])                 // future date clamped
  assert.equal(fromLegacyEntry({ lv: 3, ok: 0, at: '2026-02-30' }, now)!.due, now)                                          // invalid date
  assert.equal(fromLegacyEntry('x', now), null)
})

test('formatWait is derived from elapsed time', () => {
  assert.deepEqual([0, 30 * 60_000, 3 * H, 23.9 * H, 30 * H, 8 * 24 * H].map(formatWait), ['now', 'in under an hour', 'in 3 hours', 'in 1 day', 'in 1 day', 'in 8 days'])
})
