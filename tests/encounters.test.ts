import test from 'node:test'
import assert from 'node:assert/strict'
import { offer, complete, REQUIRED, cleanEncounter, stageFor, previewEncounter } from '../src/game/encounters.ts'
import { sanitizeSave } from '../src/game/save.ts'
import { newRun, bankRun } from '../src/game/rules.ts'
import { NO_BONUSES } from '../src/game/upgrades.ts'
import { ENEMIES, GEAR, WORDS } from '../src/data.ts'
const ready=()=>{const s=sanitizeSave(null);s.run={...newRun(NO_BONUSES,GEAR,ENEMIES),phase:'victory' as const,kill:3,enemyHp:0};s.mastery=Object.fromEntries(REQUIRED.map(id=>[id,{lv:2,ok:0}]));return s}
test('all scene dependencies exist; offer requires actual introduction and a non-final boss win',()=>{
 assert.ok(REQUIRED.every(id=>WORDS.some(w=>w.id===id)))
 let s=ready();delete s.mastery['水'];assert.equal(offer(s),s)
 s=ready();s.run!.floor=5;assert.equal(offer(s),s)
 s=ready();s.run!.phase='fighting';assert.equal(offer(s),s)
 s=ready();assert.ok(offer(s).run!.encounter)
})
test('wrong selection and repeated completion cannot change health or award gold',()=>{
 let s=offer(ready(),()=>0.5);const e=s.run!.encounter!;e.status='active';e.selected=['茶'];assert.equal(complete(s,'2026-11-01'),s)
 e.selected=e.id==='tea'?['水','茶']:['菜','米饭'];const original=s;const done=complete(s,'2026-11-01');assert.equal(done.run!.gold,s.run!.gold+3);assert.equal(done.run!.hearts,s.run!.hearts);assert.deepEqual(done.mastery,s.mastery);assert.deepEqual(done.practiced,s.practiced);assert.equal(complete(done,'2026-11-01'),done);assert.equal(original.run!.encounter!.status,'active')
 const reloaded=sanitizeSave(JSON.parse(JSON.stringify(done)));assert.equal(complete(reloaded,'2026-11-02'),reloaded);assert.equal(offer(reloaded),reloaded)
 assert.equal(bankRun(reloaded.meta,reloaded.run!,'returned').meta.gold,reloaded.run!.gold)
})
test('old save defaults and pending save resume preserve stage and selected options',()=>{
 const old=ready();assert.deepEqual(sanitizeSave(old).encounterHistory,{})
 const s=offer(old,()=>0.2);s.run!.encounter!.status='active';s.run!.encounter!.selected=['水'];s.run!.encounter!.help=true
 const loaded=sanitizeSave(JSON.parse(JSON.stringify(s)));assert.deepEqual(loaded.run!.encounter,s.run!.encounter)
 assert.equal(loaded.meta.depthCleared,s.meta.depthCleared)
 assert.equal(cleanEncounter({id:'removed'})!.status,'closed')
})
test('stages require distinct completion days and current mastery',()=>{
 const m=ready().mastery;assert.equal(stageFor(m,[]),0);assert.equal(stageFor(m,['2026-11-01','2026-11-01']),1);assert.equal(stageFor(m,['2026-11-01','2026-11-02']),2);m['水'].lv=0;assert.equal(stageFor(m,['2026-11-01','2026-11-02']),0)
})
test('preview link builds a playable scene only for known ids and clamps the stage',()=>{
 assert.equal(previewEncounter('nope','1'),null);assert.equal(previewEncounter(null,null),null)
 const p=previewEncounter('meal','2')!;assert.equal(p.status,'active');assert.equal(p.stage,2);assert.equal(previewEncounter('tea','9')!.stage,0)
})
