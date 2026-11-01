from pathlib import Path
import json,subprocess,html,shutil,hashlib,zipfile
R=Path('/workspace/scratch/903ba6f88450');repo=R/'hanzi-beginner100';out=R/'beginner100-package';c=repo/'src/content';docs=out/'docs';docs.mkdir(exist_ok=True)
base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
old=json.loads(subprocess.check_output(['git','show','HEAD:src/content/words.json'],cwd=repo));new=json.loads((c/'words.json').read_text());by={w.get('id',w['hanzi']):w for w in new};state=json.loads((R/'package-state.json').read_text());sel=state['selected'];selected=set(sel);cur=json.loads((c/'curricula.json').read_text())['curricula'][-1]
for name in ['words.json','explanations.json','cloze.json','curricula.json','sources.json']:
 dest=out/'src/content'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(c/name,dest)
(out/'tests').mkdir(exist_ok=True);shutil.copy2(R/'validation-harness/tests/eligibility.test.ts',out/'tests/eligibility.test.ts')
# A readable report; the package stays static (no scripts, remote resources or tracking).
style='''body{font-family:system-ui,"Noto Sans CJK SC",sans-serif;line-height:1.55;color:#172b39;max-width:1200px;margin:36px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:32px;color:#12625b}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #d4dfe3;padding:9px;vertical-align:top;text-align:left}th{background:#edf5f3}.hanzi{font-size:24px;white-space:nowrap}.small{color:#53636e;font-size:14px}.notice{padding:16px;background:#fff4d9;border-left:4px solid #bc8a28}@media print{body{margin:0;max-width:none;font-size:10pt}h2{break-after:avoid}tr{break-inside:avoid}}'''
def document(title,body):return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+html.escape(title)+'</title><style>'+style+'</style><body>'+body+'</body></html>'
def esc(x):return html.escape(str(x))
body='<h1>First 100 everyday Mandarin words</h1><p>Twenty lessons of 4–6 entries. Prepared 1 November 2026 for Hanzi Hunters.</p><div class="notice">Dictionary-checked readings and selected meanings. Notes, examples, and teaching sequence are AI-assisted editorial drafts, not human-teacher-approved. Official mappings refer to the HSK syllabus published 2025-11, effective 2026-07. 98 entries map to level 1; 咖啡 and 累 map to level 2.</div>'
n=0
for u in cur['units']:
 for l in u['lessons']:
  body+='<h2>'+esc(u['title'])+'</h2><table><thead><tr><th>#</th><th>Word</th><th>Pinyin</th><th>Meaning</th><th>Teaching note</th><th>Official reference</th></tr></thead><tbody>'
  for x in l['introductions']:
   n+=1;w=by[x['entryId']];m=state['mapping'][x['entryId']]
   body+=f'<tr><td>{n}</td><td class="hanzi">{esc(w["hanzi"])}</td><td>{esc(w["pinyin"])}'+(' / '+esc(', '.join(w['variants'])) if w.get('variants') else '')+f'</td><td>{esc(w["meaning"])}</td><td>{esc(w["note"])}</td><td>Level {m["level"]}; entry {m["entry"]}; printed p. {m["printedPage"]}</td></tr>'
  body+='</tbody></table>'
body+='<p>Source: <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict">CC-CEDICT/MDBG</a>; official syllabus linked from <a href="https://www.chinesetest.cn/HSK">Chinese Testing International</a>. See SOURCE-NOTES.txt for licenses and scope.</p>'
(docs/'first-100-words.html').write_text(document('First 100 words',body))
body='<h1>Audit of all 63 original entries</h1><p>Every original stable ID is preserved. 36 remain in the first-100 curriculum; 27 are retained outside it for existing progress and later study. “Retained outside” does not mean incorrect or useless.</p><p>All original short notes have been reconsidered and rewritten. All original long explanations were replaced with concise usage notes and retained useful shape comparisons; unsupported character-history and phonetic-origin claims were removed. Each entry below shows the old and new wording.</p>'
for w in old:
 id=w.get('id',w['hanzi']);z=by[id]
 body+=f'<h2>{esc(w["hanzi"])} · {esc(z["pinyin"])}</h2><p><strong>'+('Included in first 100, position '+str(sel.index(id)+1) if id in selected else 'Retained outside first 100')+'</strong></p>'
 body+='<table><tr><th>Field</th><th>Before</th><th>After</th></tr>'
 for label,key in [('Meaning','meaning'),('Short description','note')]:body+=f'<tr><th>{label}</th><td>{esc(w[key])}</td><td>{esc(z[key])}</td></tr>'
 body+='</table><p class="small">Decision: '+('Useful early conversational vocabulary or grammar; taught in an ordered practical lesson.' if id in selected else 'Useful supporting character, later vocabulary, or a less urgent reading. Prefer complete everyday words or a simpler sense in the first 100; no saved progress is deleted.')+'</p>'
(docs/'existing-63-audit.html').write_text(document('Existing vocabulary audit',body))
# Exact sentence list for human review, separate from factual dictionary checks.
ex=json.loads((c/'explanations.json').read_text());examples={}
for x in ex.values():
 for sec in x['sections']:
  if sec['type']=='examples':
   for e in sec['items']:examples[e['zh']]=e
(docs/'examples-for-review.json').write_text(json.dumps(list(examples.values()),ensure_ascii=False,indent=2)+'\n')
shutil.move(out/'dictionary-checks.json',docs/'dictionary-checks.json')
source='''SOURCE NOTES AND RIGHTS
Prepared 2026-11-01.

1. CC-CEDICT, MDBG published download
https://www.mdbg.net/chinese/dictionary?page=cc-cedict
https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
License: Creative Commons Attribution-ShareAlike 4.0 International.
https://creativecommons.org/licenses/by-sa/4.0/
Credit: CC-CEDICT editors/contributors, hosted by MDBG, building on CEDICT by Paul Andrew Denisowski.
All 127 retained vocabulary entries were matched by written form and selected reading. Exact matching dictionary entries appear in dictionary-checks.json. English button meanings are shortened editorial selections, not exhaustive definitions. Teaching notes and examples are AI-assisted adaptations, not dictionary quotations. This package's revised vocabulary, notes, examples, and course sequence are supplied under CC BY-SA 4.0; this does not relicense unrelated game code or assets.

2. Official HSK syllabus
Official landing page: https://www.chinesetest.cn/HSK (Examination Syllabus)
PDF: https://hsk.cn-bj.ufileos.com/3.0/%E6%96%B0%E7%89%88HSK%E8%80%83%E8%AF%95%E5%A4%A7%E7%BA%B21219.pdf
Title: HSK 考试大纲 / Syllabus for the Chinese Proficiency Test.
Cover: published 2025-11; implemented 2026-07.
Publisher: Center for Language Education and Cooperation.
Used for individual factual level, headword, pronunciation and page references. The full PDF is not redistributed and is not relicensed here. Printed page numbers differ by three from PDF page indices. The level annotation for 好 is 1(2)(4): the adjective 'good' is level 1. This syllabus is distinct from the broader 2021 proficiency grading standards.

PRONUNCIATION CONVENTIONS
Mandarin dictionary tones, simplified Chinese. Neutral-tone positions are explicitly declared.
学生: CC-CEDICT xuésheng; official syllabus xuéshēng. Both accepted.
谁: shéi and shuí accepted; the syllabus explicitly lists both.
这/那/哪: colloquial zhèi/nèi/něi accepted in their relevant contexts.
一: yāo is included as an accepted digit-reading variant; yí/yì are contextual speech changes, not dictionary senses.
Example pinyin uses dictionary tones, with a note explaining yī -> yí in 一个. Examples are not audio-assessed; example speaker buttons are disabled pending voice verification.

VERIFICATION LIMITS
Dictionary checking establishes attested readings and senses, not that every note or example has been professionally proofread. All review fields remain ai-draft. Course provisional remains true. The 20 unique examples are original editorial drafts, not copied from Tatoeba or claimed to be teacher-reviewed. Existing broad grammatical glosses for 是, 不, 子, 年 and others were tightened. Unsupported historical and phonetic-component stories were removed.
'''
source+='\nDownloaded source SHA256 hashes:\n'
for p in [R/'cedict.gz',R/'hsk-syllabus.pdf']:source+=p.name+' '+hashlib.sha256(p.read_bytes()).hexdigest()+'\n'
(docs/'SOURCE-NOTES.txt').write_text(source)
readme=f'''HANZI HUNTERS: FIRST 100 WORDS CONTENT PACKAGE
Prepared: 2026-11-01
Base main commit: {base}

CONTENTS
- src/content/: five complete replacement JSON files, ready for the existing engine.
- tests/eligibility.test.ts: one test-fixture-only correction. The old test assumes the shipped ma-student question has no prerequisites. The new test explicitly constructs an ungated fixture, preserving the original assertion while allowing real exercises to have prerequisites.
- test-fixture-compatibility.patch: the same test change as a small reviewable diff. Do not apply it again if you copied the full test file.
- docs/first-100-words.html: readable ordered list with descriptions and official references.
- docs/existing-63-audit.html: decisions and before/after descriptions for every original entry.
- docs/dictionary-checks.json: exact dictionary matches for all 127 retained entries.
- docs/examples-for-review.json: 20 unique original examples needing teacher review.
- docs/SOURCE-NOTES.txt: attribution, licenses, pronunciation conventions and source hashes.

WHAT CHANGES
The active curriculum contains exactly 100 distinct entries in 20 lessons of 4-6 entries. It combines 36 existing entries and 64 new entries. All 63 original IDs are retained, so total vocabulary storage is 127 entries, not 100. The other 27 are excluded from the new introduction sequence but can still be reviewed by existing players. Compatibility course is retained for saved lesson IDs.
Each lesson requires readiness in the previous lesson. Sentence exercises declare prerequisites. The 了 exercise is retained for old progress, but 了 is not introduced in the first 100. Official references: 98 level-1 entries and two level-2 entries (咖啡 and 累).

INSTALL
1. Create a Git branch and back up/export a real save before testing.
2. Compare your main with the base commit above. These are complete replacement content files; merge intervening content changes instead of overwriting them.
3. Copy src/content/*.json into the corresponding repository directory.
4. Copy tests/eligibility.test.ts, or apply test-fixture-compatibility.patch. This changes a test fixture only, not game logic. If main has changed that test, merge the small diff manually.
5. Optionally copy docs/ reports for maintainer review.
6. Run npm run validate:content, npm run curriculum, npm test, npm run inventory, and npm run build.
7. Review the diff and commit the individual files. Do not upload only the ZIP to the repository expecting GitHub to unpack it.

CURRENT ENGINE SAFEGUARDS
This package uses per-entry question eligibility instead of modifying engine code. Bare-character pronunciation questions are disabled for dictionary polyphones; they can be restored when meaning-context questions are implemented reliably. Meaning-to-pinyin and listening-to-pinyin are restricted where synonyms, neutral-tone variants, or connected-speech changes could make them misleading. Straightforward isolated single-reading syllables retain these modes. Existing unsupported TTS readings remain disabled. This is deliberately conservative, not a claim of device audio verification.

RELEASE STATUS
Dictionary-checked editorial draft, NOT human-reviewed. Keep provisional and review labels until a qualified Mandarin teacher reviews the course. Source definitions and pronunciations have been checked; original teaching notes and sentence naturalness still warrant human review.
The previously identified engine issue where newly inserted words inherit prerequisite satisfaction from a completed lesson is outside this content-only package. Fix that before public release, especially for later course updates. This new course has a new stable curriculum ID.

See docs/VALIDATION.txt for exact checks and limitations.
'''
(out/'README-IMPORT.txt').write_text(readme)
print('Packaged',len(new),'vocabulary entries;',len(examples),'unique examples; base',base)
