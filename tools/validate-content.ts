// npm run validate:content  -> checks src/content/*.json (words, explanations, cloze, sources, curricula). Exit code 1 on errors.
// Also prints how much of the content has NOT been reviewed by a person yet, and curriculum information (reports, not errors).
// Structural validation only: it cannot tell whether the Mandarin, the translations or the teaching order are good.
import { readFileSync } from 'node:fs'
import { needsReview, validateContent } from '../src/content/validate.ts'
import { validateEncounters } from '../src/game/encounters.ts'

const read = (f: string) => {
  try { return JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8')) } catch (e) { console.error(`${f} is not valid JSON:`, (e as Error).message); process.exit(1) }
}
const words = read('words.json'), explanations = read('explanations.json'), cloze = read('cloze.json'), sources = read('sources.json'), curricula = read('curricula.json')

const { errors, warnings, info } = validateContent(words, explanations, cloze, sources, curricula)
const encounters = read('encounters.json')
errors.push(...validateEncounters(encounters, Array.isArray(words) ? words.map((w: { id?: string; hanzi: string }) => w.id ?? w.hanzi) : []))
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
console.log(`${nWords} words, ${nEx} explanations, ${nCloze} sentence questions, ${nCurr} curricul${nCurr === 1 ? 'um' : 'a'}, ${nScenes} encounters: ${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
