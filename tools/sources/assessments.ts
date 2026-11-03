// Assessment files on disk: src/content/assessments/<source>.json (one per source). See docs/SOURCES.md §5a.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { emptyAssessments, upgradeAssessments, type AssessmentContext, type AssessmentsFile } from '../../src/sources/assessment.ts'
import type { SentenceItem, SourceRecord } from '../../src/sources/types.ts'
import type { Explanation, Word } from '../../src/content/types.ts'
import { CONTENT, readJson, readStoredSource, writeJson } from './files.ts'

export const ASSESSMENTS_DIR = join(CONTENT, 'assessments')
export const assessmentsPath = (source: string, dir = ASSESSMENTS_DIR) => join(dir, `${source}.json`)
export const assessedSources = (dir = ASSESSMENTS_DIR) => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort() : [])
export function readAssessments(source: string, dir = ASSESSMENTS_DIR): AssessmentsFile {
  const p = assessmentsPath(source, dir)
  return existsSync(p) ? upgradeAssessments(readJson<AssessmentsFile>(p)) : emptyAssessments(source)
}
export const writeAssessments = (source: string, f: AssessmentsFile, dir = ASSESSMENTS_DIR) => writeJson(assessmentsPath(source, dir), { ...f, source })

export type SourceContext = AssessmentContext & { sentences: Map<string, SentenceItem>; recordList: SourceRecord[] }
export function sourceContext(source: string, words: Word[], explanations: Record<string, Explanation | undefined>): SourceContext | null {
  const s = readStoredSource(source)
  if (!s) return null
  const sentences = new Map(s.content.filter((c): c is SentenceItem => c.type === 'sentence').map(c => [c.id, c]))
  return { records: new Map(s.records.map(r => [r.key, r])), recordList: s.records, words, explanations, sentences }
}
