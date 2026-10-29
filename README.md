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

`npm run build` runs TypeScript project builds followed by Vite. **Build status at handoff: not verified.** A previous dependency-install attempt timed out in the build environment, so a future developer/agent should install dependencies and run the build before treating the code as validated. Fix errors before starting major feature work.

## Project map

```text
hanzi-hunters/
├── AGENTS.md                 # instructions for coding agents
├── DEVELOPMENT_BRIEF.md      # product, architecture, state and roadmap handoff
├── ASSET_PIPELINE.md         # visual-art requirements and integration guidance
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
        └── PixelScene.ts      # Phaser scene and procedural graphics/animations
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
- The current Phaser scene draws simple graphics from code. It does **not** include the polished, full pixel-art sprite/tile/UI asset pack shown in the concept mockup.
- The mockup is a visual target/reference, not a screenshot of the running application and not a bundle of production assets.
- There is no backend, account system, cloud save, analytics or multiplayer.
- Local progress is stored in the browser using `localStorage`; different browsers/devices do not share progress.
- Gear is a prototype system: owned items are unlocked/equipped and bonuses stack. There is no full inventory/equipment-slot management yet.
- Vocabulary is a starter set, not a reviewed curriculum. Have a qualified Mandarin educator review linguistic content before public release.
- PWA setup is present, but HTTPS deployment, installability, offline behavior and mobile-device behavior have not been verified.

## Suggested first task for a new agent
1. Read `AGENTS.md`, `DEVELOPMENT_BRIEF.md` and `ASSET_PIPELINE.md`.
2. Run `npm install`, `npm run build` and `npm run dev`; record and fix any existing errors.
3. Test the main combat loop, save/load, mobile layout and browser console.
4. Only then begin the next milestone from the development brief.

## Controls / game loop
Choose one of the answer options for the displayed Chinese word. Correct answers deal a stronger attack; wrong answers deal a weaker attack and usually let the enemy counterattack. Defeating enemies awards XP and gold, with a chance of gear. Potions heal during combat. The wordbook lists words learned through correct answers. If the player is defeated, they can restart the run while retaining persistent progression as implemented in the prototype.
