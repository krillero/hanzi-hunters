// Content validator for words.json + explanations.json. Pure (no DOM / fs) so tests, the CLI and
// other tools can all use it. Rules are documented in docs/CONTENT_GUIDE.md.
import { toneVariants } from '../game/questions.ts'

export type Issues = { errors: string[]; warnings: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const HAN = /\p{Script=Han}/u
const hanChars = (s: string) => [...s].filter(c => HAN.test(c))
const hasToneNumber = (s: string) => /[a-zA-ZüÜ][1-5]\b/.test(s)

export const LIMITS = { summary: 300, heading: 50, body: 700, tip: 260, note: 200, items: 6, parts: 6, examples: 4, title: 60 }

export function validateContent(words: unknown, explanations: unknown): Issues {
  const errors: string[] = [], warnings: string[] = []
  const err = (m: string) => errors.push(m), warn = (m: string) => warnings.push(m)

  // ---- words.json -------------------------------------------------------------------------
  const vocab = new Set<string>()
  if (!Array.isArray(words)) err('words.json: must be an array of word objects')
  else {
    const allowed = new Set(['hanzi', 'pinyin', 'meaning', 'group', 'note', 'alt', 'confusable', 'lookalike'])
    words.forEach((w, i) => {
      const at = `words.json[${i}]${isObj(w) && isStr(w.hanzi) ? ` (${w.hanzi})` : ''}`
      if (!isObj(w)) return err(`${at}: must be an object`)
      for (const k of Object.keys(w)) if (!allowed.has(k)) err(`${at}: unknown field "${k}" (allowed: ${[...allowed].join(', ')})`)
      for (const k of ['hanzi', 'pinyin', 'meaning', 'group', 'note']) if (!isStr(w[k])) err(`${at}: "${k}" must be a non-empty string`)
      if (isStr(w.hanzi)) {
        if (vocab.has(w.hanzi)) err(`${at}: duplicate hanzi`)
        vocab.add(w.hanzi)
        if (hanChars(w.hanzi).length !== [...w.hanzi].length) err(`${at}: "hanzi" must contain only Chinese characters`)
        if ([...w.hanzi].length > 1) warn(`${at}: multi-character words are not fully supported yet (tone-variant answers only change the first syllable); prefer single characters`)
      }
      if (isStr(w.pinyin)) {
        if (w.pinyin !== w.pinyin.normalize('NFC')) err(`${at}: pinyin must be NFC-normalised (precomposed tone marks)`)
        if (hasToneNumber(w.pinyin)) err(`${at}: pinyin "${w.pinyin}" uses tone numbers; write tone marks (ta1 -> tā)`)
        else if (toneVariants(w.pinyin).length !== 3) err(`${at}: pinyin "${w.pinyin}" needs one tone mark (neutral-tone syllables are not supported yet)`)
        if (w.pinyin !== w.pinyin.toLowerCase()) err(`${at}: pinyin must be lowercase`)
      }
      if (isStr(w.meaning) && w.meaning.length > 40) warn(`${at}: meaning is long (${w.meaning.length} chars); it must fit an answer button`)
      for (const k of ['alt', 'confusable', 'lookalike'] as const) if (w[k] !== undefined && !(Array.isArray(w[k]) && (w[k] as unknown[]).every(isStr))) err(`${at}: "${k}" must be an array of strings`)
    })
    words.forEach((w, i) => {
      if (isObj(w) && Array.isArray(w.confusable)) for (const c of w.confusable) if (isStr(c) && !vocab.has(c)) err(`words.json[${i}] (${w.hanzi}): confusable "${c}" is not a word in the list`)
      if (isObj(w) && Array.isArray(w.lookalike)) for (const c of w.lookalike) {
        if (isStr(c) && !vocab.has(c)) err(`words.json[${i}] (${w.hanzi}): lookalike "${c}" is not a word in the list`)
        else if (c === w.hanzi) err(`words.json[${i}] (${w.hanzi}): lookalike must not list the word itself`)
      }
    })
  }

  // ---- explanations.json ------------------------------------------------------------------
  if (!isObj(explanations)) { err('explanations.json: must be an object keyed by hanzi'); return { errors, warnings } }
  const known = new Set<string>([...vocab])
  for (const [key, ex] of Object.entries(explanations)) {
    const at = `explanations.json["${key}"]`
    if (!vocab.has(key)) err(`${at}: key is not a word in words.json (add the word first, or fix the key)`)
    if (!isObj(ex)) { err(`${at}: must be an object`); continue }
    for (const k of Object.keys(ex)) if (!['title', 'summary', 'sections', 'related'].includes(k)) err(`${at}: unknown field "${k}" (allowed: title, summary, sections, related)`)
    if (ex.title !== undefined && (!isStr(ex.title) || ex.title.length > LIMITS.title)) err(`${at}.title: must be a string up to ${LIMITS.title} chars`)
    if (!isStr(ex.summary)) err(`${at}.summary: required non-empty string`)
    else if (ex.summary.length > LIMITS.summary) err(`${at}.summary: ${ex.summary.length} chars, max ${LIMITS.summary}`)
    if (!Array.isArray(ex.sections) || ex.sections.length === 0) err(`${at}.sections: must be a non-empty array`)
    else ex.sections.forEach((s, i) => checkSection(`${at}.sections[${i}]`, s))
    if (ex.related !== undefined) {
      if (!Array.isArray(ex.related)) err(`${at}.related: must be an array of hanzi`)
      else for (const r of ex.related) {
        if (!isStr(r) || !vocab.has(r)) err(`${at}.related: "${String(r)}" is not a word in words.json`)
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
    if (!isStr(p.char) || [...p.char].length > 2) err(`${at}.char: required, one character (or a radical)`)
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
          if (!isObj(e)) return err(`${at}.items[${i}]: must be { zh, pinyin, en }`)
          for (const k of Object.keys(e)) if (!['zh', 'pinyin', 'en'].includes(k)) err(`${at}.items[${i}]: unknown field "${k}"`)
          checkText(`${at}.items[${i}].zh`, e.zh, 80); checkText(`${at}.items[${i}].pinyin`, e.pinyin, 160); checkText(`${at}.items[${i}].en`, e.en, 160)
          if (isStr(e.pinyin) && hasToneNumber(e.pinyin)) err(`${at}.items[${i}].pinyin: use tone marks, not numbers`)
        })
        break
      default: err(`${at}.type: "${String(type)}" is not one of text, tips, breakdown, compare, examples`)
    }
  }
  return { errors, warnings }
}
