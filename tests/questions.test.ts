import test from 'node:test'
import assert from 'node:assert/strict'
import { WORDS } from '../src/data.ts'
import type { Word } from '../src/data.ts'
import { buildQuestion, chooseKind, isFeasible, lookalikesOf, toneVariants, type KindResult, type QKind, type Question } from '../src/game/questions.ts'

test('vocabulary data is consistent', () => {
  assert.ok(WORDS.length >= 8, 'need enough words for 4 distinct options')
  assert.equal(new Set(WORDS.map(w => w.hanzi)).size, WORDS.length, 'duplicate hanzi')
  for (const w of WORDS) {
    assert.equal(w.pinyin.normalize('NFC'), w.pinyin, `${w.hanzi}: pinyin not NFC`)
    assert.ok(toneVariants(w.pinyin).includes(w.pinyin) === false)
    assert.equal(toneVariants(w.pinyin).length, 3, `${w.hanzi}: needs a tone mark`)
    for (const c of w.confusable ?? []) assert.ok(WORDS.some(x => x.hanzi === c))
  }
})

test('toneVariants keeps the syllable and swaps only the tone', () => {
  assert.deepEqual(toneVariants('shān').sort(), ['shán', 'shǎn', 'shàn'].sort())
  assert.deepEqual(toneVariants('nǚ').sort(), ['nǖ', 'nǘ', 'nǜ'].sort())
  assert.deepEqual(toneVariants('xiǎo').sort(), ['xiāo', 'xiáo', 'xiào'].sort())
  assert.deepEqual(toneVariants('liù').sort(), ['liū', 'liú', 'liǔ'].sort())
})

const LEVELS = [undefined, { lv: 0, ok: 0 }, { lv: 1, ok: 0 }, { lv: 2, ok: 0 }, { lv: 3, ok: 0 }, { lv: 4, ok: 0 }]
const ALL_KINDS: QKind[] = ['meaning', 'pinyin', 'character', 'listen', 'meaning2pinyin', 'pinyin2char', 'listen2meaning', 'listen2pinyin', 'homophone', 'lookalike']
const expectedAnswer = (q: Question, w: Word) => q.kind === 'pinyin' || q.kind === 'meaning2pinyin' || q.kind === 'listen2pinyin' ? w.pinyin : q.optionsAreHanzi ? w.hanzi : w.meaning
const meaningTokens = (m: string) => m.split('/').map(t => t.trim().toLowerCase())

test('every word, level and kind: 4 unique options, exactly one correct, answer matches the kind', () => {
  const known = new Set(WORDS.map(w => w.hanzi))
  for (const w of WORDS) for (const e of LEVELS) for (const kind of [undefined, ...ALL_KINDS]) for (let rep = 0; rep < 6; rep++) {
    const q = buildQuestion(w, e, WORDS, { canListen: true, kind, known })
    const tag = `${w.hanzi} lv=${e?.lv} want=${kind} got=${q.kind}`
    assert.equal(q.options.length, 4, tag)
    assert.equal(new Set(q.options).size, 4, `${tag}: duplicate options`)
    assert.equal(q.options.filter(o => o === q.answer).length, 1, tag)
    assert.equal(q.answer, expectedAnswer(q, w), tag)
    assert.ok(q.text.length > 5, tag)
  }
})

test('level tables: early = recognise, developing = all directions, higher = mixed; audio only when allowed', () => {
  const w = WORDS.find(x => x.hanzi === '水')!    // no homophone, no look-alike
  const seen = (lv: number, canListen: boolean) => { const k = new Set<string>(); for (let i = 0; i < 400; i++) k.add(chooseKind(w, { lv, ok: 0 }, WORDS, { canListen, known: new Set(WORDS.map(x => x.hanzi)) })); return k }
  // level 0: a fresh word (no correct answer yet) always gets the easiest kind first; recognition and listening only after one success
  const lv0 = (ok: number, canListen: boolean) => { const k = new Set<string>(); for (let i = 0; i < 400; i++) k.add(chooseKind(w, { lv: 0, ok }, WORDS, { canListen, known: new Set(WORDS.map(x => x.hanzi)) })); return [...k].sort() }
  assert.deepEqual(lv0(0, true), ['meaning'])
  assert.deepEqual(lv0(1, true), ['character', 'listen', 'meaning'])
  assert.deepEqual(lv0(1, false), ['character', 'meaning'])
  for (const k of seen(1, true)) assert.ok(['pinyin', 'pinyin2char', 'character', 'listen2meaning'].includes(k), `lv1 ${k}`)
  assert.ok(seen(1, true).has('pinyin2char') && seen(1, true).has('listen2meaning'))
  for (const lv of [2, 3, 4]) { const k = seen(lv, false); assert.ok(![...k].some(x => x.startsWith('listen')), `no audio at lv${lv}`); assert.ok(k.size >= 3, `variety at lv${lv}`) }
  assert.ok(seen(3, true).has('listen') && seen(3, true).has('listen2pinyin') && seen(3, true).has('meaning2pinyin'))
  assert.equal(chooseKind(w, undefined, WORDS), 'intro')
})

test('homophones: sound-only questions are never asked when a known homophone exists; the meaning cue is used instead', () => {
  const mu = WORDS.find(x => x.hanzi === '木')!, eye = WORDS.find(x => x.hanzi === '目')!
  const both = new Set(WORDS.map(x => x.hanzi)), onlyMu = new Set(WORDS.map(x => x.hanzi).filter(h => h !== '目'))
  for (const kind of ['listen', 'pinyin2char', 'listen2meaning'] as QKind[]) {
    assert.equal(isFeasible(kind, mu, WORDS, { canListen: true, known: both }), false, `${kind} with partner known`)
    assert.equal(isFeasible(kind, mu, WORDS, { canListen: true, known: onlyMu }), true, `${kind} with partner unseen`)
    assert.equal(buildQuestion(mu, { lv: 3, ok: 0 }, WORDS, { canListen: true, kind, known: both }).kind, 'meaning', 'falls back safely')
  }
  // allowed-but-guarded: with the partner unseen it may never appear among the options
  for (let i = 0; i < 100; i++) for (const kind of ['listen', 'pinyin2char'] as QKind[]) {
    const q = buildQuestion(mu, { lv: 3, ok: 0 }, WORDS, { canListen: true, kind, known: onlyMu })
    assert.ok(!q.options.includes(eye.hanzi), `${kind} offered the homophone`)
  }
  // the homophone question itself: both characters appear, only one matches the meaning
  for (let i = 0; i < 100; i++) {
    const q = buildQuestion(mu, { lv: 2, ok: 0 }, WORDS, { canListen: true, kind: 'homophone', known: both })
    assert.equal(q.kind, 'homophone'); assert.ok(q.options.includes('木') && q.options.includes('目'))
    assert.match(q.text, /mù/); assert.match(q.text, /wood/)
    const matching = q.options.filter(h => WORDS.find(x => x.hanzi === h)!.meaning === 'wood / tree'); assert.equal(matching.length, 1)
  }
  // listening to a *pinyin* answer is fine for homophones: both are mù
  assert.equal(isFeasible('listen2pinyin', mu, WORDS, { canListen: true, known: both }), true)
  // pairs: every exact homophone pair in the data
  const groups = new Map<string, string[]>(); for (const w of WORDS) groups.set(w.pinyin, [...(groups.get(w.pinyin) ?? []), w.hanzi])
  for (const [, hs] of groups) if (hs.length > 1) for (const h of hs) { const w = WORDS.find(x => x.hanzi === h)!; assert.equal(isFeasible('pinyin2char', w, WORDS, { known: both }), false, h) }
})

test('look-alike questions: partners from the data, meanings never overlap, only for known characters', () => {
  const ri = WORDS.find(x => x.hanzi === '日')!
  const known = new Set(WORDS.map(x => x.hanzi))
  for (let i = 0; i < 100; i++) {
    const q = buildQuestion(ri, { lv: 3, ok: 0 }, WORDS, { kind: 'lookalike', known })
    assert.equal(q.kind, 'lookalike'); assert.ok(q.options.includes('月') || q.options.includes('口'))
    const ms = q.options.map(h => WORDS.find(x => x.hanzi === h)!.meaning)
    for (const m of ms.filter(m => m !== ri.meaning)) assert.ok(!meaningTokens(m).some(t => meaningTokens(ri.meaning).includes(t)), `${m} overlaps ${ri.meaning}`)
  }
  assert.equal(isFeasible('lookalike', ri, WORDS, { known: new Set(['日']) }), false, 'no unseen partners')
  assert.equal(isFeasible('lookalike', WORDS.find(x => x.hanzi === '水')!, WORDS, { known }), false, 'word without look-alikes')
  // symmetry: 天 only lists 大, but 大 lists 天 and 人; the relation works both ways
  assert.ok(lookalikesOf(WORDS.find(x => x.hanzi === '天')!, WORDS).some(w => w.hanzi === '大'))
  assert.ok(lookalikesOf(WORDS.find(x => x.hanzi === '日')!, WORDS).some(w => w.hanzi === '月'))
})

test('wrong answers come from words the learner has met once enough are known', () => {
  const known = new Set(WORDS.slice(0, 14).map(w => w.hanzi))
  for (let i = 0; i < 300; i++) {
    const w = WORDS[i % 14]
    const q = buildQuestion(w, { lv: 3, ok: 0 }, WORDS, { canListen: true, known, history: [] })
    for (const o of q.options) {
      if (o === q.answer) continue
      const src = q.optionsAreHanzi ? WORDS.find(x => x.hanzi === o) : q.kind === 'pinyin' || q.kind === 'meaning2pinyin' || q.kind === 'listen2pinyin' ? undefined : WORDS.find(x => x.meaning === o)
      if (src) assert.ok(known.has(src.hanzi), `${q.kind} offered unmet word ${src.hanzi}`)
    }
  }
})

test('scheduler: avoids repeating the last kind and leans on kinds the learner keeps missing', () => {
  const w = WORDS.find(x => x.hanzi === '水')!, known = new Set(WORDS.map(x => x.hanzi))
  let repeats = 0, last: QKind | null = null
  const history: KindResult[] = []
  for (let i = 0; i < 600; i++) { const k = chooseKind(w, { lv: 3, ok: 0 }, WORDS, { canListen: true, known, history }); if (k === last) repeats++; last = k; history.push({ kind: k, ok: true }) }
  assert.ok(repeats / 600 < 0.1, `repeat rate ${(repeats / 6).toFixed(1)}%`)
  const count = (hist: KindResult[]) => { let n = 0; for (let i = 0; i < 800; i++) if (chooseKind(w, { lv: 3, ok: 0 }, WORDS, { canListen: true, known, history: hist }) === 'listen2pinyin') n++; return n }
  const weak = Array.from({ length: 8 }, () => ({ kind: 'listen2pinyin' as QKind, ok: false })).concat([{ kind: 'pinyin' as QKind, ok: true }])
  const strong = Array.from({ length: 8 }, () => ({ kind: 'listen2pinyin' as QKind, ok: true })).concat([{ kind: 'pinyin' as QKind, ok: true }])
  assert.ok(count(weak) > count(strong) * 1.5, `weak ${count(weak)} vs strong ${count(strong)}`)
})

test('unfair wrong answers never appear in any kind: tone-change readings, overlapping or too-close meanings', () => {
  const known = new Set(WORDS.map(x => x.hanzi)); const get = (h: string) => WORDS.find(x => x.hanzi === h)!
  for (let i = 0; i < 80; i++) for (const kind of ['pinyin', 'meaning2pinyin', 'listen2pinyin'] as QKind[]) {
    assert.ok(!buildQuestion(get('不'), { lv: 2, ok: 0 }, WORDS, { canListen: true, kind, known }).options.includes('bú'), `不 ${kind}`)
    const o = buildQuestion(get('一'), { lv: 2, ok: 0 }, WORDS, { canListen: true, kind, known }).options
    assert.ok(!o.includes('yí') && !o.includes('yì'), `一 ${kind}`)
  }
  for (let i = 0; i < 80; i++) for (const kind of ['meaning', 'character', 'lookalike', 'listen2meaning'] as QKind[]) {
    const day = buildQuestion(get('日'), { lv: 2, ok: 0 }, WORDS, { canListen: true, kind, known })
    assert.ok(!day.options.includes('sky / day') && !day.options.includes('天'), `日 ${kind} offered 天/sky-day`)
    const zhong = buildQuestion(get('中'), { lv: 2, ok: 0 }, WORDS, { canListen: true, kind, known })
    assert.ok(!zhong.options.includes('country') && !zhong.options.includes('国'), `中 ${kind} offered 国/country`)
  }
})

test('level 0 is easy: clearly different wrong answers, never look-alikes; higher levels get harder wrong answers', () => {
  const known = new Set(WORDS.map(x => x.hanzi)); const get = (h: string) => WORDS.find(x => x.hanzi === h)!
  const sameGroupCount = (word: Word, lv: number, kind: QKind) => {
    let same = 0, total = 0
    for (let i = 0; i < 300; i++) {
      const q = buildQuestion(word, { lv, ok: 1 }, WORDS, { canListen: true, kind, known })
      if (q.kind !== kind) continue
      for (const o of q.options) {
        if (o === q.answer) continue
        const w = q.optionsAreHanzi ? WORDS.find(x => x.hanzi === o) : WORDS.find(x => x.meaning === o)
        if (w) { total++; if (w.group === word.group) same++ }
      }
    }
    return { same, total }
  }
  const four = get('四')   // numbers are the hardest wrong answers for each other
  for (const kind of ['character', 'meaning'] as QKind[]) {
    assert.equal(sameGroupCount(four, 0, kind).same, 0, `level 0 ${kind}: no other numbers among the wrong answers`)
    assert.ok(sameGroupCount(four, 3, kind).same > 300, `level 3 ${kind}: same-family wrong answers are the norm`)
    const mid = sameGroupCount(four, 1, kind); assert.ok(mid.same > 0 && mid.same < mid.total * 0.6, `level 1 ${kind}: mixed`)
  }
  // look-alike characters are not used as wrong answers at level 0 (木 vs 目 is a later skill)
  for (let i = 0; i < 300; i++) assert.ok(!buildQuestion(get('木'), { lv: 0, ok: 1 }, WORDS, { kind: 'character', known }).options.includes('目'), 'look-alike offered at level 0')
  // the intro question is easy too
  for (let i = 0; i < 100; i++) { const q = buildQuestion(four, undefined, WORDS, { known }); for (const o of q.options) if (o !== q.answer) assert.notEqual(WORDS.find(x => x.meaning === o)!.group, 'number') }
})
