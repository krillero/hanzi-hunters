// Generated files are never edited by hand, and never left stale. Each is produced by a script; edit the script's input and rerun
// it. These checks fail when a committed file differs from what its script produces now, or when imported source data was edited
// by hand (AGENTS rule 13). Found necessary: docs/content-inventory.json had silently gone stale until a docs audit.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordHash } from '../tools/sources/adapters/anki.ts'
import type { SourceIndex, SourceManifest, SourceRecord } from '../src/sources/types.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const run = (args: string[]) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } })

/** Generated files and the command that checks them (each command supports --check and says how to regenerate). */
const GENERATED: { file: string; check: string[] }[] = [
  { file: 'docs/content-inventory.json', check: ['tools/content-inventory.ts', '--check'] },
  { file: 'docs/proposals/xiehanzi-hsk1-records.md', check: ['tools/source-assess.ts', 'report', '--source', 'xiehanzi-new-hsk-2025-v24', '--out', 'docs/proposals/xiehanzi-hsk1-records.md', '--check'] }
]

for (const g of GENERATED) {
  test(`${g.file} is what its script produces now`, () => {
    const r = run(g.check)
    assert.equal(r.status, 0, (r.stderr || r.stdout).trim())
  })
}

test('every generated proposal table is listed above', () => {
  const tables = readdirSync(join(root, 'docs/proposals')).filter(f => f.endsWith('-records.md')).map(f => `docs/proposals/${f}`)
  for (const t of tables) assert.ok(GENERATED.some(g => g.file === t), `${t} has no staleness check`)
})

const read = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T
const index = read<SourceIndex>('public/sources/index.json')

test('the source index lists exactly the imported sources, with their snapshots and record counts', () => {
  const dirs = readdirSync(join(root, 'public/sources'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  assert.deepEqual(index.sources.map(s => s.id).sort(), dirs)
  for (const s of index.sources) {
    const manifest = read<SourceManifest>(`public/sources/${s.id}/manifest.json`)
    const records = read<{ snapshot: string; records: SourceRecord[] }>(`public/sources/${s.id}/records.json`)
    assert.equal(manifest.snapshot.sha256, s.snapshot, s.id)
    assert.equal(records.snapshot, s.snapshot, s.id)
    assert.equal(records.records.length, s.records, s.id)
    assert.equal(manifest.counts.records, s.records, s.id)
  }
})

test('imported records were not edited by hand: every hash matches the record\'s fields and media', () => {
  for (const s of index.sources) {
    const manifest = read<SourceManifest>(`public/sources/${s.id}/manifest.json`)
    if (!manifest.adapter.startsWith('anki')) continue   // the hash rule is the Anki adapter's
    const edited = read<{ records: SourceRecord[] }>(`public/sources/${s.id}/records.json`).records.filter(r => recordHash(r.fields, r.media) !== r.hash)
    assert.deepEqual(edited.map(r => r.key).slice(0, 5), [], `${s.id}: re-run npm run source:import instead of editing public/sources`)
  }
})

test('committed media files are what their names say (named by content hash)', () => {
  for (const s of index.sources) {
    const dir = join(root, 'public/sources', s.id, 'media')
    if (!existsSync(dir)) continue   // local-only sources have no committed media
    const wrong = readdirSync(dir).filter(f => !createHash('sha256').update(readFileSync(join(dir, f))).digest('hex').startsWith(f.split('.')[0]))
    assert.deepEqual(wrong.slice(0, 5), [], s.id)
  }
})
