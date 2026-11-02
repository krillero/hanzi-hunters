// "sentences-json" adapter: a simple authored JSON file of example sentences and exercises. It exists to prove (and test) that a
// second source can contribute sentences and exercises through the same model without touching the Anki adapter, and as a
// template for future sentence sources (e.g. a converted Tatoeba export).
//
// Input (see tests/fixtures/sources/sentences-demo.json):
//   { "schemaVersion": 1,
//     "sentences": [{ "id", "zh", "en", "pinyin"?, "links"?: [{ "entry" | "objective", "role" }] }],
//     "exercises": [{ "id", "type", "targets": [...], "sentences": [ids], "accept": [...], "choices"?: [...], "blank"?,
//                     "prerequisites"?, "feedback"?, "difficulty"?, "tags"? }] }
// Links are taken only as declared: nothing is inferred from Chinese substrings.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { SOURCE_SCHEMA_VERSION, type ContentLink, type Exercise, type SentenceItem, type SourceBundle, type SourceRecord } from '../../../src/sources/types.ts'

type InSentence = { id: string; zh: string; en: string; pinyin?: string; links?: ContentLink[] }
type InExercise = { id: string; type: string; targets: ContentLink[]; sentences: string[]; accept: string[]; choices?: string[]; blank?: string; prerequisites?: Exercise['prerequisites']; feedback?: Exercise['feedback']; difficulty?: number; tags?: string[] }
type Input = { schemaVersion: number; sentences?: InSentence[]; exercises?: InExercise[] }

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')

export function readSentencesJson(opts: { source: string; file: string; retrieved?: string }): SourceBundle {
  const buf = readFileSync(opts.file)
  const input = JSON.parse(buf.toString('utf8')) as Input
  if (input.schemaVersion !== 1) throw new Error(`${opts.file}: schemaVersion ${input.schemaVersion} is not supported`)
  const snapshot = sha(buf)
  const records: SourceRecord[] = []
  const content: SentenceItem[] = []
  const sentences = input.sentences ?? []
  sentences.forEach((s, i) => {
    const key = `${opts.source}:${s.id}`
    const fields: Record<string, string> = { id: s.id, zh: s.zh, en: s.en, ...(s.pinyin ? { pinyin: s.pinyin } : {}) }
    const hash = sha(JSON.stringify(fields)).slice(0, 16)
    records.push({
      key, source: opts.source, originalId: s.id, native: {}, snapshot: snapshot.slice(0, 12), hash, fields,
      candidate: { simplified: [], traditional: [], readings: [], pos: [], meanings: [s.en], variants: [], flags: ['sentence'] },
      placement: { order: i }, media: [], issues: []
    })
    content.push({
      type: 'sentence', id: `${opts.source}:sentence:${s.id}`, zh: s.zh, en: s.en, ...(s.pinyin ? { pinyin: s.pinyin } : {}),
      provenance: { source: opts.source, record: key, recordHash: hash, mode: 'verbatim' }, review: { status: 'imported' },
      ...(s.links ? { links: s.links } : {})
    })
  })
  const exercises: Exercise[] = (input.exercises ?? []).map(e => ({
    id: `${opts.source}:exercise:${e.id}`, type: e.type, targets: e.targets,
    content: e.sentences.map(id => `${opts.source}:sentence:${id}`),
    ...(e.prerequisites ? { prerequisites: e.prerequisites } : {}),
    answer: { accept: e.accept, ...(e.choices ? { choices: e.choices } : {}), ...(e.blank ? { blank: e.blank } : {}) },
    ...(e.feedback ? { feedback: e.feedback } : {}), ...(e.difficulty !== undefined ? { difficulty: e.difficulty } : {}), ...(e.tags ? { tags: e.tags } : {}),
    provenance: { source: opts.source, mode: 'verbatim' }, review: { status: 'imported' }
  }))
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION, source: opts.source, adapter: 'sentences-json',
    snapshot: { id: snapshot.slice(0, 12), sha256: snapshot, file: opts.file.split(/[\\/]/).pop()!, bytes: buf.length, ...(opts.retrieved ? { retrieved: opts.retrieved } : {}) },
    records, content, exercises,
    report: { counts: { records: records.length, sentences: content.length, exercises: exercises.length }, problems: {}, checksRan: ['JSON shape', 'ids unique (validateBundle)'], notChecked: ['Mandarin, translations and answers are not checked'] }
  }
}
