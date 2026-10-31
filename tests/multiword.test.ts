import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWords, audioReliable, homographsOf } from '../src/content/entries.ts'
import { checkPinyin, splitSyllables, soundKey, toneVariants } from '../src/content/pinyin.ts'
import type { ClozeItem, RawWord } from '../src/content/types.ts'
import { validateContent } from '../src/content/validate.ts'
import { QUESTION_KINDS, buildQuestion, isFeasible, meaningsOverlap, soundAlikesOf, usableHomophones, wrongPinyinFor, type QKind } from '../src/game/questions.ts'
import { WORDS } from '../src/data.ts'
import { CLOZE as SHIPPED_CLOZE } from '../src/content/index.ts'

const R = (o: Partial<RawWord> & { hanzi: string; pinyin: string; meaning: string }): RawWord => ({ group: 'g', note: 'n', ...o })
const rng = () => 0.5
const LV2 = { lv: 2, ok: 0 }

// A small, hand-made vocabulary that exercises every case.
const SET = normalizeWords([
  R({ hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', group: 'greet', speech: [{ pinyin: 'ní hǎo', context: 'two third tones meet' }] }),
  R({ hanzi: '谢谢', pinyin: 'xièxie', meaning: 'thank you / thanks', group: 'greet', neutral: [2], wrongPinyin: ['xiéxie', 'xiěxie'] }),
  R({ hanzi: '朋友', pinyin: 'péngyou', meaning: 'friend', group: 'people', neutral: [2] }),
  R({ hanzi: '今天', pinyin: 'jīntiān', meaning: 'today', group: 'time' }),
  R({ hanzi: '学校', pinyin: 'xuéxiào', meaning: 'school', group: 'place' }),
  R({ hanzi: '喜欢', pinyin: 'xǐhuan', meaning: 'to like', group: 'feel', neutral: [2] }),
  R({ hanzi: '妈妈', pinyin: 'māma', meaning: 'mom / mother', group: 'people', neutral: [2] }),
  R({ hanzi: '谁', pinyin: 'shéi', meaning: 'who', group: 'q', variants: ['shuí'] }),
  R({ hanzi: '水', pinyin: 'shuǐ', meaning: 'water', group: 'nature' }),
  R({ id: '看-look', hanzi: '看', pinyin: 'kàn', meaning: 'to look / to watch', group: 'verb', audio: 'none' }),
  R({ id: '看-guard', hanzi: '看', pinyin: 'kān', meaning: 'to guard / to look after', group: 'verb', audio: 'none' }),
  R({ hanzi: '吗', pinyin: 'ma', meaning: 'question particle: ends a yes/no question', group: 'grammar', kind: 'particle', neutral: [1], audio: 'none' }),
  R({ hanzi: '的', pinyin: 'de', meaning: 'links a describing word to a noun', group: 'grammar', kind: 'particle', neutral: [1], audio: 'none' }),
  R({ hanzi: '了', pinyin: 'le', meaning: 'marks a finished action or a new situation', group: 'grammar', kind: 'particle', neutral: [1], audio: 'none' })
])
const by = (id: string) => SET.find(w => w.id === id)!
const KNOWN = new Set(SET.map(w => w.id))
const CLOZE: ClozeItem[] = [
  { id: 'c1', answer: '吗', zh: '你是学生___？', pinyin: 'Nǐ shì xuésheng ___?', en: 'Are you a student?', options: ['吗', '的', '了'], why: { 的: 'links a describing word to a noun', 了: 'marks a finished action' }, review: { status: 'ai-draft' } },
  { id: 'c2', answer: '的', zh: '这是我___书。', pinyin: 'Zhè shì wǒ ___ shū.', en: 'This is my book.', options: ['吗', '的', '了'], why: { 吗: 'comes at the end of a question', 了: 'cannot link 我 and 书' }, review: { status: 'ai-draft' } }
]

// ---- pinyin: neutral tone vs missing data ----------------------------------------------------------
test('pinyin: marked, neutral and mixed syllables, with ü', () => {
  for (const [p, n] of [['nǐ hǎo', []], ['péngyou', [2]], ['māma', [2]], ['ma', [1]], ['de', [1]], ['xuéxiào', []], ['nǚ', []], ['lǜ', []], ['nǚ\'ér', []], ['xǐhuan', [2]]] as [string, number[]][])
    assert.equal(checkPinyin(p, n).ok, true, `${p} should be valid`)
  assert.deepEqual(splitSyllables('péngyou')!.map(s => [s.text, s.tone]), [['péng', 2], ['you', 0]])
  assert.deepEqual(splitSyllables('māma')!.map(s => s.tone), [1, 0])
})

test('pinyin: an unmarked syllable is only accepted when declared neutral; marked ones cannot be declared neutral', () => {
  assert.match(checkPinyin('péngyou', []).problems.join('|'), /no tone mark: add the tone mark, or list 2 in "neutral"/)
  assert.match(checkPinyin('ma', []).problems.join('|'), /no tone mark/)
  assert.match(checkPinyin('péngyǒu', [2]).problems.join('|'), /listed as neutral but has a tone mark/)
  assert.match(checkPinyin('ma', [1, 2]).problems.join('|'), /outside 1-1/)
  assert.match(checkPinyin('ni3').problems.join('|'), /tone numbers/)
  assert.match(checkPinyin('xuéxaio').problems.join('|'), /cannot be split/)
})

test('tone variants are only made for one-syllable entries with a lexical tone', () => {
  assert.deepEqual(toneVariants('shān').sort(), ['shán', 'shǎn', 'shàn'].sort())
  for (const p of ['péngyou', 'māma', 'nǐ hǎo', 'xuéxiào', 'ma', 'de']) assert.deepEqual(toneVariants(p), [], p)
})

// ---- multi-character words and unambiguous options ----------------------------------------------------
test('multi-character words work in every question kind that is possible for them, with one right answer', () => {
  for (const w of SET.filter(x => x.kind === 'word' && [...x.hanzi].length === 2)) for (const kind of QUESTION_KINDS) for (const lv of [0, 1, 2, 3]) {
    const q = buildQuestion(w, { lv, ok: 0 }, SET, { kind, canListen: true, known: KNOWN, rng })
    assert.equal(new Set(q.options).size, q.options.length, `${w.hanzi} ${q.kind}: duplicate options`)
    assert.equal(q.options.filter(o => o === q.answer).length, 1, `${w.hanzi} ${q.kind}: exactly one correct option`)
    assert.ok(q.options.length >= 2 || q.kind === 'intro')
  }
})

test('pinyin options never come from editing tone marks of a multi-syllable word', () => {
  const others = new Set(SET.flatMap(w => [w.pinyin, ...w.wrongPinyin]))
  for (const w of SET.filter(x => x.kind === 'word' && splitSyllables(x.pinyin)!.length === 2)) {
    for (const kind of ['pinyin', 'meaning2pinyin'] as QKind[]) {
      if (!isFeasible(kind, w, SET, { canListen: true, known: KNOWN })) continue
      const q = buildQuestion(w, LV2, SET, { kind, known: KNOWN, rng })
      for (const o of q.options.filter(x => x !== w.pinyin)) assert.ok(others.has(o), `${w.hanzi}: "${o}" must be an authored wrong reading or the reading of another entry, never an edited tone mark`)
    }
  }
})

// ---- accepted variants, other readings, connected speech ---------------------------------------------------
test('accepted pronunciation variants are never offered as wrong answers', () => {
  const who = by('谁')
  for (let k = 0; k < 40; k++) for (const kind of ['pinyin', 'meaning2pinyin'] as QKind[]) {
    const q = buildQuestion(who, LV2, SET, { kind, known: KNOWN, rng: Math.random })
    assert.ok(!q.options.map(soundKey).includes(soundKey('shuí')), `shuí offered in ${q.kind}`)
    assert.equal(q.answer, 'shéi')
  }
  // ... and a word that sounds like a VARIANT of another word counts as sounding alike
  const sw = normalizeWords([R({ hanzi: '谁', pinyin: 'shéi', meaning: 'who', variants: ['shuí'] }), R({ hanzi: '睡', pinyin: 'shuí', meaning: 'sleep (made-up reading for the test)' })])
  assert.equal(usableHomophones(sw[0], sw, new Set(sw.map(w => w.id))).length, 1)
  assert.equal(isFeasible('listen', sw[0], sw, { canListen: true, known: new Set(sw.map(w => w.id)) }), false, 'sound alone cannot decide between them')
})

test('connected-speech forms (你好 -> ní hǎo) are guidance, never a wrong answer or the answer', () => {
  const hello = by('你好')
  for (let k = 0; k < 40; k++) {
    const q = buildQuestion(hello, LV2, SET, { kind: 'pinyin', known: KNOWN, rng: Math.random })
    assert.ok(!q.options.map(soundKey).includes(soundKey('ní hǎo')))
    assert.equal(q.answer, 'nǐ hǎo')
  }
  assert.ok(!wrongPinyinFor(hello, SET, rng, true).map(soundKey).includes(soundKey('ní hǎo')))
})

test('same hanzi, different readings: the question carries the meaning, audio is off, siblings are only wrong answers when the meaning is shown', () => {
  const look = by('看-look'), guard = by('看-guard')
  assert.equal(homographsOf(look, SET)[0].id, '看-guard')
  assert.equal(audioReliable(look, SET), false)
  for (const kind of ['listen', 'listen2meaning', 'listen2pinyin'] as QKind[]) assert.equal(isFeasible(kind, look, SET, { canListen: true, known: KNOWN }), false, `${kind} must be off for a hanzi with two readings`)
  const q = buildQuestion(look, LV2, SET, { kind: 'pinyin', known: KNOWN, rng })
  assert.match(q.text, /to look \/ to watch/); assert.equal(q.show.meaning, true)
  const m = buildQuestion(look, LV2, SET, { kind: 'meaning', known: KNOWN, rng })
  assert.match(m.text, /看 \(kàn\)/); assert.equal(m.show.pinyin, true)
  assert.ok(!m.options.includes(guard.meaning), 'the other reading’s meaning is not offered as a wrong meaning')
  // the other reading is a fair wrong pinyin only when the intended meaning is on screen; never in audio-only questions
  assert.ok(wrongPinyinFor(look, SET, rng, true).includes('kān'))
  assert.ok(!wrongPinyinFor(look, SET, rng, false).includes('kān'))
  // hanzi options can never contain the same hanzi twice
  for (let k = 0; k < 30; k++) { const c = buildQuestion(look, LV2, SET, { kind: 'character', known: KNOWN, rng: Math.random }); assert.equal(c.options.filter(o => o === '看').length, 1) }
})

// ---- homophones, overlapping meanings, too few distractors ----------------------------------------------------
test('homophones: sound-only questions are off while a same-sounding word is known (他 / 她 style), on otherwise', () => {
  const pair = normalizeWords([R({ hanzi: '他', pinyin: 'tā', meaning: 'he / him' }), R({ hanzi: '她', pinyin: 'tā', meaning: 'she / her' }), R({ hanzi: '大', pinyin: 'dà', meaning: 'big' }), R({ hanzi: '小', pinyin: 'xiǎo', meaning: 'small' }), R({ hanzi: '水', pinyin: 'shuǐ', meaning: 'water' })])
  const ta = pair[0]
  for (const k of ['listen', 'pinyin2char', 'listen2meaning'] as QKind[]) assert.equal(isFeasible(k, ta, pair, { canListen: true, known: new Set(['他', '她']) }), false, k)
  assert.equal(isFeasible('listen', ta, pair, { canListen: true, known: new Set(['他']) }), true, 'a partner the learner has not met does not make it ambiguous')
  assert.equal(isFeasible('homophone', ta, pair, { canListen: true, known: new Set(['他', '她']) }), true, 'with meaning shown, the homophone question is fine')
})

test('overlapping meanings are never offered together, also for look / look after', () => {
  const look = by('看-look'), guard = by('看-guard')
  for (const kind of ['meaning', 'listen2meaning', 'character'] as QKind[]) for (let k = 0; k < 30; k++) {
    const q = buildQuestion(look, LV2, SET, { kind, known: KNOWN, rng: Math.random })
    assert.ok(!q.options.includes(guard.meaning) && !q.options.includes('看') || q.answer === '看', `${q.kind}: overlapping meaning offered`)
  }
  const tw = buildQuestion(by('谢谢'), LV2, SET, { kind: 'meaning', known: KNOWN, rng })
  assert.equal(tw.options.filter(o => /thank/.test(o)).length, 1)
})

test('with too few safe distractors the question falls back to a kind that can be asked fairly', () => {
  const tiny = normalizeWords([R({ hanzi: '朋友', pinyin: 'péngyou', meaning: 'friend', neutral: [2] }), R({ hanzi: '妈妈', pinyin: 'māma', meaning: 'mom', neutral: [2] }), R({ hanzi: '今天', pinyin: 'jīntiān', meaning: 'today' })])
  const w = tiny[0]
  assert.equal(isFeasible('pinyin', w, tiny, { known: new Set(tiny.map(x => x.id)) }), false, 'only 2 other two-syllable readings exist and tone marks are never edited blindly: not enough safe options')
  const q = buildQuestion(w, LV2, tiny, { kind: 'pinyin', known: new Set(tiny.map(x => x.id)), rng })
  assert.notEqual(q.kind, 'pinyin'); assert.equal(q.options.filter(o => o === q.answer).length, 1)
  // authored wrong readings make it possible again
  const authored = normalizeWords([{ ...tiny[0] as RawWord, wrongPinyin: ['péngyǒu', 'pěngyou', 'péngyóu'] }, ...tiny.slice(1) as RawWord[]])
  assert.equal(isFeasible('pinyin', authored[0], authored, { known: new Set(authored.map(x => x.id)) }), true)
})

// ---- eligibility, audio, particles in context -----------------------------------------------------------------
test('per-entry eligibility: an entry only gets the question kinds it lists', () => {
  const only = normalizeWords([R({ hanzi: '谢谢', pinyin: 'xièxie', meaning: 'thank you', neutral: [2], questions: ['meaning', 'character'] }), ...SET.slice(0, 6) as RawWord[]]).filter((w, i, a) => a.findIndex(x => x.id === w.id) === i)
  const w = only[0]
  for (const kind of QUESTION_KINDS) {
    if (kind === 'intro') continue
    assert.equal(isFeasible(kind, w, only, { canListen: true, known: new Set(only.map(x => x.id)) }), ['meaning', 'character'].includes(kind) ? true : false, kind)
  }
  for (let k = 0; k < 30; k++) assert.ok(['meaning', 'character'].includes(buildQuestion(w, LV2, only, { known: new Set(only.map(x => x.id)), canListen: true, rng: Math.random }).kind))
})

test('audio: only reliable entries are used for listening questions', () => {
  assert.equal(audioReliable(by('朋友'), SET), true)
  assert.equal(audioReliable(by('的'), SET), false, 'audio: none')
  assert.equal(isFeasible('listen', by('的'), SET, { canListen: true, known: KNOWN }), false)
  assert.equal(isFeasible('listen2pinyin', by('谢谢'), SET, { canListen: true, known: KNOWN }), true)
  assert.equal(isFeasible('listen2pinyin', by('谢谢'), SET, { canListen: false, known: KNOWN }), false, 'no voice / muted')
})

test('particles are asked in an authored sentence; options and reasons come from the data', () => {
  const ma = by('吗')
  assert.equal(isFeasible('particle', ma, SET, { cloze: CLOZE }), true)
  assert.equal(isFeasible('particle', ma, SET, {}), false, 'no authored sentence, no particle question')
  assert.equal(isFeasible('particle', by('朋友'), SET, { cloze: CLOZE }), false, 'ordinary words are not asked this way')
  const q = buildQuestion(ma, LV2, SET, { kind: 'particle', cloze: CLOZE, known: KNOWN, rng })
  assert.equal(q.kind, 'particle'); assert.equal(q.answer, '吗'); assert.deepEqual([...q.options].sort(), ['了', '吗', '的'].sort())
  assert.equal(q.cloze?.en, 'Are you a student?'); assert.deepEqual(Object.keys(q.cloze!.why).sort(), ['了', '的'].sort())
  assert.ok(!(q.answer in q.cloze!.why), 'every reason belongs to a WRONG option')
  // particles never get meaning-less automatic questions, and without sentences they fall back to "what does it do"
  assert.equal(isFeasible('pinyin', ma, SET, { known: KNOWN }), false)
  assert.equal(buildQuestion(ma, LV2, SET, { known: KNOWN, rng }).kind, 'meaning')
  assert.equal(by('吗').questions?.includes('particle'), true)
})

// ---- the validator --------------------------------------------------------------------------------------------
const base = R({ hanzi: '朋友', pinyin: 'péngyou', meaning: 'friend', neutral: [2] })
const errs = (words: unknown, ex: unknown = {}, cloze: unknown = [], sources: unknown = { 'ai-draft': { title: 't', license: 'l', attribution: 'a' } }) => validateContent(words, ex, cloze, sources).errors.join('|')

test('validator: multi-character entries, syllable count, neutral declarations', () => {
  assert.equal(errs([base]), '')
  assert.match(errs([{ ...base, neutral: [] }]), /no tone mark/)
  assert.match(errs([{ ...base, pinyin: 'péng' }]), /1 syllable\(s\) but "朋友" has 2/)
  assert.match(errs([{ ...base, hanzi: '朋友朋友朋友朋友朋' }]), /max 8/)
  assert.match(errs([{ ...base, alt: ['x'] }]), /"alt" was split in two/)
  assert.match(errs([{ ...base, kind: 'verb' }]), /"kind" must be word, character or particle/)
})

test('validator: readings, variants, speech, wrong readings', () => {
  assert.equal(errs([R({ hanzi: '谁', pinyin: 'shéi', meaning: 'who', variants: ['shuí'] })]), '')
  assert.match(errs([R({ hanzi: '谁', pinyin: 'shéi', meaning: 'who', variants: ['shéi'] })]), /repeats the main pinyin/)
  assert.match(errs([R({ hanzi: '谁', pinyin: 'shéi', meaning: 'who', variants: ['shuí'], wrongPinyin: ['shuí'] })]), /valid way to say this word/)
  assert.match(errs([R({ hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', speech: [{ pinyin: 'nǐ hǎo', context: 'x' }] })]), /repeats the dictionary pinyin/)
  assert.match(errs([R({ hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', speech: [{ pinyin: 'ní hǎo' }] })]), /context/)
})

test('validator: the same hanzi twice needs explicit ids and no audio; ids and aliases are checked', () => {
  const a = R({ id: '看-look', hanzi: '看', pinyin: 'kàn', meaning: 'look', audio: 'none' }), b = R({ id: '看-guard', hanzi: '看', pinyin: 'kān', meaning: 'guard', audio: 'none' })
  assert.equal(errs([a, b]), '')
  assert.match(errs([{ ...a, id: undefined }, b]), /explicit unique "id"/)
  assert.match(errs([{ ...a, audio: undefined }, b]), /need "audio": "none"/)
  assert.match(errs([a, { ...b, id: '看-look' }]), /duplicate id/)
  assert.match(errs([{ ...a, aliases: ['看-guard'] }, b]), /is the id of another entry/)
  assert.match(errs([{ ...a, aliases: ['x'] }, { ...b, aliases: ['x'] }]), /also claimed/)
})

test('validator: source and review status are not faked', () => {
  assert.match(errs([{ ...base, source: [{ name: 'Wikipedia' }] }]), /not registered in sources.json/)
  assert.match(errs([{ ...base, review: { status: 'human-reviewed' } }]), /needs the reviewer's name/)
  assert.match(errs([{ ...base, review: { status: 'human-reviewed', reviewer: 'A. Teacher', date: 'yesterday' } }]), /review date/)
  assert.equal(errs([{ ...base, review: { status: 'human-reviewed', reviewer: 'A. Teacher', date: '2026-11-01' } }]), '')
  assert.match(errs([{ ...base, review: { status: 'checked' } }]), /status: must be one of/)
  assert.equal(errs([{ ...base, source: [{ name: 'ai-draft' }], review: { status: 'ai-draft' } }]), '')
})

test('validator: examples carry note, source, review and audio; sentence pinyin is sanity-checked', () => {
  const ex = (e: object) => ({ 朋友: { summary: 's', sections: [{ type: 'examples', items: [e] }] } })
  const good = { zh: '他是我的朋友。', pinyin: 'Tā shì wǒ de péngyou.', en: 'He is my friend.', note: 'n', source: [{ name: 'ai-draft' }], review: { status: 'ai-draft' }, audio: false }
  assert.equal(errs([base], ex(good)), '')
  assert.match(errs([base], ex({ ...good, audio: 'no' })), /audio: must be true or false/)
  assert.match(errs([base], ex({ ...good, source: [{ name: 'Tatoeba' }] })), /not registered/)
  const w = validateContent([base], ex({ ...good, pinyin: 'Tā shì' }), [], { 'ai-draft': { title: 't', license: 'l', attribution: 'a' } })
  assert.match(w.warnings.join('|'), /pinyin has 2 syllable\(s\) but the sentence has 6/)
})

test('validator: sentence (cloze) questions need a blank, reasons for every wrong option, and a review block', () => {
  const particles = [R({ hanzi: '吗', pinyin: 'ma', meaning: 'q', kind: 'particle', neutral: [1] }), R({ hanzi: '的', pinyin: 'de', meaning: 'd', kind: 'particle', neutral: [1] }), R({ hanzi: '了', pinyin: 'le', meaning: 'l', kind: 'particle', neutral: [1] })]
  assert.equal(errs(particles, {}, CLOZE), '')
  const c = CLOZE[0]
  assert.match(errs(particles, {}, [{ ...c, zh: '你是学生？' }]), /exactly one blank/)
  assert.match(errs(particles, {}, [{ ...c, why: { 的: 'x' } }]), /why\["了"\] is missing/)
  assert.match(errs(particles, {}, [{ ...c, why: { ...c.why, 吗: 'x' } }]), /not a wrong option/)
  assert.match(errs(particles, {}, [{ ...c, options: ['吗'] }]), /2-4 entry ids/)
  assert.match(errs(particles, {}, [{ ...c, answer: '了' }]), /why\["吗"\] is missing|why\["的"\]/)
  assert.match(errs(particles, {}, [{ ...c, review: undefined }]), /review: required/)
  assert.match(errs([base, ...particles.slice(1)], {}, [c]), /option "吗" is not an entry id/)
  assert.match(errs([R({ hanzi: '好', pinyin: 'hǎo', meaning: 'good' }), ...particles.slice(1)], {}, [{ ...c, options: ['好', '的'], why: { 的: 'x' }, answer: '好' }]), /must be an entry with kind "particle"/)
})

// ---- audit of the SHIPPED content: no wrong option is a valid answer ------------------------------------------------
test('audit: across all shipped entries, kinds and many random draws, no wrong option is a valid answer', () => {
  const known = new Set(WORDS.map(w => w.id))
  const AUDIO_KINDS = ['listen', 'listen2meaning', 'listen2pinyin']
  const SOUND_ONLY = ['listen', 'pinyin2char', 'listen2meaning']
  let questions = 0
  for (const w of WORDS) {
    const valid = new Set<string>([soundKey(w.pinyin), ...w.variants.map(soundKey), ...w.speech.map(s => soundKey(s.pinyin))])
    for (const kind of QUESTION_KINDS) for (let k = 0; k < 12; k++) {
      const q = buildQuestion(w, { lv: 2, ok: 0 }, WORDS, { kind, canListen: true, known, cloze: SHIPPED_CLOZE, rng: Math.random })
      questions++
      assert.equal(new Set(q.options).size, q.options.length, `${w.id} ${q.kind}: duplicate option text`)
      assert.equal(q.options.filter(o => o === q.answer).length, 1, `${w.id} ${q.kind}: exactly one correct option`)
      const wrong = q.options.filter(o => o !== q.answer)
      if (q.ask === 'pinyin') for (const o of wrong) assert.ok(!valid.has(soundKey(o)), `${w.id} ${q.kind}: "${o}" is a valid way to say this word`)
      if (q.ask === 'meaning' || q.ask === 'hanzi') {
        const asked = q.ask === 'meaning' ? 'meaning' : 'hanzi'
        for (const o of wrong) {
          const other = WORDS.find(x => (asked === 'meaning' ? x.meaning === o : x.hanzi === o && x.id !== w.id))
          if (!other) continue
          if (q.kind !== 'particle') assert.ok(!meaningsOverlap(w, other), `${w.id} ${q.kind}: "${o}" overlaps in meaning with the answer`)
          if (SOUND_ONLY.includes(q.kind)) assert.ok(soundAlikesOf(w, [other]).length === 0, `${w.id} ${q.kind}: "${o}" sounds like the answer and the question is decided by sound`)
        }
      }
      if (AUDIO_KINDS.includes(q.kind) || q.audio) assert.ok(audioReliable(w, WORDS), `${w.id}: audio question for an entry without reliable audio`)
      if (q.audio && SOUND_ONLY.includes(q.kind)) assert.ok(!soundAlikesOf(w, WORDS).some(x => known.has(x.id)), `${w.id} ${q.kind}: a known word sounds the same`)
    }
  }
  assert.ok(questions > 500)
})

test('written options prefer entries of the same length, so a two-character word is not found by being the odd one out', () => {
  const kn = new Set(SET.map(w => w.id))
  for (const id of ['朋友', '学校', '喜欢']) for (let k = 0; k < 20; k++) {
    const q = buildQuestion(by(id), LV2, SET, { kind: 'character', known: kn, rng: Math.random })
    assert.equal(q.options.filter(o => [...o].length === 2).length, 4, `${id}: all four options are two-character words (there are enough)`)
  }
  const single = buildQuestion(by('水'), LV2, SET, { kind: 'character', known: kn, rng: Math.random })
  assert.equal(single.options.filter(o => [...o].length === 1).length, 4)
})
