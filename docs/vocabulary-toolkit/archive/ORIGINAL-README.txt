HANZI HUNTERS — REUSABLE VOCABULARY TOOLKIT

Start with NEXT-BATCH-PROMPT.txt. Attach this toolkit to the next conversation,
or store its extracted files under docs/vocabulary-toolkit in your repository.
This is a saved workflow and evidence bundle, not an installed ChatGPT skill.
An assistant in a new conversation will need the files attached or accessible
in the repository; do not assume it remembers this conversation.

WHAT IS PRESERVED
- Exact source URLs, attribution, licenses, pronunciation conventions and hashes.
- CC-CEDICT compressed dictionary snapshot, with CC BY-SA 4.0 attribution in
  reference/SOURCE-NOTES.txt. Refresh it when preparing a later batch.
- Extracted HSK mappings, first-batch selected IDs and dictionary evidence.
- The complete first-100 ZIP, including the audit of all 63 original entries.
- Original Python generation/report scripts, archived verbatim for reference.
- A portable checker to find candidate IDs already present in current content.
- Known validation limits and a repeatable research/review workflow.

RESEARCH LOCATIONS USED FOR THIS BATCH
Repository: https://github.com/krillero/hanzi-hunters/
Baseline main commit: dbc1d29b8de0bdc9da637fb4a79c6361a8bc5c48
CC-CEDICT dictionary landing page and published download: SOURCE-NOTES.txt.
Official HSK landing page and syllabus PDF: SOURCE-NOTES.txt.
These are the substantive sources preserved in the available records, not a
complete browser/search-query history. No trusted published sentence corpus was
imported: the 20 unique example sentences were original editorial drafts.
The HSK PDF is linked, not redistributed. Its level order is not a teaching order.

TOOLS AND PROCEDURES
Git clone/fetch/show/diff and isolated worktree: inspect main, preserve existing
IDs, compare original content, avoid publishing unrelated changes.
Python standard library: JSON editing, gzip dictionary parsing, Unicode handling,
source hashes, HTML reports and ZIP packaging. See archived scripts for details.
PDF text extraction: pdftotext and pdfplumber; official table needed layout-aware
column extraction and filtering rotated watermark glyphs. Always visually verify
ambiguous rows: 好 showed 1(2)(4), and naive extraction misread its level as 2.
Node/npm: repository validator, curriculum/inventory reports, test suite and build.
Browser/Playwright: attempted, but executable was unavailable; no UI/audio pass.
Web retrieval: official source discovery and verification. Shell/patch tools:
local content edits and packaging. File upload tools: saving completed ZIPs.
These hosted tools are environment-dependent; the archive does not install them.

ARCHIVED SCRIPT CAUTION
archive/build_pack.py and archive/finish_pack.py contain absolute paths and
hardcoded first-batch content. They overwrite content/output files, depend on
the original baseline, and are NOT a general next-100 command. Read and adapt
them only in a disposable worktree. Final package adjustments and validation
were performed after generation, so the archived scripts alone are not a full
one-command reproduction. The saved first-100 ZIP is the authoritative output.

REPEATABLE WORKFLOW
1. Fetch current main; read AGENTS.md and content/schema guides. Record commit.
2. Audit current vocabulary, curriculum membership and saved-progress behavior.
3. Refresh primary sources; record URLs, versions, retrieval date, licenses/hash.
4. Select 100 additional entries by practical usefulness, frequency evidence when
   available, prerequisites and grammar coverage. HSK level is a filter, not an
   exact rank. Reuse suitable supplemental entries before duplicating them.
5. Verify each sense/reading, neutral tones, variants and tone sandhi. A dictionary
   match is evidence of an attested reading, not proof of the entire teaching note.
6. Draft concise notes and examples. Keep examples mostly within known vocabulary;
   explicitly tag new prerequisites. Check source reuse rights before copying.
7. Check synonyms, homophones, polyphones and distractors against actual question
   modes. Do not make valid alternatives count as wrong answers.
8. Preserve IDs and earlier teaching order. Check curriculum migration/versioning;
   inserting into completed lessons can accidentally bypass readiness checks.
9. Run current repo validation, curriculum, inventory, tests and build. Verify
   new-user progression, existing saves, UI and device audio where available.
10. Produce upload-ready files, full audit, per-entry sources, review status and
    validation report. Keep original notes/examples ai-draft until human review.

FIRST-BATCH FINDINGS TO RECHECK, NOT ASSUME FIXED
149 tests passed with one fixture-only correction included in the saved ZIP.
Content validator: 0 errors, 23 warnings; review warnings remained intentionally.
Build failed at Workbox/Terser on both package and baseline in that environment.
Completed-lesson readiness for newly inserted entries was an unresolved engine
issue outside the content-only task. Check latest main before relying on this.
Avoid claiming bare characters are ordinary spoken words: 父/母 vs 爸爸/妈妈,
子 vs 孩子, 木 vs 树, 日 vs 太阳, and 目 vs 眼睛 need careful explanations.
是 is not universal yes; 不 is not universal no. 二/两 and 年/岁 need context.
学生 has dictionary/official-source pronunciation differences: record variants.
Do not invent etymologies or turn a mnemonic into a historical claim.

PORTABLE CANDIDATE CHECK
python3 tools/check_candidates.py /path/to/current/src/content/words.json candidates.json
candidates.json must be an array of objects with hanzi and optional id/pinyin.
This flags existing IDs and repeated candidates; it does NOT validate Mandarin.

Licensing: see reference/SOURCE-NOTES.txt for vocabulary and dictionary rights.
Archived scripts and newly authored workflow/checker may be reused and adapted.
