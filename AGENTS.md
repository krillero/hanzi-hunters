# Instructions for coding agents

You are continuing a working prototype. Before editing, read `README.md` (what exists, commands, documentation map) and
`DEVELOPMENT_BRIEF.md` (architecture and current state), then the doc for your task from the map in `README.md`
(`ASSET_PIPELINE.md` only for art work). When a doc and the code disagree, the code is right: fix the doc in the same change.
Before changing a rule or a settled behaviour, check `QUESTIONS-AND-DECISIONS.md`; before debugging something odd, check
`docs/PITFALLS.md`.

The rules below were each learned by breaking them. Change a rule only for a reason you can write down beside it.

## Rules of engagement
1. **Validate before changing.** Install dependencies and run `npm run build`. Report any pre-existing failures separately from regressions you introduce.
2. **Do not mistake concept art for implemented assets.** Mockups (`docs/design-references/`) are targets only. The scene uses a small set of original, code-generated pixel-art sprites (`public/assets/`); the interface uses CSS, text and emoji. No polished external asset pack is bundled.
3. **Keep the game playable at each milestone.** Prefer small, reviewable changes.
   **Testing workflow (keep it cheap):**
   - While working, run only the test files you touched or that cover the changed code, with the compact reporter: `npm run test:brief -- tests/rules.test.ts`. It prints one block per failure (test, message, expected/actual, file:line), so a failure never needs a second run just to see why it failed. Do not rerun the whole suite after every edit.
   - Once, before committing: `npm run typecheck` (src, tools and tests: Node runs tests and tools without checking types), `npm run test:brief` (all tests, ~30 s), `npm run build` (and `npm run validate:content` for content changes).
   - Some rules are enforced by tests: `tests/conventions.test.ts` (pure modules, storage, clock, 360 px, review status), `tests/generated.test.ts` (generated files current, imported data not hand-edited), `tests/docs.test.ts` (paths in docs exist, every doc on the README map). When a new rule can be checked by a script, add it there with its reason.
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

11. **One beginner meaning group per entry.** An entry teaches its written form, pinyin and a small, useful, beginner-friendly meaning group: one meaning, near-synonyms, or a deliberately chosen compact combination of common beginner uses (下 “below / down”; 想 “think / want to”). Other uses are deferred: notes may mention one only while saying it is not taught here; examples, questions and distractors never depend on one; never add a second entry with the same hanzi and pinyin. Source order, HSK membership and identical characters do not decide what is taught first, and a slash in a label is neither required nor forbidden. Rule, comparison cases and open label decisions: `docs/SENSES.md`. The intended later step, deferred uses unlocked from the Retained level, must not be built without the owner's go-ahead.
12. **Content tasks (words, explanations) follow `docs/CONTENT_GUIDE.md`.** Edit only `src/content/*.json`, run `npm run validate:content` and `npm test`, and report anything you were unsure about for human review.
13. **Imported sources follow `docs/SOURCES.md`.** Never edit `public/sources/` by hand (re-run the import), never mark imported or AI-produced content as human-reviewed, and adopt source content only through mappings/selections (review screen changeset or the same files).

## Code standards

**The goal:** anyone, person or agent, finds the right place for a change without reading the whole codebase, and understands that
code once there. Keep each file focused on one thing so edits stay small and bugs stay local.

**Readability beats cleverness.**
- Write the boring version: a loop a reader can step through beats a chain of `.filter().reduce().flatMap()` that must be decoded.
- Name the intermediate: `const alreadyShown = new Set(recent)` on its own line beats inlining it into a condition.
- One idea per line; no ternary inside a template literal inside a call argument.
- Comment the *why*, never the *what*. Flag the non-obvious: an ordering that matters, a load-bearing fallback, a field whose
  meaning depends on another. Those break when someone edits confidently.
- Past ~4 parameters, use an options object: positional arguments of the same type get swapped silently.

**Where things go** (module map: `DEVELOPMENT_BRIEF.md` §2):
- Game, learning and content rules are pure functions in `src/game/`, `src/content/`, `src/sources/`: no React, Phaser or browser
  globals, time passed in. Components render and wire; they do not decide rules.
- Tunable numbers live in one named constant (`TUNING` in `rules.ts`, the scheduler constants, `upgrades.ts`), learning content in
  `src/content/*.json`, never inline in components.
- The save is read and written only through `src/game/save.ts` (`sanitizeSave`, `withLearning`); browser storage only in `App.tsx`
  and `ReviewApp.tsx` (enforced by `tests/conventions.test.ts`).
- One word per concept, used the same way everywhere: an *entry* is one vocabulary item (one written form, reading and meaning;
  the `Word` type in code, keyed by its entry id); *level* is the mastery level 0–5 with the names in `LEVEL_NAMES` (Familiar,
  Retained, Mastered mean only those levels); *introduce* is the new-word card; *practice* is the protected first question
  (`Saved.practiced`). Do not add a synonym for an existing concept.

**Duplication rule.** Before adding a helper, look in `src/game/`, `src/content/` and `src/sources/`. Extract when the duplicated
thing is a *rule*, not when lines merely look alike. The test: *if this rule changed, would I have to edit every copy?* If yes,
extract it and name it after the rule; if no, leave the copies (a shared helper with a mode flag is harder to read).

**Large files.** Over ~300 lines is a signal to *look*, not an instruction to split. Split along a real seam: a sub-component with
its own state, a hook when a component has more than one data-loading effect, a pure function when a component holds a rule.
Current offenders: `src/App.tsx` (~1,100 lines), `src/styles.css` (~1,700), `src/review/ReviewApp.tsx` (~600); split them when a
change touches a seam, not as a project of its own.

**Generated files are never edited by hand.** Edit the script's input and rerun it (`npm run inventory`, `npm run source:import`,
`npm run source:assess -- report`, `tools/make_pixel_assets.py`). `tests/generated.test.ts` fails when an output is stale or
imported data was edited.

## Working with the owner

- **Review every change for coherence** before calling it done, as a player would meet it: does it behave like its neighbours
  (same words, same feedback, same tap count for the same kind of action), and has the game grown a new concept where an existing
  one would have done? If the code or the flow became noticeably more complex, say so and simplify.
- **Designs and mockups are PNG images** the owner can open on a phone, one per option, before and after side by side, drawn from
  the real components and styles (not an impression of them); what is new is marked as new. Never ASCII sketches or a list of words.
- **Record decisions:** when the owner settles something a future agent might undo, add it to `QUESTIONS-AND-DECISIONS.md`.
- **Record pitfalls:** when a bug's cause was not where its symptom pointed, add it to `docs/PITFALLS.md`.

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
