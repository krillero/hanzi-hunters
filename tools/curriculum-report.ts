// npm run curriculum [curriculum-id]  -> human-readable curriculum inventory: effective introduction order, unit/lesson membership,
// prerequisites, unmapped official levels, entries outside the curriculum, unreviewed content. Run npm run validate:content first.
// The JSON form of the same data is in docs/content-inventory.json (npm run inventory).
import { readFileSync } from 'node:fs'
import { curriculumReport } from '../src/content/curriculumReport.ts'
import type { CurriculaFile } from '../src/content/types.ts'

const read = (f: string) => JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8'))
const file = read('curricula.json') as CurriculaFile
const id = process.argv[2] ?? file.default
const c = file.curricula.find(x => x.id === id)
if (!c) { console.error(`No curriculum "${id}". Known: ${file.curricula.map(x => x.id).join(', ')}`); process.exit(1) }
const r = curriculumReport(c, read('words.json'), read('cloze.json'))

console.log(`${r.title}  [${r.id} v${r.version}]${r.id === file.default ? '  (active)' : ''}${r.provisional ? '  PROVISIONAL ORDER' : ''}`)
console.log(`Readiness: every required entry introduced and at mastery level ${r.readiness.minLevel}+. Curriculum review: ${r.review}.`)
for (const u of r.units) {
  console.log(`\nUnit ${u.id}: ${u.title}`)
  for (const l of u.lessons) {
    const pre = l.prerequisiteLessons.length ? `  needs lesson ${l.prerequisiteLessons.join(', ')}` : ''
    console.log(`  Lesson ${l.id}: ${l.title}${pre}${l.aliases.length ? `  (was ${l.aliases.join(', ')})` : ''}`)
    for (const row of r.order.filter(x => x.lesson === l.id)) {
      const lv = row.officialLevels === 'unknown' ? 'level: unknown' : row.officialLevels.map(o => `${o.source} ${o.edition} L${o.level}`).join('; ')
      const pe = row.prerequisiteEntries.length ? `  needs ${row.prerequisiteEntries.join(', ')}` : ''
      console.log(`    ${String(row.order).padStart(4)}. ${row.entryId.padEnd(10)} ${row.pinyin.padEnd(12)} ${row.meaning.slice(0, 30).padEnd(30)} ${lv}${row.required ? '' : '  (optional)'}${pe}${row.missing ? '  MISSING FROM words.json' : ''}  review: ${row.entryReview}`)
    }
  }
}
console.log(`\nEffective introduction order (${r.order.length}): ${r.order.map(x => x.entryId).join(' ')}`)
console.log(`Unmapped official levels: ${r.unmappedOfficialLevels.length} of ${r.order.length}`)
console.log(`Entries outside this curriculum (informational): ${r.outsideCurriculum.length}${r.outsideCurriculum.length ? ': ' + r.outsideCurriculum.join(' ') : ''}`)
console.log(`Entries not reviewed by a person: ${r.unreviewedEntries.length} of ${r.order.length}`)
console.log(`Sentence questions with prerequisites: ${r.sentencesWithPrerequisites.length}; not reviewed by a person: ${r.unreviewedSentences.length}`)
if (r.missingEntries.length) { console.log(`MISSING vocabulary references: ${r.missingEntries.join(' ')}`); process.exitCode = 1 }
console.log('\nThis report is structural. It does not verify Mandarin accuracy or the quality of the teaching order.')
