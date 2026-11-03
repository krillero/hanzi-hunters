# Sources: importing, comparing and adopting external learning material

This describes the **source layer**: how external material (first: the *A Course in Contemporary Chinese* Anki deck) is imported
without changing the game, compared with the game's entries on the review screen, and adopted one field at a time by explicit
decisions. The game stays simplified-Chinese only; traditional text is kept in the source records but is not used for play.

## 1. Teaching-content contract

| Content | Where | Responsibility |
|---|---|---|
| `meaning` | `words.json` | Concise English label for answer buttons and word cards (≤ 40 chars). |
| `note` | `words.json` | Essential usage guidance, shown on the new-word card, in feedback and **first, once** in the details popup. |
| Detailed explanation | `explanations.json` | Optional extra context, comparisons, grammar. Its `summary` is optional and must not repeat the note. |
| Example sentence | `explanations.json` `examples` (game) / `SentenceItem` (sources) | Reusable Chinese sentence + translation, optional pinyin and audio, with provenance. |
| Main `pinyin` | `words.json` | The entry's dictionary/teaching reading (game convention, tone marks). The only pinyin answer. |
| Pronunciation `variants` | `words.json` | Other accepted readings of the same word and meaning; never offered as wrong answers. |
| Connected speech (`speech`) | `words.json` | Context-dependent changes (一 yí/yì, 个 ge). Guidance only, never a dictionary reading or a pinyin answer. |
| `audio` | `words.json` | **Text-to-speech policy only** (`none` = TTS cannot be trusted). Says nothing about recordings. |
| Recorded audio | `recordings.json` | A specific file with its own spoken text, declared/verified reading, provenance, validation and allowed uses. |
| Exercise | `Exercise` (sources) | A task with explicit targets, prerequisites, answer rules and feedback; references sentences, never copies them. |

Required for a **playable entry**: `hanzi`, `pinyin`, `meaning`, `group`, `note` (validated by `npm run validate:content`).
Explanations, examples and audio are optional. **Imported records do not have to meet these rules** until a draft is promoted.

## 2. Identities

| Thing | Identity | Example |
|---|---|---|
| Source | key in `src/content/sources.json` | `accc-anki` |
| Source record | `<source>:<the source's own id>` | `accc-anki:B1-L01-03` |
| Game entry | `words.json` entry id (unchanged; saved progress is keyed by it) | `个`, `看-look` |
| Reusable content item | `<source>:<type>:<local id>` | `accc-anki:recording:B1-L01-03` |
| Course / lesson | ids in `curricula.json` | — |

- Chinese text is a **matching aid, never an identity**: 得 (de / děi / dé), 好 hǎo with different meanings, words vs names.
- New entry ids are the hanzi when no entry is written with it, else hanzi + tone-numbered reading (`得-dei3`). Never derived
  from English text, array positions or lesson numbers. The review screen proposes the id; a person can change it.
- **Engine limitation, handled explicitly:** entries with the same hanzi are told apart by reading. Two entries with the same
  hanzi **and** the same pinyin are refused by the validator (they would produce ambiguous questions and a wrong “another reading”
  label). Link such a record to the existing entry instead.
- Anki: the record key uses the deck's `ID` field. Uniqueness is validated on import; a duplicated ID gets `~<note guid>` appended
  and is reported. The Anki note id, guid, card ids, note type, deck and tags are kept in `native`.

## 3. Files and data flow

```
.apkg (local file) ──npm run source:import──▶ public/sources/<source>/   (imported, committed, served to /review/)
                                               manifest.json  snapshot (sha256, file, retrieved), counts
                                               records.json   one record per line: original fields verbatim, normalised
                                                              candidate fields, placement, media refs, record hash
                                               content.json   reusable content items (recordings, sentences) + exercises
                                               placement.json the source's book/lesson order: a DRAFT course proposal only
                                               report.md/json counts, problems, which checks ran and which did not
                                               diff.json      changes against the previous snapshot
                                               media/         <sha256 prefix>.<ext>, written under generated names only
public/sources/index.json                     the sources the review screen offers

/review/ (hosted)  ──export──▶ changeset.json ──npm run source:apply──▶ src/content/
                                                                       sourceMappings.json  record → decision
                                                                       recordings.json      selected recordings (game reads this)
                                                                       selections.json      field choices (meaning / note)
                                                                       words.json           only when a source text is adopted
```

- Raw data (`fields`), normalisation (`candidate`), decisions (`src/content/*.json`) and game editorial text stay separate.
- The game bundle never loads `public/sources`; it loads only `recordings.json` (small) and plays a file when asked.
- Code: types `src/sources/types.ts`; matcher `src/sources/match.ts`; changesets and reassessment `src/sources/changeset.ts`;
  comparison evidence `src/sources/compare.ts`; assessments `src/sources/assessment.ts` + `src/content/assessments/<source>.json`;
  validation `src/sources/validate.ts`, `src/sources/bundle.ts`; recording rules `src/content/recordings.ts`;
  importer `tools/sources/` (`zip.ts`, `importer.ts`, `adapters/`); review screen `src/review/`, `review/index.html`.

## 4. Import and reimport

```bash
npm run source:import -- --source accc-anki --file ~/Downloads/A_Course_in_Contemporary_Chinese__B1-B6_Traditional.apkg --retrieved 2026-11-02
```

- The source must be registered in `sources.json` with `adapter`, honest `license` / `reuse` and attribution first.
- The Anki adapter reads `collection.anki21` (in this package `collection.anki2` is a stub), the JSON `media` map and the note
  fields. Card templates and their scripts are never read or run. Every archive member name is checked for path traversal;
  media are written only under `<sha256 prefix>.<ext>`.
- Checks that run on media: present in the map and archive, CRC, non-empty, sha256, audio signature (ID3/MPEG/Ogg/WAV).
  **Not checked:** that a clip says the record's text or reading. That needs a person (the review screen asks “What do you hear?”).
- Phrases, names, patterns, erhua and long items are kept as valid records with `flags`; they need adaptation before play.
- ACCC import (2026-11-02, snapshot `1291d1b67ae4…`): 4,960 records, 4,960 recordings, 0 duplicate IDs, all placed; see
  `public/sources/accc-anki/report.md` for counts, the 10 parse notes and the one unimported font.
- ACCC IDs: `B<book>L<lesson>-<part>-<item>`, sometimes with a section (`B5L01-I-0-05`, `B6L01-III-T-01`). Its pinyin often
  has full tones where the game teaches a neutral tone (péngyǒu / péngyou), consistent with Taiwan Mandarin usage; the matcher
  reports each such case as an observed neutral-tone difference without claiming its cause, and such clips are not used for
  listening questions unless a person verifies the reading.
- **Reimporting** the same package changes nothing (keys are stable, files deterministic, media named by hash). A changed or
  removed record appears in `diff.json`; every committed decision about it gets `reassess` set (never deleted or reset). The game
  ignores a recording flagged for reassessment until someone decides again.
- Media no longer referenced are kept (a selected recording may use them) and counted in the import output.

### Second source: Anki-xiehanzi New HSK (2025), HSK 1 subdeck

```bash
npm run source:import -- --source xiehanzi-new-hsk-2025-v24 --file Anki-xiehanzi-New-HSK-2025.apkg --retrieved 2026-11-02
```

- Package: release v2.4, sha256 `4b0bea5d05c6…a37a`; full details, counts and findings in
  [`docs/proposals/xiehanzi-hsk1.md`](proposals/xiehanzi-hsk1.md).
- Adapter `anki-xiehanzi-hsk1` = the generic Anki adapter with the **field profile** `tools/sources/adapters/xiehanzi.ts`
  (`AnkiProfile`): import scope by **card deck membership** (`…::HSK 1`; 321 of 10,900 notes; the `HskLevel` field is empty for
  20 of them), record keys from the note GUID, the 13 fields parsed by HTML structure (short meaning without its heading;
  definitions per reading with numbered senses and measure words; parts of speech; examples as separate sentences), audio
  decoded with ffprobe when installed. The ACCC behaviour (no profile) is unchanged.
- Only the selected notes' media are extracted. **`"media": "local-only"`**: the files are written for local preview but ignored
  by git and never deployed (unclear reuse terms), and the validator refuses selecting them for gameplay. The review screen says
  so instead of failing silently.
- Normalised candidates: `meanings` = the short meaning (empty + `meaningMissing` when the source has none: a label proposed from
  the definitions is an *editorial* proposal), `definitions` = per-reading blocks (never merged into the meaning), `meta` =
  frequency and level (evidence, not a teaching order). Recording items carry `origin: unknown` and `pronunciation: unverified`.

## 5. Review screen (`<site>/review/`)

Open `https://<pages host>/hanzi-hunters/review/` (or `http://localhost:5173/review/` with `npm run dev`). It is not linked from
the game, is not precached by the service worker, and loads the source data only when opened.

### Four things kept apart

| Layer | What it is | Where | Who/what produces it |
|---|---|---|---|
| **Matching evidence** | Observable facts: spelling, readings (main, accepted variants, connected speech), text equality, English-word overlap, part of speech, an existing mapping | computed, never stored (`src/sources/match.ts`, `compare.ts`) | deterministic rules |
| **Meaning assessment** | Do the two records teach the same sense? | `src/content/assessments/<source>.json` | an assessor (AI-assisted or a person), with reason, provenance, uncertainty |
| **Wording assessment** | Which description teaches that sense more clearly? | same file | same |
| **Reviewer decisions** | Link / keep separate / exclude / new-entry draft; which text; which recording | browser drafts → changeset → `sourceMappings.json`, `selections.json`, `recordings.json` | a person on the review screen |

Evidence never becomes an assessment, an assessment never becomes a decision, and a decision never activates content (§8).
“Assessment exists”, “mapping confirmed” and “content selected” are independent.

**Evidence is not meaning.** Same spelling and reading, a single game entry with those characters, one shared English word, or
a gloss that names a grammatical category do **not** establish the same sense; no shared English words does **not** establish a
different sense. The evidence line says so: “Same spelling and reading. Definitions differ; meaning assessment needed.”
*Candidate strength* (strong / possible / weak / unlikely; spelling and reading only) says how worth comparing a candidate is,
not whether either definition is correct. A neutral-tone or other tone difference is described as observed; its cause is not
claimed.

**Text comparison** (between the source's definition and the game's short meaning): *exact* (“Exact text match—not a
linguistic review”), *formatting-only* (case, whitespace and punctuation only; never dropped words, synonyms, qualifiers or
negations), *different wording*, *missing*. Equal text does not show that the definition is right.

**Meaning states:** not assessed · likely equivalent (an assessment, with reason) · same sense confirmed by a reviewer (a person
linked the record) · different sense (assessment or a reviewer's “keep separate”) · uncertain. **Wording states:** not assessed
(shown as «No change proposed. This wording has not been assessed.») · keep game wording (with a substantive reason) · prefer
source wording · edited wording proposed (text + reason) · not applicable because the senses differ. A reviewer's own
“keep the game text” is a *decision* and is shown apart from the application's default of changing nothing.

**Terminology suggestions** (`terminologySuggestion`, keyed by English terms such as “classifier” / “measure word” → “counting
word”, never by Chinese words) are offered as a labelled wording option. They do not establish equivalence and are not proof that
the replacement is better everywhere.

### The screen

- Source selector, search (simplified, pinyin with or without tones, English, record id; exact characters, readings and IDs
  rank first; English matches from word starts only), book/lesson filters, 40 records per page.
- **Coverage line** in candidate pairs, e.g. “1 wording change proposed · 0 comparisons not yet assessed”, with the units spelled
  out (pairs, source records, game entries, records with no matching entry) and counts per meaning/wording state.
- **Filters** count *source records* (a record matches when any of its candidate pairs does): decision filters (unresolved,
  linked, new candidates, excluded, needs reassessment, has audio, changed here) and comparison filters (no matching game entry,
  exact or formatting-only text, different wording, meaning assessment pending, different sense, wording assessment pending,
  wording change proposed, uncertain or outdated, pronunciation differs).
- Each candidate pair shows: the original Anki definition, the game's short meaning, teaching note and (folded) explanation and
  examples, the pronunciation difference, then **Text / Meaning / Wording** as separate rows, the assessment's provenance
  (method, assessor, date, reviewed or not, uncertainty, references) and freshness. An outdated assessment is shown only as
  “Assessment outdated—content changed”, never as current advice. Matching evidence is under a fold.
- Three decisions: **1. Are these the same teaching sense?** (link / keep separate (`distinctFrom`) / leave unresolved; when the
  senses differ, “keep separate and save as new-entry candidate”). **2. Which wording should be used?** (keep the game text, use
  the source text, or an edited text, `choice: "edited"`; prefilled with an assessment's proposal when there is one). Never
  offered as a replacement when the senses differ. **3. Which additional content (audio) should be selected?** (see §6; an
  assessor's remark on a recording is metadata, not proof of what the clip says).
- Sources with record and example assessments (xiehanzi) also show: the imported content (short meaning or “missing in the
  source”, definitions per reading, parts of speech, frequency/level), the **proposal for the record** (disposition, senses,
  label basis, draft, provenance, freshness), every extracted **example** with its assessments, the active-course status of
  the compared entry, and, on request, the same written form in **other imported sources** (evidence only, never merged).
  Record filters: existing game match, new vocabulary candidate, proposed first expansion, additional sense, excluded, missing
  short meaning, several meanings to separate, has examples, example/sense mismatch, audio origin unknown, record uncertain or
  outdated (counts are source records).
- Other actions: link to any entry id, exclude (optional reason), prepare a new-entry draft (prefilled from a current draft
  proposal).
- **Saved in this browser** (localStorage `hanzi-hunters-review-v2:<source>`, separate from game saves) vs **applied in the
  game** (the committed files of the deployed build) are labelled everywhere. Drafts hold only decisions.
  Drafts from the earlier screen (`hanzi-hunters-review-v1:<source>`) are migrated once: their ops are the reviewer's own
  decisions and keep their provenance; the old screen's automatic recommendations were never stored and are not carried over.
  The v1 key is left as a backup. Drafts that cannot be read are copied to a backup key and offered for download, never
  silently discarded.
- “Proposed changes” → **Export changeset** (needs the reviewer's name) → send the file to the maintainer.

**Applying:** `npm run source:apply -- changeset.json --dry-run`, then without `--dry-run`. Every op carries what it was made
against (record hash, previous decision, current game text). If anything changed since — a newer import, another decision, a
hand edit — the whole changeset is refused and nothing is written. The result must also pass the content validator.
Then review `git diff src/content`, run `npm run validate:content` and `npm test`, commit, deploy.

### 5a. Assessments: data and workflow

One file per source, `src/content/assessments/<source>.json` (`kind: "hanzi-hunters-assessments"`, `schemaVersion: 2`; version 1
files, which hold pair assessments only, are still read). Three lists, all advice with the same provenance fields:

**`assessments`: one per candidate pair** (record × game entry):

| Field | Meaning |
|---|---|
| `id` | `<source record key>\|<game entry id>` (stable ids; Chinese text is never the key) |
| `record`, `recordHash` | the source record and its hash when assessed |
| `entry`, `gameFingerprint` | the game entry and a hash of the fields considered: hanzi, pinyin, variants, connected speech, kind, meaning, note and the entry's explanation text/examples |
| `meaning` | `verdict` (likely-equivalent / same-confirmed / different / uncertain), optional `scope` (same, source-broader, source-narrower, overlapping, distinct), `reason` |
| `wording` | optional; absent = not assessed. `verdict` (keep-game / prefer-source / edited / not-applicable), `reason`, `proposed`, `terminology` |
| `recording` | optional remark on recording suitability (never a verification) |
| `method`, `assessor`, `on` | heuristic / ai-assisted / human; the person or tool; date |
| `review`, `uncertainty`, `references` | `unreviewed` or `human-reviewed` (method `human` only); low / medium / high; pointers to references consulted |

**`records`: one disposition per source record** (`id` `<record>|record`): `disposition` match / additional-sense /
new-candidate / uncertain / excluded with a `reason`; `relatedEntries` + `relatedFingerprint` (stale when those entries change);
`multipleSenses` and `senses` (each taught by the entry, not taught, separate entry proposed, or out of scope); `shortLabel`
with `basis` `source` (must be the source's exact text) or `editorial`; an optional new-entry `draft` (stable id, game pinyin
convention, note, related entries); `expansion` first / later / not-proposed. A draft can never reuse an entry id or an
existing hanzi + pinyin pair (the engine refuses those duplicates).

**`examples`: one per example-to-target relationship** (`id` `<sentence id>|<entry or record>`): the `sense` the sentence
actually shows, `verdict` suitable / needs-editing / other-sense / not-beginner / uncertain, `contains` and `prerequisites`
(other vocabulary and the part the game does not teach yet), an optional `edited` adaptation (Chinese / pinyin / English +
reason; the source item stays verbatim), and `sentenceHash` (Chinese, pinyin and translation: changing any of them, including a
tone mark, makes the assessment outdated) plus `targetFingerprint` for entry targets.

Rules enforced by `checkAssessment` (also run by `npm run validate:content`): only `human` can be `human-reviewed` or
`same-confirmed`; a heuristic can only record `uncertain` and never wording; reasons must be substantive (placeholders such as
“No clear improvement” are refused); different senses require wording `not-applicable`; proposals fit the answer-button limit.
An assessment is **outdated** when the record hash or the game fingerprint changes (`validate:content` warns; the screen shows
it as outdated, not as advice).

```bash
npm run source:assess -- check [--source <id>]                         # validate; coverage per source; outdated ones
npm run source:assess -- template --source <id> --kind pairs --out t.json    # pairs without a current assessment (--all: all)
npm run source:assess -- template --source <id> --kind records --out t.json  # records without a current disposition
npm run source:assess -- template --source <id> --kind examples --out t.json # examples of matched / first-expansion records
npm run source:assess -- import --source <id> t.json [--dry-run]       # all or nothing (invalid, outdated, or replacing a
                                                                       # person's assessment with a non-human one: refused)
npm run source:assess -- report --source <id> --out docs/proposals/<id>-records.md   # generated per-record table
```

Templates carry ids, hashes, fingerprints and a read-only `context` (definitions, examples, game note and explanation; for
examples, prefilled `contains` / `prerequisites` from a longest-match segmenter, `src/sources/segment.ts`, to be checked).
Import writes **only** `src/content/assessments/<source>.json`. It never links records, changes game wording, selects recordings or touches
curricula; adopting a recommendation still goes through a reviewer's decision and a changeset. No AI service or API key is used
by the browser or the tools: AI-assisted assessments are produced offline, recorded as `ai-assisted` / `unreviewed`, and checked
by a person before anyone treats them as more than advice. A person's own assessment is recorded with `method: "human"`.

**Initial assessment (2026-11-02, ACCC):** all 131 candidate pairs (130 source records, 101 game entries; the other 4,830
records have no matching game entry and were not assessed). AI-assisted editorial review against the same criteria for every
pair: accuracy for the intended sense, clear natural English, beginner suitability, the answer-button length, scope,
complementarity of short meaning / note / explanation, and unambiguous quiz answers. Each sense was checked against CC-CEDICT
(as packaged by the npm package `cc-cedict` 1.1.1, data processed 2026-01-04), recorded per assessment. Result: 99 likely
equivalent, 27 different sense, 5 uncertain (中 “medium”, 了 “certainty”, 请 “treat”, 叫 “call for attention”, 生 “give
birth”); wording: 98 keep game wording (with reasons), 1 edited proposal (个 “general counting word”, a terminology change with a
consistency caveat), 27 not applicable, 5 not assessed (their meaning is uncertain). None of it is applied.

## 6. Recorded audio: selection and assessment

- A selected recording (`recordings.json`) stores: id, entry, scope (word / sentence), file and sha256, spoken text, source
  provenance (record + hash), `reading.declared` (verbatim from the source) and `reading.verified` (+ who/when, only when a person
  listened), variety (from the source registry), `validation` (unverified / verified / rejected) and the `uses` a person allowed.
- **Eligibility** (`eligibleUses`): nothing if rejected, flagged for reassessment, a sentence clip, or the reading (verified, else
  declared) is not the entry's main reading, a variant or a connected-speech form. A connected-speech reading allows display,
  audio→character and audio→meaning, **never audio→pinyin**. Each use must also have been allowed.
  - 个: game `gè` (speech `ge`); the Anki clip declares `ge` → playable and usable for meaning, not for a pinyin question —
    unless a person verifies they hear `gè`.
- **Selection order in the game:** an entry with a selected recording always uses it and never falls back to TTS (one voice,
  one reading per entry). Entries without one use TTS only when reliable (`audio` not `none`, no homograph) and a Mandarin voice
  exists. `audio: "none"` therefore blocks TTS but not a suitable recording. Muted: nothing plays, no listening questions.
- Files load only when played (`<audio>` per tap), never at startup and not precached. If a file fails to play, that entry's
  recording is dropped for the session, a toast says so, an open listening question becomes a normal question, and nothing is
  substituted silently. Offline, recordings that were never played are unavailable (handled the same way).
- Word and sentence recordings are separate (`scope`); sentence recordings attach to `SentenceItem.audio`.

## 7. Adding another source adapter

0. Another Anki deck? Usually no new adapter: write an `AnkiProfile` (deck scope, key from GUID, field parser) like
   `tools/sources/adapters/xiehanzi.ts` and register `readAnkiPackage({ ...i, profile })` under a new adapter name.
1. Register the source in `sources.json` (title, url, license, attribution, `adapter`, `reuse`, optional `variety`, and
   `media: "local-only"` when its media must not be published).
2. Write `tools/sources/adapters/<name>.ts`: a function returning a `SourceBundle` — any subset of records, recordings,
   sentences, definitions, explanations, exercises. Keep original fields verbatim; put matching aids in `candidate`; hash each
   record's content; write media only through `safeJoin` under generated names.
3. Register it in `tools/sources/adapters/index.ts`. `validateBundle` checks ids, provenance, links and exercise answer rules.
4. Links (`teaches` / `contains` / `requires`) must be declared by the source or a person, never inferred from Chinese
   substrings. Exercises reference sentences by id (one sentence, many exercises) and list targets, prerequisites, accepted
   answers (an accepted alternative is never offered next to another correct choice) and feedback.

`tests/fixtures/sources/sentences-demo.json` + `adapters/sentencesJson.ts` show a second source contributing a sentence and two
exercises without touching the Anki adapter. No exercise mechanic reads these yet; they are the extension point.

## 8. Activating content (always deliberate)

1. Import → records exist only in `public/sources`. Nothing is playable.
2. Link / select → mapping, recordings and field choices are applied via a reviewed changeset. A selected recording is used for
   an entry that is **already** in the game. No new entry, no lesson change.
3. New entry → a `new-candidate` draft (proposed in the game's conventions: lowercase pinyin, the source's other readings as
   `variants`, `kind: "particle"` when the source says so; all editable), then `npm run source:promote -- <record key> [--group <group>]`, which adds the entry to
   `words.json` (review status `imported`) only if it passes the playable-entry validation. It is still in no course.
   Promotion copies `kind`, `variants` and `speech`, and derives `neutral` from the pinyin (the syllables without a tone mark,
   exactly what the validator requires), so neutral-tone words such as 东西 dōngxi promote without hand-editing.
4. Course → a person adds the entry id to a lesson in `curricula.json` (see `docs/CURRICULUM.md`). Courses reference game entry
   ids only; `placement.json` is a proposal to consult, not a course.

Progress stays keyed to entry ids: the same entry in another course keeps its progress; a different meaning (a different entry
id) never inherits mastery because its characters match.

## 9. Rights

The ACCC deck page states no license and the textbook material is copyrighted. The project owner decided to include the
recordings in this repository; no rights-holder permission is documented here (see `sources.json` → `reuse` and
`ASSET_CREDITS.md`). Do not mark imported text or recordings as `human-reviewed`; a reviewer's verified reading is recorded
separately (`reading.verifiedBy`).
