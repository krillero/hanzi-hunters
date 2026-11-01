# Contextual encounters

Implemented on main b61792a (merged PR #32). Two optional scenes—tea preparation
and serving a rice/vegetable meal—appear after a non-final floor summary, once
per expedition. Existing depth progression and combat rules remain in charge.

The seven prerequisites 我 要 谢谢 茶 水 米饭 菜 must all have entries in current
mastery. This intentionally makes the feature appear later in the first-100
course, not on the first run. An encounter with fewer distinct completed dates
is selected first (ID breaks ties). No new vocabulary is silently introduced.

First completion or weak prerequisites: Chinese, pinyin, translation and grammar
explanation. After completion with all prerequisite levels >=1: Chinese/pinyin,
English on request. After completion on two distinct local dates and all levels
>=2: Chinese first, pinyin/translation on request. Stage is frozen per attempt.
Images remain visible; item order is shuffled once and persisted. Help is free.

Select the exact ingredients and Prepare/Serve. Wrong combinations explain the
recipe and allow editing. Completed scenes show food and the companion's thanks.
These are short visual state changes, not a fully animated crafting simulation.
Completion gives exactly 3 run gold; no hearts, XP, mastery credit, or protection
charges change. Gold follows normal expedition banking. Repeat completion is a
no-op. Skip/Leave consume the offer and move to the next floor. No farmable heal.

## Architecture and persistence
src/game/encounters.ts: authored scenes, labels, prerequisites, presentation
policy, offer/completion transitions, sanitizers. Mandarin is an original
AI-assisted draft requiring teacher review; scenes are not currently included
in the vocabulary validator/review totals. Source inspiration: Hito's World
https://hito.world/play (public recipe structure inspected, no code copied) and
https://www.learnjapaneserpg.com/ (adaptive dialogue concept).

src/EncounterScreen.tsx: reusable accessible dialog with focus containment,
Escape/Leave, pressed ingredient states, result feedback, help and scrollable
body. System emoji provide temporary illustrations; no external artwork/audio.
No pronunciation audio is added for these scenes pending voice/content review.

App.tsx: floor-summary offer and continuation; scene blocks battle auto-advance
and speech. Saved.run.encounter retains offer, order, selection, stage and result.
Saved.encounterHistory records up to 30 unique completion dates per scene.
These are optional additive fields within the current v1 expedition save schema:
old saves default to no offer and empty history, with no reset or new storage key.
The existing sanitizer retains these fields on load/import. Older app versions
will discard the added fields: avoid rolling back an active encounter save.
No promises are made about importing obsolete pre-expedition save formats.

## Validation and review handoff
- Four new rule tests: prerequisites, exact selection/idempotency/banking,
  old and pending saves, distinct-day presentation stages.
- Full test:brief: 178 passed, 0 failed.
- validate:content: 0 errors, 7 existing warnings (scene text has separate review).
- npm run build (tsc + vite + service worker): passes.
- One 360x800 browser check (Playwright, preview build, test-save.json fixture):
  offer shown, wrong selection explained, selection survives reload, completion
  gives +3 run gold once (double tap), Continue starts floor 2 with the FLOOR
  banner, no horizontal overflow, no console errors. Real-device testing pending.
- Leaving an encounter goes through the same `nextEnemy` path as the floor
  summary (floor banner, boss intro, stats reset), not a separate copy of it.

A disposable test-save.json was supplied with the original patch (not committed). Import it only in a
fresh browser profile or after exporting your real progress (it replaces the
current save). It starts at a cleared floor with an encounter ready. Check:
1. Start, select wrong ingredients, read correction, ask for translation.
2. Reload while pending: selection/order/help/stage remain.
3. Complete, tap rapidly: +3 gold only, hearts unchanged.
4. Reload the result, Continue: next floor starts normally, no repeated offer.
5. Return to camp: reward banked once. Replay to see support stages change.
6. At 360x800 verify scrolling, focus, readable text and no horizontal overflow.
7. Test a normal beginner save: encounter stays hidden until words are introduced.

## Balance
Existing simulator does not model optional encounters, so its report is a
baseline reference rather than proof of encounter-adjusted progression.
The added direct reward is bounded at +3 gold per eligible completed expedition;
no combat resources change. Earlier upgrades may still affect later progression.
Baseline report (40 expeditions/player, five seeds): win rates at accuracy
.60/.75/.85/.90/1.00 = 5/61/98/100/100%; average answers = 33/60/60/56/51.
Use the included full report; do not claim those rates include encounter gold.
Future balancing can extend the simulator if this small reward materially changes
purchase timing. Do not change hearts or enemy HP merely to compensate by guess.
