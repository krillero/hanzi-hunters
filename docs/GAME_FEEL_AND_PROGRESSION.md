# Game feel, motivation and ideas not built yet

This started as the design proposal for game feel (2026-10). Most of it is now implemented and described in
`docs/GAME_DESIGN.md`; this file keeps the **principles**, a **status** of the original proposals, and the **ideas that are still
open**. The current rules are always in `GAME_DESIGN.md`, not here.

## 1. Goals and principles

Goal: people should *want* to start one more run, and every run should leave them knowing more Mandarin than before.

Principles (in priority order):

1. **Learning first.** A reward must never make the wrong thing (guessing, speed-tapping) pay better than the right thing. Reward correct answers, effort and mastery — never speed.
2. **Feedback within a fraction of a second, in more than one sense.** Sight + sound + (where available) vibration. Anything important is also readable without colour or sound.
3. **Anticipation beats surprise.** A visible path ("3 more, then the boss") and visible progress ("one more correct to master this word") are what pull people forward; random drops are the seasoning, not the meal.
4. **No dark patterns.** No streak-loss guilt, countdown pressure, fake scarcity or notifications. Daily play may be welcomed but never punished when missed.
5. **Calm layout.** Nothing in the battle layout may move or resize when feedback appears (the fixed-slot layout rule from PR 16/17; `tools/layout-check.mjs` guards it). New feedback lives in the arena overlay or in full-screen moments that replace the layout deliberately.
6. **Small, original, consistent art and sound.** Procedurally generated sound (no licensed samples), the existing pixel-art palette, no new dependencies unless justified.

---

## 2. Status of the original proposals

| Proposal | Status |
|---|---|
| Procedural sound effects and haptics, own settings (`src/audio.ts`) | Implemented |
| Kill celebration, level-up moment, coin/XP motes (`src/motes.ts`) | Implemented |
| Loot reveal with cosmetic rarity and comparison (`src/LootReveal.tsx`, `src/game/rarity.ts`) | Implemented |
| Floor path in the header; floor-clear and defeat summaries ("what you learned") | Implemented |
| Words-known counter | Implemented (Settings → Your stats: words learning and mastered; camp shows lesson progress and the Familiar count) |
| Days-played tally | Tracked in the save (`habit.daysPlayed`) but not shown anywhere yet |
| Bosses | Implemented differently: every floor ends with a boss, plus a final boss and trials (`GAME_DESIGN.md`, Bosses) |
| Fill-the-blank | Implemented for grammar particles only (`cloze.json`, the `particle` question kind) |
| Mastery ceremony | Proposed for level 4; levels changed since (4 = Retained, 5 = Mastered). Not built as a ceremony |
| Daily warm-up | Built, then removed (it cluttered camp); `habit.warmupDay` stays in saves, unused |
| Milestone badges | Built, then removed (noise); `habit.badges` stays in saves, unused |
| Local-only statistics screen (accuracy per question kind) | Open |
| New challenge formats (§3) | Open |

---

## 3. Challenge formats not built yet

Existing question kinds: see `src/game/questions.ts` and `GAME_DESIGN.md`.

| Format | Trains | Needs content? | Effort | Notes |
|---|---|---|---|---|
| **Tone-pair drill**: hear two words, pick the pair of tones | Tone discrimination | No (word audio) | Small | Needs a Mandarin voice; hidden without one |
| **Match pairs**: 3×2 grid linking character / pinyin / meaning | Associations | No | Small–medium | A wrong pair costs a heart like any mistake |
| **Recall round**: 5 words, no choices shown first, then check | Active recall | No | Medium | No heart loss for misses |
| **Fill the blank** beyond particles: a sentence with one missing known word | Words in context | **Yes (sentences)** | Medium | Sentence uses only known words; one correct answer |
| **Sentence building**: order 3–5 word tiles | Word order | **Yes (sentences)** | Medium | Several valid orders must be handled in data |
| **Dictation**: hear a word, pick the characters | Listening to writing | No (words) / yes (phrases) | Medium | |
| **Radical / component match** | Character structure | **Yes (radical data)** | Large | Postpone |
| **Other meanings of known words** | Polysemy in context | **Yes** | Medium–large | Intent recorded in `docs/SENSES.md`; not to be built without the owner |

Principles: a new format appears first as a **rare, optional bonus** so players meet it with low stakes; it has its own rules for
what a miss costs; it is reachable by keyboard and screen reader like the existing choices; it is a new `kind` in `questions.ts`
with its own fairness checks and tests.

---

## 4. Measurement, risks and open questions

* Balance is modelled by `tools/simulate.ts` and guarded by `tests/balance.test.ts`; the bot is a model, not real players.
* Local-only statistics (accuracy by question kind, words per run) would make tuning evidence-based. Nothing may leave the device.
* Playtest per change: a few testers new to Mandarin, 15-minute sessions; ask "what did you learn?" and "what made you stop?".
* **Over-gamification:** more reward can crowd out learning (principle 1).
* **Sound policy:** browsers block audio before the first tap; mute must stay one tap away. **Vibration** is Android-only: never
  rely on it for meaning.
* **Content risk:** sentences, themes and explanations need native-speaker review (same flag as existing content).

---

## 5. Mockups

`docs/design-references/game-feel/` holds mockups rendered from the **real game UI**: the running game with its real CSS, fonts, sprites and panels, plus the proposed new elements injected on top. They are pictures of the 2026-10 proposal, not screenshots of working features: several shown elements were later built differently or removed (§2). Orange numbered pins match the notes under each phone.

| Sheet | Contents |
|---|---|
| `sheet-1-feedback-moments.png` | 1 Kill celebration · 2 Level-up moment · 3 Loot reveal · 4 Floor path + words-known |
| `sheet-2-floors-bosses-formats.png` | 5 Floor-clear summary · 6 Boss intro card · 7 Boss fight with tone shield · 8 Sentence building |
| `sheet-3-formats-and-learning.png` | 9 Match pairs · 10 Camp with daily warm-up and counters · 11 Mastery ceremony |

Single phone screenshots (`kill.png`, `levelup.png`, `loot.png`, `path.png`, `floorclear.png`, `bossintro.png`, `bossfight.png`, `sentence.png`, `match.png`, `camp.png`, `mastery.png`) are 411×740 and use a sample save (floor 5, level 5). The boss sprite is a recoloured placeholder of the existing imp; real boss art is part of phase 3.
