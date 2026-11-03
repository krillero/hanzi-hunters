# Vocabulary scheduling

Status: **milestones (a) to (e) are done.** `src/game/schedule.ts` is the scheduler; `src/game/learning.ts` connects it to answers, the new-word
card, details and the wordbook; the save is **v2** (`answerSeq`, entries carry scheduling data) and v1 saves and backups are migrated once on load.
Nothing outstanding in the plan; see the limitations below.

## Evidence and product defaults

| Source | What it supports | What it does not show |
|---|---|---|
| Karpicke & Roediger (2008), https://doi.org/10.1126/science.1152408 | Repeated retrieval improved delayed foreign-vocabulary recall | That merely displaying a word equals retrieving it |
| Kim & Webb (2022), https://doi.org/10.1111/lang.12479 | Spaced practice helps L2 learning (48 experiments); equal and expanding spacing were equivalent in aggregate | That any one schedule is best |
| Nakata (2017), https://doi.org/10.1017/S0272263116000280 | More within-session retrievals improved retention, but the most repetition was not the most efficient | That more taps are always better |
| Rawson & Dunlosky (2011), https://doi.org/10.1037/a0023956 | Three initial successful recalls, then spaced relearning, for conceptual material | That three multiple-choice taps teach Chinese optimally |
| Cepeda et al. (2008), https://doi.org/10.1111/j.1467-9280.2008.02209.x | The best gap depends on how long the knowledge must last | Specific intervals for this game |

**The exact numbers below are product defaults informed by this research, not established optimal intervals.** "Mastered" is the game's
retention milestone, not proof of speaking, listening, writing or permanent knowledge. Multiple-choice success is recognition evidence only.

## Constants (all in `schedule.ts`)

`INITIAL_SUCCESS_TARGET = 3`; `INITIAL_GAPS` = 2 other answers + 30 s, 4 + 90 s, 8 + 180 s; `LONG_BREAK_MS` = 20 min (satisfies any gap);
`RELEARN_GAP` = 2 + 30 s; `REVEAL_QUIET_MS` = 10 min; `STAGE_INTERVAL_MS` = 24 h (Familiar), 24 h (Remembered), 72 h (Retained), 14 d (first maintenance);
`MAINTENANCE_INTERVAL_MS` = 30 d; `RECHECK_MS` = 24 h. All waits are elapsed milliseconds, never calendar dates.

## Rules

- One scheduler per entry. Levels 0-5 keep their names (New, Learning, Familiar, Remembered, Retained, Mastered); there is no level 6.
- `recordAnswer(entry, { correct, assisted, dim, now, seq, toneOk? })` is the only API that changes an entry after an answer. `seq` is a
  global per-save answer number, +1 per submitted answer (incl. mistakes). An answer whose `seq` is not above the entry's `lastSeq` is
  ignored, so double submissions and replays cannot score twice. "Other answers" = answers of other entries since the anchor.
- Reading a new-word card calls `introduce` (level 0, no credit). Details, translations and every answer's feedback show the answer;
  `recordReveal` and `recordAnswer` store that as `reveal`, separate from the last qualifying success (`dims[d].lastQual`).
- **Dimensions** (`meaning, reading, listening, reverse, sentence`): evidence (attempts, correct, last times; tone right/wrong for reading)
  is stored per dimension for every answer. Only `PROMOTING_DIMENSIONS` (`meaning` and `reverse`, see below) can move the scheduler, including lapses.
  Requiring more dimensions per stage later only needs this constant and one predicate, not a data change.
- A mode that cannot tell whether the answer was revealed must pass `assisted: true` (conservative).
- **Promoting dimensions today: `meaning` and `reverse`** (meaning to hanzi, pinyin to hanzi, homophone, look-alike). A meaning-only gate would stall
  every word at Learning, because the question mix at level 1 has no meaning question (`KIND_WEIGHTS` in questions.ts). Reading (pinyin, with
  tone-right / tone-wrong evidence), listening and sentence (particle) answers are recorded only. Particles are asked mostly as sentences, so they
  advance more slowly (through their meaning questions). Revisit when the question mix is reviewed.
- **Assisted** = a hint removed options, or the question card showed the answer it asks for (`answerRevealed`), or the word had no introduction.
  Showing pinyin on a meaning question is not assistance. Reveals: new-word card, answer feedback, opening details, opening the wordbook.
- Boss-trial answers bump the global answer number (they count as answered questions for spacing) but are not tied to a word, so they record no evidence and promote nothing.
  Events and scenes never promote.

## State transitions (promoting dimension)

| State | Answer | Result |
|---|---|---|
| Initial (ok 0-2), gap met | correct, unassisted | `ok+1`; lv 1 after the first; after the third lv 2, due = now + 24 h. Gap anchor resets |
| Initial, gap not met | correct | Practice only (`practice`) |
| Any | correct, assisted | Recorded (`assisted`), no change |
| Initial or established, not relearning | incorrect | Initial: keep `ok`, start relearn. Established: lv = max(2, lv-1), start relearn. Anchor resets |
| Relearn | incorrect | No level change (one failure transition per recovery); anchor resets |
| Relearn, gap met (2 + 30 s or 20 min) | correct, unassisted | Initial word: recovery cleared, **no** initial credit. Established: recheck due now + 24 h, **no** promotion |
| Relearn, gap not met | correct | Practice only |
| Established, before due | correct | Practice only; due time unchanged |
| Established, due, answer not shown in the last 10 min | correct, unassisted | lv + 1 (at most one stage, however overdue); due = now + interval of the new level |
| Level 5, due | correct, unassisted | Stays lv 5 (`maintained`); due = now + 30 d |
| Recheck, due | correct, unassisted | Recovery cleared, lv + 1 (max 5), then that level's normal interval |
| Recheck | incorrect | Back to relearn, no further level drop |

Late players are never penalised: overdue words stay at their level and are simply due.

## Migration (v1 to v2, applied in `sanitizeSave`)

`fromLegacyEntry` converts each v1 entry (also the parked `legacyMastery`) `{lv, ok, at?}` once; the new shape is then validated by `sanitizeSched` on every load (no re-migration).

- Every level is kept. lv 0: 0 successes; lv 1: 1 of 3; lv 2+: initial learning complete. No credit for past answers; gap anchors and the answer counter start at migration time.
- lv 2+ with a valid date: due = **local noon** of that date + the interval of the level (24 h / 24 h / 72 h / 14 d for 2/3/4/5), clamped to at most one interval from now. Overdue dates are preserved.
- Missing or invalid date: due now, no promotion. A level-5 entry without a date is capped at 4 (as before).
- `sanitizeSched` bounds counters, enum values and sequence numbers, and clamps future `at`/`reveal`/`adv`/`due` timestamps to now (a requirement may wait, never pass).
- Peaks, legacy mastery/peak (unknown ids), curriculum progress and practiced history are untouched; lesson readiness keeps its current threshold.

## Remaining limitations

Recognition (multiple choice) is not production or speaking; only meaning and written-form (`reverse`) questions promote for now; the timings are untested defaults.
Future validation should compare delayed recall after 7 and 30 days and retention per minute of practice, not session accuracy or playtime. No analytics are sent.

## Callers

The old calendar-day API (`updateMastery`, `waitDays`, `daysUntilDue`, `RETENTION_DAYS`, `PROMOTE_AFTER`, `daysBetween`, string-date `isDue`) is gone.
`App.tsx`, `CampScreen.tsx`, `course.ts` (`ReviewOptions.now`), `progress.ts`, `save.ts`, `backup.ts` and `tools/simulate.ts` use `schedule.ts` / `learning.ts`.
The simulator advances a clock (12 s per answer, 8 h between expeditions on one day) and the answer number, and answers as an unassisted meaning question.

## Question selection (`selectReview` in `course.ts`)

With `now` and `seq` (the number the next answer will get), the tier decides first, then the existing weights: **relearning** (gap met) >
**due** delayed / maintenance / recheck reviews (still capped at `DUE_PER_FIGHT` per fight) > **initial learning** (gap met) > **other** known
entries. Within a tier the recent-item penalty, current-item avoidance and filters are unchanged. A tier with nothing askable is skipped, a
filter that removes everything returns null, and `App.tsx` already retries other words (at most 8 tries) when one cannot build a valid question,
so nothing waits for a gap. A just-failed entry cannot come back before 2 other answers, so it cannot occupy every question. Boss-required
question kinds still override the kind of question, never the credit rules (credit depends on the answer, not on how the word was picked).
New introductions still come from the curriculum system and the learning-pool limits are unchanged.

## Player-facing wording (`game/status.ts`, `learningNote` in `game/learning.ts`)

Camp: "N words ready for review (M maintenance)", "Maintenance due: N words", "N words to practice again", "Next word review in 2 days".
Wordbook: a tag per word (review / maintenance / practise, or "1/3" while still learning) and a screen-reader line such as "Next check in 3 days".
Question card: the level badge shows "LEARNING 1/3" during initial learning. After an answer: see the feedback lines in `learningNote`.
All estimates come from stored timestamps; a late return only shows words as due, never as lost.

## Simulator and measured pace (`tools/simulate.ts`, `node tools/simulate.ts --report`)

The simulator advances a clock (12 s per answer, 8 h between expeditions on one day) and the answer number, asks each word the question kind the game
would choose (so only promoting dimensions earn credit), and uses a hint on 8% of answers (assisted, no credit, but a right answer is more likely).
Final report (5 seeds x 20 expeditions): median time from the new-word card to Familiar is about **1 day** (1434-1446 min at 75-100% accuracy, because
words introduced late in a session finish in the next one), about 80-127 answers counted across all words (about 2 expeditions); 88-95% of words
introduced reach Familiar within 20 expeditions at 75%+ accuracy (68% at 60%); 38-48% of answers move a word on. Expeditions to clear depth 1-5 are
unchanged from main at 75%+ accuracy (e.g. 85%: 2/3/4/6/7 against 1/3/4/5/6). The first expedition at 90% accuracy is won in about 83-85% of seeds against
88% on main (60 seeds), because early mastery damage bonuses now need spaced successes; `tests/balance.test.ts` now uses 20 seeds and a threshold of 16.
These are model results (a bot with fixed accuracy), not evidence about real learners.
