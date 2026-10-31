// Structural validation of curricula.json. Called by validateContent (validate.ts). Pure (no DOM / fs).
// It checks references, ids, ordering, prerequisites and mappings. It does NOT check that the Mandarin or the teaching order is good.
import type { Curriculum, Word } from './types.ts'
import { selectIntroductions, stepsOf, wordMap } from '../game/course.ts'
import { MAX_LV } from '../game/mastery.ts'
import type { Mastery } from '../game/types.ts'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
export const CURRICULUM_ID = /^[a-z0-9][a-z0-9-]{0,47}$/
export const LESSON_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export const CURRICULA_FIELDS = ['default', 'curricula']
export const CURRICULUM_FIELDS = ['id', 'version', 'title', 'description', 'provisional', 'readiness', 'units', 'source', 'review']
export const UNIT_FIELDS = ['id', 'title', 'lessons']
export const LESSON_FIELDS = ['id', 'title', 'prerequisiteLessons', 'aliases', 'introductions']
export const INTRO_FIELDS = ['entryId', 'prerequisiteEntries', 'required', 'officialLevels']
export const LEVEL_FIELDS = ['source', 'edition', 'level', 'ref']

export type CurriculumContext = {
  /** Entry ids in words.json (raw objects, so the validator also works on a broken words.json). */
  entryIds: Set<string>
  sourceNames: Set<string>
  /** Validates `source` / `review` exactly like everywhere else (validate.ts). */
  checkProvenance: (at: string, obj: Record<string, unknown>) => void
  err: (m: string) => void
  warn: (m: string) => void
  info: (m: string) => void
  /** Raw cloze items, for their prerequisite references. */
  cloze: unknown
}

/** The order a learner who gets every entry ready at once would be introduced to the entries (uses the real engine). */
export function simulatedOrder(c: Curriculum, entryIds: Set<string>): string[] {
  const words = wordMap([...entryIds].map(id => ({ id } as Word)))
  const m: Mastery = {}
  const out: string[] = []
  for (let guard = 0; guard < 100000; guard++) {
    const plan = selectIntroductions({ curriculum: c, mastery: m, progress: { version: c.version, completed: [] }, words }, undefined, 1)
    if (!plan.ids.length) break
    for (const id of plan.ids) { out.push(id); m[id] = { lv: MAX_LV, ok: 0 } }
  }
  return out
}

export function validateCurricula(file: unknown, ctx: CurriculumContext) {
  const { err, warn, info } = ctx
  if (!isObj(file)) return err('curricula.json: must be an object { "default": "<curriculum id>", "curricula": [ ... ] }')
  for (const k of Object.keys(file)) if (!CURRICULA_FIELDS.includes(k)) err(`curricula.json: unknown field "${k}" (allowed: ${CURRICULA_FIELDS.join(', ')})`)
  if (!Array.isArray(file.curricula) || file.curricula.length === 0) return err('curricula.json: "curricula" must be a non-empty array')
  const currIds = new Set<string>()
  const allLessonIds = new Set<string>()
  const good: Curriculum[] = []

  file.curricula.forEach((c, ci) => {
    const at = `curricula.json curricula[${ci}]${isObj(c) && isStr(c.id) ? ` (${c.id})` : ''}`
    if (!isObj(c)) return err(`${at}: must be an object`)
    let ok = true
    const e = (m: string) => { ok = false; err(m) }
    for (const k of Object.keys(c)) if (!CURRICULUM_FIELDS.includes(k)) e(`${at}: unknown field "${k}" (allowed: ${CURRICULUM_FIELDS.join(', ')})`)
    if (!isStr(c.id) || !CURRICULUM_ID.test(c.id)) e(`${at}: "id" is required: lowercase letters, digits and dashes, up to 48 characters`)
    else if (currIds.has(c.id)) e(`${at}: duplicate curriculum id "${c.id}"`)
    else currIds.add(c.id)
    if (!isStr(c.title)) e(`${at}: "title" must be a non-empty string`)
    if (!(typeof c.version === 'number' && Number.isInteger(c.version) && c.version >= 1)) e(`${at}: "version" must be a positive integer (raise it whenever the units, lessons or introductions change)`)
    if (c.description !== undefined && !isStr(c.description)) e(`${at}: "description" must be a non-empty string`)
    if (c.provisional !== undefined && typeof c.provisional !== 'boolean') e(`${at}: "provisional" must be true or false`)
    if (c.readiness !== undefined) {
      const r = c.readiness
      if (!isObj(r) || Object.keys(r).some(k => k !== 'minLevel') || !(Number.isInteger(r.minLevel) && (r.minLevel as number) >= 1 && (r.minLevel as number) <= MAX_LV))
        e(`${at}: "readiness" must be { "minLevel": 1-${MAX_LV} } (mastery level an entry needs before the course continues)`)
    }
    ctx.checkProvenance(at, c)

    // ---- units, lessons, introductions --------------------------------------------------------------------
    const unitIds = new Set<string>(), lessonIds = new Map<string, string>(), aliasOwner = new Map<string, string>()
    const introAt = new Map<string, string>()   // entry id -> where it is introduced
    const order: string[] = []                  // declared introduction order
    const lessonOrder: string[] = []
    if (!Array.isArray(c.units) || c.units.length === 0) { e(`${at}: "units" must be a non-empty array`); return }
    c.units.forEach((u, ui) => {
      const ua = `${at} units[${ui}]${isObj(u) && isStr(u.id) ? ` (${u.id})` : ''}`
      if (!isObj(u)) return e(`${ua}: must be an object { id, title, lessons }`)
      for (const k of Object.keys(u)) if (!UNIT_FIELDS.includes(k)) e(`${ua}: unknown field "${k}" (allowed: ${UNIT_FIELDS.join(', ')})`)
      if (!isStr(u.id) || !LESSON_ID.test(u.id)) e(`${ua}: "id" is required: lowercase letters, digits and dashes`)
      else if (unitIds.has(u.id)) e(`${ua}: duplicate unit id "${u.id}"`)
      else unitIds.add(u.id)
      if (!isStr(u.title)) e(`${ua}: "title" must be a non-empty string`)
      if (!Array.isArray(u.lessons) || u.lessons.length === 0) return e(`${ua}: "lessons" must be a non-empty array`)
      u.lessons.forEach((l, li) => {
        const la = `${ua} lessons[${li}]${isObj(l) && isStr(l.id) ? ` (${l.id})` : ''}`
        if (!isObj(l)) return e(`${la}: must be an object { id, title, prerequisiteLessons?, introductions }`)
        for (const k of Object.keys(l)) if (!LESSON_FIELDS.includes(k)) e(`${la}: unknown field "${k}" (allowed: ${LESSON_FIELDS.join(', ')})`)
        if (!isStr(l.id) || !LESSON_ID.test(l.id)) e(`${la}: "id" is required: lowercase letters, digits and dashes`)
        else if (lessonIds.has(l.id)) e(`${la}: duplicate lesson id "${l.id}"`)
        else { lessonIds.set(l.id, la); lessonOrder.push(l.id); allLessonIds.add(l.id) }
        if (!isStr(l.title)) e(`${la}: "title" must be a non-empty string`)
        if (l.aliases !== undefined) {
          if (!Array.isArray(l.aliases) || !l.aliases.every(isStr)) e(`${la}: "aliases" must be an array of earlier lesson ids`)
          else for (const a of l.aliases as string[]) {
            if (aliasOwner.has(a)) e(`${la}: alias "${a}" is also claimed by lesson "${aliasOwner.get(a)}"`)
            aliasOwner.set(a, String(l.id))
          }
        }
        if (l.prerequisiteLessons !== undefined && (!Array.isArray(l.prerequisiteLessons) || !l.prerequisiteLessons.every(isStr))) e(`${la}: "prerequisiteLessons" must be an array of lesson ids`)
        if (!Array.isArray(l.introductions) || l.introductions.length === 0) return e(`${la}: "introductions" must be a non-empty array of { entryId, prerequisiteEntries? }`)
        l.introductions.forEach((it, ii) => {
          const ia = `${la} introductions[${ii}]${isObj(it) && isStr(it.entryId) ? ` (${it.entryId})` : ''}`
          if (!isObj(it)) return e(`${ia}: must be an object { entryId, prerequisiteEntries?, required?, officialLevels? }`)
          for (const k of Object.keys(it)) if (!INTRO_FIELDS.includes(k)) e(`${ia}: unknown field "${k}" (allowed: ${INTRO_FIELDS.join(', ')})`)
          if (!isStr(it.entryId)) return e(`${ia}: "entryId" must be an entry id from words.json`)
          if (!ctx.entryIds.has(it.entryId)) e(`${ia}: "${it.entryId}" is not an entry id in words.json (missing vocabulary reference)`)
          if (introAt.has(it.entryId)) e(`${ia}: "${it.entryId}" is already introduced at ${introAt.get(it.entryId)}; an entry is introduced once per curriculum`)
          else { introAt.set(it.entryId, la); order.push(it.entryId) }
          if (it.required !== undefined && typeof it.required !== 'boolean') e(`${ia}: "required" must be true or false`)
          if (it.prerequisiteEntries !== undefined && (!Array.isArray(it.prerequisiteEntries) || !it.prerequisiteEntries.every(isStr))) e(`${ia}: "prerequisiteEntries" must be an array of entry ids`)
          if (it.officialLevels !== undefined) {
            if (!Array.isArray(it.officialLevels)) e(`${ia}: "officialLevels" must be an array of { source, edition, level, ref? }`)
            else it.officialLevels.forEach((o, oi) => {
              const oa = `${ia} officialLevels[${oi}]`
              if (!isObj(o)) return e(`${oa}: must be { source, edition, level, ref? }`)
              for (const k of Object.keys(o)) if (!LEVEL_FIELDS.includes(k)) e(`${oa}: unknown field "${k}" (allowed: ${LEVEL_FIELDS.join(', ')})`)
              if (!isStr(o.source)) e(`${oa}: "source" is required (a name from sources.json, e.g. "HSK")`)
              else if (!ctx.sourceNames.has(o.source)) e(`${oa}: source "${o.source}" is not registered in sources.json`)
              if (!isStr(o.edition)) e(`${oa}: "edition" is required: name the exact edition (e.g. "HSK 3.0 (2021)"); a level without its edition is ambiguous`)
              if (!isStr(o.level)) e(`${oa}: "level" is required (as the edition names it, e.g. "1")`)
              if (o.ref !== undefined && !isStr(o.ref)) e(`${oa}: "ref" must be a non-empty string`)
            })
          }
        })
      })
    })

    // ---- prerequisites (needs every id first) ------------------------------------------------------------------
    const pos = new Map(order.map((id, i) => [id, i]))
    const lessonPos = new Map(lessonOrder.map((id, i) => [id, i]))
    const prereqGraph = new Map<string, string[]>()
    c.units.forEach(u => isObj(u) && Array.isArray(u.lessons) && u.lessons.forEach(l => {
      if (!isObj(l) || !isStr(l.id)) return
      const la = lessonIds.get(l.id) ?? `${at} lesson ${l.id}`
      const pre = Array.isArray(l.prerequisiteLessons) ? (l.prerequisiteLessons as unknown[]).filter(isStr) : []
      prereqGraph.set(l.id, pre)
      for (const p of pre) {
        if (p === l.id) e(`${la}: lists itself as a prerequisite lesson`)
        else if (!lessonIds.has(p)) e(`${la}: prerequisite lesson "${p}" is not a lesson of this curriculum`)
        else if ((lessonPos.get(p) ?? 0) > (lessonPos.get(l.id) ?? 0)) e(`${la}: prerequisite lesson "${p}" comes later in the curriculum; the declared sequence cannot be followed (move "${p}" earlier or drop the prerequisite)`)
      }
      if (Array.isArray(l.introductions)) l.introductions.forEach(it => {
        if (!isObj(it) || !isStr(it.entryId) || !Array.isArray(it.prerequisiteEntries)) return
        for (const p of it.prerequisiteEntries) {
          if (!isStr(p)) continue
          const ia = `${la} (${it.entryId})`
          if (p === it.entryId) e(`${ia}: lists itself as a prerequisite entry`)
          else if (!ctx.entryIds.has(p)) e(`${ia}: prerequisite entry "${p}" is not an entry id in words.json`)
          else if (!pos.has(p)) e(`${ia}: prerequisite entry "${p}" is never introduced in this curriculum, so "${it.entryId}" is unreachable`)
          else if ((pos.get(p) ?? 0) > (pos.get(it.entryId) ?? 0)) e(`${ia}: prerequisite entry "${p}" is introduced later; the declared sequence cannot be followed`)
        }
      })
    }))
    // cycles in the lesson graph
    const state = new Map<string, 1 | 2>()
    const cycles: string[][] = []
    const visit = (id: string, path: string[]) => {
      if (state.get(id) === 2) return
      if (state.get(id) === 1) { cycles.push([...path.slice(path.indexOf(id)), id]); return }
      state.set(id, 1)
      for (const p of prereqGraph.get(id) ?? []) if (prereqGraph.has(p)) visit(p, [...path, id])
      state.set(id, 2)
    }
    for (const id of prereqGraph.keys()) visit(id, [])
    for (const cyc of cycles) e(`${at}: prerequisite cycle between lessons ${cyc.join(' -> ')}`)

    if (ok) good.push(c as unknown as Curriculum)
  })

  if (!isStr(file.default)) err('curricula.json: "default" must name the curriculum the game uses')
  else if (!currIds.has(file.default)) err(`curricula.json: "default" is "${file.default}", which is not a curriculum id`)

  // ---- reachability, with the real engine (only for structurally valid curricula) ------------------------------
  for (const c of good) {
    const declared = stepsOf(c).map(s => s.intro.entryId).filter(id => ctx.entryIds.has(id))
    const reached = simulatedOrder(c, ctx.entryIds)
    const never = declared.filter(id => !reached.includes(id))
    if (never.length) err(`curricula.json (${c.id}): these entries can never be introduced (unsatisfiable prerequisites): ${never.join(', ')}`)
    else if (reached.join('|') !== declared.join('|')) {
      const k = declared.findIndex((id, i) => reached[i] !== id)
      err(`curricula.json (${c.id}): prerequisites change the declared order (position ${k + 1}: declared "${declared[k]}", reached "${reached[k]}")`)
    }
    if (c.provisional) info(`curricula.json (${c.id}): marked provisional: its order is a placeholder, not a reviewed teaching sequence`)
    const unmapped = stepsOf(c).filter(s => !s.intro.officialLevels?.length).length
    if (unmapped) info(`curricula.json (${c.id}): ${unmapped} of ${stepsOf(c).length} introductions have no official-level mapping (unknown, not inferred)`)
  }
  const active = good.find(c => c.id === file.default)
  if (active) {
    const inCourse = new Set(stepsOf(active).map(s => s.intro.entryId))
    const outside = [...ctx.entryIds].filter(id => !inCourse.has(id))
    if (outside.length) info(`${outside.length} entr${outside.length === 1 ? 'y is' : 'ies are'} not in the active curriculum "${active.id}" and will not be introduced (fine for supporting or future content): ${outside.join(' ')}`)
  }

  // ---- sentence-question prerequisites -------------------------------------------------------------------------
  if (Array.isArray(ctx.cloze)) ctx.cloze.forEach((q, i) => {
    if (!isObj(q)) return
    const at = `cloze.json[${i}]${isStr(q.id) ? ` (${q.id})` : ''}`
    for (const f of ['prerequisiteEntries', 'prerequisiteLessons'] as const) {
      if (q[f] === undefined) continue
      if (!Array.isArray(q[f]) || !(q[f] as unknown[]).every(isStr)) { err(`${at}: "${f}" must be an array of ${f === 'prerequisiteEntries' ? 'entry' : 'lesson'} ids`); continue }
      for (const id of q[f] as string[]) {
        if (f === 'prerequisiteEntries' && !ctx.entryIds.has(id)) err(`${at}: prerequisite entry "${id}" is not an entry id in words.json`)
        if (f === 'prerequisiteLessons' && !allLessonIds.has(id)) err(`${at}: prerequisite lesson "${id}" is not a lesson in any curriculum`)
      }
    }
    if (active && Array.isArray(q.prerequisiteEntries)) {
      const inCourse = new Set(stepsOf(active).map(s => s.intro.entryId))
      const outside = (q.prerequisiteEntries as unknown[]).filter((id): id is string => isStr(id) && !inCourse.has(id))
      if (outside.length) warn(`${at}: prerequisite entr${outside.length === 1 ? 'y' : 'ies'} ${outside.join(', ')} not in the active curriculum: learners of it only see this sentence if they already know ${outside.length === 1 ? 'it' : 'them'}`)
    }
  })
}
