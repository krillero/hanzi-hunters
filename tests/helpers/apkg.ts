// Builds small .apkg fixture packages for tests: the same layout as the ACCC deck (a stub collection.anki2, the real deck in
// collection.anki21, a JSON media map, numbered media members). Nothing here is real deck content.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { writeZip } from '../../tools/sources/zip.ts'

export type FixtureNote = { ID: string; Traditional: string; Simplified: string; Pinyin: string; POS: string; Meaning: string; Audio: string; Variants: string; guid?: string }
export const FIELDS = ['ID', 'Traditional', 'Simplified', 'Pinyin', 'POS', 'Meaning', 'Audio', 'Variants'] as const

/** A tiny but valid MP3 frame header followed by padding (enough for the signature check; not playable speech). */
export const fakeMp3 = (seed: string) => Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0]), Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.from(seed.padEnd(64, '.'))])

function collection(notes: FixtureNote[]): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-col-'))
  const path = join(dir, 'c.db')
  const db = new DatabaseSync(path)
  db.exec(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`)
  const models = { '1500000000001': { name: 'ACCC fixture', flds: FIELDS.map((name, ord) => ({ name, ord })), tmpls: [{ name: 'Card 1', qfmt: '<script>alert(1)</script>{{Simplified}}', afmt: '{{Meaning}}' }] } }
  const decks = { '1': { name: 'Default' }, '2001': { name: 'ACCC::B1' } }
  db.prepare('INSERT INTO col VALUES (1,0,0,0,11,0,0,0,?,?,?,?,?)').run('{}', JSON.stringify(models), JSON.stringify(decks), '{}', '{}')
  const ins = db.prepare('INSERT INTO notes VALUES (?,?,?,0,0,?,?,0,0,0,?)')
  const card = db.prepare('INSERT INTO cards VALUES (?,?,2001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,?)')
  notes.forEach((n, i) => {
    const id = 1600000000000 + i
    ins.run(id, n.guid ?? `guid${i}`, 1500000000001, ' fixture ', FIELDS.map(f => n[f]).join('\x1f'), '')
    card.run(1700000000000 + i, id, '')
  })
  db.close()
  const buf = readFileSync(path)
  rmSync(dir, { recursive: true, force: true })
  return buf
}

/** The stub that newer Anki writes into collection.anki2 for old clients. */
const stub = () => collection([{ ID: '', Traditional: '', Simplified: '請更新', Pinyin: '', POS: '', Meaning: 'Please update to the latest Anki version', Audio: '', Variants: '' }])

export function buildApkg(notes: FixtureNote[], media: Record<string, Buffer>, extraMembers: { name: string; data: Buffer }[] = []): Buffer {
  const names = Object.keys(media)
  const map: Record<string, string> = {}
  names.forEach((n, i) => { map[String(i)] = n })
  return writeZip([
    { name: 'collection.anki2', data: stub() },
    { name: 'collection.anki21', data: collection(notes) },
    { name: 'media', data: Buffer.from(JSON.stringify(map)) },
    ...names.map((n, i) => ({ name: String(i), data: media[n] })),
    ...extraMembers
  ])
}

export const note = (ID: string, Simplified: string, Pinyin: string, Meaning: string, extra: Partial<FixtureNote> = {}): FixtureNote =>
  ({ ID, Traditional: Simplified, Simplified, Pinyin, POS: 'N', Meaning, Audio: `[sound:${ID}.mp3]`, Variants: '', ...extra })
