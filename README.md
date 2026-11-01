# Hanzi Hunters — developer handoff

Hanzi Hunters is a mobile-first browser-game prototype that teaches absolute beginners Mandarin Chinese through short RPG encounters. This repository is a **vertical slice / work in progress**, not a finished game.

## Quick start

### Requirements
- Node.js **20.19+** (or a current supported Node.js LTS release)
- npm (bundled with Node.js)
- Internet access for the first dependency install

### Install and run
From the project root:

```bash
npm install
npm run dev
```

Vite prints a local URL, usually `http://localhost:5173`. The dev script already binds to `0.0.0.0`, so the network URL Vite prints can be opened on a phone connected to the same Wi-Fi as the development computer. If the phone cannot connect, check the computer firewall and make sure both devices are on the same network.

### Verify a production build
```bash
npm run build
npm run preview
```

`npm run build` runs TypeScript project builds followed by Vite. **Build status: verified** (see `CHANGELOG.md` for exactly what was run). `npm test` runs the rules/save/content/curriculum tests (no extra dependency; needs Node 22.18+ for built-in TypeScript stripping).

## Project map

```text
hanzi-hunters/
├── AGENTS.md                 # instructions for coding agents
├── DEVELOPMENT_BRIEF.md      # product, architecture, state and roadmap handoff
├── ASSET_PIPELINE.md         # visual-art requirements and integration guidance
├── ASSET_CREDITS.md          # provenance/licence of every asset
├── CHANGELOG.md              # what changed, how it was tested, what is still missing
├── tools/make_pixel_assets.py# generates public/assets/*.png (Pillow; output is committed)
├── tests/rules.test.ts       # node --test suite for src/game/rules.ts and data integrity
├── README.md                 # setup and overview
├── package.json              # scripts and dependencies
├── index.html                # page shell and document metadata
├── vite.config.ts            # Vite + React + PWA plugin configuration
├── tsconfig.json
├── tsconfig.app.json
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx              # React entry point
    ├── App.tsx               # game UI, battle flow, progression and local save
    ├── data.ts                # vocabulary, enemy and gear data
    ├── styles.css             # responsive visual styling
    └── game/
        ├── rules.ts           # pure combat/progression/save/question logic (tested)
        └── PixelScene.ts      # Phaser scene: textured dungeon, sprites, animations, fallback
```

## Current prototype features
- React UI and a Phaser-rendered dungeon encounter scene.
- Three enemy definitions and four gear definitions in `src/data.ts`.
- Starter vocabulary (30 entries) containing Hanzi, pinyin with tone marks, English meanings, question prompts, answer choices and learning notes.
- Multiple-choice questions; correct answers deal more damage than incorrect answers.
- XP, levels, gold, potions, gear bonuses, a wordbook and browser-local save data.
- Browser speech synthesis for pronunciation where the browser has a suitable voice.
- Responsive layout and Vite PWA plugin configuration. Production install/offline behavior still requires testing.

## Important limitations
- The Phaser scene now uses a small original pixel-art set (hero, 3 enemies, tiles, torch, chest, UI frame). It is a proof of concept, **not** the full asset pack shown in the concept mockup; UI icons are still emoji.
- Screenshots in `docs/screenshots/` are of the real running game (headless Chromium, mobile emulation).
- The mockup is a visual target/reference, not a screenshot of the running application and not a bundle of production assets.
- There is no backend, account system, cloud save, analytics or multiplayer.
- Local progress is stored in the browser using `localStorage`; different browsers/devices do not share progress.
- Gear is a prototype system: owned items are unlocked/equipped and bonuses stack. There is no full inventory/equipment-slot management yet.
- Vocabulary is a starter set, and the shipped curriculum order is provisional, not a reviewed course. Have a qualified Mandarin educator review linguistic content and the teaching order before public release.
- PWA setup is present, but HTTPS deployment, installability, offline behavior and mobile-device behavior have not been verified.

## Suggested first task for a new agent
1. Read `AGENTS.md`, `DEVELOPMENT_BRIEF.md` and `ASSET_PIPELINE.md`.
2. Run `npm install`, `npm run build` and `npm run dev`; record and fix any existing errors.
3. Test the main combat loop, save/load, mobile layout and browser console.
4. Only then begin the next milestone from the development brief.

## Seeing the newest version (without losing progress)
The game caches itself for offline use, so a normal reload can show an old version. In the game: **⚙ Settings → App & data → Update app** (or tap **Update** on the "new version available" banner). Your progress is stored separately and is not deleted. **Export progress** there saves a backup file you can import again, for example before clearing browser data. Do not use the browser's "Clear site data": it deletes the save.

## Adding words and explanations
Vocabulary (single characters, multi-character words, grammar particles), example sentences, sentence questions and their sources are JSON files in `src/content/`. **The teaching order is a separate curriculum file** (`src/content/curricula.json`, see **`docs/CURRICULUM.md`**); the order of `words.json` does not matter. The shipped curriculum is a provisional compatibility course; `docs/CURRICULUM.md` §7 explains how to install the reviewed 100-word course. `npm run curriculum` prints the effective teaching order. See **`docs/CONTENT_GUIDE.md`** (format, rules, checklist and a ready-made prompt for another agent). Validate with `npm run validate:content`; preview any word with `/?word=她`. To hand content work to another agent use `docs/AGENT_PROMPT.md`; `npm run inventory` regenerates `docs/content-inventory.json` (what exists now).

## Playing on a phone
Use the ⛶ button (top right) for fullscreen. For the best experience install it: Android Chrome/Brave menu → *Install app* / *Add to Home screen*; iPhone Safari Share → *Add to Home Screen*. The installed app runs without browser bars.

## Game loop (0.2)
See `docs/GAME_DESIGN.md`. Short version: fight through floors of 4 enemies (last one is an elite), answer questions to deal damage, die, bank your gold, buy permanent upgrades at camp, and restart at level 1 with no gear — your word mastery persists and unlocks harder question types.

## Controls / game loop
Choose one of the answer options for the displayed Chinese word. **A correct answer attacks the enemy and never costs a heart. A wrong answer costs one heart** (your first practice of a new word is free, and second-chance upgrades can save a heart). At zero hearts the run ends; clearing a floor restores a heart, and a potion restores one. Defeating enemies awards XP and gold, with a chance of gear. Full rules: `docs/GAME_DESIGN.md` (Hearts). The wordbook lists words learned through correct answers. If the player is defeated, they can restart the run while retaining persistent progression as implemented in the prototype.
