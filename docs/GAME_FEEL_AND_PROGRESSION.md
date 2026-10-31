# Game feel, motivation and deeper learning — design document

Status: **proposal, nothing in this document is implemented yet.** It describes what the game does today, what is missing, and a phased plan. Sections marked *(needs content)* depend on new, native-speaker-checked material. Mockups referenced here are in `docs/design-references/game-feel/` (see the last section).

Related docs: `GAME_DESIGN.md` (current rules), `CONTENT_GUIDE.md` (words/explanations), `public/assets/README.md` (pixel-art pipeline).

---

## 1. Goals and principles

Goal: people should *want* to start one more run, and every run should leave them knowing more Mandarin than before.

Principles (in priority order):

1. **Learning first.** A reward must never make the wrong thing (guessing, speed-tapping) pay better than the right thing. Reward correct answers, effort and mastery — never speed.
2. **Feedback within a fraction of a second, in more than one sense.** Sight + sound + (where available) vibration. Anything important is also readable without colour or sound.
3. **Anticipation beats surprise.** A visible path ("3 more, then the boss") and visible progress ("one more correct to master this word") are what pull people forward; random drops are the seasoning, not the meal.
4. **No dark patterns.** No streak-loss guilt, countdown pressure, fake scarcity or notifications. Daily play may be *welcomed* ("5-word warm-up ready") but never punished when missed.
5. **Calm layout.** Nothing in the battle layout may move or resize when feedback appears (the fixed-slot layout rule from PR 16/17; `tools/layout-check.mjs` guards it). New feedback lives in the arena overlay or in full-screen moments that replace the layout deliberately.
6. **Small, original, consistent art and sound.** Procedurally generated sound (no licensed samples), the existing pixel-art palette, no new dependencies unless justified.

---

## 2. Audit: how feedback works today

Verified against `main` (after PR 17).

| Moment | What the player gets today | Assessment |
|---|---|---|
| Answer chosen | Result box: verdict, word (character · pinyin · meaning), note, mastery pips + sentence. Arena: hero lunge / enemy recoil, damage chip ("⚔ −43 · 🔥 +60%", "💔 −4"), WEAK HIT / BLOCKED / heal captions, streak badge | Clear and readable. Combat numbers and learning text are separated. |
| Right/wrong | Green/red box, grey weak-hit chip | Clear, but **colour-led**; no sound or vibration |
| Combo | Streak badge "🔥 ×N", orange damage chip | Understandable; nothing "happens" when a combo starts or breaks |
| Kill | Monster flashes, bursts, fades to a chest; VICTORY pill; XP/gold/loot chips; "Next enemy" | **Correct but quiet** — the most important moment of the loop has the same weight as a normal hit |
| Loot | A chip with the item name | **Flat**: no reveal, no rarity, no comparison with what you wear |
| Level-up | A "Level N!" chip | **Nearly invisible** for the biggest short-term progress event |
| Healing | Numbers change (potion caption, Second Wind +5 after a kill) | Potion has a caption; post-kill heal and level-up HP refill are **not shown** |
| Floor clear | "Descend to floor N" button + FLOOR banner | No summary, no sense of accomplishment |
| Defeat | Red veil, YOU DIED banner, "Go to camp" | Clear; could teach more (what you learned this run) |
| Learning progress | Word pips on the card; wordbook; "slipped back" / "level up" lines | Good per word; **nothing aggregates** ("you now know N words") |
| Sound | Mandarin speech only (text-to-speech). **No sound effects.** Mute switch only affects speech | Missing |
| Vibration | None | Missing (Android Chrome/Brave only; iOS Safari does not support it) |
| Variety | 3 enemy types, 1 arena (Mosslight Cavern), elite = 4th enemy, no bosses | Floor 10 looks like floor 1 |

Summary: the **informational** feedback is good and calm; the **emotional** feedback (reward, celebration, anticipation, variety) is thin.

---

## 3. Feedback layers

### 3.1 Moment to moment (seconds)

**Sound (procedural, WebAudio, no assets).** One small module `src/audio.ts` that synthesises short blips; each is < 400 ms. Separate setting from speech mute: *Sound effects* (on/off) and the existing *Speech* mute. Respect `prefers-reduced-motion` for flashes, not for audio.

| Event | Sound |
|---|---|
| Correct answer | Short rising two-note blip |
| Combo hit | Same, +1 octave sparkle on top; pitch rises a little with streak length (cosmetic only — damage does not grow) |
| Wrong answer | Soft low "thud"; never harsh or buzzer-like |
| Enemy defeated | Impact + three-note fanfare, 600 ms |
| Level up | Ascending arpeggio, 800 ms |
| Loot reveal | Chest creak + chime scaled by rarity |
| Word mastered | Distinct bell (see 5.2) |
| UI tap | Very quiet tick (optional) |

**Haptics** (`navigator.vibrate`, feature-detected, own on/off setting): correct 15 ms, combo 15-30-15, wrong 40 ms, kill 20-40-60, level-up pattern. Never required.

**Visual.** Short hit-stop (60–80 ms) and slightly stronger shake on a kill; coin/XP motes that fly from the monster into the header gold counter and the XP bar (replacing text chips as the *primary* signal, chips remain as the readable record). HP refills animate instead of jumping. All motion honours `prefers-reduced-motion` (fade only).

### 3.2 Per fight and per floor (a minute)

* **Kill celebration (≈1.2 s, skippable by tap):** hit-stop → burst → monster becomes chest → XP motes into the bar → HP heal animation if any ("💚 +5 Second Wind") → chip strip. Elite kills add a gold flash and a bigger banner ("ELITE VICTORY"). Auto-continue is unchanged (it never waits on this).
* **Level-up moment (≈1.5 s, tap to continue only if auto-continue is off):** arena flash, "LEVEL 6", HP bar refills, and a two-line stat summary ("+8 max HP · +1 attack"). Never blocks the next answer when auto-continue is on.
* **Loot reveal:** chest opens, item card slides in with **rarity** (common / rare / epic; derived from the item's total bonus, so no content work), what it replaces, and a "NEW" tag. "Equip" stays in the Gear screen; a one-tap "Equip now" is offered only if the slot is empty or the item is strictly better.
* **Floor path:** the header shows the floor as a path of nodes (● ● ○ ◆) with the boss/elite as the last node, so players always know what is next.
* **Floor-clear summary (new full-screen card):** words learned (new), words levelled up, words mastered, best streak, accuracy this floor, gold and loot. One button: "Descend". This is the place to show learning, not just loot.
* **Defeat summary:** same card with "what you learned this run" and the 1–3 words to review ("these will return first") — turns a loss into progress.

### 3.3 Per session and across days

* **Words-known counter** in the header/camp: "42 words · 11 mastered", with a gentle bump when it changes.
* **Daily warm-up** *(needs a `lastPlayed` date in the save)*: five previously seen words, due for review, no HP risk, small gold reward; always optional. Missing a day costs nothing.
* **Days-played tally** instead of a fragile streak: "12 days played" never goes down.
* **Milestones** (cosmetic badges): first mastered word, 10/25/50 words known, first boss, 100 correct answers. Shown in camp; no popups outside natural pauses.

---

## 4. Learning-visible design

* Mastery pips and the "level up / slipped back" sentence already exist; add a **mastery ceremony** when a word reaches level 4 ("MASTERED 好 hǎo") — a distinct sound and a card flip in the result box, once per word.
* **Review priority is explained once** ("words you miss return sooner"), because spaced repetition that feels random feels unfair.
* **Explanations** (💡) become a reward too: after a first correct answer a small "💡 more about 石" link pulses once per word.
* Never show information that gives away the current answer (rule from the bulb fix: the bulb appears only when the whole word is already visible).

---

## 5. New challenge formats

Existing question forms (11): see `src/game/questions.ts` (intro, meaning, pinyin, character, listen, meaning→pinyin, pinyin→character, listen→meaning, listen→pinyin, homophone, lookalike).

| Format | Trains | Needs content? | Effort | Notes |
|---|---|---|---|---|
| **Tone-pair drill** — hear two words, pick the pair of tones | Tone discrimination | No (uses word audio) | Small | Needs a TTS voice; hidden when no Mandarin voice is available |
| **Match pairs** — 3×2 grid linking character / pinyin / meaning | Associations | No | Small–medium | Rewards a clean sweep; wrong pair costs a little HP |
| **Recall round** — 5 words, no choices shown first, then check | Active recall | No | Medium | High reward, no HP loss for misses |
| **Fill the blank** — a sentence with one missing known word | Words in context | **Yes (sentences)** | Medium | Sentence must use only known/near-known words |
| **Sentence building** — order 3–5 word tiles | Word order | **Yes (sentences)** | Medium | Multiple valid orders must be handled in data |
| **Dictation** — hear a word/phrase, pick/enter characters | Listening to writing | No (words) / yes (phrases) | Medium | |
| **Radical / component match** | Character structure | **Yes (radical data)** | Large | Postpone |

Principles: a new format appears first as a **rare, optional bonus fight** so players meet it with low stakes; it must have its own rules for what happens on a miss; and it must be reachable by keyboard and screen reader like the existing choices.

---

## 6. Boss battles

**Cadence.** A boss at the end of every 5th floor (5, 10, 15 …), replacing the elite fourth enemy on that floor. Between bosses the elite stays.

**Design rules.** A boss fight is a *sequence of challenges*, not a bigger HP bar. It should feel different, be learnable, and be fair: no new rules appear mid-fight without being introduced on the boss intro card.

| Boss idea | Mechanic | Trains |
|---|---|---|
| **Shield Golem** | A shield of N segments; it only breaks on correct answers of one kind (e.g. three tone questions in a row), wrong answers do not repair it | Tones |
| **Echo Wraith** | Phase 2 repeats the question kind you most recently got wrong | Weak spots |
| **Scribe of Many Faces** | Questions are all from one theme (numbers, family, nature) *(needs a `theme` tag per word)* | Topic mastery |
| **The Sentence Serpent** | Three phases: normal questions → fill-the-blank → sentence building *(needs sentences)* | Context and grammar |

**Structure.** Intro card (name, rule, how it can be beaten) → phases with a phase indicator in the header → special defeat animation → rewards: a unique item, a badge, a new arena palette for the next 5 floors.

**Art.** Each boss needs one 16×16 sprite with an idle frame pair at the existing scale; use the pipeline in `public/assets/README.md`. Until art exists the elite sprite can be recoloured as a placeholder (explicitly labelled as placeholder in the changelog).

---

## 7. Data, save and code impact

* **Save:** add small counters (`stats.runs`, `stats.correct`, `stats.best streak`), `lastPlayed`, `badges[]`. Bump the save version with a migration; `save.ts` sanitises unknown fields (see how `dupGold` was dropped safely).
* **Settings:** new keys `sfx` and `haptics` in `hanzi-hunters-settings-v1`, sanitised like the existing ones.
* **Gear:** a derived `rarity` (no JSON change) from total bonus; optional explicit rarity later.
* **Questions:** every new format is a new `kind` in `questions.ts` with its own weights, difficulty and safety checks (e.g. homophone safety, no answer leaks), plus unit tests.
* **Content:** new sentence/theme data lives in its own JSON files with `validate.ts` rules and the same native-review flag as words.
* **Phaser vs HTML:** the scene keeps sprites and animations; all text and cards are HTML overlays (crisp, accessible).

---

## 8. Balance and measurement

* Extend `tools/simulate.ts` to model bosses and the new rewards; keep `tests/balance.test.ts` guardrails (run length, gold curve).
* Add **local-only** stats (no network): accuracy by question kind, words per run, runs per session. They make tuning evidence-based and can appear in a "Progress" screen. Nothing leaves the device.
* Playtest checklist per phase: five testers new to Mandarin, 15-minute sessions; ask "what did you learn?" and "what made you stop?".

---

## 9. Roadmap (each phase is a separate PR)

| Phase | Content | Acceptance |
|---|---|---|
| **1. Feel** | `audio.ts` + settings, haptics, kill/level-up/loot moments, HP-refill animation, floor path, floor-clear + defeat summaries | Layout check still passes; reduced-motion respected; sound off by default only if autoplay policy requires first tap |
| **2. Learning visibility** | Words-known counter, mastery ceremony, daily warm-up, days-played tally, badges, save v3 | Old saves load; unit tests for migration and warm-up selection |
| **3. Bosses (existing formats)** | Boss encounters, intro card, phases, Shield Golem + Echo Wraith, placeholder art | Simulator shows boss floors are beatable at 70–80 % accuracy |
| **4. New formats without content** | Tone pairs, match pairs, recall round | Tests per format, accessibility check |
| **5. Content-dependent** | Fill-the-blank, sentence building, Sentence Serpent, theme boss | Native-speaker review of all sentences before release |

---

## 10. Risks and open questions

* **Over-gamification:** more reward can crowd out the learning. Mitigation: principle 1, and review actual accuracy stats.
* **Sound policy:** browsers block audio before the first tap; the first tap unlocks it. Mute must be one tap away.
* **Vibration support:** Android only; do not rely on it for meaning.
* **Art workload:** bosses and rarity effects need new pixel art; keep the set small.
* **Content risk:** all sentences, themes and explanations need native-speaker review (same flag as existing content).
* **Open:** boss cadence (every 5 floors?), whether the daily warm-up should give gold, whether loot rarity should affect drop odds.

---

## 11. Mockups

`docs/design-references/game-feel/` holds mockups rendered from the **real game UI**: the running game with its real CSS, fonts, sprites and panels, plus the proposed new elements injected on top. They are pictures of a proposal, not screenshots of working features. Orange numbered pins match the notes under each phone.

| Sheet | Contents |
|---|---|
| `sheet-1-feedback-moments.png` | 1 Kill celebration · 2 Level-up moment · 3 Loot reveal · 4 Floor path + words-known |
| `sheet-2-floors-bosses-formats.png` | 5 Floor-clear summary · 6 Boss intro card · 7 Boss fight with tone shield · 8 Sentence building |
| `sheet-3-formats-and-learning.png` | 9 Match pairs · 10 Camp with daily warm-up and counters · 11 Mastery ceremony |

Single phone screenshots (`kill.png`, `levelup.png`, `loot.png`, `path.png`, `floorclear.png`, `bossintro.png`, `bossfight.png`, `sentence.png`, `match.png`, `camp.png`, `mastery.png`) are 411×740 and use a sample save (floor 5, level 5). The boss sprite is a recoloured placeholder of the existing imp; real boss art is part of phase 3.
