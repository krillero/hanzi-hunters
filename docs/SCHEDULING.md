# Vocabulary scheduling

Status: **milestone (a) of the spaced-retrieval work**. `src/game/schedule.ts` (pure, tested in `tests/schedule.test.ts`) is complete.
It is **not wired into the game yet**: `mastery.ts` and the save format (`SAVE_VERSION` 1) still drive play. The save bump to version 2,
the evidence API in `App.tsx`, selection priority, UI and the simulator follow in later milestones. Until then nothing below changes behavior.

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
`RELEARN_GAP` = 2 + 30 s; `REVEAL_QUIET_MS` = 10 min; `STAGE_INTERVAL_MS` = 24 h (Familiar), 72 h (Remembered), 168 h (Retained), 14 d (first maintenance);
`MAINTENANCE_INTERVAL_MS` = 30 d; `RECHECK_MS` = 24 h. All waits are elapsed milliseconds, never calendar dates.

## Rules

- One scheduler per entry. Levels 0-5 keep their names (New, Learning, Familiar, Remembered, Retained, Mastered); there is no level 6.
- `recordAnswer(entry, { correct, assisted, dim, now, seq, toneOk? })` is the only API that changes an entry after an answer. `seq` is a
  global per-save answer number, +1 per submitted answer (incl. mistakes). An answer whose `seq` is not above the entry's `lastSeq` is
  ignored, so double submissions and replays cannot score twice. "Other answers" = answers of other entries since the anchor.
- Reading a new-word card calls `introduce` (level 0, no credit). Details, translations and every answer's feedback show the answer;
  `recordReveal` and `recordAnswer` store that as `reveal`, separate from the last qualifying success (`dims[d].lastQual`).
- **Dimensions** (`meaning, reading, listening, reverse, sentence`): evidence (attempts, correct, last times; tone right/wrong for reading)
  is stored per dimension for every answer. Only `PROMOTING_DIMENSIONS` (currently `meaning`) can move the scheduler, including lapses.
  Requiring more dimensions per stage later only needs this constant and one predicate, not a data change.
- A mode that cannot tell whether the answer was revealed must pass `assisted: true` (conservative).

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

## Migration (applied when the save is bumped to v2, a later milestone)

`fromLegacyEntry` converts each v1 entry `{lv, ok, at?}` once; the new shape is then validated by `sanitizeSched` on every load (no re-migration).

- Every level is kept. lv 0: 0 successes; lv 1: 1 of 3; lv 2+: initial learning complete. No credit for past answers; gap anchors and the answer counter start at migration time.
- lv 2+ with a valid date: due = **local noon** of that date + the interval of the level (24 h / 72 h / 168 h / 14 d for 2/3/4/5), clamped to at most one interval from now. Overdue dates are preserved.
- Missing or invalid date: due now, no promotion. A level-5 entry without a date is capped at 4 (as before).
- `sanitizeSched` bounds counters, enum values and sequence numbers, and clamps future `at`/`reveal`/`adv`/`due` timestamps to now (a requirement may wait, never pass).
- Peaks, legacy mastery/peak (unknown ids), curriculum progress and practiced history are untouched; lesson readiness keeps its current threshold.

## Remaining limitations

Recognition (multiple choice) is not production or speaking; only meaning questions promote for now; the timings are untested defaults.
Future validation should compare delayed recall after 7 and 30 days and retention per minute of practice, not session accuracy or playtime. No analytics are sent.
