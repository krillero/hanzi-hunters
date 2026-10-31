# Curriculum: teaching order, progression and course updates

Vocabulary and teaching order are separate:

| File | Says | Order matters? |
|---|---|---|
| `src/content/words.json` | **What** an entry is (hanzi, pinyin, meaning, notes, sources, review). | **No.** Storage order is irrelevant. |
| `src/content/curricula.json` | **In which order** entries are taught: units → lessons → introductions, by stable entry id. | **Yes.** Array position is the only ordering. |
| `src/content/cloze.json` | Authored sentence questions; may declare the entries / lessons they rely on. | No. |
| `src/content/explanations.json` | Optional popups and example sentences (never assessed). | No. |

Code: `src/game/course.ts` (progression, introduction and review selection), `src/content/validateCurriculum.ts` (validation),
`src/content/curriculumReport.ts` (inventory). Tests: `tests/course.test.ts`, `tests/curriculum.test.ts`, `tests/eligibility.test.ts`.

> Structural validation checks ids, references, ordering and prerequisites. It does **not** verify Mandarin accuracy, translations,
> or whether the teaching order is pedagogically good. That needs a qualified person.

---

## 1. File format (`curricula.json`)

```json
{
  "default": "beginner-mandarin",
  "curricula": [
    {
      "id": "beginner-mandarin",
      "version": 1,
      "title": "Beginner Mandarin",
      "description": "Optional. Shown nowhere in gameplay; for maintainers.",
      "provisional": false,
      "readiness": { "minLevel": 1 },
      "units": [
        {
          "id": "greetings",
          "title": "Greetings",
          "lessons": [
            {
              "id": "greetings-1",
              "title": "Say hello and thank you",
              "prerequisiteLessons": [],
              "introductions": [
                { "entryId": "你好", "prerequisiteEntries": [],
                  "officialLevels": [{ "source": "HSK", "edition": "HSK 3.0 (2021)", "level": "1" }] },
                { "entryId": "谢谢", "prerequisiteEntries": [] }
              ]
            },
            {
              "id": "greetings-2",
              "title": "Ask who someone is",
              "prerequisiteLessons": ["greetings-1"],
              "aliases": ["greetings-who"],
              "introductions": [
                { "entryId": "你" },
                { "entryId": "谁" },
                { "entryId": "朋友", "prerequisiteEntries": ["你"], "required": false }
              ]
            }
          ]
        }
      ],
      "source": [{ "name": "ai-draft" }],
      "review": { "status": "ai-draft", "note": "Order must be checked by a teacher." }
    }
  ]
}
```

### Fields

| Where | Field | Required | Meaning |
|---|---|---|---|
| file | `default` | yes | Id of the curriculum the game uses. Only one is selectable for now (no picker in the UI). |
| file | `curricula` | yes | Non-empty array. |
| curriculum | `id` | yes | `a-z 0-9 -`, ≤ 48 chars, unique. Saved course progress is keyed by it. Never rename. |
| curriculum | `version` | yes | Positive integer. Raise it whenever units, lessons or introductions change (see §6). |
| curriculum | `title` | yes | Shown in camp ("Course: …" line uses unit/lesson titles). |
| curriculum | `description`, `provisional` | no | `provisional: true` = placeholder order, not a reviewed sequence. |
| curriculum | `readiness` | no | `{ "minLevel": 1-4 }`. Default `{ "minLevel": 1 }` (see §3). |
| curriculum | `source`, `review` | no | Same format and rules as everywhere else (`docs/CONTENT_GUIDE.md` §4). |
| unit | `id`, `title`, `lessons` | yes | Unit ids unique within the curriculum. |
| lesson | `id`, `title`, `introductions` | yes | Lesson ids unique within the curriculum. **Completion is saved by lesson id.** |
| lesson | `prerequisiteLessons` | no | Lesson ids (same curriculum) that must be ready / completed first. Must come **earlier**. |
| lesson | `aliases` | no | Earlier ids of this lesson: their saved completion carries over after a rename. |
| introduction | `entryId` | yes | An entry id from `words.json` (the hanzi unless the entry has an explicit `id`, e.g. `看-look`). Once per curriculum. |
| introduction | `prerequisiteEntries` | no | Entry ids that must be ready first. Must be introduced **earlier in this curriculum**. Authored only: nothing is inferred by splitting words into characters. |
| introduction | `required` | no | `false` = taught in order, but not needed for the lesson to count as ready. Default `true`. |
| introduction | `officialLevels` | no | `[{ source, edition, level, ref? }]`. `source` must be in `sources.json`; `edition` and `level` are required. **Missing = unknown.** Never infer a level or edition. |

There are **no numeric ranks**: the order is units, then lessons, then introductions as written. An entry may appear in several
curricula (once in each); its definition and progress are shared.

### Sentence-question prerequisites (`cloze.json`)

```json
{ "id": "ma-student", "answer": "吗", "zh": "你是学生___？", "…": "…",
  "prerequisiteEntries": ["你", "是"],
  "prerequisiteLessons": ["greetings-2"] }
```

The sentence is only **assessed** once every listed entry is ready (or belongs to a completed lesson) and every listed lesson is
completed (lessons of any curriculum). Otherwise another eligible question kind is asked. List the words and constructions the
sentence relies on yourself; the game never derives them from the characters. Sentences without these fields are always eligible
(as before). Example sentences in `explanations.json` are **optional reading**, never assessed: they may contain unfamiliar words
as long as pinyin and translation are given. The introduction card labels them "Examples (not tested)".

---

## 2. How the game picks what to teach

**Introductions** (`selectIntroductions`): deterministic, the same for every player, no randomness.

1. Walk the lessons of the active curriculum in declared order.
2. Skip lessons with nothing unseen. Skip lessons whose `prerequisiteLessons` are not satisfied (a later unlocked lesson may go first).
3. The first lesson left is the current lesson. Its unseen entries are introduced **strictly in order**. If the next entry's
   `prerequisiteEntries` are not ready yet, the lesson waits (review continues). When all of its entries are taken, the next lesson continues.
4. The existing limits on new learning apply (`introCapacity`): a new player gets 3 cards to start, then at most one per fight,
   none while 4 entries are at level 0.
5. Entries already introduced are skipped, so an entry moved to another lesson is never introduced twice, and an entry added to a
   completed lesson is still introduced. Entries outside the curriculum are never introduced.

Introductions are shown on the existing introduction card between fights. The card shows a simple line such as
**"Greetings · Lesson 1 · 2 of 5 introduced"**; camp shows the current lesson the same way. No ids or source names appear in gameplay.

**Review / practice** (`selectReview`): a weighted random pick among entries the learner has **already been introduced to**
(also entries known from another curriculum or an older save). It never returns an unseen entry. Weak entries are asked more
(level weights `3, 3, 2, 2, 0.6`), and the last few asked are less likely to repeat. Question kinds, distractors, warm-up and boss
behaviour are unchanged and stay randomised. A future scheduler can pass its own `weight(word, entry)` (e.g. from review dates)
without changing curriculum order.

**Nothing new to introduce** → the game keeps reviewing; in development builds the reason (`learning-limit`, `prerequisites`,
`complete`, `empty`) is logged to the console as `[course …]` and kept on `window.__hhCourse`. **Nothing known and nothing
introducible** (e.g. every curriculum entry is missing from `words.json`) → the battle screen shows "No words to practise" with
what to check, instead of a meaningless question. A question is only asked if it has one correct answer and at least two safe wrong
options (sentence questions: at least one); otherwise another allowed kind or another entry is used. An entry's `questions`
allow-list is never bypassed.

---

## 3. Progression terms

| Term | Meaning | Where |
|---|---|---|
| **Introduced** | The learner tapped "Got it" on the entry's introduction card (or had progress before curricula existed). | `mastery[id]` exists |
| **Practiced** | Answered correctly at least once since being introduced (a later miss at level 0 resets this). | `lv ≥ 1` or `ok ≥ 1` |
| **Ready to advance** | Enough initial practice to continue the course. | `lv ≥ readiness.minLevel` (default 1) |
| **Lesson ready** | Every *required* entry of the lesson is ready. Recorded as **completed** the first time it happens. | `courses[id].completed` |
| **Long-term mastery** | Separate concept (level 4, "mastered"). Lesson completion never claims it. | `lv = 4` |

Mastery levels are unchanged: two correct answers in a row raise the level by one, a miss lowers it by one.

**No relocking.** Completion is sticky. A lesson's prerequisites are satisfied by a completed lesson even if its entries later drop
back to level 0, and an entry of a completed lesson stays satisfied as a prerequisite. Weak entries simply come up more in review.

**Configuring readiness.** Set `"readiness": { "minLevel": 2 }` on a curriculum to require more practice before lessons count as
ready. The engine default lives in `DEFAULT_READINESS` (`src/game/course.ts`); the introduction limits in `DEFAULT_LIMITS`.

---

## 4. Saves

Save format v3 (`SAVE_KEY` is still `hanzi-hunters-save-v2`; the `version` field inside says 3):

```json
"courses": { "starter-compat": { "version": 1, "completed": ["first-characters-1", "first-characters-2"] } }
```

* Entry progress stays in `mastery`, keyed by entry id and shared by every curriculum. Nothing in the save refers to array positions.
* **Migration from v2** (`sanitizeCourses` in `src/game/save.ts`, tested in `tests/course.test.ts`): mastery, gold, upgrades, run,
  gear and habit are kept as they are; entries with progress count as introduced (no introduction replay); lessons whose required
  entries are already ready are marked completed; progress for entries outside the curriculum stays in `mastery`.
* Course progress for unknown curriculum ids and unknown lesson ids is **kept**, never discarded, so it can be recovered.
* `courses` can always be re-derived from `mastery`; an older build that drops the field loses nothing permanent (only stickiness for
  lessons whose entries have since dropped below the readiness level).
* `habit.seed` is still read and written for compatibility but no longer affects word order.

---

## 5. Validation and inventory

```bash
npm run validate:content   # errors, warnings and INFO lines for all content, including curricula.json
npm run curriculum         # readable inventory of the active curriculum (or: npm run curriculum -- <curriculum-id>)
npm run inventory          # writes docs/content-inventory.json (includes the same curriculum data as JSON)
npm test
```

The validator reports as **errors**: missing vocabulary references; duplicate curriculum, unit or lesson ids; an entry introduced
twice in one curriculum; unknown prerequisite lessons / entries; self-dependencies; lesson prerequisite cycles; a prerequisite that
comes later than its dependent or is never introduced (the declared sequence would be unreachable); a final check that runs the real
selection engine and fails if any entry can never be introduced or the reached order differs from the declared order; empty or
malformed required fields; unknown fields (e.g. a numeric `rank`); invalid `version`; incomplete official-level mappings (a level
without `source`, `edition` or `level`, or an unregistered source); a `default` that names no curriculum; unknown ids in sentence
prerequisites. **Info only:** entries of `words.json` that are not in the active curriculum (supporting characters and future
content may be excluded on purpose), unmapped official levels, provisional curricula. `npm run curriculum` lists the effective
order, unit/lesson membership, prerequisites, unmapped levels, entries outside the curriculum and unreviewed content.

---

## 6. Changing a curriculum (version changes)

1. Edit `curricula.json`. Keep lesson ids stable; reorder freely (completion is by id). To rename a lesson, put the old id in `aliases`.
2. Raise `version` by one.
3. `npm run validate:content && npm test`, then `npm run curriculum` to read the new order.

What happens to existing players on the next load:

| Change | Effect |
|---|---|
| Lessons or units reordered | Nothing lost; completion is by lesson id. New introductions follow the new order. |
| Entry moved to another lesson | Not introduced again (it already has progress). Both lessons recompute readiness; completed stays completed. |
| New entry added to a completed lesson | The lesson stays completed (later lessons stay unlocked); the new entry is introduced next (earliest unseen). |
| New lessons / entries appended | Introduced in order once reached. |
| Lesson renamed with `aliases` | Old completion carries over. |
| Lesson removed or renamed without alias | Its completion id stays in the save (reported by `orphanLessons`), recoverable by adding the alias later. |
| Entry removed from the curriculum | Its progress stays in `mastery` and it can still be reviewed; it is no longer introduced to new learners. |
| Entry id renamed in `words.json` | Use the entry's `aliases` (CONTENT_GUIDE §1.7); unclaimed progress is parked in `legacyMastery`, not deleted. |

The stored `version` is informational (it records what the progress was last synced with); progress never depends on it matching.

---

## 7. Importing the reviewed 100-word course (no engine changes)

The current `starter-compat` curriculum is a **compatibility course**: the original 63 entries in the old file order, cut into
lessons mechanically. Its order is **provisional** (`"provisional": true`, review status `ai-draft`) and is not the future beginner course.

A content package for the curated course consists of:

| File | Contents |
|---|---|
| `src/content/words.json` | The existing entries (do **not** remove or rename ids that players have progress under; use `aliases` if you must) plus the new entries, in any order. |
| `src/content/curricula.json` | The new curriculum (e.g. id `beginner-mandarin`, `version: 1`), with `"default"` set to it. Keep `starter-compat` in the file or drop it; player progress survives either way. |
| `src/content/explanations.json` | Existing explanations plus new ones (optional). |
| `src/content/cloze.json` | Existing plus new sentence questions, with `prerequisiteEntries` / `prerequisiteLessons` where the sentence relies on other words. |
| `src/content/sources.json` | Only if new sources are cited (with their real license and attribution). |

Steps:

```bash
git checkout -b content/beginner-100
cp <package>/src/content/*.json src/content/     # words, curricula, explanations, cloze, (sources)
npm run validate:content                           # must report 0 errors; read every warning and INFO line
npm run curriculum                                 # check the effective order, lessons, prerequisites, unmapped levels
npm test                                           # must stay green (the shipped-content tests check the new files too)
npm run inventory                                  # refresh docs/content-inventory.json
npm run build
npm run dev                                        # fresh profile: first introduction card shows lesson 1, entry 1
```

Rules for the package: entry `review` stays `ai-draft` / `imported` unless a person really reviewed it (`human-reviewed` needs
`reviewer` and `date`); official levels only where the edition is known and stated exactly; no invented citations. Set
`"provisional": false` only for a reviewed order. Existing players keep all progress: their known entries count as introduced in the
new course, lessons they already know are derived as completed, and the rest is introduced in the new order.

The tests do not depend on the compatibility course: tests that use shipped content check whatever `default` names, and the
compatibility-course checks skip themselves once `starter-compat` is removed. The package needs no engine or test changes.
