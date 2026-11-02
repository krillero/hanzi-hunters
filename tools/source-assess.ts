// npm run source:assess -- <command>
//   check                        validate src/content/sourceAssessments.json; report coverage (candidate pairs) and outdated ones
//   template [--all] [--source accc-anki] [--out file.json]
//                                write the candidate pairs that have no current assessment (all pairs with --all) as an editable
//                                assessments file: ids, record hashes and game fingerprints filled in, plus a read-only `context`
//                                (source definition and reading, game meaning, note, explanation) for the assessor
//   import <file.json> [--dry-run]
//                                validate and merge assessments into src/content/sourceAssessments.json. Refused as a whole when
//                                any is invalid, outdated (made against other content) or would replace a person's assessment.
// Assessments are advice: this tool writes ONLY sourceAssessments.json. It never links records, changes game text, selects
// recordings or touches curricula. See docs/SOURCES.md §5a.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORDS } from '../src/data.ts'
import { EXPLANATIONS } from '../src/content/index.ts'
import { candidateComparisons, checkAssessmentsFile, coverage, coverageLine, emptyAssessments, gameFingerprint, assessmentId, mergeAssessments, type AssessmentContext, type AssessmentsFile } from '../src/sources/assessment.ts'
import { sourceDefinition } from '../src/sources/compare.ts'
import { recordReadings } from '../src/sources/match.ts'
import type { MappingsFile, SourceRecord } from '../src/sources/types.ts'
import { CONTENT, readIndex, readJson, readStoredSource, writeJson } from './sources/files.ts'

const FILE = join(CONTENT, 'sourceAssessments.json')
const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const current = (): AssessmentsFile => { try { return readJson<AssessmentsFile>(FILE) } catch { return emptyAssessments() } }
const records = new Map<string, SourceRecord>()
for (const s of readIndex().sources) if (!opt('--source') || s.id === opt('--source')) for (const r of readStoredSource(s.id)?.records ?? []) records.set(r.key, r)
const ctx: AssessmentContext = { records, words: WORDS, explanations: EXPLANATIONS }
const mappings = readJson<MappingsFile>(join(CONTENT, 'sourceMappings.json')).mappings
const all = () => candidateComparisons([...records.values()], WORDS, EXPLANATIONS, current(), mappings)

function report(file: AssessmentsFile) {
  const cmp = [...candidateComparisons([...records.values()], WORDS, EXPLANATIONS, file, mappings).values()].flatMap(x => x.comparisons)
  const c = coverage(cmp)
  console.log(`Candidate pairs: ${c.pairs} (${c.records} source records, ${c.entries} game entries; ${records.size - c.records} source records have no matching game entry)`)
  console.log(`Meaning (pairs): ${Object.entries(c.meaning).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`Wording (pairs): ${Object.entries(c.wording).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`Text (pairs): ${Object.entries(c.text).map(([k, v]) => `${k} ${v}`).join(', ')}; pronunciation differs: ${c.pronunciation}`)
  console.log(`Assessments by method (current): ${Object.entries(c.byMethod).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(coverageLine(c))
  for (const x of cmp) if (x.outdated) console.warn(`OUTDATED ${x.outdated.assessment.id}: ${x.outdated.freshness}`)
  const ids = new Set(cmp.map(x => assessmentId(x.record, x.entry)))
  for (const a of file.assessments) if (!ids.has(a.id)) console.warn(`NOT A CANDIDATE ${a.id}: the pair is no longer a candidate (kept as history)`)
}

if (cmd === 'check') {
  const file = current()
  const errors = checkAssessmentsFile(file, ctx)
  for (const e of errors) console.error('ERROR', e)
  report(file)
  process.exit(errors.length ? 1 : 0)
} else if (cmd === 'template') {
  const out: AssessmentsFile & { assessments: unknown[] } = { ...emptyAssessments(), assessments: [] }
  for (const [key, { comparisons }] of all()) for (const c of comparisons) {
    if (c.assessment && !args.includes('--all')) continue
    const r = records.get(key)!, w = WORDS.find(x => x.id === c.entry)!
    const e = EXPLANATIONS[w.id]
    out.assessments.push({
      id: assessmentId(key, w.id), record: key, recordHash: r.hash, entry: w.id, gameFingerprint: gameFingerprint(w, e),
      context: { source: { forms: r.candidate.simplified, readings: recordReadings(r), pos: r.candidate.pos, definition: sourceDefinition(r), flags: r.candidate.flags },
        game: { hanzi: w.hanzi, pinyin: w.pinyin, variants: w.variants, speech: w.speech, kind: w.kind, meaning: w.meaning, note: w.note, explanation: e ? { summary: e.summary, sections: e.sections } : null },
        evidence: { text: c.text, pronunciation: c.pronunciation.text, strength: c.strength } },
      meaning: { verdict: 'uncertain', reason: '' }, method: 'ai-assisted', assessor: '', on: new Date().toISOString().slice(0, 10), review: 'unreviewed', uncertainty: 'high'
    })
  }
  const target = opt('--out')
  if (target) { writeJson(target, out); console.log(`Wrote ${out.assessments.length} pair(s) to ${target}. Fill meaning/wording/reason/assessor, then: npm run source:assess -- import ${target}`) }
  else process.stdout.write(JSON.stringify(out, null, 2) + '\n')
} else if (cmd === 'import') {
  const f = args.find((a, i) => i > 0 && !a.startsWith('--'))
  if (!f) { console.error('usage: npm run source:assess -- import <file.json> [--dry-run]'); process.exit(2) }
  let incoming: unknown
  try { incoming = JSON.parse(readFileSync(f, 'utf8')) } catch (e) { console.error(`Cannot read ${f}: ${(e as Error).message}`); process.exit(1) }
  const res = mergeAssessments(current(), incoming, ctx)
  if (!res.ok) { console.error(`Refused (nothing written):\n- ${res.errors.join('\n- ')}`); process.exit(1) }
  console.log(`${res.added} added, ${res.replaced} replaced.`)
  report(res.file)
  if (args.includes('--dry-run')) { console.log('Dry run: nothing written.'); process.exit(0) }
  writeFileSync(FILE, JSON.stringify(res.file, null, 2) + '\n')
  console.log(`Written: ${FILE}. Only assessments changed; no mapping, wording, recording or curriculum was modified.`)
} else {
  console.error('usage: npm run source:assess -- check | template [--all] [--out file] | import <file.json> [--dry-run]')
  process.exit(2)
}
