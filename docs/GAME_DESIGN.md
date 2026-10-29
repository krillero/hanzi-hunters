# Game design: the roguelite loop (implemented in 0.2)

## Loop
1. A **run** starts at floor 1, level 1, no gear, 1 potion (plus any upgrades).
2. Each floor has **4 enemies; the 4th is an elite** (×1.6 HP, ×1.25 damage, ×2 rewards, better drops). Then you descend.
3. Per floor (compounding): enemy HP +16 %, damage +11 %, XP/gold +8 %.
4. Dying ends the run. **All run gold is banked.** Level, gear and potions are lost. **Upgrades and word mastery stay.**
5. At **camp** you spend banked gold on the upgrade tree, then start a new run.

## Word mastery (per word, saved)
| Level | Question | Card shows before you answer |
|---|---|---|
| new | "New word! What does X mean?" (first exposure, no mastery credit) | hanzi, pinyin, meaning |
| 0 | hanzi → meaning | hanzi + pinyin |
| 1 | hanzi → pinyin (3 tone variants as distractors) | hanzi only |
| 2 | hanzi → meaning | hanzi only |
| 3, 4 | meaning → hanzi, or listen → hanzi when the device has a Mandarin voice | meaning / nothing |

- 2 correct answers in a row promote a word; a miss drops it one level. Level 4 = mastered (asked rarely).
- Harder levels deal bonus damage (+0/10/25/40 %).
- The pool of words starts at 6 and grows by one per word that reaches level 1; no new word is introduced while 4 words are still at level 0.
- Distractors never include: overlapping meanings (日 "sun / day" vs 天 "sky / day"), listed confusables (中/国), homophones in listening (他/她), or tone-sandhi readings (不 bú, 一 yí/yì).

## Upgrade tree (permanent; 4 branches × 5 tiers, bought in order)
Cost = 25 × tier × (tier+1) / 2 → **25, 75, 150, 250, 375** per branch (875 each, 3 500 total).
- **Blade** — attack, combo damage (3rd correct in a row), execute bonus.
- **Aegis** — max HP, starting potions, armor, heal after victories, stronger potions.
- **Lore** — hints (remove a wrong option, per fight), XP, second chance (one un-countered miss per fight), mastery damage.
- **Fortune** — gold, loot chance, start-of-run gear (Copper Blade, Mossy Vest).
No upgrade answers questions; a test enforces that every effect is power or convenience.

## Balance (tools/simulate.ts, tests/balance.test.ts)
Bot play at 60/75/90 % accuracy: first death on floor 1–3 with enough gold for the first node within 2 runs; a full tree takes ≥ 8 runs; with a full tree the average run still ends around floors 9–12. Tune in `src/game/rules.ts` (scaling) and `src/game/upgrades.ts` (COST_BASE, effects). The bot is a model, not real players — expect to retune after human playtests.

## Save format v2 (`hanzi-hunters-save-v2`)
`{ version, meta{gold,upgrades,bestFloor,runs}, mastery{hanzi:{lv,ok}}, run|null, lastRun|null }`. Every field is validated on load (`src/game/save.ts`); a mid-run reload resumes the run. The v1 prototype save is migrated once: learned words → level 1, gold → banked, floor → best floor. The v1 key is left untouched.
