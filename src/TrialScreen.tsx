import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Trial, TrialState } from './game/trials'

/** The Golem's Tone Trial: one tone-marked pinyin choice inside the boss fight. Answering is final; skipping is free. */
export default function TrialScreen({ trial, state, onAnswer, onSkip, onClose }: { trial: Trial; state: TrialState; onAnswer: (option: string) => void; onSkip: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.focus() }, [])
  const answered = state.status === 'answered', correct = answered && state.chosen === trial.answer
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); if (answered) onClose(); else onSkip() }
    if (e.key === 'Tab') {
      const buttons = Array.from(box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }
  return <div className="modal-backdrop encounter-backdrop"><div ref={box} tabIndex={-1} className="modal encounter trial" role="dialog" aria-modal="true" aria-labelledby="trial-title" onKeyDown={onKey}>
    <div className="modal-head"><h2 id="trial-title">The Golem’s Tone Trial</h2></div>
    <div className="enc-body">
      <div className="enc-person" aria-hidden="true">🗿</div>
      <p className="enc-situation">The Golem carves words into its cracked shield and waits. Read them with the right tones.</p>
      <div className="enc-request trial-carving"><p lang="zh">{trial.zh}</p>{answered && <p>{trial.en}</p>}</div>
      {!answered && <p className="trial-stakes">Right: the shield shatters and the Golem staggers. Wrong: like any wrong answer, it can cost a heart. You can also leave it.</p>}
      <div className="trial-options">{state.order.map(o => {
        const mark = !answered ? '' : o === trial.answer ? 'answer-correct' : o === state.chosen ? 'trial-wrong' : ''
        return <button key={o} className={`answer-btn ${mark}`} lang="zh-Latn" disabled={answered} onClick={() => onAnswer(o)}>{o}{answered && o === trial.answer ? ' ✓' : answered && o === state.chosen ? ' ✗' : ''}</button>
      })}</div>
      {answered && <div role="status" className={`trial-result ${correct ? 'good' : 'bad'}`}>
        <strong>{correct ? '💥 The shield shatters! The Golem staggers.' : '↻ Not quite. The shield holds.'}</strong>
        <p>{trial.note}</p>
      </div>}
    </div>
    <div className="enc-footer">
      {answered ? <button className="bar-btn main" onClick={onClose}>Continue the fight</button> : <button className="bar-btn ghost" onClick={onSkip}>Not now</button>}
    </div>
  </div></div>
}
