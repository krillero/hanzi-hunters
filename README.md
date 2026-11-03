# Hanzi Hunters

A mobile-first browser game that teaches complete beginners simplified Mandarin Chinese through short roguelite RPG
expeditions. You answer questions about words to fight monsters; your word knowledge persists between runs and is scheduled
for spaced review. Work in progress: playable, but the Mandarin content and teaching order are AI-assisted drafts that a
Mandarin teacher has not reviewed yet.

**New here (person or coding agent)? Read `AGENTS.md` first**, then `DEVELOPMENT_BRIEF.md` (architecture and current state),
then the doc for your task from the map below.

## Quick start

Requirements: Node.js **22.18+** (tests and tools run TypeScript directly via Node's type stripping; the source importer also
uses `node:sqlite`), npm.

```bash
npm install
npm run dev          # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm run build        # TypeScript project build + Vite production build
npm run preview      # serve the production build
```

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript check of `src`, `tools` and `tests` (the build checks only `src`; Node runs tests and tools without checking types). |
| `npm test` / `npm run test:brief` | All tests (`tests/*.test.ts`, Node's test runner); `test:brief` prints only failures and a summary. `npm run test:brief -- tests/x.test.ts` runs one file. |
| `npm run validate:content` | Validates everything in `src/content/` (words, explanations, sentence questions, curricula, encounters, trials, source decisions, assessments). |
| `npm run curriculum` | Prints the effective teaching order of the active course. |
| `npm run inventory` | Regenerates `docs/content-inventory.json` (what content exists, and the validator limits). |
| `npm run vocab:candidates -- 字 词` | Checks candidate words against existing entries, HSK levels and CC-CEDICT (see `docs/vocabulary-toolkit/`). |
| `node tools/simulate.ts --report` | Balance simulator (seeded bot). |
| `npm run source:import` / `source:assess` / `source:apply` / `source:promote` | Imported learning sources and the review screen (`docs/SOURCES.md`). |

Deployment: GitHub Pages from `main` (`.github/workflows/pages.yml` runs validation, tests and the build); pull requests get a
preview (`pr-preview.yml`). The source review screen is at `<site>/review/` (not linked from the game).

## What the game is today

- **Expeditions:** 5 floors of 4 fights, each floor ending in a boss with its own rule and a one-question trial; a final boss;
  5 depths with harder question mixes. Hearts instead of HP: a wrong answer costs one heart, a right one never does.
  Gold is banked when a run ends and buys permanent upgrades at camp. Full rules: `docs/GAME_DESIGN.md`.
- **Learning:** a course of lessons (`src/content/curricula.json`, default: `beginner-mandarin-100`, 100 entries in 20 lessons);
  new words are introduced on a card, then asked in about ten question kinds (meaning, pinyin, written form, listening,
  homophones, look-alikes, particle sentences). Each word has a level 0–5 (New … Retained, Mastered) driven by a spaced-review
  scheduler. Short contextual scenes between floors use only words the player knows.
- **Content:** 127 entries in `src/content/words.json` (the course teaches 100), with notes, explanations and examples. Every entry
  teaches one beginner meaning group; other uses are deferred (`docs/SENSES.md`).
- **Tech:** React 19 + TypeScript + Vite; Phaser 3 draws the battle scene with small original pixel-art sprites; PWA (offline
  cache) via `vite-plugin-pwa`; saves in `localStorage` with export/import; browser text-to-speech for pronunciation.
- **Not there yet:** a teacher review of the Mandarin, real-device verification of install/offline behaviour, production art
  beyond the small sprite set, other meanings of words, accounts or cloud saves (there is no backend).

## Documentation map

| If you are working on… | Read |
|---|---|
| Anything (rules for agents, testing workflow, definition of done) | `AGENTS.md` |
| What is settled and why, and what is still open for the owner | `QUESTIONS-AND-DECISIONS.md` |
| Bugs whose cause was not where the symptom pointed (read before debugging something odd) | `docs/PITFALLS.md` |
| Architecture, modules, state ownership, saves overview, open work | `DEVELOPMENT_BRIEF.md` |
| Game rules: expeditions, hearts, bosses, upgrades, gear, balance, save format | `docs/GAME_DESIGN.md` |
| Word levels and spaced review | `docs/SCHEDULING.md` |
| Scenes between floors and boss trials | `docs/CONTEXTUAL_ENCOUNTERS.md` |
| Words, explanations, examples, sentence questions (formats and rules) | `docs/CONTENT_GUIDE.md` |
| One beginner meaning group per entry now; deferred uses later (intent) | `docs/SENSES.md` |
| Teaching order, lessons, course progress | `docs/CURRICULUM.md` |
| Choosing the next batch of vocabulary | `docs/vocabulary-toolkit/README.md` |
| Handing a content task to another agent | `docs/AGENT_PROMPT.md` (small edits), `docs/vocabulary-toolkit/NEXT-BATCH-PROMPT.md` (a new batch) |
| Imported sources (Anki decks), the review screen, assessments | `docs/SOURCES.md`; proposals in `docs/proposals/` |
| Art, sprites, asset licences | `ASSET_PIPELINE.md`, `public/assets/README.md`, `ASSET_CREDITS.md` |
| Game-feel principles and ideas not built yet | `docs/GAME_FEEL_AND_PROGRESSION.md` |
| What changed and how it was tested (history) | `CHANGELOG.md` |

When docs and code disagree, the code is right; fix the doc in the same change.

## For players

- **Newest version without losing progress:** ⚙ Settings → App & data → **Update app** (or the "new version available" banner).
  Progress is stored separately. **Export progress** there makes a backup file. Do not use the browser's "Clear site data": it
  deletes the save.
- **On a phone:** ⛶ (top right) for fullscreen, or install it: Android Chrome/Brave menu → *Install app*; iPhone Safari Share →
  *Add to Home Screen*.
