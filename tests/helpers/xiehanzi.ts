// Fixture packages shaped like Anki-xiehanzi: ONE real collection.anki2 (no anki21), one note type with the deck's 13 fields,
// several HSK subdecks, HTML fields. Nothing here is real deck content.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { writeZip } from '../../tools/sources/zip.ts'

export const XFIELDS = ['Simplified', 'Traditional', 'Pinyin', 'Zhuyin', 'PartOfSpeech', 'SimpleMeaning', 'Definitions', 'Breakdown', 'Radical', 'HskLevel', 'Frequency', 'Examples', 'Audio'] as const
export type XNote = { guid: string; deck: string; fields: Partial<Record<(typeof XFIELDS)[number], string>> }
export const DECKS: Record<string, string> = { '11': 'Anki xiehanzi::New HSK (2025)::HSK 1', '12': 'Anki xiehanzi::New HSK (2025)::HSK 2' }

export const simple = (s: string) => `<div class="info-card-title">Common Meaning</div><div class="simple-content">${s}</div>`
export const defs = (blocks: [string, string[]][]) => blocks.map(([py, senses]) => `<div class="meaning-container">\n  <div class="char"><span id="char-sim-id">x</span></div>\n  <div class="pinyin">${py}</div>\n  <div class="zhuyin">ㄅ</div>\n  <div class="meaning">${senses.map((x, i) => `<span class="def-num">${i + 1}.</span> ${x}`).join('<br>')}<div class="cl-row"><span class="cl-label">measure word</span><span class="cl-chip">個<span class="cl-simp">/个</span><span class="cl-pin">ge4</span></span></div></div>\n</div>`).join('\n')
export const examples = (items: [string, string, string][]) => items.map(([zh, py, en]) => `<div class="example-item"><div class="example-sim">${[...zh].map(c => `<span class="ex-tone1">${c}</span>`).join('')}</div><div class="example-pinyin">${py.split(' ').map(s => `<span class="ex-tone1">${s}</span>`).join(' ')}</div><div class="example-translation">${en}</div></div>`).join('')

export function buildXiehanziApkg(notes: XNote[], media: Record<string, Buffer>): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-x-'))
  const path = join(dir, 'c.db')
  const db = new DatabaseSync(path)
  db.exec(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`)
  const models = { '77': { name: 'Basic - (Anki-xiehanzi)', flds: XFIELDS.map((name, ord) => ({ name, ord })), tmpls: [{ name: 'Card', qfmt: '<script>document.title="pwned"</script>{{Simplified}}', afmt: '{{Definitions}}' }] } }
  const decks = Object.fromEntries(Object.entries(DECKS).map(([id, name]) => [id, { name }]))
  db.prepare('INSERT INTO col VALUES (1,0,0,0,11,0,0,0,?,?,?,?,?)').run('{}', JSON.stringify(models), JSON.stringify(decks), '{}', '{}')
  const ins = db.prepare('INSERT INTO notes VALUES (?,?,77,0,0,?,?,0,0,0,?)')
  const card = db.prepare('INSERT INTO cards VALUES (?,?,?,0,0,0,0,0,0,0,0,0,0,0,0,0,0,?)')
  notes.forEach((n, i) => {
    ins.run(i + 1, n.guid, 'Xiehanzi', XFIELDS.map(f => n.fields[f] ?? '').join('\x1f'), '')
    card.run(1000 + i, i + 1, Number(Object.entries(DECKS).find(([, v]) => v === n.deck)![0]), '')
  })
  db.close()
  const col = readFileSync(path)
  rmSync(dir, { recursive: true, force: true })
  const names = Object.keys(media)
  return writeZip([{ name: 'collection.anki2', data: col }, { name: 'media', data: Buffer.from(JSON.stringify(Object.fromEntries(names.map((n, i) => [String(i), n])))) }, ...names.map((n, i) => ({ name: String(i), data: media[n] }))])
}
