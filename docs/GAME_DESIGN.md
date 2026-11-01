# Game design: the roguelite loop (implemented in 0.2)

## Loop
1. A **run** starts at floor 1, level 1, no gear, **5 full hearts** and 1 potion (plus any upgrades).
2. Each floor has **4 enemies; the 4th is a boss** (see Bosses). Then you descend.
3. Per floor (compounding): enemy HP ×1.25 (`TUNING.enemyHpGrowth`), XP/gold +8 %. XP from answers is banked during a fight and paid out with the monster's XP on the kill (`Run.pendingXp`).
4. **Zero hearts ends the run.** All run gold is banked. Level, gear and potions are lost. **Upgrades and word mastery stay.** *Return to camp* (Settings during a run) ends a run early the same way, without counting as a defeat.
5. At **camp** you see the run result and your current lesson, spend banked gold on the upgrade tree, then start a new run (the start button stays pinned at the bottom). Stats, milestones, backups and reset are in **Settings** (⚙).

## Hearts (`src/game/rules.ts`)
The player's health is a row of whole **hearts** (`Run.hearts`, the only player-health value). Enemies keep an HP bar but have no attack.
* **Correct answer:** attacks the enemy (attack, combo, execute and mastery bonuses as before). It never costs a heart; there is no counterattack.
* **Wrong answer:** deals no damage and costs **exactly one heart**, on every floor and against every boss, unless it is protected:
  1. **Practice:** the first non-intro question about a newly introduced entry is protected ("Practice · no heart lost" shows before you answer). It is used up by that first answer, right or wrong, and stored per entry in `Saved.practiced`, so reloading, dying or a new run never resets it. The intro question itself (meaning on screen) does not use it. A protected mistake is still a mistake: correction feedback, mastery and combo treat it as wrong, and it uses no second chance.
  2. **Second chance:** otherwise a second-chance charge, if one is left, saves the heart ("Second chance · heart saved"). Charges stack (Iron Will, Second Chance, Sage, Windrunner Boots, Golem Plate, Trick Mantle) and refill **only when you enter a floor** (including floor 1): never per enemy, on reload or by swapping gear. Still wrong for learning and combo.
* **Recovery:** clearing a floor (beating its boss) restores 1 heart (+1 with Second Wind), capped, exactly once per floor (`Run.recoveredFloor`), before the floor summary, which shows it. A potion restores 1 heart (+1 with Titan Heart); it is not used up at full hearts. Nothing else heals: no healing on ordinary kills, no healing or maximum-heart growth from levels (levels add attack only).
* **Maximum hearts:** 5 + upgrades + worn gear, capped at **8** (`MAX_HEARTS`). Raising the maximum mid-run (gear) adds an empty heart; lowering it clamps the current hearts. New runs start full at their final maximum (starting gear included).
* Before the first fight a one-time message explains the rules (`habit.heartsIntro`).

## Word mastery (per entry, saved)
Each word has a level 0-4 (4 = mastered). **Every question kind counts the same**: 2 correct in a row promote, a miss demotes one level.
A new word is first shown on its own introduction card (word, pinyin, meaning, note, up to two examples, a speaker button) with a "Got it" button. There is no question and no pressure; the word only starts appearing in questions after "Got it". Cards appear at the start of a fight, never in the middle of one.

The level decides which kinds can be asked (weights in `KIND_WEIGHTS`, `src/game/questions.ts`):

| Level | Kinds (most frequent first) |
|---|---|
| 0 early | **first question: char→meaning only** (character and pinyin on screen); after one correct answer also audio→char and meaning→char |
| 1 developing | char→pinyin, pinyin→char, meaning→char, audio→meaning, homophone, look-alike |
| 2 | char→meaning (char only), meaning→pinyin, audio→pinyin, pinyin→char, look-alike, homophone, + meaning→char, audio→meaning, audio→char |
| 3-4 higher | mixed: meaning→char, audio→char, pinyin→char, audio→pinyin, audio→meaning, meaning→pinyin, look-alike, homophone, + char→pinyin, char→meaning |

Which kind a word gets is a weighted draw: the level table, filtered by what is *fair* for that word, x 0.15 if it was the previous kind,
x 0.5 if it was one of the last two, x (1 + 2 x miss rate) for kinds missed in this session (weak areas). Audio kinds need a Mandarin voice.
Not yet: spaced review by time, per-kind history across sessions, sentence/context questions (see the roadmap discussion).

**Difficulty of the wrong answers** follows the level: level 0 (and the intro) = clearly different words (other families first, look-alike characters last, so 四 is never offered next to 五 六 九); level 1 = mixed; level 2+ = same family first (the hard version). A word that drops back to level 0 starts again with the easy first step.

**Fairness rules** (all enforced by `tests/questions.test.ts`):
- Wrong answers come from words the learner has met (padded with the earliest words while fewer than ~9 are known); never a word whose meaning overlaps or is listed as `confusable`.
- **Homophones** (same pinyin, e.g. 木/目 mù, 他/她 tā, 十/石 shí): sound-only kinds (audio→char, pinyin→char, audio→meaning) are not asked for a word whose homophone the learner already knows; the homophone question (pinyin + meaning → character, both homophones offered) is used instead. If the partner is unknown it is never offered as an option.
- **Look-alikes** come from the `lookalike` field in `words.json`; they are only used once the partner has been met.
- Tone-change readings (`alt`, e.g. 不 bú, 一 yí/yì) are never offered as wrong pinyin.
- 2 correct answers in a row promote a word; a miss drops it one level. Level 4 = mastered (asked rarely).
- Harder levels deal bonus damage (+0/10/25/40 %).
- New entries come in curriculum order (see below); no new entry is introduced while 4 entries are still at level 0, and entries met may exceed entries at level 1+ by at most 6.

## Flow after an answer
Right answer: the card reveals the word in place and the game continues by itself (Quick 1 s / Relaxed 2.5 s / Off in settings); after a normal kill the next monster follows ~1.5 s later. Always paused: wrong answer, defeat, floor cleared (elite). Rewards are shown in the scene and counters, loot sets a NEW dot on Gear. Sound off = no audio and no listening questions.

## Upgrade tree (permanent; 4 branches × 5 tiers, bought in order)
Cost = 25 × tier × (tier+1) / 2 → **25, 75, 150, 250, 375** per branch (875 each, 3 500 total).
- **Blade** — attack, combo damage (3rd correct in a row), execute bonus.
- **Aegis** — G1 Tough Skin +1 max heart · G2 Spare Vial +1 starting potion · G3 Iron Will +1 second chance per floor · G4 Second Wind +1 heart on floor clear · G5 Titan Heart +1 max heart and potions +1 heart.
- **Lore** — hints (remove a wrong option, per fight), XP, S3 Second Chance (+1 second chance per floor), mastery damage, S5 Sage (+1 hint, +1 second chance per floor, +15 % XP).
- **Fortune** — gold, loot chance, start-of-run gear (Copper Blade, Mossy Vest).
No upgrade answers questions; a test enforces that every effect is power or convenience. Upgrade ids, prerequisites and costs did not change with hearts.

## Gear (`src/data.ts`)
Item names are their identity in saves. Effects: attack, max hearts, second chances per floor, hints per fight, XP %, mastery damage %, gold per win. Hearts replaced HP/armor on the armor slot:

| Item | Before (HP rules) | Now |
|---|---|---|
| Mossy Vest | +8 max HP | +1 max heart |
| Windrunner Boots | +1 armor | +1 second chance per floor |
| Guardian Helm | +4 max HP · +1 armor | +1 max heart · +1 hint per fight |
| Golem Plate (boss) | +12 max HP · +1 armor | +1 max heart · +1 second chance per floor |
| Trick Mantle (boss) | +6 max HP · +2 armor | +1 second chance per floor · +1 hint per fight |

Weapons and accessories are unchanged. The loot comparison (`compareGear`, `gearVerdict`) uses the same stats, so a trade-off (e.g. Boots against Vest) still asks.

## Balance (tools/simulate.ts, tests/balance.test.ts)
`node tools/simulate.ts --report` plays a seeded bot (accuracy rises as words are learned; boss questions are a little harder) for new and fully upgraded players; a bot that reaches 500 answers uses *Return to camp*.

Choosing the danger scaling (2026-11-01). Because a mistake always costs exactly one heart, deeper floors can only be harder by taking more answers (enemy HP growth) or by restoring fewer hearts. Compared settings, at 60 / 75 / 85 / 90 / 95 % accuracy:

| Setting | 75 %: late runs that end in defeat | 75 % maxed: returned at cap | 85 %+ |
|---|---|---|---|
| HP ×1.16, recover every floor (old growth) | 10 % | 80 % | always reach the cap |
| HP ×1.16, recover every 2nd floor | 13 % | 53 % | always reach the cap |
| HP ×1.22, recover every floor | 23 % | 43 % | always reach the cap |
| **HP ×1.25, recover every floor (chosen)** | **47 %** | **23 %** | always reach the cap |
| HP ×1.25, recover every 2nd floor | 70 % | 3 % | always reach the cap |

The chosen setting keeps the simplest rule ("clearing a floor restores a heart") and makes most mid-accuracy runs end naturally. Strong players (85 %+ in the model, where learned words reach ~98 % accuracy and second chances absorb the rest) are effectively never defeated by any setting that keeps one heart per mistake: their runs are bounded by *Return to camp*. Results with the chosen setting (3 seeds):

| Accuracy | New player, first 5 runs: floor / answers | Late runs (21–30): floor / answers / returned | Fully upgraded: floor / answers / returned |
|---|---|---|---|
| 60 % | 1.9 / 24 | 9.2 / 149 / 0 % | 8.4 / 129 / 0 % |
| 75 % | 7.1 / 120 | 18.7 / 469 / 53 % | 17.0 / 392 / 23 % |
| 85 % | 17.3 / 440 | 20 / 500 / 100 % | 19.8 / 500 / 100 % |
| 90 % | 18.7 / 487 | 20 / 500 / 100 % | 20 / 500 / 100 % |

Compared with the old HP rules: runs are longer (old late runs were ~75–95 answers), first runs at 60 % are as short (old: floor 1–2, ~20 answers), and buying the whole tree takes more play (75 %: ~1 070 answers instead of ~600, but in 6–7 runs instead of 11–13). `tests/balance.test.ts` guards: hearts bookkeeping (no healing from anywhere but floors and potions), shallow first runs, deeper late runs, tree ≥ 600 answers, defeats at 60 %/75 %, and that upgrades help. Tune in `TUNING` (`src/game/rules.ts`) and `src/game/upgrades.ts`. The bot is a model, not real players — expect to retune after human playtests.

## Save format v5 (key `hanzi-hunters-save-v2`)
`{ version: 5, meta{gold,upgrades,bestFloor,runs}, mastery{entryId:{lv,ok}}, legacyMastery{id:{lv,ok}}, run|null, lastRun|null, habit{daysPlayed,lastPlayed,warmupDay,correct,bosses,bossesMet,seed,tipsSeen,badges,heartsIntro}, courses{curriculumId:{version,completed[lessonId]}}, peak{entryId:highestLevel}, legacyPeak{id:level}, practiced[entryId] }`. `run` holds `hearts`, `secondLeft` (per floor), `recoveredFloor` and `reward.hearts`; `lastRun.returned` marks *Return to camp*. Every field is validated on load (`src/game/save.ts`); a mid-run reload resumes the run. The v1 prototype save is migrated once: learned words → level 1, gold → banked, floor → best floor. The v1 key is left untouched.

**v4 → v5 (hearts) migration** (`sanitizeSave`, saves without `version >= 5`): an active run's HP is never read as hearts. Its maximum HP is recomputed with the **old** rules (`legacyMaxHp`: 30 + 5 per level + Tough Skin 8 + Titan Heart 15 + worn gear HP), and the share `hp / oldMax` becomes the same share of the new maximum hearts, **rounded up** and clamped (a living run keeps at least 1 heart, a defeated run stays at 0). Floor, kill, enemy HP, XP, gold, potions, streak, gear and loadout are kept. No floor recovery is granted (a boss beaten before the update never restores a heart afterwards); second-chance charges are kept but clamped, never refilled. `practiced` is set to every entry the save already knows (mastery and parked legacy progress), so old words do not all get fresh protection. The result is a v5 save: loading it again changes nothing. v2–v4 saves and exports keep loading; `tests/hearts.test.ts` covers migration, repeated loads and export/import.

**Progress is keyed by entry id** (the hanzi unless the content file gives the entry an `id`), so saves written before ids existed load unchanged. `migrateMastery` carries progress over when content changes: an entry's own id or one of its `aliases` (an earlier id of the same entry; the higher level wins), or a hanzi that is now used by exactly one entry. Progress nobody claims (a removed entry, or an ambiguous shared hanzi) is parked in `legacyMastery` instead of being deleted, and is retried on every load. Different meanings are never merged. `habit`, `legacyMastery` and the id keys were added without a version bump (older apps ignore them).

## Entries, readings and questions (`src/content`, `src/game/questions.ts`)
* An **entry** is one word / character / particle with one meaning and reading (`kind`). Multi-character words, neutral-tone syllables (`neutral`), accepted pronunciation variants (`variants`), connected-speech guidance (`speech`), several entries for one hanzi (explicit `id`s) and per-entry question eligibility (`questions`) are all data: see `docs/CONTENT_GUIDE.md`.
* Questions never offer a valid answer as a wrong option: variants, speech forms, overlapping meanings, homographs (except as a wrong pinyin when the meaning is on screen) and, for sound-only questions, same-sounding known words are all excluded; with too few safe options another kind is asked. Pinyin options are never made by editing the tone marks of multi-syllable words (authored `wrongPinyin` or real readings of other entries).
* Audio is used only when it can be trusted to match the entry (`audioReliable`: `audio: "ok"` and no other entry with the same hanzi); otherwise the speaker button is disabled and no listening question is asked.
* **Particle (sentence) questions** (`particle` kind) come from authored, reviewed `cloze.json` items; the answer entry's progress is updated; every wrong option has an authored reason shown after a miss.
* Provenance: `source` (names from `sources.json`) and `review` (`ai-draft` / `imported` / `human-reviewed`) on entries, examples, explanations and sentence questions; credits appear under Settings and in the details popup.

## Days played and badges (`src/game/habit.ts`)
* The daily warm-up was removed (PR #29); `habit.warmupDay` stays in saves, unused.
* Days played: +1 the first time you answer on a new local day; never decreases.
* Badges: 10 milestones in `BADGES`; checked after every battle answer, stored in `habit.badges`, listed in Settings.

## Bosses (`src/game/rules.ts`, `src/data.ts`)
* **Every floor ends with a boss** (the 4th fight; there are no elites any more). The four bosses take turns (`BOSS_ORDER`): **Shield Golem** (floor 1, 5, 9 …), **Echo Wraith** (2, 6 …), **Ink Scribe** (3, 7 …), **Mirror Trickster** (4, 8 …). To add a boss: a sprite, an entry in `BOSSES` / `BOSS_INFO` (`data.ts`), its id in `BOSS_ORDER`, and its rule in `resolveAnswer` / `makeCard`.
* Stats: base enemy × boss multipliers, then the per-floor scaling. Early bosses are gentler and ramp up: HP ×(1.3 + 0.15·(floor−1)) up to `BOSS_HP` 1.7, rewards ×`BOSS_REWARD` 2. Bosses have no attack: like every enemy, a mistake against them costs exactly one heart (before protection), and protected practice causes no boss penalty either.
* **Shield Golem:** a shield that blocks all damage: 2 segments on floors 1–2, 3 from floor 3 (`shieldFor`). Only a correct *pinyin* (tone) question breaks a segment; while the shield is up the game asks pinyin questions about words you know. **Safe fallback** (`pickSealCard`): if no such question can be built from your words (e.g. only particles known), the game asks another fair question marked `sealFallback`, and a correct answer to it breaks a segment too, so a shield is never unbreakable (`tests/hearts.test.ts` beats every boss with the first lesson's words). Wrong answers never repair it. Once down it is a normal fight. `Run.shield` is saved.
* **Ink Scribe:** the same idea with a different skill: ink seals (2, then 3 from floor 3) block all damage and only a correct *character* question (pick the right hanzi) breaks one. Same safe fallback as the Golem. Seals never grow back (removed with hearts). Sprite: recoloured slime.
* **Mirror Trickster:** no shield. Asks only look-alike and same-sound questions (the easy ones to confuse). A right answer hits +40 % (`TRICKSTER_HIT`); a wrong answer deals nothing (it no longer heals the Trickster). If no trick question can be built, a normal question is asked. Sprite: recoloured imp.
* **Echo Wraith:** normal fight; below 60 % HP it asks the kind of question you got wrong most recently (falls back to a normal question when that kind cannot be built).
* Rewards: the first time you beat each boss type it drops its own item (**Golem Plate** / **Wraith Lantern** / **Scribe Brush** / **Trick Mantle**, boss-only gear that never drops elsewhere). After that a boss rolls for normal gear with a +30 % better chance. The first kill of any boss counts for the *Boss slayer* badge.
* The intro card is shown only the first time you meet each boss type (`habit.bossesMet`); later floors show just the `BOSS · PHASE n/2` tag and the shield / ECHO tag in the arena.
* Preview a boss without playing: open `/?floor=1` (Golem) or `/?floor=2` (Wraith); `&kill=0..3` picks an earlier fight of that floor. It replaces the current run with a fresh, levelled-up hero (test URLs only).
* **Longer floors:** `ENEMIES_PER_FLOOR` (rules.ts) is one constant. A trial with 10 per floor typechecks, and the simulator pacing stays similar, but it needs: the pacing and save tests' thresholds re-checked, the header path (10 nodes overflowed the header by ~22 px on a 320 px phone (re-measure at 360 px, the narrowest supported width): shrink the nodes or drop the BOSS tag), and a look at per-floor rewards.
* Loot reveal: rare/epic gear, boss gear, or a clear upgrade over what you wear opens a chest card that compares the stats with the equipped item (and offers *Equip now*); other drops stay a chip. Auto-continue waits while the card is open.

## Which words come first (`src/game/course.ts`, `src/content/curricula.json`)
* The teaching order is the active **curriculum** (units → lessons → introductions), not the order of `words.json`. Full rules: `docs/CURRICULUM.md`.
* New entries are introduced on their card, in curriculum order, the same for every player (no random seed any more): a brand-new player gets 3 cards at once, then at most one per fight start, none while 4 entries are still at level 0. Lessons with unmet prerequisite lessons are skipped; an entry whose prerequisite entries are not ready yet makes its lesson wait. A reload in the middle of a fight does not show a card.
* Review questions only ask entries already introduced (`selectReview`): weak entries are weighted higher than mastered ones, and entries asked in the last few questions are less likely to repeat (`RECENT_PENALTY`; this session only).
* A lesson counts as ready when every required entry is at level 1 (configurable per curriculum); it is then recorded as completed and never relocks.
* The old behaviour (file order, shuffled inside blocks of 16 by `habit.seed`) is gone; `habit.seed` is still saved but unused.

