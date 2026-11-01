# Contextual encounters

Short scenes appear after a non-final floor summary, once per expedition. They
open straight into the task and cannot be skipped: a wrong choice explains the
answer, so a scene can always be finished. The first choice decides an omen for
the next floor (Blessing / Shaken, see Reward and cost). (A save from the old
intro step, status "offer", loads as active.)

| Scene | Kind | Needs (all at least Familiar) | Words from course position* |
|---|---|---|---|
| hello | reply: answer 你好！ | 你好 再见 谢谢 | 3 |
| goodbye | reply: answer 再见！ | 你好 再见 谢谢 | 3 |
| sorry | reply: you spilled their water | 对不起 谢谢 你好 | 5 |
| friend-he, friend-she | point: 他/她是我朋友。 → tap the man or woman | 他 她 是 我 朋友 | 20 |
| tea | gather: 我要茶。 | 我 要 谢谢 茶 水 米饭 菜 | 65 |
| meal | gather: 我要米饭。我要菜。 | 我 要 谢谢 茶 水 米饭 菜 | 65 |
| *generated* | point: 这里有 N 个 X。 / gather: 我要 X。 | see Generated events | ~35 (counting), ~60 (requests) |

*Position of its last word in beginner-mandarin-100. A scene is offered once
all its words are at least Familiar (level 2), usually within a session or two
of meeting them. Each scene needs only its own words (every option and every
character of its Chinese lines; the validator enforces this), so no new
vocabulary is silently introduced. Among eligible scenes, recently offered ones
wait (Repeat protection); then the one completed on the fewest distinct days is
offered; file order breaks ties.

Kinds: **reply** = choose the one right thing to say (single choice, button
"Say it"); **gather** = choose every item asked for (button "Prepare");
**point** = choose the picture the traveler's Chinese line describes (single
choice, button "Point"; the options are pictures, so they always stay visible).
The title, instruction and button are shared by every scene of a kind, so they
never name the answer.

### How much help is shown (src/game/support.ts)
Help follows the player's own word levels, per word (the old day-based stages
are gone):
- A scene is only offered once **every word it uses is at least Familiar**
  (level 2), so it never needs English.
- **Pinyin** is shown for a word while it is at most Familiar; from Remembered
  (level 3) on, only its characters. The traveler's line shows pinyin while any
  of its words still needs it.
- **English** (line translation, option meanings, picture captions) is never
  shown before answering, only with the free "Pinyin & translation" help.
- **No pictures on word options** (they would give the answer away). Picture
  options (counting, 他/她) keep their picture: it is the choice itself.
- **After answering**: the line with pinyin and English, and the grammar note.
  A reply/point explanation names the answer, so it only appears after a wrong
  choice; a gather scene's recipe hint also appears with help.
- Boss trials follow the same rule: Wraith and Trickster options and the
  Wraith's line show pinyin while their words need it, English after answering;
  the Scribe's note shows no English before answering and, while its words need
  it, its pinyin with the missing syllable blanked too ("péng＿"). Golem trials
  are about pinyin, so their options are always pinyin.

Item order is shuffled once and persisted. Help is free.

Wrong choices explain and allow editing. Completed scenes show the result and,
if the scene has one, the traveler's closing line (谢谢！ for tea/meal).
These are short visual state changes, not a fully animated crafting simulation.
### Reward and cost (src/game/encounters.ts submitEncounter, Run.omen)
The **first** choice decides an omen for the **next floor** (the scene comes
after a floor boss), used once, on that floor only:
- Right first time: **✨ Blessing**: the next mistake on that floor costs no
  heart (used before a calmed Wraith's charge or a second chance).
- Wrong first time: **🌧 Shaken**: the next mistake on that floor costs **2
  hearts**, and no calm charge or second chance can save it (practice questions
  stay protected; with 1 heart left it costs that one). The scene stays open to fix (it still teaches); fixing it
  completes it without a Blessing.
- No gold. No hearts, XP or mastery credit change. Repeat submissions are
  no-ops. A ✨ / 🌧 chip next to the hearts shows an active omen.
- **Help** ("Translation" / "Pinyin & translation") costs **one hint of the
  next fight** (Run.hintDebt, taken by startFight); once bought it can be shown
  and hidden freely. Without a hint for the next fight it cannot be bought
  (base hints are 0; they come from upgrades, gear and the Warden Sigil).
- "Continue to next floor" appears only once the scene is complete (Escape does
  the same); there is no skip or leave button.
- Balance (simulator models events since this change: after floors 1-4 when
  every word is Familiar, right first time with the player's accuracy, never
  buying help; 20 seeds, events off → on, Shaken = 2 hearts): wins 0.60
  5.4 → 5.0 %, 0.75 61.0 → 71.5 %, 0.85 96.9 → 97.8 %, 0.90 99.1 → 99.6 %;
  hearts lost/run 0.75 9.86 → 8.35, 0.85 2.50 → 1.81. With Shaken = "cannot be
  saved" (1 heart) it was 72.9 % / 1.39: Shaken rarely cost anything for players
  without second chances or calm, so it now costs 2 hearts.

## Architecture and persistence
src/content/encounters.json: the scenes (content; format below).
src/game/encounters.ts: scene validation (also run by validate:content),
eligibility, offer/completion transitions, sanitizers (help shown: src/game/support.ts).
Option pinyin is read from words.json, the single source of tone marks.
Mandarin is an original AI-assisted draft requiring teacher review; scenes are
not part of the vocabulary review totals. Source inspiration: Hito's World
https://hito.world/play (public recipe structure inspected, no code copied) and
https://www.learnjapaneserpg.com/ (adaptive dialogue concept).

### Scene format (src/content/encounters.json)
- `id` (lower-case), `kind` (`reply` | `gather`), `speaker` (emoji).
- `requires`: word ids from words.json the player must have been introduced to.
  Must include every option and every character used in `zh` / `closing.zh`.
- `situation` (optional English context, always shown; must not
  translate the answer) and/or `zh` + `py` + `en` (the traveler's line).
- `grammar` (optional, shown after answering), `note` (explanation of the answer).
- `options`: 2-6 of `{ id, en }`. In `reply`/`gather` scenes `id` is a
  word id (no `icon`: a picture would give the answer away); in `point` scenes every option is a picture: `{ id, en, icon,
  "picture": true }` with a plain id such as `woman` (no Chinese label).
- `answer`: option ids (exactly one for `reply` and `point`; at least one
  option must be wrong).
- `result`, `resultIcon`, optional `closing` `{ zh, py, en }`.
Broken scenes are reported by `npm run validate:content` and skipped by the game.
Preview any scene with `/?encounter=<id>&level=2` (every word Familiar: pinyin) or `&level=3` (characters only).

src/EncounterScreen.tsx: accessible dialog with focus containment, pressed
option states, result feedback, paid help and a scrollable body. No skip or leave:
"Continue to next floor" (or Escape) only once the scene is complete. Emoji are
used only for decoration and for picture options; no external artwork or audio
(no pronunciation audio pending voice/content review).

App.tsx: offers a scene from the floor summary and continues to the next floor
through the normal nextEnemy path; an open scene blocks battle auto-advance and
speech. Saved.run.encounter keeps the scene, option order, selection, whether
help was bought/shown and the first-try result; Saved.encounterHistory keeps up
to 30 completion dates per scene (rotation); Saved.recentEvents the last 12
scenes/trials shown; Run.omen and Run.hintDebt the stakes. All are optional
additive fields of the v1 save: old saves load with none of them, old saved
encounters drop fields that no longer exist (the day-based stage). Older app
versions discard the added fields: avoid rolling back during an active scene.

## Boss trials (inside a fight)
A boss trial is a single battle question with a boss-specific payoff, so unlike
the scenes above it allows exactly one submission and a wrong answer counts.
Code: src/game/trials.ts, TrialScreen.tsx; content: src/content/trials.json.

### Golem's Tone Trial

- Offered once per Golem fight, right after its first shield segment breaks (the
  player has already seen how the shield works), and only with a line whose
  words have all been introduced (你好！ 谢谢！ 再见！ are available on run 1).
- The Golem carves the line; the player picks the tone-marked pinyin (3 options).
- Right: the rest of the shield shatters and the Golem loses 25% of its max HP
  (TUNING.golemTrialHit), clamped so it never kills. Wrong: resolveAnswer with
  isCorrect=false (heart, second chance or defeat; never a practice save).
  Mastery never changes.
### Echo Wraith's Wail
- Offered once per Wraith fight, when it first drops below 60% HP
  (WRAITH_ECHO_AT, the moment its echo starts), with a line of known words.
- The Wraith says a line (Chinese + pinyin); the player picks the reply that
  answers it (Chinese + pinyin; English appears after answering). Distractors
  are real phrases that do not answer the line (再见 to 你是谁？), never another
  valid answer.
- Right: Run.calm = 1: the next wrong answer this expedition costs no heart
  (protection order: practice, calm, second chance; 👻 chip by the hearts).
  Wrong: an ordinary wrong answer. Mastery never changes.
- Why the charge is kept until used: limited to the rest of the Wraith fight,
  the bot (0.75 accuracy, 20 seeds) used only 133 charges for ~205 hearts lost
  on wrong replies (hearts lost/run 10.30 -> 10.71, wins 61% -> 55%). Kept until
  used: 557 charges used, hearts lost/run 10.21, wins 61%, depth-1 clear median
  7 -> 5 expeditions; 0.60 accuracy unchanged (29 -> 28, 5% wins).

### Ink Scribe's Torn Note
- Offered once per Scribe fight, right after its first ink seal breaks (on
  floor 3 two of its three seals remain), with a note of known words.
- The note has one missing character (＿, shown as a dashed ？) and its English
  meaning; the player picks the character that completes it. Pinyin of the
  whole note appears after answering (before, it would give the answer away).
  Distractors are characters the player knows that do not fit, preferably
  homophones (朋友 needs 友, not 有: both are yǒu).
- Right: every remaining seal breaks (no damage: on floor 3 that saves two
  character questions). Wrong: an ordinary wrong answer.
- Balance (20 seeds, scribeTrial on vs off, the other trials on): 0.60
  accuracy depth-1 median 28 → 30 expeditions (quartiles 26-32 / 28-32), wins
  5% → 4%; 0.75 accuracy 5 → 6, wins 61% → 60%; hearts lost/run ≈10.2 both.
  Neutral within noise: its value is the shortcut through the seals.

### Mirror Trickster's Mirrors
- Offered once per Trickster fight, the first time it drops below half HP
  (TRICKSTER_LOW), with statements made of known words.
- A scene and three statements (Chinese, pinyin per word level, English after
  answering); exactly one is true. The scene is either a **tray of noun tiles
  written as characters** (generated, see Generated events: 这里有 X / 这里没有
  X / 这里有 N 个 X, for any noun) or, for 他 / 她, a picture of a man or a
  woman (authored: same pinyin, so only the character tells them apart).
  Reading the tiles is part of the task; their aria-label lists them.
- Right: a heavy blow, 30% of its max HP (TUNING.tricksterTrialHit), never the
  killing blow, plus a calm charge (Run.calm: the next wrong answer this
  expedition costs no heart). Wrong: an ordinary wrong answer.
- Balance (20 seeds, tricksterTrial on vs off): wins unchanged within noise
  (0.75: 60% → 59%; 0.85: 97% → 97%), hearts lost/run slightly up (0.75:
  10.18 → 10.33; 0.85: 3.01 → 3.33); 0.60 players rarely reach floor 4
  (unchanged). The hit size barely matters (0.3, 0.4 and 0.5 gave identical
  runs): below half HP the Trickster usually falls to the next right answer
  either way, so the trial saves about one answer while being as hard as a
  trick question (the bot gets 66% right). Once trials became mandatory this
  cost more (0.75: wins 60.1% → 56.5%, hearts lost/run 9.99 → 10.39), so a
  right answer now also gives a calm charge: 0.75 wins 60.4%, hearts lost/run
  10.09 (see "Trials are mandatory" below).
- Statements cannot be checked automatically for truth: reviewers must check
  that exactly one statement matches the picture.

### Cavern Warden's Gauntlet
- The final boss's shield is 2 tone wards on top of 2 ink seals, so its trial
  has two steps that mirror them. Offered once per Warden fight, right after
  the first tone ward breaks.
- Step 1: a tone trial (the Golem's pool: authored and generated). Right: the
  last tone ward breaks (shield down to WARDEN_SEALS).
- Step 2 (follows straight away, "Next challenge"): a torn note (the Scribe's
  pool). Right: every remaining seal breaks (shield 0).
- Each step is answered once; a wrong step is an ordinary wrong answer and
  the next step still follows (a defeat ends the gauntlet). No damage, no
  calm charge. If no note can be built from the player's words, the gauntlet
  is the tone step alone.
- The reward depends on the fight (resolveTrial checks for the Warden), not
  on the trial content, so both steps reuse the existing trial types.
  Run.trial.next holds step 2 (id, shuffled order, and the trial itself when
  generated); closeTrial starts it; step is 1 or 2. Both survive a reload, and
  a broken next step is dropped on load.
- Balance (20 seeds, wardenTrial on vs off, all other trials on): 0.60
  wins 4.8% → 4.4% (they rarely reach floor 5); 0.75 wins 60.4% → 64.4%,
  depth-5 clear median 14 → 13 expeditions, hearts lost/run 10.09 → 9.90,
  longest fight 22 → 18 answers; 0.85 wins 97.5% → 97.0%, hearts lost/run
  2.62 → 2.74; 0.90 99.8% → 99.5%, 0.61 → 0.74. The Warden is the longest
  fight; the gauntlet shortens it.
- Preview: /?trial=warden plays a sample gauntlet (both steps).

### Trials are mandatory
Boss trials cannot be skipped: there is no "Not now" button, Escape does
nothing until the trial is answered, and closeTrial only closes an answered
trial (a pending one stays open, also across reloads). The trials shorten the
fight (shield, HP) or protect the player (calm), so a forced trial mostly
replaces risk rather than adding it. Simulator (20 seeds, the bot answers
every trial; before → after the Trickster's calm charge was added, compared with
every trial off):
- 0.60: wins 5.1% (off) → 4.8%, hearts lost/run 10.29 → 10.11.
- 0.75: wins 57.8% (off) → 56.5% (forced, no calm) → 60.4% (forced, calm);
  hearts lost/run 10.34 → 10.39 → 10.09.
- 0.85: wins 95.9% (off) → 97.5%; hearts lost/run 3.52 → 2.62.

### Shared rules
- Run.trial saves { id, floor, order, status, chosen }: a reload shows the same
  line, an answered trial shows its result, and it is never offered twice in a
  fight. Old saves have no trial field.
- trials.json format: id, boss, requires (word ids; every character shown must
  belong to one), zh, en, answer, note, options (3-4).
  golem: options are pinyin strings; the validator requires every option to
  differ from the answer **only in tone marks** and rejects a distractor that
  turns a written third tone into a second tone (tone sandhi makes that
  ambiguous). wraith: also py (the line's pinyin); options are { zh, py, en }
  and answer is the right option's zh. scribe: zh has exactly one blank (＿),
  py is the completed note's pinyin, options are Chinese characters only.
  trickster: no zh; picture (emoji) and en (describes it); options are
  { zh, py, en } statements, exactly one true; answer is its zh.
  Preview: /?trial=<id>.
- Balance (bot takes the trial with more than 2 hearts, 20 seeds, depth-1 clear
  median / win rate): 0.60 accuracy 29 → 29 expeditions, 5% → 5%; 0.75 accuracy
  7 → 7, 58% → 61%. Hearts lost per run unchanged (≈10.3).
- Full report with all four trials on (node tools/simulate.ts --report, 5
  seeds, noisy; trials mandatory, Trickster calm charge): win rates at
  .60/.75/.85/.90/1.00 = 5/66/98/100/100%; with
  every trial off they were 5/61/98/100/100%. Judge a single trial by the
  20-seed comparisons in its section, not by these medians. Use the 20-seed
  comparisons above, not these 5-seed medians, to judge a trial.

## Repeat protection
Saved.recentEvents keeps the last 12 encounters and boss trials offered
("scene:<id>", "trial:<id>", newest first; src/game/recent.ts). Offers skip
anything in it while something else is available, and fall back to the full
pool only when everything is recent. An offered scene counts even if skipped.

## Generated trials
src/game/trialgen.ts builds Golem and Scribe trials from the words the player has
met, so they rarely repeat. Authored and generated trials are drawn half and
half for those bosses (when both exist), then recent ones are skipped. A
generated trial is stored whole in Run.trial.data (so a reload shows the same
one) and re-validated on load; ids start with "gen-" (reserved: trials.json
may not use it). Every generated trial passes the same validator as authored
ones, and tests generate every trial from the whole course with several seeds
and check the rules below.

- Golem tone trials: any known word (not particles) or any example sentence
  from explanations.json whose characters are all known (20 sentences today).
  Two wrong options, each changing ONE syllable's tone mark: never a written
  third tone into a second tone (sandhi), never the syllable of 一 or 不, never
  a toneless syllable, never into an accepted variant, a connected-speech
  reading, or the reading of another entry written the same way (看 kàn/kān).
  The note names the tones of the changed syllables.
- Scribe torn notes: one character of a known multi-character word is blanked
  (never a character that appears twice, like 谢谢). Wrong options are known
  single-character words, same-sound or look-alike first; a wrong option may
  not turn the word into another real word (这里 + 那 would be 那里). The
  English meaning is shown as for authored notes. Sentences are not used:
  a wrong character can silently make another valid sentence (很大 → 很好).
- Coverage (default course): after 5 words about 6 tone trials, after 40 words
  40 tone trials and 9 notes, after 100 words 115 tone trials and 33 notes.
- The Wraith and Trickster trials stay authored (replies and true statements
  need a person). Planned: a tagged reply bank and picture/measure-word fields
  in words.json for templated scenes and statements.
- Balance (20 seeds, before → after): wins 0.60 4.1% → 4.9%, 0.75 58.8% →
  58.6%, 0.85 97.4% → 97.0%; hearts lost/run 10.25 → 10.32, 10.33 → 10.32,
  3.33 → 3.03; trials per run about the same (the authored pool already
  covered most fights): the change is variety, not frequency.

## Generated events and Trickster trays (src/game/nouns.ts, scenegen.ts, trialgen.ts)
Built from the `noun` / `measure` fields of words.json, so they scale with the
vocabulary (1000+ words) instead of a few authored scenes. Only fixed sentence
patterns are produced (review the patterns once, not every sentence):
这里有 X。 / 这里没有 X。 (any noun), 这里有 N 个 X。 (nouns whose measure word
is 个; N = 3..6: 一 changes tone and 两 replaces 二 before a measure word), and
我要 X。 (any noun). English glosses are quoted ("There is “tea” here.")
because the data does not say which nouns are countable.
- **Counting event** (point): 这里有 N 个 X。 → three groups of X tiles of
  different sizes; tap the group of N. Replaces the old emoji crowd scenes.
- **Request event** (gather): 我要 X。 or 我要 X。我要 Y。 → pick exactly what
  was asked for; the other options are known nouns from the same topic group
  first, so the answer cannot be picked by category. No pictures.
- **Trickster tray** (boss trial): two nouns on the tray and a third absent
  (presence), or N tiles of one noun (counting); one true statement.
- Generated events need every word at Familiar or higher (like authored ones);
  trays use introduced words (like other trials). Authored and generated events
  and Trickster scenes are drawn half and half. A generated event or trial is
  stored whole in the run (Run.encounter.data / Run.trial.data) and re-validated
  on load; "gen-" ids are reserved (rejected in the JSON files).
- Tests read every generated statement against its tray and every counting
  answer against its tiles (exactly one true / right), for the whole course
  with several seeds.
- Words without `noun` are never used; nouns without `measure` are left out of
  counting. Today: 29 nouns, 8 counted with 个 (others' measure words, 本 杯 只
  条 辆 …, are not taught yet: add them to the course to unlock counting).

## Preview link
`/?encounter=<scene id>[&level=0-5]` opens a scene on its own (words at that level, default 2), without a run or the
prerequisite words. It never changes the save; Close preview removes the parameter.

## Testing and review
- Automated: tests/encounters.test.ts (content validation, eligibility at
  Familiar, per-word help, offer rotation, first-try Blessing/Shaken, paid help
  and hint debt, omen rules in resolveAnswer, saves), tests/trials.test.ts and
  tests/trialgen.test.ts (every boss trial; every generated trial from the whole
  course with several seeds). Run `npm run test:brief`; content changes also
  `npm run validate:content`.
- Balance: tools/simulate.ts models events and trials; the numbers quoted in
  the sections above are 20-seed comparisons (the 5-seed `--report` medians are
  too noisy to judge one feature).
- Manual check on a phone (or one 360 px browser check) with the preview links,
  which never touch the save: `/?encounter=hello&level=2` (pinyin, no English,
  no option icons), `&level=3` (characters only), `/?encounter=friend-he`
  (picture options), `/?trial=scribe-friend&level=2` (blanked pinyin),
  `/?trial=warden` (two steps). In a real run: help shows its hint price, a
  wrong first choice announces Shaken, the next floor shows the ✨ / 🌧 chip.
- Still needs a person: Mandarin review of the scene and trial texts and of the
  generation rules (see Generated trials), and real-device playtesting.
