// Working decisions of the review screen: saved in the reviewer's browser (separate from game saves), exported as a changeset,
// applied to the repository with `npm run source:apply`. Pure apart from the Storage object passed in.
// Drafts hold only the reviewer's decisions (ops). Evidence and assessments are never stored here.
import { opTarget, recordingOfEntry, same, selectionOf, type RepoState } from '../sources/changeset.ts'
import {
  SOURCE_SCHEMA_VERSION, type ChangeOp, type Changeset, type Decision, type FieldSelection, type Mapping, type SelectedRecording,
  type SourceRecord
} from '../sources/types.ts'

/** Browser drafts, version 2 (evidence/assessment review screen). Version 1 drafts are migrated, never overwritten. */
export const REVIEW_KEY_PREFIX = 'hanzi-hunters-review-v2:'
export const LEGACY_KEY_PREFIX = 'hanzi-hunters-review-v1:'
/** The reviewer's name is shared by both versions (it is not a draft). */
const REVIEWER_KEY = LEGACY_KEY_PREFIX + 'reviewer'
export const REVIEW_STATE_VERSION = 2
export type WorkingState = {
  schemaVersion: typeof SOURCE_SCHEMA_VERSION; reviewVersion: typeof REVIEW_STATE_VERSION; source: string; snapshot: string
  ops: Record<string, ChangeOp>
  /** Set when these drafts were carried over from an older review screen. */
  migratedFrom?: 'v1'
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
/** Shown once after loading: drafts migrated from v1, or drafts that could not be read (kept in a backup key, never deleted). */
export type LoadNotice = { kind: 'migrated' | 'incompatible'; message: string; backupKey?: string; raw?: string }

export const emptyWorking = (source: string, snapshot: string): WorkingState => ({ schemaVersion: SOURCE_SCHEMA_VERSION, reviewVersion: REVIEW_STATE_VERSION, source, snapshot, ops: {} })

const OP_KINDS = new Set(['mapping', 'recording', 'field'])
const validOp = (op: unknown): op is ChangeOp => !!op && typeof op === 'object' && OP_KINDS.has((op as ChangeOp).op) && 'after' in (op as object)

/**
 * Load the saved working decisions.
 *  - v2 drafts load as they are.
 *  - v1 drafts (the earlier review screen) are migrated: their ops are the reviewer's own decisions (links, exclusions, chosen
 *    texts, recordings) and are kept with their decision provenance. v1 stored no recommendations, so none is turned into an
 *    assessment. The v1 key is left untouched as a backup.
 *  - Anything unreadable starts empty, but the raw text is copied to a backup key first and returned for download.
 */
export function loadWorkingWithNotice(storage: StorageLike | null, source: string, snapshot: string): { state: WorkingState; notice?: LoadNotice } {
  const backup = (raw: string, why: string): { state: WorkingState; notice: LoadNotice } => {
    const backupKey = `${REVIEW_KEY_PREFIX}${source}:unreadable-${new Date().toISOString().replace(/[:.]/g, '')}`
    try { storage?.setItem(backupKey, raw) } catch { /* the raw text is still returned for download */ }
    return { state: emptyWorking(source, snapshot), notice: { kind: 'incompatible', backupKey, raw, message: `Saved review drafts could not be read (${why}). They were not deleted: a copy is kept in this browser (${backupKey}) and can be downloaded below. Starting with no drafts.` } }
  }
  let raw: string | null | undefined
  try { raw = storage?.getItem(REVIEW_KEY_PREFIX + source) } catch { return { state: emptyWorking(source, snapshot) } }
  if (raw) {
    try {
      const w = JSON.parse(raw) as WorkingState
      if (w?.reviewVersion !== REVIEW_STATE_VERSION || w.schemaVersion !== SOURCE_SCHEMA_VERSION || w.source !== source || !w.ops || typeof w.ops !== 'object') return backup(raw, 'unknown format or version')
      return { state: w }   // keeps its own snapshot: a newer deploy is detected per op (see opStatus)
    } catch { return backup(raw, 'not valid JSON') }
  }
  let legacy: string | null | undefined
  try { legacy = storage?.getItem(LEGACY_KEY_PREFIX + source) } catch { legacy = null }
  if (!legacy) return { state: emptyWorking(source, snapshot) }
  try {
    const v1 = JSON.parse(legacy) as { schemaVersion?: number; source?: string; snapshot?: string; ops?: Record<string, unknown> }
    if (v1?.schemaVersion !== 1 || v1.source !== source || !v1.ops || typeof v1.ops !== 'object') return backup(legacy, 'drafts from the earlier review screen in an unknown format')
    const ops: Record<string, ChangeOp> = {}
    let dropped = 0
    for (const [k, op] of Object.entries(v1.ops)) if (validOp(op)) ops[opTarget(op)] = op; else { dropped++; void k }
    const state: WorkingState = { schemaVersion: SOURCE_SCHEMA_VERSION, reviewVersion: REVIEW_STATE_VERSION, source, snapshot: v1.snapshot ?? snapshot, ops, migratedFrom: 'v1' }
    const n = Object.keys(ops).length
    try { storage?.setItem(REVIEW_KEY_PREFIX + source, JSON.stringify(state)) } catch { /* still usable in memory */ }
    return { state, notice: { kind: 'migrated', message: `${n} decision${n === 1 ? '' : 's'} from the earlier review screen ${n === 1 ? 'was kept as your own decision' : 'were kept as your own decisions'}${dropped ? ` (${dropped} unreadable item${dropped === 1 ? '' : 's'} skipped; the original drafts are still in this browser)` : ''}. The earlier screen's automatic recommendations were never decisions and are not carried over; comparisons now show evidence and assessments instead.` } }
  } catch { return backup(legacy, 'drafts from the earlier review screen are not valid JSON') }
}
export const loadWorking = (storage: StorageLike | null, source: string, snapshot: string): WorkingState => loadWorkingWithNotice(storage, source, snapshot).state
export function saveWorking(storage: StorageLike | null, w: WorkingState): boolean {
  try { storage?.setItem(REVIEW_KEY_PREFIX + w.source, JSON.stringify(w)); return !!storage } catch { return false }
}
export const loadReviewer = (storage: StorageLike | null) => { try { return storage?.getItem(REVIEWER_KEY) ?? '' } catch { return '' } }
export const saveReviewer = (storage: StorageLike | null, name: string) => { try { storage?.setItem(REVIEWER_KEY, name) } catch { /* ignore */ } }

/** Add or replace an op (one per target). An op equal to the committed state is dropped: nothing would change. */
export function putOp(w: WorkingState, op: ChangeOp): WorkingState {
  const ops = { ...w.ops }
  const t = opTarget(op)
  if (same(op.before, op.after)) delete ops[t]; else ops[t] = op
  return { ...w, ops }
}
export function dropOp(w: WorkingState, target: string): WorkingState { const ops = { ...w.ops }; delete ops[target]; return { ...w, ops } }

export const today = () => new Date().toISOString().slice(0, 10)
export const decision = (by: string): Decision => ({ by: by.trim() || 'unknown', on: today(), how: 'person' })

export function mappingOp(repo: RepoState, r: SourceRecord, after: Omit<Mapping, 'recordHash' | 'decision'>, by: string): ChangeOp {
  const before = repo.mappings.mappings[r.key] ?? null
  const clean = Object.fromEntries(Object.entries(after).filter(([, v]) => v !== undefined && v !== '')) as Omit<Mapping, 'recordHash' | 'decision'>
  const next: Mapping = { ...clean, recordHash: r.hash, decision: decision(by) }
  // "unresolved" with nothing committed is the default: no op needed.
  if (!before && next.status === 'unresolved' && !next.distinctFrom?.length && !next.reason) return { op: 'mapping', record: r.key, recordHash: r.hash, before, after: before as unknown as Mapping }
  return { op: 'mapping', record: r.key, recordHash: r.hash, before, after: next }
}

export function recordingOp(repo: RepoState, r: SourceRecord, entry: string, after: SelectedRecording | null): ChangeOp {
  return { op: 'recording', record: after?.provenance.record ?? r.key, recordHash: r.hash, entry, before: recordingOfEntry(repo.recordings, entry), after }
}

export function fieldOp(repo: RepoState, entry: string, field: FieldSelection['field'], currentValue: string, after: FieldSelection): ChangeOp {
  return { op: 'field', entry, field, currentValue, before: selectionOf(repo.selections, entry, field), after }
}

/**
 * Is a working op still applicable to what is deployed now?
 *  ok        applies cleanly
 *  stale     the record changed in a newer import (reassess)
 *  outdated  the committed decision / game text changed since the op was made
 */
export function opStatus(op: ChangeOp, repo: RepoState, records: Map<string, SourceRecord>): 'ok' | 'stale' | 'outdated' {
  if (op.op === 'field') {
    const w = repo.words.find(x => (x.id ?? x.hanzi) === op.entry)
    if (!w || w[op.field] !== op.currentValue || !same(selectionOf(repo.selections, op.entry, op.field), op.before)) return 'outdated'
    const rec = op.after.provenance?.record
    if (rec && records.get(rec)?.hash !== op.after.provenance?.recordHash) return 'stale'
    return 'ok'
  }
  if (records.get(op.record)?.hash !== op.recordHash) return 'stale'
  const cur = op.op === 'mapping' ? repo.mappings.mappings[op.record] ?? null : recordingOfEntry(repo.recordings, op.entry)
  return same(cur, op.before) ? 'ok' : 'outdated'
}

export function toChangeset(w: WorkingState, reviewer: string, snapshot: string, now = new Date()): Changeset {
  return { kind: 'hanzi-hunters-changeset', schemaVersion: SOURCE_SCHEMA_VERSION, source: w.source, snapshot, createdAt: now.toISOString(), reviewer: reviewer.trim(), ops: Object.values(w.ops) }
}

/** The mapping as the reviewer currently sees it: working op first, then the committed one. */
export function effectiveMapping(w: WorkingState, repo: RepoState, key: string): { mapping: Mapping | null; working: boolean } {
  const op = w.ops[`mapping:${key}`]
  if (op?.op === 'mapping') return { mapping: op.after, working: true }
  return { mapping: repo.mappings.mappings[key] ?? null, working: false }
}
export function effectiveRecording(w: WorkingState, repo: RepoState, entry: string): { recording: SelectedRecording | null; working: boolean } {
  const op = w.ops[`recording:${entry}`]
  if (op?.op === 'recording') return { recording: op.after, working: true }
  return { recording: recordingOfEntry(repo.recordings, entry), working: false }
}
export function effectiveSelection(w: WorkingState, repo: RepoState, entry: string, field: FieldSelection['field']): { selection: FieldSelection | null; working: boolean } {
  const op = w.ops[`field:${entry}:${field}`]
  if (op?.op === 'field') return { selection: op.after, working: true }
  return { selection: selectionOf(repo.selections, entry, field), working: false }
}

/** Plain-language one-liner of an op, for the "proposed changes" list. */
export function describeOp(op: ChangeOp): string {
  if (op.op === 'mapping') {
    const a = op.after
    const what = a.status === 'linked' ? `link to ${a.entry}` : a.status === 'excluded' ? `exclude${a.reason ? ` (${a.reason})` : ''}` : a.status === 'new-candidate' ? `new entry draft ${a.draft?.hanzi ?? ''} ${a.draft?.pinyin ?? ''} “${a.draft?.meaning ?? ''}”` : 'leave unresolved'
    const distinct = a.distinctFrom?.length ? `; different meaning from ${a.distinctFrom.join(', ')}` : ''
    return `${op.record}: ${op.before ? `${op.before.status}${op.before.entry ? ` ${op.before.entry}` : ''} → ` : ''}${what}${distinct}`
  }
  if (op.op === 'recording') return op.after ? `${op.entry}: use recording from ${op.record} (${op.after.uses.join(', ') || 'no uses'}${op.after.reading.verified ? `; heard “${op.after.reading.verified}”` : ''})` : `${op.entry}: remove the selected recording`
  return op.after.choice === 'game' ? `${op.entry}: keep the game's ${op.field} “${op.currentValue}”` : `${op.entry}: ${op.field} “${op.currentValue}” → “${op.after.value}” (${op.after.choice === 'edited' ? 'your wording' : op.after.provenance?.mode === 'verbatim' ? 'source text' : 'shortened source text'})`
}
