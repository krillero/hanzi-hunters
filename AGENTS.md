# Instructions for coding agents

You are continuing an existing prototype. Read `README.md`, `DEVELOPMENT_BRIEF.md` and `ASSET_PIPELINE.md` before editing.

## Rules of engagement
1. **Validate before changing.** Install dependencies and run `npm run build`. Report any pre-existing failures separately from regressions you introduce.
2. **Do not mistake concept art for implemented assets.** The visual mockup is a target only. The current scene uses Phaser Graphics and the interface uses CSS, text and emoji. No full external sprite sheet or polished UI asset pack is bundled.
3. **Keep the game playable at each milestone.** Prefer small, reviewable changes.
   **Testing workflow (keep it cheap):**
   - While working, run only the test files you touched or that cover the changed code (e.g. `node --test tests/rules.test.ts`). Do not rerun the whole suite after every edit.
   - Once, before committing: `npm test`, `npm run build` (and `npm run validate:content` for content changes). Read only the pass/fail summary.
   - Browser checks are **not** part of the normal workflow. Only when the UI changed, run **one simple browser check at the end, at 360 px width only** (no other widths, no screenshots of every state). If you skip it or cannot run it, say so.
4. **Preserve the core learning loop.** Every battle question should have an unambiguous correct answer; pinyin tone marks must be preserved; the feedback should teach rather than shame; the player should not be able to submit multiple answers to the same question.
5. **Keep React and Phaser responsibilities clear.** React currently owns game state and most UI; Phaser owns the decorative/animated encounter scene. Avoid creating duplicate, conflicting sources of truth for HP, enemy identity or progression.
6. **Mobile-first.** Test narrow portrait widths, touch targets, text wrapping, safe-area spacing and scroll behavior. Do not require keyboard/mouse to complete the core loop.
   **360 CSS px is the narrowest supported width.** The one end-of-task browser check uses 360 px only; do not test below 360 px and do not add styles or media queries that only target screens narrower than 360 px.
7. **Avoid unnecessary dependencies.** Explain why any new runtime dependency is needed. Keep package lockfile in sync if one is created/updated.
8. **Do not claim untested work.** State what commands ran, whether they passed, and what still needs real-device/manual testing.
9. **Protect user progress when changing saves.** `SAVE_KEY` currently identifies the persisted schema. If changing the shape, add a versioned migration or safe fallback instead of assuming every stored value is current.
10. **Document asset rights.** Use original artwork, commissioned art, or assets with a license compatible with the project. Keep source/credits/license information for third-party assets.

11. **Content tasks (words, explanations) follow `docs/CONTENT_GUIDE.md`.** Edit only `src/content/*.json`, run `npm run validate:content` and `npm test`, and report anything you were unsure about for human review.

## Definition of done for a change
- The requested behavior is implemented, not only represented in a mockup.
- `npm run build` passes (or any failure is explained and clearly unrelated).
- The commands that ran (and the single 360 px browser check, if the UI changed) are reported.
- No new console errors or obvious mobile layout regressions remain.
- User-facing learning text and game-state feedback are coherent.
- Documentation is updated if architecture, setup, saves, controls or asset conventions changed.

## Recommended first milestone
Do not immediately rebuild the entire game. First get the current project to build and document any errors. Then create a small art proof of concept (one hero, one slime, one tile set and one UI panel) and integrate it into the current scene before expanding the asset pack.
