// npm run vocab:candidates -- <candidates.json | 字 词 ...>
//
// Read-only helper for picking the next vocabulary batch (see docs/vocabulary-toolkit/).
// For each candidate it reports: entries that already use that written form (and whether they
// are in the active curriculum or only "supplemental"), the HSK syllabus level(s) from
// docs/vocabulary-toolkit/reference/hsk-map.json, and CC-CEDICT readings if a dictionary
// snapshot has been fetched (bash docs/vocabulary-toolkit/tools/fetch-cedict.sh).
//
// candidates.json: an array of strings or of objects { hanzi, id?, pinyin? }.
// This is NOT a Mandarin correctness check: readings, senses and notes still need review.
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

type Entry = { id?: string; hanzi: string; pinyin: string; meaning: string }
type Candidate = { hanzi: string; id?: string; pinyin?: string }
type HskRow = { level: string; entry: string; pinyin: string; printedPage: number; note?: string }
type Curriculum = { id: string; units: { lessons: { id: string; introductions: { entryId: string }[] }[] }[] }

const root = new URL('../', import.meta.url)
const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'))

const args = process.argv.slice(2)
if (!args.length || args.includes('--help')) {
  console.log('usage: npm run vocab:candidates -- <candidates.json | hanzi ...>')
  process.exit(args.length ? 0 : 1)
}
const raw: unknown[] = args.length === 1 && args[0].endsWith('.json') ? JSON.parse(readFileSync(args[0], 'utf8')) : args
if (!Array.isArray(raw)) throw new Error('candidates file must contain a JSON array')
const candidates: Candidate[] = raw.map((c, i) => {
  const o = typeof c === 'string' ? { hanzi: c } : (c as Candidate)
  if (!o || typeof o.hanzi !== 'string' || !o.hanzi) throw new Error(`candidate ${i}: needs a non-empty "hanzi"`)
  return o
})

const words = readJson('src/content/words.json') as Entry[]
const { default: activeId, curricula } = readJson('src/content/curricula.json') as { default: string; curricula: Curriculum[] }
const idOf = (w: { id?: string; hanzi: string }) => w.id ?? w.hanzi
const lessonOf = new Map<string, string>()
for (const c of curricula.filter(c => c.id === activeId))
  for (const u of c.units) for (const l of u.lessons) for (const i of l.introductions) lessonOf.set(i.entryId, l.id)

const hsk = readJson('docs/vocabulary-toolkit/reference/hsk-map.json') as Record<string, HskRow[]>

// Optional CC-CEDICT snapshot: written form -> numbered-pinyin readings.
const cedictPath = new URL('docs/vocabulary-toolkit/reference/cedict.gz', root)
let cedict: Map<string, string[]> | null = null
if (existsSync(cedictPath)) {
  cedict = new Map()
  for (const line of gunzipSync(readFileSync(cedictPath)).toString('utf8').split('\n')) {
    const m = /^\S+ (\S+) \[([^\]]+)\]/.exec(line)
    if (m) cedict.set(m[1], [...(cedict.get(m[1]) ?? []), m[2]])
  }
}

const seen = new Set<string>()
const rows = candidates.map(c => {
  const id = idOf(c)
  const existing = words.filter(w => w.hanzi === c.hanzi).map(w => ({
    id: idOf(w), pinyin: w.pinyin, meaning: w.meaning, lesson: lessonOf.get(idOf(w)) ?? null,
  }))
  const row = {
    id, hanzi: c.hanzi,
    status: existing.some(e => e.id === id) ? (lessonOf.has(id) ? 'in-active-curriculum' : 'existing-supplemental') : existing.length ? 'written-form-exists' : 'new',
    repeatedCandidate: seen.has(id),
    existing,
    hsk: (hsk[c.hanzi] ?? []).map(h => ({ level: h.level, entry: h.entry, pinyin: h.pinyin, ...(h.note ? { note: h.note } : {}) })),
    cedict: cedict ? [...new Set(cedict.get(c.hanzi) ?? [])] : 'not fetched',
  }
  seen.add(id)
  return row
})

const count = (s: string) => rows.filter(r => r.status === s).length
console.log(JSON.stringify({
  activeCurriculum: activeId,
  candidates: rows.length,
  summary: { new: count('new'), existingSupplemental: count('existing-supplemental'), inActiveCurriculum: count('in-active-curriculum'), writtenFormExists: count('written-form-exists'), repeated: rows.filter(r => r.repeatedCandidate).length },
  entries: rows,
}, null, 2))
