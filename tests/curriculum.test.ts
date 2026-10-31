// curricula.json validation (content/validateCurriculum.ts via validateContent) and the shipped compatibility curriculum.
import test from 'node:test'
import assert from 'node:assert/strict'
import wordsJson from '../src/content/words.json' with { type: 'json' }
import explanationsJson from '../src/content/explanations.json' with { type: 'json' }
import clozeJson from '../src/content/cloze.json' with { type: 'json' }
import sourcesJson from '../src/content/sources.json' with { type: 'json' }
import curriculaJson from '../src/content/curricula.json' with { type: 'json' }
import { validateContent } from '../src/content/validate.ts'
import { curriculumReport } from '../src/content/curriculumReport.ts'
import { ACTIVE_CURRICULUM, CURRICULA, CURRICULA_FILE, WORDS } from '../src/data.ts'
import { stepsOf } from '../src/game/course.ts'
import type { Curriculum } from '../src/content/types.ts'

const W = ['人', '大', '小', '水', '火'].map(h => ({ hanzi: h, pinyin: { 人: 'rén', 大: 'dà', 小: 'xiǎo', 水: 'shuǐ', 火: 'huǒ' }[h], meaning: h, group: 'g', note: 'n' }))
const S = { HSK: { title: 'HSK', license: 'x', attribution: 'x' }, 'ai-draft': { title: 'a', license: 'x', attribution: 'x' } }
const lesson = (id: string, entries: unknown[], extra: object = {}) => ({ id, title: id, introductions: entries.map(e => (typeof e === 'string' ? { entryId: e } : e)), ...extra })
const curr = (lessons: unknown[], extra: object = {}) => ({ id: 'c1', version: 1, title: 'C', units: [{ id: 'u1', title: 'U', lessons }], ...extra })
const file = (...cs: unknown[]) => ({ default: 'c1', curricula: cs })
const run = (f: unknown, cloze: unknown[] = []) => validateContent(W, {}, cloze, S, f)
const errs = (f: unknown, cloze: unknown[] = []) => run(f, cloze).errors.join('\n')

test('the shipped curricula have no errors and no inferred official levels', () => {
  const r = validateContent(wordsJson, explanationsJson, clozeJson, sourcesJson, curriculaJson)
  assert.deepEqual(r.errors, [])
  assert.ok(stepsOf(ACTIVE_CURRICULUM).length > 0)
})

test('the compatibility course (while shipped) covers the existing vocabulary and is marked provisional', t => {
  const compat = CURRICULA.find(c => c.id === 'starter-compat')
  if (!compat) return t.skip('starter-compat was replaced by a curated course')
  assert.equal(compat.provisional, true)
  assert.notEqual(compat.review?.status, 'human-reviewed')
  assert.ok(stepsOf(compat).every(s => !s.intro.officialLevels), 'no official level is inferred')
  for (const w of WORDS) assert.ok(stepsOf(compat).some(s => s.intro.entryId === w.id) || CURRICULA_FILE.default !== 'starter-compat', `${w.id} is playable`)
})

test('a minimal valid curriculum passes; an entry may appear in several curricula', () => {
  const two = file(curr([lesson('l1', ['人', '大'])]), { ...curr([lesson('l1', ['大', '人'])]), id: 'c2' })
  assert.deepEqual(run(two).errors, [])
})

test('missing vocabulary references, duplicate ids and duplicate introductions', () => {
  assert.match(errs(file(curr([lesson('l1', ['人', '龙'])]))), /"龙" is not an entry id in words.json \(missing vocabulary reference\)/)
  assert.match(errs(file(curr([lesson('l1', ['人']), lesson('l1', ['大'])]))), /duplicate lesson id "l1"/)
  assert.match(errs(file({ ...curr([lesson('l1', ['人'])]), units: [{ id: 'u', title: 'U', lessons: [lesson('a', ['人'])] }, { id: 'u', title: 'V', lessons: [lesson('b', ['大'])] }] })), /duplicate unit id "u"/)
  assert.match(errs(file(curr([lesson('l1', ['人']), lesson('l2', ['大', '人'])]))), /"人" is already introduced/)
  assert.match(errs(file(curr([lesson('l1', ['人'])]), curr([lesson('l1', ['大'])]))), /duplicate curriculum id "c1"/)
})

test('unknown prerequisites, self-dependencies, cycles and unreachable sequences', () => {
  assert.match(errs(file(curr([lesson('l1', ['人'], { prerequisiteLessons: ['nope'] })]))), /prerequisite lesson "nope" is not a lesson/)
  assert.match(errs(file(curr([lesson('l1', ['人'], { prerequisiteLessons: ['l1'] })]))), /lists itself as a prerequisite lesson/)
  assert.match(errs(file(curr([lesson('l1', [{ entryId: '人', prerequisiteEntries: ['人'] }])]))), /lists itself as a prerequisite entry/)
  assert.match(errs(file(curr([lesson('l1', [{ entryId: '人', prerequisiteEntries: ['龙'] }])]))), /prerequisite entry "龙" is not an entry id/)
  const cyc = errs(file(curr([lesson('a', ['人'], { prerequisiteLessons: ['b'] }), lesson('b', ['大'], { prerequisiteLessons: ['a'] })])))
  assert.match(cyc, /prerequisite cycle between lessons/)
  assert.doesNotMatch(cyc, /undefined/)
  assert.match(errs(file(curr([lesson('a', ['人'], { prerequisiteLessons: ['b'] }), lesson('b', ['大'])]))), /comes later in the curriculum/)
  assert.match(errs(file(curr([lesson('a', [{ entryId: '人', prerequisiteEntries: ['大'] }, '大'])]))), /introduced later; the declared sequence cannot be followed/)
  const never = errs(file(curr([lesson('a', [{ entryId: '人', prerequisiteEntries: ['水'] }, '大'])])))
  assert.match(never, /"水" is never introduced in this curriculum, so "人" is unreachable/)
})

test('empty or malformed required fields and invalid versions', () => {
  assert.match(errs(file(curr([lesson('l1', ['人'])], { version: 0 }))), /"version" must be a positive integer/)
  assert.match(errs(file(curr([lesson('l1', ['人'])], { version: 1.5 }))), /"version" must be a positive integer/)
  assert.match(errs(file(curr([lesson('l1', ['人'])], { version: '2' }))), /"version" must be a positive integer/)
  assert.match(errs(file(curr([lesson('l1', ['人'])], { title: '' }))), /"title" must be a non-empty string/)
  assert.match(errs(file(curr([lesson('L 1', ['人'])]))), /lowercase letters, digits and dashes/)
  assert.match(errs(file(curr([lesson('l1', [])]))), /"introductions" must be a non-empty array/)
  assert.match(errs(file(curr([]))), /"lessons" must be a non-empty array/)
  assert.match(errs(file(curr([lesson('l1', ['人'])], { rank: 3 }))), /unknown field "rank"/)
  assert.match(errs(file(curr([lesson('l1', [{ entryId: '人', order: 2 }])]))), /unknown field "order"/)
  assert.match(errs(file(curr([lesson('l1', ['人'])], { readiness: { minLevel: 9 } }))), /"readiness" must be/)
  assert.match(errs({ default: 'zz', curricula: [curr([lesson('l1', ['人'])])] }), /"default" is "zz", which is not a curriculum id/)
  assert.match(errs({ curricula: [] }), /non-empty array/)
  assert.match(errs('nope'), /must be an object/)
})

test('official-level mappings need source, exact edition and level; missing mappings are only reported', () => {
  const m = (o: object) => errs(file(curr([lesson('l1', [{ entryId: '人', officialLevels: [o] }])])))
  assert.match(m({ source: 'HSK', level: '1' }), /"edition" is required/)
  assert.match(m({ source: 'HSK', edition: 'HSK 3.0 (2021)' }), /"level" is required/)
  assert.match(m({ edition: 'HSK 3.0 (2021)', level: '1' }), /"source" is required/)
  assert.match(m({ source: 'Nope', edition: 'x', level: '1' }), /not registered in sources.json/)
  assert.equal(m({ source: 'HSK', edition: 'HSK 3.0 (2021)', level: '1' }), '')
  const r = run(file(curr([lesson('l1', ['人', '大'])])))
  assert.match(r.info.join('\n'), /2 of 2 introductions have no official-level mapping/)
})

test('vocabulary outside the active curriculum is informational, not an error', () => {
  const r = run(file(curr([lesson('l1', ['人'])])))
  assert.deepEqual(r.errors, [])
  assert.match(r.info.join('\n'), /4 entries are not in the active curriculum "c1".*大 小 水 火/)
})

test('sentence-question prerequisites must reference real entries and lessons', () => {
  const f = file(curr([lesson('l1', ['人', '大'])]))
  const base = { id: 'q', answer: 'x', zh: 'a___', pinyin: 'a ___', en: 'e', options: [], why: {}, review: { status: 'ai-draft' } }
  assert.match(errs(f, [{ ...base, prerequisiteEntries: ['龙'] }]), /prerequisite entry "龙" is not an entry id/)
  assert.match(errs(f, [{ ...base, prerequisiteLessons: ['zz'] }]), /prerequisite lesson "zz" is not a lesson in any curriculum/)
  assert.doesNotMatch(errs(f, [{ ...base, prerequisiteEntries: ['人'], prerequisiteLessons: ['l1'] }]), /prerequisite/)
  assert.match(run(f, [{ ...base, prerequisiteEntries: ['水'] }]).warnings.join('\n'), /not in the active curriculum/)
})

test('the inventory report lists order, membership, prerequisites, unmapped levels and outside entries', () => {
  const c = curr([lesson('l1', ['人', { entryId: '大', prerequisiteEntries: ['人'], officialLevels: [{ source: 'HSK', edition: 'HSK 3.0 (2021)', level: '1' }] }], { prerequisiteLessons: [] })]) as unknown as Curriculum
  const r = curriculumReport(c, W, [])
  assert.deepEqual(r.order.map(x => [x.order, x.entryId, x.lesson]), [[1, '人', 'l1'], [2, '大', 'l1']])
  assert.deepEqual(r.order[1].prerequisiteEntries, ['人'])
  assert.deepEqual(r.unmappedOfficialLevels, ['人'])
  assert.deepEqual(r.outsideCurriculum, ['小', '水', '火'])
  assert.deepEqual(r.unreviewedEntries, ['人', '大'])
})
