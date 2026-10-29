# Content guide: adding words and explanations

For people **and other coding agents**. All learning content is plain JSON in `src/content/`.
No code changes are needed to add words or explanations.

| File | What it holds |
|---|---|
| `src/content/words.json` | The vocabulary: one object per word. **Order matters** (earlier words are introduced first). |
| `src/content/explanations.json` | Optional "more about this word" popups, keyed by hanzi. |
| `src/content/types.ts` | TypeScript shapes for the above (reference only). |
| `src/content/validate.ts` | The rules the validator enforces. |

## The 3-step loop

```bash
npm run validate:content   # checks words.json + explanations.json, prints precise errors/warnings
npm test                   # also validates, plus game-logic tests (must stay green)
npm run dev                # then open  http://localhost:5173/?word=她  to preview a word
```

`?word=<hanzi>` forces that word as the first question of the session; add `&kind=<kind>` to force a question type
(`meaning`, `pinyin`, `character`, `listen`, `meaning2pinyin`, `pinyin2char`, `listen2meaning`, `listen2pinyin`, `homophone`, `lookalike`; the game still
falls back to a normal question if the kind is not possible for that word). The word is treated as already known, so give it a save with
some mastery, or just play a few questions first. Answer (wrongly, to see the pulsing 💡 button)
and open the popup. Remove the parameter to play normally. Always run the validator before committing.

---

## 1. Adding a word (`words.json`)

Append an object (or insert it where it should be taught; earlier = introduced earlier):

```json
{
  "hanzi": "马",
  "pinyin": "mǎ",
  "meaning": "horse",
  "group": "animals",
  "note": "Third tone: the pitch dips low. 马 is a picture of a horse’s mane and legs."
}
```

| Field | Required | Rules |
|---|---|---|
| `hanzi` | yes | **One simplified Chinese character**, unique in the file. (Multi-character words are not fully supported yet.) |
| `pinyin` | yes | Lowercase, **tone mark on the vowel** (`mǎ`), never tone numbers (`ma3`). Must contain exactly one tone mark: **neutral-tone syllables (`ma`, `de`) are not supported yet**. Use precomposed characters (the validator checks NFC). |
| `meaning` | yes | Short English gloss that fits an answer button (aim ≤ 24 chars). Use `" / "` for two senses: `"sun / day"`. |
| `group` | yes | Family used to pick *plausible wrong answers*. Reuse an existing group where it fits: `people`, `nature`, `number`, `size`, `body`, `place`, `grammar`; invent a new lowercase one (`animals`) if none fits. |
| `note` | yes | 1–2 sentences shown after answering. Teach, never shame. Pronunciation tip, tone tip, or usage hint. Plain text. |
| `alt` | no | Other **valid readings in context** (tone change) so they are never offered as a wrong pinyin option. e.g. `不`: `["bú"]`, `一`: `["yí","yì"]`. |
| `confusable` | no | Hanzi (from this list) whose meaning is too close to be a fair wrong answer, e.g. `中` ↔ `国`. List both directions. |
| `lookalike` | no | Hanzi (from this list) that **look** similar to this one, e.g. `日` → `["月","口"]`, `大` → `["人","天"]`. Used for "These look alike. Which one means …?" questions. The relation is applied in both directions, so listing it once is enough. Only list pairs a beginner really mixes up by shape (not same-meaning or same-sound words). |

**What the game builds from this data** (nothing extra to write):
meaning/pinyin/character/listening questions at every mastery level (see `docs/GAME_DESIGN.md`), and a **homophone question**
for every pair with exactly the same pinyin, e.g. 木/目 (mù): "Same sound! Which character is “mù” and means “eye”?". Sound-only
questions (listen → character, pinyin → character, listen → meaning) are never used for a word whose homophone partner the learner
already knows, because the sound alone would be ambiguous; the meaning cue is used instead.
Wrong answers are drawn from words the learner has already met.

**Meaning overlap is handled automatically.** Words that share a gloss part (`"sun / day"` and `"sky / day"` both contain "day") are
never shown as wrong answers for each other. Homophones (same pinyin, like 他/她) are never offered together in listening questions.

Nothing else to do: questions at every mastery level, distractors and the word pool are generated from this data.
Keep at least ~8 words in the file (4 options per question need enough variety).

## 2. Adding an explanation (`explanations.json`)

Explanations are **optional** and only for words that need more than the one-line `note`: look-alikes, homophones,
characters built from reusable parts (radicals/components), tone changes, usage traps.

Where it appears: a pulsing 💡 button in the answer recap (after a wrong answer) and in the Wordbook. The popup opens the
explanation for that word; its `related` buttons jump to other explained words.

### Format

```json
{
  "他": {
    "title": "他 (he) vs 她 (she)",
    "summary": "One or two sentences with the key idea.",
    "sections": [ /* one or more blocks, in display order */ ],
    "related": ["她", "人"]
  }
}
```

| Field | Required | Notes |
|---|---|---|
| key (`"他"`) | yes | A hanzi that exists in `words.json`. |
| `title` | no | ≤ 60 chars. Default: `About <hanzi>`. |
| `summary` | yes | ≤ 300 chars. Shown first, highlighted. |
| `sections` | yes | 1+ blocks from the table below. |
| `related` | no | Other **vocabulary hanzi**. Shown as buttons; clickable only if that word also has an explanation. Don't list the word itself. |

### Section block types (`"type"` picks the layout)

| `type` | Fields | Use for |
|---|---|---|
| `text` | `heading?`, `body` (≤ 700) | A short paragraph: background, usage note, “good to know”. |
| `tips` | `heading?`, `items` (1–6 strings, each ≤ 260) | Memory aids and tricks, shown as 💡 cards. |
| `breakdown` | `heading?`, `intro?`, `parts` (1–6) | “Built from A + B”: shows parts joined with “+”. |
| `compare` | `heading?`, `intro?`, `items` (1–6) | Side-by-side look-alikes (他 vs 她). |
| `examples` | `heading?`, `items` (1–4: `{zh, pinyin, en}`) | Sentences. |

`parts` / `items` of `breakdown` and `compare` are **part objects**: `{ "char": "女", "pinyin": "nǚ", "meaning": "woman", "note": "optional, ≤ 200" }`
(`pinyin` and `note` optional; `char` may be a radical like `亻` that is not a vocabulary word).
Example items: `{ "zh": "她是女人。", "pinyin": "Tā shì nǚrén.", "en": "She is a woman." }`.
`heading` ≤ 50 chars. Unknown fields are errors, so typos are caught.

### Patterns worth copying

* **Look-alike / homophone pair** (他, 她): a `compare` block, then `tips` on what to look at, then `examples`. Add the same explanation for both words, with `related` pointing at each other.
* **Built from reusable parts** (好 = 女 + 子; 她 = 女 + 也): a `breakdown` block. Mention where else the part appears; this is where the learner gets leverage.
* **Tone change** (不 bù → bú): a `text` block with the rule + an `examples` block.
* See the three shipped entries (`他`, `她`, `好`) for complete, working examples.

### Writing rules (important)

1. **Be accurate.** If you are not sure, leave it out. A qualified Mandarin speaker should review new content before release.
2. **Never present folk etymology as fact.** Memory stories are fine, but say “memory aid” / “not the real history” (see 她, 好).
3. **Beginner level.** Short sentences, no linguistics jargon without a one-line explanation.
4. **Tone marks, not numbers**, in every `pinyin` field (`Tā`, not `Ta1`). Sentence pinyin starts with a capital and uses normal word spacing/punctuation.
5. **Prefer vocabulary characters in examples.** Characters outside `words.json` only produce a *warning* (fine for radicals/parts like 亻 and 也, but avoid them in example sentences where possible).
6. **Teach, don’t shame.** Wrong answers between look-alikes are normal; say so.
7. **Keep it short.** The popup is read on a phone. 2–4 sections is plenty.
8. Plain text only (no markdown, HTML or emoji in the JSON; the UI adds its own icons).

### Checklist before you finish

- [ ] `npm run validate:content` shows **0 errors** (read the warnings and justify or fix them).
- [ ] `npm test` is green.
- [ ] Opened `/?word=<hanzi>` and looked at the popup on a phone-sized window.
- [ ] Pinyin, tones and English meanings double-checked (a human speaker reviews before release).
- [ ] JSON is valid and 2-space indented, keys in a sensible order (title, summary, sections, related).

---

## Copy-paste prompt for another agent

A complete, ready-to-use version lives in `docs/AGENT_PROMPT.md`; the current state of the content is in `docs/content-inventory.json` (regenerate with `npm run inventory`). Short version:

> You are adding learning content to the Hanzi Hunters project. Read `docs/CONTENT_GUIDE.md` first and follow it exactly.
> Edit only `src/content/words.json` and/or `src/content/explanations.json`; do not change code.
> Task: **<describe the task, e.g. “add explanations for 日 and 月 explaining that 日 is a sun shape and 月 a moon shape, why they are
> easy to mix up, and where each appears in other characters”, or “add these 10 words: …”>**.
> Rules: only information you are confident is correct; label memory stories as memory aids; tone marks not numbers;
> simplified characters; keep sections short. When done run `npm run validate:content` and `npm test`, fix every error,
> and report: files changed, each new word/explanation, any warnings you left, and anything you were unsure about so a
> human can check it.

## Not supported yet (do not work around these in JSON)

* Neutral-tone syllables (`ma`, `de`) and multi-syllable words.
* New question types or per-word custom questions (question types come from the mastery level, see `docs/GAME_DESIGN.md`).
* Images/audio in explanations.
* Traditional characters.
