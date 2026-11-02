// npm run source:apply -- changeset.json [--dry-run]
// Validates a changeset exported by the review screen against the current import and the current game content, shows the
// proposed changes, and (unless --dry-run) writes them to src/content. All or nothing: any stale or conflicting op stops it.
// The resulting content must pass the normal content validation; otherwise nothing is written.
import { readFileSync } from 'node:fs'
import { applyChangeset, checkChangesetShape } from '../src/sources/changeset.ts'
import { validateContent } from '../src/content/validate.ts'
import { validateDecisions } from '../src/sources/validate.ts'
import type { Changeset } from '../src/sources/types.ts'
import { CONTENT, readJson, readRepoState, readSources, readStoredSource, sourceState, writeRepoState } from './sources/files.ts'
import { join } from 'node:path'

const file = process.argv.slice(2).find(a => !a.startsWith('--'))
const dry = process.argv.includes('--dry-run')
if (!file) { console.error('usage: npm run source:apply -- <changeset.json> [--dry-run]'); process.exit(2) }
let cs: Changeset
try { cs = JSON.parse(readFileSync(file, 'utf8')) as Changeset } catch (e) { console.error(`Cannot read ${file}: ${(e as Error).message}`); process.exit(1) }
const shape = checkChangesetShape(cs)
if (shape.length) { console.error(`Not a valid changeset:\n- ${shape.join('\n- ')}`); process.exit(1) }
const stored = readStoredSource(cs.source)
if (!stored) { console.error(`Source "${cs.source}" has not been imported (public/sources/${cs.source}).`); process.exit(1) }
const before = readRepoState()
const res = applyChangeset(before, cs, sourceState(stored))
console.log(`Changeset by ${cs.reviewer}, ${cs.createdAt}, ${cs.ops.length} op(s), source ${cs.source}`)
for (const w of res.warnings) console.warn(`WARN  ${w}`)
if (!res.ok) { console.error(`Refused (nothing written):\n- ${res.conflicts.join('\n- ')}`); process.exit(1) }
console.log(res.summary.map(s => `  ${s}`).join('\n'))
// The result must still be valid content.
const read = (f: string) => readJson(join(CONTENT, f))
const v = validateContent(res.state.words, read('explanations.json'), read('cloze.json'), readSources(), read('curricula.json'))
const d = validateDecisions(res.state.words, res.state.mappings, res.state.recordings, res.state.selections, readSources(), sourceState(stored).records)
const errors = [...v.errors, ...d.errors]
if (errors.length) { console.error(`Refused: the result would not be valid content (nothing written):\n- ${errors.join('\n- ')}`); process.exit(1) }
if (dry) { console.log('Dry run: nothing written.'); process.exit(0) }
writeRepoState(res.state, before)
console.log('Applied. Review the diff (git diff src/content), then run npm run validate:content and npm test before committing.')
