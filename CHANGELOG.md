# Changelog / test log

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

## Hosting
- `.github/workflows/pages.yml` runs `npm ci`, `npm test`, `npm run build` (with `BASE_PATH=/<repo>/`) and deploys `dist/` to GitHub Pages on every push to `main`. One-time setup: repo Settings → Pages → Source = "GitHub Actions".
- `vite.config.ts` reads `BASE_PATH` (default `/`). Verified locally by building with `BASE_PATH=/hanzi-hunters/` and serving with `vite preview --base`: all assets 200, textures render. The deployed Pages site itself has not been verified yet.
