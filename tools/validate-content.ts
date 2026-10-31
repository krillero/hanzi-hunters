// npm run validate:content  -> checks src/content/*.json (words, explanations, cloze, sources). Exit code 1 on errors.
// Also prints how much of the content has NOT been reviewed by a person yet (that is a report, not an error).
import { readFileSync } from 'node:fs'
import { needsReview, validateContent } from '../src/content/validate.ts'

const read = (f: string) => {
  try { return JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8')) } catch (e) { console.error(`${f} is not valid JSON:`, (e as Error).message); process.exit(1) }
}
const words = read('words.json'), explanations = read('explanations.json'), cloze = read('cloze.json'), sources = read('sources.json')

const { errors, warnings } = validateContent(words, explanations, cloze, sources)
const nWords = Array.isArray(words) ? words.length : 0
const nEx = explanations && typeof explanations === 'object' ? Object.keys(explanations).length : 0
const nCloze = Array.isArray(cloze) ? cloze.length : 0
for (const w of warnings) console.warn('WARN ', w)
for (const e of errors) console.error('ERROR', e)
const review = needsReview(words, explanations, cloze)
console.log(`\nNot yet reviewed by a person: ${review.words.length}/${nWords} entries, ${review.examples.length} example sentences, ${review.cloze.length}/${nCloze} sentence questions.`)
console.log('(Entries without a "review" field count as unreviewed. Only mark content "human-reviewed" when a person really reviewed it: see docs/CONTENT_GUIDE.md.)')
console.log(`${nWords} words, ${nEx} explanations, ${nCloze} sentence questions: ${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
