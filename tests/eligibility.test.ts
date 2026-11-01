// Exercises stay aligned with learning progress: sentence prerequisites, too few safe distractors, per-entry restrictions.
import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import { CLOZE } from '../src/content/index.ts'
import { normalizeWords } from '../src/content/entries.ts'
import type { ClozeItem, Curriculum, RawWord } from '../src/content/types.ts'
import { emptyCourse, recordPeaks, sentencePrereqsMet, syncCourse, wordMap, type CourseState, type PeakLevels } from '../src/game/course.ts'
import { MIN_CHOICES, buildQuestion, clozeFor, isFairQuestion, tryBuildQuestion, type QKind } from '../src/game/questions.ts'
import type { Mastery } from '../src/game/types.ts'

const by = (id: string) => WORDS.find(w => w.id === id)!
const ma = by('吗')
const base = CLOZE.find(c => c.answer === '吗')!
const gated: ClozeItem = { ...base, id: 'ma-gated', prerequisiteEntries: ['你', '是'], prerequisiteLessons: ['people-2'] }
const known = new Set(WORDS.map(w => w.id))
const c: Curriculum = { id: 't', version: 1, title: 'T', units: [{ id: 'u', title: 'U', lessons: [
  { id: 'people-1', title: 'p1', introductions: [{ entryId: '你' }] }, { id: 'people-2', title: 'p2', introductions: [{ entryId: '是' }, { entryId: '吗' }] }] }] }
const st = (m: Mastery, p = emptyCourse(), peak: PeakLevels = recordPeaks({}, m)): CourseState => ({ curriculum: c, mastery: m, progress: p, words: wordMap(WORDS), peak })

test('an authored sentence is only assessed once its prerequisite entries and lessons are satisfied', () => {
  const early: Mastery = { 你: { lv: 1, ok: 0 }, 是: { lv: 0, ok: 0 }, 吗: { lv: 0, ok: 1 } }
  const check = (m: Mastery, p = emptyCourse()) => (item: ClozeItem) => sentencePrereqsMet(item, st(m, p))
  assert.equal(sentencePrereqsMet(gated, st(early)), false)
  assert.deepEqual(clozeFor(ma, { cloze: [gated], clozeEligible: check(early) }), [])
  for (let k = 0; k < 40; k++) {
    const q = tryBuildQuestion(ma, early.吗, WORDS, { kind: 'particle', cloze: [gated], clozeEligible: check(early), known })
    assert.ok(q && q.kind !== 'particle', 'another eligible kind is asked instead')
    assert.equal(q!.kind, 'meaning', 'particles may only be asked meaning or particle')
  }
  const later: Mastery = { 你: { lv: 1, ok: 0 }, 是: { lv: 1, ok: 0 }, 吗: { lv: 1, ok: 0 } }
  const p = syncCourse(c, later, emptyCourse())
  assert.equal(sentencePrereqsMet(gated, st(later, p)), true)
  const q = tryBuildQuestion(ma, later.吗, WORDS, { kind: 'particle', cloze: [gated], clozeEligible: check(later, p), known })
  assert.equal(q?.kind, 'particle'); assert.equal(q?.cloze?.itemId, 'ma-gated')
  // a completed prerequisite lesson stays satisfied after mistakes (no relocking)
  const forgot: Mastery = { 你: { lv: 1, ok: 0 }, 是: { lv: 0, ok: 0 }, 吗: { lv: 1, ok: 0 } }
  assert.equal(sentencePrereqsMet(gated, st(forgot, p, recordPeaks({}, later))), true, '是 earned readiness before the mistake')
})

test('without an eligibility check, only sentences that declare no prerequisites are assessed (safe default)', () => {
  // Use an explicitly ungated fixture: shipped exercises may legitimately have prerequisites.
  const ungated: ClozeItem = { ...base, id: 'ma-ungated', prerequisiteEntries: [], prerequisiteLessons: [] }
  assert.deepEqual(clozeFor(ma, { cloze: [gated, ungated] }).map(x => x.id), [ungated.id])
})

test('too few safe distractors: another valid kind, or no question at all; never a one-option question', () => {
  const raw = (h: string, p: string, m: string, extra: Partial<RawWord> = {}): RawWord => ({ hanzi: h, pinyin: p, meaning: m, group: 'g', note: 'n', ...extra })
  const two = normalizeWords([raw('人', 'rén', 'person'), raw('大', 'dà', 'big')])
  for (const kind of ['meaning', 'character', 'pinyin2char'] as QKind[]) {
    const q = tryBuildQuestion(two[0], { lv: 2, ok: 0 }, two, { kind })
    assert.equal(q?.kind, 'pinyin', `${kind}: only one wrong option exists, so the tone question (4 safe options) is asked instead`)
    assert.ok(isFairQuestion(q!))
  }
  assert.equal(tryBuildQuestion(two[0], undefined, two), null, 'no intro question with a single wrong option')
  const narrow = normalizeWords([raw('人', 'rén', 'person', { questions: ['meaning', 'character'] }), raw('大', 'dà', 'big')])
  assert.equal(tryBuildQuestion(narrow[0], { lv: 2, ok: 0 }, narrow), null, 'no allowed kind is fair: no question (the caller picks another entry)')
  assert.throws(() => buildQuestion(narrow[0], { lv: 1, ok: 0 }, narrow), /No fair question/)
  const three = normalizeWords([raw('人', 'rén', 'person'), raw('大', 'dà', 'big'), raw('小', 'xiǎo', 'small')])
  const q = tryBuildQuestion(three[0], { lv: 1, ok: 0 }, three, { kind: 'meaning' })
  assert.ok(q && q.options.length >= MIN_CHOICES && isFairQuestion(q))
})

test('per-entry eligibility is never bypassed by the fallback', () => {
  const raw = (h: string, p: string, m: string, extra: Partial<RawWord> = {}): RawWord => ({ hanzi: h, pinyin: p, meaning: m, group: 'g', note: 'n', ...extra })
  // only pinyin questions allowed, but a two-syllable word has no safe wrong readings here: no question, not a meaning question
  const ws = normalizeWords([raw('朋友', 'péngyou', 'friend', { neutral: [2], questions: ['pinyin'] }), raw('人', 'rén', 'person'), raw('大', 'dà', 'big'), raw('小', 'xiǎo', 'small')])
  assert.equal(tryBuildQuestion(ws[0], { lv: 2, ok: 0 }, ws), null)
  // with authored wrong readings it works, and stays a pinyin question
  const ok = normalizeWords([raw('朋友', 'péngyou', 'friend', { neutral: [2], questions: ['pinyin'], wrongPinyin: ['péngyǒu', 'pēngyou', 'pěngyou'] }), raw('人', 'rén', 'person')])
  assert.equal(tryBuildQuestion(ok[0], { lv: 2, ok: 0 }, ok)?.kind, 'pinyin')
})

test('every shipped entry still gets a fair question at every level (no regressions from the fairness check)', () => {
  const k = new Set(WORDS.map(w => w.id))
  for (const w of WORDS) for (const lv of [0, 1, 2, 3, 4]) {
    const q = tryBuildQuestion(w, { lv, ok: lv === 0 ? 0 : 1 }, WORDS, { known: k, cloze: CLOZE, canListen: true })
    assert.ok(q && isFairQuestion(q), `${w.id} lv${lv}`)
  }
})
