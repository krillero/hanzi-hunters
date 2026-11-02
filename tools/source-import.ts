// npm run source:import -- --source accc-anki --file path/to/package.apkg [--retrieved YYYY-MM-DD]
// Imports a local file with the adapter registered for the source in src/content/sources.json, into public/sources/<source>/.
// Safe to run again: unchanged records stay identical, changed/removed ones produce a diff and flag affected decisions.
import { importSource } from './sources/importer.ts'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] ?? ''), i++ }
const source = args.get('source'), file = args.get('file')
if (!source || !file) { console.error('usage: npm run source:import -- --source <id> --file <path> [--retrieved YYYY-MM-DD]'); process.exit(2) }
try {
  const r = importSource({ source, file, retrieved: args.get('retrieved') })
  const c = r.bundle.report.counts
  console.log(`Imported ${source} from ${r.bundle.snapshot.file} (sha256 ${r.bundle.snapshot.sha256.slice(0, 12)})`)
  console.log(Object.entries(c).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
  const p = Object.entries(r.bundle.report.problems)
  console.log(p.length ? `Problems: ${p.map(([k, l]) => `${k} ${l.length}`).join(', ')} (details: public/sources/${source}/report.md)` : 'Problems: none')
  console.log(r.snapshotChanged ? `Changes: +${r.diff.added.length} added, -${r.diff.removed.length} removed, ~${r.diff.changed.length} changed, ${r.diff.unchanged} unchanged` : 'Same snapshot as before: no changes.')
  if (r.flagged.length) console.log(`Flagged for reassessment:\n  ${r.flagged.join('\n  ')}`)
  if (r.orphanMedia) console.log(`${r.orphanMedia} media file(s) are no longer referenced by any record (kept; delete by hand if no recording uses them).`)
} catch (e) { console.error(`Import failed: ${(e as Error).message}`); process.exit(1) }
