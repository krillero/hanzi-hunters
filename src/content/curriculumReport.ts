// Curriculum inventory: what the active (or any) curriculum teaches, in which order, and what is still unknown or unreviewed.
// Pure; used by tools/curriculum-report.ts (text) and tools/content-inventory.ts (JSON).
import type { CurriculaFile, Curriculum, OfficialLevel } from './types.ts'
import { readinessOf, stepsOf } from '../game/course.ts'

type RawEntry = { id?: string; hanzi?: string; pinyin?: string; meaning?: string; review?: { status?: string } }
const idOf = (w: RawEntry) => w.id ?? w.hanzi ?? ''

export type ReportRow = {
  order: number; entryId: string; hanzi: string; pinyin: string; meaning: string
  unit: string; lesson: string; lessonTitle: string; required: boolean
  prerequisiteEntries: string[]; prerequisiteLessons: string[]
  officialLevels: OfficialLevel[] | 'unknown'
  entryReview: string; missing: boolean
}

export function curriculumReport(c: Curriculum, words: RawEntry[], cloze: { id: string; review?: { status?: string }; prerequisiteEntries?: string[]; prerequisiteLessons?: string[] }[] = []) {
  const byId = new Map(words.map(w => [idOf(w), w]))
  const rows: ReportRow[] = stepsOf(c).map((s, i) => {
    const w = byId.get(s.intro.entryId)
    return {
      order: i + 1, entryId: s.intro.entryId, hanzi: w?.hanzi ?? '?', pinyin: w?.pinyin ?? '?', meaning: w?.meaning ?? '?',
      unit: s.unit.id, lesson: s.lesson.id, lessonTitle: s.lesson.title, required: s.required,
      prerequisiteEntries: s.intro.prerequisiteEntries ?? [], prerequisiteLessons: s.lesson.prerequisiteLessons ?? [],
      officialLevels: s.intro.officialLevels?.length ? s.intro.officialLevels : 'unknown',
      entryReview: w?.review?.status ?? 'none', missing: !w
    }
  })
  const inCourse = new Set(rows.map(r => r.entryId))
  return {
    id: c.id, title: c.title, version: c.version, provisional: !!c.provisional, readiness: readinessOf(c), review: c.review?.status ?? 'none',
    units: c.units.map(u => ({ id: u.id, title: u.title, lessons: u.lessons.map(l => ({ id: l.id, title: l.title, prerequisiteLessons: l.prerequisiteLessons ?? [], aliases: l.aliases ?? [], entries: l.introductions.map(i => i.entryId) })) })),
    order: rows,
    unmappedOfficialLevels: rows.filter(r => r.officialLevels === 'unknown').map(r => r.entryId),
    missingEntries: rows.filter(r => r.missing).map(r => r.entryId),
    outsideCurriculum: words.map(idOf).filter(id => !inCourse.has(id)),
    unreviewedEntries: rows.filter(r => r.entryReview !== 'human-reviewed').map(r => r.entryId),
    sentencesWithPrerequisites: cloze.filter(q => q.prerequisiteEntries?.length || q.prerequisiteLessons?.length).map(q => ({ id: q.id, entries: q.prerequisiteEntries ?? [], lessons: q.prerequisiteLessons ?? [] })),
    unreviewedSentences: cloze.filter(q => q.review?.status !== 'human-reviewed').map(q => q.id)
  }
}

export function curriculaReport(file: CurriculaFile, words: RawEntry[], cloze: Parameters<typeof curriculumReport>[2] = []) {
  return { default: file.default, curricula: file.curricula.map(c => curriculumReport(c, words, cloze)) }
}
