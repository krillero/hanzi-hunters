// Human-readable provenance: review labels and the list of sources actually used by the shipped content. Pure.
import type { ClozeItem, Explanations, Review, SourceRef, Sources, Word } from './types.ts'

export function reviewLabel(r?: Review): string {
  if (!r) return 'Not reviewed by a person'
  if (r.status === 'human-reviewed') return `Reviewed by ${r.reviewer ?? 'a reviewer'}${r.date ? `, ${r.date}` : ''}`
  return r.status === 'imported' ? 'Imported from a dataset · not reviewed by a person' : 'AI draft · not reviewed by a person'
}
export const isHumanReviewed = (r?: Review) => r?.status === 'human-reviewed'

/** Every source name used anywhere in the content, with how many pieces of content cite it. */
export function usedSources(words: Word[], explanations: Explanations, cloze: ClozeItem[]): Map<string, number> {
  const out = new Map<string, number>()
  const add = (refs?: SourceRef[]) => { for (const r of refs ?? []) out.set(r.name, (out.get(r.name) ?? 0) + 1) }
  for (const w of words) add(w.source)
  for (const ex of Object.values(explanations)) {
    add(ex.source)
    for (const s of ex.sections) if (s.type === 'examples') for (const e of s.items) add(e.source)
  }
  for (const c of cloze) add(c.source)
  return out
}

export function reviewCounts(words: Word[], explanations: Explanations, cloze: ClozeItem[]) {
  let examples = 0, examplesReviewed = 0
  for (const ex of Object.values(explanations)) for (const s of ex.sections) if (s.type === 'examples') for (const e of s.items) { examples++; if (isHumanReviewed(e.review)) examplesReviewed++ }
  return {
    entries: words.length, entriesReviewed: words.filter(w => isHumanReviewed(w.review)).length,
    examples, examplesReviewed, cloze: cloze.length, clozeReviewed: cloze.filter(c => isHumanReviewed(c.review)).length
  }
}

export const sourceLine = (ref: SourceRef, sources: Sources) => {
  const info = sources[ref.name]
  return `${info?.title ?? ref.name}${ref.ref ? `: ${ref.ref}` : ''}${ref.retrieved ? ` (retrieved ${ref.retrieved})` : ''}`
}
