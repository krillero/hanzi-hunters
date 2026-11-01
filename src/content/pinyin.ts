// Pinyin helpers for the content validator and the question engine. Pure (no DOM).
//
// Dictionary pinyin in this project is written with tone marks and standard spacing, e.g. "nǐ hǎo", "péngyou", "māma", "xuéxiào".
// A syllable WITHOUT a tone mark is neutral tone ("ma", "de", the second syllable of "péngyou") — but only when the entry says so
// (`neutral`), so a forgotten tone mark can never be mistaken for a neutral tone. See docs/CONTENT_GUIDE.md.

const MARKS: Record<string, [string, 1 | 2 | 3 | 4]> = {}
for (const [base, marks] of Object.entries({ a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }))
  [...marks].forEach((c, i) => { MARKS[c] = [base, (i + 1) as 1 | 2 | 3 | 4] })

export type Tone = 0 | 1 | 2 | 3 | 4   // 0 = no tone mark
export type Syllable = { text: string; base: string; tone: Tone }

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']
const FINALS = [
  'iang', 'iong', 'uang', 'ueng', 'üan', 'ang', 'eng', 'ing', 'ong', 'iao', 'ian', 'uai', 'uan', 'üe', 'ün', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'in', 'ia', 'ie', 'iu', 'ua', 'uo', 'ui', 'un',
  'er', 'a', 'o', 'e', 'i', 'u', 'ü'
].sort((a, b) => b.length - a.length)

/** Letters of one syllable without its tone mark (ǚ -> ü), and the tone mark found (0 if none; -1 if there is more than one). */
function stripMarks(s: string): { base: string; tone: Tone | -1 } {
  let tone: Tone | -1 = 0, base = ''
  for (const c of s) {
    const m = MARKS[c]
    if (m) { tone = tone === 0 ? m[1] : -1; base += m[0] } else base += c
  }
  return { base, tone }
}

/** Is this the toneless spelling of a plausible syllable? (Permissive: it catches typos, it is not a full syllable table.) */
function validBase(b: string): boolean {
  if (!/^[a-zü]+$/.test(b)) return false
  // j / q / x take the i- and ü-type finals; ü is written u after them (ju, qu, xu, xue, xuan, xun)
  const jqx = /^[jqx](i|ia|ie|iao|iu|ian|in|iang|ing|iong|u|ue|uan|un|ü|üe|üan|ün)$/
  if (/^[jqx]/.test(b)) return jqx.test(b)
  // zero-initial spellings: yi ya ye yao you yan yin yang ying yong yu yue yuan yun, wu wa wo wai wei wan wen wang weng
  if (/^y/.test(b)) return /^y(i|a|e|ao|ou|an|in|ang|ing|ong|u|ue|uan|un)?$/.test(b)
  if (/^w/.test(b)) return /^w(u|a|o|ai|ei|an|en|ang|eng)?$/.test(b)
  if (FINALS.includes(b)) return true   // a, o, e, ai, ei, ao, ou, an, en, ang, eng, er ... (no initial)
  for (const ini of INITIALS) if (b.startsWith(ini) && FINALS.includes(b.slice(ini.length))) return true
  return false
}

/** Splits "xuéxiào" -> [xué, xiào]. Separators (space, apostrophe, hyphen) end a syllable. Returns null if it cannot be split. */
export function splitSyllables(pinyin: string): Syllable[] | null {
  const out: Syllable[] = []
  for (const chunk of pinyin.normalize('NFC').toLowerCase().split(/[\s'’\-]+/).filter(Boolean)) {
    const parts = segment([...chunk])
    if (!parts) return null
    out.push(...parts)
  }
  return out.length ? out : null
}

function segment(chars: string[]): Syllable[] | null {
  if (!chars.length) return []
  // try the longest syllable first, then shorter ones (backtracking)
  for (let len = chars.length; len >= 1; len--) {
    const text = chars.slice(0, len).join('')
    const { base, tone } = stripMarks(text)
    if (tone === -1 || !validBase(base)) continue
    const rest = segment(chars.slice(len))
    if (rest) return [{ text, base, tone: tone as Tone }, ...rest]
  }
  return null
}

export type PinyinCheck = { ok: boolean; problems: string[]; syllables: Syllable[] }

/**
 * Checks one entry's dictionary pinyin.
 * `neutral` = 1-based positions of syllables that are really neutral tone. Unmarked syllables must be listed there; listed syllables must be unmarked.
 * With `strictNeutral = false` (variants, speech forms and wrong readings, which may have their own tones) only spelling and tone-mark sanity are checked.
 */
export function checkPinyin(pinyin: string, neutral: number[] = [], strictNeutral = true): PinyinCheck {
  const problems: string[] = []
  if (pinyin !== pinyin.normalize('NFC')) problems.push('pinyin must be NFC-normalised (precomposed tone marks)')
  if (/[a-zA-Zü][1-5]\b/.test(pinyin)) problems.push(`"${pinyin}" uses tone numbers; write tone marks (ta1 -> tā)`)
  if (pinyin !== pinyin.toLowerCase()) problems.push('pinyin must be lowercase')
  if (/[^a-zA-Zü\s'’\-āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(pinyin)) problems.push(`"${pinyin}" contains characters that do not belong in pinyin (use letters with tone marks, spaces and apostrophes only)`)
  if (problems.length) return { ok: false, problems, syllables: [] }
  const syl = splitSyllables(pinyin)
  if (!syl) return { ok: false, problems: [`"${pinyin}" cannot be split into pinyin syllables (check spelling; use an apostrophe or space where it is ambiguous, e.g. xī'ān)`], syllables: [] }
  if (strictNeutral) syl.forEach((s, i) => {
    const pos = i + 1, isNeutral = neutral.includes(pos)
    if (s.tone === 0 && !isNeutral) problems.push(`syllable ${pos} "${s.text}" has no tone mark: add the tone mark, or list ${pos} in "neutral" if it really is neutral tone`)
    if (s.tone !== 0 && isNeutral) problems.push(`syllable ${pos} "${s.text}" is listed as neutral but has a tone mark`)
  })
  if (strictNeutral) for (const n of neutral) if (!Number.isInteger(n) || n < 1 || n > syl.length) problems.push(`neutral position ${String(n)} is outside 1-${syl.length}`)
  return { ok: problems.length === 0, problems, syllables: syl }
}

export const syllableCount = (pinyin: string) => splitSyllables(pinyin)?.length ?? 0

/** Sound identity for "do these two sound the same?": letters and tone marks, no spacing, apostrophes or case. */
const soundKeys = new Map<string, string>()   // pure and called very often while building questions: cached
export const soundKey = (pinyin: string) => { let k = soundKeys.get(pinyin); if (k === undefined) { k = pinyin.normalize('NFC').toLowerCase().replace(/[\s'’\-]+/g, ''); soundKeys.set(pinyin, k) } return k }

const TONES: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }
/** The three other tones of a ONE-syllable pinyin with a tone mark, e.g. shān -> shán, shǎn, shàn. Empty for anything else (multi-syllable, neutral). */
export function toneVariants(pinyin: string): string[] {
  const syl = splitSyllables(pinyin)
  if (!syl || syl.length !== 1 || syl[0].tone === 0) return []
  const chars = [...syl[0].text]
  const idx = chars.findIndex(c => MARKS[c])
  const [base, tone] = MARKS[chars[idx]]
  return [1, 2, 3, 4].filter(t => t !== tone).map(t => chars.map((c, i) => (i === idx ? TONES[base][t - 1] : c)).join(''))
}
