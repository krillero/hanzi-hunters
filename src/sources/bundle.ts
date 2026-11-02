// Checks any adapter's output (SourceBundle) against the common model and the game's entries. Pure.
// Adapters may supply any subset (records only, sentences, recordings, exercises); this only checks what is present.
import type { ContentLink, SourceBundle } from './types.ts'
import { SOURCE_SCHEMA_VERSION } from './types.ts'

export function validateBundle(b: SourceBundle, entryIds: Set<string>): string[] {
  const out: string[] = []
  if (b.schemaVersion !== SOURCE_SCHEMA_VERSION) out.push(`schemaVersion must be ${SOURCE_SCHEMA_VERSION}`)
  const keys = new Set<string>()
  for (const r of b.records) {
    if (!r.key.startsWith(`${b.source}:`)) out.push(`record ${r.key}: key must start with "${b.source}:"`)
    if (keys.has(r.key)) out.push(`record ${r.key}: duplicate key`)
    keys.add(r.key)
    if (!/^[0-9a-f]{16}$/.test(r.hash)) out.push(`record ${r.key}: hash must be 16 hex characters`)
  }
  const checkLinks = (at: string, links: ContentLink[] | undefined) => {
    for (const l of links ?? []) {
      const set = [l.entry, l.record, l.objective].filter(x => x !== undefined)
      if (set.length !== 1) out.push(`${at}: a link names exactly one of entry, record or objective`)
      if (!['teaches', 'contains', 'requires'].includes(l.role)) out.push(`${at}: unknown link role "${l.role}"`)
      if (l.entry !== undefined && !entryIds.has(l.entry)) out.push(`${at}: link to unknown entry "${l.entry}"`)
      if (l.record !== undefined && !keys.has(l.record)) out.push(`${at}: link to unknown record "${l.record}"`)
    }
  }
  const ids = new Set<string>()
  for (const c of b.content) {
    const at = `content ${c.id}`
    if (ids.has(c.id)) out.push(`${at}: duplicate id`)
    ids.add(c.id)
    if (c.provenance.source !== b.source) out.push(`${at}: provenance.source must be "${b.source}"`)
    if (c.provenance.record && !keys.has(c.provenance.record)) out.push(`${at}: provenance.record "${c.provenance.record}" is not a record of this bundle`)
    if (c.review?.status === 'human-reviewed' && !c.review.reviewer) out.push(`${at}: human-reviewed needs a reviewer`)
    checkLinks(at, c.links)
    if (c.type === 'sentence' && !(c.zh.trim() && c.en.trim())) out.push(`${at}: a sentence needs zh and en`)
  }
  for (const c of b.content) if (c.type === 'sentence' && c.audio) {
    const a = b.content.find(x => x.id === c.audio)
    if (!a || a.type !== 'recording') out.push(`content ${c.id}: audio "${c.audio}" is not a recording of this bundle`)
    else if (a.scope !== 'sentence') out.push(`content ${c.id}: audio "${c.audio}" is a word recording; sentences use sentence recordings`)
  }
  const exIds = new Set<string>()
  for (const e of b.exercises) {
    const at = `exercise ${e.id}`
    if (exIds.has(e.id)) out.push(`${at}: duplicate id`)
    exIds.add(e.id)
    if (!e.type) out.push(`${at}: type is required`)
    if (!e.targets.length || e.targets.some(t => t.role !== 'teaches')) out.push(`${at}: targets must be one or more "teaches" links`)
    checkLinks(at, e.targets)
    for (const id of e.content) if (!ids.has(id)) out.push(`${at}: content "${id}" is not in this bundle`)
    for (const p of e.prerequisites?.entries ?? []) if (!entryIds.has(p)) out.push(`${at}: prerequisite entry "${p}" does not exist`)
    for (const p of e.prerequisites?.records ?? []) if (!keys.has(p)) out.push(`${at}: prerequisite record "${p}" is not in this bundle`)
    if (!e.answer.accept.length) out.push(`${at}: answer.accept needs at least one answer`)
    if (e.answer.choices) {
      const accepted = e.answer.choices.filter(c => e.answer.accept.includes(c))
      if (accepted.length === 0) out.push(`${at}: none of the choices is an accepted answer`)
      if (accepted.length > 1) out.push(`${at}: ${accepted.length} choices are accepted answers (${accepted.join(', ')}); an accepted alternative must never be offered next to another correct choice`)
      for (const k of Object.keys(e.feedback?.wrong ?? {})) if (!e.answer.choices.includes(k) || e.answer.accept.includes(k)) out.push(`${at}: feedback.wrong["${k}"] is not a wrong choice`)
    }
    if (e.provenance.source !== b.source) out.push(`${at}: provenance.source must be "${b.source}"`)
  }
  return out
}
