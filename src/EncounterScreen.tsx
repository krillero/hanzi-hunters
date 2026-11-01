import { useEffect, useRef, useState } from 'react'
import { ENCOUNTER_ACTION, ENCOUNTER_TITLE, ITEMS, SCENES, type EncounterState } from './game/encounters'
/** `preview`: opened from /?encounter=… — nothing is saved, so the texts must not promise gold or a next floor. */
export default function EncounterScreen({ state, onChange, onComplete, onLeave, preview = false }: { state: EncounterState; onChange: (e: EncounterState)=>void; onComplete: ()=>void; onLeave: ()=>void; preview?: boolean }) {
 const scene=SCENES.find(x=>x.id===state.id)!
 const box=useRef<HTMLDivElement>(null)
 const [error,setError]=useState('')
 useEffect(()=>{const old=document.activeElement as HTMLElement|null;box.current?.focus();return()=>old?.focus()},[])
 // At the hardest stage the item pictures are hidden too (they alone would give the answer); asking for help brings them back.
 const py=state.stage<2||state.help, english=state.stage===0||state.help, pictures=py
 return <div className="modal-backdrop encounter-backdrop"><div ref={box} tabIndex={-1} className="modal encounter" role="dialog" aria-modal="true" aria-labelledby="enc-title" onKeyDown={e=>{
 e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onLeave()}
 if(e.key==='Tab'){const buttons=Array.from(box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===box.current)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 }}>
 <div className="modal-head"><h2 id="enc-title">{ENCOUNTER_TITLE}</h2></div>
 <div className="enc-body">
 <div className="enc-person" aria-hidden="true">🧑‍🍳 {state.status==='complete'?(state.id==='tea'?'🍵':'🍱'):'🏕️'}</div>
 {state.status==='offer'?<><p>A traveler has a request. Help prepare something using the Chinese you have met.</p><p>No hearts at risk. Complete the encounter for 3 gold. Translation is always available.</p></>:state.status==='complete'?<div role="status"><h3 lang="zh">谢谢！</h3><p>Xièxie! — Thank you!</p><p>{scene.result}</p><strong>{preview?'Preview · nothing saved':'+3 expedition gold · saved'}</strong></div>:<>
 <div className="enc-request"><p lang="zh">{scene.zh}</p>{py&&<p>{scene.py}</p>}{english&&<p>{scene.en}</p>}</div>
 {state.stage===0&&<p>我 means “I”. 要 expresses wanting something here. The traveler is telling you what they would like.</p>}
 <button className="bar-btn ghost" onClick={()=>onChange({...state,help:!state.help})}>{state.help?'Hide extra help':'Pinyin & translation'}</button>
 <p>Choose what the traveler asked for, then tap {ENCOUNTER_ACTION}. You can change your selection.</p>
 <div className="enc-items">{state.order.map(id=>{const item=ITEMS.find(x=>x.id===id)!;return <button key={id} aria-pressed={state.selected.includes(id)} onClick={()=>{setError('');onChange({...state,selected:state.selected.includes(id)?state.selected.filter(x=>x!==id):[...state.selected,id]})}}>{pictures&&<span aria-hidden="true">{item.icon}</span>}<b lang="zh">{id}</b>{py&&<small>{item.py}</small>}{english&&<small>{item.en}</small>}</button>})}</div>
 {(state.stage===0||state.help)&&<p>{scene.note}</p>}
 <p role="status">{error}</p>
 <button className="bar-btn main" onClick={()=>{if(state.selected.length===scene.ingredients.length&&scene.ingredients.every(x=>state.selected.includes(x)))onComplete();else setError('Not quite. '+scene.note+' Change your selection and try again.')}}>{ENCOUNTER_ACTION}</button>
 </>}
 </div>
 <div className="enc-footer">{state.status==='offer'&&<button className="bar-btn main" onClick={()=>onChange({...state,status:'active'})}>Help the traveler</button>}<button className="bar-btn ghost" onClick={onLeave}>{preview?'Close preview':state.status==='complete'?'Continue to next floor':state.status==='offer'?'Skip and continue':'Leave and continue'}</button></div>
 </div></div>
}
