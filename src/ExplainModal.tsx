import { useEffect, useRef } from 'react'
import { WORDS } from './data'
import { SOURCES, getExplanation, hasExplanation, type Example, type Part, type Section } from './content'
import { audioReliable, entryLabel, homographsOf } from './content/entries'
import { reviewLabel, sourceLine } from './content/provenance'

type Props = { id: string; hidden?: string; onClose: () => void; onOpen: (id: string) => void; onSpeak: (text: string) => void }

const PartCard = ({ p }: { p: Part }) => (
  <div className="ex-part">
    <span className="ex-part-char">{p.char}</span>
    {p.pinyin && <span className="ex-part-pinyin">{p.pinyin}</span>}
    <b>{p.meaning}</b>
    {p.note && <small>{p.note}</small>}
  </div>
)

/** One example sentence: Chinese, pinyin, English, an optional usage note, a speaker button, and where it comes from. */
function ExampleItem({ e, onSpeak }: { e: Example; onSpeak: (text: string) => void }) {
  return (
    <li>
      <span className="ex-zh" lang="zh">{e.zh}</span>
      <span className="ex-py">{e.pinyin}</span>
      <span className="ex-en">{e.en}</span>
      {e.note && <span className="ex-note">{e.note}</span>}
      <span className="ex-meta">{reviewLabel(e.review)}{e.source?.length ? ` · Source: ${e.source.map(r => sourceLine(r, SOURCES)).join('; ')}` : ''}</span>
      {e.audio !== false && <button className="ex-speak" onClick={() => onSpeak(e.zh)} aria-label={`Hear the sentence: ${e.en}`}>🔊</button>}
    </li>
  )
}

function renderSection(s: Section, i: number, onSpeak: (text: string) => void) {
  const head = s.heading ? <h3>{s.heading}</h3> : null
  switch (s.type) {
    case 'text': return <section key={i}>{head}<p>{s.body}</p></section>
    case 'tips': return <section key={i}>{head}<ul className="ex-tips">{s.items.map((t, k) => <li key={k}>{t}</li>)}</ul></section>
    case 'breakdown': return (
      <section key={i}>{head}{s.intro && <p>{s.intro}</p>}
        <div className="ex-parts breakdown">{s.parts.map((p, k) => <div className="ex-part-wrap" key={k}>{k > 0 && <span className="ex-plus" aria-hidden>+</span>}<PartCard p={p} /></div>)}</div>
      </section>)
    case 'compare': return (
      <section key={i}>{head}{s.intro && <p>{s.intro}</p>}
        <div className="ex-parts compare">{s.items.map((p, k) => <PartCard p={p} key={k} />)}</div>
      </section>)
    case 'examples': return (
      <section key={i}>{head}
        <ul className="ex-examples">{s.items.map((e, k) => <ExampleItem key={k} e={e} onSpeak={onSpeak} />)}</ul>
        <p className="hint-text">🔊 reads the sentence with your device's text-to-speech voice, which can occasionally choose a wrong reading.</p>
      </section>)
  }
}

/** Popup with everything known about an entry: the explanation (if any), pronunciation notes, examples, and where the content comes from. */
export default function ExplainModal({ id, hidden, onClose, onOpen, onSpeak }: Props) {
  const word = WORDS.find(w => w.id === id)
  const ex = getExplanation(id)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [id])

  if (!word) return null
  const siblings = homographsOf(word, WORDS)
  const hasPron = word.neutral.length > 0 || word.variants.length > 0 || word.speech.length > 0 || siblings.length > 0
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ex-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`ex-hanzi ex-len${[...word.hanzi].length}`} lang="zh">{word.hanzi}</span>
          <div className="ex-titles"><h2 id="ex-title">{ex?.title ?? `About ${word.hanzi}`}</h2><small>{word.pinyin} · {word.meaning}</small></div>
          {audioReliable(word, WORDS) && <button className="icon-btn" onClick={() => onSpeak(word.hanzi)} aria-label="Hear pronunciation">🔊</button>}
          <button className="icon-btn" ref={closeRef} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body" ref={bodyRef}>
          <p className="ex-summary">{ex?.summary ?? word.note}</p>
          {hasPron && (
            <section><h3>Pronunciation</h3>
              <p><b>Dictionary pinyin:</b> {word.pinyin}{word.neutral.length > 0 && <> · {word.neutral.length === [...word.hanzi].length ? 'neutral tone (no tone mark)' : `syllable ${word.neutral.join(', ')} is neutral tone: light and short, no tone mark`}</>}</p>
              {word.variants.length > 0 && <p><b>Also said:</b> {word.variants.join(', ')}. These are accepted pronunciations of the same word with the same meaning.</p>}
              {siblings.map(sb => <p key={sb.id}><b>Another reading of {sb.hanzi}:</b> {sb.pinyin} means “{sb.meaning}”. <button className="link-btn" onClick={() => onOpen(sb.id)}>Open</button></p>)}
              {word.speech.length > 0 && <>
                <p><b>In connected speech</b> the sound can change. This is guidance only; the dictionary tone above is the word's own tone.</p>
                <ul className="ex-tips">{word.speech.map((sp, k) => <li key={k}><b>{sp.pinyin}</b> {sp.context}.{sp.note ? ` ${sp.note}` : ''}</li>)}</ul>
              </>}
            </section>)}
          {ex?.sections.map((s, i) => renderSection(s, i, onSpeak))}
          {ex?.related && ex.related.length > 0 && (
            <section><h3>Related</h3>
              <div className="ex-related">{ex.related.map(h => {
                const w = WORDS.find(x => x.id === h)
                if (!w) return null
                const linked = h !== id && h !== hidden
                return <button key={h} className="ex-chip" disabled={!linked} onClick={() => onOpen(h)} aria-label={`${w.hanzi} ${w.pinyin} ${w.meaning}${hasExplanation(h) ? ', open explanation' : ''}`}><span>{w.hanzi}</span><small>{w.pinyin}</small></button>
              })}</div>
            </section>)}
          <section className="ex-provenance"><h3>About this entry</h3>
            <p><b>{entryLabel(word)}</b> · {reviewLabel(word.review)}</p>
            {(word.source?.length || ex?.source?.length) ? <ul className="ex-tips">{[...(word.source ?? []), ...(ex?.source ?? [])].filter((r, i, a) => a.findIndex(x => x.name === r.name && x.ref === r.ref) === i).map((r, k) => <li key={k}>{sourceLine(r, SOURCES)}. {SOURCES[r.name]?.license ? `License: ${SOURCES[r.name].license}.` : ''} {SOURCES[r.name]?.attribution ?? ''}</li>)}</ul> : <p className="hint-text">No source is recorded for this entry.</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
