// Changesets: validate and apply review decisions to the repository's content files, and flag decisions whose source changed.
// Pure (no fs): tools/source-apply.ts reads and writes the files; the review screen builds changesets with the same types.
import type { RawWord, SourceRef } from '../content/types.ts'
import { splitSyllables } from '../content/pinyin.ts'
import {
  SOURCE_SCHEMA_VERSION, type ChangeOp, type Changeset, type FieldSelection, type MappingsFile, type RecordingsFile,
  type SelectedRecording, type SelectionsFile, type SourceRecord
} from './types.ts'

export type RepoState = { words: RawWord[]; mappings: MappingsFile; recordings: RecordingsFile; selections: SelectionsFile }
export type SourceState = { source: string; snapshot: string; records: Map<string, SourceRecord> }
export type ApplyResult = { ok: boolean; conflicts: string[]; warnings: string[]; summary: string[]; state: RepoState }

export const emptyMappings = (): MappingsFile => ({ schemaVersion: SOURCE_SCHEMA_VERSION, mappings: {} })
export const emptyRecordings = (): RecordingsFile => ({ schemaVersion: SOURCE_SCHEMA_VERSION, recordings: [] })
export const emptySelections = (): SelectionsFile => ({ schemaVersion: SOURCE_SCHEMA_VERSION, selections: [] })

/** Structural equality for JSON values (key order ignored). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null   // null and a missing value are the same "nothing"
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => same(x, (b as unknown[])[i]))
  const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined)
  return ka.length === kb.length && ka.every(k => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export const entryIdOf = (w: RawWord) => w.id ?? w.hanzi
/** The selected word recording of an entry (one per entry). */
export const recordingOfEntry = (file: RecordingsFile, entry: string) => file.recordings.find(r => r.entry === entry && r.scope === 'word') ?? null
export const selectionOf = (file: SelectionsFile, entry: string, field: FieldSelection['field']) => file.selections.find(s => s.entry === entry && s.field === field) ?? null

/** A key identifying what an op changes: later ops on the same target replace earlier ones in the review screen. */
export const opTarget = (op: ChangeOp) => op.op === 'mapping' ? `mapping:${op.record}` : op.op === 'recording' ? `recording:${op.entry}` : `field:${op.entry}:${op.field}`

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** Shape checks that do not depend on the current repository state. */
export function checkChangesetShape(cs: unknown): string[] {
  const out: string[] = []
  const c = cs as Partial<Changeset>
  if (!c || typeof c !== 'object') return ['not a JSON object']
  if (c.kind !== 'hanzi-hunters-changeset') out.push('kind must be "hanzi-hunters-changeset"')
  if (c.schemaVersion !== SOURCE_SCHEMA_VERSION) out.push(`schemaVersion ${String(c.schemaVersion)} is not supported (expected ${SOURCE_SCHEMA_VERSION})`)
  if (typeof c.source !== 'string' || !c.source) out.push('source is required')
  if (typeof c.snapshot !== 'string' || !c.snapshot) out.push('snapshot is required')
  if (typeof c.reviewer !== 'string' || !c.reviewer.trim()) out.push('reviewer is required (who made these decisions)')
  if (!Array.isArray(c.ops)) out.push('ops must be an array')
  else {
    const seen = new Set<string>()
    c.ops.forEach((op, i) => {
      if (!op || !['mapping', 'recording', 'field'].includes(op.op)) { out.push(`ops[${i}]: unknown op`); return }
      const t = opTarget(op)
      if (seen.has(t)) out.push(`ops[${i}]: ${t} appears twice`)
      seen.add(t)
    })
  }
  return out
}

/**
 * Apply a changeset. All or nothing: any conflict leaves the state untouched. A conflict is reported when
 *  - the record no longer exists or its hash differs from the one the reviewer saw (the source changed: reassess)
 *  - the decision / recording / selection the reviewer saw (`before`) differs from the current one (someone changed it since)
 *  - the game text a field op was made against differs from words.json now
 *  - an op references an unknown entry or is internally inconsistent
 */
export function applyChangeset(state: RepoState, cs: Changeset, src: SourceState): ApplyResult {
  const conflicts = checkChangesetShape(cs)
  const warnings: string[] = []
  const summary: string[] = []
  if (conflicts.length) return { ok: false, conflicts, warnings, summary, state }
  if (cs.source !== src.source) return { ok: false, conflicts: [`changeset is for source "${cs.source}", not "${src.source}"`], warnings, summary, state }
  if (cs.snapshot !== src.snapshot) warnings.push(`made against snapshot ${cs.snapshot.slice(0, 12)}, current is ${src.snapshot.slice(0, 12)}: every op is checked against the current record hashes`)
  const next = clone(state)
  const ids = new Set(next.words.map(entryIdOf))
  const recordOk = (i: number, key: string, hash: string) => {
    const r = src.records.get(key)
    if (!r) { conflicts.push(`ops[${i}]: record ${key} is not in the current import (removed from the source?)`); return false }
    if (r.hash !== hash) { conflicts.push(`ops[${i}]: record ${key} changed since the review (hash ${hash} -> ${r.hash}); reassess it`); return false }
    return true
  }
  cs.ops.forEach((op, i) => {
    if (op.op === 'mapping') {
      if (!recordOk(i, op.record, op.recordHash)) return
      const cur = next.mappings.mappings[op.record] ?? null
      if (!same(cur, op.before)) { conflicts.push(`ops[${i}]: the mapping of ${op.record} changed since the review`); return }
      const a = op.after
      if (a.recordHash !== op.recordHash) { conflicts.push(`ops[${i}]: after.recordHash must equal recordHash`); return }
      if (a.status === 'linked' && (!a.entry || !ids.has(a.entry))) { conflicts.push(`ops[${i}]: linked to unknown entry "${a.entry ?? ''}"`); return }
      if (a.status === 'new-candidate' && !a.draft) { conflicts.push(`ops[${i}]: a new-entry candidate needs a draft`); return }
      if (a.status !== 'linked' && a.entry) { conflicts.push(`ops[${i}]: only a linked mapping has an entry`); return }
      const after = { ...a }; delete after.reassess
      next.mappings.mappings[op.record] = after
      summary.push(`mapping ${op.record}: ${cur?.status ?? 'unresolved'} -> ${a.status}${a.entry ? ` (${a.entry})` : ''}`)
    } else if (op.op === 'recording') {
      if (!recordOk(i, op.record, op.recordHash)) return
      if (!ids.has(op.entry)) { conflicts.push(`ops[${i}]: unknown entry "${op.entry}"`); return }
      const cur = recordingOfEntry(next.recordings, op.entry)
      if (!same(cur, op.before)) { conflicts.push(`ops[${i}]: the recording selected for ${op.entry} changed since the review`); return }
      if (op.after && (op.after.entry !== op.entry || op.after.provenance.record !== op.record)) { conflicts.push(`ops[${i}]: after must be for entry ${op.entry} and record ${op.record}`); return }
      if (op.after && op.after.provenance.recordHash !== op.recordHash) { conflicts.push(`ops[${i}]: after.provenance.recordHash must equal recordHash`); return }
      const mapping = next.mappings.mappings[op.record]
      if (op.after && !(mapping?.status === 'linked' && mapping.entry === op.entry)) warnings.push(`ops[${i}]: ${op.record} is not linked to ${op.entry}; the recording is selected anyway (link it too for clarity)`)
      next.recordings.recordings = next.recordings.recordings.filter(r => r !== cur)
      if (op.after) { const after: SelectedRecording = { ...op.after }; delete after.reassess; next.recordings.recordings.push(after) }
      summary.push(op.after ? `recording for ${op.entry}: ${op.record} (uses: ${op.after.uses.join(', ') || 'none'})` : `recording for ${op.entry}: removed`)
    } else {
      const w = next.words.find(x => entryIdOf(x) === op.entry)
      if (!w) { conflicts.push(`ops[${i}]: unknown entry "${op.entry}"`); return }
      if (w[op.field] !== op.currentValue) { conflicts.push(`ops[${i}]: the game's ${op.field} of ${op.entry} changed since the review ("${op.currentValue}" -> "${w[op.field]}")`); return }
      const cur = selectionOf(next.selections, op.entry, op.field)
      if (!same(cur, op.before)) { conflicts.push(`ops[${i}]: the ${op.field} selection of ${op.entry} changed since the review`); return }
      const a = { ...op.after }; delete a.reassess
      if (a.entry !== op.entry || a.field !== op.field) { conflicts.push(`ops[${i}]: after must be for ${op.entry}.${op.field}`); return }
      if (a.choice === 'source') {
        if (!a.value?.trim() || !a.provenance?.record) { conflicts.push(`ops[${i}]: a source choice needs a value and its provenance`); return }
        const rec = a.provenance.record
        const r = src.records.get(rec)
        if (!r) { conflicts.push(`ops[${i}]: record ${rec} is not in the current import`); return }
        if (a.provenance.recordHash !== r.hash) { conflicts.push(`ops[${i}]: record ${rec} changed since the review; reassess it`); return }
        w[op.field] = a.value.trim()
        const ref: SourceRef = { name: a.provenance.source, ref: rec, note: `${op.field} ${a.provenance.mode === 'verbatim' ? 'taken verbatim' : 'adapted'} from this record` }
        w.source = [...(w.source ?? []).filter(s => !(s.name === ref.name && s.ref === ref.ref && s.note === ref.note)), ref]
      }
      next.selections.selections = next.selections.selections.filter(s => s !== cur)
      next.selections.selections.push(a)
      summary.push(a.choice === 'game' ? `${op.field} of ${op.entry}: keep the game's text` : `${op.field} of ${op.entry}: "${op.currentValue}" -> "${a.value}" (${a.provenance?.mode})`)
    }
  })
  if (conflicts.length) return { ok: false, conflicts, warnings, summary: [], state }
  return { ok: true, conflicts, warnings, summary, state: next }
}

/**
 * After a (re)import: flag every committed decision whose record changed or disappeared. Never deletes or resets a decision;
 * the flag is cleared by the next decision about that record. Returns the flagged keys.
 */
export function flagReassessment(state: RepoState, src: SourceState): { state: RepoState; flagged: string[] } {
  const next = clone(state)
  const flagged: string[] = []
  const why = (key: string | undefined, hash: string | undefined) => {
    if (!key || !key.startsWith(`${src.source}:`)) return undefined
    const r = src.records.get(key)
    if (!r) return 'source record removed'
    return r.hash !== hash ? 'source record changed' : undefined
  }
  for (const [key, m] of Object.entries(next.mappings.mappings)) {
    const w = why(key, m.recordHash)
    if (w && m.reassess !== w) { m.reassess = w; flagged.push(`mapping ${key}: ${w}`) }
  }
  for (const r of next.recordings.recordings) {
    const w = why(r.provenance.record, r.provenance.recordHash)
    if (w && r.reassess !== w) { r.reassess = w; flagged.push(`recording ${r.id} (${r.entry}): ${w}`) }
  }
  for (const s of next.selections.selections) {
    const w = why(s.provenance?.record, s.provenance?.recordHash)
    if (w && s.reassess !== w) { s.reassess = w; flagged.push(`${s.field} selection of ${s.entry}: ${w}`) }
  }
  return { state: next, flagged }
}

/** "dei3", "ge5": tone-numbered toneless syllables, for ids. */
export function toneNumbers(pinyin: string): string {
  const syl = splitSyllables(pinyin)
  if (!syl) return pinyin.toLowerCase().replace(/[^a-zü]/g, '')
  return syl.map(s => `${s.base.replace('ü', 'v')}${s.tone || 5}`).join('')
}

/** A stable id for a new entry: the hanzi when free, else hanzi + reading ("得-dei3"). Never derived from the English text. */
export function proposeEntryId(hanzi: string, pinyin: string, taken: Set<string>): string {
  if (!taken.has(hanzi)) return hanzi
  const id = `${hanzi}-${toneNumbers(pinyin)}`
  if (!taken.has(id)) return id
  for (let n = 2; ; n++) if (!taken.has(`${id}-${n}`)) return `${id}-${n}`
}

/**
 * Promote a new-entry draft to a game entry: the entry joins words.json (not any course) and the mapping becomes "linked".
 * Validation of the playable fields happens afterwards on the whole content (validateContent), so promotion cannot bypass it.
 */
export function promoteDraft(state: RepoState, recordKey: string, src: SourceState, group?: string): { ok: boolean; error?: string; state: RepoState; id?: string } {
  const m = state.mappings.mappings[recordKey]
  if (!m || m.status !== 'new-candidate' || !m.draft) return { ok: false, error: `${recordKey} is not a new-entry candidate with a draft`, state }
  const r = src.records.get(recordKey)
  if (!r) return { ok: false, error: `${recordKey} is not in the current import`, state }
  if (r.hash !== m.recordHash || m.reassess) return { ok: false, error: `${recordKey} changed since the draft was prepared; reassess it first`, state }
  const d = m.draft
  const g = group ?? d.group
  const missing: string[] = (['id', 'hanzi', 'pinyin', 'meaning', 'note'] as const).filter(k => !d[k]?.trim())
  if (!g?.trim()) missing.push('group')
  if (missing.length) return { ok: false, error: `the draft is missing required fields: ${missing.join(', ')}`, state }
  const next = clone(state)
  if (next.words.some(w => entryIdOf(w) === d.id)) return { ok: false, error: `entry id "${d.id}" already exists`, state }
  const entry: RawWord = {
    hanzi: d.hanzi, pinyin: d.pinyin, meaning: d.meaning, group: g!, note: d.note!,
    source: [{ name: src.source, ref: recordKey, note: 'promoted from a review draft' }],
    review: { status: 'imported', note: 'Promoted from a source-record draft. Not reviewed by a teacher.' }
  }
  if (d.id !== d.hanzi) entry.id = d.id
  next.words.push(entry)
  next.mappings.mappings[recordKey] = { status: 'linked', entry: d.id, recordHash: m.recordHash, decision: m.decision }
  return { ok: true, state: next, id: d.id }
}
