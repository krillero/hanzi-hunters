# Instructions for coding agents

You are continuing a working prototype. Before editing, read `README.md` (what exists, commands, documentation map) and
`DEVELOPMENT_BRIEF.md` (architecture and current state), then the doc for your task from the map in `README.md`
(`ASSET_PIPELINE.md` only for art work). When a doc and the code disagree, the code is right: fix the doc in the same change.

## Rules of engagement
1. **Validate before changing.** Install dependencies and run `npm run build`. Report any pre-existing failures separately from regressions you introduce.
2. **Do not mistake concept art for implemented assets.** Mockups (`docs/design-references/`) are targets only. The scene uses a small set of original, code-generated pixel-art sprites (`public/assets/`); the interface uses CSS, text and emoji. No polished external asset pack is bundled.
3. **Keep the game playable at each milestone.** Prefer small, reviewable changes.
   **Testing workflow (keep it cheap):**
   - While working, run only the test files you touched or that cover the changed code, with the compact reporter: `npm run test:brief -- tests/rules.test.ts`. It prints one block per failure (test, message, expected/actual, file:line), so a failure never needs a second run just to see why it failed. Do not rerun the whole suite after every edit.
   - Once, before committing: `npm run test:brief` (all tests, ~20 s), `npm run build` (and `npm run validate:content` for content changes).
   - Browser checks are **not** part of the normal workflow. Only when the UI changed, run **one simple browser check at the end, at 360 px width only** (no other widths, no screenshots of every state). If you skip it or cannot run it, say so.
   - Balance changes: compare options with `node tools/simulate.ts --report key=value` (about 2 s each), then quote one final report in the docs. Do not re-run tools to re-measure something already measured in the conversation.

   **Working efficiently (same quality, fewer tokens):**
   - Apply edits so that one failed edit cannot discard the others: small independent edits (the Edit tool, or one script per file that reports which replacement failed and still writes the rest). Never resend a large script or file because one replacement missed; fix only that replacement.
   - When rules change, update their tests in the same pass, after checking side effects that can change the expected numbers (loot raising max hearts, upgrades bought mid-run, boss items). This avoids fix-and-rerun loops.
   - Read narrowly: search for the lines you need and read that range; do not re-read files already read in the conversation unless they changed.
   - Keep tool output small: summaries, counts and failures, not full logs.
4. **Preserve the core learning loop.** Every battle question should have an unambiguous correct answer; pinyin tone marks must be preserved; the feedback should teach rather than shame; the player should not be able to submit multiple answers to the same question.
5. **Keep React and Phaser responsibilities clear.** React currently owns game state and most UI; Phaser owns the decorative/animated encounter scene. Avoid creating duplicate, conflicting sources of truth for hearts, enemy identity or progression.
6. **Mobile-first.** Test narrow portrait widths, touch targets, text wrapping, safe-area spacing and scroll behavior. Do not require keyboard/mouse to complete the core loop.
   **360 CSS px is the narrowest supported width.** The one end-of-task browser check uses 360 px only; do not test below 360 px and do not add styles or media queries that only target screens narrower than 360 px.
7. **Avoid unnecessary dependencies.** Explain why any new runtime dependency is needed. Keep package lockfile in sync if one is created/updated.
8. **Do not claim untested work.** State what commands ran, whether they passed, and what still needs real-device/manual testing.
9. **Protect user progress when changing saves.** The save lives under `SAVE_KEY` with a `version` (`SAVE_VERSION` in `src/game/save.ts`; format in `docs/GAME_DESIGN.md`). If changing the shape, add a versioned migration or a safe fallback (optional fields re-derived when missing) instead of assuming every stored value is current.
10. **Document asset rights.** Use original artwork, commissioned art, or assets with a license compatible with the project. Keep source/credits/license information for third-party assets.

11. **One meaning per entry.** An entry teaches its written form, pinyin and one basic meaning. Do not teach or test other meanings yet (no second entry with the same hanzi and pinyin, no multi-sense labels, no examples using another sense). The intended later step, other meanings unlocked from the Retained level, is described in `docs/SENSES.md`; do not build it without the owner's go-ahead.
12. **Content tasks (words, explanations) follow `docs/CONTENT_GUIDE.md`.** Edit only `src/content/*.json`, run `npm run validate:content` and `npm test`, and report anything you were unsure about for human review.
13. **Imported sources follow `docs/SOURCES.md`.** Never edit `public/sources/` by hand (re-run the import), never mark imported or AI-produced content as human-reviewed, and adopt source content only through mappings/selections (review screen changeset or the same files).

## Definition of done for a change
- The requested behavior is implemented, not only represented in a mockup.
- `npm run build` passes (or any failure is explained and clearly unrelated).
- The commands that ran (and the single 360 px browser check, if the UI changed) are reported.
- No new console errors or obvious mobile layout regressions remain.
- User-facing learning text and game-state feedback are coherent.
- Documentation is updated if architecture, setup, saves, controls or asset conventions changed. Each topic has one home doc
  (see the map in `README.md`); change it there and link to it from elsewhere instead of repeating it. Add a `CHANGELOG.md` entry.

## Where to start
There is no fixed next milestone. Open work is listed in `DEVELOPMENT_BRIEF.md` §6; the owner usually gives a specific task.
