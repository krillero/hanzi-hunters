// File locations of the source layer and the committed decision files, shared by the source tools. See docs/SOURCES.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RawWord, Sources } from '../../src/content/types.ts'
import type { RepoState, SourceState } from '../../src/sources/changeset.ts'
import type { ContentItem, Exercise, ImportReport, SourceIndex, SourceManifest, SourceRecord } from '../../src/sources/types.ts'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const CONTENT = join(ROOT, 'src/content')
/** Imported sources live under public/ so the hosted review screen can fetch them (they are not part of the game bundle). */
export const PUBLIC = join(ROOT, 'public')
export const SOURCES_DIR = join(PUBLIC, 'sources')
export const sourceDir = (id: string) => join(SOURCES_DIR, id)

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
/** Stable, reviewable JSON: 2-space indent, trailing newline, original key order. */
export const writeJson = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
/** Large generated data: one array element per line keeps diffs small and the file compact. */
export function writeJsonLines(path: string, key: string, head: Record<string, unknown>, items: unknown[]) {
  const body = items.map(x => JSON.stringify(x)).join(',\n')
  const top = JSON.stringify(head).slice(0, -1)
  writeFileSync(path, `${top}${Object.keys(head).length ? ',' : ''}\n"${key}": [\n${body}\n]}\n`)
}

export function readRepoState(dir = CONTENT): RepoState {
  return {
    words: readJson<RawWord[]>(join(dir, 'words.json')),
    mappings: readJson(join(dir, 'sourceMappings.json')),
    recordings: readJson(join(dir, 'recordings.json')),
    selections: readJson(join(dir, 'selections.json'))
  }
}
export function writeRepoState(s: RepoState, before: RepoState, dir = CONTENT) {
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  if (changed(s.words, before.words)) writeJson(join(dir, 'words.json'), s.words)
  if (changed(s.mappings, before.mappings)) writeJson(join(dir, 'sourceMappings.json'), s.mappings)
  if (changed(s.recordings, before.recordings)) writeJson(join(dir, 'recordings.json'), s.recordings)
  if (changed(s.selections, before.selections)) writeJson(join(dir, 'selections.json'), s.selections)
}
export const readSources = (dir = CONTENT) => readJson<Sources>(join(dir, 'sources.json'))

export type StoredSource = { manifest: SourceManifest; records: SourceRecord[]; content: ContentItem[]; exercises: Exercise[]; report?: ImportReport }
export function readStoredSource(id: string, base = SOURCES_DIR): StoredSource | null {
  const dir = join(base, id)
  if (!existsSync(join(dir, 'manifest.json'))) return null
  const manifest = readJson<SourceManifest>(join(dir, 'manifest.json'))
  const records = readJson<{ records: SourceRecord[] }>(join(dir, 'records.json')).records
  const extra = existsSync(join(dir, 'content.json')) ? readJson<{ content?: ContentItem[]; exercises?: Exercise[] }>(join(dir, 'content.json')) : {}
  return { manifest, records, content: extra.content ?? [], exercises: extra.exercises ?? [] }
}
export const sourceState = (s: StoredSource): SourceState => ({ source: s.manifest.source, snapshot: s.manifest.snapshot.sha256, records: new Map(s.records.map(r => [r.key, r])) })
export const readIndex = (base = SOURCES_DIR): SourceIndex => existsSync(join(base, 'index.json')) ? readJson<SourceIndex>(join(base, 'index.json')) : { schemaVersion: 1, sources: [] }
