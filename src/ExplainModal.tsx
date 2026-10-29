import { useEffect, useRef } from 'react'
import { WORDS } from './data'
import { getExplanation, hasExplanation, type Part, type Section } from './content'

type Props = { stack: string[]; onClose: () => void; onBack: () => void; onOpen: (hanzi: string) => void; onSpeak: (hanzi: string) => void }

const PartCard = ({ p }: { p: Part }) => (
  <div className="ex-part">
    <span className="ex-part-char">{p.char}</span>
    {p.pinyin && <span className="ex-part-pinyin">{p.pinyin}</span>}
    <b>{p.meaning}</b>
    {p.note && <small>{p.note}</small>}
  </div>
)

function renderSection(s: Section, i: number) {
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
        <ul className="ex-examples">{s.items.map((e, k) => <li key={k}><span className="ex-zh">{e.zh}</span><span className="ex-py">{e.pinyin}</span><span className="ex-en">{e.en}</span></li>)}</ul>
      </section>)
  }
}

/** Popup with the extra explanation for a word (content: src/content/explanations.json). */
export default function ExplainModal({ stack, onClose, onBack, onOpen, onSpeak }: Props) {
  const hanzi = stack[stack.length - 1]
  const ex = getExplanation(hanzi)
  const word = WORDS.find(w => w.hanzi === hanzi)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [hanzi])

  if (!ex || !word) return null
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ex-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          {stack.length > 1 && <button className="icon-btn" onClick={onBack} aria-label="Back">←</button>}
          <span className="ex-hanzi">{word.hanzi}</span>
          <div className="ex-titles"><h2 id="ex-title">{ex.title ?? `About ${word.hanzi}`}</h2><small>{word.pinyin} · {word.meaning}</small></div>
          <button className="icon-btn" onClick={() => onSpeak(word.hanzi)} aria-label="Hear pronunciation">🔊</button>
          <button className="icon-btn" ref={closeRef} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body" ref={bodyRef}>
          <p className="ex-summary">{ex.summary}</p>
          {ex.sections.map(renderSection)}
          {ex.related && ex.related.length > 0 && (
            <section><h3>Related</h3>
              <div className="ex-related">{ex.related.map(h => {
                const w = WORDS.find(x => x.hanzi === h)
                if (!w) return null
                const linked = hasExplanation(h) && !stack.includes(h)
                return <button key={h} className="ex-chip" disabled={!linked} onClick={() => onOpen(h)} aria-label={`${h} ${w.pinyin} ${w.meaning}${hasExplanation(h) ? ', open explanation' : ''}`}><span>{h}</span><small>{w.pinyin}</small></button>
              })}</div>
            </section>)}
        </div>
      </div>
    </div>
  )
}
