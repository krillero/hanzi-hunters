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
2. docs/content-inventory.json - what exists right now (30 words, 3 explanations) and the validator limits.
3. src/content/words.json and src/content/explanations.json - the files you will edit; copy the style of
   the existing entries (他, 她 and 好 are complete examples of explanations).

TASK (default): Add 20 new beginner words and write explanations for at least 12 words (new or existing).
  Words: single simplified characters that a complete beginner can learn, preferably simple pictographs or
  very common characters, each with ONE tone mark (no neutral tone, no multi-character words). Good
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
- Keep new words appended after the existing ones (the order is the teaching order) unless a word clearly
  belongs earlier; do not reorder or rewrite existing entries unless fixing a verified error (say so in your report).
- Use words.json "group" values that already exist where they fit (people, nature, number, size, body,
  place, grammar); create a new lowercase group only when none fits (e.g. "animals").
- Use "alt" for valid tone-change readings (not an issue for most words) and "confusable" for words whose
  meanings are too close to be fair wrong answers (list both directions).
- Explanations: short, beginner-friendly, phone-sized. 2-4 sections each. Prefer vocabulary characters in
  examples; a radical or part outside the vocabulary only warns, which is fine. Plain text only.
- Every explanation key must be a word in words.json, and "related" must only list words in words.json.

WORKFLOW
1. git checkout -b content/<short-topic>   (never commit to main)
2. Edit only src/content/words.json and src/content/explanations.json.
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

* The agent must not touch code. If it needs something the format cannot express (neutral tones, multi-syllable
  words, images/audio, new question types), the guide lists these as unsupported: it should say so in its report
  rather than hack around it.
* All new content should be **reviewed by a Mandarin speaker before release**; the agent's "UNSURE" list is the
  starting point for that review.
* Re-run `npm run inventory` any time; the JSON is generated from the source files, so it is always current.
