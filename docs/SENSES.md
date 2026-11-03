# One meaning per entry; other meanings later (intent, not implemented)

**Status:** product intent recorded on 2026-11-03 by the project owner. **Nothing here is implemented, and it must not be built
without the owner's go-ahead.** It tells future agents what the game teaches now, which rules follow from that, and how the
later step is expected to work, so that content added today does not get in its way.

## 1. Now: one entry teaches one meaning

A playable entry teaches the written form, its pinyin and **one basic meaning** together, and the learner practises exactly that
combination. Other meanings or uses of the same written form are not taught yet.

Rules that follow from this (they apply to all new content and to proposals from imported sources):

- **Short meaning (`meaning`)**: one sense. A `" / "` may join near-synonyms of that sense (“mom / mother”, “big / large”), not
  two different senses (“want / be going to”). A source's multi-sense label is never adopted as one answer.
- **Note (`note`)**: may *mention* another use so the learner is not surprised (“It can also mean miss someone”), but says it is
  not taught here. Nothing in questions depends on it.
- **Questions, example sentences (`explanations.json`) and sentence questions (`cloze.json`)** use each word only in its taught
  sense. A sentence where the word has another meaning (他们下了车, 他要睡觉了, 我叫他来的) is not adopted until that meaning is
  taught. Example assessments on the review screen mark these as “Shows another sense”.
- **A different reading is a different word, not another meaning**: 看 kàn (look) and 看 kān (guard) are two entries with their
  own ids and progress (see `docs/CONTENT_GUIDE.md` §1.5). That stays as it is.
- **Do not** add a second entry with the same hanzi **and** pinyin to teach another meaning. The validator refuses it, and it
  would make answers ambiguous.

## 2. Later (intent): other meanings unlock from “Retained”

When the owner decides to build it, another meaning of an entry becomes available once the learner has the basic meaning secure:

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
- Should the base entry's note keep mentioning the other meaning once the meaning becomes teachable?

## 4. Material already collected (AI-assisted, unreviewed)

- `src/content/assessments/xiehanzi-new-hsk-2025-v24.json`, record assessments: `senses` marked “not-taught” on 16 matched words
  (要, 叫, 下, 上, 好, 点, 口, 多, 一, 的, 了, 在, 想, 少, 个, 那).
- The same file, example assessments with verdict `other-sense`: 43 sentences that show such meanings (many need pinyin or
  translation fixes first).
- `src/content/assessments/accc-anki.json`: 27 ACCC records assessed as a different sense of an existing entry (好 “easy to”,
  要 “will”, 下 “get off”, 叫 “tell”, …).

## 5. Existing labels that combine two meanings (for review)

These labels predate this rule and join two different senses, not synonyms: 叫 “be called / call”, 请 “please / invite”,
想 “think / want to”, 点 “o'clock / point”, 块 “yuan (spoken) / piece”, 天 “day / sky”, 月 “moon / month”, 日 “sun / day”,
菜 “vegetables / dish”, 家 “home / family”, and the particle 了 (completed event *and* new situation). Narrowing a label changes
answer buttons but not saved progress (progress is keyed by entry id). Whether to narrow them is an owner decision; until then
leave them as they are.
