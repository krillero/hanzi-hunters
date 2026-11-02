// Source review screen: compare imported source records with the game's entries, and make decisions (link, exclude, draft a
// new entry, pick a recording or a definition). Decisions are saved in this browser only, exported as a changeset file and
// applied to the repository with `npm run source:apply`. Nothing here changes the game directly. Workflow: docs/SOURCES.md.
import { useEffect, useMemo, useState } from 'react'
import wordsJson from '../content/words.json'
import mappingsJson from '../content/sourceMappings.json'
import recordingsJson from '../content/recordings.json'
import selectionsJson from '../content/selections.json'
import sourcesJson from '../content/sources.json'
import { WORDS } from '../data'
import { audioReliable } from '../content/entries'
import { LIMITS } from '../content/validate'
import { eligibleUses, readingRelation, toneless } from '../content/recordings'
import { isConflicting, suggest, type Suggestion } from '../sources/match'
import { draftFromRecord, neutralPositions, type RepoState } from '../sources/changeset'
import type { ContentItem, EntryDraft, FieldSelection, Mapping, RecordingItem, RecordingUse, SelectedRecording, SourceIndex, SourceRecord } from '../sources/types'
import type { RawWord, Sources, Word } from '../content/types'
import {
  decision, describeOp, dropOp, effectiveMapping, effectiveRecording, effectiveSelection, fieldOp, loadReviewer, loadWorking,
  mappingOp, opStatus, putOp, recordingOp, saveReviewer, saveWorking, toChangeset, type WorkingState
} from './store'

const BASE = import.meta.env.BASE_URL
const SOURCES = sourcesJson as unknown as Sources
/** The committed state this build was made from ("applied to the game"). */
const REPO: RepoState = { words: wordsJson as unknown as RawWord[], mappings: mappingsJson as unknown as RepoState['mappings'], recordings: recordingsJson as unknown as RepoState['recordings'], selections: selectionsJson as unknown as RepoState['selections'] }
const WORD_BY_ID = new Map(WORDS.map(w => [w.id, w]))
const PAGE = 40
const storage = (() => { try { return window.localStorage } catch { return null } })()

type Filter = 'all' | 'unresolved' | 'linked' | 'new-candidate' | 'excluded' | 'conflicting' | 'reassess' | 'audio' | 'working'
const FILTERS: [Filter, string][] = [['all', 'All'], ['unresolved', 'Unresolved'], ['linked', 'Linked'], ['conflicting', 'Conflicting'], ['new-candidate', 'New candidates'], ['excluded', 'Excluded'], ['reassess', 'Needs reassessment'], ['audio', 'Has audio'], ['working', 'Changed here']]
const USE_LABEL: Record<RecordingUse, string> = { display: 'Play on word cards', listen: 'Listening: hear → pick the characters', listen2meaning: 'Listening: hear → pick the meaning', listen2pinyin: 'Listening: hear → pick the pinyin' }
const LEVEL_ICON = { match: '✓', partial: '≈', mismatch: '✗', unknown: '?' } as const

type Loaded = { source: string; snapshot: string; records: SourceRecord[]; byKey: Map<string, SourceRecord>; recItems: Map<string, RecordingItem> }

export default function ReviewApp() {
  const [index, setIndex] = useState<SourceIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string>('')
  const [data, setData] = useState<Loaded | null>(null)
  const [working, setWorking] = useState<WorkingState | null>(null)
  const [reviewer, setReviewer] = useState(() => loadReviewer(storage))
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [book, setBook] = useState<string>('')
  const [lesson, setLesson] = useState<string>('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'records' | 'changes'>('records')
  const [saved, setSaved] = useState<boolean>(true)

  useEffect(() => {
    fetch(`${BASE}sources/index.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`sources/index.json: HTTP ${r.status}`))))
      .then((i: SourceIndex) => { setIndex(i); if (i.sources[0]) setSourceId(s => s || i.sources[0].id) })
      .catch(e => setError(`No imported sources found (${(e as Error).message}). Run npm run source:import first.`))
  }, [])
  useEffect(() => {
    if (!sourceId) return
    setData(null); setSelected(null); setPage(0)
    Promise.all([
      fetch(`${BASE}sources/${sourceId}/records.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`records.json: HTTP ${r.status}`)))),
      fetch(`${BASE}sources/${sourceId}/content.json`).then(r => (r.ok ? r.json() : { content: [] })).catch(() => ({ content: [] }))
    ]).then(([rec, con]: [{ snapshot: string; records: SourceRecord[] }, { content?: ContentItem[] }]) => {
      const recItems = new Map<string, RecordingItem>()
      for (const c of con.content ?? []) if (c.type === 'recording' && c.provenance.record && !recItems.has(c.provenance.record)) recItems.set(c.provenance.record, c)
      setData({ source: sourceId, snapshot: rec.snapshot, records: rec.records, byKey: new Map(rec.records.map(r => [r.key, r])), recItems })
      setWorking(loadWorking(storage, sourceId, rec.snapshot))
    }).catch(e => setError(`Could not load ${sourceId}: ${(e as Error).message}`))
  }, [sourceId])

  const update = (fn: (w: WorkingState) => WorkingState) => setWorking(w => { if (!w) return w; const n = fn(w); setSaved(saveWorking(storage, n)); return n })

  const suggestions = useMemo(() => {
    const m = new Map<string, Suggestion[]>()
    for (const r of data?.records ?? []) m.set(r.key, suggest(r, WORDS))
    return m
  }, [data])

  const info = useMemo(() => {
    const out = new Map<string, { status: Mapping['status']; working: boolean; conflicting: boolean; reassess: boolean; audio: boolean }>()
    if (!data || !working) return out
    for (const r of data.records) {
      const { mapping, working: w } = effectiveMapping(working, REPO, r.key)
      const s = suggestions.get(r.key) ?? []
      const linkedTo = mapping?.status === 'linked' ? s.find(x => x.entry === mapping.entry) : undefined
      const ops = Object.values(working.ops).filter(op => (op.op === 'field' ? op.after.provenance?.record === r.key : op.record === r.key))
      out.set(r.key, {
        status: mapping?.status ?? 'unresolved', working: w || ops.length > 0,
        conflicting: mapping?.status === 'linked' ? !linkedTo || linkedTo.confidence === 'conflict' || linkedTo.confidence === 'weak' : mapping?.status !== 'excluded' && isConflicting(s),
        reassess: !!REPO.mappings.mappings[r.key]?.reassess || ops.some(op => opStatus(op, REPO, data.byKey) !== 'ok'),
        audio: r.media.some(m => m.path)
      })
    }
    return out
  }, [data, working, suggestions])

  const books = useMemo(() => [...new Set((data?.records ?? []).map(r => r.placement?.book).filter((b): b is number => b !== undefined))].sort((a, b) => a - b), [data])
  const lessons = useMemo(() => [...new Set((data?.records ?? []).filter(r => !book || String(r.placement?.book) === book).map(r => r.placement?.lesson).filter((b): b is number => b !== undefined))].sort((a, b) => a - b), [data, book])

  const filtered = useMemo(() => {
    if (!data) return []
    const query = q.trim().toLowerCase()
    const tq = query ? toneless(query) : ''
    return data.records.filter(r => {
      const i = info.get(r.key)
      if (!i) return false
      if (book && String(r.placement?.book) !== book) return false
      if (lesson && String(r.placement?.lesson) !== lesson) return false
      if (filter === 'conflicting' && !i.conflicting) return false
      if (filter === 'reassess' && !i.reassess) return false
      if (filter === 'audio' && !i.audio) return false
      if (filter === 'working' && !i.working) return false
      if (['unresolved', 'linked', 'new-candidate', 'excluded'].includes(filter) && i.status !== filter) return false
      if (!query) return true
      const c = r.candidate
      return r.key.toLowerCase().includes(query) || r.originalId.toLowerCase().includes(query)
        || c.simplified.some(s => s.includes(q.trim())) || c.traditional.some(s => s.includes(q.trim()))
        || c.readings.some(p => p.toLowerCase().includes(query) || toneless(p).includes(tq.replace(/\s+/g, '')))
        || c.meanings.some(m => m.toLowerCase().includes(query))
    })
  }, [data, info, q, filter, book, lesson])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, unresolved: 0, linked: 0, 'new-candidate': 0, excluded: 0, conflicting: 0, reassess: 0, audio: 0, working: 0 }
    for (const i of info.values()) { c.all++; c[i.status]++; if (i.conflicting) c.conflicting++; if (i.reassess) c.reassess++; if (i.audio) c.audio++; if (i.working) c.working++ }
    return c
  }, [info])
  const applied = useMemo(() => {
    const m = Object.entries(REPO.mappings.mappings).filter(([k]) => k.startsWith(`${sourceId}:`)).map(([, v]) => v.status)
    return { linked: m.filter(s => s === 'linked').length, excluded: m.filter(s => s === 'excluded').length, candidates: m.filter(s => s === 'new-candidate').length, recordings: REPO.recordings.recordings.filter(r => r.provenance.source === sourceId).length }
  }, [sourceId])

  if (error) return <main className="rv"><h1>Source review</h1><p className="rv-error">{error}</p></main>
  if (!index || !data || !working) return <main className="rv"><h1>Source review</h1><p>Loading…</p></main>
  const nOps = Object.keys(working.ops).length
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE)
  const record = selected ? data.byKey.get(selected) ?? null : null
  const sourceInfo = SOURCES[sourceId]

  return (
    <main className="rv">
      <header className="rv-head">
        <div>
          <h1>Source review</h1>
          <p className="rv-sub">Compare imported material with the game. Your decisions are saved <b>in this browser</b> until exported and applied.</p>
        </div>
        <div className="rv-row">
          <label>Source <select value={sourceId} onChange={e => setSourceId(e.target.value)}>{index.sources.map(s => <option key={s.id} value={s.id}>{s.id} ({s.records})</option>)}</select></label>
          <label>Your name <input value={reviewer} placeholder="needed to export" onChange={e => { setReviewer(e.target.value); saveReviewer(storage, e.target.value) }} /></label>
        </div>
        {sourceInfo && <p className="rv-small">{sourceInfo.title}. Reuse: {sourceInfo.reuse ?? sourceInfo.license}. Snapshot {data.snapshot.slice(0, 12)}.</p>}
        <div className="rv-status">
          <span className="rv-pill work">In this browser: {nOps} change{nOps === 1 ? '' : 's'} {saved ? '(saved)' : '(NOT saved: storage unavailable)'}</span>
          <span className="rv-pill">Applied in the game: {applied.linked} linked · {applied.excluded} excluded · {applied.candidates} drafts · {applied.recordings} recordings</span>
        </div>
        <nav className="rv-tabs">
          <button className={view === 'records' ? 'on' : ''} onClick={() => setView('records')}>Records ({counts.all})</button>
          <button className={view === 'changes' ? 'on' : ''} onClick={() => setView('changes')}>Proposed changes ({nOps})</button>
        </nav>
      </header>

      {view === 'changes' ? <ChangesView working={working} data={data} reviewer={reviewer} onDrop={t => update(w => dropOp(w, t))} onClear={() => { if (window.confirm('Remove all decisions saved in this browser?')) update(w => ({ ...w, ops: {} })) }} /> : (
        <div className={`rv-split ${record ? 'has-detail' : ''}`}>
          <section className="rv-list" aria-label="Records">
            <input className="rv-search" type="search" value={q} placeholder="Search 简体, pinyin (tones optional), English or ID" onChange={e => { setQ(e.target.value); setPage(0) }} />
            <div className="rv-chips">{FILTERS.map(([f, label]) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setPage(0) }}>{label} <small>{counts[f]}</small></button>)}</div>
            {books.length > 0 && <div className="rv-row">
              <label>Book <select value={book} onChange={e => { setBook(e.target.value); setLesson(''); setPage(0) }}><option value="">all</option>{books.map(b => <option key={b} value={b}>B{b}</option>)}</select></label>
              <label>Lesson <select value={lesson} onChange={e => { setLesson(e.target.value); setPage(0) }}><option value="">all</option>{lessons.map(l => <option key={l} value={l}>L{l}</option>)}</select></label>
            </div>}
            <p className="rv-small">{filtered.length} record{filtered.length === 1 ? '' : 's'}</p>
            <ul className="rv-items">{shown.map(r => {
              const i = info.get(r.key)!, s = suggestions.get(r.key)?.[0]
              return <li key={r.key}><button className={selected === r.key ? 'on' : ''} onClick={() => setSelected(r.key)}>
                <span className="rv-zh" lang="zh-CN">{r.candidate.simplified[0] ?? '—'}</span>
                <span className="rv-mid"><b>{r.candidate.readings.join(' / ')}</b><small>{r.candidate.meanings.join('; ')}</small></span>
                <span className="rv-tags"><em className={`st-${i.status}`}>{i.status}</em>{s && <em className={`cf-${s.confidence}`}>{s.confidence} {s.entry}</em>}{i.working && <em className="st-working">changed</em>}{i.reassess && <em className="cf-conflict">reassess</em>}<small>{r.placement?.label ?? r.originalId}</small></span>
              </button></li>
            })}</ul>
            <div className="rv-row rv-pager"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button><span>Page {page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next ›</button></div>
          </section>
          {record && <RecordDetail key={record.key} record={record} data={data} suggestions={suggestions.get(record.key) ?? []} working={working} reviewer={reviewer} update={update} onClose={() => setSelected(null)} />}
        </div>
      )}
    </main>
  )
}

function Audio({ path }: { path: string }) {
  return <audio className="rv-audio" controls preload="none" src={`${BASE}${path}`} />
}

/** One record: original fields, game candidates with evidence, and the decisions. */
function RecordDetail({ record: r, data, suggestions, working, reviewer, update, onClose }: {
  record: SourceRecord; data: Loaded; suggestions: Suggestion[]; working: WorkingState; reviewer: string
  update: (fn: (w: WorkingState) => WorkingState) => void; onClose: () => void
}) {
  const { mapping, working: mappingWorking } = effectiveMapping(working, REPO, r.key)
  const committed = REPO.mappings.mappings[r.key] ?? null
  const [other, setOther] = useState('')
  const [reason, setReason] = useState(mapping?.reason ?? '')
  const [draft, setDraft] = useState<EntryDraft>(() => mapping?.draft ?? draftFromRecord(r, WORDS))
  const setMapping = (after: Omit<Mapping, 'recordHash' | 'decision'>) => update(w => putOp(w, mappingOp(REPO, r, after, reviewer)))
  const linkedEntry = mapping?.status === 'linked' && mapping.entry ? WORD_BY_ID.get(mapping.entry) : undefined
  const ops = Object.entries(working.ops).filter(([, op]) => (op.op === 'field' ? op.after.provenance?.record === r.key || (linkedEntry && op.entry === linkedEntry.id) : op.record === r.key || (op.op === 'recording' && linkedEntry && op.entry === linkedEntry.id)))
  const media = r.media.find(m => m.path)
  return (
    <section className="rv-detail" aria-label={`Record ${r.key}`}>
      <button className="rv-back" onClick={onClose}>‹ Back to the list</button>
      <div className="rv-card">
        <div className="rv-title"><span className="rv-big" lang="zh-CN">{r.candidate.simplified[0] ?? '—'}</span>
          <div><b>{r.candidate.readings.join(' / ') || 'no reading'}</b><div>{r.candidate.meanings.join('; ')}</div><small>{r.key} · {r.placement?.label ?? 'no placement'} · hash {r.hash}</small></div></div>
        {r.media.map(m => <div key={m.id} className="rv-media">{m.path ? <Audio path={m.path} /> : <span className="rv-warn">Audio missing: {m.problems.join(', ')}</span>}<small>{m.original} · checks: {m.checks.join(', ') || 'none'}{m.problems.length ? ` · problems: ${m.problems.join(', ')}` : ''}</small></div>)}
        <p className="rv-small">File checks show the clip exists and looks like audio. Only listening tells whether it says the right word and reading.</p>
        <details><summary>Original fields (verbatim)</summary>
          <table className="rv-fields"><tbody>{Object.entries(r.fields).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v || <i>empty</i>}</td></tr>)}{Object.entries(r.native).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
        </details>
        {(r.candidate.flags.length > 0 || r.issues.length > 0) && <p className="rv-warn">{[...r.candidate.flags.map(f => `flag: ${f}`), ...r.issues].join(' · ')}</p>}
      </div>

      <div className="rv-card">
        <h2>Mapping</h2>
        <p>Now: <b>{mapping?.status ?? 'unresolved'}</b>{mapping?.entry ? ` → ${mapping.entry}` : ''} {mappingWorking ? <em className="st-working">changed in this browser</em> : <em className="rv-pill">applied</em>}{committed?.reassess && <em className="cf-conflict">needs reassessment: {committed.reassess}</em>}</p>
        <p className="rv-small">Linking only says “this record is about that entry”. It does not change the game's text, select audio or add anything to a lesson.</p>
        {suggestions.length === 0 && <p>No game entry is written {r.candidate.simplified.join(' / ')}.</p>}
        {suggestions.map(s => <Candidate key={s.entry} s={s} record={r} linked={mapping?.status === 'linked' && mapping.entry === s.entry} onLink={() => setMapping({ status: 'linked', entry: s.entry })} />)}
        <div className="rv-actions">
          <label>Link to another entry <input list="rv-entries" value={other} onChange={e => setOther(e.target.value)} placeholder="entry id" /></label>
          <button disabled={!WORD_BY_ID.has(other)} onClick={() => setMapping({ status: 'linked', entry: other })}>Link</button>
          <datalist id="rv-entries">{WORDS.map(w => <option key={w.id} value={w.id}>{w.hanzi} {w.pinyin} {w.meaning}</option>)}</datalist>
        </div>
        <div className="rv-actions">
          <button onClick={() => setMapping({ status: 'unresolved' })}>Leave unresolved</button>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="reason (optional)" />
          <button onClick={() => setMapping({ status: 'excluded', reason: reason.trim() || undefined })}>Exclude</button>
        </div>
        <details className="rv-draft" open={mapping?.status === 'new-candidate'}><summary>Prepare a new game entry (draft)</summary>
          <p className="rv-small">A draft is not playable. It becomes an entry only through <code>npm run source:promote</code> and validation, and joins a lesson only when someone adds it to a course.</p>
          {(['id', 'hanzi', 'pinyin', 'meaning', 'note', 'group'] as const).map(k => <label key={k}>{k} <input value={draft[k] ?? ''} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} /></label>)}
          <p className="rv-small">Neutral tone: {neutralPositions(draft.pinyin).length ? `syllable ${neutralPositions(draft.pinyin).join(', ')} (no tone mark)` : 'none'}. Write the pinyin as the game teaches it (lowercase, tone marks; leave neutral syllables unmarked).</p>
          <label>kind <select value={draft.kind ?? ''} onChange={e => setDraft(d => ({ ...d, kind: (e.target.value || undefined) as EntryDraft['kind'] }))}><option value="">automatic</option><option value="word">word</option><option value="character">character</option><option value="particle">particle</option></select></label>
          <label>variants (other accepted readings, comma-separated) <input value={(draft.variants ?? []).join(', ')} onChange={e => setDraft(d => ({ ...d, variants: e.target.value.split(/\s*,\s*/).filter(Boolean) }))} /></label>
          {draft.meaning.length > LIMITS.meaning && <p className="rv-warn">The meaning has {draft.meaning.length} characters; answer buttons allow {LIMITS.meaning}.</p>}
          {WORD_BY_ID.has(draft.id) && <p className="rv-warn">The id “{draft.id}” is already used.</p>}
          <button disabled={!draft.id.trim() || WORD_BY_ID.has(draft.id) || !draft.hanzi.trim()} onClick={() => setMapping({ status: 'new-candidate', draft: Object.fromEntries(Object.entries({ ...draft, neutral: neutralPositions(draft.pinyin) }).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0))) as EntryDraft })}>Save as new-entry candidate</button>
        </details>
      </div>

      {linkedEntry && <EntryContent record={r} word={linkedEntry} data={data} media={media} working={working} reviewer={reviewer} update={update} />}

      <div className="rv-card">
        <h2>Proposed changes for this record</h2>
        {ops.length === 0 ? <p className="rv-small">None. Nothing will change in the game.</p> : <ul className="rv-ops">{ops.map(([t, op]) => <li key={t}><OpLine op={op} data={data} /><button onClick={() => update(w => dropOp(w, t))}>Undo</button></li>)}</ul>}
      </div>
    </section>
  )
}

function Candidate({ s, record, linked, onLink }: { s: Suggestion; record: SourceRecord; linked: boolean; onLink: () => void }) {
  const w = WORD_BY_ID.get(s.entry)!
  const rec = REPO.recordings.recordings.find(x => x.entry === w.id)
  return (
    <div className={`rv-cand cf-${s.confidence}`}>
      <div className="rv-cmp">
        <div><small>Source</small><b lang="zh-CN">{record.candidate.simplified.join(' / ')}</b><span>{record.candidate.readings.join(' / ')}</span><span>{record.candidate.meanings.join('; ')}</span><span>{record.candidate.pos.join(', ')}</span><span>{record.media.some(m => m.path) ? '🔊 recording' : 'no recording'}</span></div>
        <div><small>Game · {w.id}</small><b lang="zh-CN">{w.hanzi}</b><span>{w.pinyin}{w.variants.length ? ` (also ${w.variants.join(', ')})` : ''}{w.speech.length ? ` · speech: ${w.speech.map(x => x.pinyin).join(', ')}` : ''}</span><span>{w.meaning}</span><span>{w.kind}</span><span>{rec ? '🔊 recording selected' : audioReliable(w, WORDS) ? 'text-to-speech' : 'no audio (TTS off)'}</span></div>
      </div>
      <p className="rv-small">{w.note}</p>
      <ul className="rv-ev">{s.evidence.map((e, i) => <li key={i} className={`lv-${e.level}`}><b>{LEVEL_ICON[e.level]} {e.aspect}</b> {e.detail}</li>)}</ul>
      {s.warnings.map((x, i) => <p key={i} className="rv-warn">⚠ {x}</p>)}
      <div className="rv-actions"><span className={`rv-conf cf-${s.confidence}`}>Suggestion: {s.confidence} (not a review)</span><button disabled={linked} onClick={onLink}>{linked ? 'Linked' : `Link to ${w.id}`}</button></div>
    </div>
  )
}

/** Field-specific choices for the linked entry: which recording, which definition. Independent of each other. */
function EntryContent({ record: r, word, data, media, working, reviewer, update }: {
  record: SourceRecord; word: Word; data: Loaded; media: SourceRecord['media'][number] | undefined; working: WorkingState; reviewer: string
  update: (fn: (w: WorkingState) => WorkingState) => void
}) {
  const { recording: current, working: recWorking } = effectiveRecording(working, REPO, word.id)
  const item = data.recItems.get(r.key)
  const declared = item?.declaredReading ?? r.candidate.readings[0]
  const fromHere = current?.provenance.record === r.key ? current : null
  const [heard, setHeard] = useState<string>(fromHere?.reading.verified ?? '')
  const [uses, setUses] = useState<RecordingUse[]>(fromHere?.uses ?? ['display'])
  const proposal: SelectedRecording | null = media?.path && media.sha256 ? {
    id: item?.id ?? `${r.source}:recording:${r.key.slice(r.source.length + 1)}`, entry: word.id, scope: 'word', file: media.path, sha256: media.sha256,
    text: item?.text ?? r.candidate.simplified[0] ?? '', provenance: { source: r.source, record: r.key, recordHash: r.hash, mode: 'verbatim' },
    reading: { ...(declared ? { declared } : {}), ...(heard.trim() ? { verified: heard.trim(), verifiedBy: reviewer.trim() || 'unknown', verifiedOn: new Date().toISOString().slice(0, 10) } : {}) },
    ...(SOURCES[r.source]?.variety ? { variety: SOURCES[r.source].variety } : {}),
    validation: heard.trim() ? 'verified' : 'unverified', uses, decision: decision(reviewer)
  } : null
  const eligible = proposal ? eligibleUses(proposal, word) : new Set<RecordingUse>()
  const rel = readingRelation(heard.trim() || declared, word)
  const { selection, working: selWorking } = effectiveSelection(working, REPO, word.id, 'meaning')
  const [meaning, setMeaning] = useState(selection?.choice === 'source' && selection.provenance?.record === r.key ? selection.value ?? '' : r.candidate.meanings[0] ?? '')
  const sel = (after: FieldSelection) => update(w => putOp(w, fieldOp(REPO, word.id, 'meaning', word.meaning, after)))
  return (
    <div className="rv-card">
      <h2>Content for {word.hanzi} <small>({word.id})</small></h2>
      <h3>Recording</h3>
      <p>Selected now: {current ? <>{current.provenance.record} {current.file && <Audio path={current.file} />} {recWorking ? <em className="st-working">changed in this browser</em> : <em className="rv-pill">applied</em>}</> : 'none'} · TTS for this entry: {word.audio === 'none' ? 'off (unreliable)' : audioReliable(word, WORDS) ? 'on' : 'off (shared characters)'}</p>
      {!proposal ? <p className="rv-small">This record has no usable recording.</p> : <>
        <p>This record's clip declares <b>{declared ?? '?'}</b>; the game teaches <b>{word.pinyin}</b>{word.speech.length ? ` (connected speech: ${word.speech.map(s => s.pinyin).join(', ')})` : ''}.</p>
        <label>What do you hear? <input value={heard} placeholder={`e.g. ${word.pinyin}${word.speech[0] ? ` or ${word.speech[0].pinyin}` : ''}`} onChange={e => setHeard(e.target.value)} /></label>
        <p className="rv-small">Leave empty if you did not listen carefully. Reading used for the checks: {heard.trim() || declared || '?'} → {({ main: 'the dictionary reading', variant: 'an accepted variant', speech: 'a connected-speech form', 'tone-differs': 'other tones than the game', different: 'a different reading', unknown: 'unknown' } as const)[rel]}.</p>
        <fieldset className="rv-uses"><legend>Allowed uses</legend>{(Object.keys(USE_LABEL) as RecordingUse[]).map(u => (
          <label key={u}><input type="checkbox" checked={uses.includes(u)} onChange={e => setUses(x => (e.target.checked ? [...x, u] : x.filter(y => y !== u)))} /> {USE_LABEL[u]} {uses.includes(u) && !eligible.has(u) && <em className="cf-conflict">not possible with this reading</em>}</label>))}
        </fieldset>
        <div className="rv-actions">
          <button disabled={uses.length === 0} onClick={() => update(w => putOp(w, recordingOp(REPO, r, word.id, proposal)))}>Use this recording for {word.hanzi}</button>
          {current && <button onClick={() => update(w => putOp(w, recordingOp(REPO, r, word.id, null)))}>Remove the selected recording</button>}
          {recWorking && <button onClick={() => update(w => dropOp(w, `recording:${word.id}`))}>Keep what the game has</button>}
        </div>
      </>}
      <h3>Definition (meaning on answer buttons)</h3>
      <p>Game: <b>{word.meaning}</b> · source: {r.candidate.meanings.join('; ') || '—'} {selection && <em className={selWorking ? 'st-working' : 'rv-pill'}>{selection.choice === 'game' ? 'keep game' : `source: ${selection.value}`}{selWorking ? ' (this browser)' : ' (applied)'}</em>}</p>
      <div className="rv-actions">
        <button onClick={() => sel({ entry: word.id, field: 'meaning', choice: 'game', decision: decision(reviewer) })}>Keep the game's meaning</button>
        <input value={meaning} onChange={e => setMeaning(e.target.value)} />
        <button disabled={!meaning.trim() || meaning.length > LIMITS.meaning} onClick={() => sel({ entry: word.id, field: 'meaning', choice: 'source', value: meaning.trim(), provenance: { source: r.source, record: r.key, recordHash: r.hash, mode: r.candidate.meanings.includes(meaning.trim()) ? 'verbatim' : 'adapted' }, decision: decision(reviewer) })}>Use this text</button>
      </div>
      {meaning.length > LIMITS.meaning && <p className="rv-warn">Too long for an answer button ({meaning.length}/{LIMITS.meaning}): shorten it (it then counts as adapted).</p>}
      <p className="rv-small">The note, explanations and examples are not changed from here.</p>
    </div>
  )
}

function OpLine({ op, data }: { op: WorkingState['ops'][string]; data: Loaded }) {
  const st = opStatus(op, REPO, data.byKey)
  return <span>{describeOp(op)} {st !== 'ok' && <em className="cf-conflict">{st === 'stale' ? 'source changed: reassess' : 'the game changed since: redo'}</em>}</span>
}

function ChangesView({ working, data, reviewer, onDrop, onClear }: { working: WorkingState; data: Loaded; reviewer: string; onDrop: (t: string) => void; onClear: () => void }) {
  const ops = Object.entries(working.ops)
  const bad = ops.filter(([, op]) => opStatus(op, REPO, data.byKey) !== 'ok').length
  const json = () => JSON.stringify(toChangeset(working, reviewer, data.snapshot), null, 2)
  const download = () => {
    const blob = new Blob([json()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `changeset-${working.source}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const [copied, setCopied] = useState(false)
  return (
    <section className="rv-card">
      <h2>Proposed changes ({ops.length})</h2>
      <p className="rv-small">Saved in this browser only. To change the game: export the file and send it to the maintainer, who checks and applies it with <code>npm run source:apply -- changeset.json</code>. Anything that changed in the game since you decided is refused, never overwritten.</p>
      {bad > 0 && <p className="rv-warn">{bad} change{bad === 1 ? '' : 's'} no longer fit what is deployed (marked below): redo or undo them before exporting.</p>}
      {ops.length === 0 ? <p>No changes yet.</p> : <ul className="rv-ops">{ops.map(([t, op]) => <li key={t}><OpLine op={op} data={data} /><button onClick={() => onDrop(t)}>Undo</button></li>)}</ul>}
      <div className="rv-actions">
        <button disabled={!ops.length || !reviewer.trim()} onClick={download}>Export changeset (.json)</button>
        <button disabled={!ops.length || !reviewer.trim()} onClick={() => { void navigator.clipboard?.writeText(json()).then(() => setCopied(true)) }}>{copied ? 'Copied' : 'Copy as text'}</button>
        <button disabled={!ops.length} onClick={onClear}>Clear all</button>
      </div>
      {!reviewer.trim() && <p className="rv-warn">Enter your name at the top to export.</p>}
    </section>
  )
}
