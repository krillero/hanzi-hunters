// The reusable import pipeline: adapter -> validation -> stored source files -> diff -> reassessment flags.
// Idempotent: importing the same file twice produces the same files (records are keyed, media is named by content hash).
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateBundle } from '../../src/sources/bundle.ts'
import { flagReassessment } from '../../src/sources/changeset.ts'
import type { ImportDiff, SourceBundle, SourceIndex, SourceManifest } from '../../src/sources/types.ts'
import { ADAPTERS } from './adapters/index.ts'
import { CONTENT, SOURCES_DIR, readIndex, readJson, readRepoState, readSources, readStoredSource, sourceState, writeJson, writeJsonLines, writeRepoState } from './files.ts'

export type ImportOptions = { source: string; file: string; retrieved?: string; sourcesDir?: string; contentDir?: string }
export type ImportResult = { bundle: SourceBundle; diff: ImportDiff; snapshotChanged: boolean; flagged: string[]; orphanMedia: number; bundleErrors: string[] }

export function computeDiff(prev: { snapshot: string; hashes: Map<string, string> } | null, bundle: SourceBundle): Omit<ImportDiff, 'flagged'> {
  const now = new Map(bundle.records.map(r => [r.key, r.hash]))
  const added: string[] = [], changed: string[] = [], removed: string[] = []
  let unchanged = 0
  for (const [k, h] of now) { const p = prev?.hashes.get(k); if (p === undefined) added.push(k); else if (p !== h) changed.push(k); else unchanged++ }
  for (const k of prev?.hashes.keys() ?? []) if (!now.has(k)) removed.push(k)
  return { from: prev?.snapshot ?? null, to: bundle.snapshot.sha256, added, removed, changed, unchanged }
}

export function reportMarkdown(b: SourceBundle, diff: ImportDiff | null): string {
  const lines = [`# Import report: ${b.source}`, '', `- Adapter: ${b.adapter}`, `- File: ${b.snapshot.file} (${b.snapshot.bytes} bytes)`, `- Snapshot sha256: ${b.snapshot.sha256}`]
  if (b.snapshot.retrieved) lines.push(`- Retrieved: ${b.snapshot.retrieved}`)
  for (const [k, v] of Object.entries(b.snapshot.detail ?? {})) lines.push(`- ${k}: ${v}`)
  lines.push('', '## Counts', '', '| | |', '|---|---|', ...Object.entries(b.report.counts).map(([k, v]) => `| ${k} | ${v} |`))
  lines.push('', '## Checks that ran', '', ...b.report.checksRan.map(c => `- ${c}`), '', '## Not checked', '', ...b.report.notChecked.map(c => `- ${c}`))
  lines.push('', '## Problems', '')
  const kinds = Object.entries(b.report.problems)
  if (!kinds.length) lines.push('None.')
  for (const [k, list] of kinds) { lines.push(`### ${k} (${list.length})`, '', ...list.slice(0, 40).map(x => `- ${x}`)); if (list.length > 40) lines.push(`- … ${list.length - 40} more in report.json`); lines.push('') }
  if (diff) lines.push('', '## Changes since the previous snapshot', '', `- from ${diff.from ?? '(none)'}`, `- added ${diff.added.length}, removed ${diff.removed.length}, changed ${diff.changed.length}, unchanged ${diff.unchanged}`, `- decisions flagged for reassessment: ${diff.flagged.length}`)
  return lines.join('\n') + '\n'
}

export function importSource(o: ImportOptions): ImportResult {
  const sourcesDir = o.sourcesDir ?? SOURCES_DIR, contentDir = o.contentDir ?? CONTENT
  const sources = readSources(contentDir)
  const info = sources[o.source]
  if (!info) throw new Error(`"${o.source}" is not in sources.json: register it there first (title, url, license, attribution, adapter, reuse)`)
  if (!info.adapter || !ADAPTERS[info.adapter]) throw new Error(`source "${o.source}" has no known "adapter" (known: ${Object.keys(ADAPTERS).join(', ')})`)
  const dir = join(sourcesDir, o.source)
  mkdirSync(dir, { recursive: true })
  const prev = readStoredSource(o.source, sourcesDir)
  const prevManifest = prev?.manifest
  const retrieved = o.retrieved ?? (prevManifest?.snapshot.retrieved)
  const bundle = ADAPTERS[info.adapter]({ source: o.source, file: o.file, mediaDir: join(dir, 'media'), mediaPrefix: `sources/${o.source}/media`, retrieved })
  const repo = readRepoState(contentDir)
  const bundleErrors = validateBundle(bundle, new Set(repo.words.map(w => w.id ?? w.hanzi)))
  if (bundleErrors.length) throw new Error(`the adapter output is invalid:\n- ${bundleErrors.slice(0, 20).join('\n- ')}`)

  const base = computeDiff(prev ? { snapshot: prevManifest!.snapshot.sha256, hashes: new Map(prev.records.map(r => [r.key, r.hash])) } : null, bundle)
  const snapshotChanged = !prev || prevManifest!.snapshot.sha256 !== bundle.snapshot.sha256 || base.added.length + base.removed.length + base.changed.length > 0

  // Stored source files (all deterministic: no timestamps besides the declared retrieval date).
  const manifest: SourceManifest = { schemaVersion: bundle.schemaVersion, source: bundle.source, adapter: bundle.adapter, snapshot: bundle.snapshot, counts: bundle.report.counts }
  writeJson(join(dir, 'manifest.json'), manifest)
  writeJsonLines(join(dir, 'records.json'), 'records', { schemaVersion: bundle.schemaVersion, source: bundle.source, snapshot: bundle.snapshot.sha256 }, bundle.records)
  if (bundle.content.length || bundle.exercises.length) {
    const lines = (xs: unknown[]) => xs.map(x => JSON.stringify(x)).join(',\n')
    writeFileSync(join(dir, 'content.json'), `{"schemaVersion":${bundle.schemaVersion},"source":${JSON.stringify(bundle.source)},\n"content": [\n${lines(bundle.content)}\n],\n"exercises": [\n${lines(bundle.exercises)}\n]}\n`)
  }
  writeJson(join(dir, 'report.json'), bundle.report)
  // Source placement (book / lesson) as a DRAFT course proposal. Never referenced by curricula.json; nothing is activated.
  const placed = bundle.records.filter(r => r.placement?.book !== undefined)
  if (placed.length) {
    const books = new Map<number, Map<number, string[]>>()
    for (const r of placed) { const b = books.get(r.placement!.book!) ?? new Map<number, string[]>(); books.set(r.placement!.book!, b); b.set(r.placement!.lesson ?? 0, [...(b.get(r.placement!.lesson ?? 0) ?? []), r.key]) }
    writeJson(join(dir, 'placement.json'), {
      schemaVersion: bundle.schemaVersion, source: bundle.source, status: 'draft-proposal',
      note: 'The source\'s own book/lesson order, as source-record keys. A proposal only: courses reference game entry ids in src/content/curricula.json.',
      books: [...books].sort((a, b) => a[0] - b[0]).map(([book, ls]) => ({ book, lessons: [...ls].sort((a, b) => a[0] - b[0]).map(([lesson, records]) => ({ lesson, records })) }))
    })
  }

  // Committed decisions whose record changed or vanished are flagged, never deleted.
  const flag = flagReassessment(repo, sourceState({ manifest, records: bundle.records, content: [], exercises: [] }))
  writeRepoState(flag.state, repo, contentDir)
  const diff: ImportDiff = { ...base, flagged: flag.flagged }
  if (snapshotChanged) writeJson(join(dir, 'diff.json'), { ...diff, added: diff.added, removed: diff.removed, changed: diff.changed })
  writeFileSync(join(dir, 'report.md'), reportMarkdown(bundle, snapshotChanged ? diff : (existsSync(join(dir, 'diff.json')) ? readJson<ImportDiff>(join(dir, 'diff.json')) : null)))

  const index: SourceIndex = readIndex(sourcesDir)
  const entry = { id: bundle.source, title: info.title, snapshot: bundle.snapshot.sha256, records: bundle.records.length }
  index.sources = [...index.sources.filter(s => s.id !== bundle.source), entry].sort((a, b) => a.id.localeCompare(b.id))
  writeJson(join(sourcesDir, 'index.json'), index)

  // Media files no record references any more (kept: selected recordings may still use them).
  const used = new Set(bundle.records.flatMap(r => r.media.map(m => m.path?.split('/').pop())).filter(Boolean))
  const mediaDir = join(dir, 'media')
  const orphanMedia = existsSync(mediaDir) ? readdirSync(mediaDir).filter(f => !used.has(f)).length : 0
  return { bundle, diff, snapshotChanged, flagged: flag.flagged, orphanMedia, bundleErrors }
}
