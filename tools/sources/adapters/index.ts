// Source adapters by type (the "adapter" field of a source in src/content/sources.json). To add a source type: write a function
// that returns a SourceBundle (src/sources/types.ts) and register it here. See docs/SOURCES.md, "Adding a source adapter".
import type { SourceBundle } from '../../../src/sources/types.ts'
import { readAnkiPackage } from './anki.ts'
import { readSentencesJson } from './sentencesJson.ts'

export type AdapterInput = { source: string; file: string; mediaDir: string; mediaPrefix: string; retrieved?: string }
export const ADAPTERS: Record<string, (i: AdapterInput) => SourceBundle> = {
  'anki-apkg': i => readAnkiPackage(i),
  'sentences-json': i => readSentencesJson(i)
}
