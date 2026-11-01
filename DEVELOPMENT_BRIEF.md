# Hanzi Hunters — product and engineering handoff

## 1. Product intent

**Hanzi Hunters** is a portrait-friendly, mobile-first browser RPG for complete Mandarin Chinese beginners. The core promise is: learn a small piece of Chinese, use it to fight a monster, earn a reward, and return stronger. The experience should feel like a compact fantasy adventure rather than a quiz wrapped in a game skin.

### Intended audience
- Learners with little or no Mandarin knowledge.
- People playing in short sessions on a phone.
- Players who benefit from seeing Hanzi, pinyin with tone marks, English meaning and hearing a pronunciation.

### Product principles
- Teach before testing: display enough context to make the question understandable.
- Encourage mistakes: incorrect answers should give useful feedback and another opportunity to learn.
- Make progression legible: XP, gold, gear and learned words should have clear effects.
- Short interactions: a battle question should be answerable with one tap.
- Mobile first, desktop compatible.

## 2. Current implementation — source of truth

The source code is the authority for what is currently implemented. A concept image generated during planning is **not** a specification of existing features or assets.

### Stack
- React 19 + React DOM
- TypeScript 5.7
- Vite 6
- Phaser 3.90 for the encounter scene
- `vite-plugin-pwa` for PWA-related configuration
- CSS for responsive interface styling
- Browser `localStorage` for persistence
- Browser Speech Synthesis API for pronunciation playback

No server/API is present. No external art asset pack is bundled.

### Main modules
- `src/main.tsx`: creates/mounts the React app and imports styles.
- `src/App.tsx`: owns player/save state, combat, questions, rewards, inventory/wordbook drawers and most interface rendering.
- `src/data.ts`: typed word records plus static enemy and gear lists.
- `src/game/PixelScene.ts`: Phaser scene. It draws a grid-like dungeon, torches, a simple hero and slime using `Graphics`; tweens provide idle motion and hit feedback.
- `src/styles.css`: colors, layout, panels, buttons, cards, feedback states and responsive rules.
- `vite.config.ts`: development/build configuration and PWA plugin.

### Current features in the code
- 30 starter Chinese vocabulary records.
- Question categories: meaning and pinyin are represented in the word data, while the app has question-type state that also includes character. Check the current data and UI behavior before expanding question modes.
- Three enemy definitions: Moss Slime, Ember Imp and Cave Bat.
- Four gear definitions: Copper Blade, Scholar Charm, Mossy Vest and Lucky Coin.
- Combat, HP, enemy HP, correct/incorrect answer feedback, XP, gold and progression.
- Potions, gear bonuses, learned-word tracking and a wordbook drawer.
- Local persistence under `hanzi-hunters-save-v1`.
- Responsive React/CSS UI and Phaser canvas scene.

### Not implemented / not to be assumed
- The full-screen illustrated start/menu screen from the concept.
- A production-quality pixel art sprite atlas, tileset or animated sprite sheets.
- Full map navigation, room selection, branching dungeon generation or treasure exploration.
- A complete equipment system with mutually exclusive slots, item stats, selling or crafting.
- Enemy-specific abilities, boss fights, skill trees or a robust tutorial.
- Accounts, cloud saves, analytics, multiplayer or server-side data.
- A complete spaced-repetition system or curriculum aligned to HSK standards.
- Verified production PWA/offline behavior.

Some of these may appear in the concept mockup but are not part of the current build.

## 3. Existing game loop and mechanics

Read `src/App.tsx` for exact logic before changing numbers. The following is a high-level description; implementation details may need balancing.

1. The player sees an enemy and a Chinese word.
2. The player chooses an answer from a set of options.
3. Correct answers deal a stronger attack; incorrect answers deal a weak attack and allow a counterattack under the current rules.
4. The game shows feedback, the correct answer and a short learning note.
5. Defeating an enemy awards XP and gold and may award gear.
6. XP contributes to leveling. Leveling improves character survivability/strength according to current code.
7. Gear bonuses can affect attack, HP or gold rewards; the current implementation is intentionally simple and some bonuses may need a careful balance/implementation review.
8. Potions restore HP during a fight.
9. Correct answers can add a Hanzi to the learned-word list; the wordbook shows learned entries.
10. Progress is saved in the current browser. Defeat/restart behavior retains some permanent progress as described in the README and code.

### Combat review checklist
- Ensure answer controls disable after the first tap until feedback is dismissed.
- Ensure enemy death, player defeat and victory states cannot overlap.
- Check whether the final blow correctly prevents an unnecessary counterattack.
- Check HP clamping at 0 and max HP, including after gear or level changes.
- Verify enemy HP scaling by floor and the displayed HP denominator agree.
- Verify rewards are awarded exactly once per enemy.
- Verify random gear drops are understandable (only gear you do not own yet can drop; no duplicate conversion).
- Verify that a restart does not unintentionally reset permanent progress or keep stale battle state.

## 4. Save data and data structures

`App.tsx` defines the `Saved` state shape and `SAVE_KEY = 'hanzi-hunters-save-v1'`. The current save includes fields such as level, XP, gold, HP/max HP, attack, learned Hanzi, gear names, potions and floor. The precise shape in source wins if this document becomes outdated.

### Save safety
- `localStorage` may contain malformed or older data. Keep parsing defensive and validate fields before trusting them.
- If the schema changes, introduce a migration or a new key with migration from the old key. (Current: `version: 4`; v3 added per-curriculum lesson completion `courses`, v4 entry readiness history `peak`; older saves are migrated on load. See `docs/CURRICULUM.md` §4.)
- Do not store credentials or sensitive personal data.
- Add an in-game reset/save-delete option only with clear confirmation.
- Consider a small save validation function and tests before adding more state.

### Vocabulary data
Each word is defined in `src/data.ts`. Entries include Hanzi, pinyin, meaning, prompt type, answer choices, answer and a learning note. Maintain consistent field names and keep answer strings exactly aligned with the choices. Avoid duplicated Hanzi keys unless intentional. Tone marks and Unicode must survive editing/building.

Before expanding vocabulary:
- Verify each character, pinyin, tone and meaning.
- Keep distractors plausible but unambiguously wrong for the question.
- Explain polysemy/context where relevant.
- Avoid treating simplified/traditional variants as interchangeable without a decision.
- Have a qualified speaker/educator review content before release.

## 5. UX and visual direction

### Target style
A polished, cohesive 16-bit/pixel-art fantasy RPG: deep navy/charcoal dungeon backgrounds, warm torchlight, mossy greens, readable gold highlights, chunky pixel forms and high-contrast UI. The interface should feel handcrafted but remain highly legible on small displays.

### Current reality
- The scene is generated from Phaser `Graphics`, not sprites.
- The UI uses CSS, text, Unicode symbols and emoji for many icons.
- No production sprite sheets, character illustrations, dungeon tiles, icon atlas or illustrated screens are included.
- A generated promotional collage is a **visual concept**, not a real screenshot and not an asset source. Do not claim the game currently matches it.

### Mobile UX requirements
- Portrait layout should be the primary experience.
- Core answer options must be comfortably tappable (target roughly 44 CSS px minimum height where practical).
- Keep Hanzi prominent and pinyin/meaning readable; do not shrink Chinese text to fit a cramped panel.
- Avoid horizontal scrolling at 360–430 CSS px widths (360 px is the narrowest supported width).
- Respect mobile browser safe areas and viewport changes.
- Ensure scrollable drawers/panels remain reachable when the on-screen keyboard or browser chrome changes viewport height.
- Use semantic buttons, visible focus states and accessible labels.
- Do not rely on color alone to indicate correct/incorrect answers.
- Audio playback should gracefully handle browsers that lack a suitable Chinese voice.

## 6. Architecture guidance

### Keep state ownership clear
React currently owns the game state and the UI; Phaser renders the scene and receives visual feedback through a scene reference. Keep this separation unless a deliberate refactor is justified. Do not make Phaser the second authority for HP, current enemy, XP or inventory.

### Suggested future organization (only when needed)
As complexity grows, consider extracting:
- `src/game/gameTypes.ts`: shared types.
- `src/game/gameRules.ts`: pure combat/reward/progression functions.
- `src/game/save.ts`: safe load, validation, migration and save.
- `src/components/`: reusable React panels/buttons/health bars.
- `src/assets/`: licensed images, sprite sheets and audio, with source/credits.

Avoid broad restructuring before getting a baseline build and tests in place.

## 7. Prioritized roadmap

### Milestone 0 — Establish a trustworthy baseline
- [ ] Install dependencies successfully.
- [ ] Run `npm run build`; fix TypeScript/Vite errors.
- [ ] Run the dev server and test the battle loop manually.
- [ ] Inspect browser console and mobile responsiveness.
- [ ] Record baseline known issues and screenshots of the actual running app.

**Acceptance:** clean production build; no blocking runtime errors; documented test results.

### Milestone 1 — Stabilize the game loop
- [ ] Review combat/reward logic for edge cases and duplicate rewards.
- [ ] Add automated tests for pure combat/progression functions once extracted.
- [ ] Validate local save fields and add migration-safe handling.
- [ ] Ensure question prompt type, displayed prompt and answer options always agree.
- [ ] Improve error/empty states and provide a safe reset option.

**Acceptance:** repeatable fights, predictable rewards, valid saves and no softlocks.

### Milestone 2 — Pixel-art proof of concept
- [ ] Create/acquire licensed hero, slime, floor tile, wall tile, torch and chest assets.
- [ ] Establish a consistent pixel grid, palette and export conventions.
- [ ] Integrate one hero and one enemy in Phaser using real texture assets.
- [ ] Confirm texture scaling remains crisp (no unwanted smoothing) at phone sizes.
- [ ] Preserve a fallback if an asset fails to load.

**Acceptance:** one complete encounter looks cohesive and remains responsive; assets have clear provenance/licensing.

### Milestone 3 — Full visual pass
- [ ] Expand environment tiles and enemy/hero animations.
- [ ] Replace emoji-dependent core UI icons with consistent art where appropriate.
- [ ] Create UI panel, button, health bar, reward and item icon treatments.
- [ ] Improve combat animations, hit effects and reward transitions.
- [ ] Add actual screenshots to documentation only after capturing the running game.

**Acceptance:** coherent style across scene and UI; mockup is treated as a guide, not a promise.

### Milestone 4 — Learning design
- [ ] Review and expand vocabulary with educational review.
- [ ] Add explicit question modes (Hanzi→meaning, Hanzi→pinyin, pinyin→Hanzi, listening) only when prompts/options are unambiguous.
- [ ] Consider review scheduling and revisit previously missed words.
- [ ] Add a first-session tutorial and clear explanations of tones/pinyin.
- [ ] Make speech support robust across mobile browsers.

**Acceptance:** beginner can understand the task without prior Chinese knowledge; content is reviewed.

### Milestone 5 — Product readiness
- [ ] Decide on PWA scope and test install/offline behavior on iOS and Android.
- [ ] Deploy HTTPS preview and test on real devices.
- [ ] Add automated tests and a simple CI build if appropriate.
- [ ] Add accessibility pass, performance checks and content/license credits.
- [ ] Define data/privacy approach before any backend/account feature.

**Acceptance:** documented device/browser matrix, reliable build/deploy and clear privacy/content policies.

## 8. Manual test plan

Run these after baseline build and after relevant changes:

1. Load the game in a fresh browser; confirm default stats and first encounter render.
2. Answer correctly; verify damage, feedback, learning note and progression.
3. Answer incorrectly; verify correct answer is revealed and counterattack rules apply.
4. Tap answer buttons rapidly; verify only one answer resolves.
5. Defeat an enemy; verify victory state, XP, gold and any gear reward are applied once.
6. Continue to next enemy; verify HP/state and enemy HP display reset correctly.
7. Use a potion at low HP; verify heal amount and potion count. Attempt at full HP/zero potions.
8. Open gear and wordbook drawers; close them and verify layout is intact.
9. Learn a word, refresh the page, and verify saved progress returns.
10. Corrupt/remove the local save and reload; verify safe fallback instead of a crash.
11. Reach defeat and restart; verify intended permanent progression persists and transient battle state resets.
12. Test speech playback on supported browsers and confirm graceful failure when unavailable.
13. Test widths around 360, 375, 390 and 430 CSS px (nothing narrower than 360); inspect horizontal overflow and tap targets.
14. Test desktop layout and browser console.
15. Run `npm run build` after code changes.

## 9. Release / reporting expectations

When handing work back, include:
- What changed and why.
- Files added/changed.
- Commands run and pass/fail results.
- Manual tests performed and device/browser used.
- Known limitations and next recommended task.
- Asset provenance and licenses for any new art/audio/fonts.

Never state the build or real-device behavior is verified unless the corresponding command/device test was actually completed.
