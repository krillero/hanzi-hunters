// Content validator for words.json, explanations.json, cloze.json and sources.json. Pure (no DOM / fs) so tests, the CLI and
// other tools can all use it. Rules are documented in docs/CONTENT_GUIDE.md.
import { checkPinyin, soundKey, syllableCount, splitSyllables } from './pinyin.ts'
import { QUESTION_KINDS } from '../game/questions.ts'

export type Issues = { errors: string[]; warnings: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const HAN = /\p{Script=Han}/u
const hanChars = (s: string) => [...s].filter(c => HAN.test(c))
const hasToneNumber = (s: string) => /[a-zA-ZüÜ][1-5]\b/.test(s)
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const LIMITS = { summary: 300, heading: 50, body: 700, tip: 260, note: 200, items: 6, parts: 6, examples: 4, title: 60, hanzi: 8, meaning: 40, particleMeaning: 44, context: 120, why: 140 }
export const WORD_FIELDS = ['id', 'hanzi', 'pinyin', 'meaning', 'group', 'note', 'kind', 'neutral', 'variants', 'speech', 'wrongPinyin', 'audio', 'questions', 'aliases', 'confusable', 'lookalike', 'source', 'review']
export const REVIEW_STATUSES = ['ai-draft', 'imported', 'human-reviewed']

export function validateContent(words: unknown, explanations: unknown, cloze: unknown = [], sources: unknown = {}): Issues {
  const errors: string[] = [], warnings: string[] = []
  const err = (m: string) => errors.push(m), warn = (m: string) => warnings.push(m)

  // ---- sources.json -----------------------------------------------------------------------
  const sourceNames = new Set<string>()
  if (!isObj(sources)) err('sources.json: must be an object keyed by source name')
  else for (const [name, info] of Object.entries(sources)) {
    sourceNames.add(name)
    if (!isObj(info)) { err(`sources.json["${name}"]: must be an object`); continue }
    for (const k of Object.keys(info)) if (!['title', 'url', 'license', 'attribution', 'usage'].includes(k)) err(`sources.json["${name}"]: unknown field "${k}"`)
    for (const k of ['title', 'license', 'attribution']) if (!isStr(info[k])) err(`sources.json["${name}"].${k}: required non-empty string`)
    if (info.url !== undefined && (!isStr(info.url) || !/^https?:\/\//.test(info.url))) err(`sources.json["${name}"].url: must start with http:// or https://`)
  }

  /** Validates `source` (list of references) and `review` of an entry, example, explanation or cloze item. */
  function checkProvenance(at: string, obj: Record<string, unknown>, reviewRequired = false) {
    if (obj.source !== undefined) {
      if (!Array.isArray(obj.source)) err(`${at}.source: must be an array of { name, ref?, retrieved?, note? }`)
      else obj.source.forEach((s, i) => {
        const a = `${at}.source[${i}]`
        if (!isObj(s)) return err(`${a}: must be an object { name, ref?, retrieved?, note? }`)
        for (const k of Object.keys(s)) if (!['name', 'ref', 'retrieved', 'note'].includes(k)) err(`${a}: unknown field "${k}"`)
        if (!isStr(s.name)) err(`${a}.name: required`)
        else if (!sourceNames.has(s.name)) err(`${a}.name: "${s.name}" is not registered in sources.json (add its license and attribution there first)`)
        else if (['CC-CEDICT', 'Tatoeba', 'HSK'].includes(s.name) && !isStr(s.ref)) warn(`${a}: add "ref" (the dictionary entry, sentence number/author, or HSK edition and level)`)
        if (s.retrieved !== undefined && !(isStr(s.retrieved) && DATE.test(s.retrieved))) err(`${a}.retrieved: use YYYY-MM-DD`)
      })
    }
    if (obj.review === undefined) { if (reviewRequired) err(`${at}.review: required`); return }
    const r = obj.review
    if (!isObj(r)) return err(`${at}.review: must be { status, reviewer?, date?, note? }`)
    for (const k of Object.keys(r)) if (!['status', 'reviewer', 'date', 'note'].includes(k)) err(`${at}.review: unknown field "${k}"`)
    if (!REVIEW_STATUSES.includes(r.status as string)) err(`${at}.review.status: must be one of ${REVIEW_STATUSES.join(', ')}`)
    if (r.status === 'human-reviewed') {
      if (!isStr(r.reviewer)) err(`${at}.review: "human-reviewed" needs the reviewer's name`)
      if (!(isStr(r.date) && DATE.test(r.date))) err(`${at}.review: "human-reviewed" needs the review date (YYYY-MM-DD)`)
    } else if (r.reviewer !== undefined || r.date !== undefined) warn(`${at}.review: reviewer/date are only meaningful for status "human-reviewed"`)
  }

  // ---- words.json -------------------------------------------------------------------------
  const ids = new Set<string>()
  const byId = new Map<string, Record<string, unknown>>()
  const vocabChars = new Set<string>()
  if (!Array.isArray(words)) err('words.json: must be an array of word objects')
  else {
    const hanziCount = new Map<string, number>()
    for (const w of words) if (isObj(w) && isStr(w.hanzi)) hanziCount.set(w.hanzi, (hanziCount.get(w.hanzi) ?? 0) + 1)
    const idOf = (w: Record<string, unknown>) => (isStr(w.id) ? w.id : isStr(w.hanzi) ? w.hanzi : '')
    words.forEach((w, i) => {
      const at = `words.json[${i}]${isObj(w) && isStr(w.hanzi) ? ` (${w.hanzi}${isStr(w.id) ? ` #${w.id}` : ''})` : ''}`
      if (!isObj(w)) return err(`${at}: must be an object`)
      for (const k of Object.keys(w)) {
        if (k === 'alt') err(`${at}: "alt" was split in two. Use "variants" for other accepted ways to say the SAME word and meaning (谁: shéi / shuí), or "speech" for connected-speech changes (不 -> bú)`)
        else if (!WORD_FIELDS.includes(k)) err(`${at}: unknown field "${k}" (allowed: ${WORD_FIELDS.join(', ')})`)
      }
      for (const k of ['hanzi', 'pinyin', 'meaning', 'group', 'note']) if (!isStr(w[k])) err(`${at}: "${k}" must be a non-empty string`)

      // identity
      const id = idOf(w)
      if (w.id !== undefined && (!isStr(w.id) || !/^[^\s,]{1,24}$/.test(w.id))) err(`${at}: "id" must be 1-24 characters without spaces or commas`)
      if (id) {
        if (ids.has(id)) err(`${at}: duplicate id "${id}"${w.id === undefined ? ': two entries with the same hanzi each need their own explicit "id"' : ''}`)
        ids.add(id); byId.set(id, w)
      }
      if (isStr(w.hanzi) && (hanziCount.get(w.hanzi) ?? 0) > 1 && w.id === undefined) err(`${at}: this hanzi is used by more than one entry; give every one of them an explicit unique "id" (and keep the old id on the entry that already has saved progress)`)

      // hanzi
      const kind = w.kind === undefined ? (isStr(w.hanzi) && [...w.hanzi].length > 1 ? 'word' : 'character') : w.kind
      if (w.kind !== undefined && !['word', 'character', 'particle'].includes(w.kind as string)) err(`${at}: "kind" must be word, character or particle`)
      if (isStr(w.hanzi)) {
        const n = [...w.hanzi].length
        if (hanChars(w.hanzi).length !== n) err(`${at}: "hanzi" must contain only Chinese characters`)
        if (n > LIMITS.hanzi) err(`${at}: "hanzi" has ${n} characters, max ${LIMITS.hanzi} (long phrases do not fit an answer button)`)
        else if (n > 4) warn(`${at}: ${n} characters is long for an answer button; prefer words of 1-4 characters`)
        if (kind === 'character' && n > 1) warn(`${at}: kind "character" is for single characters; use "word" for ${w.hanzi}`)
        hanChars(w.hanzi).forEach(c => vocabChars.add(c))
      }

      // pinyin
      const neutral = Array.isArray(w.neutral) ? (w.neutral as unknown[]) : []
      if (w.neutral !== undefined && !(Array.isArray(w.neutral) && w.neutral.every(n => Number.isInteger(n)))) err(`${at}: "neutral" must be an array of 1-based syllable positions, e.g. [2]`)
      if (isStr(w.pinyin)) {
        const res = checkPinyin(w.pinyin, neutral.filter((n): n is number => Number.isInteger(n)))
        res.problems.forEach(m => err(`${at}: ${m}`))
        if (res.syllables.length > 0 && isStr(w.hanzi) && res.syllables.length !== [...w.hanzi].length) err(`${at}: pinyin "${w.pinyin}" has ${res.syllables.length} syllable(s) but "${w.hanzi}" has ${[...w.hanzi].length} character(s) (erhua 儿 is not supported yet)`)
      }
      if (isStr(w.meaning)) {
        const max = kind === 'particle' ? LIMITS.particleMeaning : LIMITS.meaning
        if (w.meaning.length > max) (w.meaning.length > max + 26 ? err : warn)(`${at}: meaning is long (${w.meaning.length} chars, aim for at most ${max}${kind === 'particle' ? '; put examples like 我的书 in the note' : ''}); it must fit the card and an answer button`)
        if (kind !== 'particle' && /particle|measure word|grammar/i.test(w.meaning)) warn(`${at}: the meaning mentions grammar; consider kind "particle" with a short functional description`)
      }

      // readings
      const own = isStr(w.pinyin) ? soundKey(w.pinyin) : ''
      const readingOk = (label: string, p: unknown) => {
        if (!isStr(p)) { err(`${at}: ${label} must be a pinyin string`); return false }
        const res = checkPinyin(p, [], false)
        res.problems.forEach(m => err(`${at}: ${label} "${p}": ${m}`))
        if (res.ok && isStr(w.pinyin) && res.syllables.length !== syllableCount(w.pinyin)) err(`${at}: ${label} "${p}" has a different number of syllables than "${w.pinyin}"`)
        return res.ok
      }
      const validSounds = new Set<string>([own])
      if (w.variants !== undefined) {
        if (!Array.isArray(w.variants)) err(`${at}: "variants" must be an array of pinyin strings`)
        else w.variants.forEach((v, k) => { if (readingOk(`variants[${k}]`, v)) { if (soundKey(v as string) === own) err(`${at}: variants[${k}] repeats the main pinyin`); validSounds.add(soundKey(v as string)) } })
      }
      if (w.speech !== undefined) {
        if (!Array.isArray(w.speech)) err(`${at}: "speech" must be an array of { pinyin, context, note? }`)
        else w.speech.forEach((sp, k) => {
          const a = `speech[${k}]`
          if (!isObj(sp)) return err(`${at}: ${a} must be { pinyin, context, note? }`)
          for (const f of Object.keys(sp)) if (!['pinyin', 'context', 'note'].includes(f)) err(`${at}: ${a}: unknown field "${f}"`)
          if (readingOk(`${a}.pinyin`, sp.pinyin) && soundKey(sp.pinyin as string) === own) err(`${at}: ${a}.pinyin repeats the dictionary pinyin; "speech" is only for forms that differ`)
          if (!isStr(sp.context) || sp.context.length > LIMITS.context) err(`${at}: ${a}.context: required, up to ${LIMITS.context} chars (when does the change happen?)`)
          if (sp.note !== undefined && (!isStr(sp.note) || sp.note.length > LIMITS.note)) err(`${at}: ${a}.note: string up to ${LIMITS.note} chars`)
        })
      }
      if (w.wrongPinyin !== undefined) {
        if (!Array.isArray(w.wrongPinyin)) err(`${at}: "wrongPinyin" must be an array of pinyin strings`)
        else w.wrongPinyin.forEach((v, k) => {
          if (!isStr(v)) return err(`${at}: wrongPinyin[${k}] must be a pinyin string`)
          const res = splitSyllables(v)
          if (!res) err(`${at}: wrongPinyin[${k}] "${v}" is not valid pinyin`)
          const bad = checkPinyin(v, [], false)
          if (!bad.ok) bad.problems.forEach(m => err(`${at}: wrongPinyin[${k}] "${v}": ${m}`))
          if (validSounds.has(soundKey(v)) || (Array.isArray(w.speech) && w.speech.some(sp => isObj(sp) && isStr(sp.pinyin) && soundKey(sp.pinyin) === soundKey(v)))) err(`${at}: wrongPinyin[${k}] "${v}" is a valid way to say this word (dictionary reading, variant or speech form); it cannot be offered as a wrong answer`)
        })
      }
      if (w.audio !== undefined && !['ok', 'none'].includes(w.audio as string)) err(`${at}: "audio" must be "ok" or "none"`)
      if (isStr(w.hanzi) && (hanziCount.get(w.hanzi) ?? 0) > 1 && w.audio !== 'none') err(`${at}: entries that share the hanzi ${w.hanzi} need "audio": "none" (text-to-speech cannot be trusted to pick the intended reading)`)
      if (w.questions !== undefined) {
        if (!Array.isArray(w.questions) || w.questions.length === 0 || !w.questions.every(q => QUESTION_KINDS.includes(q as never))) err(`${at}: "questions" must be a non-empty array of question kinds (${QUESTION_KINDS.join(', ')})`)
        else if ((w.questions as string[]).includes('particle') && kind !== 'particle') err(`${at}: the "particle" question is only for entries with kind "particle"`)
      }
      if (w.aliases !== undefined && !(Array.isArray(w.aliases) && w.aliases.every(isStr))) err(`${at}: "aliases" must be an array of earlier ids`)
      for (const k of ['confusable', 'lookalike'] as const) if (w[k] !== undefined && !(Array.isArray(w[k]) && (w[k] as unknown[]).every(isStr))) err(`${at}: "${k}" must be an array of entry ids`)
      if (isStr(w.note) && w.note.length > LIMITS.note * 2) warn(`${at}: note is long (${w.note.length} chars)`)
      checkProvenance(at, w)
    })
    // cross references (after every id is known)
    const allAliases = new Map<string, string>()
    words.forEach((w, i) => {
      if (!isObj(w)) return
      const at = `words.json[${i}] (${String(w.hanzi)})`, id = idOf(w)
      for (const k of ['confusable', 'lookalike'] as const) if (Array.isArray(w[k])) for (const c of w[k] as unknown[]) {
        if (!isStr(c) || !ids.has(c)) { err(`${at}: ${k} "${String(c)}" is not an entry id in the list`); continue }
        if (c === id) err(`${at}: ${k} must not list the entry itself`)
        if (k === 'lookalike') {
          const other = byId.get(c)
          if (other && isStr(other.hanzi) && isStr(w.hanzi) && [...other.hanzi].length !== [...w.hanzi].length) err(`${at}: lookalike "${c}" has a different length; look-alike questions compare entries of the same length`)
          if (other && other.hanzi === w.hanzi) err(`${at}: lookalike "${c}" has the same hanzi (another reading, not a look-alike)`)
        }
      }
      if (Array.isArray(w.aliases)) for (const a of w.aliases as unknown[]) {
        if (!isStr(a)) continue
        if (ids.has(a)) err(`${at}: alias "${a}" is the id of another entry; an alias is an EARLIER id that no entry uses any more`)
        else if (allAliases.has(a)) err(`${at}: alias "${a}" is also claimed by ${allAliases.get(a)} (progress under one old id can move to one entry only)`)
        else allAliases.set(a, id)
      }
    })
    // identical meanings between different entries are only fine for deliberate homographs
    const seenMeaning = new Map<string, string>()
    words.forEach(w => {
      if (!isObj(w) || !isStr(w.meaning)) return
      const k = w.meaning.trim().toLowerCase(), prev = seenMeaning.get(k)
      if (prev !== undefined && prev !== String(w.hanzi)) warn(`words.json (${String(w.hanzi)}): the meaning "${w.meaning}" is also used by ${prev}; the two can never be wrong answers for each other (add "confusable" or make the meanings distinct)`)
      else seenMeaning.set(k, String(w.hanzi))
    })
  }
  // ---- explanations.json ------------------------------------------------------------------
  if (!isObj(explanations)) { err('explanations.json: must be an object keyed by hanzi'); return { errors, warnings } }
  const known = new Set<string>([...vocabChars])
  let current = ''   // hanzi of the entry whose explanation is being checked
  for (const [key, ex] of Object.entries(explanations)) {
    const at = `explanations.json["${key}"]`
    if (!ids.has(key)) err(`${at}: key is not an entry id in words.json (add the entry first, or fix the key; the id is the hanzi unless the entry declares another)`)
    current = isStr(byId.get(key)?.hanzi) ? String(byId.get(key)!.hanzi) : ''
    if (!isObj(ex)) { err(`${at}: must be an object`); continue }
    for (const k of Object.keys(ex)) if (!['title', 'summary', 'sections', 'related', 'source', 'review'].includes(k)) err(`${at}: unknown field "${k}" (allowed: title, summary, sections, related, source, review)`)
    if (ex.title !== undefined && (!isStr(ex.title) || ex.title.length > LIMITS.title)) err(`${at}.title: must be a string up to ${LIMITS.title} chars`)
    if (!isStr(ex.summary)) err(`${at}.summary: required non-empty string`)
    else if (ex.summary.length > LIMITS.summary) err(`${at}.summary: ${ex.summary.length} chars, max ${LIMITS.summary}`)
    if (!Array.isArray(ex.sections) || ex.sections.length === 0) err(`${at}.sections: must be a non-empty array`)
    else ex.sections.forEach((s, i) => checkSection(`${at}.sections[${i}]`, s))
    checkProvenance(at, ex)
    if (ex.related !== undefined) {
      if (!Array.isArray(ex.related)) err(`${at}.related: must be an array of hanzi`)
      else for (const r of ex.related) {
        if (!isStr(r) || !ids.has(r)) err(`${at}.related: "${String(r)}" is not an entry id in words.json`)
        else if (r === key) err(`${at}.related: must not list itself`)
      }
    }
    // Every Chinese character used should ideally be one the learner can know.
    const used = new Set<string>()
    const walk = (v: unknown) => { if (typeof v === 'string') hanChars(v).forEach(c => used.add(c)); else if (Array.isArray(v)) v.forEach(walk); else if (isObj(v)) Object.values(v).forEach(walk) }
    walk(ex.sections)
    const unknownChars = [...used].filter(c => !known.has(c))
    if (unknownChars.length) warn(`${at}: uses characters outside the vocabulary (${unknownChars.join(' ')}). Fine for radicals/parts, but prefer vocabulary characters in examples`)
  }

  function checkText(at: string, v: unknown, max: number) {
    if (!isStr(v)) err(`${at}: required non-empty string`)
    else if (v.length > max) err(`${at}: ${v.length} chars, max ${max}`)
  }
  function checkPart(at: string, p: unknown) {
    if (!isObj(p)) return err(`${at}: must be an object { char, pinyin?, meaning, note? }`)
    for (const k of Object.keys(p)) if (!['char', 'pinyin', 'meaning', 'note'].includes(k)) err(`${at}: unknown field "${k}"`)
    if (!isStr(p.char) || [...p.char].length > 4) err(`${at}.char: required, a character, a short word or a radical (1-4 characters)`)
    checkText(`${at}.meaning`, p.meaning, LIMITS.note)
    if (p.pinyin !== undefined) {
      if (!isStr(p.pinyin)) err(`${at}.pinyin: must be a string`)
      else if (hasToneNumber(p.pinyin)) err(`${at}.pinyin: use tone marks, not numbers`)
    }
    if (p.note !== undefined) checkText(`${at}.note`, p.note, LIMITS.note)
  }
  function checkSection(at: string, s: unknown) {
    if (!isObj(s)) return err(`${at}: must be an object with a "type"`)
    const type = s.type
    const common = ['type', 'heading']
    if (s.heading !== undefined && (!isStr(s.heading) || s.heading.length > LIMITS.heading)) err(`${at}.heading: string up to ${LIMITS.heading} chars`)
    const fields = (extra: string[]) => { for (const k of Object.keys(s)) if (![...common, ...extra].includes(k)) err(`${at}: unknown field "${k}" for type "${String(type)}"`) }
    switch (type) {
      case 'text': fields(['body']); checkText(`${at}.body`, s.body, LIMITS.body); break
      case 'tips':
        fields(['items'])
        if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > LIMITS.items) err(`${at}.items: 1-${LIMITS.items} strings`)
        else s.items.forEach((t, i) => checkText(`${at}.items[${i}]`, t, LIMITS.tip))
        break
      case 'breakdown': case 'compare': {
        fields(['intro', type === 'breakdown' ? 'parts' : 'items'])
        if (s.intro !== undefined) checkText(`${at}.intro`, s.intro, LIMITS.body)
        const list = type === 'breakdown' ? s.parts : s.items
        if (!Array.isArray(list) || list.length < 1 || list.length > LIMITS.parts) err(`${at}.${type === 'breakdown' ? 'parts' : 'items'}: 1-${LIMITS.parts} objects`)
        else list.forEach((p, i) => checkPart(`${at}.${type === 'breakdown' ? 'parts' : 'items'}[${i}]`, p))
        break
      }
      case 'examples':
        fields(['items'])
        if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > LIMITS.examples) err(`${at}.items: 1-${LIMITS.examples} examples`)
        else s.items.forEach((e, i) => {
          if (!isObj(e)) return err(`${at}.items[${i}]: must be { zh, pinyin, en, note?, source?, review?, audio? }`)
          for (const k of Object.keys(e)) if (!['zh', 'pinyin', 'en', 'note', 'source', 'review', 'audio'].includes(k)) err(`${at}.items[${i}]: unknown field "${k}"`)
          if (e.note !== undefined) checkText(`${at}.items[${i}].note`, e.note, LIMITS.note)
          if (e.audio !== undefined && typeof e.audio !== 'boolean') err(`${at}.items[${i}].audio: must be true or false`)
          checkProvenance(`${at}.items[${i}]`, e)
          checkText(`${at}.items[${i}].zh`, e.zh, 80); checkText(`${at}.items[${i}].pinyin`, e.pinyin, 160); checkText(`${at}.items[${i}].en`, e.en, 160)
          if (isStr(e.pinyin) && hasToneNumber(e.pinyin)) err(`${at}.items[${i}].pinyin: use tone marks, not numbers`)
          if (isStr(e.zh) && isStr(e.pinyin)) {
            const sylls = e.pinyin.split(/[^\p{L}'’]+/u).filter(Boolean).reduce((n, t) => n + (splitSyllables(t)?.length ?? 1), 0)
            if (sylls !== hanChars(e.zh).length) warn(`${at}.items[${i}]: the pinyin has ${sylls} syllable(s) but the sentence has ${hanChars(e.zh).length} Chinese character(s); check both`)
          }
          if (isStr(e.zh) && current && !e.zh.includes(current)) warn(`${at}.items[${i}]: the sentence does not contain ${current}; an example should use the word it explains`)
        })
        break
      default: err(`${at}.type: "${String(type)}" is not one of text, tips, breakdown, compare, examples`)
    }
  }
  // ---- cloze.json -------------------------------------------------------------------------
  const clozeIds = new Set<string>()
  if (!Array.isArray(cloze)) err('cloze.json: must be an array of fill-in-the-blank items')
  else cloze.forEach((c, i) => {
    const at = `cloze.json[${i}]${isObj(c) && isStr(c.id) ? ` (${c.id})` : ''}`
    if (!isObj(c)) return err(`${at}: must be an object`)
    for (const k of Object.keys(c)) if (!['id', 'answer', 'zh', 'pinyin', 'en', 'options', 'why', 'note', 'source', 'review'].includes(k)) err(`${at}: unknown field "${k}"`)
    for (const k of ['id', 'answer', 'zh', 'pinyin', 'en']) if (!isStr(c[k])) err(`${at}: "${k}" must be a non-empty string`)
    if (isStr(c.id)) { if (clozeIds.has(c.id)) err(`${at}: duplicate id`); clozeIds.add(c.id) }
    if (isStr(c.zh) && c.zh.split('___').length !== 2) err(`${at}: "zh" must contain exactly one blank written as ___`)
    if (isStr(c.pinyin) && c.pinyin.split('___').length !== 2) err(`${at}: "pinyin" must contain exactly one blank written as ___`)
    if (isStr(c.en) && c.en.length > 160) err(`${at}: "en" is ${c.en.length} chars, max 160`)
    if (c.note !== undefined) checkText(`${at}.note`, c.note, LIMITS.note)
    const opts = Array.isArray(c.options) ? (c.options as unknown[]) : null
    if (!opts || opts.length < 2 || opts.length > 4 || !opts.every(isStr)) err(`${at}: "options" must be 2-4 entry ids`)
    else {
      if (new Set(opts).size !== opts.length) err(`${at}: options must be distinct`)
      if (isStr(c.answer) && !opts.includes(c.answer)) err(`${at}: "answer" ${c.answer} is not one of the options`)
      const hanzi = new Set<string>()
      for (const o of opts as string[]) {
        const e = byId.get(o)
        if (!e) { err(`${at}: option "${o}" is not an entry id in words.json`); continue }
        if (e.kind !== 'particle') err(`${at}: option "${o}" must be an entry with kind "particle"`)
        if (isStr(e.hanzi)) { if (hanzi.has(e.hanzi)) err(`${at}: two options are written ${e.hanzi}`); hanzi.add(e.hanzi) }
      }
      const wrong = (opts as string[]).filter(o => o !== c.answer)
      const why = isObj(c.why) ? c.why : null
      if (!why) err(`${at}: "why" is required: one short reason for every wrong option`)
      else {
        for (const w of wrong) if (!isStr(why[w])) err(`${at}: why["${w}"] is missing: say why ${w} does not fit here`)
        else if ((why[w] as string).length > LIMITS.why) err(`${at}: why["${w}"] is ${(why[w] as string).length} chars, max ${LIMITS.why}`)
        for (const k of Object.keys(why)) if (!wrong.includes(k)) err(`${at}: why["${k}"] is not a wrong option of this question`)
      }
    }
    if (isStr(c.answer) && !byId.has(c.answer)) err(`${at}: answer "${c.answer}" is not an entry id in words.json`)
    checkProvenance(at, c, true)
    if (isObj(c.review) && c.review.status !== 'human-reviewed') warn(`${at}: not yet reviewed by a person (status "${String(c.review.status)}"): a Mandarin teacher must check that only the answer fits and every wrong option really does not`)
  })
  // particles need authored sentences to be taught in context
  if (Array.isArray(words) && Array.isArray(cloze)) for (const [id, w] of byId) {
    if (w.kind !== 'particle') continue
    if (!cloze.some(c => isObj(c) && c.answer === id)) warn(`words.json (${String(w.hanzi)}): particle without any sentence question in cloze.json; it can only be asked what it does`)
  }
  return { errors, warnings }
}

/** Everything that has not been checked by a person yet, for the "needs review" report. */
export function needsReview(words: unknown, explanations: unknown, cloze: unknown = []) {
  const out = { words: [] as string[], examples: [] as string[], cloze: [] as string[] }
  const ok = (r: unknown) => isObj(r) && r.status === 'human-reviewed'
  if (Array.isArray(words)) for (const w of words) if (isObj(w) && !ok(w.review)) out.words.push(`${String(w.id ?? w.hanzi)} ${String(w.pinyin)} (${String(w.meaning)})`)
  if (isObj(explanations)) for (const [k, ex] of Object.entries(explanations)) if (isObj(ex) && Array.isArray(ex.sections)) for (const sec of ex.sections) if (isObj(sec) && sec.type === 'examples' && Array.isArray(sec.items)) for (const e of sec.items) if (isObj(e) && !ok(e.review)) out.examples.push(`${k}: ${String(e.zh)}`)
  if (Array.isArray(cloze)) for (const c of cloze) if (isObj(c) && !ok(c.review)) out.cloze.push(`${String(c.id)}: ${String(c.zh)}`)
  return out
}
