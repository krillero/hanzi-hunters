// npm run validate:content  -> checks src/content/words.json and explanations.json. Exit code 1 on errors.
import { readFileSync } from 'node:fs'
import { validateContent } from '../src/content/validate.ts'

const read = (f: string) => JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8'))
let words: unknown, explanations: unknown
try { words = read('words.json') } catch (e) { console.error('words.json is not valid JSON:', (e as Error).message); process.exit(1) }
try { explanations = read('explanations.json') } catch (e) { console.error('explanations.json is not valid JSON:', (e as Error).message); process.exit(1) }

const { errors, warnings } = validateContent(words, explanations)
const nWords = Array.isArray(words) ? words.length : 0
const nEx = explanations && typeof explanations === 'object' ? Object.keys(explanations).length : 0
for (const w of warnings) console.warn('WARN ', w)
for (const e of errors) console.error('ERROR', e)
console.log(`\n${nWords} words, ${nEx} explanations: ${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
