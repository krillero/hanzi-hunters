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
- ACCC IDs: `B<book>L<lesson>-<part>-<item>`, sometimes with a section (`B5L01-I-0-05`, `B6L01-III-T-01`). Its pinyin follows
  Taiwan Mandarin (full tones where the game teaches neutral tone: péngyǒu / péngyou); the matcher reports these as
  neutral-tone-only differences, and such clips are not used for listening questions unless a person verifies the reading.
- **Reimporting** the same package changes nothing (keys are stable, files deterministic, media named by hash). A changed or
  removed record appears in `diff.json`; every committed decision about it gets `reassess` set (never deleted or reset). The game
  ignores a recording flagged for reassessment until someone decides again.
- Media no longer referenced are kept (a selected recording may use them) and counted in the import output.

## 5. Review screen (`<site>/review/`)

Open `https://<pages host>/hanzi-hunters/review/` (or `http://localhost:5173/review/` with `npm run dev`). It is not linked from
the game, is not precached by the service worker, and loads the source data only when opened.

- Source selector, search (simplified, pinyin with or without tones, English, record id), filters (unresolved, linked,
  check meaning, wording suggestion, new candidates, excluded, needs reassessment, has audio, changed here), book/lesson
  filters, 40 records per page. Search ranks exact characters, readings (with or without tones) and IDs first and matches
  English from word starts only (“ge” finds 个 and 哥哥, not “younger”). Each row shows the recommendation, e.g. “个: Same meaning; wording improvement suggested.”
- A record is reviewed as **three separate decisions**, each with a recommendation and its reason
  (`src/sources/recommend.ts`, fixed rules, no external service; a suggestion, never a decision or a review):
  1. **Do these teach the same meaning?** Same → link. Different → “Different meaning” (remembered as `distinctFrom`, so the
     suggestion is not raised again). Unsure → leave unresolved. A grammatical category label (“sentence final particle”)
     against a function description (“marks a yes/no question”) counts as a wording difference, not a meaning conflict.
  2. **Which text teaches it best?** Keep the game text (default; recommended unless the source corrects an error or explains
     the meaning better), use the source text, or use an edited text (the reviewer's own wording, `choice: "edited"`,
     recorded as written by the reviewer after comparing with the record). Wording rules are an explicit list: a source
     “measure word” label is recommended over the game's “classifier” (the textbook term vs the linguists' term), and a
     plainer “counting word” label is offered as an alternative for either. The note and explanation are unchanged.
  3. **Is the recording useful?** Pronunciation differences (connected speech, regional tones, variants) are explained
     separately from meaning; the reviewer listens, records what they hear and allows uses (see §6).
- “Matching evidence” (spelling, reading, meaning words, kind; same-word evidence strong / probable / weak / conflict) is kept
  under a fold: it says how sure the matcher is that two records are the same word, not which definition is better.
- Other actions: link to any entry id, exclude (not wanted, optional reason), prepare a new-entry draft.
- **Saved in this browser** (localStorage `hanzi-hunters-review-v1:<source>`, separate from game saves) vs **applied in the
  game** (the committed files of the deployed build) are labelled everywhere. Each record lists its proposed changes.
- “Proposed changes” → **Export changeset** (needs the reviewer's name) → send the file to the maintainer.

**Applying:** `npm run source:apply -- changeset.json --dry-run`, then without `--dry-run`. Every op carries what it was made
against (record hash, previous decision, current game text). If anything changed since — a newer import, another decision, a
hand edit — the whole changeset is refused and nothing is written. The result must also pass the content validator.
Then review `git diff src/content`, run `npm run validate:content` and `npm test`, commit, deploy.

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

1. Register the source in `sources.json` (title, url, license, attribution, `adapter`, `reuse`, optional `variety`).
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
