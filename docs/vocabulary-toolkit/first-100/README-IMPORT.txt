HANZI HUNTERS: FIRST 100 WORDS CONTENT PACKAGE
Prepared: 2026-11-01
Base main commit: dbc1d29b8de0bdc9da637fb4a79c6361a8bc5c48

CONTENTS
- src/content/: five complete replacement JSON files, ready for the existing engine.
- tests/eligibility.test.ts: one test-fixture-only correction. The old test assumes the shipped ma-student question has no prerequisites. The new test explicitly constructs an ungated fixture, preserving the original assertion while allowing real exercises to have prerequisites.
- test-fixture-compatibility.patch: the same test change as a small reviewable diff. Do not apply it again if you copied the full test file.
- docs/first-100-words.html: readable ordered list with descriptions and official references.
- docs/existing-63-audit.html: decisions and before/after descriptions for every original entry.
- docs/dictionary-checks.json: exact dictionary matches for all 127 retained entries.
- docs/examples-for-review.json: 20 unique original examples needing teacher review.
- docs/SOURCE-NOTES.txt: attribution, licenses, pronunciation conventions and source hashes.

WHAT CHANGES
The active curriculum contains exactly 100 distinct entries in 20 lessons of 4-6 entries. It combines 36 existing entries and 64 new entries. All 63 original IDs are retained, so total vocabulary storage is 127 entries, not 100. The other 27 are excluded from the new introduction sequence but can still be reviewed by existing players. Compatibility course is retained for saved lesson IDs.
Each lesson requires readiness in the previous lesson. Sentence exercises declare prerequisites. The 了 exercise is retained for old progress, but 了 is not introduced in the first 100. Official references: 98 level-1 entries and two level-2 entries (咖啡 and 累).

INSTALL
1. Create a Git branch and back up/export a real save before testing.
2. Compare your main with the base commit above. These are complete replacement content files; merge intervening content changes instead of overwriting them.
3. Copy src/content/*.json into the corresponding repository directory.
4. Copy tests/eligibility.test.ts, or apply test-fixture-compatibility.patch. This changes a test fixture only, not game logic. If main has changed that test, merge the small diff manually.
5. Optionally copy docs/ reports for maintainer review.
6. Run npm run validate:content, npm run curriculum, npm test, npm run inventory, and npm run build.
7. Review the diff and commit the individual files. Do not upload only the ZIP to the repository expecting GitHub to unpack it.

CURRENT ENGINE SAFEGUARDS
This package uses per-entry question eligibility instead of modifying engine code. Bare-character pronunciation questions are disabled for dictionary polyphones; they can be restored when meaning-context questions are implemented reliably. Meaning-to-pinyin and listening-to-pinyin are restricted where synonyms, neutral-tone variants, or connected-speech changes could make them misleading. Straightforward isolated single-reading syllables retain these modes. Existing unsupported TTS readings remain disabled. This is deliberately conservative, not a claim of device audio verification.

RELEASE STATUS
Dictionary-checked editorial draft, NOT human-reviewed. Keep provisional and review labels until a qualified Mandarin teacher reviews the course. Source definitions and pronunciations have been checked; original teaching notes and sentence naturalness still warrant human review.
The previously identified engine issue where newly inserted words inherit prerequisite satisfaction from a completed lesson is outside this content-only package. Fix that before public release, especially for later course updates. This new course has a new stable curriculum ID.

See docs/VALIDATION.txt for exact checks and limitations.
