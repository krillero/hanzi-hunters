import { useEffect, useRef, type KeyboardEvent } from 'react'
import { BLANK, filledNote, type Trial, type TrialState } from './game/trials'

/** Per-boss framing. The texts never hint at the answer; they say what is at stake. */
const FRAME = {
  golem: {
    title: 'The Golem’s Tone Trial', icon: '🗿',
    situation: 'The Golem carves words into its cracked shield and waits. Read them with the right tones.',
    stakes: 'Right: the shield shatters and the Golem staggers. Wrong: like any wrong answer, it can cost a heart.',
    good: '💥 The shield shatters! The Golem staggers.', bad: '↻ Not quite. The shield holds.',
  },
  wraith: {
    title: 'The Wraith’s Wail', icon: '👻',
    situation: 'The Wraith stops its echo and speaks to you. Answer it, and it may calm down.',
    stakes: 'Right: the Wraith calms, and your next mistake this expedition costs no heart. Wrong: like any wrong answer, it can cost a heart.',
    good: '👻 The Wraith calms down. Your next mistake this expedition costs no heart.', bad: '↻ Not quite. The Wraith keeps wailing.',
  },
  scribe: {
    title: 'The Scribe’s Torn Note', icon: '📜',
    situation: 'The Ink Scribe holds up a torn note. One character is missing. Which one completes it?',
    stakes: 'Right: every remaining ink seal breaks. Wrong: like any wrong answer, it can cost a heart.',
    good: '🖋️ The ink seals break!', bad: '↻ Not quite. The seals hold.',
  },
  trickster: {
    title: 'The Trickster’s Mirrors', icon: '🪞',
    situation: 'Three mirror images of the Trickster point at the scene. Only one of them tells the truth. Which one?',
    stakes: 'Right: you find the real Trickster, land a heavy blow, and your next mistake this expedition costs no heart. Wrong: like any wrong answer, it can cost a heart.',
    good: '🪞 You found the true reflection! A heavy blow lands, and your next mistake costs no heart.', bad: '↻ Not quite. That reflection was lying.',
  },
} as const
/** The Cavern Warden's Gauntlet reuses tone and note trials with its own framing: [tone step, note step]. */
const WARDEN = [
  {
    title: 'The Warden’s Gauntlet', icon: '🛡️',
    situation: 'The Cavern Warden carves words into its last tone ward. Read them with the right tones.',
    stakes: 'Right: its last tone ward breaks. Wrong: like any wrong answer, it can cost a heart. Either way, its ink seals come next.',
    good: '💥 The last tone ward breaks!', bad: '↻ Not quite. The ward holds.',
  },
  {
    title: 'The Warden’s Gauntlet', icon: '🛡️',
    situation: 'The Warden’s ink seals glow with a torn note. One character is missing. Which one completes it?',
    stakes: 'Right: every remaining seal breaks at once. Wrong: like any wrong answer, it can cost a heart.',
    good: '🖋️ Every seal breaks! The Warden stands unguarded.', bad: '↻ Not quite. The seals hold.',
  },
] as const

/** A boss trial: one choice inside the boss fight. It cannot be skipped and answering is final. `onExit`: preview links only. */
export default function TrialScreen({ trial, state, onAnswer, onClose, onExit, warden = false }: { trial: Trial; state: TrialState; onAnswer: (option: string) => void; onClose: () => void; onExit?: () => void; warden?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.focus() }, [])
  const frame = warden ? WARDEN[trial.boss === 'golem' ? 0 : 1] : FRAME[trial.boss]
  const steps = (state.step ?? 1) + (state.next ? 1 : 0)
  const answered = state.status === 'answered', correct = answered && state.chosen === trial.answer
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); if (answered) onClose(); else onExit?.() }
    if (e.key === 'Tab') {
      const buttons = Array.from(box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }
  /** A reply option shows its Chinese and pinyin before the answer (the meaning is what is tested) and its English after. */
  const label = (key: string) => {
    if (trial.boss !== 'wraith' && trial.boss !== 'trickster') return <>{key}</>
    const o = trial.options.find(x => x.zh === key)!
    return <span className="trial-reply"><b lang="zh">{o.zh}</b><small>{o.py}</small>{answered && <small>{o.en}</small>}</span>
  }
  return <div className="modal-backdrop encounter-backdrop"><div ref={box} tabIndex={-1} className={`modal encounter trial ${trial.boss === 'scribe' ? 'scribe-note' : ''}`} role="dialog" aria-modal="true" aria-labelledby="trial-title" onKeyDown={onKey}>
    <div className="modal-head"><h2 id="trial-title">{frame.title}{warden && steps > 1 ? ` · ${state.step ?? 1}/${steps}` : ''}</h2></div>
    <div className="enc-body">
      <div className="enc-person" aria-hidden="true">{frame.icon}</div>
      <p className="enc-situation">{frame.situation}</p>
      {trial.boss === 'trickster'
        ? <div className="enc-request trial-carving"><p className="trial-picture" role="img" aria-label={trial.en}>{trial.picture}</p>{answered && <p>{trial.en}</p>}</div>
        : trial.boss === 'scribe'
        ? <div className="enc-request trial-carving"><p lang="zh">{answered ? filledNote(trial) : trial.zh.split(BLANK).flatMap((part, i) => i ? [<span key={i} className="trial-blank" aria-label="missing character">？</span>, part] : [part])}</p>{answered && <p>{trial.py}</p>}<p>{trial.en}</p></div>
        : <div className="enc-request trial-carving"><p lang="zh">{trial.zh}</p>{trial.boss === 'wraith' && <p>{trial.py}</p>}{answered && <p>{trial.en}</p>}</div>}
      {!answered && <p className="trial-stakes">{frame.stakes}</p>}
      <div className="trial-options">{state.order.map(o => {
        const mark = !answered ? '' : o === trial.answer ? 'answer-correct' : o === state.chosen ? 'trial-wrong' : ''
        return <button key={o} className={`answer-btn ${mark}`} lang={trial.boss === 'golem' ? 'zh-Latn' : trial.boss === 'scribe' ? 'zh' : undefined} disabled={answered} onClick={() => onAnswer(o)}>{label(o)}{answered && o === trial.answer ? ' ✓' : answered && o === state.chosen ? ' ✗' : ''}</button>
      })}</div>
      {answered && <div role="status" className={`trial-result ${correct ? 'good' : 'bad'}`}>
        <strong>{correct ? frame.good : frame.bad}</strong>
        <p>{trial.note}</p>
      </div>}
    </div>
    <div className="enc-footer">
      {answered ? <button className="bar-btn main" onClick={onClose}>{state.next ? 'Next challenge' : 'Continue the fight'}</button> : onExit && <button className="bar-btn ghost" onClick={onExit}>Close preview</button>}
    </div>
  </div></div>
}
