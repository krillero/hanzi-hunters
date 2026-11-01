# Prompt: the next 100 words

Two versions: use **A** for a coding agent working in this repository, **B** for an outside assistant that cannot push (it delivers a ZIP that is reviewed and applied later).

## A. Agent working in the repository

> Prepare the next 100 beginner Mandarin vocabulary entries for Hanzi Hunters.
>
> Read `AGENTS.md`, `docs/CONTENT_GUIDE.md`, `docs/CURRICULUM.md` and `docs/vocabulary-toolkit/README.md` (including "Known issues") first, and follow its workflow. Work on a branch.
>
> Keep the first 100 (`beginner-mandarin-100`) and all existing ids intact. Add the next entries as **new lessons after the existing ones**; do not insert entries into existing lessons. Use `npm run vocab:candidates` to find which candidates already exist, and reuse suitable supplemental entries (in `words.json` but not in the active curriculum) before creating duplicates. The goal is 100 additional curriculum entries, not necessarily 100 new `words.json` records.
>
> Sources: run `bash docs/vocabulary-toolkit/tools/fetch-cedict.sh` for a fresh CC-CEDICT, and use `reference/hsk-map.json` for official levels (check flagged rows against the PDF). HSK level is a filter, not a teaching order: order by usefulness and prerequisites and explain the order. Use dictionary pinyin, declare neutral tones, record valid `variants`, and put tone changes under `speech`, never HSK's tone-changed pinyin as the dictionary reading.
>
> For every entry: short accurate note, safe `questions`, fair distractors (`confusable`, `audio: "none"` for polyphones), and simple examples mostly within known vocabulary. Label everything `ai-draft`; never call it human-reviewed. Register any new source in `sources.json` with its real license.
>
> Edit only `src/content/*.json` (plus `docs/vocabulary-toolkit/` notes for the next batch). Run `npm run validate:content`, `npm run curriculum`, `npm run inventory`, `npm test` and `npm run build`, and play the new lessons at 320 px width. Report the ordered list, files changed, warnings left, what you were unsure about, and what a Mandarin teacher must review. Update `docs/vocabulary-toolkit/` (README known issues, `reference/package-state.json` or a new batch file) so the following batch can start from it.

## B. Outside assistant (delivers a ZIP)

> Prepare the next 100 beginner Mandarin vocabulary entries for Hanzi Hunters: https://github.com/krillero/hanzi-hunters/
>
> Read the latest `main`: `AGENTS.md`, `docs/CONTENT_GUIDE.md`, `docs/CURRICULUM.md` and `docs/vocabulary-toolkit/` (start with its `README.md`, including "Known issues"). Do not assume older toolkit copies, the archived scripts or a past baseline are current. Record the `main` commit you started from.
>
> Keep the first 100 and all stable ids intact; add new lessons after the existing ones. Determine whether existing supplemental entries belong in the next 100 before adding duplicates (`npm run vocab:candidates` lists them). The goal is 100 additional curriculum entries, not necessarily 100 new dictionary records.
>
> Use the official HSK syllabus and a fresh CC-CEDICT as documented starting points; verify sources, versions, licensing, senses and pronunciations. Order entries by useful communication and prerequisites and explain the order; HSK gives no official teaching rank. Use dictionary pinyin with `neutral`, `variants` and `speech` as the content guide describes.
>
> Audit all proposed entries and any existing descriptions you change. Supply short accurate notes, safe question modes, fair distractors and simple examples with explicit prerequisites. Prefer trustworthy reusable examples if their license allows; otherwise label original examples honestly as drafts. Never call AI-reviewed text human-reviewed.
>
> Run `npm run validate:content`, `npm run curriculum`, `npm run inventory`, `npm test` and `npm run build`, and report actual results and limitations. Avoid game-logic changes.
>
> Deliver a ZIP with: repo-relative changed files (complete replacements of `src/content/*.json`), install instructions naming the base commit, the ordered 100-entry list, audit and source evidence, licenses, validation results, and an updated `docs/vocabulary-toolkit/` for the following batch. Do not push or publish.
