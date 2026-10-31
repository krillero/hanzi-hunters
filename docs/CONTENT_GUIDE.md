# Content guide: words, readings, examples, sentence questions

For people **and other coding agents**. All learning content is plain JSON in `src/content/`.
No code changes are needed to add content. Read this whole file before editing.

| File | What it holds |
|---|---|
| `src/content/words.json` | The vocabulary: one object per **entry** (word, character or grammar particle). **Order matters** (earlier entries are introduced first). |
| `src/content/explanations.json` | Optional "more about this entry" popups, keyed by entry id: explanations, **example sentences**, pronunciation notes. |
| `src/content/cloze.json` | Authored fill-in-the-blank sentence questions for grammar particles. |
| `src/content/sources.json` | Registry of where content comes from (license + attribution for every source name used). |
| `src/content/types.ts` | TypeScript shapes for all of the above (reference). |
| `src/content/validate.ts`, `pinyin.ts` | The rules the validator enforces. |

## The 3-step loop

```bash
npm run validate:content   # checks all four files; prints precise errors/warnings and how much is still unreviewed
npm test                   # also validates, plus game-logic tests (must stay green)
npm run dev                # preview (see "Previewing" below)
```

### Previewing

* `/?word=<id or hanzi>` forces that entry as the first question (it is introduced as a new word). Add `&kind=<kind>` to force a question type
  (`meaning`, `pinyin`, `character`, `listen`, `meaning2pinyin`, `pinyin2char`, `listen2meaning`, `listen2pinyin`, `homophone`, `lookalike`, `particle`);
  the game falls back to a fair question if that kind is not possible for the entry.
* `/?first=朋友,看-look` introduces these entries (ids or hanzi) before everything else, so new content can be played without working up to it.
* Try the popup: answer, then tap the 💡 button, or open the entry from the Wordbook.
* Narrow phone check: use a 320 px wide window; long words, examples and the Wordbook must not scroll sideways.

---

## 1. Entries (`words.json`)

An entry is **one word, character or particle with one meaning and one reading**. The original 50 entries are single characters; new entries can be multi-character words.

### 1.1 Required fields

| Field | Rules |
|---|---|
| `hanzi` | Simplified Chinese characters only, 1 to 8 (aim for 1 to 4, answer buttons are small). The same hanzi may appear in more than one entry only when the readings differ (see 1.5). |
| `pinyin` | **Dictionary pinyin** with tone marks, lowercase, standard word spacing: `"nǐ hǎo"` (two words), `"péngyou"`, `"māma"`, `"xuéxiào"`. Never tone numbers. Use an apostrophe where syllables run together ambiguously (`xī'ān`). Must have exactly as many syllables as `hanzi` has characters (erhua 儿 is not supported yet). |
| `meaning` | Natural English that fits an answer button, aim ≤ 40 chars. `" / "` separates senses: `"mom / mother"`. For particles, a short *functional description* (≤ 80). |
| `group` | Family used to pick plausible wrong answers (`people`, `nature`, `number`, `size`, `body`, `place`, `grammar`, `greetings`, `time`, `verbs` …; make a new lowercase one if none fits). |
| `note` | 1–2 teaching sentences shown after answering. Teach, never shame. |

### 1.2 Optional fields

| Field | Meaning |
|---|---|
| `id` | Stable identity used by saved progress and `explanations.json`. Default: the hanzi. **Required and unique when two entries share a hanzi.** Never change an id that players may already have progress under (see 1.7). |
| `kind` | `"word"` (default for 2+ characters), `"character"` (default for one character; a character taught for its own sake), `"particle"` (grammar word, see 1.6). |
| `neutral` | 1-based positions of **neutral-tone syllables**: `[2]` for 妈妈 *māma*. See 1.3. |
| `variants` | **Accepted alternative pronunciations of the same word and meaning** (谁 *shéi* / *shuí*). Never offered as wrong answers. |
| `speech` | **Connected-speech guidance**, not a dictionary reading: `[{ "pinyin": "ní hǎo", "context": "when two third-tone syllables meet…", "note": "optional" }]`. Never offered as a wrong answer, never the answer. |
| `wrongPinyin` | Reviewed **wrong readings** for pinyin questions (needed for multi-syllable or neutral-tone entries, see 1.4). Must not be a valid reading (the validator checks variants and speech forms). |
| `audio` | `"ok"` (default) or `"none"` (see 1.8). |
| `questions` | Allowlist of question kinds for this entry (see 1.9). |
| `aliases` | Earlier ids of this same entry, so saved progress moves to it (see 1.7). |
| `confusable` | Ids of entries too close in meaning to be a fair wrong answer for this one. |
| `lookalike` | Ids of **same-length** entries that look similar (look-alike questions). Authored only: the game never compares shapes automatically. Not for homographs. |
| `source`, `review` | Where it comes from and whether a person checked it (see section 4). |

### 1.3 Neutral tone vs missing tone marks

Neutral tone is a real tone: the syllable is short and light and **has no tone mark**. To stop a forgotten tone mark from passing as neutral tone, every unmarked syllable must be declared:

```json
{ "hanzi": "吗", "pinyin": "ma", "neutral": [1], "meaning": "…", "group": "grammar", "note": "…" }
{ "hanzi": "朋友", "pinyin": "péngyou", "neutral": [2], "meaning": "friend", "group": "people", "note": "…" }
```

* `pinyin: "péngyou"` without `neutral: [2]` is an **error** ("syllable 2 has no tone mark").
* Listing a syllable that does have a mark (`péngyǒu` with `[2]`) is an **error**.
* Never remove the tone marks of syllables that have a lexical tone. Marked and neutral syllables mix freely, also with `ü` (`nǚ`, `lǜ`, `lüè`).

### 1.4 Pronunciation questions and wrong answers

Wrong pinyin options are **never made by editing tone marks of a multi-syllable word**. For one-syllable entries with a tone (`shān` → `shán shǎn shàn`) the other tones are used. For everything else the options are (a) the entry's `wrongPinyin`, (b) real readings of other entries with the same number of syllables. If there are not enough safe options the game asks a different kind of question instead.

```json
{ "hanzi": "谢谢", "pinyin": "xièxie", "neutral": [2], "wrongPinyin": ["xiéxie", "xiěxie"], "meaning": "thank you / thanks", "group": "greetings", "note": "…" }
```

`wrongPinyin` is *authored and must be reviewed*: each reading must be genuinely wrong for this word and meaning.

### 1.5 One written form, several readings or meanings

Three different situations, three different fields:

| Situation | Example | How to write it |
|---|---|---|
| **Alternate pronunciation of the same word and meaning** | 谁 *shéi* / *shuí* | One entry, `"variants": ["shuí"]`. Both are correct; the questions only offer `shéi` as the answer and never offer `shuí` as a wrong option. |
| **Different readings for different meanings** | 看 *kàn* (look) / 看 *kān* (guard) | **Two entries** with the same `hanzi` and explicit unique `id`s (`"看-look"`, `"看-guard"`), each `"audio": "none"`. Questions about one of them always show the intended meaning (or the reading), exclude the other's meaning from meaning options, and offer the other reading as a wrong pinyin **only when the meaning is on screen**. |
| **Pronunciation changes in connected speech** | 你好 → *ní hǎo*; 不 *bù* → *bú*; 一 *yī* → *yí / yì* | `"speech": [...]` on the one entry. It is guidance shown in the details popup; the dictionary tone stays the entry's tone and is what the questions use. Explain the rule (and that counting/dates keep the dictionary tone) in `context` / `note`. |

### 1.6 Particles (grammar words) and whole-word meanings

Teach words as **whole words**; do not assume a word's meaning is the sum of its characters' meanings (学校 is "school", not "study + school"). For grammar particles, use `kind: "particle"` and a functional description instead of a misleading one-word translation:

```json
{ "hanzi": "吗", "pinyin": "ma", "neutral": [1], "kind": "particle", "audio": "none",
  "meaning": "question particle: ends a yes/no question", "group": "grammar", "note": "Add 吗 to the end of a statement to ask yes or no." }
```

Particles are by default asked only `meaning` ("what does it do?") and, if sentence questions exist for them, `particle` (see section 3). They are never asked pinyin or listening questions.

### 1.7 Ids, aliases and saved progress

Progress is saved **per entry id** (the hanzi unless you set `id`). When content changes, saved progress is carried over and never reset or merged across meanings:

* Existing entries keep their ids (their hanzi), so existing saves keep working.
* **Splitting** a hanzi into several readings (a second 看): keep the old id (`"看"`) on the entry that is the *same meaning as before*, give the new entry a new id. If you want to rename the old one, list the old id in `"aliases"` on **that one entry only**. A new entry never inherits progress it did not earn.
* If both an old id and the new id have progress, the higher level wins.
* Progress that no entry claims (an entry was removed, or a hanzi became ambiguous without an alias) is kept in the save (`legacyMastery`), not deleted, and is retried every time the game loads.
* The validator rejects: duplicate ids, a hanzi shared without explicit ids, an alias that is another entry's id, an alias claimed twice.

### 1.8 Audio (text-to-speech)

The game reads words with the browser's text-to-speech from the written hanzi. A speech engine **cannot be told which reading** to use, so for a hanzi with several readings it may say the wrong one. Therefore:

* Entries that share a hanzi **must** have `"audio": "none"` (enforced). Use `"audio": "none"` for any entry whose spoken reading you do not trust (typically particles).
* For `audio: none` / shared-hanzi entries the speaker button is disabled and **no listening question** is asked.
* Listening questions are also skipped when a word the learner knows sounds the same (homophone or shared variant: 他/她), because sound alone could not decide the answer.
* Example sentences can be read aloud; set `"audio": false` on an example whose reading you do not trust. Speech quality depends on the device's voices; this was not tested on real devices.

### 1.9 Per-entry question eligibility

Not every entry fits every question type. Use `questions` to allow only some kinds (the first exposure, `intro`, is always allowed):

```json
{ "hanzi": "谢谢", …, "questions": ["meaning", "character", "pinyin2char"] }
```

Kinds: `meaning`, `pinyin`, `character`, `listen`, `meaning2pinyin`, `pinyin2char`, `listen2meaning`, `listen2pinyin`, `homophone`, `lookalike`, `particle`. A kind that is allowed but not possible right now (no safe distractors, no audio, no look-alike data) is skipped automatically.

### 1.10 What the game guarantees about questions

* Exactly one correct option, no duplicate option text.
* No wrong option is an accepted variant, a connected-speech form, or (in audio-only questions) another reading of the same hanzi.
* Meanings that overlap (share a gloss or a content word: "look / watch" vs "to look after") are never offered together. Declare more with `confusable`. Written options prefer the same length as the answer.
* Sound-only questions (listen, pinyin → written form, listen → meaning) are only asked when no known entry sounds the same.
* Homophone questions show both the sound and the meaning. 他/她 can never be told apart by sound alone.
* Too few safe distractors → another kind of question.
* This is checked for every shipped entry in `tests/multiword.test.ts` ("audit" test).

---

## 2. Explanations and examples (`explanations.json`)

Optional popups for entries that need more than the one-line `note`: look-alikes, homophones, neutral tones, readings, usage, **example sentences**. Keyed by **entry id**.

```json
{
  "朋友": {
    "title": "朋友 (friend)",
    "summary": "朋友 has a neutral second syllable: péngyou.",
    "sections": [
      { "type": "tips", "heading": "Neutral tone", "items": ["A syllable without a tone mark is neutral tone, not a forgotten mark."] },
      { "type": "examples", "heading": "In a sentence", "items": [
        { "zh": "他是我的朋友。", "pinyin": "Tā shì wǒ de péngyou.", "en": "He is my friend.",
          "note": "Optional usage note, ≤ 200 chars.",
          "source": [{ "name": "ai-draft" }],
          "review": { "status": "ai-draft" } }
      ] }
    ],
    "related": ["谁"],
    "source": [{ "name": "ai-draft" }],
    "review": { "status": "ai-draft" }
  }
}
```

| Field | Notes |
|---|---|
| key | An **entry id** from `words.json`. |
| `title` ≤ 60, `summary` ≤ 300 | `summary` required. |
| `sections` | 1+ blocks, see below. |
| `related` | Other entry ids (buttons in the popup). |
| `source`, `review` | Optional provenance of the explanation as a whole (section 4). |

Section types: `text` (`heading?`, `body` ≤ 700), `tips` (`heading?`, `items` 1–6 ≤ 260), `breakdown` / `compare` (`heading?`, `intro?`, `parts` / `items` 1–6 objects `{ char, pinyin?, meaning, note? }`; `char` may be 1–4 characters), `examples` (`heading?`, `items` 1–4 examples).

**Example fields:** `zh`, `pinyin` (sentence case, standard spacing and punctuation, tone marks), `en` (natural English, not word-for-word), optional `note`, `source`, `review`, and `audio: false` to disable the 🔊 button. The validator warns if the pinyin and the characters have different syllable counts, and if the sentence does not contain the entry it explains.

**What the popup also shows automatically** (nothing to write): dictionary pinyin and a neutral-tone remark, accepted `variants`, other readings of the same hanzi (with a link), the `speech` notes under "In connected speech (guidance, not the dictionary tone)", and an "About this entry" block with kind, review status and sources. Entries without an authored explanation still open this popup from the Wordbook.

### Writing rules (important)

1. **Be accurate.** If you are not sure, leave it out. A qualified Mandarin speaker should review new content before release.
2. **Never present folk etymology as fact.** Memory stories are fine if labelled "memory aid".
3. **Beginner level.** Short sentences, no jargon without a one-line explanation.
4. **Tone marks, not numbers.** Teach whole-word meanings, not sums of character meanings.
5. **Pronunciation changes** (一, 不, 你好): put them under `speech` or in an explanation, and say the dictionary tone is unchanged.
6. **Do not label content "human-reviewed" unless a person reviewed it** (section 4).
7. Plain text only (no markdown, HTML, emoji in the JSON).

---

## 3. Grammar in context: sentence questions (`cloze.json`)

A *particle* question shows an authored sentence with a blank and asks which particle completes it. Everything is written by hand and reviewed; nothing is generated from glosses.

```json
{
  "id": "de-book",
  "answer": "的",
  "zh": "这是我___书。",
  "pinyin": "Zhè shì wǒ ___ shū.",
  "en": "This is my book.",
  "options": ["吗", "的", "了"],
  "why": { "吗": "吗 comes at the end of a yes/no question, not between 我 and 书.",
           "了": "了 marks a finished action or a new situation; it cannot link 我 and 书." },
  "note": "的 joins 我 (the owner) to 书 (the thing).",
  "source": [{ "name": "ai-draft" }],
  "review": { "status": "ai-draft", "note": "Needs a teacher to check." }
}
```

* `answer` and every option are **ids of entries with `kind: "particle"`**. 2–4 distinct options, hanzi distinct.
* `zh` and `pinyin` each contain exactly one blank `___`. `en` gives the intended meaning and is shown to the learner, so only one option fits.
* `why` has one short reason for **every wrong option** (shown when the learner picks it) and nothing else.
* **Make sure only the answer is correct.** The game cannot check Chinese grammar: another particle that also fits the sentence (and the English) must not be an option. A reviewer must confirm this for every item.
* `review` is required. Items start as `ai-draft` and the validator reports them until a person marks them `human-reviewed`.

---

## 4. Sources, licenses and review status

Every piece of content (entry, example, explanation, sentence question) may carry:

```json
"source": [{ "name": "CC-CEDICT", "ref": "朋友 peng2you5", "retrieved": "2026-11-01" }],
"review": { "status": "human-reviewed", "reviewer": "A. Teacher", "date": "2026-11-02", "note": "optional" }
```

* `source[].name` must exist in **`sources.json`**, which stores the title, URL, license and required attribution once. Registered: `ai-draft`, `CC-CEDICT`, `HSK`, `Tatoeba`. Add a source there (with its real license and attribution) before using it.
* **CC-CEDICT / MDBG** (CC BY-SA 4.0): a guide for dictionary meanings and readings. Imported glosses are not automatically good answer buttons or classroom-ready; check sense, register and natural English. Copying or adapting its text carries the attribution and ShareAlike terms.
* **HSK** (official, edition-labelled materials): a guide to *which* beginner words to teach. State the edition in `ref` (e.g. `"HSK 3.0 (2021) level 1"`); HSK 2.0 and 3.0 differ. Do not copy the lists.
* **Tatoeba** (mostly CC BY 2.0 FR, some CC0): community sentences. Review each sentence individually; keep author and sentence number in `ref`.
* `review.status`: `ai-draft` (written by an AI, no person checked it), `imported` (taken from a dataset, no person checked it), `human-reviewed` (**requires `reviewer` and `date`**; only use when a person really reviewed it). A missing `review` counts as unreviewed.
* Attribution is shown in **Settings → Credits & content review**, and per entry in the details popup ("About this entry"). It never appears on answer buttons.
* `npm run validate:content` prints how many entries, examples and sentence questions are not yet reviewed by a person. That list is what a Mandarin teacher should work through.

---

## 5. Copy-paste examples of every entry type

```json
// single character taught for itself (original style; kind defaults to "character")
{ "hanzi": "马", "pinyin": "mǎ", "meaning": "horse", "group": "animals", "note": "Third tone: the pitch dips low." }

// multi-character word, all syllables marked
{ "hanzi": "今天", "pinyin": "jīntiān", "meaning": "today", "group": "time", "note": "Both syllables are first tone." }

// phrase written as two words in pinyin, with a connected-speech note
{ "hanzi": "你好", "pinyin": "nǐ hǎo", "meaning": "hello", "group": "greetings", "note": "…",
  "speech": [{ "pinyin": "ní hǎo", "context": "two third tones meet; the first is said with a rising tone", "note": "The dictionary pinyin keeps the third tone." }] }

// mixed marked and neutral syllables
{ "hanzi": "喜欢", "pinyin": "xǐhuan", "neutral": [2], "meaning": "to like", "group": "feelings", "note": "…", "wrongPinyin": ["xíhuan", "xǐhuán"] }

// accepted pronunciation variants
{ "hanzi": "谁", "pinyin": "shéi", "variants": ["shuí"], "meaning": "who", "group": "questions", "note": "Both readings are normal." }

// same hanzi, two readings and meanings (explicit ids, no audio)
{ "id": "看-look",  "hanzi": "看", "pinyin": "kàn", "meaning": "to look / to watch",     "group": "verbs", "kind": "word", "audio": "none", "note": "…" }
{ "id": "看-guard", "hanzi": "看", "pinyin": "kān", "meaning": "to guard / to look after", "group": "verbs", "kind": "word", "audio": "none", "note": "…" }

// grammar particle, taught by function
{ "hanzi": "的", "pinyin": "de", "neutral": [1], "kind": "particle", "audio": "none",
  "meaning": "links a describing word to a noun (我的书 = my book)", "group": "grammar", "note": "…" }

// with provenance
{ "hanzi": "朋友", "pinyin": "péngyou", "neutral": [2], "meaning": "friend", "group": "people", "note": "…",
  "source": [{ "name": "CC-CEDICT", "ref": "朋友 peng2you5", "retrieved": "2026-11-01" }],
  "review": { "status": "human-reviewed", "reviewer": "A. Teacher", "date": "2026-11-02" } }
```

## Checklist before you finish

- [ ] `npm run validate:content` shows **0 errors**; every warning is read and fixed or justified.
- [ ] `npm test` is green.
- [ ] New entries are **appended** (the order is the teaching order) and existing ids are unchanged.
- [ ] Tone marks and neutral tones double-checked; `wrongPinyin` really are wrong; sentence questions have exactly one fitting answer.
- [ ] Nothing is marked `human-reviewed` unless a person did review it.
- [ ] Opened the entry with `/?word=<id>` (and `&kind=`) in a 320 px wide window.
- [ ] Report what needs Mandarin-teacher review.

---

## Copy-paste prompt for another agent

A complete ready-to-use version lives in `docs/AGENT_PROMPT.md`; the current content is listed in `docs/content-inventory.json` (regenerate with `npm run inventory`). Short version:

> You are adding learning content to the Hanzi Hunters project. Read `docs/CONTENT_GUIDE.md` first and follow it exactly.
> Edit only `src/content/*.json`; do not change code. Task: **<describe the task>**.
> Rules: only information you are confident is correct; tone marks not numbers; neutral tones declared with `neutral`; simplified characters;
> label everything `ai-draft` unless a person reviewed it. When done run `npm run validate:content` and `npm test`, fix every error, and report:
> files changed, each new entry/explanation/sentence question, any warnings you left, and everything a Mandarin teacher must review.

## Not supported yet (do not work around these in JSON)

* Erhua (儿) syllables, and entries longer than 8 characters.
* Automatic generation of grammar questions; only authored `cloze.json` items exist.
* Images or recorded audio (audio is browser text-to-speech only).
* New question types or per-entry custom question formats other than the sentence (particle) question.
* Traditional characters.
