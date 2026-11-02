import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApkg, fakeMp3, note } from './helpers/apkg.ts'
import { importSource } from '../tools/sources/importer.ts'
import { readRepoState, readStoredSource, writeJson } from '../tools/sources/files.ts'
import { readEntry, readZip, safeJoin, writeZip } from '../tools/sources/zip.ts'
import { readAnkiPackage } from '../tools/sources/adapters/anki.ts'
import { suggest } from '../src/sources/match.ts'
import { WORDS } from '../src/data.ts'
import type { MappingsFile } from '../src/sources/types.ts'

const NOTES = [
  note('B1-L01-01', '个', 'ge', 'measure word for people and things', { Traditional: '個', POS: 'M' }),
  note('B1-L01-02', '看', 'kàn', 'to look at; to see; to watch', { POS: 'V' }),
  note('B1-L02-01', '一点(儿)', 'yìdiǎn(r)', 'a little', { Traditional: '一點(兒)', POS: 'Det' }),
  note('B2-L01-01', '台湾师范大学', 'Táiwān Shīfàn Dàxué', 'National Taiwan Normal University', { POS: 'N', Variants: '臺灣' }),
  note('B2-L01-02', '谁', 'shéi', 'who', { POS: 'N', Variants: 'shuí' })
]
const media = () => Object.fromEntries(NOTES.map(n => [`${n.ID}.mp3`, fakeMp3(n.ID)]))

/** A scratch repository: copies of src/content plus an empty public/sources. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'hh-src-'))
  cpSync(new URL('../src/content', import.meta.url), join(dir, 'content'), { recursive: true })
  return { dir, contentDir: join(dir, 'content'), sourcesDir: join(dir, 'sources'), pkg: join(dir, 'deck.apkg') }
}

test('import: reads collection.anki21 (not the stub), keys records by the deck ID, extracts media under hash names', () => {
  const s = scratch()
  writeFileSync(s.pkg, buildApkg(NOTES, { ...media(), 'font.ttf': Buffer.from('font') }))
  const r = importSource({ source: 'accc-anki', file: s.pkg, retrieved: '2026-11-02', sourcesDir: s.sourcesDir, contentDir: s.contentDir })
  const c = r.bundle.report.counts
  assert.equal(c['notesIn_collection.anki2'], 1, 'the stub has one note')
  assert.equal(c['notesIn_collection.anki21'], NOTES.length)
  assert.equal(c.records, NOTES.length); assert.equal(c.cards, NOTES.length); assert.equal(c.recordings, NOTES.length)
  assert.deepEqual(r.bundle.records.map(x => x.key), NOTES.map(n => `accc-anki:${n.ID}`))
  const ge = r.bundle.records[0]
  assert.equal(ge.fields.Pinyin, 'ge', 'original fields are kept verbatim')
  assert.deepEqual(ge.placement, { book: 1, lesson: 1, item: 1, label: 'B1 L01 #1', order: 0 })
  assert.match(ge.media[0].path!, /^sources\/accc-anki\/media\/[0-9a-f]{16}\.mp3$/)
  assert.ok(ge.media[0].checks.includes('signature:mp3-id3'))
  const yd = r.bundle.records[2].candidate
  assert.deepEqual(yd.simplified, ['一点', '一点儿']); assert.deepEqual(yd.readings, ['yìdiǎn', 'yìdiǎnr'])
  assert.ok(r.bundle.records[3].candidate.flags.includes('long'))
  assert.deepEqual(r.bundle.records[4].candidate.variants, [{ raw: 'shuí', reading: 'shuí' }])
  assert.match(r.bundle.report.problems.unsupported.join('|'), /font\.ttf/, 'the font is reported, not imported')
  assert.equal(readdirSync(join(s.sourcesDir, 'accc-anki/media')).length, NOTES.length)
  assert.ok(existsSync(join(s.sourcesDir, 'accc-anki/placement.json')) && existsSync(join(s.sourcesDir, 'index.json')))
  // Importing must not touch the playable content or courses.
  assert.equal(readFileSync(join(s.contentDir, 'words.json'), 'utf8'), readFileSync(new URL('../src/content/words.json', import.meta.url), 'utf8'))
  assert.equal(readFileSync(join(s.contentDir, 'curricula.json'), 'utf8'), readFileSync(new URL('../src/content/curricula.json', import.meta.url), 'utf8'))
})

test('import: the same package twice creates no duplicates and identical files', () => {
  const s = scratch()
  writeFileSync(s.pkg, buildApkg(NOTES, media()))
  importSource({ source: 'accc-anki', file: s.pkg, retrieved: '2026-11-02', sourcesDir: s.sourcesDir, contentDir: s.contentDir })
  const files = ['records.json', 'content.json', 'manifest.json', 'report.md', 'diff.json'].map(f => readFileSync(join(s.sourcesDir, 'accc-anki', f), 'utf8'))
  const again = importSource({ source: 'accc-anki', file: s.pkg, sourcesDir: s.sourcesDir, contentDir: s.contentDir })
  assert.equal(again.snapshotChanged, false)
  assert.equal(again.bundle.records.length, NOTES.length)
  assert.deepEqual(['records.json', 'content.json', 'manifest.json', 'report.md', 'diff.json'].map(f => readFileSync(join(s.sourcesDir, 'accc-anki', f), 'utf8')), files)
  assert.equal(readdirSync(join(s.sourcesDir, 'accc-anki/media')).length, NOTES.length)
  assert.equal(readStoredSource('accc-anki', s.sourcesDir)!.manifest.snapshot.retrieved, '2026-11-02', 'the retrieval date is kept')
})

test('reimport: changed and removed records keep their decisions and flag them for reassessment', () => {
  const s = scratch()
  writeFileSync(s.pkg, buildApkg(NOTES, media()))
  const first = importSource({ source: 'accc-anki', file: s.pkg, sourcesDir: s.sourcesDir, contentDir: s.contentDir })
  const hash = (k: string) => first.bundle.records.find(r => r.key === k)!.hash
  const decision = { by: 'tester', on: '2026-11-02', how: 'person' as const }
  const mappings: MappingsFile = { schemaVersion: 1, mappings: {
    'accc-anki:B1-L01-01': { status: 'linked', entry: '个', recordHash: hash('accc-anki:B1-L01-01'), decision },
    'accc-anki:B1-L01-02': { status: 'linked', entry: '看-look', recordHash: hash('accc-anki:B1-L01-02'), decision },
    'accc-anki:B2-L01-02': { status: 'excluded', reason: 'test', recordHash: hash('accc-anki:B2-L01-02'), decision }
  } }
  writeJson(join(s.contentDir, 'sourceMappings.json'), mappings)
  const changed = NOTES.filter(n => n.ID !== 'B1-L01-02').map(n => (n.ID === 'B1-L01-01' ? { ...n, Meaning: 'general measure word' } : n))
  writeFileSync(s.pkg, buildApkg(changed, media()))
  const second = importSource({ source: 'accc-anki', file: s.pkg, sourcesDir: s.sourcesDir, contentDir: s.contentDir })
  assert.deepEqual(second.diff.changed, ['accc-anki:B1-L01-01'])
  assert.deepEqual(second.diff.removed, ['accc-anki:B1-L01-02'])
  const after = readRepoState(s.contentDir).mappings.mappings
  assert.equal(after['accc-anki:B1-L01-01'].status, 'linked', 'the decision is preserved')
  assert.equal(after['accc-anki:B1-L01-01'].reassess, 'source record changed')
  assert.equal(after['accc-anki:B1-L01-02'].reassess, 'source record removed')
  assert.equal(after['accc-anki:B2-L01-02'].reassess, undefined, 'unchanged records are not flagged')
  assert.equal(second.flagged.length, 2)
})

test('import: duplicate deck IDs get distinct, reported keys', () => {
  const s = scratch()
  const notes = [note('B1-L01-01', '个', 'ge', 'a', { guid: 'g1' }), note('B1-L01-01', '人', 'rén', 'person', { guid: 'g2', Audio: '' })]
  writeFileSync(s.pkg, buildApkg(notes, { 'B1-L01-01.mp3': fakeMp3('x') }))
  const r = importSource({ source: 'accc-anki', file: s.pkg, sourcesDir: s.sourcesDir, contentDir: s.contentDir })
  assert.deepEqual(r.bundle.records.map(x => x.key).sort(), ['accc-anki:B1-L01-01~g1', 'accc-anki:B1-L01-01~g2'])
  assert.equal(r.bundle.report.counts.duplicateIds, 1)
})

test('import: missing media is reported, not fatal', () => {
  const s = scratch()
  writeFileSync(s.pkg, buildApkg([note('B1-L01-01', '个', 'ge', 'a')], {}))
  const r = importSource({ source: 'accc-anki', file: s.pkg, sourcesDir: s.sourcesDir, contentDir: s.contentDir })
  assert.equal(r.bundle.report.problems['missing-media'].length, 1)
  assert.equal(r.bundle.content.length, 0, 'no recording item without a file')
})

test('archive safety: unsafe member names are refused and output paths cannot escape their directory', () => {
  assert.throws(() => safeJoin('/tmp/out', '../evil'), /unsafe|escapes/)
  assert.throws(() => safeJoin('/tmp/out', '/etc/passwd'), /unsafe/)
  assert.throws(() => safeJoin('/tmp/out', 'a/../../b'), /unsafe/)
  assert.equal(safeJoin('/tmp/out', 'a/b.mp3'), '/tmp/out/a/b.mp3')
  const evil = writeZip([{ name: '../evil.txt', data: Buffer.from('x') }])
  assert.throws(() => readZip(evil), /unsafe member name/)
  const ok = writeZip([{ name: 'a.txt', data: Buffer.from('hello') }])
  const zip = readZip(ok)
  assert.equal(readEntry(ok, zip.get('a.txt')!).toString(), 'hello')
  // An .apkg whose media map points at a traversal name still only writes generated names.
  const s = scratch()
  writeFileSync(s.pkg, buildApkg([note('B1-L01-01', '个', 'ge', 'a', { Audio: '[sound:../../x.mp3]' })], { '../../x.mp3': fakeMp3('x') }))
  const b = readAnkiPackage({ source: 'accc-anki', file: s.pkg, mediaDir: join(s.dir, 'm'), mediaPrefix: 'sources/accc-anki/media' })
  assert.match(b.records[0].media[0].path!, /^sources\/accc-anki\/media\/[0-9a-f]{16}\.mp3$/)
  assert.ok(!existsSync(join(s.dir, '..', 'x.mp3')))
})

test('matching: spelling alone never confirms; readings and meanings are explained', () => {
  const s = scratch()
  writeFileSync(s.pkg, buildApkg(NOTES, media()))
  const b = readAnkiPackage({ source: 'accc-anki', file: s.pkg, mediaDir: join(s.dir, 'm'), mediaPrefix: 'sources/accc-anki/media' })
  const ge = suggest(b.records[0], WORDS)
  assert.equal(ge[0].entry, '个'); assert.equal(ge[0].reading, 'speech', 'Anki "ge" is the game\'s connected-speech form of gè')
  assert.notEqual(ge[0].confidence, 'strong')
  assert.ok(ge[0].warnings.some(w => /pinyin listening/.test(w)))
  const kan = suggest(b.records[1], WORDS)
  const look = kan.find(x => x.entry === '看-look')!, guard = kan.find(x => x.entry === '看-guard')!
  assert.equal(look.reading, 'main'); assert.equal(guard.confidence, 'conflict', '看 kān is a different reading: same spelling is not a match')
  assert.ok(look.score > guard.score)
  const shei = suggest(b.records[4], WORDS)
  assert.equal(shei[0]?.entry, '谁')
})
