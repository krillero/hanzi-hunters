import type { Saved, Mastery } from './types.ts'
export const SCENES = [
 { id: 'tea', title: 'Tea for a traveler', zh: '我要茶。', py: 'Wǒ yào chá.', en: 'I would like tea.', ingredients: ['茶','水'], action: 'Prepare tea', result: 'You prepare tea with the leaves and water.', note: '茶 names tea leaves here. Water and tea leaves make the drink.' },
 { id: 'meal', title: 'A meal for a traveler', zh: '我要米饭。我要菜。', py: 'Wǒ yào mǐfàn. Wǒ yào cài.', en: 'I would like rice. I would like some dishes.', ingredients: ['米饭','菜'], action: 'Serve meal', result: 'You serve the cooked rice and vegetable side dish.', note: '米饭 is cooked rice. 菜 here means prepared dishes; our tray contains vegetables.' }
] as const
export const ITEMS = [
 { id:'茶', py:'chá', en:'tea leaves', icon:'🍃' }, { id:'水', py:'shuǐ', en:'water', icon:'💧' },
 { id:'米饭', py:'mǐfàn', en:'cooked rice', icon:'🍚' }, { id:'菜', py:'cài', en:'vegetable dish', icon:'🥬' }
]
export const REQUIRED = ['我','要','谢谢', ...ITEMS.map(x=>x.id)]
export type History = Record<string, { dates: string[] }>
export type EncounterState = { id: string; stage: number; status: 'offer'|'active'|'complete'|'closed'; selected: string[]; order: string[]; help: boolean }
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
export function eligible(m: Mastery) { return REQUIRED.every(id=>Object.prototype.hasOwnProperty.call(m,id)) }
export function stageFor(m: Mastery, dates: string[]) {
 if (!dates.length || REQUIRED.some(id=>(m[id]?.lv??0)<1)) return 0
 return new Set(dates).size>=2 && REQUIRED.every(id=>m[id]?.lv>=2) ? 2 : 1
}
export function offer(s: Saved, random = Math.random): Saved {
 const r=s.run
 if (!r || r.encounter || r.phase!=='victory' || r.kill!==3 || r.floor>=5 || !eligible(s.mastery)) return s
 const scene=[...SCENES].sort((a,b)=>(s.encounterHistory?.[a.id]?.dates.length??0)-(s.encounterHistory?.[b.id]?.dates.length??0)||a.id.localeCompare(b.id))[0]
 const order=ITEMS.map(x=>x.id)
 for(let i=order.length-1;i>0;i--){const j=Math.max(0,Math.min(i,Math.floor(random()*(i+1))));[order[i],order[j]]=[order[j],order[i]]}
 return {...s,run:{...r,encounter:{id:scene.id,stage:stageFor(s.mastery,s.encounterHistory?.[scene.id]?.dates??[]),status:'offer',selected:[],order,help:false}}}
}
export function complete(s: Saved, date: string): Saved {
 const e=s.run?.encounter, scene=SCENES.find(x=>x.id===e?.id)
 if(!s.run || !e || !scene || e.status!=='active' || e.selected.length!==scene.ingredients.length || !scene.ingredients.every(x=>e.selected.includes(x))) return s
 const dates=[...new Set([...(s.encounterHistory?.[e.id]?.dates??[]),date])].sort().slice(-30)
 return {...s,encounterHistory:{...s.encounterHistory,[e.id]:{dates}},run:{...s.run,gold:s.run.gold+3,encounter:{...e,status:'complete'}}}
}
export function cleanHistory(raw: unknown): History {
 const out: History={}; if(!raw || typeof raw!=='object')return out
 for(const scene of SCENES){const v=(raw as Record<string,{dates?:unknown}>)[scene.id];if(Array.isArray(v?.dates))out[scene.id]={dates:[...new Set(v.dates.filter((x):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(-30)}}return out
}
export function cleanEncounter(raw: unknown): EncounterState|undefined {
 if(!raw || typeof raw!=='object')return undefined
 const e=raw as EncounterState, ids=ITEMS.map(x=>x.id)
 if(!SCENES.some(x=>x.id===e.id))return {id:'tea',stage:0,status:'closed',selected:[],order:ids,help:false}
 const selected=Array.isArray(e.selected)?[...new Set(e.selected.filter(x=>ids.includes(x)))]:[]
 const order=Array.isArray(e.order)&&e.order.length===ids.length&&new Set(e.order).size===ids.length&&e.order.every(x=>ids.includes(x))?e.order:ids
 return {id:e.id,stage:[0,1,2].includes(e.stage)?e.stage:0,status:['offer','active','complete','closed'].includes(e.status)?e.status:'closed',selected,order,help:e.help===true}
}
