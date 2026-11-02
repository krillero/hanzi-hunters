// Validation of the committed decision files (sourceMappings.json, recordings.json, selections.json) against words.json and,
// when available, the imported source records. Pure: tools/validate-content.ts passes the parsed files (and checks media on disk).
import type { RawWord, Sources } from '../content/types.ts'
import { SOURCE_SCHEMA_VERSION, type MappingsFile, type RecordingsFile, type SelectionsFile, type SourceRecord } from './types.ts'

const STATUSES = ['unresolved', 'linked', 'new-candidate', 'excluded']
const USES = ['display', 'listen', 'listen2meaning', 'listen2pinyin']
const VALIDATION = ['unverified', 'verified', 'rejected']
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
/** A media path is relative, inside the site, and made only of safe characters (the importer generates these). */
export const safeMediaPath = (p: string) => /^sources\/[a-z0-9-]+\/media\/[a-f0-9]{16,64}\.[a-z0-9]{2,5}$/.test(p)

export function validateDecisions(
  words: RawWord[], mappings: MappingsFile, recordings: RecordingsFile, selections: SelectionsFile, sources: Sources,
  records?: Map<string, SourceRecord>
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = []
  const ids = new Set(words.map(w => w.id ?? w.hanzi))
  const srcOf = (key: string) => key.split(':')[0]
  for (const [name, f] of [['sourceMappings.json', mappings], ['recordings.json', recordings], ['selections.json', selections]] as const)
    if (f?.schemaVersion !== SOURCE_SCHEMA_VERSION) errors.push(`${name}: schemaVersion must be ${SOURCE_SCHEMA_VERSION}`)

  for (const [key, m] of Object.entries(mappings?.mappings ?? {})) {
    const at = `sourceMappings.json["${key}"]`
    if (!(srcOf(key) in sources)) errors.push(`${at}: source "${srcOf(key)}" is not in sources.json`)
    if (!STATUSES.includes(m.status)) errors.push(`${at}: unknown status "${m.status}"`)
    if (m.status === 'linked' && !(m.entry && ids.has(m.entry))) errors.push(`${at}: linked to unknown entry "${m.entry ?? ''}"`)
    if (m.status !== 'linked' && m.entry) errors.push(`${at}: only a linked mapping has an "entry"`)
    for (const e of m.distinctFrom ?? []) if (!ids.has(e)) errors.push(`${at}: distinctFrom names unknown entry "${e}"`)
    if (m.status === 'linked' && m.entry && m.distinctFrom?.includes(m.entry)) errors.push(`${at}: linked to an entry it is also marked distinct from`)
    if (m.status === 'new-candidate' && !m.draft) errors.push(`${at}: a new-entry candidate needs a "draft"`)
    if (!isStr(m.recordHash)) errors.push(`${at}: recordHash is required`)
    if (!m.decision || !isStr(m.decision.by) || !isStr(m.decision.on)) errors.push(`${at}: decision.by and decision.on are required`)
    if (records && srcOf(key) === [...records.values()][0]?.source && !records.has(key) && !m.reassess) warnings.push(`${at}: record not in the current import`)
    if (m.reassess) warnings.push(`${at}: needs reassessment (${m.reassess})`)
  }

  const perEntry = new Map<string, number>()
  for (const [i, r] of (recordings?.recordings ?? []).entries()) {
    const at = `recordings.json[${i}] (${r.id})`
    if (!ids.has(r.entry)) errors.push(`${at}: unknown entry "${r.entry}"`)
    if (r.scope === 'word') perEntry.set(r.entry, (perEntry.get(r.entry) ?? 0) + 1)
    if (!safeMediaPath(r.file)) errors.push(`${at}: file "${r.file}" is not a generated media path (sources/<source>/media/<sha>.<ext>)`)
    if (!(r.provenance?.source in sources)) errors.push(`${at}: provenance.source "${r.provenance?.source}" is not in sources.json`)
    if (!VALIDATION.includes(r.validation)) errors.push(`${at}: validation must be one of ${VALIDATION.join(', ')}`)
    for (const u of r.uses ?? []) if (!USES.includes(u)) errors.push(`${at}: unknown use "${u}"`)
    if (r.validation === 'verified' && !(isStr(r.reading?.verified) && isStr(r.reading?.verifiedBy))) errors.push(`${at}: "verified" needs reading.verified and reading.verifiedBy (a person who listened)`)
    if (r.reading?.verified && !isStr(r.reading.verifiedBy)) errors.push(`${at}: reading.verified needs reading.verifiedBy`)
    if (!r.decision || !isStr(r.decision.by)) errors.push(`${at}: decision.by is required`)
    if (records && r.provenance?.record) {
      const rec = records.get(r.provenance.record)
      if (rec && !rec.media.some(m => m.path === r.file && m.sha256 === r.sha256)) errors.push(`${at}: file/sha256 do not match the media of ${r.provenance.record}`)
    }
    if (r.reassess) warnings.push(`${at}: needs reassessment (${r.reassess}); the game does not use it until then`)
  }
  for (const [e, n] of perEntry) if (n > 1) errors.push(`recordings.json: entry "${e}" has ${n} word recordings; select exactly one`)

  const seen = new Set<string>()
  for (const [i, s] of (selections?.selections ?? []).entries()) {
    const at = `selections.json[${i}] (${s.entry}.${s.field})`
    if (!ids.has(s.entry)) errors.push(`${at}: unknown entry`)
    if (!['meaning', 'note'].includes(s.field)) errors.push(`${at}: unknown field`)
    if (!['game', 'source', 'edited'].includes(s.choice)) errors.push(`${at}: choice must be "game", "source" or "edited"`)
    if (s.choice === 'edited' && !isStr(s.value)) errors.push(`${at}: an edited choice needs a value`)
    if (s.choice === 'source' && !(isStr(s.value) && s.provenance?.record)) errors.push(`${at}: a source choice needs value and provenance.record`)
    if (s.choice !== 'game') {
      const w = words.find(x => (x.id ?? x.hanzi) === s.entry)
      if (w && w[s.field] !== s.value) warnings.push(`${at}: words.json no longer has the selected text (edited by hand since?)`)
    }
    const k = `${s.entry}.${s.field}`
    if (seen.has(k)) errors.push(`${at}: duplicate selection`)
    seen.add(k)
    if (s.reassess) warnings.push(`${at}: needs reassessment (${s.reassess})`)
  }
  return { errors, warnings }
}
