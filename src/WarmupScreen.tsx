import { useEffect, useMemo, useRef, useState } from 'react'
import { WORDS, type Word } from './data'
import { CLOZE } from './content'
import { audioReliable } from './content/entries'
import { fillBlank, lenClass } from './entryUi'
import { buildQuestion, type KindResult, type Question } from './game/questions'
import type { Mastery } from './game/types'
import type { SfxName } from './audio'
import { WARMUP_GOLD_PER_CORRECT } from './game/habit'

type Props = {
  words: string[]                       // entry ids to review, in order
  mastery: Mastery                      // live mastery (the parent updates it after every answer)
  canListen: boolean
  speakWord: (text: string) => void
  sfx: (name: SfxName) => void
  onAnswer: (id: string, isCorrect: boolean) => void
  onDone: (correct: number) => void
  onExit: () => void
}

const slotClass = (shown: boolean, asked: boolean) => (shown ? 'on' : asked ? 'ask' : 'dim')

/** The optional daily warm-up: a few quick review questions about words you already know. No HP, no enemies, no risk. */
export default function WarmupScreen({ words, mastery, canListen, speakWord, sfx, onAnswer, onDone, onExit }: Props) {
  const list = useMemo(() => words.map(id => WORDS.find(w => w.id === id)).filter((w): w is Word => !!w), [words])
  const [i, setI] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const history = useRef<KindResult[]>([])
  const known = useMemo(() => new Set(Object.keys(mastery)), [mastery])
  const word = list[i]
  const canSpeak = word ? audioReliable(word, WORDS) : false
  const question: Question | null = useMemo(
    () => (word ? buildQuestion(word, mastery[word.id] ?? { lv: 1, ok: 0 }, WORDS, { canListen, known, history: history.current, cloze: CLOZE }) : null),
    // Rebuilt only when the step changes; mastery changes after answering must not reshuffle the choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i, word?.id]
  )
  const finished = i >= list.length
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => { if (question?.audio && word && picked === null && audioReliable(word, WORDS)) speakWord(word.hanzi) /* eslint-disable-next-line */ }, [i])

  if (finished || !word || !question) {
    const gold = correct * WARMUP_GOLD_PER_CORRECT
    return (
      <section className="warmup" aria-label="Daily warm-up finished">
        <div className="wu-card wu-done">
          <p className="eyebrow">WARM-UP DONE</p>
          <h1>{correct} / {list.length} right</h1>
          <p className="subtitle">{correct === list.length ? 'A clean sweep.' : 'The ones you missed will come back soon.'}</p>
          <div className="wu-reward">🪙 +{gold}</div>
          <button className="primary-btn" autoFocus onClick={() => onDone(correct)}>Back to camp <span>→</span></button>
        </div>
      </section>
    )
  }

  const answered = picked !== null
  const isRight = picked === question.answer
  const show = { hanzi: question.show.hanzi || answered, pinyin: question.show.pinyin || answered, meaning: question.show.meaning || answered }
  const choose = (option: string) => {
    if (answered) return
    setPicked(option)
    const ok = option === question.answer
    history.current = [...history.current, { kind: question.kind, ok }].slice(-16)
    if (ok) setCorrect(c => c + 1)
    sfx(ok ? 'correct' : 'wrong')
    onAnswer(word.id, ok)
  }
  const next = () => { setPicked(null); setI(n => n + 1) }

  return (
    <section className="warmup" aria-label="Daily warm-up">
      <header className="wu-head">
        <div><p className="eyebrow">DAILY WARM-UP · OPTIONAL</p><strong>Question {i + 1} of {list.length}</strong></div>
        <button className="icon-btn" ref={closeRef} onClick={onExit} aria-label="Leave the warm-up">×</button>
      </header>
      <div className="wu-dots" aria-hidden="true">{list.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'cur' : ''} />)}</div>
      <h2 className="wu-question">{question.text.replace(/^New word!\s*/i, '')}</h2>
      <div className={`stage stage-card wu-stage ${answered ? (isRight ? 'ok' : 'wrong') : ''}`}>
        <button className="speak-btn wu-speak" disabled={!canSpeak} onClick={() => speakWord(word.hanzi)} aria-label={canSpeak ? 'Hear the word' : 'No reliable audio for this word'}>{canSpeak ? '🔊' : '🔈'}</button>
        {question.cloze ? <div className="cloze-block" lang="zh">
          <div className="cloze-zh">{fillBlank(question.cloze.zh, answered ? word.hanzi : null)}</div>
          <div className="cloze-py">{fillBlank(question.cloze.pinyin, answered ? word.pinyin : null)}</div>
          <div className="cloze-en">{question.cloze.en}</div>
        </div> : <>
        <div className={`slot slot-hanzi ${slotClass(show.hanzi, question.ask === 'hanzi')} len${lenClass(word.hanzi)}`}>{show.hanzi ? word.hanzi : '?'}</div>
        <div className={`slot slot-pinyin ${slotClass(show.pinyin, question.ask === 'pinyin')} len${lenClass(word.pinyin)}`}>{show.pinyin ? word.pinyin : '? ? ?'}</div>
        <div className={`slot slot-meaning ${slotClass(show.meaning, question.ask === 'meaning')}`}>{show.meaning ? word.meaning : '“ ? ”'}</div>
        </>}
      </div>
      {answered
        ? <div className={`wu-result ${isRight ? 'ok' : 'bad'}`} role="status" aria-live="polite">
            <strong>{isRight ? `✓ Correct — ${word.hanzi} ${word.pinyin}${word.variants.length ? ` (also ${word.variants.join(', ')})` : ''}${word.kind === 'particle' ? '' : ` · ${word.meaning}`}` : 'Not quite'}</strong>
            {!isRight && <p className="wu-answer">Answer: <b>{question.answer}</b> <span>(you chose <s>{picked}</s>)</span></p>}
            <p className="wu-note">{isRight ? (question.cloze?.note ?? word.note) : (picked && question.cloze?.why[picked]) || word.note}</p>
            <button className="bar-btn main wu-next" autoFocus onClick={next}>{i + 1 >= list.length ? 'Finish' : 'Next'} <span>→</span></button>
          </div>
        : <div className="answer-list wu-choices">
            {question.options.map((option, k) => (
              <button key={`${option}-${k}`} className={`answer-btn ${question.optionsAreHanzi ? 'opt-hanzi' : ''} ${question.ask === 'pinyin' ? 'opt-pinyin' : ''}`} onClick={() => choose(option)}>
                <span className="answer-key">{String.fromCharCode(65 + k)}</span><span className="answer-text">{option}</span>
              </button>
            ))}
          </div>}
      <p className="hint-text wu-foot">No HP, no enemies. Right answers still raise word mastery and earn a little gold.</p>
    </section>
  )
}
