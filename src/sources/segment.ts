// Which known words a Chinese sentence contains: greedy longest match against a word list. A REVIEW AID for example assessments
// (prefilled "contains" / "prerequisites", which the assessor checks); never used to link content to entries automatically,
// because a character inside a word is not an occurrence of the standalone word (see docs/SOURCES.md, links).
const HAN = /\p{Script=Han}/u
export function segmentKnown(zh: string, forms: Set<string>, maxLen = 6): { known: string[]; unknown: string[] } {
  const known: string[] = [], unknown: string[] = []
  const chars = [...zh]
  for (let i = 0; i < chars.length;) {
    if (!HAN.test(chars[i])) { i++; continue }
    let hit = ''
    for (let n = Math.min(maxLen, chars.length - i); n >= 1; n--) { const w = chars.slice(i, i + n).join(''); if (forms.has(w)) { hit = w; break } }
    if (hit) { known.push(hit); i += [...hit].length } else { unknown.push(chars[i]); i++ }
  }
  return { known: [...new Set(known)], unknown: [...new Set(unknown)] }
}
