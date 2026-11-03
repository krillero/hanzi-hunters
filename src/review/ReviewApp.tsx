// Source review screen: compare imported source records with the game's entries, and make decisions (link, exclude, draft a
// new entry, pick a recording or a definition). Decisions are saved in this browser only, exported as a changeset file and
// applied to the repository with `npm run source:apply`. Nothing here changes the game directly. Workflow: docs/SOURCES.md.
// Each candidate pair shows three separate things: matching EVIDENCE (computed), the MEANING and WORDING ASSESSMENTS (stored in
// src/content/assessments/<source>.json, with provenance and freshness), and the reviewer's own DECISIONS (drafts here, then a
// changeset). Imported content, AI-assisted assessments, mapping decisions, selected game content and curriculum activation are
// shown as separate things.
import { useEffect, useMemo, useState } from 'react'
import wordsJson from '../content/words.json'
import mappingsJson from '../content/sourceMappings.json'
import recordingsJson from '../content/recordings.json'
import selectionsJson from '../content/selections.json'
import sourcesJson from '../content/sources.json'
import curriculaJson from '../content/curricula.json'
import { WORDS } from '../data'
import { EXPLANATIONS } from '../content/index'
import { audioReliable } from '../content/entries'
import { LIMITS } from '../content/validate'
import { eligibleUses, readingRelation } from '../content/recordings'
import { STRENGTH_LABEL, type Suggestion } from '../sources/match'
import { sourceDefinition } from '../sources/compare'
import {
  candidateComparisons, coverage, coverageLine, emptyAssessments, exampleFreshness, FRESHNESS_LABEL, METHOD_LABEL, recordFreshness, SCOPE_LABEL,
  shortStatus, upgradeAssessments, WORDING_NOT_ASSESSED, type AssessmentsFile, type Comparison, type ExampleAssessment, type Freshness, type RecordAssessment
} from '../sources/assessment'
import { searchScore } from '../sources/search'
import { draftFromRecord, neutralPositions, type RepoState } from '../sources/changeset'
import type { ContentItem, EntryDraft, FieldSelection, Mapping, RecordingItem, RecordingUse, SelectedRecording, SentenceItem, SourceIndex, SourceRecord } from '../sources/types'
import type { RawWord, Sources, Word } from '../content/types'
import {
  decision, describeOp, dropOp, effectiveMapping, effectiveRecording, effectiveSelection, fieldOp, loadReviewer, loadWorkingWithNotice,
  mappingOp, opStatus, putOp, recordingOp, saveReviewer, saveWorking, toChangeset, type LoadNotice, type WorkingState
} from './store'

const BASE = import.meta.env.BASE_URL
const SOURCES = sourcesJson as unknown as Sources
/** The committed state this build was made from ("applied to the game"). */
const REPO: RepoState = { words: wordsJson as unknown as RawWord[], mappings: mappingsJson as unknown as RepoState['mappings'], recordings: recordingsJson as unknown as RepoState['recordings'], selections: selectionsJson as unknown as RepoState['selections'] }
/** Assessment files, one per source, loaded only for the source being reviewed. */
const ASSESSMENT_FILES = import.meta.glob('../content/assessments/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>
const loadAssessments = async (source: string): Promise<AssessmentsFile> => { const f = ASSESSMENT_FILES[`../content/assessments/${source}.json`]; return f ? upgradeAssessments((await f()) as AssessmentsFile) : emptyAssessments(source) }
/** Entries of the active (default) course and their lesson: curriculum activation, separate from everything else here. */
const COURSE = (() => {
  const c = curriculaJson as unknown as { default: string; curricula: { id: string; title: string; units: { lessons: { id: string; title?: string; introductions: { entryId: string }[] }[] }[] }[] }
  const cur = c.curricula.find(x => x.id === c.default)
  const lessonOf = new Map<string, string>()
  for (const u of cur?.units ?? []) for (const l of u.lessons) for (const i of l.introductions) lessonOf.set(i.entryId, `${l.id}${l.title ? ` (${l.title})` : ''}`)
  return { title: cur?.title ?? c.default, lessonOf }
})()
const WORD_BY_ID = new Map(WORDS.map(w => [w.id, w]))
const PAGE = 40
const storage = (() => { try { return window.localStorage } catch { return null } })()

type Filter = 'all' | 'unresolved' | 'linked' | 'new-candidate' | 'excluded' | 'reassess' | 'audio' | 'working'
  | 'no-match' | 'text-same' | 'text-different' | 'meaning-pending' | 'different-sense' | 'wording-pending' | 'wording-proposed' | 'uncertain-stale' | 'pronunciation'
  | 'has-match' | 'new-cand' | 'first' | 'additional' | 'excluded-prop' | 'missing-short' | 'multi' | 'has-examples' | 'ex-mismatch' | 'audio-unknown' | 'rec-uncertain'
/** Decision filters (what the reviewer decided). */
const DECISION_FILTERS: [Filter, string][] = [['all', 'All'], ['unresolved', 'Unresolved'], ['linked', 'Linked'], ['new-candidate', 'New candidates'], ['excluded', 'Excluded'], ['reassess', 'Needs reassessment'], ['audio', 'Has audio'], ['working', 'Changed here']]
/** Comparison filters: a record matches when ANY of its candidate pairs does. */
const COMPARISON_FILTERS: [Filter, string, (c: Comparison) => boolean][] = [
  ['text-same', 'Exact or formatting-only text', c => c.text === 'exact' || c.text === 'formatting'],
  ['text-different', 'Different wording', c => c.text === 'different'],
  ['meaning-pending', 'Meaning assessment pending', c => c.meaning.state === 'not-assessed'],
  ['different-sense', 'Different sense', c => c.meaning.state === 'different'],
  ['wording-pending', 'Wording assessment pending', c => c.wording.state === 'not-assessed'],
  ['wording-proposed', 'Wording change proposed', c => c.wording.state === 'prefer-source' || c.wording.state === 'edited'],
  ['uncertain-stale', 'Uncertain or outdated', c => c.meaning.state === 'uncertain' || !!c.outdated],
  ['pronunciation', 'Pronunciation differs', c => c.pronunciation.differs]
]
const PREDICATE = new Map(COMPARISON_FILTERS.map(([f, , p]) => [f, p]))
/** Record-level filters (record dispositions, source fields, examples, audio): a record matches on its own data. */
type RecInfo = { ra?: RecordAssessment; raFresh?: Freshness; r: SourceRecord; examples: number; ex: { a: ExampleAssessment; fresh: Freshness }[]; audioUnknown: boolean; comparisons: Comparison[] }
const RECORD_FILTERS: [Filter, string, (i: RecInfo) => boolean][] = [
  ['has-match', 'Existing game match', i => i.comparisons.length > 0],
  ['new-cand', 'New vocabulary candidate', i => i.raFresh === 'current' && i.ra?.disposition === 'new-candidate'],
  ['first', 'Proposed first expansion', i => i.raFresh === 'current' && i.ra?.expansion === 'first'],
  ['additional', 'Additional sense', i => i.raFresh === 'current' && (i.ra?.disposition === 'additional-sense' || !!i.ra?.senses?.some(s => s.status === 'not-taught' || s.status === 'separate-entry-proposed'))],
  ['excluded-prop', 'Excluded from the proposal', i => i.raFresh === 'current' && i.ra?.disposition === 'excluded'],
  ['missing-short', 'Missing short meaning', i => !!i.r.candidate.meaningMissing],
  ['multi', 'Several meanings to separate', i => i.raFresh === 'current' && !!i.ra?.multipleSenses],
  ['has-examples', 'Has examples', i => i.examples > 0],
  ['ex-mismatch', 'Example / sense mismatch', i => i.ex.some(x => x.fresh === 'current' && x.a.verdict === 'other-sense')],
  ['audio-unknown', 'Audio origin unknown', i => i.audioUnknown],
  ['rec-uncertain', 'Record uncertain or outdated', i => (i.raFresh === 'current' && i.ra?.disposition === 'uncertain') || (!!i.ra && i.raFresh !== 'current') || i.ex.some(x => x.fresh !== 'current' || x.a.verdict === 'uncertain')]
]
const REC_PREDICATE = new Map(RECORD_FILTERS.map(([f, , p]) => [f, p]))
const DISPOSITION_LABEL: Record<RecordAssessment['disposition'], string> = { match: 'Candidate match to an existing game entry', 'additional-sense': 'Additional sense of an existing word', 'new-candidate': 'New beginner vocabulary candidate', uncertain: 'Uncertain or incomplete', excluded: 'Excluded from the proposed beginner expansion' }
const VERDICT_LABEL: Record<ExampleAssessment['verdict'], string> = { suitable: 'Suitable example', 'needs-editing': 'Suitable after editing', 'other-sense': 'Shows another sense', 'not-beginner': 'Not beginner-appropriate', uncertain: 'Uncertain' }
const USE_LABEL: Record<RecordingUse, string> = { display: 'Play on word cards', listen: 'Listening: hear → pick the characters', listen2meaning: 'Listening: hear → pick the meaning', listen2pinyin: 'Listening: hear → pick the pinyin' }
const LEVEL_ICON = { match: '✓', partial: '≈', mismatch: '✗', neutral: '·', unknown: '?' } as const

type Loaded = {
  source: string; snapshot: string; records: SourceRecord[]; byKey: Map<string, SourceRecord>; recItems: Map<string, RecordingItem>
  sentences: Map<string, SentenceItem[]>; assessments: AssessmentsFile
  recAssess: Map<string, { a: RecordAssessment; fresh: Freshness }>; exAssess: Map<string, { a: ExampleAssessment; fresh: Freshness }[]>
}

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
  const [notice, setNotice] = useState<LoadNotice | null>(null)

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
      fetch(`${BASE}sources/${sourceId}/content.json`).then(r => (r.ok ? r.json() : { content: [] })).catch(() => ({ content: [] })),
      loadAssessments(sourceId)
    ]).then(([rec, con, assessments]: [{ snapshot: string; records: SourceRecord[] }, { content?: ContentItem[] }, AssessmentsFile]) => {
      const recItems = new Map<string, RecordingItem>()
      const sentences = new Map<string, SentenceItem[]>(), sentenceById = new Map<string, SentenceItem>()
      for (const c of con.content ?? []) {
        if (c.type === 'recording' && c.provenance.record && !recItems.has(c.provenance.record)) recItems.set(c.provenance.record, c)
        if (c.type === 'sentence' && c.provenance.record) { sentences.set(c.provenance.record, [...(sentences.get(c.provenance.record) ?? []), c]); sentenceById.set(c.id, c) }
      }
      const byKey = new Map(rec.records.map(r => [r.key, r]))
      const recAssess = new Map((assessments.records ?? []).map(a => [a.record, { a, fresh: recordFreshness(a, byKey.get(a.record), WORDS, EXPLANATIONS) }]))
      const exAssess = new Map<string, { a: ExampleAssessment; fresh: Freshness }[]>()
      for (const a of assessments.examples ?? []) exAssess.set(a.sentence, [...(exAssess.get(a.sentence) ?? []), { a, fresh: exampleFreshness(a, sentenceById.get(a.sentence), WORDS, EXPLANATIONS) }])
      setData({ source: sourceId, snapshot: rec.snapshot, records: rec.records, byKey, recItems, sentences, assessments, recAssess, exAssess })
      const loaded = loadWorkingWithNotice(storage, sourceId, rec.snapshot)
      setWorking(loaded.state); setNotice(loaded.notice ?? null)
    }).catch(e => setError(`Could not load ${sourceId}: ${(e as Error).message}`))
  }, [sourceId])

  const update = (fn: (w: WorkingState) => WorkingState) => setWorking(w => { if (!w) return w; const n = fn(w); setSaved(saveWorking(storage, n)); return n })

  const info = useMemo(() => {
    const out = new Map<string, { status: Mapping['status']; working: boolean; reassess: boolean; audio: boolean; suggestions: Suggestion[]; comparisons: Comparison[]; focus?: Comparison; rec: RecInfo }>()
    if (!data || !working) return out
    // Reviewer decisions as they stand in this browser (drafts over committed ones): they feed "confirmed by a reviewer".
    const mappings: Record<string, Mapping | undefined> = {}
    for (const r of data.records) mappings[r.key] = effectiveMapping(working, REPO, r.key).mapping ?? undefined
    const cmp = candidateComparisons(data.records, WORDS, EXPLANATIONS, data.assessments, mappings)
    for (const r of data.records) {
      const { mapping, working: w } = effectiveMapping(working, REPO, r.key)
      const { suggestions, comparisons } = cmp.get(r.key)!
      // The pair shown in the list: the linked entry, else the first candidate not assessed or decided as a different sense.
      const focus = comparisons.find(c => mapping?.status === 'linked' && c.entry === mapping.entry) ?? comparisons.find(c => c.meaning.state !== 'different') ?? comparisons[0]
      const ops = Object.values(working.ops).filter(op => (op.op === 'field' ? op.after.provenance?.record === r.key : op.record === r.key))
      out.set(r.key, {
        status: mapping?.status ?? 'unresolved', working: w || ops.length > 0, suggestions, comparisons, focus,
        rec: { r, ra: data.recAssess.get(r.key)?.a, raFresh: data.recAssess.get(r.key)?.fresh, examples: data.sentences.get(r.key)?.length ?? 0, ex: (data.sentences.get(r.key) ?? []).flatMap(s => data.exAssess.get(s.id) ?? []), audioUnknown: !!data.recItems.get(r.key) && data.recItems.get(r.key)!.origin?.status !== 'known' && !!data.recItems.get(r.key)!.origin, comparisons },
        reassess: !!REPO.mappings.mappings[r.key]?.reassess || ops.some(op => opStatus(op, REPO, data.byKey) !== 'ok'),
        audio: r.media.some(m => m.path)
      })
    }
    return out
  }, [data, working])

  const books = useMemo(() => [...new Set((data?.records ?? []).map(r => r.placement?.book).filter((b): b is number => b !== undefined))].sort((a, b) => a - b), [data])
  const lessons = useMemo(() => [...new Set((data?.records ?? []).filter(r => !book || String(r.placement?.book) === book).map(r => r.placement?.lesson).filter((b): b is number => b !== undefined))].sort((a, b) => a - b), [data, book])

  const filtered = useMemo(() => {
    if (!data) return []
    const scores = new Map<string, number>()
    const out = data.records.filter(r => {
      const i = info.get(r.key)
      if (!i) return false
      if (book && String(r.placement?.book) !== book) return false
      if (lesson && String(r.placement?.lesson) !== lesson) return false
      if (filter === 'no-match' && i.comparisons.length > 0) return false
      const pred = PREDICATE.get(filter)
      if (pred && !i.comparisons.some(pred)) return false
      const rp = REC_PREDICATE.get(filter)
      if (rp && !rp(i.rec)) return false
      if (filter === 'reassess' && !i.reassess) return false
      if (filter === 'audio' && !i.audio) return false
      if (filter === 'working' && !i.working) return false
      if (['unresolved', 'linked', 'new-candidate', 'excluded'].includes(filter) && i.status !== filter) return false
      const score = searchScore(r, q)
      scores.set(r.key, score)
      return score > 0
    })
    // Best matches first (exact characters / reading / ID), then the source's own order.
    return q.trim() ? out.sort((a, b) => scores.get(b.key)! - scores.get(a.key)!) : out
  }, [data, info, q, filter, book, lesson])

  /** Filter counts are SOURCE RECORDS (a record counts once when any of its candidate pairs matches). */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, unresolved: 0, linked: 0, 'new-candidate': 0, excluded: 0, reassess: 0, audio: 0, working: 0, 'no-match': 0 }
    for (const [f] of COMPARISON_FILTERS) c[f] = 0
    for (const [f] of RECORD_FILTERS) c[f] = 0
    for (const i of info.values()) {
      c.all++; c[i.status]++; if (i.reassess) c.reassess++; if (i.audio) c.audio++; if (i.working) c.working++
      if (i.comparisons.length === 0) c['no-match']++
      for (const [f, , p] of COMPARISON_FILTERS) if (i.comparisons.some(p)) c[f]++
      for (const [f, , p] of RECORD_FILTERS) if (p(i.rec)) c[f]++
    }
    return c
  }, [info])
  /** Coverage is counted in CANDIDATE PAIRS (one source record compared with one game entry). */
  const cov = useMemo(() => coverage([...info.values()].flatMap(i => i.comparisons)), [info])
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
        {notice && <div className={notice.kind === 'migrated' ? 'rv-note' : 'rv-warn'} role="status"><p>{notice.message}</p>
          {notice.raw && <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([notice.raw!], { type: 'application/json' })); a.download = `review-drafts-unreadable-${sourceId}.json`; a.click() }}>Download the unreadable drafts</button>}
          <button onClick={() => setNotice(null)}>Dismiss</button></div>}
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
            <div className="rv-cov" aria-label="Assessment coverage">
              <p><b>{coverageLine(cov)}</b></p>
              <p className="rv-small">Units: {cov.pairs} candidate pairs ({cov.records} source records compared with {cov.entries} game entries); {counts['no-match']} of {counts.all} source records have no matching game entry. Meaning: {cov.meaning['likely-equivalent']} likely equivalent, {cov.meaning['same-confirmed']} confirmed by a reviewer, {cov.meaning.different} different sense, {cov.meaning.uncertain} uncertain, {cov.meaning['not-assessed']} not assessed. Wording: {cov.wording['prefer-source'] + cov.wording.edited} change{cov.wording['prefer-source'] + cov.wording.edited === 1 ? '' : 's'} proposed, {cov.wording['keep-game']} keep game wording (assessed), {cov.wording['not-applicable']} not applicable, {cov.wording['not-assessed']} not assessed. Assessments: {cov.byMethod['ai-assisted']} AI-assisted, {cov.byMethod.human} human, {cov.outdated} outdated.</p>
            </div>
            <p className="rv-small">Filter counts are source records; a record matches a comparison filter when any of its candidate pairs does.</p>
            <div className="rv-chips" role="group" aria-label="Decision filters">{DECISION_FILTERS.map(([f, label]) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setPage(0) }}>{label} <small>{counts[f]}</small></button>)}</div>
            <div className="rv-chips" role="group" aria-label="Comparison filters">{[['no-match', 'No matching game entry'] as [Filter, string], ...COMPARISON_FILTERS.map(([f, l]) => [f, l] as [Filter, string])].map(([f, label]) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setPage(0) }}>{label} <small>{counts[f]}</small></button>)}</div>
            {(data.assessments.records?.length ?? 0) + (data.assessments.examples?.length ?? 0) > 0 && <>
              <p className="rv-small">Record proposals ({data.source}): {[...data.recAssess.values()].filter(x => x.fresh === 'current').length} of {counts.all} source records have a current disposition; examples: {[...data.exAssess.values()].flat().filter(x => x.fresh === 'current').length} example assessments for {[...data.sentences.values()].flat().length} extracted sentences (not every sentence is assessed).</p>
              <div className="rv-chips" role="group" aria-label="Record filters">{RECORD_FILTERS.map(([f, label]) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setPage(0) }}>{label} <small>{counts[f]}</small></button>)}</div>
            </>}
            {(data.assessments.records?.length ?? 0) === 0 && <div className="rv-chips" role="group" aria-label="Record filters">{RECORD_FILTERS.filter(([f]) => ['has-match', 'missing-short', 'has-examples', 'audio-unknown'].includes(f) && counts[f] > 0).map(([f, label]) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setPage(0) }}>{label} <small>{counts[f]}</small></button>)}</div>}
            {books.length > 0 && <div className="rv-row">
              <label>Book <select value={book} onChange={e => { setBook(e.target.value); setLesson(''); setPage(0) }}><option value="">all</option>{books.map(b => <option key={b} value={b}>B{b}</option>)}</select></label>
              <label>Lesson <select value={lesson} onChange={e => { setLesson(e.target.value); setPage(0) }}><option value="">all</option>{lessons.map(l => <option key={l} value={l}>L{l}</option>)}</select></label>
            </div>}
            <p className="rv-small">{filtered.length} record{filtered.length === 1 ? '' : 's'}</p>
            <ul className="rv-items">{shown.map(r => {
              const i = info.get(r.key)!
              return <li key={r.key}><button className={selected === r.key ? 'on' : ''} onClick={() => setSelected(r.key)}>
                <span className="rv-zh" lang="zh-CN">{r.candidate.simplified[0] ?? '—'}</span>
                <span className="rv-mid"><b>{r.candidate.readings.join(' / ')}</b><small>{r.candidate.meanings.join('; ')}</small></span>
                <span className="rv-tags"><em className={`st-${i.status}`}>{i.status}</em>{i.rec.ra && i.rec.raFresh === 'current' && <em className={`d-${i.rec.ra.disposition}`}>{i.rec.ra.disposition}{i.rec.ra.expansion === 'first' ? ' · first expansion' : ''}</em>}{i.focus ? <em className={`m-${i.focus.meaning.state}`}>{shortStatus(i.focus)}{i.comparisons.length > 1 ? ` (+${i.comparisons.length - 1} more)` : ''}</em> : <em className="m-none">no matching game entry</em>}{i.working && <em className="st-working">changed</em>}{i.reassess && <em className="cf-conflict">reassess</em>}<small>{r.placement?.label ?? r.originalId}</small></span>
              </button></li>
            })}</ul>
            <div className="rv-row rv-pager"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</button><span>Page {page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next ›</button></div>
          </section>
          {record && <RecordDetail key={record.key} record={record} data={data} localOnly={sourceInfo?.media === 'local-only'} suggestions={info.get(record.key)?.suggestions ?? []} comparisons={info.get(record.key)?.comparisons ?? []} working={working} reviewer={reviewer} update={update} onClose={() => setSelected(null)} />}
        </div>
      )}
    </main>
  )
}

/** A preview player. Local-only sources: the file exists only after a local import, so a failure explains why instead of a silent error. */
function Audio({ path, localOnly }: { path: string; localOnly?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="rv-small">{localOnly ? 'Audio preview unavailable here: this source\'s audio is not published. Import the package locally (npm run source:import) to listen.' : 'Audio could not be loaded.'}</span>
  return <audio className="rv-audio" controls preload="none" src={`${BASE}${path}`} onError={() => setFailed(true)} />
}

/** One record: the comparison (evidence, assessments) for each candidate entry, then three separate decisions. */
function RecordDetail({ record: r, data, localOnly, suggestions, comparisons, working, reviewer, update, onClose }: {
  record: SourceRecord; data: Loaded; localOnly: boolean; suggestions: Suggestion[]; comparisons: Comparison[]; working: WorkingState; reviewer: string
  update: (fn: (w: WorkingState) => WorkingState) => void; onClose: () => void
}) {
  const { mapping, working: mappingWorking } = effectiveMapping(working, REPO, r.key)
  const committed = REPO.mappings.mappings[r.key] ?? null
  const distinct = mapping?.distinctFrom ?? []
  const linkedId = mapping?.status === 'linked' ? mapping.entry : undefined
  const [focusId, setFocusId] = useState<string | undefined>(() => linkedId ?? comparisons.find(c => c.meaning.state !== 'different')?.entry ?? comparisons[0]?.entry)
  const focus = focusId ? WORD_BY_ID.get(focusId) : undefined
  const [other, setOther] = useState('')
  const [reason, setReason] = useState(mapping?.reason ?? '')
  const proposal = data.recAssess.get(r.key)
  const [draft, setDraft] = useState<EntryDraft>(() => mapping?.draft ?? (proposal?.fresh === 'current' && proposal.a.draft ? (({ related, ...d }) => { void related; return d })(proposal.a.draft) : draftFromRecord(r, WORDS)))
  const keep = (m: Mapping | null) => ({ ...(m?.distinctFrom?.length ? { distinctFrom: m.distinctFrom } : {}) })
  const setMapping = (after: Omit<Mapping, 'recordHash' | 'decision'>) => update(w => putOp(w, mappingOp(REPO, r, after, reviewer)))
  const c = comparisons.find(x => x.entry === focusId)
  const s = suggestions.find(x => x.entry === focusId)
  const ops = Object.entries(working.ops).filter(([, op]) => (op.op === 'field' ? op.after.provenance?.record === r.key || op.entry === linkedId : op.record === r.key || (op.op === 'recording' && op.entry === linkedId)))
  const media = r.media.find(m => m.path)
  const state = mapping?.status === 'linked' ? `linked to ${mapping.entry}` : mapping?.status === 'excluded' ? `excluded${mapping.reason ? ` (${mapping.reason})` : ''}` : mapping?.status === 'new-candidate' ? 'new-entry candidate' : 'unresolved'
  const saveCandidate = (d: EntryDraft, extraDistinct: string[] = []) => setMapping({ status: 'new-candidate', ...(distinct.length || extraDistinct.length ? { distinctFrom: [...new Set([...distinct, ...extraDistinct])] } : {}), draft: Object.fromEntries(Object.entries({ ...d, neutral: neutralPositions(d.pinyin) }).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0))) as EntryDraft })
  return (
    <section className="rv-detail" aria-label={`Record ${r.key}`}>
      <button className="rv-back" onClick={onClose}>‹ Back to the list</button>
      <div className="rv-card">
        <div className="rv-title"><span className="rv-big" lang="zh-CN">{r.candidate.simplified[0] ?? '—'}</span>
          <div><b>{r.candidate.readings.join(' / ') || 'no reading'}</b><div>{sourceDefinition(r)}</div><small>{r.key} · {r.placement?.label ?? 'no placement'}</small></div></div>
        {r.media.map(m => <div key={m.id} className="rv-media">{m.path ? <Audio path={m.path} localOnly={localOnly} /> : <span className="rv-warn">Audio missing: {m.problems.join(', ')}</span>}<small> checks: {m.checks.join(', ') || 'none'}{data.recItems.get(r.key)?.origin ? ` · origin: ${data.recItems.get(r.key)!.origin!.status}` : ''}{data.recItems.get(r.key)?.pronunciation ? ' · pronunciation not verified by listening' : ''}</small></div>)}
        <p>Decision now: <b>{state}</b>{distinct.length > 0 && <> · different sense from {distinct.join(', ')}</>} {mappingWorking ? <em className="st-working">changed in this browser</em> : mapping ? <em className="rv-pill">applied</em> : <em className="rv-pill">no decision (default)</em>}{committed?.reassess && <em className="cf-conflict">needs reassessment: {committed.reassess}</em>}</p>
        <details><summary>Original fields (verbatim)</summary>
          <table className="rv-fields"><tbody>{Object.entries(r.fields).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v || <i>empty</i>}</td></tr>)}{Object.entries(r.native).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}<tr><th>hash</th><td>{r.hash}</td></tr>{r.media.map(m => <tr key={m.id}><th>audio file</th><td>{m.original} · checks: {m.checks.join(', ') || 'none'}{m.problems.length ? ` · problems: ${m.problems.join(', ')}` : ''}</td></tr>)}</tbody></table>
        </details>
        {(r.candidate.flags.length > 0 || r.issues.length > 0) && <p className="rv-warn">{[...r.candidate.flags.map(f => `flag: ${f}`), ...r.issues].join(' · ')}</p>}
      </div>

      <SourceDetails record={r} data={data} />
      {comparisons.length === 0 ? <div className="rv-card"><p><b>No matching game entry.</b> No game entry is written {r.candidate.simplified.join(' / ')}. Link it to another entry, prepare a new entry, or leave it unresolved (below).</p></div> : <>
        {comparisons.length > 1 && <div className="rv-card rv-row" role="group" aria-label="Game entry to compare with"><span className="rv-small">Compare with:</span>{comparisons.map(x => { const w = WORD_BY_ID.get(x.entry)!; return <button key={x.entry} className={x.entry === focusId ? 'on' : ''} onClick={() => setFocusId(x.entry)}>{w.hanzi} {w.pinyin} · {w.meaning} <small>({x.meaning.state === 'not-assessed' ? 'meaning pending' : x.meaning.label.split('—')[0].toLowerCase()})</small></button> })}</div>}
        {focus && c && <>
          <ComparisonCard record={r} word={focus} c={c} s={s} />

          <div className="rv-card">
            <h2>1 · Are these the same teaching sense?</h2>
            <p className="rv-small">Assessment: <b>{c.meaning.label}</b>. Your decision below is what counts; the assessment is advice.</p>
            <div className="rv-actions">
              <button className={linkedId === focus.id ? 'on' : ''} onClick={() => setMapping({ status: 'linked', entry: focus.id, ...(distinct.filter(e => e !== focus.id).length ? { distinctFrom: distinct.filter(e => e !== focus.id) } : {}) })}>Same sense → link</button>
              <button className={distinct.includes(focus.id) ? 'on' : ''} onClick={() => setMapping({ ...(mapping && mapping.status !== 'linked' ? { status: mapping.status, reason: mapping.reason, draft: mapping.draft } : { status: 'unresolved' as const }), distinctFrom: [...new Set([...distinct, focus.id])] })}>Different sense → keep separate</button>
              <button onClick={() => setMapping({ status: 'unresolved', ...keep(mapping) })}>Not sure → leave unresolved</button>
            </div>
            {c.meaning.state === 'different' && <div className="rv-note"><p>The senses differ: do not replace one definition with the other. The record can stay separate, or become a candidate for a new game entry.</p>
              <button disabled={WORD_BY_ID.has(draft.id) || !draft.hanzi.trim()} onClick={() => saveCandidate(draft, [focus.id])}>Keep separate and save as new-entry candidate ({draft.id})</button>
              {WORD_BY_ID.has(draft.id) && <p className="rv-small">Change the proposed id under “Other actions” first: “{draft.id}” is used.</p>}</div>}
            <p className="rv-small">Linking only says “this record teaches the sense of that entry”. It changes no text, selects no audio and adds nothing to a lesson.</p>
          </div>

          {linkedId === focus.id
            ? <EntryContent record={r} word={focus} data={data} media={media} localOnly={localOnly} working={working} reviewer={reviewer} update={update} c={c} />
            : <div className="rv-card rv-muted"><h2>2 · Which wording should be used?</h2>
              {c.meaning.state === 'different' ? <p className="rv-small">Not applicable: the senses differ, so neither definition replaces the other.</p> : <p className="rv-small">Link the record first (step 1). Then choose the wording and any recording, each on its own. Wording assessment: {c.wording.label}</p>}
              <h2>3 · Which additional content (audio) should be selected?</h2><p className="rv-small">Available after linking.</p></div>}
        </>}
      </>}

      <details className="rv-card"><summary>Other actions: link to another entry, exclude, prepare a new entry</summary>
        <div className="rv-actions">
          <label>Link to another entry <input list="rv-entries" value={other} onChange={e => setOther(e.target.value)} placeholder="entry id" /></label>
          <button disabled={!WORD_BY_ID.has(other)} onClick={() => { setMapping({ status: 'linked', entry: other }); setFocusId(other) }}>Link</button>
          <datalist id="rv-entries">{WORDS.map(w => <option key={w.id} value={w.id}>{w.hanzi} {w.pinyin} {w.meaning}</option>)}</datalist>
        </div>
        <div className="rv-actions">
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="reason (optional)" />
          <button onClick={() => setMapping({ status: 'excluded', reason: reason.trim() || undefined, ...keep(mapping) })}>Exclude (not wanted)</button>
        </div>
        <div className="rv-draft">
          <h3>Prepare a new game entry (draft)</h3>
          <p className="rv-small">A draft is not playable. It becomes an entry only through <code>npm run source:promote</code> and validation, and joins a lesson only when someone adds it to a course.</p>
          {(['id', 'hanzi', 'pinyin', 'meaning', 'note', 'group'] as const).map(k => <label key={k}>{k} <input value={draft[k] ?? ''} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} /></label>)}
          <p className="rv-small">Neutral tone: {neutralPositions(draft.pinyin).length ? `syllable ${neutralPositions(draft.pinyin).join(', ')} (no tone mark)` : 'none'}. Write the pinyin as the game teaches it (lowercase, tone marks; leave neutral syllables unmarked).</p>
          <label>kind <select value={draft.kind ?? ''} onChange={e => setDraft(d => ({ ...d, kind: (e.target.value || undefined) as EntryDraft['kind'] }))}><option value="">automatic</option><option value="word">word</option><option value="character">character</option><option value="particle">particle</option></select></label>
          <label>variants (other accepted readings, comma-separated) <input value={(draft.variants ?? []).join(', ')} onChange={e => setDraft(d => ({ ...d, variants: e.target.value.split(/\s*,\s*/).filter(Boolean) }))} /></label>
          {draft.meaning.length > LIMITS.meaning && <p className="rv-warn">The meaning has {draft.meaning.length} characters; answer buttons allow {LIMITS.meaning}.</p>}
          {WORD_BY_ID.has(draft.id) && <p className="rv-warn">The id “{draft.id}” is already used.</p>}
          <button disabled={!draft.id.trim() || WORD_BY_ID.has(draft.id) || !draft.hanzi.trim()} onClick={() => saveCandidate(draft)}>Save as new-entry candidate</button>
        </div>
      </details>

      <div className="rv-card">
        <h2>Proposed changes for this record</h2>
        {ops.length === 0 ? <p className="rv-small">None: no decision has been made here, so nothing will change in the game (the application's default, not a review).</p> : <ul className="rv-ops">{ops.map(([t, op]) => <li key={t}><OpLine op={op} data={data} /><button onClick={() => update(w => dropOp(w, t))}>Undo</button></li>)}</ul>}
      </div>
    </section>
  )
}

/** Records of other imported sources, fetched only when a reviewer asks (they can be large). */
const otherSourceCache = new Map<string, Promise<{ records: SourceRecord[]; assessments: AssessmentsFile }>>()
const loadOther = (id: string) => {
  let p = otherSourceCache.get(id)
  if (!p) { p = Promise.all([fetch(`${BASE}sources/${id}/records.json`).then(r => (r.ok ? r.json() : { records: [] })), loadAssessments(id)]).then(([r, a]) => ({ records: (r as { records: SourceRecord[] }).records, assessments: a })); otherSourceCache.set(id, p) }
  return p
}
function OtherSources({ record: r, current }: { record: SourceRecord; current: string }) {
  const [rows, setRows] = useState<{ source: string; r: SourceRecord; note: string }[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => {
    fetch(`${BASE}sources/index.json`).then(x => x.json()).then(async (i: SourceIndex) => {
      const out: { source: string; r: SourceRecord; note: string }[] = []
      for (const s of i.sources.filter(x => x.id !== current)) {
        const { records, assessments } = await loadOther(s.id)
        for (const o of records) if (o.candidate.simplified.some(f => r.candidate.simplified.includes(f))) {
          const pairs = assessments.assessments.filter(a => a.record === o.key).map(a => `${a.entry}: ${a.meaning.verdict}`)
          out.push({ source: s.id, r: o, note: pairs.length ? `assessed against the game: ${pairs.join('; ')}` : 'no assessment' })
        }
      }
      setRows(out)
    }).catch(e => setErr((e as Error).message))
  }
  return <details className="rv-card" onToggle={e => { if ((e.target as HTMLDetailsElement).open && !rows) load() }}>
    <summary>Same written form in other imported sources</summary>
    <p className="rv-small">Additional evidence only. Sources are not merged, and agreement between them is not proof that either is correct.</p>
    {err && <p className="rv-warn">{err}</p>}
    {!rows && !err && <p className="rv-small">Loading…</p>}
    {rows && (rows.length === 0 ? <p className="rv-small">None.</p> : <ul className="rv-small">{rows.map(x => <li key={x.r.key}><b>{x.source}</b> {x.r.originalId}: {x.r.candidate.simplified.join(' / ')} {x.r.candidate.readings.join(' / ')} “{sourceDefinition(x.r) || '—'}” · {x.note}</li>)}</ul>)}
  </details>
}

/** What the source itself says (imported, verbatim structure), the AI-assisted record proposal, and the extracted examples. */
function SourceDetails({ record: r, data }: { record: SourceRecord; data: Loaded }) {
  const c = r.candidate
  const ra = data.recAssess.get(r.key)
  const sentences = data.sentences.get(r.key) ?? []
  const hasStructure = c.definitions || c.meaningMissing !== undefined || c.meta
  return <>
    {hasStructure && <div className="rv-card">
      <h2>Imported source content</h2>
      <p><b>Source short meaning:</b> {c.meaningMissing ? <em className="rv-pill">missing in the source</em> : <>“{sourceDefinition(r)}”</>}{c.meaningMissing && <span className="rv-small"> Any short label below is an editorial proposal, not the source's.</span>}</p>
      {c.pos.length > 0 && <p className="rv-small">Part of speech (source): {c.pos.map(p => (p === c.posDominant ? `${p} (main)` : p)).join(', ')}</p>}
      {c.meta && <p className="rv-small">Source metadata (evidence, not a teaching order): {Object.entries(c.meta).map(([k, v]) => `${k} ${v}`).join(' · ')}{r.native.deck ? ` · deck ${r.native.deck}` : ''}</p>}
      {c.definitions && c.definitions.length > 0 && <details open={c.definitions.length <= 2}><summary>Full definitions ({c.definitions.length} reading{c.definitions.length === 1 ? '' : 's'}; other readings are other words or senses)</summary>
        {c.definitions.map((d, i) => <div key={i} className="rv-def"><b>{d.reading}</b>{d.zhuyin ? <small> {d.zhuyin}</small> : null}<ol>{d.senses.map((x, j) => <li key={j}>{x}</li>)}</ol>{d.classifiers?.length ? <small>measure words: {d.classifiers.map(x => `${x.form}${x.reading ? ` ${x.reading}` : ''}`).join(', ')}</small> : null}</div>)}
      </details>}
    </div>}
    {ra && <div className={`rv-card rv-rec d-${ra.a.disposition}`}>
      <h2>Proposal for this record</h2>
      {ra.fresh !== 'current' ? <p className="rv-warn"><b>{FRESHNESS_LABEL[ra.fresh]}</b> Shown for reference only: {ra.a.disposition}.</p> : <>
        <p><b>{DISPOSITION_LABEL[ra.a.disposition]}</b>{ra.a.relatedEntries?.length ? ` (${ra.a.relatedEntries.join(', ')})` : ''}{ra.a.expansion === 'first' ? ' · proposed for the first beginner expansion' : ra.a.expansion === 'later' ? ' · later' : ''}. {ra.a.reason}</p>
        {ra.a.senses && <ul className="rv-small">{ra.a.senses.map((x, i) => <li key={i}>{x.label}: <b>{({ 'taught-by-entry': 'taught by the game entry', 'not-taught': 'not taught (keep separate)', 'separate-entry-proposed': 'separate entry proposed', 'out-of-scope': 'out of scope' } as const)[x.status]}</b>{x.note ? ` — ${x.note}` : ''}</li>)}</ul>}
        {ra.a.shortLabel && <p className="rv-small">Proposed short label: <b>“{ra.a.shortLabel.text}”</b> ({ra.a.shortLabel.basis === 'source' ? "the source's own short meaning" : 'editorial proposal, not the source'}). {ra.a.shortLabel.reason}</p>}
        {ra.a.draft && <p className="rv-small">New-entry draft (prefilled under “Other actions”; not playable): <b>{ra.a.draft.id}</b> {ra.a.draft.pinyin} “{ra.a.draft.meaning}” — {ra.a.draft.note}{ra.a.draft.related?.length ? ` Related entries: ${ra.a.draft.related.join(', ')}.` : ''}</p>}
        {ra.a.recording && <p className="rv-small">Recording: {ra.a.recording}</p>}
      </>}
      <p className="rv-small rv-prov">{METHOD_LABEL[ra.a.method]} by {ra.a.assessor}, {ra.a.on} · {ra.a.review === 'human-reviewed' ? 'reviewed by a person' : 'not reviewed by a person'} · uncertainty {ra.a.uncertainty}. Advice only: it links nothing, changes no text and activates nothing.</p>
    </div>}
    {sentences.length > 0 && <details className="rv-card" open>
      <summary>Examples from the source ({sentences.length})</summary>
      <p className="rv-small">Separate items. Containing a word does not mean an example teaches the sense being learnt; nothing here is linked or turned into an exercise.</p>
      <ul className="rv-examples">{sentences.map(x => <li key={x.id}>
        <span lang="zh-CN">{x.zh}</span> <small>{x.pinyin}</small> <span>{x.en}</span>
        {(data.exAssess.get(x.id) ?? []).map(({ a, fresh }) => <div key={a.id} className={`rv-small ex-${a.verdict}`}>
          → {a.target.entry ?? 'proposed new entry'}: <b>{fresh === 'current' ? VERDICT_LABEL[a.verdict] : FRESHNESS_LABEL[fresh]}</b> · sense: {a.sense}. {a.reason}
          {a.edited && fresh === 'current' && <> Proposed edit ({METHOD_LABEL[a.method]}, original kept): {a.edited.zh ? `“${a.edited.zh}” ` : ''}{a.edited.pinyin ? `${a.edited.pinyin} ` : ''}{a.edited.en ? `“${a.edited.en}”` : ''}.</>}
          {a.prerequisites.length > 0 && <> Needs first: {a.prerequisites.join(', ')}.</>}
        </div>)}
        {!data.exAssess.has(x.id) && <div className="rv-small">Not assessed.</div>}
      </li>)}</ul>
    </details>}
    <OtherSources record={r} current={data.source} />
  </>
}

/** Source vs game side by side, then evidence, meaning assessment and wording assessment as three separate rows. */
function ComparisonCard({ record: r, word: w, c, s }: { record: SourceRecord; word: Word; c: Comparison; s?: Suggestion }) {
  const ex = EXPLANATIONS[w.id]
  const examples = ex?.sections.flatMap(x => (x.type === 'examples' ? x.items : [])).slice(0, 3) ?? []
  const texts = ex?.sections.flatMap(x => (x.type === 'text' ? [x.body] : x.type === 'tips' ? x.items : [])).slice(0, 2) ?? []
  const a = c.assessment
  return (
    <div className="rv-card rv-rec">
      <h2>Comparison with {w.id}</h2>
      <p className="rv-headline">{c.headline}</p>
      <div className="rv-cmp">
        <div><small>Original Anki definition · {r.originalId}</small><b lang="zh-CN">{r.candidate.simplified.join(' / ')}</b><span>{r.candidate.readings.join(' / ')}</span><span>“{sourceDefinition(r)}”</span><span>{r.candidate.pos.join(', ') || '—'}</span></div>
        <div><small>Game · {w.id}</small><b lang="zh-CN">{w.hanzi}</b><span>{w.pinyin}{w.variants.length ? ` (also ${w.variants.join(', ')})` : ''}</span><span>Short meaning: “{w.meaning}”</span><span>{w.kind}</span></div>
      </div>
      <p className="rv-small"><b>Game teaching note:</b> {w.note}</p>
      <p className="rv-small"><b>Curriculum:</b> {COURSE.lessonOf.has(w.id) ? <>in the active course “{COURSE.title}”, {COURSE.lessonOf.get(w.id)}</> : <>not in the active course “{COURSE.title}”</>}. Nothing on this screen changes a course.</p>
      {(ex?.summary || texts.length > 0 || examples.length > 0) && <details><summary>Game explanation and examples</summary>
        {ex?.summary && <p className="rv-small">{ex.summary}</p>}
        {texts.map((t, i) => <p key={i} className="rv-small">{t}</p>)}
        {examples.length > 0 && <ul className="rv-small">{examples.map((e, i) => <li key={i}><span lang="zh-CN">{e.zh}</span> — {e.en}</li>)}</ul>}
      </details>}
      <ul className="rv-reasons">
        <li><b>Pronunciation</b> {c.pronunciation.text}</li>
        <li><b>Text</b> <span className={`tx-${c.text}`}>{c.textLabel}</span></li>
        <li><b>Meaning</b> <span className={`m-${c.meaning.state}`}>{c.meaning.label}</span>{c.meaning.scope ? ` (${SCOPE_LABEL[c.meaning.scope]})` : ''}{c.meaning.reason ? <> · {c.meaning.reason}</> : null}</li>
        <li><b>Wording</b> <span className={`w-${c.wording.state}`}>{c.wording.label}</span>{c.wording.proposed ? <> Proposed: <b>“{c.wording.proposed}”</b>{c.wording.terminology ? ' (terminology change)' : ''}.</> : null}{c.wording.reason ? <> · {c.wording.reason}</> : null}</li>
      </ul>
      {a ? <p className="rv-small rv-prov">Assessment: {METHOD_LABEL[a.method]} by {a.assessor}, {a.on} · {a.review === 'human-reviewed' ? 'reviewed by a person' : 'not reviewed by a person'} · uncertainty {a.uncertainty} · current (made against this record version and this game text){a.references?.length ? <> · references: {a.references.map(x => `${x.name}${x.ref ? ` (${x.ref})` : ''}`).join('; ')}</> : null}</p>
        : <p className="rv-small rv-prov">No current assessment for this pair. {c.wording.state === 'not-assessed' ? WORDING_NOT_ASSESSED : ''}</p>}
      {a?.recording && <p className="rv-small">Assessor's remark on the recording (not a verification of what it says): {a.recording}</p>}
      {c.outdated && <div className="rv-warn"><p><b>{FRESHNESS_LABEL[c.outdated.freshness]}</b> Shown for reference only, not as current advice: {c.outdated.assessment.meaning.verdict}{c.outdated.assessment.wording ? ` / ${c.outdated.assessment.wording.verdict}` : ''} ({METHOD_LABEL[c.outdated.assessment.method]}, {c.outdated.assessment.on}).</p></div>}
      {c.terminology && <p className="rv-small">{c.terminology.note} “{c.terminology.from}” → “{c.terminology.to}”.</p>}
      {s && <details><summary>Matching evidence ({STRENGTH_LABEL[s.strength]})</summary>
        <p className="rv-small">Why this entry was offered for comparison. Candidate strength says how worth comparing it is, not whether either definition is correct or equivalent.</p>
        <ul className="rv-ev">{s.evidence.map((e, i) => <li key={i} className={`lv-${e.level}`}><b>{LEVEL_ICON[e.level]} {e.aspect}</b> {e.detail}</li>)}</ul>
        {s.warnings.map((x, i) => <p key={i} className="rv-warn">⚠ {x}</p>)}
      </details>}
    </div>
  )
}

/** Steps 2 and 3 for the linked entry: wording and recording, each decided on its own. */
function EntryContent({ record: r, word, data, media, localOnly, working, reviewer, update, c }: {
  record: SourceRecord; word: Word; data: Loaded; media: SourceRecord['media'][number] | undefined; localOnly: boolean; working: WorkingState; reviewer: string
  update: (fn: (w: WorkingState) => WorkingState) => void; c: Comparison
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
  const [srcText, setSrcText] = useState(r.candidate.meanings.find(m => m.length <= LIMITS.meaning) ?? r.candidate.meanings[0] ?? '')
  const [edited, setEdited] = useState(selection?.choice === 'edited' ? selection.value ?? '' : c.wording.state === 'edited' && c.wording.proposed ? c.wording.proposed : word.meaning)
  const sel = (after: FieldSelection) => update(w => putOp(w, fieldOp(REPO, word.id, 'meaning', word.meaning, after)))
  const prov = (mode: 'verbatim' | 'adapted' | 'authored') => ({ source: r.source, record: r.key, recordHash: r.hash, mode })
  const chosen = selection?.choice ?? null
  return (<>
    <div className="rv-card">
      <h2>2 · Which wording should be used?</h2>
      <p className="rv-small">The short meaning on answer buttons and word cards (≤ {LIMITS.meaning} characters). Wording assessment: <b>{c.wording.label}</b>{c.wording.reason ? <> {c.wording.reason}</> : null}</p>
      <p className="rv-small">Your decision: {selection ? <b>{selection.choice === 'game' ? `keep the game text (decided by ${selection.decision.by}, ${selection.decision.on})` : `“${selection.value}” (${selection.decision.by}, ${selection.decision.on})`}</b> : <b>none yet. The application makes no change by default; that is not a review.</b>}</p>
      <div className="rv-choices">
        <button className={chosen === 'game' ? 'on' : ''} onClick={() => sel({ entry: word.id, field: 'meaning', choice: 'game', decision: decision(reviewer) })}><small>Keep the game text (your decision)</small><b>“{word.meaning}”</b></button>
        <div className={`rv-choice ${chosen === 'source' ? 'on' : ''}`}>
          <small>Use the source text{r.candidate.meanings.length > 1 ? ' (pick one)' : ''}</small>
          {r.candidate.meanings.length > 1 ? <select value={srcText} onChange={e => setSrcText(e.target.value)}>{r.candidate.meanings.map(m => <option key={m} value={m}>{m}</option>)}</select> : <b>“{srcText}”</b>}
          {srcText.length > LIMITS.meaning && <span className="rv-warn">Too long for an answer button ({srcText.length}/{LIMITS.meaning}): use an edited text.</span>}
          <button disabled={!srcText.trim() || srcText.length > LIMITS.meaning} onClick={() => sel({ entry: word.id, field: 'meaning', choice: 'source', value: srcText.trim(), provenance: prov('verbatim'), decision: decision(reviewer) })}>Use this</button>
        </div>
        <div className={`rv-choice ${chosen === 'edited' ? 'on' : ''}`}>
          <small>Use an edited text (your own wording){c.wording.state === 'edited' ? ' · prefilled with the assessment\'s proposal' : ''}</small>
          <input value={edited} onChange={e => setEdited(e.target.value)} aria-label="Edited meaning" />
          {c.terminology && edited !== c.terminology.to && <button className="rv-link" onClick={() => setEdited(c.terminology!.to)}>Try the terminology suggestion “{c.terminology.to}”</button>}
          {edited.length > LIMITS.meaning && <span className="rv-warn">{edited.length}/{LIMITS.meaning} characters: shorten it.</span>}
          <button disabled={!edited.trim() || edited.length > LIMITS.meaning || edited.trim() === word.meaning} onClick={() => sel({ entry: word.id, field: 'meaning', choice: 'edited', value: edited.trim(), provenance: prov('authored'), decision: decision(reviewer) })}>Use this</button>
        </div>
      </div>
      {selection && <p><em className={selWorking ? 'st-working' : 'rv-pill'}>{selWorking ? 'in this browser' : 'applied'}</em></p>}
      <p className="rv-small">The game's note and explanation stay as they are: “{word.note}”</p>
    </div>

    <div className="rv-card">
      <h2>3 · Which additional content (audio) should be selected?</h2>
      <p className="rv-small">{c.pronunciation.text}</p>
      {c.assessment?.recording && <p className="rv-small">Assessor's remark (metadata only, not proof of what the clip says): {c.assessment.recording}</p>}
      <p>Selected now: {current ? <>{current.provenance.record} {current.file && <Audio path={current.file} />} {recWorking ? <em className="st-working">changed in this browser</em> : <em className="rv-pill">applied</em>}</> : 'none'} · TTS for this entry: {word.audio === 'none' ? 'off (unreliable)' : audioReliable(word, WORDS) ? 'on' : 'off (shared characters)'}</p>
      {!proposal ? <p className="rv-small">This record has no usable recording.</p> : <>
        {media?.path && <Audio path={media.path} localOnly={localOnly} />}
        <p>The clip is declared as <b>{declared ?? '?'}</b>; the game teaches <b>{word.pinyin}</b>{word.speech.length ? ` (connected speech: ${word.speech.map(x => x.pinyin).join(', ')})` : ''}.</p>
        <label>What do you hear? <input value={heard} placeholder={`e.g. ${word.pinyin}${word.speech[0] ? ` or ${word.speech[0].pinyin}` : ''}`} onChange={e => setHeard(e.target.value)} /></label>
        <p className="rv-small">Leave empty if you did not listen carefully. Reading used for the checks: {heard.trim() || declared || '?'} → {({ main: 'the dictionary reading', variant: 'an accepted variant', speech: 'a connected-speech form', 'tone-differs': 'other tones than the game', different: 'a different reading', unknown: 'unknown' } as const)[rel]}.</p>
        <fieldset className="rv-uses"><legend>Allowed uses</legend>{(Object.keys(USE_LABEL) as RecordingUse[]).map(u => (
          <label key={u}><input type="checkbox" checked={uses.includes(u)} onChange={e => setUses(x => (e.target.checked ? [...x, u] : x.filter(y => y !== u)))} /> {USE_LABEL[u]} {uses.includes(u) && !eligible.has(u) && <em className="cf-conflict">not possible with this reading</em>}</label>))}
        </fieldset>
        <div className="rv-actions">
          <button disabled={uses.length === 0 || localOnly} title={localOnly ? 'This source\'s audio is not published (unclear reuse terms); it cannot be selected for the game.' : undefined} onClick={() => update(w => putOp(w, recordingOp(REPO, r, word.id, proposal)))}>Use this recording for {word.hanzi}</button>
          {localOnly && <p className="rv-small">Not selectable: this source's audio is local-only (not published; reuse terms and origin unknown).</p>}
          {current && <button onClick={() => update(w => putOp(w, recordingOp(REPO, r, word.id, null)))}>Remove the selected recording</button>}
          {recWorking && <button onClick={() => update(w => dropOp(w, `recording:${word.id}`))}>Keep what the game has</button>}
        </div>
      </>}
    </div>
  </>)
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
