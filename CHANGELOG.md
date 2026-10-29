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

## Hosting
- `.github/workflows/pages.yml` runs `npm ci`, `npm test`, `npm run build` (with `BASE_PATH=/<repo>/`) and deploys `dist/` to GitHub Pages on every push to `main`. One-time setup: repo Settings → Pages → Source = "GitHub Actions".
- `vite.config.ts` reads `BASE_PATH` (default `/`). Verified locally by building with `BASE_PATH=/hanzi-hunters/` and serving with `vite preview --base`: all assets 200, textures render. The deployed Pages site itself has not been verified yet.
