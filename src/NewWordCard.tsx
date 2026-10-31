import { useEffect, useRef } from 'react'
import { WORDS } from './data'
import { getExplanation, hasExplanation } from './content'
import { audioReliable } from './content/entries'
import { lenClass } from './entryUi'

type Props = {
  id: string
  index: number                        // 1-based position among the cards shown at this fight start
  total: number
  muted: boolean
  onSpeak: (text: string) => void
  onMore: (id: string) => void          // open the full details popup
  onGotIt: () => void
}

/**
 * The introduction card for a word that has just unlocked: everything needed to read and learn it, no question, no pressure.
 * The word only starts appearing in questions after "Got it". Shown between enemies, never in the middle of a fight.
 */
export default function NewWordCard({ id, index, total, muted, onSpeak, onMore, onGotIt }: Props) {
  const word = WORDS.find(w => w.id === id)
  const ex = getExplanation(id)
  const go = useRef<HTMLButtonElement | null>(null)
  const canSpeak = word ? audioReliable(word, WORDS) : false
  useEffect(() => { go.current?.focus() }, [id])
  // say the word once when the card opens (the browser only allows this after a tap; every card follows one)
  useEffect(() => { if (word && canSpeak && !muted) onSpeak(word.hanzi) /* eslint-disable-next-line */ }, [id])
  if (!word) return null
  const breakdown = ex?.sections.find(s => s.type === 'breakdown')
  const examples = ex?.sections.flatMap(s => (s.type === 'examples' ? s.items : [])).slice(0, 2) ?? []
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal newword-card" role="dialog" aria-modal="true" aria-labelledby="nw-title">
        <div className="modal-head">
          <div className="ex-titles"><h2 id="nw-title">New word{total > 1 ? ` · ${index} of ${total}` : ''}</h2><small>{word.kind === 'particle' ? 'Grammar word' : word.kind === 'character' ? 'Character' : 'Word'}</small></div>
        </div>
        <div className="modal-body">
          <div className="nw-hero">
            <div className={`nw-hanzi len${lenClass(word.hanzi)}`} lang="zh">{word.hanzi}</div>
            <div className="nw-pinyin">{word.pinyin}{canSpeak && <button className="nw-speak" onClick={() => onSpeak(word.hanzi)} aria-label="Hear the word">🔊</button>}</div>
            <div className="nw-meaning">{word.meaning}</div>
            {word.variants.length > 0 && <div className="nw-also">also said {word.variants.join(', ')}</div>}
          </div>
          <p className="nw-note">{ex?.summary ?? word.note}</p>
          {breakdown?.type === 'breakdown' && <div className="nw-parts">{breakdown.parts.map((p, k) => <span key={k} className="nw-part"><b lang="zh">{p.char}</b> {p.meaning}</span>)}</div>}
          {examples.length > 0 && <ul className="nw-examples">{examples.map((e, k) => <li key={k}><span className="ex-zh" lang="zh">{e.zh}</span><span className="ex-py">{e.pinyin}</span><span className="ex-en">{e.en}</span></li>)}</ul>}
          {hasExplanation(id) && <button className="link-btn nw-more" onClick={() => onMore(id)}>More about {word.hanzi}</button>}
        </div>
        <div className="nw-foot"><button ref={go} className="bar-btn main" onClick={onGotIt}>Got it <span aria-hidden="true">→</span></button></div>
      </div>
    </div>
  )
}
