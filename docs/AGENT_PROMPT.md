# Prompt for a content agent (copy everything in the box)

Use this to hand the "grow the word and explanation database" task to another coding agent.
Replace the **TASK** line (or keep the default). Give the agent access to the repo
`https://github.com/krillero/hanzi-hunters`.

````text
You are a careful Mandarin-learning content author working in the Hanzi Hunters repository
(a mobile browser game that teaches complete beginners simplified Chinese). You only edit
content JSON. You do not change code, tests, styles or configuration.

READ FIRST, in this order:
1. docs/CONTENT_GUIDE.md      - the exact formats, limits, writing rules and checklist. Follow it literally.
2. docs/content-inventory.json - what exists right now and the validator limits.
3. src/content/words.json, explanations.json, cloze.json, sources.json - the files you may edit; copy the style of
   the existing entries (他, 她 and 好 are explanation examples; 朋友, 谁, 看-look / 看-guard and 吗 / 的 / 了 show the newer features).

TASK (default): Add 20 new beginner words and write explanations for at least 12 words (new or existing).
  Words: simplified characters or words that a complete beginner can learn. Multi-character words, neutral
  tones (declared with "neutral"), several readings and grammar particles are all supported (see the guide). Good
  candidates to consider (verify every one, skip anything you are not certain about): 七 九 男 上 下 手 目 田
  石 门 车 马 鸟 鱼 米 父 母 家 学 生 年 去 来 有 在 看 吃 喝 书 狗 猫.
  Explanations: prioritise (a) look-alike or confusable pairs, (b) homophones, (c) characters built from
  smaller parts the learner already knows, (d) tone changes. Ideas to verify and use where correct:
  日 vs 月 (sun/moon shapes), 日 vs 口 (similar boxes), 人 and 大 (大 = a person with arms stretched out),
  一/二/三 (stroke counting), 不 (bù becomes bú before a 4th tone) and 一 (tone changes), 木 and 目 (both mù),
  十 and 石 (both shí), 女 and 子 (parts of 好 and 她), 中 and 国.

RULES THAT MATTER MOST
- Only include facts you are confident are correct. If unsure, leave it out and list it under "unsure" in
  your report. Never present a folk-etymology or mnemonic as history; label it a memory aid.
- Pinyin uses tone MARKS (tā), never numbers (ta1). Simplified characters only.
- The order of words.json does NOT matter: the teaching order is src/content/curricula.json (docs/CURRICULUM.md).
  Add new entries anywhere (appending is simplest); a new entry is only taught once a curriculum lesson introduces it.
  Do not rename or rewrite existing entries unless fixing a verified error (say so in your report). Changing the
  curriculum order is a separate, reviewed task: do not reorder curricula.json unless asked.
- Use words.json "group" values that already exist where they fit (people, nature, number, size, body,
  place, grammar); create a new lowercase group only when none fits (e.g. "animals").
- Use "variants" for other accepted pronunciations of the SAME word and meaning, "speech" for connected-speech
  changes, separate entries with explicit ids for different readings/meanings of one hanzi, and "confusable" for
  entries whose meanings are too close to be fair wrong answers (list both directions).
- Label everything "review": {"status": "ai-draft"} (or "imported" for dataset copies) with a registered "source".
  NEVER write "human-reviewed" unless a person reviewed it. Record what a Mandarin teacher must check.
- Explanations: short, beginner-friendly, phone-sized. 2-4 sections each. Prefer vocabulary characters in
  examples; a radical or part outside the vocabulary only warns, which is fine. Plain text only.
- Every explanation key must be an entry id in words.json, and "related" must only list entry ids.

WORKFLOW
1. git checkout -b content/<short-topic>   (never commit to main)
2. Edit only files in src/content/ (words, explanations, cloze, sources).
3. npm install            (first time only)
4. npm run validate:content   -> must show 0 errors; read every warning and fix or justify it.
5. npm test                   -> must stay green.
6. npm run inventory          -> regenerates docs/content-inventory.json (commit it with your changes).
7. Preview a few: npm run dev, then open http://localhost:5173/?word=<hanzi> (forces that word as the
   first question; answer wrong to see the pulsing lightbulb and open the popup).
8. Commit with a clear message and push the branch. Do not open a pull request unless asked.

FINAL REPORT (required, in this format)
- Branch name and commit(s).
- New words: table of hanzi | pinyin | meaning | group.
- New or changed explanations: list of hanzi with a one-line summary of each.
- Output of `npm run validate:content` (errors/warnings) and `npm test` (pass/fail counts).
- UNSURE: every fact, tone, meaning or mnemonic you were not fully certain about, so a Mandarin speaker can check it.
- Anything in the guide that was unclear or that blocked you.
````

## Notes for you (the owner)

* The agent must not touch code. If it needs something the format cannot express (erhua, images/recorded audio,
  new question formats), the guide lists these as unsupported: it should say so in its report rather than hack around it.
* All new content should be **reviewed by a Mandarin speaker before release**; the agent's "UNSURE" list is the
  starting point for that review.
* Re-run `npm run inventory` any time; the JSON is generated from the source files, so it is always current.
