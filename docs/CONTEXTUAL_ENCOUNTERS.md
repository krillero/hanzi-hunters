# Contextual encounters

Short optional scenes appear after a non-final floor summary, once per
expedition. Existing depth progression and combat rules remain in charge.

| Scene | Kind | Needs (all introduced) | From course word* |
|---|---|---|---|
| hello | reply: answer 你好！ | 你好 再见 谢谢 | 3 |
| goodbye | reply: answer 再见！ | 你好 再见 谢谢 | 3 |
| sorry | reply: you spilled their water | 对不起 谢谢 你好 | 5 |
| tea | gather: 我要茶。 | 我 要 谢谢 茶 水 米饭 菜 | 65 |
| meal | gather: 我要米饭。我要菜。 | 我 要 谢谢 茶 水 米饭 菜 | 65 |

*Position in beginner-mandarin-100. A new player usually meets a greeting scene
after floor 1 of the first run. Each scene needs only its own words (every
option and every character of its Chinese lines; the validator enforces this),
so no new vocabulary is silently introduced. Among eligible scenes, the one
completed on the fewest distinct days is offered; file order breaks ties.

Kinds: **reply** = choose the one right thing to say (single choice, button
"Say it"); **gather** = choose every item asked for (button "Prepare"). The
title, instruction and button are shared by every scene of a kind, so they never
name the answer. A reply scene's explanation names the answer, so it only
appears after a wrong choice; a gather scene's recipe hint is also shown at the
first stage and with help.

First completion or weak prerequisites: Chinese, pinyin, translation and grammar
explanation. After completion with all prerequisite levels >=1: Chinese/pinyin,
English on request. After completion on two distinct local dates and all levels
>=2: Chinese first, pinyin/translation on request. Stage is frozen per attempt.
At the Chinese-first stage the item pictures are hidden as well (they would give
the answer away); asking for help shows them with pinyin and English. Item order
is shuffled once and persisted. Help is free.

Wrong choices explain and allow editing. Completed scenes show the result and,
if the scene has one, the traveler's closing line (谢谢！ for tea/meal).
These are short visual state changes, not a fully animated crafting simulation.
Completion gives exactly 3 run gold; no hearts, XP, mastery credit, or protection
charges change. Gold follows normal expedition banking. Repeat completion is a
no-op. Skip/Leave consume the offer and move to the next floor. No farmable heal.

## Architecture and persistence
src/content/encounters.json: the scenes (content; format below).
src/game/encounters.ts: scene validation (also run by validate:content),
eligibility, presentation stage, offer/completion transitions, sanitizers.
Option pinyin is read from words.json, the single source of tone marks.
Mandarin is an original AI-assisted draft requiring teacher review; scenes are
not part of the vocabulary review totals. Source inspiration: Hito's World
https://hito.world/play (public recipe structure inspected, no code copied) and
https://www.learnjapaneserpg.com/ (adaptive dialogue concept).

### Scene format (src/content/encounters.json)
- `id` (lower-case), `kind` (`reply` | `gather`), `speaker` (emoji).
- `requires`: word ids from words.json the player must have been introduced to.
  Must include every option and every character used in `zh` / `closing.zh`.
- `situation` (optional English context, shown at every stage; must not
  translate the answer) and/or `zh` + `py` + `en` (the traveler's line).
- `grammar` (optional, first stage only), `note` (explanation of the answer).
- `options`: 2-6 of `{ id, en, icon }`; `answer`: option ids (exactly one for
  `reply`; at least one option must be wrong).
- `result`, `resultIcon`, optional `closing` `{ zh, py, en }`.
Broken scenes are reported by `npm run validate:content` and skipped by the game.
Preview any scene with `/?encounter=<id>&stage=0|1|2`.

src/EncounterScreen.tsx: reusable accessible dialog with focus containment,
Escape/Leave, pressed option states, result feedback, help and scrollable
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

## Preview link
`/?encounter=<scene id>[&stage=0|1|2]` opens a scene on its own, without a run or the
prerequisite words. It never changes the save; Close preview removes the parameter.

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
