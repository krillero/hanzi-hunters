// Anki .apkg adapter. Reads the package's real collection (collection.anki21 when present: in many packages collection.anki2 is
// only a stub saying "please update Anki"), the media mapping, and every note. Templates and their JavaScript are never read or
// run: only note fields, note/card ids, deck names and the field names of the note types.
//
// Record key: "<source>:<ID field>" (the deck's own stable "ID"). Uniqueness is validated; duplicated IDs get "~<note guid>"
// appended and are reported. The Anki note id and guid are kept in `native`.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { splitSyllables } from '../../../src/content/pinyin.ts'
import {
  SOURCE_SCHEMA_VERSION, type Candidate, type ContentItem, type ImportReport, type MediaRef, type Placement, type RecordingItem,
  type SourceBundle, type SourceRecord
} from '../../../src/sources/types.ts'
import { readEntry, readZip, safeJoin } from '../zip.ts'

export type AnkiOptions = {
  /** Source id (key in sources.json), e.g. "accc-anki". */
  source: string
  /** Path of the .apkg file. */
  file: string
  /** Directory to write media to (created). Files are named by content hash, so reimports never duplicate them. */
  mediaDir: string
  /** Site-relative prefix of mediaDir, e.g. "sources/accc-anki/media". */
  mediaPrefix: string
  retrieved?: string
  /** Map of our field roles to the deck's field names. Defaults fit the ACCC deck. */
  fields?: Partial<Record<'id' | 'traditional' | 'simplified' | 'pinyin' | 'pos' | 'meaning' | 'audio' | 'variants', string>>
}

const DEFAULT_FIELDS = { id: 'ID', traditional: 'Traditional', simplified: 'Simplified', pinyin: 'Pinyin', pos: 'POS', meaning: 'Meaning', audio: 'Audio', variants: 'Variants' }
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const HAN = /\p{Script=Han}/u
const ONLY_HAN = /^\p{Script=Han}+$/u

/** Plain text of an Anki field: tags removed, common entities decoded, whitespace collapsed. The original stays in `fields`. */
export function plain(html: string): string {
  return html
    .replace(/\[sound:[^\]]*\]/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t　]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

/**
 * Parenthesised parts, as this deck uses them:
 *  - erhua, optional:          一點(兒) / yìdiǎn(r)            -> 一點, 一點兒 / yìdiǎn, yìdiǎnr
 *  - at the start, optional:   (台)斤 / (Tái) jīn              -> 斤, 台斤 / jīn, Tái jīn
 *  - at the end, another form: 公共汽車（公車）/ Shīdà (Shīfàn Dàxué) -> 公共汽車, 公車 (abbreviation or full form)
 * Anything else is left as it is (and reported if it does not parse).
 */
function parenForms(s: string, han: boolean): string[] {
  const m = s.match(/^(.*?)\s*[(（]([^()（）]+)[)）]\s*(.*)$/)
  if (!m) return [s]
  const [, before, inner, after] = m
  if (han ? !ONLY_HAN.test(inner) : !/^[\p{L}\p{M}' ]+$/u.test(inner)) return [s]
  const tidy = (x: string) => x.replace(/\s+/g, ' ').trim()
  const erhua = han ? inner === '兒' || inner === '儿' : inner === 'r'
  if (!erhua && before.trim() && !after.trim()) return [...parenForms(before, han), ...parenForms(inner, han)]
  const without = tidy(`${before} ${after}`)
  const withIt = erhua ? tidy(`${before}${inner}${after}`) : tidy(s.replace(/[(（)）]/g, ' '))
  return [...parenForms(without, han), ...parenForms(withIt, han)]
}

/** Alternatives are separated by "/" in this deck; commas belong to phrases ("shēntǐ fǎfū, shòuzhī fùmǔ"). */
const splitAlternatives = (s: string) => s.split(/\s*[\/／]\s*|\n/).map(x => x.trim()).filter(Boolean)

/** The Variants field: a JSON list of {Traditional, Simplified, Pinyin}, or free text in other decks. */
function parseVariants(raw: string, issues: string[]): Candidate['variants'] {
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const list = JSON.parse(raw) as { Traditional?: string; Simplified?: string; Pinyin?: string }[]
      return list.map(v => ({ raw: JSON.stringify(v), ...(v.Simplified ? { form: v.Simplified.replace(/\s+/g, '') } : {}), ...(v.Pinyin ? { reading: v.Pinyin.normalize('NFC') } : {}) }))
    } catch { issues.push('parse: Variants looks like JSON but does not parse') }
  }
  return splitAlternatives(raw).map(r => {
    const form = (r.match(/\p{Script=Han}+/gu) ?? []).join('') || undefined
    const latin = r.replace(/[\p{Script=Han}()（）:：]/gu, ' ').trim().normalize('NFC')
    return { raw: r, ...(form ? { form } : {}), ...(latin && splitSyllables(latin) ? { reading: latin } : {}) }
  })
}

export function parseCandidate(f: Record<string, string>, names: typeof DEFAULT_FIELDS, issues: string[]): Candidate {
  const flags: string[] = []
  const simplifiedRaw = plain(f[names.simplified] ?? '')
  const traditionalRaw = plain(f[names.traditional] ?? '')
  const forms = (raw: string) => splitAlternatives(raw).flatMap(x => parenForms(x, true)).map(x => x.replace(/\s+/g, ''))
  const simplified = [...new Set(forms(simplifiedRaw))]
  const traditional = [...new Set(forms(traditionalRaw))]
  if (!simplifiedRaw) issues.push('missing-field: Simplified is empty')
  const pinyinRaw = plain(f[names.pinyin] ?? '')
  const readings = [...new Set(splitAlternatives(pinyinRaw.normalize('NFC')).flatMap(x => parenForms(x, false)))]
  if (!pinyinRaw) issues.push('missing-field: Pinyin is empty')
  for (const r of readings) {
    const plainR = r.replace(/[.,!?。，！？]/g, '')
    if (splitSyllables(plainR)) continue
    // Erhua (一点儿 yìdiǎnr): valid, but the game's pinyin checker does not support it yet.
    if (/r$/.test(plainR) && splitSyllables(plainR.slice(0, -1))) { if (!flags.includes('erhua')) flags.push('erhua'); continue }
    issues.push(`parse: reading "${r}" is not plain tone-marked pinyin`)
  }
  const meaningRaw = plain(f[names.meaning] ?? '')
  if (!meaningRaw) issues.push('missing-field: Meaning is empty')
  const meanings = meaningRaw.split(/\s*(?:[;；]|\n)\s*/).map(x => x.trim()).filter(Boolean)
  const pos = plain(f[names.pos] ?? '').split(/[\s,\/;，、]+/).filter(Boolean)
  const variants = parseVariants((f[names.variants] ?? '').trim(), issues)
  const main = simplified[0] ?? ''
  const n = [...main].length
  if (n > 8) flags.push('too-long')
  else if (n > 4) flags.push('long')
  if (main && !ONLY_HAN.test(main)) flags.push('pattern')
  if (/\s/.test(simplifiedRaw.replace(/\n/g, ''))) flags.push('phrase')
  // Proper nouns: the source capitalises their pinyin (Xiǎomíng, Táiwān); a hint for review, not a fact.
  if (pos.some(p => /^(n\.?p|pn|name|proper|專名|专名)$/i.test(p)) || /^\p{Lu}/u.test(readings[0] ?? '')) flags.push('name')
  if (simplified.length > 1) flags.push('several-forms')
  if (readings.length > 1) flags.push('several-readings')
  if (main && !HAN.test(main)) issues.push('parse: Simplified has no Chinese characters')
  return { simplified, traditional, readings, pos, meanings, variants, flags }
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }
/** "B1L01-I-12" (book 1, lesson 1, part I, item 12), "B5L01-I-0-05" / "B6L01-III-T-01" (part, section "0" / "T", item); also "B1-L01-03". */
export function parsePlacement(id: string): Omit<Placement, 'order'> | null {
  const d = id.match(/^B(\d+)L(\d+)-([IVX]+)-(?:(\d+|[A-Z])-)?(\d+)$/i)
  if (d) {
    const [book, lesson, item] = [Number(d[1]), Number(d[2]), Number(d[5])]
    const part = d[3].toUpperCase(), section = d[4]?.toUpperCase()
    return { book, lesson, part, ...(section !== undefined ? { section } : {}), item, label: `B${book} L${String(lesson).padStart(2, '0')} ${part}${section !== undefined ? `-${section}` : ''} #${item}` }
  }
  const m = id.match(/B\s*(\d+)\D*?L\s*(\d+)\D*?(\d+)/i) ?? id.match(/^(\d+)[-_.](\d+)[-_.](\d+)/)
  if (!m) return null
  const [book, lesson, item] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return { book, lesson, item, label: `B${book} L${String(lesson).padStart(2, '0')} #${item}` }
}

/** File signature check: what we can honestly say about a file without decoding it. */
export function audioSignature(b: Buffer): string | null {
  if (b.length >= 3 && b.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3-id3'
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mpeg-frame-sync'
  if (b.length >= 4 && b.subarray(0, 4).toString('latin1') === 'OggS') return 'ogg'
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav'
  return null
}
const AUDIO_EXT = new Set(['mp3', 'ogg', 'wav', 'm4a', 'opus'])
const FONT_EXT = new Set(['ttf', 'otf', 'woff', 'woff2'])
const extOf = (name: string) => (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toLowerCase()

type Row = Record<string, unknown>

export function readAnkiPackage(opts: AnkiOptions): SourceBundle {
  const names = { ...DEFAULT_FIELDS, ...opts.fields }
  const pkg = readFileSync(opts.file)
  const pkgSha = sha256(pkg)
  const snapshotId = pkgSha.slice(0, 12)
  const zip = readZip(pkg)
  const problems: Record<string, string[]> = {}
  const problem = (kind: string, msg: string) => { (problems[kind] ??= []).push(msg) }
  const counts: Record<string, number> = { zipMembers: zip.size }

  // ---- collection ----
  const collectionName = zip.has('collection.anki21') ? 'collection.anki21' : zip.has('collection.anki2') ? 'collection.anki2' : null
  if (zip.has('collection.anki21b') && !zip.has('collection.anki21')) throw new Error('This package only has collection.anki21b (zstd, Anki 2.1.50+ format), which this importer does not read yet. Export with "Support older Anki versions" or extend the adapter.')
  if (!collectionName) throw new Error('No collection.anki21 / collection.anki2 in the package')
  if (collectionName === 'collection.anki2') problem('unsupported', 'Only collection.anki2 is present: check that it holds the full deck (in newer packages it is a stub)')
  const tmp = mkdtempSync(join(tmpdir(), 'apkg-'))
  const open = (member: string) => { const p = join(tmp, member.replace(/[^a-z0-9.]/gi, '_')); writeFileSync(p, readEntry(pkg, zip.get(member)!)); return new DatabaseSync(p, { readOnly: true }) }
  try {
    // How many notes each collection file has (documents which file is the real one).
    for (const c of ['collection.anki2', 'collection.anki21']) if (zip.has(c)) {
      const d = open(c); try { counts[`notesIn_${c}`] = Number((d.prepare('SELECT count(*) AS n FROM notes').get() as Row).n) } finally { d.close() }
    }
    const db = open(collectionName)
    try {
      const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Row[]).map(r => String(r.name)))
      // Note types -> field names. Schema 11 keeps them as JSON in col.models; newer schemas have notetypes/fields tables.
      const fieldNames = new Map<string, string[]>()
      const modelNames = new Map<string, string>()
      const col = db.prepare('SELECT * FROM col').get() as Row
      const modelsJson = typeof col?.models === 'string' ? col.models : ''
      if (modelsJson && modelsJson !== '{}') {
        for (const [mid, m] of Object.entries(JSON.parse(modelsJson) as Record<string, { name: string; flds: { name: string; ord: number }[] }>)) {
          fieldNames.set(String(mid), [...m.flds].sort((a, b) => a.ord - b.ord).map(f => f.name)); modelNames.set(String(mid), m.name)
        }
      } else if (tables.has('fields')) {
        for (const r of db.prepare('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord').all() as Row[]) {
          const k = String(r.ntid); fieldNames.set(k, [...(fieldNames.get(k) ?? []), String(r.name)])
        }
        if (tables.has('notetypes')) for (const r of db.prepare('SELECT id, name FROM notetypes').all() as Row[]) modelNames.set(String(r.id), String(r.name))
      }
      const deckNames = new Map<string, string>()
      const decksJson = typeof col?.decks === 'string' ? col.decks : ''
      if (decksJson && decksJson !== '{}') for (const [id, d] of Object.entries(JSON.parse(decksJson) as Record<string, { name: string }>)) deckNames.set(String(id), d.name)
      else if (tables.has('decks')) for (const r of db.prepare('SELECT id, name FROM decks').all() as Row[]) deckNames.set(String(r.id), String(r.name).replace(/\x1f/g, '::'))

      const notes = db.prepare('SELECT CAST(id AS TEXT) AS id, guid, CAST(mid AS TEXT) AS mid, tags, flds FROM notes ORDER BY id').all() as Row[]
      const cards = db.prepare('SELECT CAST(id AS TEXT) AS id, CAST(nid AS TEXT) AS nid, CAST(did AS TEXT) AS did FROM cards ORDER BY id').all() as Row[]
      counts.notes = notes.length; counts.cards = cards.length; counts.noteTypes = fieldNames.size
      const cardsOf = new Map<string, Row[]>()
      for (const c of cards) cardsOf.set(String(c.nid), [...(cardsOf.get(String(c.nid)) ?? []), c])

      // ---- media mapping ("0" -> "file.mp3") ----
      let mediaMap: Record<string, string> = {}
      if (zip.has('media')) {
        const raw = readEntry(pkg, zip.get('media')!)
        try { mediaMap = JSON.parse(raw.toString('utf8')) as Record<string, string> } catch { throw new Error('The media file is not JSON (newer protobuf/zstd format): not supported by this importer yet') }
      }
      const memberOf = new Map<string, string>()
      for (const [member, name] of Object.entries(mediaMap)) {
        if (memberOf.has(name)) problem('duplicate-media', `media name ${name} is mapped twice`)
        memberOf.set(name, member)
        if (!zip.has(member)) problem('missing-media', `media mapping lists ${member} (${name}) but the archive has no such member`)
      }
      counts.mediaFiles = Object.keys(mediaMap).length
      const byExt: Record<string, number> = {}
      for (const n of Object.values(mediaMap)) { const e = extOf(n) || '(none)'; byExt[e] = (byExt[e] ?? 0) + 1 }
      for (const [e, n] of Object.entries(byExt)) counts[`media_${e}`] = n

      // ---- notes -> records ----
      const idCount = new Map<string, number>()
      const parsed = notes.map(n => {
        const fnames = fieldNames.get(String(n.mid)) ?? []
        const values = String(n.flds).split('\x1f')
        const fields: Record<string, string> = {}
        values.forEach((v, i) => { fields[fnames[i] ?? `field${i + 1}`] = v })
        if (values.length !== fnames.length) problem('parse', `note ${n.id}: ${values.length} field values but the note type has ${fnames.length} fields`)
        const originalId = (fields[names.id] ?? '').trim()
        if (originalId) idCount.set(originalId, (idCount.get(originalId) ?? 0) + 1)
        return { n, fields, originalId }
      })
      for (const k of Object.keys(DEFAULT_FIELDS) as (keyof typeof DEFAULT_FIELDS)[]) {
        if (!parsed.some(p => names[k] in p.fields)) problem('missing-field', `no note has a "${names[k]}" field`)
      }
      const dupes = [...idCount].filter(([, c]) => c > 1)
      counts.duplicateIds = dupes.length
      for (const [id, c] of dupes) problem('duplicate-id', `ID "${id}" is used by ${c} notes; their keys get "~<guid>" appended`)

      const usedMedia = new Set<string>()
      const records: SourceRecord[] = []
      const content: ContentItem[] = []
      if (!existsSync(opts.mediaDir)) mkdirSync(opts.mediaDir, { recursive: true })
      for (const { n, fields, originalId } of parsed) {
        const issues: string[] = []
        const local = !originalId ? `note-${n.id}` : (idCount.get(originalId) ?? 0) > 1 ? `${originalId}~${String(n.guid)}` : originalId
        if (!originalId) issues.push(`missing-field: ${names.id} is empty; key uses the Anki note id`)
        const key = `${opts.source}:${local}`
        const candidate = parseCandidate(fields, names, issues)
        const pl = parsePlacement(originalId)
        if (originalId && !pl) issues.push(`parse: could not read book/lesson/item from ID "${originalId}"`)
        // media referenced by any field (normally only Audio)
        const media: MediaRef[] = []
        for (const value of Object.values(fields)) for (const m of value.matchAll(/\[sound:([^\]]+)\]/g)) {
          const original = m[1]
          usedMedia.add(original)
          const ref: MediaRef = { id: '', kind: 'audio', original, checks: [], problems: [] }
          const member = memberOf.get(original)
          if (!member || !zip.has(member)) { ref.id = `${opts.source}:media:missing:${original}`; ref.problems.push('referenced file is not in the package'); problem('missing-media', `${key}: ${original}`); media.push(ref); continue }
          const data = readEntry(pkg, zip.get(member)!)
          ref.checks.push('present', 'crc32')
          const sha = sha256(data)
          ref.sha256 = sha; ref.bytes = data.length
          ref.id = `${opts.source}:media:${sha.slice(0, 16)}`
          if (data.length === 0) { ref.problems.push('empty file'); problem('bad-media', `${key}: ${original} is empty`) } else ref.checks.push('non-empty')
          const ext = extOf(original)
          const sig = audioSignature(data)
          if (sig) ref.checks.push(`signature:${sig}`)
          else { ref.problems.push('no known audio signature'); problem('bad-media', `${key}: ${original} has no known audio signature`) }
          if (!AUDIO_EXT.has(ext)) { ref.problems.push(`unexpected extension .${ext}`); problem('unsupported', `${key}: ${original} is not a known audio type`) }
          if (data.length > 0 && AUDIO_EXT.has(ext)) {
            const fileName = `${sha.slice(0, 16)}.${ext}`
            const out = safeJoin(opts.mediaDir, fileName)
            if (!existsSync(out)) writeFileSync(out, data)
            ref.path = `${opts.mediaPrefix}/${fileName}`
          }
          media.push(ref)
        }
        if (media.length === 0 && names.audio in fields) issues.push('missing-media: no [sound:] reference')
        const hash = sha256(JSON.stringify({ fields, media: media.map(m => m.sha256 ?? m.original) })).slice(0, 16)
        const noteCards = cardsOf.get(String(n.id)) ?? []
        const native: Record<string, string> = { noteId: String(n.id), guid: String(n.guid), noteType: modelNames.get(String(n.mid)) ?? String(n.mid), cards: noteCards.map(c => String(c.id)).join(',') }
        const decks = [...new Set(noteCards.map(c => deckNames.get(String(c.did)) ?? String(c.did)))]
        if (decks.length) native.deck = decks.join(' | ')
        if (String(n.tags ?? '').trim()) native.tags = String(n.tags).trim()
        for (const i of issues) problem(i.split(':')[0], `${key}: ${i.slice(i.indexOf(':') + 1).trim()}`)
        const record: SourceRecord = { key, source: opts.source, originalId: originalId || `note-${n.id}`, native, snapshot: snapshotId, hash, fields, candidate, media, issues, ...(pl ? { placement: { ...pl, order: 0 } } : {}) }
        records.push(record)
        for (const m of media) if (m.path && m.sha256) {
          const rec: RecordingItem = {
            type: 'recording', id: `${opts.source}:recording:${local}`, scope: 'word', media: m.id, file: m.path, sha256: m.sha256,
            text: candidate.simplified[0] ?? candidate.traditional[0] ?? '', ...(candidate.readings[0] ? { declaredReading: candidate.readings[0] } : {}),
            provenance: { source: opts.source, record: key, recordHash: hash, mode: 'verbatim' },
            review: { status: 'imported' },
            links: [{ record: key, role: 'teaches' }]
          }
          if (content.some(c => c.id === rec.id)) rec.id = `${rec.id}:${m.sha256.slice(0, 8)}`
          content.push(rec)
        }
      }
      // Stable order: book, lesson, part (I, II, III), section (numbered sections such as "0" first, then the main list, then
      // lettered sections such as "T"), item, note id.
      const sec = (x?: string) => (x === undefined ? 1e6 : /^\d+$/.test(x) ? Number(x) : 2e6 + x.charCodeAt(0))
      const pos = (r: SourceRecord) => [r.placement?.book ?? 1e9, r.placement?.lesson ?? 1e9, ROMAN[r.placement?.part ?? ''] ?? 0, sec(r.placement?.section), r.placement?.item ?? 1e9, Number(r.native.noteId)]
      records.sort((a, b) => { const x = pos(a), y = pos(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 })
      records.forEach((r, i) => { if (r.placement) r.placement.order = i })
      const keys = new Set<string>()
      for (const r of records) { if (keys.has(r.key)) throw new Error(`internal: duplicate record key ${r.key}`); keys.add(r.key) }

      const unreferenced = [...memberOf.keys()].filter(n => !usedMedia.has(n))
      counts.records = records.length
      counts.recordsWithAudio = records.filter(r => r.media.some(m => m.path)).length
      counts.recordings = content.length
      counts.mediaExtracted = new Set(content.map(c => (c as RecordingItem).sha256)).size
      counts.mediaUnreferenced = unreferenced.length
      for (const n of unreferenced) problem(FONT_EXT.has(extOf(n)) ? 'unsupported' : 'unreferenced-media', `${n}: in the package but not referenced by any note${FONT_EXT.has(extOf(n)) ? ' (font, used by the card templates; not imported)' : ''}`)
      counts.withPlacement = records.filter(r => r.placement).length
      for (const f of ['too-long', 'long', 'pattern', 'phrase', 'name', 'erhua', 'several-forms', 'several-readings']) counts[`flag_${f}`] = records.filter(r => r.candidate.flags.includes(f)).length
      counts.recordsWithIssues = records.filter(r => r.issues.length).length

      const report: ImportReport = {
        counts, problems,
        checksRan: [
          `read ${collectionName} (notes ${counts[`notesIn_${collectionName}`]})${zip.has('collection.anki2') && collectionName !== 'collection.anki2' ? `; collection.anki2 has ${counts['notesIn_collection.anki2']} notes and was not used` : ''}`,
          'every archive member name checked for path traversal; media written only under generated names <sha256 prefix>.<ext>',
          'each referenced media file: present in the media mapping and archive, CRC32 matches the archive, non-empty, sha256 recorded',
          'audio file signature (ID3 tag or MPEG frame sync / Ogg / WAV header)',
          'record key uniqueness',
          'no card template or script was read or executed'
        ],
        notChecked: [
          'whether a recording actually says the record\'s text or its declared pinyin (needs a person to listen)',
          'audio duration, loudness or decodability beyond the file signature',
          'whether the source\'s pinyin, meanings or part of speech are correct'
        ]
      }
      return {
        schemaVersion: SOURCE_SCHEMA_VERSION, source: opts.source, adapter: 'anki-apkg',
        snapshot: { id: snapshotId, sha256: pkgSha, file: opts.file.split(/[\\/]/).pop()!, bytes: pkg.length, ...(opts.retrieved ? { retrieved: opts.retrieved } : {}), detail: { collection: collectionName } },
        records, content, exercises: [], report
      }
    } finally { db.close() }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}
