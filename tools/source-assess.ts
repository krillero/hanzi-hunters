// npm run source:assess -- <command>
//   check [--source <id>]          validate src/content/assessments/*.json; report coverage and outdated assessments
//   template --source <id> [--kind pairs|records|examples] [--all] [--out file.json]
//                                  pairs:    candidate pairs (record x game entry) without a current assessment
//                                  records:  every record without a current record-level disposition
//                                  examples: example sentences of records whose current disposition is match / additional-sense
//                                            (target: the related entries) or that are proposed for the first expansion (target:
//                                            the record); prefilled "contains" / "prerequisites" are review aids to check
//                                  Each item has ids, hashes and fingerprints filled in and a read-only `context` for the assessor.
//   import --source <id> <file.json> [--dry-run]
//                                  validate and merge; refused as a whole when anything is invalid or outdated, or would replace
//                                  a person's assessment with a non-human one
//   report --source <id> [--out file.md] [--check]
//                                  a generated table of every record of the source with its disposition, proposals and examples
// Assessments are advice: this tool writes ONLY src/content/assessments/<source>.json (and the report you ask for). It never
// links records, changes game text, selects recordings or touches curricula. See docs/SOURCES.md §5a.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORDS } from '../src/data.ts'
import { EXPLANATIONS } from '../src/content/index.ts'
import {
  assessmentId, candidateComparisons, checkAssessmentsFile, coverage, coverageLine, entriesFingerprint, exampleAssessmentId, exampleFreshness, exampleHash,
  gameFingerprint, mergeAssessments, recordAssessmentId, recordFreshness, type AssessmentsFile, type Comparison, type RecordAssessment
} from '../src/sources/assessment.ts'
import { sourceDefinition } from '../src/sources/compare.ts'
import { recordReadings } from '../src/sources/match.ts'
import { segmentKnown } from '../src/sources/segment.ts'
import type { MappingsFile, SentenceItem, SourceRecord } from '../src/sources/types.ts'
import { CONTENT, readJson, writeJson } from './sources/files.ts'
import { assessedSources, readAssessments, sourceContext, writeAssessments, type SourceContext } from './sources/assessments.ts'

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const mappings = readJson<MappingsFile>(join(CONTENT, 'sourceMappings.json')).mappings
const today = () => new Date().toISOString().slice(0, 10)
const need = (): [string, SourceContext] => {
  const source = opt('--source')
  if (!source) { console.error('--source <id> is required'); process.exit(2) }
  const ctx = sourceContext(source, WORDS, EXPLANATIONS)
  if (!ctx) { console.error(`Source "${source}" has not been imported (public/sources/${source}).`); process.exit(1) }
  return [source, ctx]
}
const compsOf = (ctx: SourceContext, file: AssessmentsFile) => candidateComparisons(ctx.recordList, WORDS, EXPLANATIONS, file, mappings)
const sentencesOf = (ctx: SourceContext, key: string) => [...ctx.sentences.values()].filter(s => s.provenance.record === key)

function report(source: string, ctx: SourceContext, file: AssessmentsFile) {
  const all = compsOf(ctx, file)
  const cmp = [...all.values()].flatMap(x => x.comparisons)
  const c = coverage(cmp)
  console.log(`[${source}] ${ctx.records.size} source records; ${c.records} with a candidate game entry (${c.pairs} candidate pairs, ${c.entries} unique game entries); ${ctx.records.size - c.records} without`)
  console.log(`  pairs: meaning ${Object.entries(c.meaning).map(([k, v]) => `${k} ${v}`).join(', ')}; wording ${Object.entries(c.wording).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`  ${coverageLine(c)}`)
  const recs = file.records ?? []
  const current = recs.filter(a => recordFreshness(a, ctx.records.get(a.record), WORDS, EXPLANATIONS) === 'current')
  const disp: Record<string, number> = {}
  for (const a of current) disp[a.disposition] = (disp[a.disposition] ?? 0) + 1
  if (recs.length || source !== 'accc-anki') console.log(`  records: ${current.length} of ${ctx.records.size} have a current disposition (${Object.entries(disp).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}); ${recs.length - current.length} outdated; first expansion ${current.filter(a => a.expansion === 'first').length}`)
  const ex = file.examples ?? []
  const exCur = ex.filter(a => exampleFreshness(a, ctx.sentences.get(a.sentence), WORDS, EXPLANATIONS) === 'current')
  const v: Record<string, number> = {}
  for (const a of exCur) v[a.verdict] = (v[a.verdict] ?? 0) + 1
  if (ctx.sentences.size) console.log(`  examples: ${ctx.sentences.size} sentences; ${exCur.length} current example assessments (${Object.entries(v).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}); ${ex.length - exCur.length} outdated`)
  for (const x of cmp) if (x.outdated) console.warn(`  OUTDATED pair ${x.outdated.assessment.id}: ${x.outdated.freshness}`)
  for (const a of recs) if (!current.includes(a)) console.warn(`  OUTDATED record ${a.id}`)
  for (const a of ex) if (!exCur.includes(a)) console.warn(`  OUTDATED example ${a.id}`)
}

function recordContext(ctx: SourceContext, r: SourceRecord, comparisons: Comparison[]) {
  return {
    forms: r.candidate.simplified, readings: recordReadings(r), pos: r.candidate.pos, posDominant: r.candidate.posDominant,
    shortMeaning: r.candidate.meaningMissing ? '(MISSING in the source)' : sourceDefinition(r), definitions: r.candidate.definitions, meta: r.candidate.meta,
    flags: r.candidate.flags, issues: r.issues, examples: sentencesOf(ctx, r.key).map(s => ({ id: s.id, zh: s.zh, pinyin: s.pinyin, en: s.en })),
    candidates: comparisons.map(c => { const w = WORDS.find(x => x.id === c.entry)!; return { entry: w.id, pinyin: w.pinyin, meaning: w.meaning, note: w.note, text: c.text, pronunciation: c.pronunciation.text, meaning_assessed: c.meaning.state } })
  }
}

if (cmd === 'check') {
  let errors = 0
  for (const source of opt('--source') ? [opt('--source')!] : assessedSources()) {
    const ctx = sourceContext(source, WORDS, EXPLANATIONS)
    const file = readAssessments(source)
    const errs = checkAssessmentsFile(file, ctx ?? undefined)
    for (const e of errs) console.error(`ERROR [${source}] ${e}`)
    errors += errs.length
    if (ctx) report(source, ctx, file); else console.warn(`[${source}] not imported: only the file shape was checked`)
  }
  process.exit(errors ? 1 : 0)
} else if (cmd === 'template') {
  const [source, ctx] = need()
  const file = readAssessments(source)
  const kind = opt('--kind') ?? 'pairs'
  const all = args.includes('--all')
  const out: AssessmentsFile & { assessments: unknown[]; records: unknown[]; examples: unknown[] } = { kind: 'hanzi-hunters-assessments', schemaVersion: 2, source, assessments: [], records: [], examples: [] }
  const base = { method: 'ai-assisted', assessor: '', on: today(), review: 'unreviewed', uncertainty: 'high' }
  const comps = compsOf(ctx, file)
  if (kind === 'pairs') for (const [key, { comparisons }] of comps) for (const c of comparisons) {
    if (c.assessment && !all) continue
    const r = ctx.records.get(key)!, w = WORDS.find(x => x.id === c.entry)!
    out.assessments.push({ id: assessmentId(key, w.id), record: key, recordHash: r.hash, entry: w.id, gameFingerprint: gameFingerprint(w, EXPLANATIONS[w.id]),
      context: { record: recordContext(ctx, r, [c]), game: { explanation: EXPLANATIONS[w.id] ?? null } }, meaning: { verdict: 'uncertain', reason: '' }, ...base })
  }
  else if (kind === 'records') for (const r of ctx.recordList) {
    const cur = (file.records ?? []).find(a => a.id === recordAssessmentId(r.key))
    if (cur && !all && recordFreshness(cur, r, WORDS, EXPLANATIONS) === 'current') continue
    const comparisons = comps.get(r.key)?.comparisons ?? []
    const related = comparisons.map(c => c.entry)
    out.records.push({ id: recordAssessmentId(r.key), record: r.key, recordHash: r.hash, ...(related.length ? { relatedEntries: related, relatedFingerprint: entriesFingerprint(related, WORDS, EXPLANATIONS) } : {}),
      context: recordContext(ctx, r, comparisons), disposition: 'uncertain', reason: '', ...base })
  }
  else if (kind === 'examples') {
    const forms = new Set([...WORDS.map(w => w.hanzi), ...ctx.recordList.flatMap(r => r.candidate.simplified)])
    const gameForms = new Set(WORDS.map(w => w.hanzi))
    for (const ra of file.records ?? []) {
      const r = ctx.records.get(ra.record)
      if (!r || recordFreshness(ra, r, WORDS, EXPLANATIONS) !== 'current') continue
      const targets = ra.disposition === 'match' || ra.disposition === 'additional-sense' ? (ra.relatedEntries ?? []).map(entry => ({ entry })) : ra.expansion === 'first' ? [{ record: r.key }] : []
      for (const target of targets) for (const s of sentencesOf(ctx, r.key)) {
        const id = exampleAssessmentId(s.id, target)
        const cur = (file.examples ?? []).find(a => a.id === id)
        if (cur && !all && exampleFreshness(cur, s, WORDS, EXPLANATIONS) === 'current') continue
        const self = r.candidate.simplified[0] ?? ''
        const seg = segmentKnown(s.zh, forms)
        const contains = seg.known.filter(x => x !== self)
        const w = 'entry' in target ? WORDS.find(x => x.id === target.entry) : undefined
        out.examples.push({ id, sentence: s.id, sentenceHash: exampleHash(s), record: r.key, target, ...(w ? { targetFingerprint: gameFingerprint(w, EXPLANATIONS[w.id]) } : {}),
          context: { zh: s.zh, pinyin: s.pinyin, en: s.en, word: self, targetMeaning: w ? `${w.meaning} | note: ${w.note}` : ra.draft?.meaning ?? ra.shortLabel?.text, unknownCharacters: seg.unknown },
          sense: '', verdict: 'uncertain', contains, prerequisites: [...contains.filter(x => !gameForms.has(x)), ...seg.unknown], reason: '', ...base })
      }
    }
  } else { console.error('--kind must be pairs, records or examples'); process.exit(2) }
  const n = out.assessments.length + out.records.length + out.examples.length
  const target = opt('--out')
  if (target) { writeJson(target, out); console.log(`Wrote ${n} item(s) to ${target}. Fill them in, then: npm run source:assess -- import --source ${source} ${target}`) }
  else process.stdout.write(JSON.stringify(out, null, 2) + '\n')
} else if (cmd === 'import') {
  const [source, ctx] = need()
  const f = args.find((a, i) => i > 0 && !a.startsWith('--') && args[i - 1] !== '--source')
  if (!f) { console.error('usage: npm run source:assess -- import --source <id> <file.json> [--dry-run]'); process.exit(2) }
  let incoming: unknown
  try { incoming = JSON.parse(readFileSync(f, 'utf8')) } catch (e) { console.error(`Cannot read ${f}: ${(e as Error).message}`); process.exit(1) }
  const res = mergeAssessments(readAssessments(source), incoming, ctx)
  if (!res.ok) { console.error(`Refused (nothing written):\n- ${res.errors.slice(0, 40).join('\n- ')}${res.errors.length > 40 ? `\n- … ${res.errors.length - 40} more` : ''}`); process.exit(1) }
  console.log(`${res.added} added, ${res.replaced} replaced.`)
  report(source, ctx, res.file)
  if (args.includes('--dry-run')) { console.log('Dry run: nothing written.'); process.exit(0) }
  writeAssessments(source, res.file)
  console.log(`Written: src/content/assessments/${source}.json. Only assessments changed; no mapping, wording, recording or curriculum was modified.`)
} else if (cmd === 'report') {
  const [source, ctx] = need()
  const file = readAssessments(source)
  const comps = compsOf(ctx, file)
  const recs = new Map((file.records ?? []).map(a => [a.record, a]))
  const exs = file.examples ?? []
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const rows = ctx.recordList.map((r, i) => {
    const a: RecordAssessment | undefined = recs.get(r.key)
    const fresh = a ? recordFreshness(a, r, WORDS, EXPLANATIONS) : undefined
    const c = comps.get(r.key)?.comparisons ?? []
    const sents = sentencesOf(ctx, r.key)
    const ev = exs.filter(e => e.record === r.key && exampleFreshness(e, ctx.sentences.get(e.sentence), WORDS, EXPLANATIONS) === 'current')
    const evs = ev.length ? Object.entries(ev.reduce<Record<string, number>>((m, e) => ((m[e.verdict] = (m[e.verdict] ?? 0) + 1), m), {})).map(([k, n]) => `${k} ${n}`).join(', ') : sents.length ? 'not assessed' : '—'
    const pair = c.map(x => `${x.entry}: ${x.meaning.state}${x.wording.state === 'edited' || x.wording.state === 'prefer-source' ? ` → “${x.wording.proposed}”` : ''}`).join('; ')
    const prop = a?.draft ? `draft ${a.draft.id} ${a.draft.pinyin} “${a.draft.meaning}”` : a?.shortLabel ? `label “${a.shortLabel.text}” (${a.shortLabel.basis})` : ''
    return `| ${i + 1} | ${r.candidate.simplified[0] ?? ''} | ${r.candidate.readings[0] ?? ''} | ${r.candidate.meaningMissing ? '*(missing)*' : esc(sourceDefinition(r))} | ${a ? `${a.disposition}${fresh !== 'current' ? ' (OUTDATED)' : ''}${a.expansion === 'first' ? ' · **first expansion**' : ''}${a.multipleSenses ? ' · several senses' : ''}` : 'not assessed'} | ${esc(pair)} | ${esc(prop)} | ${sents.length} (${evs}) | ${esc(a?.reason ?? '')} |`
  })
  const md = [
    `# ${source}: every imported record`, '',
    `Generated by \`npm run source:assess -- report --source ${source}\` from the imported records and src/content/assessments/${source}.json. All assessments are AI-assisted and unreviewed unless marked otherwise; nothing here is applied to the game.`, '',
    '| # | Word | Declared reading | Source short meaning | Disposition | Pair assessments (game entry: meaning) | Proposal | Examples (assessed) | Reason |',
    '|---|---|---|---|---|---|---|---|---|', ...rows, ''
  ].join('\n')
  const target = opt('--out')
  // --check: fail when the committed report is not what this command produces now (run by tests/generated.test.ts).
  if (target && args.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== md) { console.error(`${target} is stale: run npm run source:assess -- report --source ${source} --out ${target}`); process.exit(1) }
    process.exit(0)
  }
  if (target) { writeFileSync(target, md); console.log(`Wrote ${target}`) } else process.stdout.write(md)
} else {
  console.error('usage: npm run source:assess -- check [--source id] | template --source id [--kind pairs|records|examples] [--all] [--out file] | import --source id <file.json> [--dry-run] | report --source id [--out file.md]')
  process.exit(2)
}
