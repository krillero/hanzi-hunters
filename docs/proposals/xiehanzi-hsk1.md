# Anki-xiehanzi HSK 1: comparison and beginner-expansion proposal (draft)

Status: **draft proposal, AI-assisted, not reviewed by a person.** Nothing here is applied: no game wording changed, no
recording selected, no entry added, no lesson activated. Every proposal is reviewable on the review screen
(`<site>/review/`, source `xiehanzi-new-hsk-2025-v24`) and in `src/content/assessments/xiehanzi-new-hsk-2025-v24.json`.
The full per-record table is generated: [`xiehanzi-hsk1-records.md`](xiehanzi-hsk1-records.md)
(`npm run source:assess -- report --source xiehanzi-new-hsk-2025-v24`).

## 1. The package (verified)

| | |
|---|---|
| Download | https://github.com/krmanik/Anki-xiehanzi/releases/download/v2.4/Anki-xiehanzi-New-HSK-2025.apkg (release v2.4) |
| Retrieved | 2026-11-02, 57,493,136 bytes |
| sha256 | `4b0bea5d05c6e3ff970b4408f6c0422652c651dec3ad261b296ad782fbb1a37a` |
| Collection | `collection.anki2` only (a full collection, not a stub): 10,900 notes, 10,900 cards, one note type with the 13 expected fields |
| Import scope | notes with a card in deck `Anki xiehanzi::New HSK (2025)::HSK 1`: **321 notes** (card membership; no note has cards in two decks) |
| In scope | 180 with a `SimpleMeaning`, 141 without; 301 with examples (896 sentences); 321 audio references, all resolve, all non-empty, all decode (ffprobe: MP3, 0.39–1.80 s, median 1.18 s) |
| `HskLevel` | `HSK 1` for 301 notes, **empty for 20** (see §6); no note outside the deck says `HSK 1`. The level field alone would give 301, not 321. |
| Not imported | the other 10,579 notes and their media; card templates and their scripts (never read or run); fonts, images and scripts in the media map |
| Source id | `xiehanzi-new-hsk-2025-v24` (record key = note GUID, e.g. `xiehanzi-new-hsk-2025-v24:0hlk6me19ltail` for 会) |

The 321 are this package's beginner selection, not an independently verified official HSK count.

**Rights (owner decision 2026-11-02, option b):** records, definitions and example sentences are published with the review
screen; the 321 audio files are **not** committed or deployed (`sources.json` → `"media": "local-only"`, ignored by git) and
cannot be selected for gameplay (the validator refuses it). Per component: definitions CC-CEDICT (CC BY-SA 4.0); word lists
partly “free for non-commercial use” (hskhsk.com); audio credited to audio-cmn (CC BY-SA), the Shtooka/Caen collection and
gTTS text-to-speech without per-file attribution, so each clip's origin is **unknown**; example sentences have **no stated
source or licence**. See `src/content/sources.json` and `ASSET_CREDITS.md`.

## 2. Overlap with the game (127 entries; default course: 100 entries in 20 lessons)

| Unit | Count |
|---|---|
| Source records with at least one candidate game entry | 107 of 321 |
| Candidate pairs (record × entry) | 108 (看 kàn is compared with 看-look and 看-guard) |
| Unique game entries involved | 108 |
| Game entries with no counterpart in this subset | 19 (火 山 木 子 中 手 目 田 石 门 马 鸟 鱼 米 父 母 生 咖啡 累) |
| Text comparison of pairs | 26 exact, 6 formatting-only, 56 different wording, 20 missing (no source short meaning); readings differ in 5 pairs |

Pair assessments (meaning): 106 likely equivalent, 1 different (看 kàn vs 看-guard kān), 1 uncertain (了). Wording: 105 keep
the game wording (each with a reason), **1 change proposed** (个 → “general counting word”, the same terminology proposal and
consistency caveat as for the ACCC record), 1 not applicable, 1 not assessed (了). Typical reasons to keep the game's label:
the source's short meaning is narrower than its own definitions (名字 “given name”, 读 “read aloud”, 菜 “vegetable”), merges
uses that must stay apart (要 “want; be going to; ask for; demand”, 一 with six uses), or is a translation crutch (的 “of”).

## 3. Dispositions of all 321 records

| Disposition | Records |
|---|---|
| Candidate match to an existing entry | 106 |
| Uncertain or incomplete | 1 (了: declared liǎo, short meaning describes modal le, game teaches le) |
| New beginner vocabulary candidate | 186 (25 proposed for the first expansion, 161 later) |
| Excluded from the proposed expansion | 28: 20 conversion artefacts (§6), 7 erhua words (哪儿 这儿 那儿 有点儿 一点儿 好玩儿 面条儿: the game's pinyin questions do not support erhua yet, and the source lost the final r), 们 (a suffix, taught through 我们 / 你们 / 他们) |
| Additional sense (main sense differs from an existing entry) | 0 as a disposition: each xiehanzi note covers a whole word, so other senses are recorded *inside* matched records |

**Additional senses recorded on matched records (16):** 的 了 想 要 点 好 个 多 一 上 下 少 在 叫 口 那, e.g. 要 “be going to”
and “ask for”, 好 “easy to” and completion after a verb, 下 “get off” and “next”, 叫 “tell someone to”, 多 “how (多大)”, 口 as
measure word for family members. They are marked “not taught (keep separate)”. The engine refuses two entries with the same
hanzi **and** pinyin, so 要 “will” or 会 “meeting” cannot become separate playable entries today; they stay notes or wait for an
engine change.

**Short labels for new candidates:** 186 proposed; 32 are the source's own `SimpleMeaning` (validated to be its exact text),
154 are editorial (written from the full definitions, or correcting the source: 岁 “year (of crop harvests)” → “years old”,
还 “even” → “still / also”, 问题 “problem” → “question / problem”, 太 “very” → “too (much)”, 生病 “ill” → “fall ill”).
Multiple meanings needing separation are flagged on 47 records: the 16 matched records above and 31 new candidates (会, 开, 还, 给, 号, 本, 对, 只, 分, 坐, 喂, 东西, 便宜, 好吃 …).

## 4. Focus comparison

| Word | Game | xiehanzi short meaning | xiehanzi assessment | ACCC records (assessment) |
|---|---|---|---|---|
| 下 | “below / down” (not in the course) | down; below | likely equivalent, keep game wording; “get off” and “next” not taught. Example 他们下了车 → other sense | next (different), get off (different), have room for (different), place an order (different) |
| 上 | “above / up” (not in the course) | up; above | likely equivalent, keep; verb uses (上车, 上课) and “previous” not taught. 他上了飞机 → other sense; 书在桌子上 → suitable | contact complement (different), go up to (different) |
| 好 | “good” | good | exact text, keep; “easy to” and completion not taught. 给我听好了 → other sense | fine/well (likely eq.), OK (different), easy to (different), completion (different) |
| 要 | “want / need” | want; be going to; ask for; demand | likely equivalent for “want”; the four-part label is not a fair single answer. 他要睡觉了 → other sense (future); 你也要去吗 → uncertain | want to (likely eq.), want/need (likely eq.), take/require (different), will (different) |
| 叫 | “be called / call” | to call; to be named | likely equivalent (naming); telling/ordering not taught. 我叫他来的 → other sense | be called (likely eq.), call for attention (uncertain), tell (different), bark (different) |
| 个 | “general classifier” | individual; [general measure word] | likely equivalent for the measure word; “individual” is a bound-form sense. Wording: “general counting word” proposed (terminology; adopt only with consistent terms) | general measure word (likely eq.; same proposal) |
| 会 | — (no entry) | to know how to; can; meeting | new candidate, **first expansion**, label “can (know how to)”; future and “meeting” stay out. 你会做什么 → suitable; 你会在哪里 (future), 怎么会是你 (possibility) → other sense | separate records: can (B1L05), will (B1L11), meet (B6L03): further evidence that the senses are separate |
| 开 | — (no entry) | to switch on; open | new candidate, **later**: several uses (open, switch on, drive). 这车容易开 shows driving; no example assessed or linked | separate records: drive, open (a business), turn on, write (a ticket) |

Agreement between the two sources is shown as evidence only; neither source is treated as correct because the other agrees.

## 5. Examples

896 sentences were extracted (Chinese, pinyin, translation; stable ids `<source>:sentence:<guid>-<n>`, linked to nothing).
396 example-to-target relationships were assessed: the examples of the 106 matched records (target: the game entry; 看's three
also against 看-guard) and of the 25 first-expansion records (target: the proposed entry): 393 distinct sentences. The other 503 sentences (examples of
later candidates, of 了, and of excluded records) are **not assessed**.

| Verdict | Count |
|---|---|
| Suitable | 173 |
| Suitable after editing | 79 (58 pinyin only; 21 Chinese and/or translation) |
| Shows another sense | 43 |
| Not beginner-appropriate | 89 |
| Uncertain | 12 |

Findings: the example pinyin is a character-by-character conversion: neutral tones are lost (xǐ huān, mā mā, wǎn shàng,
shí hòu, dōng xī), erhua becomes “nǎ ér”, and words are not joined. Corrections are stored as editorial adaptations in the
game's convention (`Wǒ yǒu ge gēge.`); the original stays in the source item. Several translations are wrong (有你的电话 “I
received your call” → “There's a call for you”; 你明天上午吃什么 “breakfast” → “morning”; 不要学习了 → “Stop studying”). Some
sentences are slang (他是我的菜, “my type”) or show a character inside another word (日元, 一起, 孙子女). Every assessment lists
the other vocabulary in the sentence and the part the game does not teach yet (prerequisites); none is an exercise.

## 6. Source-data problems

- **20 notes are not HSK 1 vocabulary**: faulty traditional→simplified conversions (著→着, 糊→煳, 猛→勐, 脊→嵴, 溜→熘: 着名,
  模煳, 显着, 勐, 噼, 煳涂, …), with an empty `HskLevel`, no part of speech and (except 噼) no examples. Excluded.
- **Declared readings** (`Pinyin`) that are another reading of the character: 了 liǎo, 吧 bā, 写 xiè, 雨 yù, 六 lù, 哪 na,
  好吃 hào chī, 喂 wèi (for the phone greeting wéi); capitalised readings from proper-noun entries: 新 Xīn, 冷 Lěng, 三 Sān,
  大学 Dà xué, 苹果 Píng guǒ, 星期天 / 星期日; erhua readings without the r (7). The definitions usually contain the right reading;
  matching reports it as evidence and never replaces the declared reading.
- **Traditional field** often shows a variant character (你 〔妳〕, 是 〔昰〕, 了 〔瞭〕, 和 〔龢〕, 吃 〔喫〕). Kept verbatim; unused
  (the game is simplified only).
- **Short meanings** that are narrower than, or differ from, the source's own definitions: 岁, 名字, 读, 时候 “[duration of]
  time”, 菜, 还 “even”, 太 “very”; 吗's “[makes a yes; no question]” has a separator error.
- **Examples:** per-character pinyin (§5), some wrong translations, duplicates with ASCII punctuation, one missing final
  punctuation.

## 7. Audio

All 321 clips resolve, are non-empty and decode (ffprobe). Their origin is **unknown** per file (audio-cmn, Shtooka/Caen or
text-to-speech), no clip was listened to, and pronunciation is **not verified**. Declared readings are wrong for at least the
eight words in §6, so those clips must not be used for listening questions. Clips are previewable only after a local import
(`npm run source:import -- --source xiehanzi-new-hsk-2025-v24 --file <apkg>`); they are not published and cannot be selected.
Display, listening-to-meaning and listening-to-pinyin eligibility stay separate and would each need a person's check.

## 8. Proposed first expansion (25 entries, 6 short lessons)

Selected from the assessed new candidates, not in package or frequency order. Criteria: high everyday use; builds on words the
default course already teaches; a short label that is fair as a quiz answer (no two entries competing for “can”, “morning” or
“they”); no erhua; no hanzi + pinyin clash with an existing entry. Drafts (stable ids = the hanzi; group, pinyin in the game's
convention, note) are in the record assessments and prefill the review screen's new-entry form. Lessons continue after
`b100-lesson-20`; all are drafts, not in `curricula.json`.

| Draft lesson | Entries (draft label) | Builds on | Example support (suitable + after editing, of 3) |
|---|---|---|---|
| 21 We, you and they | 我们 we / us · 你们 you (plural) · 他们 they / them · 大家 everyone | lesson 2 (我 你 他) | 2 · 3 · 2 · 3 |
| 22 Years and age | 今年 this year · 明年 next year · 去年 last year · 岁 years old | 15 (今天 明天 昨天), 16 (年) | 0 · 3 · 2 · 2 |
| 23 Parts of the day | 上午 morning (before noon) · 中午 noon · 下午 afternoon · 晚上 evening | 16 (点), 15 | 3 · 1 · 3 · 3 |
| 24 Meals of the day | 早饭 breakfast · 午饭 lunch · 晚饭 dinner · 水果 fruit · 牛奶 milk | 12–13 (吃 喝 米饭), 23 | 2 · 3 · 3 · 2 · 3 |
| 25 Work and skills | 会 can (know how to) · 做 do / make · 工作 work / job · 住 live (somewhere) | 14 (在 学校), 18 | 1 · 2 · 3 · 3 |
| 26 Buying and selling | 卖 sell · 贵 expensive · 便宜 cheap · 元 yuan (written) | 20 (买 钱 多少 块) | 2 · 0 · 3 · 0 |

Caveats a reviewer should check: 今年, 贵 and 元 have **no** usable source example (the game would need its own); 元 must be
taught against 块 (spoken) so the two labels do not compete; 会 is taught for ability only (its notes name the future and
“meeting” uses); 他们 vs a later 她们 needs distinct labels. Deliberately left for later: 能 / 可以 (would compete with 会 for
“can”), 早上 (competes with 上午), 她们, 开 and other multi-sense words, erhua words, and the 们 suffix alone.

## 9. Adopting any of this

1. Review a record on the screen: its proposal, examples and pair assessments (all labelled AI-assisted, unreviewed).
2. Decide: link / keep separate; for a new word, “Save as new-entry candidate” (prefilled with the draft) → export the
   changeset → `npm run source:apply`.
3. `npm run source:promote -- <record key> --group <group>` makes a playable entry (still in no course).
4. A person adds the entry to a lesson in `curricula.json` (`docs/CURRICULUM.md`).

Examples need a separate content change (editorial adaptation with provenance in `explanations.json`); an exercise additionally
needs a target, answer rules, distractors, feedback and prerequisites.

## 10. Limitations

- All assessments are AI-assisted and unreviewed. The CC-CEDICT reference is the same dictionary the deck's definitions come
  from, so it is not independent evidence; no other reference was consulted, and unresolved cases are marked uncertain.
- Example `contains` / `prerequisites` were prefilled by longest-match segmentation against the game and HSK 1 vocabulary and
  checked by the assessor; segmentation errors are possible (e.g. compounds outside both lists).
- No clip was listened to; no human or AI judged audio quality.
- 503 extracted sentences are not assessed (§5).
