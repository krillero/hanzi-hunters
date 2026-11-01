import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Trial, TrialState } from './game/trials'

/** Per-boss framing. The texts never hint at the answer; they say what is at stake. */
const FRAME = {
  golem: {
    title: 'The Golem’s Tone Trial', icon: '🗿',
    situation: 'The Golem carves words into its cracked shield and waits. Read them with the right tones.',
    stakes: 'Right: the shield shatters and the Golem staggers. Wrong: like any wrong answer, it can cost a heart. You can also leave it.',
    good: '💥 The shield shatters! The Golem staggers.', bad: '↻ Not quite. The shield holds.',
  },
  wraith: {
    title: 'The Wraith’s Wail', icon: '👻',
    situation: 'The Wraith stops its echo and speaks to you. Answer it, and it may calm down.',
    stakes: 'Right: the Wraith calms, and your next mistake this expedition costs no heart. Wrong: like any wrong answer, it can cost a heart. You can also leave it.',
    good: '👻 The Wraith calms down. Your next mistake this expedition costs no heart.', bad: '↻ Not quite. The Wraith keeps wailing.',
  },
} as const

/** A boss trial: one choice inside the boss fight. Answering is final; skipping is free. */
export default function TrialScreen({ trial, state, onAnswer, onSkip, onClose }: { trial: Trial; state: TrialState; onAnswer: (option: string) => void; onSkip: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.focus() }, [])
  const frame = FRAME[trial.boss]
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
  /** A reply option shows its Chinese and pinyin before the answer (the meaning is what is tested) and its English after. */
  const label = (key: string) => {
    if (trial.boss === 'golem') return <>{key}</>
    const o = trial.options.find(x => x.zh === key)!
    return <span className="trial-reply"><b lang="zh">{o.zh}</b><small>{o.py}</small>{answered && <small>{o.en}</small>}</span>
  }
  return <div className="modal-backdrop encounter-backdrop"><div ref={box} tabIndex={-1} className="modal encounter trial" role="dialog" aria-modal="true" aria-labelledby="trial-title" onKeyDown={onKey}>
    <div className="modal-head"><h2 id="trial-title">{frame.title}</h2></div>
    <div className="enc-body">
      <div className="enc-person" aria-hidden="true">{frame.icon}</div>
      <p className="enc-situation">{frame.situation}</p>
      <div className="enc-request trial-carving"><p lang="zh">{trial.zh}</p>{trial.boss === 'wraith' && <p>{trial.py}</p>}{answered && <p>{trial.en}</p>}</div>
      {!answered && <p className="trial-stakes">{frame.stakes}</p>}
      <div className="trial-options">{state.order.map(o => {
        const mark = !answered ? '' : o === trial.answer ? 'answer-correct' : o === state.chosen ? 'trial-wrong' : ''
        return <button key={o} className={`answer-btn ${mark}`} lang={trial.boss === 'golem' ? 'zh-Latn' : undefined} disabled={answered} onClick={() => onAnswer(o)}>{label(o)}{answered && o === trial.answer ? ' ✓' : answered && o === state.chosen ? ' ✗' : ''}</button>
      })}</div>
      {answered && <div role="status" className={`trial-result ${correct ? 'good' : 'bad'}`}>
        <strong>{correct ? frame.good : frame.bad}</strong>
        <p>{trial.note}</p>
      </div>}
    </div>
    <div className="enc-footer">
      {answered ? <button className="bar-btn main" onClick={onClose}>Continue the fight</button> : <button className="bar-btn ghost" onClick={onSkip}>Not now</button>}
    </div>
  </div></div>
}
