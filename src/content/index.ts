import explanationsJson from './explanations.json' with { type: 'json' }
import type { Explanation, Explanations } from './types.ts'

export const EXPLANATIONS = explanationsJson as unknown as Explanations
export const getExplanation = (hanzi: string): Explanation | undefined => EXPLANATIONS[hanzi]
export const hasExplanation = (hanzi: string) => hanzi in EXPLANATIONS
export type { Explanation, Section, Part, Example } from './types.ts'
