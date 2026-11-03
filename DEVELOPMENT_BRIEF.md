# Hanzi Hunters — architecture and current state

This is the technical handoff: what the product is for, how the code is organised, where state lives, how quality is checked
and what is still open. Game rules are in `docs/GAME_DESIGN.md`; everything else is reachable from the map in `README.md`.
The code is the authority: when this document disagrees with it, fix this document.

## 1. Product intent

A portrait, mobile-first browser RPG for complete Mandarin beginners: learn a small piece of Chinese, use it to fight a monster,
earn a reward, come back stronger. It should feel like a compact fantasy adventure, not a quiz in a game skin.

- **Audience:** people with little or no Mandarin, playing short sessions on a phone.
- **Teach before testing:** a new word is shown on its own card before it is ever asked.
- **Mistakes teach:** a wrong answer explains itself and never shames; it costs a heart, not progress.
- **Learning first:** a reward never makes guessing or speed pay better than knowing (see `docs/GAME_FEEL_AND_PROGRESSION.md` §1).
- **One tap per question, mobile first, desktop compatible.** 360 CSS px is the narrowest supported width.
- **Honest content:** every piece of Mandarin carries its source and review status; nothing AI-written is labelled human-reviewed.

## 2. Architecture

Stack: React 19, TypeScript 5.7, Vite 6, Phaser 3.90 (battle scene only), `vite-plugin-pwa`, browser `localStorage`,
the Web Speech API (text-to-speech) and WebAudio (procedural sound effects). No backend, no runtime network calls except the
Google Fonts stylesheet (`src/styles.css`).

Two pages are built: the game (`index.html` → `src/main.tsx`) and the source review screen (`review/index.html` →
`src/review/main.tsx`, served at `<base>/review/`, never loaded by the game).

### Module map

| Area | Files | Notes |
|---|---|---|
| App shell and screens (React) | `src/App.tsx` (battle flow, state, wiring), `CampScreen`, `EncounterScreen`, `TrialScreen`, `BossIntro`, `NewWordCard`, `ExplainModal`, `SummaryModal`, `LootReveal`, `MenuSheet`, `AppData`, `Hearts`, `entryUi` | UI only; rules are delegated to `src/game/`. |
| Battle scene (Phaser) | `src/game/PixelScene.ts` | Decorative: sprites, animations, hit feedback. Receives events from React; owns no game state. |
| Game rules (pure, tested) | `src/game/rules.ts` (combat, hearts, bosses, depths, `TUNING`), `upgrades.ts`, `rarity.ts`, `runStats.ts`, `flow.ts` (auto-continue) | No React, DOM or Phaser. |
| Learning (pure, tested) | `questions.ts` (question kinds, distractors, fairness), `schedule.ts` (spaced review), `learning.ts` (answer → scheduler), `course.ts` (introductions, review selection, lesson readiness), `mastery.ts`, `status.ts`, `progress.ts`, `habit.ts` | `docs/SCHEDULING.md`, `docs/CURRICULUM.md`. |
| Encounters and boss trials | `encounters.ts`, `trials.ts`, `trialgen.ts`, `scenegen.ts`, `nouns.ts`, `support.ts`, `recent.ts` | `docs/CONTEXTUAL_ENCOUNTERS.md`. |
| Save | `save.ts` (load, sanitise, migrate), `backup.ts` (export/import), `types.ts` | See §3. |
| Content (data) | `src/content/*.json`; loaders and rules in `entries.ts`, `index.ts`, `validate.ts`, `validateCurriculum.ts`, `pinyin.ts`, `recordings.ts`, `provenance.ts`, `curriculumReport.ts`; `src/data.ts` (normalised words, enemies, bosses, gear, curricula) | `docs/CONTENT_GUIDE.md`. |
| Audio | `src/audio.ts` (sound effects, haptics), `src/wordAudio.ts` (recording or TTS per entry) | |
| Source layer and review screen | `src/sources/*` (types, matching, comparison, assessments, changesets), `src/review/*`, `public/sources/` (imported data) | `docs/SOURCES.md`. |
| Tools | `tools/validate-content.ts`, `content-inventory.ts`, `curriculum-report.ts`, `vocab-candidates.ts`, `simulate.ts`, `source-*.ts`, `tools/sources/*` (importer, adapters), `layout-check.mjs`, `brief-reporter.mjs`, `make_pixel_assets.py`, `make_boss_sprites.py` | Run with `npm run …` or `node tools/…`. |

### State ownership and the answer path

React owns all game state (`Saved` plus transient battle state in `App.tsx`); Phaser only renders. Every save change goes
through `withLearning` (`save.ts`), so entry peaks and lesson completion update in the same state update as mastery.

An answer: `buildQuestion` / `chooseKind` (`questions.ts`) make the question from a word picked by `selectReview` / introduced by
the course (`course.ts`) → the player taps once (buttons lock until feedback is dismissed) → `resolveAnswer` (`rules.ts`) applies
damage, hearts and boss effects → `applyAnswer` (`learning.ts`) updates the word's scheduler (`schedule.ts`) → the save is written
to `localStorage`.

## 3. Persistence

| Key | Contents | Rules |
|---|---|---|
| `hanzi-hunters-save` | The game save, `version: 2` (`SAVE_VERSION`). Field list in `docs/GAME_DESIGN.md` (Save format). | Every field is validated on load (`sanitizeSave`); v1 saves are migrated once (`docs/SCHEDULING.md`, Migration); optional fields (`courses`, `peak`, encounter and trial state) are re-derived or dropped safely when missing or invalid. Older keys (`hanzi-hunters-save-v1`, `-v2`, from before expeditions) are deleted on start and never read. |
| `hanzi-hunters-settings-v1` | Player preferences (`src/settings.ts`). | Separate from the save: resetting or importing progress never changes them. |
| `hanzi-hunters-review-v2:<source>` | Review-screen drafts (`src/review/store.ts`). | Separate from the game; v1 drafts are migrated, unreadable drafts backed up. |

Backups: Settings → App & data exports/imports the save (`backup.ts`, accepts save versions 1–2). Progress is keyed by stable
entry id, never by array position or Chinese text.

## 4. Quality checks

- **Automated:** `npm run test:brief` (Node's test runner; rules, questions and fairness, scheduler, course, saves and migrations,
  content audits, sources, balance guardrails). `npm run validate:content`. `npm run build`. CI runs all three before deploying.
- **Layout stability:** `node tools/layout-check.mjs` checks that the battle screen does not move or resize when you answer.
- **Balance:** `node tools/simulate.ts --report` (seeded bot; model results, not evidence about real learners).
- **Browser check:** one check at 360 px when the UI changed (see `AGENTS.md`).

Review checklist for combat and learning changes:
- Only one answer resolves per question (rapid taps); answer buttons stay locked until feedback is dismissed.
- A right answer never costs a heart; a wrong one costs exactly one unless protected (practice, blessing, calm, second chance),
  and never damages the enemy. Hearts clamp at 0 and at the maximum (a higher maximum adds an empty heart).
- Rewards are paid exactly once per enemy; kill, defeat, floor-clear and victory states never overlap.
- Every question has exactly one correct option; no accepted variant, connected-speech form or overlapping meaning is offered
  as wrong (`tests/questions.test.ts`, `tests/multiword.test.ts`).
- A reload mid-run resumes correctly; a corrupt or old save loads safely; ending a run keeps upgrades and word progress only.

## 5. What exists (summary)

Expeditions with hearts, five floor bosses with trials, five depths, a permanent upgrade tree, gear with cosmetic rarity, the
Warden Sigil relic; a curriculum engine with the 100-entry beginner course; a spaced-review scheduler; about ten question kinds
with fairness rules; contextual scenes; new-word cards, explanations, a wordbook, floor/defeat summaries; procedural sound and
haptics; PWA update flow and save backups; an Anki import pipeline with a review screen, AI-assisted assessments and a draft
expansion proposal (`docs/proposals/`). Details: `docs/GAME_DESIGN.md` and the topic docs. History: `CHANGELOG.md`.

## 6. Open work

- **Content review:** all Mandarin (entries, notes, examples, sentence questions, scenes, the course order, source assessments)
  is an AI-assisted draft until a Mandarin teacher reviews it. `npm run validate:content` prints what is unreviewed.
- **Vocabulary growth:** the next batch (`docs/vocabulary-toolkit/`), possibly from the draft proposal
  `docs/proposals/xiehanzi-hsk1.md`. Other meanings of words are deliberately not taught yet (`docs/SENSES.md`).
- **Not supported yet:** erhua syllables, entries longer than 8 characters, new question formats beyond the sentence (particle)
  question (ideas: `docs/GAME_FEEL_AND_PROGRESSION.md` §3), traditional characters (not planned).
- **Art:** the sprite set is small; the Ink Scribe, Mirror Trickster, Echo Wraith and Shield Golem are recolours, the Cavern
  Warden reuses the Golem sprite with a glow (`ASSET_PIPELINE.md`).
- **Release readiness:** install/offline behaviour on real iOS and Android devices is not verified; fonts are loaded from Google
  Fonts and must be self-hosted before any offline claim (`ASSET_CREDITS.md`); an accessibility pass; a data/privacy policy before
  any backend or account feature.
- **Playtests:** balance and scheduling numbers come from a bot; real learners have not been measured.

## 7. Reporting back

When handing work back, include: what changed and why; files changed; commands run with pass/fail results; the browser check
(if the UI changed) and anything that still needs a real device; known limitations and the next recommended step; provenance and
licences of any new art, audio, fonts or content. Never say a build, test or device behaviour is verified unless it was.
