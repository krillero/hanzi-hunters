# Pitfalls

Every entry is a bug that happened in this project and took real time to trace, because its cause was not where the symptom
pointed. Each says what you see, why it happens and what the codebase does about it, so the next change starts with the fix
instead of the bug. **Add an entry whenever a bug's cause was somewhere other than where the symptom pointed.** History of every
change is in `CHANGELOG.md`; this file keeps only the lessons.

---

## Browser, phone and PWA

### Players see an old version after a deploy

**Seen:** a fix is deployed, but phones keep running the previous build, even after a reload.

**Why:** the PWA service worker serves the cached build. The only browser-level way out, "Clear site data", also deletes the save
in `localStorage`.

**Fix:** Settings → App & data → **Update app** (`src/appInfo.ts`) unregisters the service worker, deletes the offline caches and
reloads with a cache-busting URL without touching `localStorage`. Each build writes `version.json` (`vite.config.ts`); the app
compares it with its own build at start and on returning to the foreground, and offers an update banner. Never tell players to
clear site data.

### The layout fits on a computer but not on the phone

**Seen:** a fixed-pixel layout that fits a 390×844 emulator does not fit a real Android phone; the answers are cut off.

**Why:** browser bars take a large part of the screen: the *visible* page on Brave/Android was only ~650 CSS px tall.

**Fix:** the phone layout is a flex column sized with `dvh` (`src/styles.css`): the scene takes the leftover height and the answer
panel scales with screen height. Size from the visible viewport, never from an assumed device height.

### The screen jumps when you answer

**Seen:** the arena shrinks, the word card moves and fonts change size the moment feedback appears.

**Why:** state classes such as `.showing-feedback` resized layout boxes. Any feedback that changes the size of something in the
layout moves everything below it.

**Fix:** fixed slots: feedback lives in an overlay or a box that is already reserved. `node tools/layout-check.mjs` fails when the
battle screen moves or resizes on answering. Run it after any change to the battle screen's CSS.

### The first question of a session is never a listening question

**Seen:** audio questions appear, but never as the first question after loading.

**Why:** browsers load speech voices asynchronously. The first card was built before the voice check had finished, so "no
Mandarin voice" was assumed.

**Fix:** the voice check runs before the first card is built, and a speech failure can never throw out of the effect that builds
it; `App.tsx` also re-checks on the `voiceschanged` event. Treat `speechSynthesis.getVoices()` as eventually available, not as a
value you have on first render.

### The battle scene is missing after a reload

**Seen:** the Phaser scene does not appear on first load, or after reloading in the middle of a run.

**Why:** the scene was created before its mount element existed: the element only rendered one React render later.

**Fix:** create the Phaser game in an effect that runs after the element is in the DOM. Phaser renders only; React owns the state
(`AGENTS.md` rule 5), so the scene can always be recreated from it.

---

## Game state and learning rules

### A sound plays that matches nothing on the screen

**Seen:** at the start of a fight with new-word cards, a word is read aloud behind the card; after "Got it" a different question
appears.

**Why:** the next question was prepared, and spoken, before the new-word card; after the card it was rebuilt so the new word
could be asked.

**Fix:** a question is built and spoken only when it is about to be shown, after any introduction card. Side effects (speech,
sounds) belong to what is on screen, not to what was prepared.

### A caption claims a bonus the player does not have

**Seen:** after a kill that also levelled up, the arena showed "💚 +3 Second Wind" without the Second Wind upgrade.

**Why:** the caption was derived from a difference in state (HP after minus HP before, minus the maximum-HP gain). Another effect
(a level-up heal) changed the same number, and the leftover was attributed to the wrong cause.

**Fix:** feedback comes from the events the rules return (`resolveAnswer` in `src/game/rules.ts` reports what happened), never
from comparing state before and after.

### A word the player never saw unlocks content that requires it

**Seen:** after a curriculum update added a word to a lesson the player had completed, sentence questions and introductions that
require that word became available.

**Why:** "lesson completed" was used as "every entry in it is known". Adding an entry to a completed lesson made it look known.

**Fix:** lesson completion and entry readiness are separate saved facts (`peak` per entry, `entryReady` in `src/game/course.ts`;
`docs/CURRICULUM.md` §3). Never infer what a player knows from lesson membership.

---

## Content and data

### Copying a record drops fields

**Seen:** a new-entry draft from an imported word could not be promoted: validation failed for neutral-tone words (东西 dōngxi),
and accepted variants and the word kind were lost.

**Why:** the draft and the promotion copied a hand-picked list of fields, which did not include `neutral`, `kind`, `variants` or
`speech`.

**Fix:** drafts carry every field a playable entry can have, and promotion derives `neutral` from the pinyin
(`src/sources/changeset.ts`). When a record is copied from one shape into another, list the target type's fields, not the ones
you remember.

### Test fixtures in an old shape pass for months

**Seen:** `npm test` was green, but 79 type errors existed in `tests/` and `tools/`: fixtures built word progress as `{ lv, ok }`,
the shape from before the scheduler.

**Why:** Node runs `.ts` files by stripping types without checking them, and the build's type check covered only `src/`. The tests
passed because they touched only the fields that still existed.

**Fix:** `npm run typecheck` checks `src`, `tools` and `tests` (`tsconfig.tools.json`), and CI runs it. Fixtures use
`sched(lv, ok)` (`tests/helpers/sched.ts`), a real scheduler entry.

### A re-import is not byte-identical

**Seen:** importing the same package twice changed the records file.

**Why:** a decoding error message from `ffprobe` contains a memory address (`[mp3 @ 0x55…]`), different on every run, and it was
stored in the record.

**Fix:** messages from external tools are normalised before they are stored (`probeAudio` in `tools/sources/adapters/anki.ts`).
Anything written into a generated or imported file must be deterministic; `tests/sources-xiehanzi.test.ts` imports twice and
compares.

### Search finds hundreds of irrelevant records

**Seen:** on the review screen, searching “ge” returned 405 records, with 个 fourth.

**Why:** English text was matched anywhere inside a word (“younger”, “age”).

**Fix:** search is ranked (exact characters, readings and ids first) and matches English from word starts only
(`src/sources/search.ts`).
