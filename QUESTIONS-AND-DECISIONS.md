# Decisions and open questions

What is settled, and why, so it isn't re-argued; and what is still open for the owner. How things work now is in the topic docs
(map in `README.md`); the history of each change is in `CHANGELOG.md`. Add a row when the owner decides something that a future
agent might otherwise undo, and move an open question up to the decisions when it is answered.

## Decisions

| Topic | Decision |
|---|---|
| Audience and platform | **Complete beginners, on a phone, in short sessions.** A mobile-first browser game (PWA); desktop works but is not the target. 360 CSS px is the narrowest supported width (2026-11-01); nothing is styled for narrower screens. |
| Progress rule | **Which answers move a word on is decided per question kind** (`PROMOTING_KINDS`, `src/game/learning.ts`): any question that shows or asks for the written character counts (incl. character→pinyin and audio→character); meaning→pinyin, audio→meaning, audio→pinyin and particle sentences do not (2026-11-03). Evidence is kept per question kind; there are no "dimensions" (2026-11-04), so strengths and weaknesses per direction can be read later. |
| Script | **Simplified Chinese only.** Traditional forms are kept in imported source records but never taught. |
| Run structure | **Roguelite expeditions** (2026-11-01): 5 floors of 4 fights, each floor ending in a boss, a final boss, 5 depths. Gold is banked when a run ends and buys permanent upgrades; level and gear are lost; word progress always stays. |
| Health | **Hearts, not HP** (2026-11-01): a wrong answer costs exactly one heart, a right answer never does; enemies have no attack. Reward knowing, never speed or guessing. |
| Removed features | **Daily warm-up and milestone badges removed** (2026-11-01): they cluttered camp and added noise. Their save fields stay so old saves round-trip. |
| Saves | **Restarted with expeditions** (2026-11-01): earlier keys are deleted and never read. Since then every shape change needs a migration or a safe fallback (`AGENTS.md` rule 9). No backend; progress stays in the browser, with export/import backups. |
| Teaching order | **A curriculum file separate from the vocabulary** (`curricula.json`). The default course is `beginner-mandarin-100` (100 entries, 20 lessons), an AI-assisted draft; HSK level is a filter, not a teaching order. |
| Pinyin | **Dictionary pinyin** (CC-CEDICT conventions, neutral tones unmarked) as the one answer; other accepted readings are `variants`, tone changes are `speech`. HSK's printed tone-changed forms are not copied into `pinyin`. |
| One beginner meaning group per entry | **An entry initially teaches a small, useful, beginner-friendly meaning group** (2026-11-03, replacing “one basic meaning” the same day): near-synonyms or a deliberately chosen combination of common beginner uses (下 “below / down”, 想 “think / want to”); substantially different uses (下车 “get off”, 想 “miss someone”) are deferred and introduced later in context. Editorial guidance, not a numerical rule; source order, HSK membership and identical characters do not decide it. No second playable entry with the same hanzi and pinyin. Deferred uses are intended to unlock from level 4 (Retained) with their own progress; not to be built without the owner (`docs/SENSES.md`). |
| Spaced review | **Levels 0–5 with time-based reviews** (`docs/SCHEDULING.md`). Only meaning and written-form answers move a word; the numbers are product defaults, not proven intervals. |
| Content honesty | **Every piece of Mandarin carries its source and review status.** `ai-draft` / `imported` until a person reviews it; nothing AI-written or imported is ever labelled human-reviewed. |
| Imported sources | **Compared and adopted one decision at a time, never merged in** (`docs/SOURCES.md`). Matching evidence, AI-assisted assessments and reviewer decisions are kept apart; an assessment never changes content. |
| ACCC deck | **Recordings included in the repository by the owner's decision (2026-11-02)**, although the deck states no licence; no rights-holder permission is documented. |
| Anki-xiehanzi deck | **Option b (2026-11-02):** records, CC-CEDICT definitions and example sentences are published with the review screen; the audio (origin unknown per file) is local-only, never committed, deployed or selectable. |
| Audio | **Text-to-speech for words, procedural sound effects** (no licensed samples). Recorded audio only through the source layer, per entry, with what a person heard. |
| Art | **Small, original, code-generated pixel art** (`tools/make_pixel_assets.py`); no third-party or AI-generated imagery. Mockups are targets, not assets. |
| Dependencies | **No new runtime dependency without a written reason** (`AGENTS.md` rule 7). Development-only tools (types, checks) are fine with a reason. |
| Docs | **The code wins over the docs; each topic has one home doc** (2026-11-03); rules a script can check are enforced by tests (`tests/conventions.test.ts`, `generated.test.ts`, `docs.test.ts`). |

## Open questions

| Question | Context |
|---|---|
| Should very frequent beginner uses (要 "will", 会 "will", 在 + verb, 一下, sentence-final 了) wait for Retained, get a lower gate, or a lesson of their own? | `docs/SENSES.md` §3 |
| Which existing two-use labels are deliberate beginner groups (天, 月, 日, 菜, 家, 口, 木, 请, 了) and which need a decision (叫 “call” in the label but called another use in the note; 点 “point”; 块 “piece”; 生)? 想 is already an endorsed group. | `docs/SENSES.md` §5; not required to narrow; changes answer buttons, not saved progress |
| Reassess the assessments outdated by the 2026-11-03 fingerprint change (ACCC 66 pairs; Anki-xiehanzi 57 pairs, 57 records, 171 examples)? | `docs/SOURCES.md` §5a; they are history until a real reassessment |
| Adopt the draft first expansion (25 entries, 6 lessons) from the Anki-xiehanzi proposal? | `docs/proposals/xiehanzi-hsk1.md` |
| Use "general counting word" for 个, and the same term in other labels and notes (两, the 书 note)? | Both source assessments propose it with this caveat |
| Who reviews the Mandarin (entries, notes, examples, course order, assessments), and when? | Everything is an AI-assisted draft until then |
| Support erhua (哪儿, 这儿, 一点儿 …) in pinyin questions? | Excluded from the expansion for now |
| Self-host the fonts so the game works fully offline? | `ASSET_CREDITS.md`; needed before any offline claim |
| Show the days-played tally anywhere? | Tracked in the save, not displayed |
| Verify install and offline behaviour on real iOS and Android devices. | `DEVELOPMENT_BRIEF.md` §6 |
