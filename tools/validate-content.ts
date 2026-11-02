// npm run validate:content  -> checks src/content/*.json (words, explanations, cloze, sources, curricula). Exit code 1 on errors.
// Also prints how much of the content has NOT been reviewed by a person yet, and curriculum information (reports, not errors).
// Structural validation only: it cannot tell whether the Mandarin, the translations or the teaching order are good.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { needsReview, validateContent } from '../src/content/validate.ts'
import { validateEncounters } from '../src/game/encounters.ts'
import { validateTrialsFile } from '../src/game/trials.ts'
import { join } from 'node:path'
import { validateDecisions } from '../src/sources/validate.ts'
import { checkAssessmentsFile, exampleFreshness, freshness, recordFreshness } from '../src/sources/assessment.ts'
import { assessedSources, readAssessments, sourceContext } from './sources/assessments.ts'
import { normalizeWords } from '../src/content/entries.ts'
import type { SourceRecord } from '../src/sources/types.ts'
import { PUBLIC, readIndex, readStoredSource } from './sources/files.ts'

const read = (f: string) => {
  try { return JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8')) } catch (e) { console.error(`${f} is not valid JSON:`, (e as Error).message); process.exit(1) }
}
const words = read('words.json'), explanations = read('explanations.json'), cloze = read('cloze.json'), sources = read('sources.json'), curricula = read('curricula.json')

const { errors, warnings, info } = validateContent(words, explanations, cloze, sources, curricula)
const encounters = read('encounters.json')
const wordIds = Array.isArray(words) ? words.map((w: { id?: string; hanzi: string }) => w.id ?? w.hanzi) : []
errors.push(...validateEncounters(encounters, wordIds))
const trials = read('trials.json')
errors.push(...validateTrialsFile(trials, wordIds))
// Source layer: committed decisions (mappings, selected recordings, field selections) against words.json and the imported records.
const records = new Map<string, SourceRecord>()
for (const src of readIndex().sources) for (const r of readStoredSource(src.id)?.records ?? []) records.set(r.key, r)
const recordings = read('recordings.json')
const decisions = validateDecisions(words, read('sourceMappings.json'), recordings, read('selections.json'), sources, records.size ? records : undefined)
errors.push(...decisions.errors); warnings.push(...decisions.warnings)
// Editorial assessments (advice only), one file per source: valid shape and rules are errors; outdated ones are warnings (they stop
// counting as advice and are shown as outdated on the review screen).
{
  const words2 = normalizeWords(words)
  for (const source of assessedSources()) {
    const file = readAssessments(source)
    const ctx = sourceContext(source, words2, explanations)
    errors.push(...checkAssessmentsFile(file, ctx ?? undefined).map(e => `assessments/${source}.json: ${e}`))
    if (!ctx) continue
    const outdated = [
      ...file.assessments.filter(a => freshness(a, ctx.records.get(a.record), words2.find(w => w.id === a.entry), explanations?.[a.entry]) !== 'current').map(a => a.id),
      ...(file.records ?? []).filter(a => recordFreshness(a, ctx.records.get(a.record), words2, explanations) !== 'current').map(a => a.id),
      ...(file.examples ?? []).filter(a => exampleFreshness(a, ctx.sentences.get(a.sentence), words2, explanations) !== 'current').map(a => a.id)
    ]
    for (const id of outdated.slice(0, 20)) warnings.push(`assessments/${source}.json (${id}): outdated, the content changed. Reassess it (npm run source:assess -- template --source ${source}).`)
    if (outdated.length > 20) warnings.push(`assessments/${source}.json: ${outdated.length - 20} more outdated assessments`)
  }
}
// Selected recordings must exist on disk: they are shipped with the game.
for (const r of recordings?.recordings ?? []) { const f = join(PUBLIC, String(r.file)); if (!existsSync(f) || statSync(f).size === 0) errors.push(`recordings.json (${r.id}): file ${r.file} is missing or empty`) }
const nTrials = Array.isArray(trials?.trials) ? trials.trials.length : 0
const nScenes = Array.isArray(encounters?.scenes) ? encounters.scenes.length : 0
const nWords = Array.isArray(words) ? words.length : 0
const nEx = explanations && typeof explanations === 'object' ? Object.keys(explanations).length : 0
const nCloze = Array.isArray(cloze) ? cloze.length : 0
const nCurr = Array.isArray(curricula?.curricula) ? curricula.curricula.length : 0
for (const i of info) console.log('INFO ', i)
for (const w of warnings) console.warn('WARN ', w)
for (const e of errors) console.error('ERROR', e)
const review = needsReview(words, explanations, cloze, curricula)
console.log(`\nNot yet reviewed by a person: ${review.words.length}/${nWords} entries, ${review.examples.length} example sentences, ${review.cloze.length}/${nCloze} sentence questions, ${review.curricula.length}/${nCurr} curricula.`)
console.log('(Entries without a "review" field count as unreviewed. Only mark content "human-reviewed" when a person really reviewed it: see docs/CONTENT_GUIDE.md.)')
console.log('Structural checks only: passing does not mean the Mandarin or the teaching order has been verified. Full curriculum report: npm run curriculum')
console.log(`${nWords} words, ${nEx} explanations, ${nCloze} sentence questions, ${nCurr} curricul${nCurr === 1 ? 'um' : 'a'}, ${nScenes} encounters, ${nTrials} boss trials: ${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
