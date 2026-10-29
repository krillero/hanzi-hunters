// Shape of src/content/explanations.json. Rules and examples: docs/CONTENT_GUIDE.md

/** One character (or component) with its sound and meaning. Used by `breakdown` and `compare` sections. */
export type Part = { char: string; pinyin?: string; meaning: string; note?: string }
export type Example = { zh: string; pinyin: string; en: string }

export type Section =
  | { type: 'text'; heading?: string; body: string }
  | { type: 'tips'; heading?: string; items: string[] }
  | { type: 'breakdown'; heading?: string; intro?: string; parts: Part[] }
  | { type: 'compare'; heading?: string; intro?: string; items: Part[] }
  | { type: 'examples'; heading?: string; items: Example[] }

export type Explanation = {
  /** Popup title. Defaults to "About <hanzi>". */
  title?: string
  /** One or two sentences: the key idea. Always shown first. */
  summary: string
  sections: Section[]
  /** Other vocabulary hanzi to link to (shown as buttons; opens their explanation if they have one). */
  related?: string[]
}

export type Explanations = Record<string, Explanation>
