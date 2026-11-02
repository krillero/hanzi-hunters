// npm run source:promote -- <record key> [--group <group>] [--dry-run]
// Turns a new-entry draft (mapping status "new-candidate") into a game entry in words.json. The entry is NOT added to any course:
// it only becomes part of play when someone adds its id to a lesson in src/content/curricula.json (docs/CURRICULUM.md).
import { join } from 'node:path'
import { promoteDraft } from '../src/sources/changeset.ts'
import { validateContent } from '../src/content/validate.ts'
import { CONTENT, readJson, readRepoState, readSources, readStoredSource, sourceState, writeRepoState } from './sources/files.ts'

const args = process.argv.slice(2)
const key = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--group')
const group = args.includes('--group') ? args[args.indexOf('--group') + 1] : undefined
if (!key) { console.error('usage: npm run source:promote -- <record key> [--group <group>] [--dry-run]'); process.exit(2) }
const stored = readStoredSource(key.split(':')[0])
if (!stored) { console.error(`Source of ${key} has not been imported.`); process.exit(1) }
const before = readRepoState()
const r = promoteDraft(before, key, sourceState(stored), group)
if (!r.ok) { console.error(`Not promoted: ${r.error}`); process.exit(1) }
const read = (f: string) => readJson(join(CONTENT, f))
const v = validateContent(r.state.words, read('explanations.json'), read('cloze.json'), readSources(), read('curricula.json'))
if (v.errors.length) { console.error(`Not promoted: the entry does not meet the playable-entry rules:\n- ${v.errors.join('\n- ')}`); process.exit(1) }
if (args.includes('--dry-run')) { console.log(`Would add entry "${r.id}". Dry run: nothing written.`); process.exit(0) }
writeRepoState(r.state, before)
console.log(`Added entry "${r.id}" to words.json (review status "imported"). It is not in any course yet: add it to a lesson in curricula.json to teach it.`)
