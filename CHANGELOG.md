# Changelog / test log

## 2026-10-31 — Feedback box is for learning, combat result lives in the arena
- Removed the "Your hit / Enemy hit" line from the answer feedback. The combat result is now a small chip strip in the arena (⚔ −17 · 💔 −4, or 🛡 Blocked / No counterattack); on a kill the same strip shows XP, gold and loot instead. The strip is absolutely positioned, so nothing in the layout moves.
- Feedback box: a correct answer reads "✓ Correct — 田 tián · field" (character, sound and meaning together); a wrong answer shows the answer in large text with what you chose struck through. The word note gets up to 3 lines (2 on phones ≤700px tall), and mastery is shown as pips plus a short sentence ("Level up! Now level 2", "One more correct in a row to level up").
- The auto-continue bar now says "✓ Correct" instead of the damage summary. `combatSummary` was removed.
- Checks: `tools/layout-check.mjs` passes in all 8 cases, 56 unit tests pass, and right/wrong answers were checked visually at 411×740.
- Removed the old floating damage numbers (−59 / −9) over the characters; the chip strip is now the only damage display. Hit animations and the COMBO! / WEAK HIT captions stay.
- Arena text is now HTML instead of Phaser canvas text, so it is crisp on high-density phones and uses the same font as the chips. The Phaser scene keeps only sprites, hit animations, the chest, torches and the red defeat veil (removed: floating captions, combo counter, VICTORY plaque, YOU DIED title, unused reward popup).
- New HTML arena HUD: a streak badge top-left (pips and "1 more for 🔥 +25%" until the combo bonus is active, then 🔥 ×N with "+25% next hit"; plain ×N if the Combo Strikes upgrade is not owned), captions over the fighters (🔥 COMBO +25%, WEAK HIT, 🛡 BLOCKED, +N HP), VICTORY / ELITE VICTORY / YOU DIED banners (derived from the run phase, so they survive a reload) and a FLOOR N banner.
- The combo bonus is shown with its real value (the upgrade's % — it does not grow with the streak): caption on the enemy plus an orange damage chip "⚔ −59 · 🔥 +25%". Wrong answers get a grey chip. On arenas shorter than ~100px (phones ≤600px tall) the caption is hidden and the chips carry the information.
- Gear you already own can no longer drop: loot is picked only from gear you do not have, and once you own everything kills drop nothing. The duplicate-gear-to-gold conversion, its "(dup)" chip and the DUPLICATE reward row were removed (`duplicateGold` / `reward.dupGold`); old saves that still contain `dupGold` load fine, the field is ignored. Tests updated: skips owned gear, owning everything drops nothing.
- Bug fix: a correct answer on an already mastered word no longer says "One more correct in a row to level up"; it says "Mastered — keep it sharp".

## 2026-10-31 — Word popups replace instead of stack
- Tapping a related word in an explanation popup now replaces the current popup (one popup at a time, no history), so a single × closes it. The Back button and the popup stack were removed (`ExplainModal` takes a single `hanzi`).
- Checked in a browser: open 女 → tap 她 → tap 他: one popup throughout, no Back button, one close ends it. 56 unit tests pass.

## 2026-10-31 — Bigger pinyin answers, slimmer header
- Pinyin answer options are 27px semi-bold (was ~16px) so tone marks are readable; the word card's pinyin is 24px.
- The in-battle header is a single 38px line ("FLOOR 02 · ENEMY 3 / 4", gold, settings); the brand name and the redundant elite tag were dropped there.
- The choice/feedback slot grows with phone height (`clamp(120px,17dvh,156px)`) so spare space on tall phones goes to the answers, not an empty gap; it is still identical in every state. `tools/layout-check.mjs` passes at all four sizes, and unit tests pass.

## 2026-10-30 — Fixed-slot battle layout (PR 16 follow-up)
- Fixes the arena shrinking and the screen jumping when you answer: the removed `.showing-feedback` rules had resized the arena, word card and fonts whenever feedback appeared.
- Choices and the answer feedback now share one fixed-height slot (`--choice-h`); the long note is clamped to 2 lines inside it (full text is still in the 💡 explanation). The action bar has a fixed height.
- XP, gold, level-up and loot now show in a fixed chip strip over the arena (no layout change; removes the duplicate floating Phaser popup). The old fallback victory reward rows are hidden in battle.
- Short phones (≤700px) hide the location line and use a smaller arena so the question state fits without page scroll; ≤600px uses slightly smaller slots.
- New `tools/layout-check.mjs` (Playwright, needs a running dev server) asserts that arena, card, choices, action bar and tools keep the same top/height between question, wrong answer, and kill-with-rewards at 411×650, 390×844, 360×640, 320×568, with no page overflow. All 8 cases pass.

## 2026-10-30 — Compact dungeon portrait layout
- Implemented the selected Compact dungeon design using the existing React UI, Phaser scene, sprites, tiles, and palette; no new dependencies or assets.
- Mobile header shows the game name, floor/enemy progress, gold, and Settings. The shorter arena retains the combatants and HP; Potion, Gear, and Words are labeled controls below the question panel.
- Answer rows are at least 52px; help/audio buttons are 44px and bottom tools are 48px (44px on short screens). Long answers wrap instead of being truncated.
- New-word questions say “Learn this word.” Existing intro questions, hints, recall questions, speech, save schema, combat balance, and auto-continue preferences are preserved.
- Feedback reports the actual hit/counterattack from `resolveAnswer`, including blocked counters and killing blows with no counterattack. Mobile victory rewards appear in the result panel. Long teaching notes remain readable rather than being reduced to tiny text.
- Phaser uses a single wall row and adjusted sprite placement in short arenas, and clamps damage labels inside the canvas. Desktop HP cards use two equal columns.
- Validation: locked dependencies installed; TypeScript build and Vite production build passed, including PWA generation; all 56 existing tests passed. Existing Phaser bundle-size warning remains.
- Environment: ordinary `npm run build` and the dev server initially encountered an esbuild parent-directory access error in this Windows sandbox. Validation used `node node_modules/typescript/bin/tsc -b` then `node node_modules/vite/bin/vite.js build --configLoader runner`, and served the production output locally. No repository build configuration was changed for this environment limitation.
- Manual browser checks: 320×568, 375×667, 390×844, 430×932, and 1280×900; teaching/recall cards, correct and incorrect answers, potion healing/count, victory and next enemy, Gear/Wordbook drawers, word explanation, Settings, Relaxed auto-advance, and persisted progress after reload. The normal question screen fits the tested portrait sizes without horizontal overflow or vertical scrolling. Long feedback/reward states can scroll on short screens so content and actions stay reachable.
- Limits: desktop browser emulation, not physical iOS/Android testing. No Mandarin voice was installed in the test browser, so actual speech output was not verified. No GitHub push or deployment was performed.

## In progress — mastery-gated auto-advance
- New default **Learn first** setting pauses after every answer until the current word reaches mastery level 2; then correct answers auto-advance after 0.5 seconds.
- Keeps Quick (1 s), Relaxed (2.5 s), and Off available; existing saved preferences remain valid.
- Adds flow and settings tests for the mastery threshold and delay.
- Quick mode also uses a 0.5-second delay for both next questions and next enemies.

## Milestone 0 — baseline (handoff 0.1)
- `npm install` OK (Node 22.22, 4 low-severity advisories in dev tooling, not addressed).
- `npm run build` passed with **no source changes**; only the >500 kB Phaser chunk warning.
- Dev server: no console errors. No horizontal overflow at 320/375/390/430 px.
- Pre-existing problems found by inspection and play-testing (all fixed below):
  1. **Tab freeze**: `PixelScene` called `scene.restart()` on every resize and re-registered its resize listener each time; a long session hung the page at 100 % CPU.
  2. The scene always drew a slime, whatever the enemy.
  3. The word card **printed the answer** (pinyin in pinyin questions, meaning in meaning questions).
  4. The Gear drawer's "Equip" button unlocked any item for free.
  5. Scholar Charm (+10 % XP) had no effect; "wrong answers return later" and the streak counter were not implemented.
  6. Answer options re-shuffled on every render in character mode (and used the same 3 distractors); no lock against multi-tap before React re-rendered.
  7. Enemy max HP shown on the card changed after victory (floor incremented); a save stored at 0 HP resumed in an unwinnable state; only one level-up per fight; reset had no confirmation; `localStorage` access was unguarded.
  8. Phone layout: answers were ~940 px down the page; several tap targets were 26–41 px.

## Milestone 1 — game loop stabilised
- Rules extracted to `src/game/rules.ts` (pure, no DOM): `resolveAnswer`, `usePotion`, `sanitizeSave`, `buildQuestion`, `pickWord`.
- Save key is unchanged (`hanzi-hunters-save-v1`). New optional field `missed`; `sanitizeSave` validates every field, drops unknown gear/words, and tolerates old/corrupt data, so existing saves keep working.
- Missed words are queued (max 10) and re-asked ~40 % of the time until answered correctly. Streak is real (session-only).
- Tests: `npm test` (Node's built-in runner, no new dependency) — 13 tests covering data integrity, one-correct-option, damage/counterattack/killing blow, loot/duplicates, gear bonuses, level-ups, potions, save sanitising, word picking.

## Milestone 2 — pixel-art proof of concept
- New original art (see `ASSET_CREDITS.md`, `public/assets/README.md`): hero (idle×2, attack), slime, imp, bat, 5 dungeon tiles, torch, chest, 9-slice UI frame.
- `PixelScene` rewritten: textured wall/floor, animated torches with glow, per-enemy sprites, lunge/recoil/flash on hits, chest on victory, integer sprite scaling, in-place relayout on resize (no restart), and a flat-colour fallback if textures fail to load.
- Panels use the pixel frame; phone layout compacted so question + answers fit on first screen at 375×667 and up (320×568 scrolls ~85 px); all buttons ≥ 44 px.

### Verification performed (headless Chromium via Playwright, mobile emulation, DPR 2)
- `npm run build` ✔, `npm test` ✔ 13/13, `tsc -b` ✔.
- Scripted play: 300 random actions → 21 fights (10 wins, 11 defeats), no console errors, no hang; triple-tap in one tick resolves one answer; four corrupt-save variants recover; reload keeps progress; gear drawer has no equip buttons.
- Production build served with `vite preview`: all 14 assets 200 OK, canvas renders. Blocking all PNGs: fallback renders, no errors.
- **Not verified**: real iOS/Android devices, real speech-synthesis voices, PWA install/offline, Safari, Firefox, screen readers.

## Not done yet (honest list)
- Milestone 3: emoji/Unicode icons (🧪🎒📚⚔🛡 etc.) in the UI are still emoji; no pixel icon set, no pixel buttons/health-bar art, no death/walk animations, no start/menu screen, no map.
- Milestones 4–5: vocabulary is still the unreviewed 30-word starter set, all prompts are `meaning`/`pinyin` (the `character` mode exists in code but no data uses it), no tutorial, PWA has no icons.

## 0.2 — roguelite loop, word mastery, upgrade tree
- See `docs/GAME_DESIGN.md` for the rules. New: runs of floors × 4 enemies (elite last), compounding enemy scaling, death → banked gold → permanent 4-branch upgrade tree at camp, per-word mastery (5 question types), active word pool, hints, second chance, save v2 + v1 migration, "no Mandarin voice" warning.
- Fixed while rewriting: the "learned after one lucky answer" model, the answer being fixed to one question type per word.
- Tests: `npm test` → 35 tests (questions, mastery, upgrades, rules, save, balance simulation).
- Browser E2E (headless Chromium, 390×844 + 320/375/430 checks; scripted bot using the real DOM): new player intro → perfect play to floor 2 with an elite → deliberate death → camp → buy tiers (locked/affordable/unaffordable states) → new run at level 1 without gear, mastery intact → hint removes exactly one wrong option → reload resumes run → v1 save migration → no horizontal overflow, buttons ≥ 44 px, no console errors. Passed twice in a row.
- Not verified: listening questions (headless browser has no Mandarin voice, so they were exercised only by unit tests), real devices, the balance with real players.

## 0.2.1 — stable battle layout
- The question panel is now four fixed regions (title, **stage**, **choices**, **action bar**). The stage shows the word card, then the feedback recap, then the victory/defeat banner in the same box; choices become the reward tiles after a win; the action bar shows Listen/Hint, then a single Continue / Next enemy / Descend / Go to camp button in the same place. Victory and defeat now need one tap instead of two.
- Potion/Gear/Words buttons moved into the scene's top bar; combat cards compacted; on phones the scene height is calc(100dvh - 690px) so a whole fight fits one screen at 390×844 and up.
- Verified by `stable.mjs` (headless Chromium): stage, choices and action bar have identical top/left/size in the asking, wrong-feedback, right-feedback and victory states at 390×844, 430×932, 375×667, 320×568 and 1100×800. The page fits with no scrolling at 390×844, 430×932 and desktop; 375×667 scrolls ~51 px and 320×568 ~150 px (positions still identical in page coordinates).
- Fixed a 0.2 regression: the Phaser scene did not appear on first load or after reloading mid-run (the mount point only existed one render later). Added a browser-test assertion for both cases.

## 0.2.2 — fit-to-viewport phone layout, fullscreen, installable
- Real-device feedback (Brave on Android) showed the *visible* page is only ~650 CSS px tall because browser bars take the rest, so the previous fixed-pixel layout did not fit. The phone layout (≤ 850 px wide) is now a flex column sized from `dvh`: the scene takes the leftover height, the answer panel scales with screen height, and the whole fight fits without scrolling.
- Level, floor, run gold, potion/gear/wordbook buttons and a **Fullscreen** button live in the scene's top bar; the title bar is hidden during fights. Fullscreen uses the Fullscreen API (hidden where unsupported, e.g. iPhone Safari) and tries to lock portrait.
- After answering, the recap takes over the stage + choices area (more room, shows your answer next to the correct one, reward chips on victory); the action bar and its Continue / Next enemy / Go to camp button never move. The note text shrinks to fit (`useFitText`) instead of clipping.
- Toasts auto-dismiss, float over the scene (not over buttons) and ignore taps; gear/wordbook are overlays.
- PWA: icons (192/512/maskable/apple-touch) generated by the asset tool, manifest `display: standalone` + `display_override: [fullscreen, standalone]`. Installing it ("Add to Home screen" / "Install app") removes the browser bars entirely — **install behaviour not yet verified on a device**.
- Fixed: the panel width depended on its content (`align-items:start` leaked into the phone flex layout).
- Tests (headless Chromium, DPR 2.25): `fit.mjs` — stage+choices area and action bar identical in asking / wrong / right states at 411×650, 375×560, 390×664, 411×860, 320×480, 768×1024, no scroll, no horizontal overflow, canvas present; `notes.mjs` — all 30 teaching notes fit the recap box at 650/560/480 px heights (smallest font 14.5 px); e2e flow, 35 unit tests, build all pass.

## 0.2.3 — combat numbers stay in the scene, no duplicate text
- Damage dealt (`-13` over the monster) and taken (`-5` over the hero) now pop in with the hit animation and **stay on screen** until the next question; they were fading after < 1 s. `BLOCKED` shows when Second Chance prevents a counter, potions show `+HP` over the hero.
- Loot (or the duplicate-gear gold) appears once as a single line in the scene; XP, gold, level-up and loot are listed once in the victory recap. The "Loot found / Enemy defeated" toasts and the damage text in the feedback box are gone; toasts remain only for speech warnings.
- Recap content stacks naturally with the reward chips pinned to the bottom; `Run.reward` gained `dupGold` (old saves default it to 0).
- Verified (headless Chromium, 411×650 and 375×560): 8+ real victories incl. level-ups, loot and duplicates — chips fit, no clipping (smallest note font 14 px), no console errors; stability/fit suites and 35 unit tests pass.

## 0.3 — explanation popups + content pipeline
- New popup (💡) with extra explanations per word: opens from the answer recap (pulses after a wrong answer) and from the Wordbook; supports text, tips, breakdown ("built from"), compare (look-alikes) and example blocks, related-word buttons with back navigation, Escape/backdrop to close. Shipped examples: 他, 她 (he/she: look at the left part 亻 vs 女) and 好 (= 女 + 子).
- Vocabulary moved to `src/content/words.json`; explanations in `src/content/explanations.json`; strict validator (`npm run validate:content`, also run in CI and in `npm test`) with precise error paths; `docs/CONTENT_GUIDE.md` with formats, rules, patterns, checklist and an agent prompt; `?word=<hanzi>` preview aid.
- Fixed a leak: the Wordbook showed the pinyin/meaning of the word currently being asked; it is now hidden until answered.
- Tests: 41 unit tests (6 new content/validator tests incl. negative cases); browser test (phone 411×650 + desktop): forced 她 question → wrong answer → pulsing 💡 → popup fits viewport, related chip + back, Escape, layout unchanged, Wordbook entry opens popup, no console errors.
- The explanation text is **not yet reviewed by a Mandarin speaker**.

## 0.3.1 — clearer death screen, combo counter, tags on the numbers
- **Death:** the hero collapses (grey, on its side), the scene turns red with a persistent `YOU DIED`, the title row reads `💀 You have fallen` in red, and the recap becomes a dark-red card naming the killer ("The Moss Slime struck the final blow."). The long "you fell on floor N…" text was removed from the recap (the camp screen shows it) and the note font recovered from 10 px to 16 px. Reloading on a death screen restores it.
- **Combo counter** (`COMBO ×N`, from 2 in a row) sits in the scene's top-left corner; the streak chip in the panel is gone.
- **Tags on the floating numbers:** `COMBO!` / `WEAK HIT` on the damage dealt, `COUNTER!` on the damage taken; the recap title now only says `✦ Correct!` or `↻ Not quite`.
- Removed the 文 icon next to the question (a leftover from the prototype, no meaning in the game).
- Verified (headless Chromium 411×650): seeded streak-2 run → correct answer shows COMBO! + counter 3; 1-HP run → wrong answer shows the death scene, recap fits, camp button present, reload keeps the death screen, no console errors; 41 unit tests, content validation, fit/stability, notes-fit and the full e2e flow pass.

## 0.3.2 — clearer kills, no always-on COUNTER tag
- The `COUNTER!` tag was shown on every enemy hit; it is removed. **A stronger counter after a wrong answer is NOT implemented** (monster counters still do the same damage after right or wrong answers; this was tried, then backed out at the user's request, rules/balance unchanged). `COMBO!` and `WEAK HIT` tags on the damage dealt remain.
- **Kills are clearer:** white flash + pixel burst + short screen shake, then a persistent gold `ENEMY SLAIN!` / `ELITE SLAIN!` banner on the wall between the torches (until the next enemy) and the chest. `YOU DIED` moved to the same wall spot so neither covers the characters. Both banners survive a reload.
- Fixed: with an elite enemy (or big numbers) the scene's top bar pushed the fullscreen button off-screen; the left text now truncates and the item buttons are fixed (checked at 320–411 px wide with extreme values).
- Verified (headless Chromium 411×650): normal and elite kill → banner, next-enemy button, reload keeps it, next enemy clears it; death scene; top bar at 4 widths; 41 unit tests, content validation, fit/stability, notes-fit, explanation popup and full e2e flows pass.

## 0.4 — content: +20 words, +15 explanations (from an external content patch)
- Source: `hanzi-hunters-content-update.zip` (plain JSON from another agent; nothing in it was executed). Words added: 七 九 上 下 手 目 田 石 门 车 马 鸟 鱼 米 父 母 家 学 生 年 (now 50). Explanations added for 日 月 人 大 一 不 木 十 石 女 子 上 下 马 目 (now 18 with 他 她 好).
- Edited before merging (accuracy and format): rewrote the 日/月 and 木/目 and 石/十 shape descriptions (the originals were vague or wrong, e.g. "curved-looking sides"), switched 女/子 from `breakdown` (which draws "A + B", implying a false sum) to `compare`, replaced unrelated `related` links, used vocabulary examples for 一 (一天) and 不 (不好), added 日 vs 口 and 上·中·下 tips, removed `confusable` from 目/石 (it means "too close in meaning", not homophones), fixed groups (学→learning, 生→life, 年→time, 门/车→things, 米→food), removed a note that mentioned the game's limits, added the everyday word 眼睛 to 目.
- Validator: 0 errors, 5 intentional warnings (parts/examples outside the vocabulary: 也 亻 它 们 个 妈 妹 眼 睛). 41 unit tests, pacing simulation (floors unchanged), notes-fit test over all 50 words, all 18 popups open/fit/link at 411×650, full browser flows pass.
- **Still needs review by a fluent Mandarin speaker** (listed in the report): see the open questions in the hand-over message.

## 0.5 — question variety (Phase 1)
- **10 question kinds** instead of 4 (intro, char→meaning, char→pinyin, meaning→char, audio→char, **meaning→pinyin, pinyin→char, audio→meaning, audio→pinyin, homophone, look-alike**). Every kind counts the same for mastery (2 right in a row = level up, a miss = down).
- **Scheduler** (`chooseKind`): per-level weight tables (early = recognise; developing = all directions; higher = mixed + discrimination), fair-only filtering, no back-to-back repeats, and a session-only weak-area boost for kinds the player keeps missing. No save-format change.
- **Homophone safety:** sound-only questions are never asked when the learner already knows a word that sounds identical (木/目, 他/她, 十/石); a homophone question with a meaning cue is used instead. Pinyin-answer questions are unaffected.
- **Wrong answers only from words the learner has met** (padded with the earliest words while the known list is tiny), never overlapping/confusable meanings, tone-change readings or homophones where that would be ambiguous.
- New optional `lookalike` field in `words.json` (validated; seeded for 日 月 口 · 人 大 天 · 木 目 · 十 石 · 他 她 · 上 下 · 一 二 三); `?kind=<kind>` preview parameter next to `?word=`.
- The word card now shows the meaning or the pinyin as the big cue when the character is hidden; audio kinds use a big speaker button.
- Fixed: the first question of a session could never be an audio question because the voice check ran after the first card was built; speech failures can no longer throw out of the effect.
- Tests: 45 unit tests (every word × level × kind: 4 unique options, exactly one correct; level tables; homophone/look-alike/known-words rules; repeat rate and weak-area boost); browser: all 10 kinds rendered at 411×650, a 61-question seeded session served 7 kinds with 5 % repeats and 0 unanswerable questions, full e2e + explanation, death/kill, fit suites still pass.
- Not verified: real Mandarin voices on a phone (audio kinds were exercised with a stubbed voice), balance with real players, whether the weights feel right.

## 0.5.1 — stable word card (nothing jumps between question types)
- The word card is now three fixed slots — character, pinyin, meaning — each with its own height and font size for every question kind. A hidden field always shows the same placeholder (`？`, `? ? ?`, `“ ? ”`); the field being asked is gold, the others are dimmed; revealed cues use the normal style. The earlier layout swapped the meaning or the pinyin into the big character slot depending on the kind.
- One speaker button, 44 px round, always in the card's top-right corner: in the question (pulsing gold ring when listening is the cue) and in the answer recap (same box, with 💡 beside it when an explanation exists). The old big speaker block, the bar "Listen" button and the recap's inline speaker are gone. The action bar shows Hint, or "Choose an answer" when there are no hints.
- Test (`slots.mjs`, headless Chromium, 411×650, 411×860, 320×568, 1100×800): for all 11 kinds the slot rectangles, speaker, card, choices and action bar are pixel-identical, and the speaker keeps the same right edge/top/size from question to answer. Plus the unit, fit, notes-fit, explanation, death/kill, variety and full e2e suites.

## 0.5.2 — placeholders optically centred
- The big placeholder was the fullwidth `？`, whose glyph sits left of centre in its box, and the `? ? ?` row had trailing letter-spacing; the big mark appeared between the 1st and 2nd `?` below it. It is now a regular `?` (Manrope bold) and the pinyin placeholder is padded to cancel the trailing space.
- Measured with `centre.mjs` (pixel analysis of screenshots at 3× DPR, 411×650, 411×860, 320×568, 1100×800, kinds character / meaning→pinyin / pinyin→character): the big `?` is within 0.3 px of the card centre and `? ? ?` within 1.5 px. `slots.mjs`, fit, unit and e2e suites still pass.

## 0.6 — safe updates and progress backup
- Problem: the PWA's service worker keeps serving the cached old version, and the only way users could force a refresh was "Clear site data", which also deletes the save (localStorage).
- **Update app** button (camp → App & data): unregisters the service worker, deletes the offline caches and reloads with a cache-busting URL; localStorage is never touched.
- **New-version banner:** each build writes `version.json` (git commit + time). The app fetches it (no cache) at start and when returning to the foreground; if it differs from the running build a dismissible banner offers "Update" (progress and a mid-run state are kept). The running build id is shown in the camp.
- **Export / import progress:** downloads `hanzi-hunters-progress-<date>.json` (validated and sanitised again on import; v1 prototype saves and bare v2 saves are accepted; wrong files are rejected with a message).
- Verified on the production build (headless Chromium, service worker active): a planted stale cache is deleted and progress is intact after Update; the banner appears mid-run against a newer `version.json` and updating keeps the run; export → wipe → import restores gold, upgrades and mastery; wrong file rejected; no page errors. +3 unit tests (48).
- Not verified: behaviour inside an *installed* PWA on a real phone, iOS Safari.

## 0.7 — mute, auto-continue, settings menu
- **Sound setting** (⚙ → Sound; default on; stored in `hanzi-hunters-settings-v1`, separate from the save): when off nothing is played automatically and listening questions are never asked; muting during a listening question swaps it for a normal question on the same word. The card's speaker shows 🔇 and tapping it turns sound back on.
- **Auto-continue** (⚙ → Quick 1 s / Relaxed 2.5 s / Off; default Quick): a right answer no longer opens the recap. The card reveals the answer in its own slots (green), the correct choice is highlighted, and the game moves on by itself: next question after ~1 s, next monster ~1.5 s after a normal kill. Tap the card or "Tap to continue" to skip; the timer waits while a popup, drawer or the settings are open. **It always pauses** after a wrong answer (full recap), after defeat and after clearing a floor (elite kill); loot, level-ups and new words do not pause (rule in `src/game/flow.ts`).
- **Rewards without a screen:** `+XP ◈gold`, `LEVEL UP!`, `LOOT: …` rise at the bottom centre of the scene and fade on their own (they outlast the next monster spawning); the gold counter pops `+N`, the XP bar shows `+N XP`, and the Gear button gets an orange NEW dot until opened.
- **⚙ settings sheet** replaces the fullscreen button in the scene bar and camp header (still four buttons): Sound, Auto-continue, Fullscreen, and the App & data tools (update, export, import) that were camp-only.
- Verified (headless Chromium 411×650): `auto.mjs` — 28 checks covering reveal layout identical to the question, tap-to-skip, relaxed timing, normal kill → next monster by itself with counters, wrong answer / wrong-but-kills / elite kill / defeat all pause, Off restores the old flow, settings block the timer, mute (swap, persist, no listening questions in 25 cards, tap-to-unmute), loot dot; plus 52 unit tests (new `flow` + settings tests), slots/fit/explanation/death/kill/variety/e2e suites and the update-app test.
- Not verified: real-phone timing feel, real Mandarin voices, how Quick feels for slower readers (hence Relaxed/Off).

## 0.7.1 — reward popup fixes, gold icon, no ELITE tag in the top bar
- **Stuck / stacking reward popups (bug):** the popup lived outside the scene's rebuilt layer and its fade-out was a tween; when the next monster spawned the scene rebuilt and `tweens.killAll()` froze the popup half-faded forever, and the next one landed on top. Now: one popup at a time (a new one replaces the old one), a timer-based guaranteed removal (timers survive the rebuild), and the fade is restarted after a rebuild so it ends on time. The fade is slow (starts at ~30 % of the 2.8 s life).
- Gold is shown with a 🪙 coin and in gold (an old CSS rule greyed it) everywhere it appears: scene bar, camp, upgrade costs, recap chips, reward popup.
- Removed the ELITE tag from the scene's top bar (the enemy card says "Elite …" and the kill banner says ELITE SLAIN). The floor text is shortened (`F3 · 4/4`, `F3·4/4` below 380 px) and shrinks before the gold amount does; the redundant `+N` gold pop next to the counter was removed (the scene reward popup shows it). Hidden below 340 px.
- Tests (`pop.mjs`, dev-only scene handle `window.__hhScene` compiled out of production): popup survives a rebuild and is gone after its lifetime; mid-life alpha < 0.95; four quick popups → one on screen; real kill → next monster → no leftovers; top bar has no ELITE tag, coin present, gold colour, nothing overlaps (411/375/360/320 px, extreme values). All earlier suites still pass.

## 0.7.2 — level 0 is easier
- Feedback: a level-0 word was asked as "Which character means “four”?" with 四 六 九 五 (all numbers) as options — too hard right after meeting the word.
- **Easy first step:** a word at level 0 with no correct answer yet (new, or demoted back to 0) now always gets character → meaning with the pinyin shown. After one correct answer, listening and meaning → character can appear (`FIRST_STEP` in `questions.ts`).
- **Wrong answers scale with the level:** level 0 and the intro use clearly different words (other families first, look-alikes last); level 1 mixed; level 2+ same family first (as before). Applies to every question kind that offers hanzi or meanings.
- Tests: 53 unit tests (new: first-step kinds; zero same-family wrong answers at level 0, many at level 3, mixed at level 1; no look-alikes at level 0; easy intro). Browser (`lv0.mjs`): 14 fresh level-0 questions for 四 were all character → meaning with no other numbers offered; after one correct answer, a mix with still no other numbers. Existing suites pass.
- Not verified: whether the difficulty curve now feels right to real learners (it is tunable in `KIND_WEIGHTS` / `difficultyFor`).

## Hosting
- `.github/workflows/pages.yml` runs `npm ci`, `npm test`, `npm run build` (with `BASE_PATH=/<repo>/`) and deploys `dist/` to GitHub Pages on every push to `main`. One-time setup: repo Settings → Pages → Source = "GitHub Actions".
- `vite.config.ts` reads `BASE_PATH` (default `/`). Verified locally by building with `BASE_PATH=/hanzi-hunters/` and serving with `vite preview --base`: all assets 200, textures render. The deployed Pages site itself has not been verified yet.


## Gear loadout foundation (in progress)
- Added three mutually exclusive gear slots (Weapon, Armor, Accessory) and expanded the loot pool to eight items with distinct attack, HP, armor, XP, mastery-damage and gold effects.
- Inventory now distinguishes found items from equipped items. Loot auto-equips only into an empty slot; players can equip or replace owned gear from the character panel.
- Existing v2 saves are sanitized into a compatible loadout by equipping the first owned item in each slot; no save key change or progress reset.
- Automated test/build results pending review of the feature branch.
