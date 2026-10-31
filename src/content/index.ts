import explanationsJson from './explanations.json' with { type: 'json' }
import clozeJson from './cloze.json' with { type: 'json' }
import sourcesJson from './sources.json' with { type: 'json' }
import type { ClozeItem, Explanation, Explanations, Sources } from './types.ts'

export const EXPLANATIONS = explanationsJson as unknown as Explanations
export const CLOZE = clozeJson as unknown as ClozeItem[]
export const SOURCES = sourcesJson as unknown as Sources
/** Explanations are keyed by entry id (the hanzi, unless the entry declares another id). */
export const getExplanation = (id: string): Explanation | undefined => EXPLANATIONS[id]
export const hasExplanation = (id: string) => id in EXPLANATIONS
export type { Explanation, Section, Part, Example, ClozeItem, Review, SourceRef, SourceInfo, Word, WordKind, SpeechChange, RawWord } from './types.ts'
