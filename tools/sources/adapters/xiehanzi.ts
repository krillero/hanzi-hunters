// Field profile for Anki-xiehanzi decks (https://github.com/krmanik/Anki-xiehanzi), read through the generic Anki adapter.
// Fields: Simplified, Traditional, Pinyin, Zhuyin, PartOfSpeech, SimpleMeaning, Definitions, Breakdown, Radical, HskLevel,
// Frequency, Examples, Audio. Several fields are HTML built by the deck's generator; they are parsed by structure (CSS classes),
// never by stripping everything into one string, and never by running anything. The raw fields stay verbatim in the record.
//
//   SimpleMeaning  -> candidate.meanings (the "Common Meaning" heading removed); empty -> meaningMissing, meanings []
//   Definitions    -> candidate.definitions: one block per reading, senses in the source's order, measure words kept
//   PartOfSpeech   -> candidate.pos (+ posDominant)
//   Examples       -> separate sentences (Chinese, pinyin, English), never linked to an entry by the importer
//   Frequency, HskLevel -> candidate.meta (evidence only)
import { splitSyllables } from '../../../src/content/pinyin.ts'
import type { Candidate, DefinitionBlock } from '../../../src/sources/types.ts'
import type { AnkiProfile, ProfileParse } from './anki.ts'

// ---- a minimal HTML reader: elements, classes, text. Unknown markup becomes text-free elements; scripts are never run. -------
export type HtmlNode = { tag: string; cls: string[]; children: (HtmlNode | string)[] }
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => ENT[e.toLowerCase()] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m))
const VOID = new Set(['br', 'img', 'hr', 'meta', 'input', 'wbr'])
export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: '#root', cls: [], children: [] }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)|</g
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[4] !== undefined) { top.children.push(decode(m[4])); continue }
    if (!m[2]) continue
    const tag = m[2].toLowerCase()
    if (m[1]) { const i = stack.map(n => n.tag).lastIndexOf(tag); if (i > 0) stack.length = i; continue }
    const cls = (m[3].match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/)?.slice(1).find(x => x !== undefined) ?? '').split(/\s+/).filter(Boolean)
    const node: HtmlNode = { tag, cls, children: [] }
    top.children.push(node)
    if (tag === 'script' || tag === 'style') { stack.push(node); continue }   // content kept out of text below
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(node)
  }
  return root
}
export function findAll(n: HtmlNode, cls: string): HtmlNode[] {
  const out: HtmlNode[] = []
  const walk = (x: HtmlNode) => { for (const c of x.children) if (typeof c !== 'string') { if (c.cls.includes(cls)) out.push(c); walk(c) } }
  walk(n)
  return out
}
/** Text of a node; `<br>` becomes "\n"; elements whose class is in `skip` are left out; scripts/styles never contribute. */
export function textOf(n: HtmlNode, skip: string[] = []): string {
  let s = ''
  for (const c of n.children) {
    if (typeof c === 'string') s += c
    else if (c.tag === 'br') s += '\n'
    else if (c.tag !== 'script' && c.tag !== 'style' && !c.cls.some(k => skip.includes(k))) s += textOf(c, skip)
  }
  return s
}
const tidy = (s: string) => s.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim()
/** Unicode-normalised pinyin: NFC (tone marks kept as precomposed letters), single spaces, case kept. */
export const normPinyin = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()

/** "yuan [unit of Chinese currency]; dollar" -> two items; separators inside brackets or parentheses are kept. */
export function splitTopLevel(s: string, sep = ';'): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if ('[(（'.includes(ch)) depth++
    if (')]）'.includes(ch)) depth = Math.max(0, depth - 1)
    if (ch === sep && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map(x => x.trim()).filter(Boolean)
}

export function parseDefinitions(html: string): DefinitionBlock[] {
  return findAll(parseHtml(html), 'meaning-container').map(c => {
    const reading = normPinyin(textOf(findAll(c, 'pinyin')[0] ?? { tag: '', cls: [], children: [] }))
    const zh = tidy(textOf(findAll(c, 'zhuyin')[0] ?? { tag: '', cls: [], children: [] }))
    const m = findAll(c, 'meaning')[0]
    const senses = m ? textOf(m, ['def-num', 'cl-row']).split('\n').map(tidy).filter(Boolean) : []
    const classifiers = findAll(c, 'cl-chip').map(ch => {
      const simp = findAll(ch, 'cl-simp')[0], pin = findAll(ch, 'cl-pin')[0]
      return { form: simp ? tidy(textOf(simp)).replace(/^\//, '') : tidy(textOf(ch, ['cl-simp', 'cl-pin'])), ...(pin ? { reading: tidy(textOf(pin)) } : {}) }
    })
    return { reading, ...(zh ? { zhuyin: zh } : {}), senses, ...(classifiers.length ? { classifiers } : {}) }
  })
}

export function parseExamples(html: string): { zh: string; pinyin?: string; en: string }[] {
  return findAll(parseHtml(html), 'example-item').map(it => {
    const part = (k: string) => { const n = findAll(it, k)[0]; return n ? textOf(n) : '' }
    const pinyin = normPinyin(part('example-pinyin'))
    return { zh: part('example-sim').replace(/\s+/g, '').trim(), ...(pinyin ? { pinyin } : {}), en: tidy(part('example-translation')) }
  })
}

const ONLY_HAN = /^\p{Script=Han}+$/u
export function parseXiehanzi(f: Record<string, string>, issues: string[]): ProfileParse {
  const flags: string[] = []
  const simplified = tidy(f.Simplified ?? '').replace(/\s+/g, '')
  if (!simplified) issues.push('missing-field: Simplified is empty')
  const trad = tidy(f.Traditional ?? '').replace(/[〔〕\s]/g, '')
  const reading = normPinyin(f.Pinyin ?? '')
  if (!reading) issues.push('missing-field: Pinyin is empty')
  else {
    const syl = splitSyllables(reading.toLowerCase().replace(/\s+/g, ''))
    const n = [...simplified].length
    if (!syl) issues.push(`parse: reading "${reading}" is not plain tone-marked pinyin`)
    else if (syl.length !== n) {
      if (simplified.endsWith('儿') && syl.length === n - 1) { issues.push(`source-data: declared reading "${reading}" has no erhua r for ${simplified}`); flags.push('erhua', 'reading-incomplete') }
      else issues.push(`source-data: declared reading "${reading}" has ${syl.length} syllables for ${n} characters`)
    }
    if (/^\p{Lu}/u.test(reading)) flags.push('reading-capitalised')
  }
  // Short meaning: the "Common Meaning" heading is presentation, not meaning.
  const smRaw = f.SimpleMeaning ?? ''
  const smNode = findAll(parseHtml(smRaw), 'simple-content')[0]
  const short = smNode ? tidy(textOf(smNode)) : ''
  if (smRaw.trim() && !smNode) issues.push('parse: SimpleMeaning has no simple-content element')
  const meanings = short ? splitTopLevel(short) : []
  const posNodes = findAll(parseHtml(f.PartOfSpeech ?? ''), 'pos-chip')
  const pos = posNodes.map(n => tidy(textOf(n))).filter(Boolean)
  const dominant = posNodes.find(n => n.cls.includes('pos-dominant'))
  const definitions = parseDefinitions(f.Definitions ?? '')
  if ((f.Definitions ?? '').trim() && !definitions.length) issues.push('parse: Definitions has no meaning-container')
  const readingsInDefs = new Set(definitions.map(d => d.reading.toLowerCase()))
  if (readingsInDefs.size > 1) flags.push('definitions-several-readings')
  if (reading && definitions.length && !definitions.some(d => d.reading === reading)) issues.push(`source-data: declared reading "${reading}" is not one of the readings in Definitions (${definitions.map(d => d.reading).join(', ')})`)
  const sentences = parseExamples(f.Examples ?? '')
  if ((f.Examples ?? '').trim() && !sentences.length) issues.push('parse: Examples has no example-item')
  for (const [i, x] of sentences.entries()) if (!x.zh || !x.en) issues.push(`parse: example ${i + 1} lacks Chinese or translation`)
  const level = tidy(f.HskLevel ?? ''), frequency = tidy(f.Frequency ?? '')
  if (!level) issues.push('source-data: HskLevel is empty although the note is in the HSK 1 deck')
  const n = [...simplified].length
  if (n > 8) flags.push('too-long'); else if (n > 4) flags.push('long')
  if (simplified && !ONLY_HAN.test(simplified)) flags.push('pattern')
  if (!short) flags.push('no-short-meaning')
  if (!sentences.length) flags.push('no-examples')
  const candidate: Candidate = {
    simplified: simplified ? [simplified] : [], traditional: trad ? [trad] : [], readings: reading ? [reading] : [], pos, meanings, variants: [], flags,
    ...(short ? {} : { meaningMissing: true }), definitions, ...(dominant ? { posDominant: tidy(textOf(dominant)) } : {}),
    meta: { level: level || '(empty)', frequency: frequency || '(empty)' }
  }
  return { candidate, sentences, placement: { course: 'New HSK (2025)', part: 'HSK 1', label: `HSK 1 deck · frequency ${frequency || 'not given'}` } }
}

export const XIEHANZI_HSK1: AnkiProfile = {
  deck: 'Anki xiehanzi::New HSK (2025)::HSK 1',
  keyFrom: 'guid',
  requiredFields: ['Simplified', 'Traditional', 'Pinyin', 'Zhuyin', 'PartOfSpeech', 'SimpleMeaning', 'Definitions', 'Breakdown', 'Radical', 'HskLevel', 'Frequency', 'Examples', 'Audio'],
  parse: parseXiehanzi,
  decodeAudio: true,
  origin: { status: 'unknown', note: 'The package credits audio-cmn (CC BY-SA), the Shtooka / University of Caen collection and gTTS text-to-speech (for missing files) without saying which file comes from where. Not assumed to be a human recording.' }
}
