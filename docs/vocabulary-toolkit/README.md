# Vocabulary toolkit

The workflow, sources and evidence used to choose the **first 100 words** (`beginner-mandarin-100`, added in the "first-100-words" content update). Use it to prepare the next batch.

Start with **[`NEXT-BATCH-PROMPT.md`](NEXT-BATCH-PROMPT.md)**. Content rules are in [`docs/CONTENT_GUIDE.md`](../CONTENT_GUIDE.md); the teaching-order rules are in [`docs/CURRICULUM.md`](../CURRICULUM.md).

## What is here

| Path | What it is |
|---|---|
| `NEXT-BATCH-PROMPT.md` | Copy-paste prompt for the next batch (in-repo agent, or an outside assistant producing a ZIP). |
| `reference/SOURCE-NOTES.txt` | Source URLs, licenses, attribution, pronunciation conventions and source hashes for batch 1. |
| `reference/hsk-map.json` | Levels 1–3 vocabulary (1,000 rows) extracted from the official HSK syllabus (published 2025-11, effective 2026-07): level, entry number, printed page, pinyin. **See "Known issues" before relying on it.** |
| `reference/dictionary-checks.json` | The exact CC-CEDICT lines matched for all 127 entries in batch 1. |
| `reference/examples-for-review.json` | The 20 original example sentences from batch 1, for teacher review. |
| `reference/package-state.json` | Batch 1 selection (ordered ids), their HSK mappings, and the 63 original ids. |
| `reference/VALIDATION.txt` | Batch 1 validation report **as written at the time** (some statements are now outdated, see below). |
| `first-100/` | Reports from the batch 1 package: ordered word list (`first-100-words.html`), audit of the 63 original entries (`existing-63-audit.html`), install notes, test log, and the test-fixture patch. The content files themselves are already in `src/content/`. |
| `tools/fetch-cedict.sh` | Downloads a fresh CC-CEDICT snapshot to `reference/cedict.gz` (git-ignored) and prints its date and SHA-256. |
| `archive/` | The original toolkit README/prompt, the original Python checker, and the batch 1 generation scripts, kept verbatim. |

Candidate checker (from the repository root):

```bash
bash docs/vocabulary-toolkit/tools/fetch-cedict.sh      # optional: adds dictionary readings to the report
npm run vocab:candidates -- 爱 吧 日 看                   # or: npm run vocab:candidates -- candidates.json
```

For each candidate it reports whether the written form already exists, whether that entry is already in the active curriculum or only *supplemental* (in `words.json` but not taught, e.g. 日 山 木 学 生: reuse these before adding duplicates), the HSK level(s) and the CC-CEDICT readings. `candidates.json` is an array of hanzi strings or `{ "hanzi", "id"?, "pinyin"? }` objects. It does **not** check Mandarin correctness.

## Repeatable workflow

1. Fetch current `main`; read `AGENTS.md`, `docs/CONTENT_GUIDE.md`, `docs/CURRICULUM.md`. Record the commit.
2. Audit current vocabulary and curriculum (`npm run curriculum`, `docs/content-inventory.json`, `npm run vocab:candidates`).
3. Refresh primary sources (`fetch-cedict.sh`; the HSK syllabus PDF from `SOURCE-NOTES.txt`). Record URL, version, retrieval date, license and hash.
4. Select entries by practical usefulness, frequency evidence when available, prerequisites and grammar coverage. HSK level is a filter, not a teaching rank. Reuse suitable supplemental entries before duplicating them.
5. Verify each sense and reading, neutral tones, variants and tone sandhi. A dictionary match shows a reading is attested; it does not prove a teaching note correct.
6. Draft short notes and examples, mostly within known vocabulary; declare prerequisites for sentence questions. Check reuse rights before copying any sentence.
7. Check synonyms, homophones, polyphones and distractors against the real question modes (`questions`, `confusable`, `audio`). A valid alternative must never count as wrong.
8. Keep existing ids and earlier teaching order. Prefer appending new lessons over inserting entries into lessons players may already have completed. Since PR #27 an inserted entry no longer inherits readiness from a completed lesson, but appending keeps the course easier to follow (see the migration table in `docs/CURRICULUM.md`).
9. Run `npm run validate:content`, `npm run curriculum`, `npm run inventory`, `npm test`, `npm run build`; play the new lessons in a 320 px window.
10. Keep everything `ai-draft` until a person reviews it. List what a Mandarin teacher must check.

## Known issues found when importing this toolkit (2026-11-01)

* **`hsk-map.json`, 好:** the extracted level was `2`; the printed annotation is `1(2)(4)` and the adjective "good" is level 1. The batch 1 script corrected this only in memory, so the saved file still said 2. **Fixed** in this copy (with a `note`).
* **`hsk-map.json`, 像 (level `4`, entry 896) and 头 (level `3`, entry 445):** these do not fit the numbering (entries 1–300 are level 1, 301–500 level 2, 501–1000 level 3, and the extracted table has no level 4). Probably the same multi-level-annotation extraction problem, but the PDF could not be reached from this environment to confirm. Marked `UNVERIFIED` in the file; check the printed page before using either.
* **HSK pinyin is not always dictionary pinyin.** The syllabus prints tone-changed forms for 一 and 不 words (一下 *yíxià*, 一起 *yìqǐ*, 不客气 *bú kèqi*) and some full tones where CC-CEDICT has neutral tone (回来 *huílái*, 那里 *nàlǐ*, 学生 *xuéshēng*). The game uses dictionary pinyin plus `speech` / `variants` (CONTENT_GUIDE 1.5). Do not copy HSK pinyin straight into `pinyin`. 38 of the 1,000 rows differ from CC-CEDICT this way.
* **Statements now outdated** (in `reference/VALIDATION.txt`, `first-100/README-IMPORT.txt` and the archived README): `npm run build` passes on current `main`; the "newly inserted words inherit completed-lesson readiness" engine issue was fixed in PR #27 (peak levels); the test suite now has 155 tests.
* **Batch 1 example notes:** every example carried the note "Pinyin uses dictionary tones, including yī in 一个", even sentences without 一. Fixed in `src/content/explanations.json` so only the 一个 sentences mention it.
* **Archived scripts** (`archive/build_pack.py`, `archive/finish_pack.py`) use absolute paths (`/workspace/scratch/…`), hardcode batch 1 content and overwrite files. They are a record, not a command. The final batch 1 package was also adjusted by hand after they ran.
* **Not bundled:** the 4 MB CC-CEDICT snapshot (fetch a fresh one) and the nested batch 1 ZIP (its content is in `src/content/`, its reports in `first-100/`). The snapshot used for batch 1 was dated 2026-10-31, SHA-256 `014fcac3…c200552`.

## Lessons from batch 1 to keep applying

* Do not claim bare characters are ordinary spoken words: 父/母 vs 爸爸/妈妈, 子 vs 孩子, 木 vs 树, 日 vs 太阳, 目 vs 眼睛.
* 是 is not a universal "yes"; 不 is not a universal "no". 二/两 and 年/岁 need context.
* 学生 is *xuésheng* in CC-CEDICT and *xuéshēng* in the syllabus: record variants.
* A demonstrative needs a classifier before a noun: 这本书, not 这书.
* Do not invent etymologies or present a memory aid as history.

## Licensing

CC-CEDICT data and anything adapted from it: CC BY-SA 4.0 (attribution in `reference/SOURCE-NOTES.txt`). The HSK syllabus is linked and cited, not redistributed; `hsk-map.json` holds only factual level/page references. The batch 1 vocabulary notes, examples and sequence were supplied under CC BY-SA 4.0. The workflow text and scripts may be reused and adapted.
