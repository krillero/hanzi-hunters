import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ENCOUNTER_GOLD, KIND_TEXT, choose, isCorrect, isSingle, optionPinyin, sceneById, type EncounterState } from './game/encounters'
import { pinyinFor, showPinyin, type LevelOf } from './game/support'

/**
 * `level`: the player's word levels, which decide the help shown (game/support.ts). `preview`: opened from /?encounter=… —
 * nothing is saved, so the texts must not promise gold or a next floor.
 */
export default function EncounterScreen({ state, level, onChange, onComplete, onLeave, preview = false }: { state: EncounterState; level: LevelOf; onChange: (e: EncounterState) => void; onComplete: () => void; onLeave: () => void; preview?: boolean }) {
  const scene = sceneById(state.id)
  const box = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => { const old = document.activeElement as HTMLElement | null; box.current?.focus(); return () => old?.focus() }, [])
  if (!scene) return null
  const text = KIND_TEXT[scene.kind]
  // Per word: pinyin while the word is at most Familiar, English only with help (or after answering). Word options never show a
  // picture (it would give the answer away); a picture option keeps its picture, which is the choice itself.
  const help = state.help
  const linePinyin = help || (!!scene.zh && pinyinFor(scene.zh, scene.requires, level))
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    // Encounters cannot be skipped: Escape only continues once the scene is complete (or closes a preview).
    if (e.key === 'Escape') { e.preventDefault(); if (preview || state.status === 'complete') onLeave() }
    if (e.key === 'Tab') {
      const buttons = Array.from(box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }
  const submit = () => {
    if (isCorrect(scene, state.selected)) onComplete()
    else setError(`Not quite. ${scene.note} Change your ${isSingle(scene.kind) ? 'choice' : 'selection'} and try again.`)
  }
  return <div className="modal-backdrop encounter-backdrop"><div ref={box} tabIndex={-1} className="modal encounter" role="dialog" aria-modal="true" aria-labelledby="enc-title" onKeyDown={onKey}>
    <div className="modal-head"><h2 id="enc-title">{text.title}</h2></div>
    <div className="enc-body">
      <div className="enc-person" aria-hidden="true">{scene.speaker} {state.status === 'complete' ? scene.resultIcon : '🏕️'}</div>
      {state.status === 'complete' ? <div role="status">
        {/* After answering: the line in full, with its translation and the grammar note. */}
        {scene.zh && <div className="enc-request"><p lang="zh">{scene.zh}</p><p>{scene.py}</p><p>{scene.en}</p></div>}
        {scene.grammar && <p>{scene.grammar}</p>}
        {scene.closing && <><h3 lang="zh">{scene.closing.zh}</h3><p>{scene.closing.py} — {scene.closing.en}</p></>}
        <p>{scene.result}</p>
        <strong>{preview ? 'Preview · nothing saved' : `+${ENCOUNTER_GOLD} expedition gold · saved`}</strong>
      </div> : <>
        {scene.situation && <p className="enc-situation">{scene.situation}</p>}
        {scene.zh && <div className="enc-request"><p lang="zh">{scene.zh}</p>{linePinyin && <p>{scene.py}</p>}{help && <p>{scene.en}</p>}</div>}
        <button className="bar-btn ghost" onClick={() => onChange({ ...state, help: !state.help })}>{state.help ? 'Hide extra help' : 'Pinyin & translation'}</button>
        <p>{text.instruction}</p>
        <div className="enc-items">{state.order.map(id => {
          const item = scene.options.find(x => x.id === id)
          if (!item) return null
          return <button key={id} aria-pressed={state.selected.includes(id)} onClick={() => { setError(''); onChange(choose(state, scene, id)) }}>
            {item.picture
              ? <><span className="enc-picture" role="img" aria-label={help ? item.en : `Picture ${state.order.indexOf(id) + 1}`}>{item.icon}</span>{help && <small>{item.en}</small>}</>
              : <><b lang="zh">{id}</b>{(help || showPinyin(level(id))) && <small>{optionPinyin(id)}</small>}{help && <small>{item.en}</small>}</>}
          </button>
        })}</div>
        {/* A gather note is a recipe hint; reply/point notes name the answer, so they only appear after a wrong choice. */}
        {scene.kind === 'gather' && help && <p>{scene.note}</p>}
        <p role="status">{error}</p>
        <button className="bar-btn main" onClick={submit}>{text.action}</button>
      </>}
    </div>
    {(preview || state.status !== 'active') && <div className="enc-footer">
      {(preview || state.status === 'complete') && <button className={`bar-btn ${state.status === 'complete' ? 'main' : 'ghost'}`} onClick={onLeave}>{preview ? 'Close preview' : 'Continue to next floor'}</button>}
    </div>}
  </div></div>
}
