// Contextual encounters: short optional scenes offered after a floor boss (see docs/CONTEXTUAL_ENCOUNTERS.md).
// The scenes are content in src/content/encounters.json; this file holds the rules: who may see which scene, the support
// stage, offer/completion transitions and save sanitizers. Pure functions, no React.
import type { Saved, Mastery } from './types.ts'
import encountersJson from '../content/encounters.json' with { type: 'json' }
import { WORDS } from '../data.ts'
import { freshFirst, noteRecent } from './recent.ts'

/**
 * gather: pick every item the traveler asked for (several). reply: pick the one right thing to say.
 * point: pick the picture the traveler's Chinese line describes (the options are pictures, not words).
 */
export type EncounterKind = 'gather' | 'reply' | 'point'
/** A word option's id is its word id; a picture option (`picture: true`) has a free id and no Chinese label. */
export type EncounterOption = { id: string; en: string; icon: string; picture?: boolean }
export type Line = { zh: string; py: string; en: string }
export type Scene = {
  id: string; kind: EncounterKind
  /** Word ids the player must have been introduced to: every option and every character of the Chinese lines. */
  requires: string[]
  speaker: string
  /** English context shown at every stage (what is happening). It sets the scene; it must not translate the answer. */
  situation?: string
  /** The traveler's line; pinyin/English follow the support stage. */
  zh?: string; py?: string; en?: string
  /** Extra explanation at the first stage only. */
  grammar?: string
  options: EncounterOption[]
  answer: string[]
  /** Explanation after a wrong choice (also shown at the first stage and with help). */
  note: string
  result: string; resultIcon: string
  /** What the traveler says when the scene is done. */
  closing?: Line
}

/** Shared by every scene of a kind: the title and button must not name the answer. */
export const KIND_TEXT: Record<EncounterKind, { title: string; action: string; instruction: string }> = {
  gather: { title: 'A traveler’s request', action: 'Prepare', instruction: 'Choose what the traveler asked for, then tap Prepare. You can change your selection.' },
  reply: { title: 'A traveler on the road', action: 'Say it', instruction: 'Choose what to say, then tap Say it. You can change your choice.' },
  point: { title: 'A traveler at the campfire', action: 'Point', instruction: 'Choose the picture that matches what the traveler says, then tap Point. You can change your choice.' },
}
/** Kinds with exactly one right option (tapping another option replaces the choice). */
export const isSingle = (kind: EncounterKind) => kind !== 'gather'
export const ENCOUNTER_GOLD = 3

const KINDS: EncounterKind[] = ['gather', 'reply', 'point']
const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''
const HANZI = /\p{Script=Han}/u

/** Structural problems of encounters.json (empty = fine). Used by validate:content, the tests, and to drop broken scenes. */
export function validateEncounters(raw: unknown, wordIds: string[]): string[] {
  const errors: string[] = []
  const scenes = (raw as { scenes?: unknown })?.scenes
  if (!Array.isArray(scenes)) return ['encounters.json: "scenes" must be an array']
  const seen = new Set<string>()
  scenes.forEach((s, i) => {
    const where = `encounters.json scene ${isStr(s?.id) ? s.id : `#${i + 1}`}`
    for (const e of sceneErrors(s, wordIds)) errors.push(`${where}: ${e}`)
    if (isStr(s?.id)) { if (seen.has(s.id)) errors.push(`${where}: duplicate id`); seen.add(s.id) }
  })
  return errors
}

function sceneErrors(s: Scene, wordIds: string[]): string[] {
  const out: string[] = []
  if (!s || typeof s !== 'object') return ['must be an object']
  if (!isStr(s.id) || !/^[a-z][a-z0-9-]*$/.test(s.id)) out.push('id must be lower-case letters, digits or dashes')
  if (!KINDS.includes(s.kind)) out.push(`kind must be one of ${KINDS.join(', ')}`)
  for (const f of ['speaker', 'note', 'result', 'resultIcon'] as const) if (!isStr(s[f])) out.push(`${f} is required`)
  const requires = Array.isArray(s.requires) ? s.requires : []
  if (!requires.length) out.push('requires must list the words the scene uses')
  for (const id of requires) if (!wordIds.includes(id)) out.push(`requires "${id}", which is not in words.json`)
  const options = Array.isArray(s.options) ? s.options : []
  const ids = options.map(o => o?.id)
  if (options.length < 2 || options.length > 6) out.push('needs 2-6 options')
  if (new Set(ids).size !== ids.length) out.push('option ids must be unique')
  for (const o of options) {
    if (o?.picture === true) { if (!isStr(o.id) || HANZI.test(o.id)) out.push(`picture option "${o?.id}" needs a plain id without Chinese`) }
    else if (!isStr(o?.id) || !requires.includes(o.id)) out.push(`option "${o?.id}" must be listed in requires (the player must know it)`)
    if (!isStr(o?.en) || !isStr(o?.icon)) out.push(`option "${o?.id}" needs en and icon`)
  }
  // A point scene shows pictures only; the other kinds show words (the Chinese is what is being practised).
  if (s.kind === 'point' && (options.some(o => o?.picture !== true) || !isStr(s.zh))) out.push('a point scene needs a Chinese line and picture options only')
  if (s.kind !== 'point' && options.some(o => o?.picture === true)) out.push(`picture options are only for point scenes`)
  const answer = Array.isArray(s.answer) ? s.answer : []
  if (!answer.length || answer.some(a => !ids.includes(a)) || new Set(answer).size !== answer.length) out.push('answer must be distinct option ids')
  if (isSingle(s.kind) && answer.length !== 1) out.push(`a ${s.kind} scene has exactly one answer`)
  if (answer.length >= ids.length) out.push('at least one option must be wrong')
  if (!isStr(s.zh) && !isStr(s.situation)) out.push('needs a Chinese line (zh) or a situation')
  if (isStr(s.zh) && (!isStr(s.py) || !isStr(s.en))) out.push('zh needs py and en')
  if (s.closing && (!isStr(s.closing.zh) || !isStr(s.closing.py) || !isStr(s.closing.en))) out.push('closing needs zh, py and en')
  // No untaught vocabulary: every character of the Chinese lines must belong to a required word.
  const known = new Set(requires.join(''))
  for (const text of [s.zh, s.closing?.zh]) for (const ch of text ?? '') if (HANZI.test(ch) && !known.has(ch)) out.push(`"${ch}" appears in a Chinese line but no required word contains it`)
  return out
}

export const SCENES: Scene[] = ((encountersJson as { scenes?: Scene[] }).scenes ?? []).filter(s => sceneErrors(s, WORDS.map(w => w.id)).length === 0)
export const sceneById = (id: string | undefined) => SCENES.find(s => s.id === id)
/** Pinyin of an option comes from words.json, the single source of tone marks. */
export const optionPinyin = (id: string) => WORDS.find(w => w.id === id)?.pinyin ?? ''
export const isCorrect = (scene: Scene, selected: string[]) => selected.length === scene.answer.length && scene.answer.every(a => selected.includes(a))

export type History = Record<string, { dates: string[] }>
export type EncounterState = { id: string; stage: number; status: 'active' | 'complete' | 'closed'; selected: string[]; order: string[]; help: boolean }
/** Key of a scene in Saved.recentEvents. */
export const sceneKey = (id: string) => `scene:${id}`
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const introduced = (m: Mastery, id: string) => Object.prototype.hasOwnProperty.call(m, id)
export const eligible = (m: Mastery, scene: Scene) => scene.requires.every(id => introduced(m, id))

/** 0: Chinese, pinyin, English and grammar. 1: Chinese and pinyin. 2: Chinese only. Later stages need completions on distinct days. */
export function stageFor(m: Mastery, dates: string[], requires: string[]) {
  if (!dates.length || requires.some(id => (m[id]?.lv ?? 0) < 1)) return 0
  return new Set(dates).size >= 2 && requires.every(id => m[id]?.lv >= 2) ? 2 : 1
}

/** After a non-final floor boss, once per expedition: the eligible scene completed on the fewest days (file order breaks ties). */
export function offer(s: Saved, random = Math.random): Saved {
  const r = s.run
  if (!r || r.encounter || r.phase !== 'victory' || r.kill !== 3 || r.floor >= 5) return s
  const days = (id: string) => s.encounterHistory?.[id]?.dates.length ?? 0
  // Recently offered scenes wait while others are available; then the one completed on the fewest days (file order breaks ties).
  const scene = freshFirst(SCENES.filter(x => eligible(s.mastery, x)), x => sceneKey(x.id), s.recentEvents).sort((a, b) => days(a.id) - days(b.id))[0]
  if (!scene) return s
  const order = scene.options.map(x => x.id)
  for (let i = order.length - 1; i > 0; i--) { const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1)))); [order[i], order[j]] = [order[j], order[i]] }
  const stage = stageFor(s.mastery, s.encounterHistory?.[scene.id]?.dates ?? [], scene.requires)
  return { ...s, recentEvents: noteRecent(s.recentEvents, sceneKey(scene.id)), run: { ...r, encounter: { id: scene.id, stage, status: 'active', selected: [], order, help: false } } }
}

/** A right choice: +ENCOUNTER_GOLD run gold and today's date in the history. Anything else (or a repeat) is a no-op. */
export function complete(s: Saved, date: string): Saved {
  const e = s.run?.encounter, scene = sceneById(e?.id)
  if (!s.run || !e || !scene || e.status !== 'active' || !isCorrect(scene, e.selected)) return s
  const dates = [...new Set([...(s.encounterHistory?.[e.id]?.dates ?? []), date])].sort().slice(-30)
  return { ...s, encounterHistory: { ...s.encounterHistory, [e.id]: { dates } }, run: { ...s.run, gold: s.run.gold + ENCOUNTER_GOLD, encounter: { ...e, status: 'complete' } } }
}

/** Toggle an option: reply/point scenes keep one choice, a gather scene any number. */
export function choose(state: EncounterState, scene: Scene, id: string): EncounterState {
  const on = state.selected.includes(id)
  const selected = on ? state.selected.filter(x => x !== id) : isSingle(scene.kind) ? [id] : [...state.selected, id]
  return { ...state, selected }
}

export function cleanHistory(raw: unknown): History {
  const out: History = {}
  if (!raw || typeof raw !== 'object') return out
  for (const scene of SCENES) {
    const v = (raw as Record<string, { dates?: unknown }>)[scene.id]
    if (Array.isArray(v?.dates)) out[scene.id] = { dates: [...new Set(v.dates.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(-30) }
  }
  return out
}

export function cleanEncounter(raw: unknown): EncounterState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const e = raw as EncounterState, scene = sceneById(e.id)
  // A scene that no longer exists: keep the expedition's encounter used up, but never show it.
  if (!scene) return { id: typeof e.id === 'string' ? e.id : '', stage: 0, status: 'closed', selected: [], order: [], help: false }
  const ids = scene.options.map(x => x.id)
  const selected = Array.isArray(e.selected) ? [...new Set(e.selected.filter(x => ids.includes(x)))] : []
  const order = Array.isArray(e.order) && e.order.length === ids.length && new Set(e.order).size === ids.length && e.order.every(x => ids.includes(x)) ? e.order : ids
  // 'offer' (an intro step, removed once encounters became mandatory) opens straight into the scene.
  const status = (e.status as string) === 'offer' ? 'active' : ['active', 'complete', 'closed'].includes(e.status) ? e.status : 'closed'
  return { id: e.id, stage: [0, 1, 2].includes(e.stage) ? e.stage : 0, status, selected: isSingle(scene.kind) ? selected.slice(0, 1) : selected, order, help: e.help === true }
}

/** Preview aid for /?encounter=<scene id>&stage=<0|1|2>: a ready-to-play scene, or null when the id is not a scene. */
export function previewEncounter(id: string | null, stage: string | null): EncounterState | null {
  const scene = sceneById(id ?? undefined)
  if (!scene) return null
  const n = Number(stage)
  return { id: scene.id, stage: [0, 1, 2].includes(n) ? n : 0, status: 'active', selected: [], order: scene.options.map(x => x.id), help: false }
}
