# Game design: the roguelite loop (implemented in 0.2)

## Loop
1. A **run** starts at floor 1, level 1, no gear, 1 potion (plus any upgrades).
2. Each floor has **4 enemies; the 4th is an elite** (×1.6 HP, ×1.25 damage, ×2 rewards, better drops). Then you descend.
3. Per floor (compounding): enemy HP +16 %, damage +11 %, XP/gold +8 %. XP from answers is banked during a fight and paid out with the monster's XP on the kill (`Run.pendingXp`).
4. Dying ends the run. **All run gold is banked.** Level, gear and potions are lost. **Upgrades and word mastery stay.**
5. At **camp** you see the run result and your current lesson, spend banked gold on the upgrade tree, then start a new run (the start button stays pinned at the bottom). Stats, milestones, backups and reset are in **Settings** (⚙).

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
- **Aegis** — max HP, starting potions, armor, heal after victories, stronger potions.
- **Lore** — hints (remove a wrong option, per fight), XP, second chance (one un-countered miss per fight), mastery damage.
- **Fortune** — gold, loot chance, start-of-run gear (Copper Blade, Mossy Vest).
No upgrade answers questions; a test enforces that every effect is power or convenience.

## Balance (tools/simulate.ts, tests/balance.test.ts)
Bot play at 60/75/90 % accuracy: first death on floor 1–3 with enough gold for the first node within 2 runs; a full tree takes ≥ 8 runs; with a full tree the average run still ends around floors 9–12. Tune in `src/game/rules.ts` (scaling) and `src/game/upgrades.ts` (COST_BASE, effects). The bot is a model, not real players — expect to retune after human playtests.

## Save format v4 (key `hanzi-hunters-save-v2`)
`{ version: 4, meta{gold,upgrades,bestFloor,runs}, mastery{entryId:{lv,ok}}, legacyMastery{id:{lv,ok}}, run|null, lastRun|null, habit{daysPlayed,lastPlayed,warmupDay,correct,bosses,bossesMet,seed,tipsSeen,badges}, courses{curriculumId:{version,completed[lessonId]}}, peak{entryId:highestLevel}, legacyPeak{id:level} }`. v2 saves are migrated on load (course progress derived from mastery; see `docs/CURRICULUM.md` §4). Every field is validated on load (`src/game/save.ts`); a mid-run reload resumes the run. The v1 prototype save is migrated once: learned words → level 1, gold → banked, floor → best floor. The v1 key is left untouched.

**Progress is keyed by entry id** (the hanzi unless the content file gives the entry an `id`), so saves written before ids existed load unchanged. `migrateMastery` carries progress over when content changes: an entry's own id or one of its `aliases` (an earlier id of the same entry; the higher level wins), or a hanzi that is now used by exactly one entry. Progress nobody claims (a removed entry, or an ambiguous shared hanzi) is parked in `legacyMastery` instead of being deleted, and is retried on every load. Different meanings are never merged. `habit`, `legacyMastery` and the id keys were added without a version bump (older apps ignore them).

## Entries, readings and questions (`src/content`, `src/game/questions.ts`)
* An **entry** is one word / character / particle with one meaning and reading (`kind`). Multi-character words, neutral-tone syllables (`neutral`), accepted pronunciation variants (`variants`), connected-speech guidance (`speech`), several entries for one hanzi (explicit `id`s) and per-entry question eligibility (`questions`) are all data: see `docs/CONTENT_GUIDE.md`.
* Questions never offer a valid answer as a wrong option: variants, speech forms, overlapping meanings, homographs (except as a wrong pinyin when the meaning is on screen) and, for sound-only questions, same-sounding known words are all excluded; with too few safe options another kind is asked. Pinyin options are never made by editing the tone marks of multi-syllable words (authored `wrongPinyin` or real readings of other entries).
* Audio is used only when it can be trusted to match the entry (`audioReliable`: `audio: "ok"` and no other entry with the same hanzi); otherwise the speaker button is disabled and no listening question is asked.
* **Particle (sentence) questions** (`particle` kind) come from authored, reviewed `cloze.json` items; the answer entry's progress is updated; every wrong option has an authored reason shown after a miss.
* Provenance: `source` (names from `sources.json`) and `review` (`ai-draft` / `imported` / `human-reviewed`) on entries, examples, explanations and sentence questions; credits appear under Settings and in the details popup.

## Daily warm-up, days played and badges (`src/game/habit.ts`)
* Warm-up: once per local day, up to 5 known words (lowest level first, then fewest right in a row, day-stable tie-break), at least 3 known words needed. Right answers update mastery as usual and earn 3 gold each; nothing is risked.
* Days played: +1 the first time you answer on a new local day; never decreases.
* Badges: 9 milestones in `BADGES`; checked after every battle and warm-up answer, stored in `habit.badges`.

## Bosses (`src/game/rules.ts`, `src/data.ts`)
* **Every floor ends with a boss** (the 4th fight; there are no elites any more). The four bosses take turns (`BOSS_ORDER`): **Shield Golem** (floor 1, 5, 9 …), **Echo Wraith** (2, 6 …), **Ink Scribe** (3, 7 …), **Mirror Trickster** (4, 8 …). To add a boss: a sprite, an entry in `BOSSES` / `BOSS_INFO` (`data.ts`), its id in `BOSS_ORDER`, and its rule in `resolveAnswer` / `makeCard`.
* Stats: base enemy × boss multipliers, then the per-floor scaling. Early bosses are gentler and ramp up: HP ×(1.3 + 0.15·(floor−1)) up to `BOSS_HP` 1.7, damage ×(0.8 + 0.1·(floor−1)) up to `BOSS_DAMAGE` 1.15, rewards ×`BOSS_REWARD` 2. The simulator (`tools/simulate.ts`) shows the early pacing close to the pre-boss game, and late runs ending about one floor earlier.
* **Shield Golem:** a shield that blocks all damage (it still hits back): 2 segments on floors 1–2, 3 from floor 3 (`shieldFor`). Only a correct *pinyin* (tone) question breaks a segment; while the shield is up the game asks only pinyin questions about words you know. Wrong answers never repair it. Once down it is a normal fight. `Run.shield` is saved.
* **Ink Scribe:** the same idea with a different skill: ink seals (2, then 3 from floor 3) block all damage and only a correct *character* question (pick the right hanzi) breaks one. With the seals down, a wrong answer makes one seal grow back (never undoes a kill). Sprite: recoloured slime.
* **Mirror Trickster:** no shield. Asks only look-alike and same-sound questions (the easy ones to confuse). A right answer hits +40 %; a wrong answer deals nothing and heals it 8 % of its HP (16 % below half HP, `TRICKSTER_*` constants); a wrong answer can never kill it. Sprite: recoloured imp.
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

