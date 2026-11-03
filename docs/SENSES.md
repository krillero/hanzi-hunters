# One beginner meaning group per entry; other uses later (later step: intent, not implemented)

**Status:** the rule in §1 applies now (owner decision 2026-11-03, clarified the same day: “one beginner meaning group”, replacing
“one meaning”). The later step in §2 is product intent only. **Nothing in §2 is implemented, and it must not be built without the
owner's go-ahead.** This document tells future agents what an entry teaches now, which rules follow from that, and how the later
step is expected to work, so that content added today does not get in its way.

## 1. Now: one entry teaches one beginner meaning group

> An entry initially teaches a small, useful, beginner-friendly meaning group. This can contain near-synonyms or a deliberately
> chosen combination of common beginner uses. Substantially different uses are introduced later in context. (Owner, 2026-11-03)

A playable entry teaches its written form, its pinyin and that meaning group together, and the learner practises exactly that
combination. The uses in the group are the **included uses**; every other use of the same written form is a **deferred use**.

Examples:

- 下 teaches “below / down”. The verb use “get off” (下车) is deferred.
- 想 may teach “think / want to” together. “Miss someone” is deferred.
- Near-synonyms such as “big / large” or “mom / mother” are one group.

**Choosing the group** (editorial guidance, not a numerical rule and not checked by a validator):

- useful in everyday beginner communication;
- easy to understand from a short label and a brief note;
- small enough not to become a dictionary definition;
- usually one meaning or a compact combination of beginner uses.

Source order, HSK membership and identical characters do **not** establish which uses are taught first. A `" / "` in a label is
neither required nor forbidden: it is fine when it joins near-synonyms or a deliberately chosen beginner combination, not when it
copies a source's list of senses. Do not narrow existing labels just because they contain a slash, and do not widen a label just
because a use is common.

Rules that follow from this (they apply to all new content and to proposals from imported sources):

- **Short meaning (`meaning`)**: names the included uses only, within the answer-button limit (`docs/CONTENT_GUIDE.md` §1.1).
- **Note (`note`)**: may teach and demonstrate included uses. It may briefly mention a deferred use so the learner is not
  surprised, but then says clearly that it is not taught here (“It can also mean miss someone; that use is not taught here.”).
- **Questions, example sentences (`explanations.json`) and sentence questions (`cloze.json`)** use only included uses. A sentence
  that depends on a deferred use (他们下了车, 他要睡觉了, 我叫他来的) is not adopted until that use is taught. Example assessments on
  the review screen mark these as “Shows another sense” (verdict `other-sense`).
- **Distractors:** never offer another valid answer as a wrong answer merely because that use has not been taught. If a wrong
  answer could be read as a correct use of the word (included or deferred), list the entries in `confusable` or choose other
  distractors (`docs/CONTENT_GUIDE.md`). Every question keeps exactly one correct answer.
- **A different reading is a different word, not another use**: 看 kàn (look) and 看 kān (guard) are two entries with their own
  ids and progress (see `docs/CONTENT_GUIDE.md` §1.5). That stays as it is.
- **Do not** add a second entry with the same hanzi **and** pinyin to teach a deferred use. The validator refuses it, and it would
  make answers ambiguous.

### 1.1 Comparing source definitions (review screen, assessments)

A source definition is compared with the entry's **included uses**, never with the whole word. Three cases, each recorded with
the existing assessment fields (`docs/SOURCES.md` §5):

| The source describes… | What to do | Recorded as |
|---|---|---|
| **an included use** | Compare accuracy and wording as usual. | pair `meaning.verdict` likely-equivalent (scope `same` or `source-narrower`); `wording` assessed |
| **included and deferred uses** | Assess only the part that matches the included uses; never adopt the whole definition as the label. | pair scope `source-broader`; wording `keep-game` or `edited` with only the included part (`prefer-source` is refused); record `multipleSenses` with each use in `senses` (`taught-by-entry` / `not-taught`) |
| **a deferred use** | Keep it for later; do not replace the beginner label with it. | pair `meaning.verdict` `different` (scope `distinct`), wording `not-applicable`; record disposition `additional-sense` and the use in `senses` as `not-taught` |

A deferred use recorded this way is material for §2, not a correction of the entry.

## 2. Later (intent): deferred uses unlock from “Retained”

When the owner decides to build it, a deferred use of an entry (called a “sense” or “meaning” below) becomes available once the
learner has the entry's meaning group secure:

- **Unlock rule:** the base entry reaches level 4, **Retained** (`LEVEL_NAMES[4]` in `src/game/mastery.ts`; level 5 is
  Mastered). An unlock is never taken back if the base entry later slips, as with lesson readiness.
- **Taught and tested in context only:** as a word or phrase (下车 “get off (a vehicle)”, 好学 “easy to learn”) or as a sentence
  with a target (他们下了车。 What does 下 mean here?). Never as a bare character with two correct answers, and never next to the
  base meaning on the same answer buttons. Every question still has exactly one correct answer.
- **Own progress:** each meaning has its own progress. Knowing 下 “down” does not count as knowing 下车, and missing 下车 does not
  demote 下 “down”.
- **Data model (expected):** a “sense” attached to an existing entry: its own id (for example `下#get-off`), label, note,
  examples and provenance, plus the base entry id. It is not a second playable entry. Existing progress keeps its keys; senses
  add new keys only, so old saves need no migration of existing data.
- **Content first:** a sense needs a reviewed label, a note and at least one or two suitable context sentences before it can be
  unlocked.

## 3. Open questions for the owner (decide before building)

- Very frequent beginner uses meet learners in almost every simple sentence (要 “will”, 会 “will”, 在 + verb for an ongoing
  action, 一下, sentence-final 了). Should these use a lower gate, or be placed in a lesson instead of waiting for Retained?
- Should an unlocked meaning appear on the word's card and in the Wordbook before it has been practised?
- Should the base entry's note keep mentioning the deferred use once it becomes teachable?

## 4. Material already collected (AI-assisted, unreviewed)

Some of these assessments are outdated since the 2026-11-03 fingerprint change (`docs/SOURCES.md` §5a); they are kept as history
until reassessed.

- `src/content/assessments/xiehanzi-new-hsk-2025-v24.json`, record assessments: `senses` marked “not-taught” on 16 matched words
  (要, 叫, 下, 上, 好, 点, 口, 多, 一, 的, 了, 在, 想, 少, 个, 那).
- The same file, example assessments with verdict `other-sense`: 43 sentences that show such meanings (many need pinyin or
  translation fixes first).
- `src/content/assessments/accc-anki.json`: 27 ACCC records assessed as a different sense of an existing entry (好 “easy to”,
  要 “will”, 下 “get off”, 叫 “tell”, …).

## 5. Existing labels that combine two uses (owner editorial decisions)

These labels predate the meaning-group rule and join two uses that are not plain synonyms. Under §1 a combination is allowed when
it is a deliberately chosen beginner group, so none of them must be narrowed; each is an editorial decision for the owner. Changing
a label changes answer buttons but not saved progress (progress is keyed by entry id). Until decided, leave them as they are.

| Entry | Label | Point to decide |
|---|---|---|
| 想 | think / want to | The owner's own example of an acceptable group. The note says “It can also mean think or miss someone”: “think” is included, and “miss someone” is deferred without saying it is not taught here. |
| 叫 | be called / call | The note says 叫 “also means to call or shout in other contexts”, presenting “call” as deferred although the label includes it. Decide whether “call” is included. |
| 点 | o'clock / point | “point” is not demonstrated anywhere and is less useful to a beginner than “o'clock”; the note calls it one of several other meanings. |
| 块 | yuan (spoken) / piece | Two different uses; the note teaches yuan and mentions pieces. |
| 天, 月, 日 | day / sky, moon / month, sun / day | Plausible beginner groups; the notes already steer to the everyday words (太阳, 月亮). |
| 菜, 家, 口, 木, 请 | vegetables / dish, home / family, mouth / opening, wood / tree, please / invite | Plausible groups; 请's note demonstrates only “please”. |
| 生 | life / be born | The note lists “life, being born, and raw” without saying which are taught. |
| 在 | be at / in | The note mentions the ongoing-action use (在 + verb) without saying it is not taught here (see also §3). |
| 了 | marks an event or new situation | Two grammatical uses in one particle label. |

Notes that mention a deferred use without saying it is not taught here (想, 叫, 生, 在 above) should get that wording when they are
next edited; that is a content edit for review, not done automatically.
