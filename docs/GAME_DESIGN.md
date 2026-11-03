# Game design: the rules of the game (current)

The home of the game rules. Word levels and review timing: `docs/SCHEDULING.md`; teaching order: `docs/CURRICULUM.md`; scenes
and boss trials in detail: `docs/CONTEXTUAL_ENCOUNTERS.md`. Numbers here come from the code (`src/game/rules.ts`, `upgrades.ts`,
`src/data.ts`); if they differ, the code is right.

## Loop
1. A run is an **expedition**: **5 floors** (`EXPEDITION_FLOORS`), level 1, no gear, **5 full hearts** and 1 potion (plus any upgrades).
2. Each floor has **4 fights; the 4th is a boss**. Floors 1–4: Shield Golem, Echo Wraith, Ink Scribe, Mirror Trickster. Floor 5: the final boss, the **Cavern Warden**. Beating it **wins the expedition**.
3. Per floor (compounding): enemy HP ×1.16 (`TUNING.enemyHpGrowth`, about what the player gains in attack from levels, so fights keep a similar bounded length), XP/gold +8 %. XP from answers is banked during a fight and paid out on the kill (`Run.pendingXp`).
4. An expedition ends **won**, **lost** (0 hearts) or **returned** (*Return to camp* in Settings). All gold earned is banked every time. Level, gear and potions are lost. **Upgrades and word mastery stay.** Perfect answers always win.
5. At **camp** you see the result ("You beat the Cavern Warden!" / "You fell on floor 3" / "You returned from floor 2") and your current lesson, spend gold on upgrades, then start a new expedition. Stats (incl. expeditions won), backups and reset are in **Settings** (⚙). Camp also shows how many words are ready for review today, and short-term progress on the lesson card: the current lesson (title, words met), how many words are Familiar (+ today, and how many are one step away), and the next milestone within reach (`src/game/progress.ts`). Long-term mastery (Remembered / Retained / Mastered counts) is in the wordbook; the arena strip shows the Familiar count instead of "mastered".
6. **Depths** (see below): winning an expedition unlocks the next depth (5 in total); camp has a depth picker and cleared depths can be replayed.

## Depths (`DEPTHS`, `challengeFor` in `src/game/rules.ts`)
| Depth | Name | Victory bonus |
|---|---|---|
| 1 | Mosslight Cavern | 40 gold |
| 2 | Ember Halls | 80 |
| 3 | Frost Archive | 120 |
| 4 | Sunken Library | 160 |
| 5 | Jade Throne | 200 |

* **Unlocking:** winning depth *d* sets `meta.depthCleared` and unlocks *d*+1 (`unlockedDepth`). Camp shows the chosen depth (default: the deepest unlocked) with a picker for every unlocked depth; replaying a cleared depth never lowers progress.
* **Harder questions, only within taught material:** `challengeFor(depth, floor)` (0 at depth 1 floor 1, rising a little each floor and a lot each depth, 1 at depth 5 floor 5) is passed to `chooseKind`. It multiplies the weight of recall kinds (meaning→pinyin, audio→pinyin, pinyin→char, audio→char, audio→meaning) by up to ×3 and recognition kinds (char→meaning, meaning→char, char→pinyin) by down to ×0.4. It only re-weights kinds already in the word's level table that are fair right now (eligibility, sound, distractors), so nothing new is asked; a new word's first step and particles are unaffected.
* **Rewards and toughness:** enemy gold and XP +25 % per depth (`depthRewardMult`), enemy HP +30 % per depth (`TUNING.depthEnemyHp`), the Cavern Warden another +15 % per depth (`depthBossHpMult`), and the victory bonus (40 × depth) is banked on a win.
* Words always come from the course: depth never changes which entries are introduced or reviewed.

## Hearts (`src/game/rules.ts`)
The player's health is a row of whole **hearts** (`Run.hearts`, the only player-health value). Enemies keep an HP bar but have no attack.
* **Correct answer:** attacks the enemy (attack, combo, execute and mastery bonuses as before). It never costs a heart; there is no counterattack.
* **Wrong answer:** deals no damage and costs **exactly one heart**, on every floor and against every boss, unless it is protected:
  1. **Practice:** the first non-intro question about a newly introduced entry is protected ("Practice · no heart lost" shows before you answer). It is used up by that first answer, right or wrong, and stored per entry in `Saved.practiced`, so reloading, dying or a new run never resets it. The intro question itself (meaning on screen) does not use it. A protected mistake is still a mistake: correction feedback, mastery and combo treat it as wrong, and it uses no second chance.
  2. **Blessing** (from an event answered right on the first try without the translation; this floor only, once, `Run.omen`): saves the heart.
  3. **Calm:** otherwise the charge from a right answer to the Echo Wraith's or Mirror Trickster's trial (`Run.calm`, 0 or 1, kept until used this expedition; 👻 next to the hearts) saves it ("Calmed Wraith · heart saved").
  4. **Second chance:** otherwise a second-chance charge, if one is left, saves the heart ("Second chance · heart saved"). The charges are **one pool per expedition**, set when it starts (Iron Will, Second Chance, Sage: +1 each, capped at `SECOND_CHANCE_CAP` 3) and **never refilled** during it (not per floor, enemy, reload or gear swap). Still wrong for learning and combo.
* **Recovery:** there is **no floor recovery without upgrades**. With **Second Wind** (G4) clearing floors 1–4 restores 1 heart, capped, exactly once per floor (`Run.recoveredFloor`), shown in the floor summary. A potion restores 1 heart (+1 with Titan Heart); it is not used up at full hearts. Nothing else heals: no healing on kills, no healing or maximum-heart growth from levels (levels add attack only).
* **Maximum hearts:** 5 + upgrades + worn gear, capped at **8** (`MAX_HEARTS`). Raising the maximum mid-run (gear) adds an empty heart; lowering it clamps the current hearts. New runs start full at their final maximum (starting gear included).

## Word mastery (per entry, saved; `src/game/mastery.ts`)
Each word has a level 0-5 and one scheduler (`game/schedule.ts`; full rules, research basis and state-transition table in `docs/SCHEDULING.md`):

| Level | Name | Reached by |
|---|---|---|
| 0 | New | the new-word card was read (no credit) |
| 1 | Learning | the 1st of 3 **spaced** successes (2 other answers + 30 s later) |
| 2 | Familiar | the 3rd spaced success (4 answers + 90 s, then 8 answers + 180 s; a 20 min break also counts) |
| 3 | Remembered | a correct unassisted answer **24 h** after Familiar |
| 4 | Retained | the same, **24 h** after Remembered |
| 5 | Mastered | the same, **72 h** after Retained; then a maintenance check after 14 days, then every 30 days |

* All waits are elapsed time, not calendar days. A right answer before the word is due counts as practice but never moves the due time;
  help (a hint, or an answer shown on the card) and an answer shown in the last 10 minutes do not count. A late answer promotes **one** stage only.
* **A miss** keeps the spaced successes of a word still being learned, or drops an established word one level (not below Familiar), and
  schedules a relearning answer (2 other answers + 30 s); that answer does not promote. An established word is then rechecked 24 h later.
* Only meaning and written-form questions move the scheduler for now; pronunciation, listening and sentence answers are recorded as evidence only.
* **Every question kind counts the same.**
* **Reviews:** a due word is picked far more often (`DUE_WEIGHT` 6) so a session starts by checking yesterday's words, but at most
  **2 due words per fight** (`DUE_PER_FIGHT`), so new and still-learning words keep their slots. Words still being learned (0-1) weigh
  3, Familiar and waiting words 0.8 (repeating them cannot promote them today), mastered words 0.4.
* **New words** come in under the same rules as before (curriculum order, at most 4 at level 0, pool cap). Simulator, words introduced
  after 10 / 20 / 40 expeditions, old rules → spaced levels: 0.75 accuracy 27 / 40 / 62 → 29 / 40 / 54; 0.85 38 / 56 / 84 →
  40 / 59 / 84; 0.90 40 / 65 / 95 → 40 / 61 / 89. (Waiting words at weight 1 without the cap gave 0.85 only 75 after 40; at 0.6,
  95, but 0.75 players then clear depths about 2 expeditions later.)
* **Camp** shows "📖 N words ready for review today ›" (or when the next review is); tapping it opens the wordbook. The wordbook
  (also in ⚙ at camp and during runs) lists due words first, marked "review", then the rest by level.
* **Old saves:** entries from before time-gated levels have no date: they keep their level (at most 4, the old maximum) and are due
  at once, so levels 2-4 are re-checked by their next right answer (an old "mastered" word needs one more right answer).
* Simulator: two expeditions per calendar day (`SIM_RUNS_PER_DAY`). 20 seeds, old → new rules: wins 0.60 5.3 → 4.5 %,
  0.75 68.8 → 65.9 %, 0.85 96.6 → 96.5 %, 0.90 99.5 → 99.4 %; depth-clear medians unchanged; hearts lost/run +0.2 at 0.60/0.75.
  Words mastered after 40 expeditions (20 days): 0.75 41 → 2, 0.85 69 → 23, 0.90 80 → 37 (mastery now means retention).

A new word is first shown on its own introduction card (word, pinyin, meaning, note, up to two examples, a speaker button) with a "Got it" button. There is no question and no pressure; the word only starts appearing in questions after "Got it". Cards appear at the start of a fight, never in the middle of one.

The level decides which kinds can be asked (weights in `KIND_WEIGHTS`, `src/game/questions.ts`):

| Level | Kinds (most frequent first) |
|---|---|
| 0 early | **first question: char→meaning only** (character and pinyin on screen); after one correct answer also audio→char and meaning→char |
| 1 developing | char→pinyin, pinyin→char, meaning→char, audio→meaning, homophone, look-alike |
| 2 | char→meaning (char only), meaning→pinyin, audio→pinyin, pinyin→char, look-alike, homophone, + meaning→char, audio→meaning, audio→char |
| 3-5 higher | mixed: meaning→char, audio→char, pinyin→char, audio→pinyin, audio→meaning, meaning→pinyin, look-alike, homophone, + char→pinyin, char→meaning |

Which kind a word gets is a weighted draw: the level table, filtered by what is *fair* for that word, x 0.15 if it was the previous kind,
x 0.5 if it was one of the last two, x (1 + 2 x miss rate) for kinds missed in this session (weak areas). Audio kinds need a Mandarin voice.
Not yet: per-kind history across sessions, and context questions beyond the authored particle sentences.

**Difficulty of the wrong answers** follows the level: level 0 (and the intro) = clearly different words (other families first, look-alike characters last, so 四 is never offered next to 五 六 九); level 1 = mixed; level 2+ = same family first (the hard version). A word that drops back to level 0 starts again with the easy first step.

**Fairness rules** (all enforced by `tests/questions.test.ts`):
- Wrong answers come from words the learner has met (padded with the earliest words while fewer than ~9 are known); never a word whose meaning overlaps or is listed as `confusable`.
- **Homophones** (same pinyin, e.g. 木/目 mù, 他/她 tā, 十/石 shí): sound-only kinds (audio→char, pinyin→char, audio→meaning) are not asked for a word whose homophone the learner already knows; the homophone question (pinyin + meaning → character, both homophones offered) is used instead. If the partner is unknown it is never offered as an option.
- **Look-alikes** come from the `lookalike` field in `words.json`; they are only used once the partner has been met.
- Tone-change readings (`alt`, e.g. 不 bú, 一 yí/yì) are never offered as wrong pinyin.
- Levels and their timings: see the table above and `docs/SCHEDULING.md`. Level 5 = mastered (asked rarely).
- Harder levels deal bonus damage (+0/10/25/40 %, the full bonus from Remembered on).
- New entries come in curriculum order (see below); no new entry is introduced while 4 entries are still at level 0, and entries met may exceed entries at level 1+ by at most 6.

## Flow after an answer
**Pacing:** the game pauses for new material (introduction cards; words below Familiar get the recap card) and for every mistake. A right answer to a Familiar word gets a brief reveal and continues by itself after 1 s (`LEARNING_AUTO_DELAY`, the default "Learn first" setting); 💡 opens the details and pauses. A word's explanation is always shown in full after an answer (no fold). Explanations are never cut short (the recap scrolls).

A wrong answer's recap does not repeat the right answer (the card above shows it). It shows **what you chose** in its own red box, sized by length (one character big; words, pinyin, phrases and sentences smaller and wrapped), with the pinyin and meaning when it is a word you know, so the mix-up itself is taught.

Auto-continue setting (`src/game/flow.ts`): **Learn first** (default: after a right answer to a word at Familiar or above, continues after 1 s, also to the next monster), **Quick** (0.5 s), **Relaxed** (2.5 s; 3 s to the next monster) or **Off**. It never continues after a wrong answer or a defeat; floor-cleared moments (after the boss) always pause. Rewards are shown in the scene and counters; loot sets a NEW dot on Gear. Sound off = no audio and no listening questions.

## Upgrade tree (permanent; 4 branches × 5 tiers, bought in order)
Cost = 25 × tier × (tier+1) / 2 → **25, 75, 150, 250, 375** per branch (875 each, 3 500 total).
- **Blade** — attack, combo damage (3rd correct in a row), execute bonus.
- **Aegis** — G1 Tough Skin +1 max heart · G2 Spare Vial +1 starting potion · G3 Iron Will +1 second chance per expedition · G4 Second Wind: clearing a floor restores 1 heart (the only floor recovery) · G5 Titan Heart +1 max heart and potions +1 heart.
- **Lore** — hints (remove a wrong option, per fight), XP, S3 Second Chance (+1 second chance per expedition), mastery damage, S5 Sage (+1 hint, +1 second chance per expedition, +15 % XP).
- **Fortune** — gold, loot chance, start-of-run gear (Copper Blade, Mossy Vest).
No upgrade answers questions; a test enforces that every effect is power or convenience. Upgrade ids, prerequisites and costs did not change with hearts.

## Gear (`src/data.ts`)
Item names are their identity in saves. Effects: attack, max hearts, hints per fight, XP %, mastery damage %, gold per win (the
full list with values is `GEAR` in `src/data.ts`). Gear gives no second chances (they are a per-expedition pool from upgrades,
so gear found mid-run could never add one). Rarity (common / rare / epic, `src/game/rarity.ts`) is cosmetic: colour, sound and the
reveal card, never drop odds or stats. Boss-only items (Golem Plate, Wraith Lantern, Scribe Brush, Trick Mantle) drop the first
time each boss type is beaten.

## Balance (tools/simulate.ts, tests/balance.test.ts)
`node tools/simulate.ts --report` plays a seeded bot (accuracy rises as words are learned; boss seal/trick questions are a little harder) for new players buying upgrades greedily, and for fully upgraded players, 5 seeds.

Depth 1 targets (agreed 2026-11-01): perfect play always wins; 90 % wins the first expedition without upgrades; 75 % wins within about 4–8 expeditions; 60 % rarely wins early but gets there over time. Results with the chosen setting (enemy HP ×1, ×1.16 per floor; no floor recovery; second chances capped at 3):

| Accuracy | First win (median expedition) | Win rate: expeditions 1–5 / 6–15 / 16–30 | Answers per expedition (avg / max) | Longest fight | Fully upgraded win rate |
|---|---|---|---|---|---|
| 60 % | 24th | 0 % / 0 % / 19 % | 29 / 58 | 14 | 24 % |
| 75 % | 6th | 8 % / 80 % / 99 % | 41 / 57 | 13 | 98 % |
| 85 % | 1st (3 of 5 seeds) | 92 % / 100 % / 100 % | 38 / 64 | 10 | 100 % |
| 90 % | 1st | 100 % | 36 / 61 | 10 | 100 % |
| 100 % | 1st | 100 % | 34 / 58 | 9 | 100 % |

**Depths** (the bot always plays the deepest unlocked depth; model assumption: a recall-heavy mix lowers accuracy by up to 6 points at full challenge), 40 expeditions, median of 5 seeds:

| Accuracy | Expeditions to clear depth 1 / 2 / 3 / 4 / 5 | Win rate | Answers per expedition (avg / max) |
|---|---|---|---|
| 60 % | 24 / 28 / never / never / never | 5 % | 33 / 65 |
| 75 % | 6 / 10 / 12 / 13 / 14 | 61 % | 60 / 76 |
| 85 % | 1 / 3 / 4 / 5 / 6 | 98 % | 60 / 78 |
| 90 % | 1 / 2 / 3 / 4 / 5 | 100 % | 56 / 74 |
| 100 % | 1 / 2 / 3 / 4 / 5 | 100 % | 51 / 63 |

Per-depth enemy HP: without it (only the boss and the question mix) a 75 % player cleared depths 2–5 in 5 expeditions after the first win and expeditions stayed at ~40 answers; +15 % gave 6 / 9 / 10 / 11 / 12; **+30 % (chosen)** gives a real climb at 75 % and brings deep expeditions to ~50–60 answers. A 60 % player stays in depths 1–2 within 40 expeditions (wins remain possible there). Perfect play wins every depth (`tests/depths.test.ts`).

Tried and rejected for depth 1: more enemy HP (×1.25–1.8) makes expeditions only a little longer (damage grows with levels and mastery) but drops 60 % players to no wins at all and pushes 75 % to a median of 10 expeditions. So expeditions are about 35–40 answers (6–8 minutes) at depth 1; deeper depths add challenge through the question mix and enemy HP (see Depths). Longest fights are shield bosses. `tests/balance.test.ts` guards the targets, bounded expeditions (≤ 100 answers, fights ≤ 24: a 40-seed sweep shows a rare 22-answer shield fight at 0.75 accuracy, with or without boss trials) and that hearts only come back from potions and Second Wind. Tune `TUNING` (`src/game/rules.ts`) and `src/game/upgrades.ts`. The bot is a model, not real players — expect to retune after human playtests.

## Warden Sigil (`sigilBonus` in `src/game/rules.ts`)
A relic kept forever instead of loot from the Cavern Warden (an item would vanish at once, because beating it ends the expedition).
Its **level is the number of depths cleared** (`Meta.depthCleared`), so it needs no slot, no choice and no new save field; each
expedition fixes its level when it starts (`Run.sigil`). Level 1: **+1 hint per fight, +10 % mastery damage**; **+5 % mastery
damage per further level** (level 5: +30 %). Shown at camp, in the run's bonus list and on the victory card of a first clear.

Balance (simulator, 20 seeds, 40 expeditions; the bot never uses hints, so only the damage is measured), off (the old game) vs
on: 0.75 accuracy wins 64.4 % → 68.8 %, depth 3/4 cleared after 11/12 → 10/11 expeditions, answers per expedition 62.1 → 58.4;
0.85 and 0.90 clear one depth per expedition either way (wins 97.0 → 96.6 %, 99.5 → 99.5 %) with expeditions about 7 % shorter
(59.6 → 54.8, 56.4 → 52.0 answers). Stronger scalings were measured and not taken: 15 % + 5 %/level (0.75 wins 70.5 %),
10 % + 10 %/level (74.6 %, expeditions about 10 % shorter).

## Save format (key `hanzi-hunters-save`, `version: 2`; `src/game/save.ts`)
Saves were restarted with expeditions (2026-11-01): the earlier keys (`hanzi-hunters-save-v1`, `hanzi-hunters-save-v2`) are
deleted on start (`clearOldSaves`) and never read. Version 1 of the current key (calendar-day mastery) is migrated once to
version 2 (scheduler data per entry, `answerSeq`; see `docs/SCHEDULING.md`, Migration). A save with any other `version` loads as
a fresh save. Backups (`src/game/backup.ts`) accept versions 1 and 2.

`{ version: 2, answerSeq, meta{gold,upgrades,bestFloor,runs,wins,depthCleared}, mastery{entryId: scheduler entry},
legacyMastery{id: …}, run|null, lastRun{floor,kills,level,goldBanked,bonus,result,depth,unlocked}|null,
habit{daysPlayed,lastPlayed,warmupDay,correct,bosses,bossesMet,seed,tipsSeen,notesSeen,badges}, courses{curriculumId:{version,completed[lessonId]}},
peak{entryId: highestLevel}, legacyPeak{id: level}, practiced[entryId] }`. `run` holds `depth` (1–5), `floor` (1–5), `hearts`,
`secondLeft` (the expedition's pool), `recoveredFloor`, `shield` and `reward.hearts`; `lastRun.result` is `won` / `defeat` /
`returned`. Every field is validated on load; a mid-run reload resumes the expedition. `habit.warmupDay`, `habit.badges` and
`habit.seed` are kept for round-tripping but unused. `legacyMastery` / `legacyPeak` park progress of entry ids that no longer exist,
so it comes back if the entry returns (`docs/CONTENT_GUIDE.md` §1.7). `courses` and `peak` are re-derived from mastery when
missing (`docs/CURRICULUM.md` §4).

Optional additive fields (old saves load without them): `run.encounter`, `run.trial` (`{id, floor, order, status, chosen?, data?}`;
`data` holds a generated trial and is re-validated on load), `run.calm`, `run.omen`, `encounterHistory`, and `recentEvents` (the last 12
scenes/trials shown). See `docs/CONTEXTUAL_ENCOUNTERS.md`.

## Entries, readings and questions (`src/content`, `src/game/questions.ts`)
* An **entry** is one word / character / particle with one reading and one beginner meaning group (`kind`; `docs/SENSES.md`). Multi-character words, neutral-tone syllables (`neutral`), accepted pronunciation variants (`variants`), connected-speech guidance (`speech`), several entries for one hanzi (explicit `id`s) and per-entry question eligibility (`questions`) are all data: see `docs/CONTENT_GUIDE.md`.
* Questions never offer a valid answer as a wrong option: variants, speech forms, overlapping meanings, homographs (except as a wrong pinyin when the meaning is on screen) and, for sound-only questions, same-sounding known words are all excluded; with too few safe options another kind is asked. Pinyin options are never made by editing the tone marks of multi-syllable words (authored `wrongPinyin` or real readings of other entries).
* Audio is used only when it can be trusted to match the entry (`audioReliable`: `audio: "ok"` and no other entry with the same hanzi); otherwise the speaker button is disabled and no listening question is asked.
* **Particle (sentence) questions** (`particle` kind) come from authored, reviewed `cloze.json` items; the answer entry's progress is updated; every wrong option has an authored reason shown after a miss.
* Provenance: `source` (names from `sources.json`) and `review` (`ai-draft` / `imported` / `human-reviewed`) on entries, examples, explanations and sentence questions; credits appear under Settings and in the details popup.

## Days played (`src/game/habit.ts`)
* The daily warm-up was removed (PR #29); `habit.warmupDay` stays in saves, unused.
* Days played: +1 the first time you answer on a new local day; never decreases.
* Milestone badges were removed (they were noise); `habit.badges` stays in saves, unused, so older saves round-trip unchanged.

## Bosses (`src/game/rules.ts`, `src/data.ts`)
Every boss offers one **trial** (a one-question challenge) during the fight: answered once, no mastery change, and a wrong trial
answer is an ordinary wrong answer (a heart unless protected). The trials are summarised below and specified in
`docs/CONTEXTUAL_ENCOUNTERS.md` (Boss trials).

* **Every floor ends with a boss** (the 4th fight): **Shield Golem** (floor 1), **Echo Wraith** (2), **Ink Scribe** (3), **Mirror Trickster** (4) (`BOSS_ORDER`), and the final boss **Cavern Warden** (floor 5, `FINAL_BOSS`). To add a boss: a sprite, an entry in `BOSSES` / `BOSS_INFO` (`data.ts`), its place in `bossIdFor`, and its rule in `resolveAnswer` / `makeCard`.
* **Cavern Warden** (final boss): 2 **tone wards** then 2 **ink seals** (`WARDEN_WARDS`, `WARDEN_SEALS`; `sealAsk` says which question kind breaks the current segment: tone questions for wards, character questions for seals, with the same safe fallback), then an **echo** phase like the Wraith's. Beating it wins the expedition. Placeholder art: the Golem sprite with a gold glow. Drops **no item** (the expedition ends right after it): its reward is the **Warden Sigil** relic (below).
  **Gauntlet** (trial): after the first tone ward breaks, a tone trial then a torn note; each right step breaks the remaining wards / seals. Details: `docs/CONTEXTUAL_ENCOUNTERS.md`.
* Stats: base enemy × boss multipliers, then the per-floor scaling. Early bosses are gentler and ramp up: HP ×(1.3 + 0.15·(floor−1)) up to `BOSS_HP` 1.7, rewards ×`BOSS_REWARD` 2. Bosses have no attack: like every enemy, a mistake against them costs exactly one heart (before protection), and protected practice causes no boss penalty either.
* **Shield Golem:** a shield that blocks all damage: 2 segments (`shieldFor`; 3 for the Scribe on floor 3). Only a correct *pinyin* (tone) question breaks a segment; while the shield is up the game asks pinyin questions about words you know. **Safe fallback** (`pickSealCard`): if no such question can be built from your words (e.g. only particles known), the game asks another fair question marked `sealFallback`, and a correct answer to it breaks a segment too, so a shield is never unbreakable (`tests/hearts.test.ts` beats every boss with the first lesson's words). Wrong answers never repair it. Once down it is a normal fight. `Run.shield` is saved.
  **Tone Trial** (trial): after the first segment breaks, pick the tone-marked pinyin of a line of known words; right shatters the shield and takes 25 % of its HP. Details: `docs/CONTEXTUAL_ENCOUNTERS.md`.
* **Ink Scribe:** the same idea with a different skill: ink seals (2, then 3 from floor 3) block all damage and only a correct *character* question (pick the right hanzi) breaks one. Same safe fallback as the Golem. Seals never grow back (removed with hearts). Sprite: recoloured slime.
  **Torn Note** (trial): after the first seal breaks, pick the missing character of a note of known words; right breaks every remaining seal. Details: `docs/CONTEXTUAL_ENCOUNTERS.md`.
* **Mirror Trickster:** no shield. Asks only look-alike and same-sound questions (the easy ones to confuse). A right answer hits +40 % (`TRICKSTER_HIT`); a wrong answer deals nothing (it no longer heals the Trickster). If no trick question can be built, a normal question is asked. Sprite: recoloured imp.
  **Mirrors** (trial): below half HP, pick the one true statement about a scene; right deals 30 % of its HP and gives a calm charge. Details: `docs/CONTEXTUAL_ENCOUNTERS.md`.
* **Echo Wraith:** normal fight; below 60 % HP it asks the kind of question you got wrong most recently (falls back to a normal question when that kind cannot be built).
  **Wail** (trial): below 60 % HP, pick the reply to its line; right calms it, so your next wrong answer this expedition costs no heart. Details: `docs/CONTEXTUAL_ENCOUNTERS.md`.
* Rewards: the first time you beat each boss type it drops its own item (**Golem Plate** / **Wraith Lantern** / **Scribe Brush** / **Trick Mantle**, boss-only gear that never drops elsewhere). After that a boss rolls for normal gear with a +30 % better chance.
* The intro card is shown only the first time you meet each boss type (`habit.bossesMet`); later floors show just the `BOSS · PHASE n/2` tag and the shield / ECHO tag in the arena.
* Preview a boss without playing: open `/?floor=1` (Golem) … `/?floor=5` (Warden); `&kill=0..3` picks an earlier fight of that floor. It replaces the current run with a fresh, levelled-up hero (test URLs only).
* **Longer floors:** `ENEMIES_PER_FLOOR` (rules.ts) is one constant. A trial with 10 per floor typechecks, and the simulator pacing stays similar, but it needs: the pacing and save tests' thresholds re-checked, the header path (10 nodes overflowed the header on a narrow phone: re-measure at 360 px, the narrowest supported width, and shrink the nodes or drop the BOSS tag), and a look at per-floor rewards.
* Loot reveal: rare/epic gear, boss gear, or a clear upgrade over what you wear opens a chest card that compares the stats with the equipped item (and offers *Equip now*); other drops stay a chip. Auto-continue waits while the card is open.

## Which words come first (`src/game/course.ts`, `src/content/curricula.json`)
* The teaching order is the active **curriculum** (units → lessons → introductions), not the order of `words.json`. Full rules: `docs/CURRICULUM.md`.
* New entries are introduced on their card, in curriculum order, the same for every player (no random seed any more): a brand-new player gets 3 cards at once, then at most one per fight start, none while 4 entries are still at level 0. Lessons with unmet prerequisite lessons are skipped; an entry whose prerequisite entries are not ready yet makes its lesson wait. A reload in the middle of a fight does not show a card.
* Review questions only ask entries already introduced (`selectReview`): weak entries are weighted higher than mastered ones, and entries asked in the last few questions are less likely to repeat (`RECENT_PENALTY`; this session only).
* A lesson counts as ready when every required entry is at level 1 (configurable per curriculum); it is then recorded as completed and never relocks.
* The old behaviour (file order, shuffled inside blocks of 16 by `habit.seed`) is gone; `habit.seed` is still saved but unused.

