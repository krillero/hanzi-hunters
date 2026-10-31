import { useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { PixelScene, type EnemySprite } from './game/PixelScene'
import CampScreen from './CampScreen'
import ExplainModal from './ExplainModal'
import MenuSheet from './MenuSheet'
import NewWordCard from './NewWordCard'
import SummaryModal from './SummaryModal'
import WarmupScreen from './WarmupScreen'
import { WARMUP_GOLD_PER_CORRECT, badgeById, contextFor, localDay, newBadges, pickWarmup, recordCorrect, recordPlay, warmupAvailable } from './game/habit'
import { playSfx, unlockAudio, vibrate, type SfxName, type SfxOptions } from './audio'
import { flyMotes } from './motes'
import { rarityOf } from './game/rarity'
import { accuracyPct, emptyStats, recordAnswer, recordIntro, type RunStats } from './game/runStats'
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, type Settings } from './settings'
import { autoContinuePlan, type AutoPlan } from './game/flow'
import { CLOZE, hasExplanation, type ClozeItem } from './content'
import { fetchLatestBuild, isOutdated, refreshApp, type BuildInfo } from './appInfo'
import { parseBackup, serializeBackup } from './game/backup'
import { ACTIVE_CURRICULUM, ENEMIES, GEAR, WORDS, type BossId, type Word } from './data'
import { audioReliable, homographsOf } from './content/entries'
import { fillBlank, lenClass } from './entryUi'
import { MAX_LV, masteredCount, seenCount, updateMastery } from './game/mastery'
import { DEFAULT_LIMITS, courseLine, courseStatus, emptyCourse, introCapacity, introCardLine, selectIntroductions, selectReview, sentencePrereqsMet, syncCourse, wordMap, type CourseState, type IntroPlan } from './game/course'
import { CHARACTER_KINDS, TONE_KINDS, TRICK_KINDS, tryBuildQuestion, isCharacterQuestion, isToneQuestion, shuffle, type KindResult, type QKind, type Question } from './game/questions'
import BossIntro from './BossIntro'
import LootReveal from './LootReveal'
import { gearVerdict, rarityOf as rarityOfItem } from './game/rarity'
import {
  ENEMIES_PER_FLOOR, SHIELD_SEGMENTS, advance, hasShield, shieldFor, bankRun, bossIdFor, bossPhase, isBoss, isFinalFight, drinkPotion, enemyStats, equipGear, equippedGear, newRun, playerStats, resolveAnswer, startFight, xpForLevel
} from './game/rules'
import { SAVE_KEY, loadSave, sanitizeSave } from './game/save'
import type { Mastery, Run, Saved } from './game/types'
import { buyUpgrade, computeBonuses, nodeById, UPGRADES } from './game/upgrades'

type Card = { word: Word; question: Question }
type CombatExchange = { damage: number; counter: number; blocked: boolean; victory: boolean; combo: number; weak: boolean; shield: 'broken' | 'blocked' | null; shieldLeft: number; regrown: boolean; bossHeal: number }
type Caption = { side: 'hero' | 'monster'; kind: 'weak' | 'block' | 'heal' | 'shield'; text: string }
type Feedback = { correct: boolean; word: Word; mastery: string; masteryUp: boolean; masteredNow: boolean; lv: number; chosen: string; answer: string; title: string; foeName: string; exchange: CombatExchange }

/** Streak badge in the arena: pips until the combo bonus starts (needs the Combo Strikes upgrade), a flame while it is active. */
function ComboBadge({ streak, bonusPct }: { streak: number; bonusPct: number }) {
  if (streak < 1 || (streak < 2 && bonusPct === 0)) return null
  const active = streak >= 2 && bonusPct > 0
  return <span className={`combo-badge ${active ? 'hot' : ''}`} aria-label={`Streak ${streak}${active ? `, combo bonus +${bonusPct}% on the next hit` : ''}`}>
    {active ? <>🔥 ×{streak}</> : bonusPct > 0 ? <><i className="pips" aria-hidden="true"><u className="on" /><u /></i><small>1 more for 🔥 +{bonusPct}%</small></> : <>×{streak}</>}
  </span>
}

/** Counts up every time `value` grows (not on first render), so a counter can play a short "bump" animation. */

/** Does 💡 / the Wordbook have more to show for this entry (an explanation, other readings, or pronunciation notes)? */
const hasDetails = (w: Word) => hasExplanation(w.id) || w.variants.length > 0 || w.speech.length > 0 || homographsOf(w, WORDS).length > 0

const pad = (n: number) => String(n).padStart(2, '0')

/** Preview aid: /?floor=5 starts a fresh run at the last fight of that floor (the boss on floors 5, 10 ...); add &kill=0..3 for an earlier fight. */
const WORD_MAP = wordMap(WORDS)
/** Development diagnostics: why nothing new is introduced right now (logged once per change). Never shown to players. */
let lastCourseLog = ''
function logCourse(plan: IntroPlan) {
  const line = `[course ${ACTIVE_CURRICULUM.id} v${ACTIVE_CURRICULUM.version}] ${plan.reason}: ${plan.detail}${plan.missing.length ? ` (missing from words.json: ${plan.missing.join(', ')})` : ''}`
  if (line === lastCourseLog) return
  lastCourseLog = line
  console.info(line)
  ;(window as unknown as { __hhCourse?: IntroPlan }).__hhCourse = plan
}

function previewStart(): { floor: number; kill: number } | null {
  const q = new URLSearchParams(window.location.search); const f = Number(q.get('floor'))
  if (!q.has('floor') || !Number.isInteger(f) || f < 1 || f > 99) return null
  const k = q.has('kill') ? Number(q.get('kill')) : ENEMIES_PER_FLOOR - 1
  return { floor: f, kill: Number.isInteger(k) && k >= 0 && k < ENEMIES_PER_FLOOR ? k : ENEMIES_PER_FLOOR - 1 }
}

function initialSave(): Saved {
  const s = loadSave(window.localStorage)
  const jump = previewStart()
  if (jump) {
    // A strong enough hero for that depth so the fight itself can be looked at; replaces the current run (explicit test URL only).
    const b = computeBonuses(s.meta.upgrades), base = { ...newRun(b, GEAR, ENEMIES), floor: jump.floor, kill: jump.kill, level: Math.min(40, 2 + jump.floor * 2) }
    return { ...s, run: startFight({ ...base, hp: playerStats(base, b, GEAR).maxHp }, b, ENEMIES) }
  }
  // Brand-new players go straight into a first run; returning players land wherever they left off.
  const brandNew = s.meta.runs === 0 && s.meta.gold === 0 && s.meta.upgrades.length === 0 && Object.keys(s.mastery).length === 0
  if (!s.run && !s.lastRun && brandNew) return { ...s, run: newRun(computeBonuses(s.meta.upgrades), GEAR, ENEMIES) }
  return s
}

function useFullscreen() {
  const supported = typeof document !== 'undefined' && !!document.fullscreenEnabled
  const [on, setOn] = useState(false)
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const toggle = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return }
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('portrait') } catch { /* not supported */ }
    } catch { /* denied or unsupported */ }
  }
  return { supported, on, toggle }
}

function hasChineseVoice() {
  try { return window.speechSynthesis.getVoices().some(v => v.lang.toLowerCase().startsWith('zh')) } catch { return false }
}

export default function App() {
  const sceneRef = useRef<PixelScene | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const answerLock = useRef(false)
  const fs = useFullscreen()
  // Content preview aid: /?word=她 makes that word the first question (see docs/CONTENT_GUIDE.md).
  const kindHistory = useRef<KindResult[]>([])   // this session's question kinds + results: drives variety and weak-area focus
  const forcedWord = useRef(new URLSearchParams(window.location.search).get('word'))
  const forcedKind = useRef(new URLSearchParams(window.location.search).get('kind') as QKind | null)   // preview aid: /?word=木&kind=homophone
  const [save, setSave] = useState<Saved>(() => { try { return initialSave() } catch { return sanitizeSave(null) } })
  const [settings, setSettings] = useState<Settings>(() => { try { return loadSettings(window.localStorage) } catch { return { ...DEFAULT_SETTINGS } } })
  const [hasVoice, setHasVoice] = useState(hasChineseVoice)
  const canListen = hasVoice && !settings.muted          // muted => listening questions are never asked
  const [lootReveal, setLootReveal] = useState<{ name: string; current: string | null; choice: boolean } | null>(null)
  const [tipPulse, setTipPulse] = useState<string | null>(null)   // 💡 pulses once per word, right after the first right answer
  const [bossIntro, setBossIntro] = useState<BossId | null>(() => { const j = previewStart(); return j && isBoss(j.floor, j.kill) ? bossIdFor(j.floor) : null })
  const [warmup, setWarmup] = useState<string[] | null>(null)
  const [ceremony, setCeremony] = useState<string | null>(null)   // word that was just mastered (confetti for a moment)
  const [floorStats, setFloorStats] = useState<RunStats>(emptyStats)
  const [runStats, setRunStats] = useState<RunStats>(emptyStats)
  const [summary, setSummary] = useState<'floor' | 'defeat' | null>(null)
  const [levelUp, setLevelUp] = useState<{ from: number; to: number; hp: number; attack: number } | null>(null)
  const [caption, setCaption] = useState<Caption | null>(null)   // text over a fighter in the arena (HTML, so it stays crisp)
  const [floorBanner, setFloorBanner] = useState('')
  const [reveal, setReveal] = useState<{ chosen: string; plan: Exclude<AutoPlan, null>; exchange: CombatExchange } | null>(null)   // a right answer that continues by itself
  const [menuOpen, setMenuOpen] = useState(false)
  const [card, setCard] = useState<Card | null>(null)
  const [eliminated, setEliminated] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [toast, setToast] = useState('')
  const [campMsg, setCampMsg] = useState('')
  const [showBag, setShowBag] = useState(false)
  const [selectedGearName, setSelectedGearName] = useState<string | null>(null)
  const [selectedGearSlot, setSelectedGearSlot] = useState<import('./data').GearSlot | null>(null)
  const [showWords, setShowWords] = useState(false)
  const [explain, setExplain] = useState<string | null>(null)
  const [latestBuild, setLatestBuild] = useState<BuildInfo | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const closeExplain = useMemo(() => () => setExplain(null), [])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), toast.length > 70 ? 7000 : 3500)
    return () => window.clearTimeout(t)
  }, [toast])

  const run = save.run
  const inCamp = !run
  const hasCard = !!card // the battle UI (and its Phaser mount point) only exists once a card does
  const bonuses = useMemo(() => computeBonuses(save.meta.upgrades), [save.meta.upgrades])
  const stats = run ? playerStats(run, bonuses, GEAR) : null
  const foe = run ? enemyStats(ENEMIES, run.floor, run.kill) : null
  const equipped = run ? equippedGear(GEAR, run.loadout) : []
  const enemyKey = foe ? `${foe.enemy.sprite}:${foe.boss ?? ''}` : ''
  const enemyKeyRef = useRef(enemyKey)
  enemyKeyRef.current = enemyKey
  const phaseRef = useRef<Run['phase']>('fighting')
  phaseRef.current = run?.phase ?? 'fighting'
  const killRef = useRef(0)
  killRef.current = run?.kill ?? 0

  // Teaching order comes from the active curriculum (content/curricula.json, game/course.ts), never from the order of words.json.
  // Preview aid: /?first=朋友,看-look introduces these entries (ids or hanzi) before the curriculum, to try new content without playing to it.
  const previewFirst = useMemo(() => (new URLSearchParams(window.location.search).get('first') ?? '').split(',').map(f => f.trim()).filter(Boolean)
    .map(f => (WORDS.find(w => w.id === f) ?? WORDS.find(w => w.hanzi === f))?.id).filter((id): id is string => !!id), [])
  const courseFor = (mastery: Mastery = save.mastery): CourseState =>
    ({ curriculum: ACTIVE_CURRICULUM, mastery, progress: save.courses[ACTIVE_CURRICULUM.id] ?? emptyCourse(), words: WORD_MAP })
  const introPlanFor = (mastery: Mastery): IntroPlan => {
    const capacity = introCapacity(mastery, DEFAULT_LIMITS)
    const lead = previewFirst.filter(id => !mastery[id]).slice(0, capacity)
    if (lead.length) return { ids: lead, reason: 'introduce', lesson: null, detail: 'preview: ?first=', missing: [] }
    return selectIntroductions(courseFor(mastery), DEFAULT_LIMITS, capacity)
  }
  /** Authored sentence questions are only assessed once the entries / lessons they rely on are satisfied. */
  const sentenceCheck = (mastery: Mastery) => {
    const st = courseFor(mastery)
    const elsewhere = new Set(Object.values(save.courses).flatMap(p => p.completed))
    return (item: ClozeItem) => sentencePrereqsMet(item, st, elsewhere)
  }
  const recentWords = useRef<string[]>([])
  /** The next question: a previously introduced entry (never an unseen one), or null when no fair question exists (see noCard). */
  const makeCard = (mastery = save.mastery, current: string | null = null, listen = canListen, forRun: Run | null = run): Card | null => {
    // Only the very first card of a session (no current word). Not consumed here: React StrictMode runs effects twice.
    const forced = current === null && forcedWord.current ? (WORDS.find(w => w.id === forcedWord.current) ?? WORDS.find(w => w.hanzi === forcedWord.current)) : undefined
    const clozeEligible = sentenceCheck(mastery)
    const opts = (kind?: QKind) => ({ canListen: listen, known: new Set(Object.keys(mastery)), history: kindHistory.current, kind, cloze: CLOZE, clozeEligible })
    const bossFoe = forRun && isBoss(forRun.floor, forRun.kill) ? enemyStats(ENEMIES, forRun.floor, forRun.kill) : null
    // Some bosses need a particular kind of question: tone questions break the Golem's shield, character questions the Scribe's seals,
    // and the Trickster only asks the easy-to-confuse kinds. They ask about words you already know.
    const boss = bossFoe?.boss ?? null
    const needed = forced || !forRun || !boss ? null
      : hasShield(boss) && forRun.shield > 0 ? (boss === 'golem' ? { kinds: TONE_KINDS, ok: isToneQuestion } : { kinds: CHARACTER_KINDS, ok: isCharacterQuestion })
      : boss === 'trickster' ? { kinds: TRICK_KINDS, ok: (q: Question) => q.kind === 'homophone' || q.kind === 'lookalike' }
      : null
    if (needed) {
      const kinds = needed.kinds.filter(k => listen || !k.startsWith('listen'))
      let last: Card | null = null
      for (let k = 0; k < 12; k++) {
        // a known entry (review selection never returns an unseen one); particles only when nothing else is known
        const currentId: string | null = last ? last.word.id : current
        const word: Word | null = selectReview(WORDS, mastery, { currentId, recent: recentWords.current, filter: w => w.kind !== 'particle' }) ?? selectReview(WORDS, mastery, { currentId, recent: recentWords.current })
        if (!word) break
        const question = tryBuildQuestion(word, mastery[word.id], WORDS, opts(kinds[Math.floor(Math.random() * kinds.length)]))
        if (!question) continue
        last = { word, question }
        if (needed.ok(question)) return last
      }
      if (last) return last
    }
    // Echo Wraith, phase 2: the kind of question you got wrong most recently keeps coming back.
    const echo = !forced && forRun && bossFoe?.boss === 'wraith' && bossPhase(forRun, bossFoe.hp) === 2 ? [...kindHistory.current].reverse().find(h => !h.ok)?.kind : undefined
    if (forced) {
      // Preview aid: with ?word=…&kind=…, an entry you have not met yet is asked as if you already knew it, so the requested question kind is shown
      const asked = forcedKind.current && !mastery[forced.id] ? { lv: 1, ok: 0 } : mastery[forced.id]
      const question = tryBuildQuestion(forced, asked, WORDS, opts(forcedKind.current ?? undefined))
      if (question) return { word: forced, question }
    }
    const tried = new Set<string>()
    for (let k = 0; k < 8; k++) {
      const word = selectReview(WORDS, mastery, { currentId: current, recent: recentWords.current, filter: w => !tried.has(w.id) })
      if (!word) break
      tried.add(word.id)
      const question = tryBuildQuestion(word, mastery[word.id], WORDS, opts(echo))
      if (question) return { word, question }
    }
    return null
  }
  /** True when the last attempt to build a question found nothing fair to ask (shown as a content/configuration problem). */
  const [noCard, setNoCard] = useState(false)
  const setNextCard = (c: Card | null) => { setCard(c); setNoCard(c === null) }
  const patch = (fn: (s: Saved) => Saved) => setSave(fn)

  // ---- introducing new words: a card at the start of a fight, never mid-fight ----------------
  const [introQueue, setIntroQueue] = useState<string[]>([])
  const [introTotal, setIntroTotal] = useState(0)
  const introKey = useRef<string | null>(null)   // the fight we last checked; null = this run was resumed from a save
  useEffect(() => {
    if (!run) { introKey.current = ''; return }
    if (run.phase !== 'fighting' || feedback || reveal || bossIntro || summary || lootReveal || introQueue.length) return
    const key = `${run.floor}:${run.kill}`
    if (key === introKey.current) return
    const resumed = introKey.current === null
    introKey.current = key
    if (forcedWord.current || (resumed && seenCount(save.mastery) > 0)) return   // preview URLs and reloads mid-fight are left alone
    const plan = introPlanFor(save.mastery)
    if (import.meta.env.DEV) logCourse(plan)
    if (plan.ids.length) { setIntroQueue(plan.ids); setIntroTotal(plan.ids.length) }
  })
  // Lesson completion is sticky: record lessons as soon as they become ready, so later mistakes never relock the course.
  useEffect(() => {
    const id = ACTIVE_CURRICULUM.id
    const cur = save.courses[id] ?? emptyCourse()
    if (syncCourse(ACTIVE_CURRICULUM, save.mastery, cur, WORD_MAP) === cur) return
    setSave(s => ({ ...s, courses: { ...s.courses, [id]: syncCourse(ACTIVE_CURRICULUM, s.mastery, s.courses[id] ?? emptyCourse(), WORD_MAP) } }))
  }, [save.mastery]) // eslint-disable-line react-hooks/exhaustive-deps
  const introGotIt = () => {
    const id = introQueue[0]
    if (!id) return
    const mastery = updateMastery(save.mastery, id, true)   // creates the entry at level 0: from now on it is asked about
    patch(s => ({ ...s, mastery: updateMastery(s.mastery, id, true) }))
    setFloorStats(s => recordIntro(s, id)); setRunStats(s => recordIntro(s, id))
    const rest = introQueue.slice(1)
    setIntroQueue(rest)
    if (!rest.length) { setNextCard(makeCard(mastery, null)); setEliminated([]); answerLock.current = false }
  }

  // ---- one-time setup -----------------------------------------------------------------
  useEffect(() => {
    const check = () => setHasVoice(hasChineseVoice())
    check()
    try { window.speechSynthesis.addEventListener('voiceschanged', check) } catch { /* no speech support */ }
    return () => { try { window.speechSynthesis.removeEventListener('voiceschanged', check) } catch { /* ignore */ } }
  }, [])
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage unavailable */ } }, [settings])
  useEffect(() => { if (!ceremony) return; const t = window.setTimeout(() => setCeremony(null), 2200); return () => window.clearTimeout(t) }, [ceremony])
  useEffect(() => { if (!levelUp) return; const t = window.setTimeout(() => setLevelUp(null), 2200); return () => window.clearTimeout(t) }, [levelUp])
  // Browsers only allow sound after a tap: the first tap anywhere unlocks it.
  useEffect(() => { const u = () => unlockAudio(); window.addEventListener('pointerdown', u, { once: true }); return () => window.removeEventListener('pointerdown', u) }, [])
  /** One game sound + its vibration, each behind its own setting. `delay` is in seconds. */
  const feel = (name: SfxName, opts: SfxOptions = {}, delay = 0) => {
    if (settings.sfx) playSfx(name, opts, delay)
    if (settings.haptics) { if (delay <= 0) vibrate(name); else window.setTimeout(() => vibrate(name), delay * 1000) }
  }
  // Muting while a listening question is open: ask the same word as a normal question instead.
  useEffect(() => {
    if (!settings.muted || !card?.question.audio || feedback || reveal) return
    window.speechSynthesis?.cancel?.()
    const question = tryBuildQuestion(card.word, save.mastery[card.word.id], WORDS, { canListen: false, known: new Set(Object.keys(save.mastery)), history: kindHistory.current, cloze: CLOZE, clozeEligible: sentenceCheck(save.mastery) })
    if (question) setCard({ word: card.word, question }); else setNextCard(makeCard(save.mastery, card.word.id, false))
    /* eslint-disable-next-line */
  }, [settings.muted])
  // Is a newer build deployed? Checked at start and whenever the app comes back to the foreground.
  useEffect(() => {
    let alive = true
    const check = () => { fetchLatestBuild().then(b => { if (alive) setLatestBuild(b) }) }
    check()
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  useEffect(() => { if (!card && run) setNextCard(makeCard()) /* eslint-disable-next-line */ }, [inCamp])

  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)) } catch { /* storage unavailable */ }
  }, [save])

  useEffect(() => {
    if (inCamp || !hasCard || !mountRef.current) return
    const game = new Phaser.Game({
      type: Phaser.CANVAS, parent: mountRef.current, width: 640, height: 300, backgroundColor: '#101827',
      pixelArt: true, antialias: false, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [PixelScene], render: { pixelArt: true, roundPixels: true }
    })
    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene('PixelScene') as PixelScene
      sceneRef.current = scene
      if (import.meta.env.DEV) (window as unknown as { __hhScene?: PixelScene }).__hhScene = scene   // dev-only handle for browser tests
      const [sprite, boss] = enemyKeyRef.current.split(':')
      if (sprite) scene.setEnemy(sprite as EnemySprite, (boss || null) as BossId | null)
      if (phaseRef.current === 'victory') scene.hideMonster()
      if (phaseRef.current === 'defeat') scene.showDefeat(false)
    })
    const ro = new ResizeObserver(() => game.scale.refresh())
    ro.observe(mountRef.current)
    return () => { ro.disconnect(); game.destroy(true); sceneRef.current = null }
  }, [inCamp, hasCard])

  useEffect(() => {
    const [sprite, boss] = enemyKey.split(':')
    if (sprite) sceneRef.current?.setEnemy(sprite as EnemySprite, (boss || null) as BossId | null)
  }, [enemyKey])

  // ---- audio ----------------------------------------------------------------------------
  const speak = (hanzi: string, force = false) => {
    if (settings.muted && !force) return
    if (!('speechSynthesis' in window)) { setToast('Speech playback is not supported in this browser.'); return }
    if (!hasChineseVoice()) setToast('No Mandarin voice found on this device. Install a Chinese (Simplified) text-to-speech voice in your system settings.')
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(hanzi)
      u.lang = 'zh-CN'; u.rate = 0.82
      const voices = window.speechSynthesis.getVoices()
      const voice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('zh-cn')) ?? voices.find(v => v.lang.toLowerCase().startsWith('zh'))
      if (voice) u.voice = voice
      window.speechSynthesis.speak(u)
    } catch { /* speech is optional: never let it break the game */ }
  }
  // The speaker button: when muted, tapping it turns sound back on (and plays the text).
  const pressSpeaker = (text: string) => { if (settings.muted) setSettings(st => ({ ...st, muted: false })); speak(text, true) }
  // Words are only read aloud when the audio can be trusted to match the displayed word and reading (see audioReliable in content/entries.ts).
  useEffect(() => { if (card?.question.audio && !feedback && !reveal && audioReliable(card.word, WORDS)) speak(card.word.hanzi) /* eslint-disable-next-line */ }, [card])

  // ---- actions --------------------------------------------------------------------------
  const answerQuestion = (option: string) => {
    if (!run || !card || answerLock.current || feedback || reveal || run.phase !== 'fighting' || eliminated.includes(option)) return
    answerLock.current = true
    setCaption(null)
    const { word, question } = card
    const entry = save.mastery[word.id]
    const isCorrect = option === question.answer
    const r = resolveAnswer({
      run, bonuses, enemies: ENEMIES, allGear: GEAR, lv: entry?.lv ?? 0, isCorrect, sealQuestion: foe?.boss === 'scribe' ? isCharacterQuestion(question) : isToneQuestion(question),
      roll: { drop: Math.random(), item: Math.random() }
    })
    const mastery = updateMastery(save.mastery, word.id, isCorrect)
    recentWords.current = [word.id, ...recentWords.current.filter(h => h !== word.id)].slice(0, 8)
    if (question.kind !== 'intro') kindHistory.current = [...kindHistory.current, { kind: question.kind, ok: isCorrect }].slice(-16)
    const before = entry?.lv ?? -1, after = mastery[word.id].lv
    sceneRef.current?.playHit('monster')
    if (!isCorrect && r.shieldRegrown) setCaption({ side: 'monster', kind: 'shield', text: '🖋 A SEAL GROWS BACK' })
    else if (!isCorrect && r.bossHealed > 0) setCaption({ side: 'monster', kind: 'weak', text: `🎭 DODGED · +${r.bossHealed} HP` })
    else if (r.shieldBroken && r.run.shield === 0) setCaption({ side: 'monster', kind: 'shield', text: foe?.boss === 'scribe' ? '💥 SEALS BROKEN' : '💥 SHIELD DOWN' })
    if (r.outcome === 'victory') sceneRef.current?.hideMonster(!!foe?.boss)
    else if (r.counter > 0) sceneRef.current?.playHit('hero')
    else if (r.savedBySecondChance) setCaption({ side: 'hero', kind: 'block', text: '🛡 BLOCKED' })

    if (r.outcome === 'defeat') sceneRef.current?.showDefeat(true)
    const masteredNow = isCorrect && before >= 0 && before < MAX_LV && after >= MAX_LV
    // Habit: days played, correct total and milestone badges (a badge toast never blocks anything)
    let habit = recordPlay(save.habit, localDay()); if (isCorrect) habit = recordCorrect(habit)
    if (r.outcome === 'victory' && foe?.boss) habit = { ...habit, bosses: habit.bosses + 1 }
    const earned = newBadges(habit, contextFor(mastery, habit, Math.max(save.meta.bestFloor, r.run.floor), save.meta.runs))
    if (earned.length) { habit = { ...habit, badges: [...habit.badges, ...earned.map(b => b.id)] }; setToast(`🏅 New badge: ${earned.map(b => b.name).join(', ')}`) }
    if (masteredNow) setCeremony(word.id)
    if (isCorrect && hasDetails(word) && !habit.tipsSeen.includes(word.id)) { habit = { ...habit, tipsSeen: [...habit.tipsSeen, word.id] }; setTipPulse(word.id) }
    patch(s => ({ ...s, run: r.run, mastery, habit }))

    // Learning summary for the floor-clear / defeat cards
    const rec = { id: word.id, isCorrect, streakAfter: r.run.streak, levelBefore: before, levelAfter: after, gold: r.outcome === 'victory' ? r.run.reward.gold : 0 }
    setFloorStats(s => recordAnswer(s, rec)); setRunStats(s => recordAnswer(s, rec))

    // Sound + vibration: the base sound first, then the bigger moments queued after it
    let t = 0
    if (r.outcome === 'defeat') { feel('defeat'); t = 0.8 }
    else if (r.outcome === 'victory') { feel('kill'); t = 0.6 }
    else if (!isCorrect) { feel('wrong'); t = 0.35 }
    else if (r.shieldBroken) { feel('combo', { streak: 3 + (SHIELD_SEGMENTS - r.run.shield) * 2 }); t = 0.45 }
    else if (r.comboHit) { feel('combo', { streak: r.run.streak }); t = 0.45 }
    else { feel('correct'); t = 0.3 }
    if (isCorrect && before >= 0 && before < MAX_LV && after >= MAX_LV) { feel('mastered', {}, t); t += 0.7 }
    if (r.run.level > run.level) {
      feel('levelup', {}, t); t += 0.75
      const before2 = playerStats(run, bonuses, GEAR), after2 = playerStats(r.run, bonuses, GEAR)
      setLevelUp({ from: run.level, to: r.run.level, hp: after2.maxHp - before2.maxHp, attack: after2.attack - before2.attack })
    }
    if (r.loot) {
      const worn = run.loadout[r.loot.slot] ? GEAR.find(g => g.name === run.loadout[r.loot!.slot]) ?? null : null
      const verdict = gearVerdict(r.loot, worn)
      // One item per slot. A pure downgrade is left behind silently; a trade-off asks; anything else is already worn.
      if (verdict !== 'worse') feel('loot', { rarity: rarityOf(r.loot) }, t); t += 0.4
      if (verdict === 'tradeoff') setLootReveal({ name: r.loot.name, current: worn?.name ?? null, choice: true })
      else if (verdict !== 'worse') {
        if (rarityOfItem(r.loot) !== 'common' || r.loot.boss) setLootReveal({ name: r.loot.name, current: worn?.name ?? null, choice: false })
        else setToast(`${r.loot.icon} ${r.loot.name} equipped`)
      }
    }
    if (r.outcome === 'victory') {
      // Only the Second Wind upgrade's own healing is announced (level-up and new-gear HP are not).
      if (r.healedOnKill > 0) setCaption({ side: 'hero', kind: 'heal', text: `💚 +${r.healedOnKill} Second Wind` })
      window.setTimeout(() => {
        const stage = document.querySelector('.arena-stage')?.getBoundingClientRect()
        if (!stage) return
        const from = { x: stage.left + stage.width * 0.73, y: stage.top + stage.height * 0.62 }
        flyMotes(from, document.querySelector('.compact-gold'), '#ffd166', 6)
        flyMotes(from, document.querySelector('.player-card .xp-mini'), '#8ec5ff', 5)
      }, 380)
    }
    const plan = autoContinuePlan({ isCorrect, outcome: r.outcome, floorCleared: r.outcome === 'victory' && isFinalFight(run.kill), setting: settings.autoContinue, masteryLevel: after })
    const masteryNote = !entry ? 'New word — added to your wordbook'
      : after > before ? (after >= MAX_LV ? 'Mastered!' : `Level up! Now level ${after}`)
        : after < before ? `Back to level ${after} — it will return for review`
          : isCorrect ? (after >= MAX_LV ? 'Mastered — keep it sharp' : 'One more correct in a row to level up') : 'Review this one — it will come back'
    const exchange: CombatExchange = { damage: r.damage, counter: r.counter, blocked: r.savedBySecondChance, victory: r.outcome === 'victory', combo: r.comboHit ? Math.round(bonuses.streakDmgPct * 100) : 0, weak: !isCorrect, shield: r.shieldBroken ? 'broken' : r.shieldBlocked ? 'blocked' : null, shieldLeft: r.run.shield, regrown: r.shieldRegrown, bossHeal: r.bossHealed }
    if (plan) setReveal({ chosen: option, plan, exchange })
    else setFeedback({
      correct: isCorrect, word, mastery: masteryNote, masteryUp: after > before && before >= 0, masteredNow, lv: after, chosen: option, answer: question.answer,
      title: isCorrect ? '✦ Correct!' : '↻ Not quite', foeName: foe?.enemy.name ?? 'monster', exchange
    })
    if (r.outcome === 'victory') {
      // Rewards sit in the fixed arena strip (no layout change); the counters tick up.
      const rw = r.run.reward
    }
  }

  const dismissFeedback = () => {
    setFeedback(null)
    setCaption(null)
    setTipPulse(null)
    if (run?.phase === 'fighting') { setNextCard(makeCard(save.mastery, card?.word.id ?? null)); setEliminated([]); answerLock.current = false }
  }

  const nextEnemy = () => {
    if (!run) return
    const next = advance(run, bonuses, ENEMIES)
    patch(s => ({ ...s, run: next }))
    setNextCard(makeCard(save.mastery, card?.word.id ?? null, canListen, next)); setEliminated([]); setFeedback(null); answerLock.current = false
    setCaption(null)
    if (isBoss(next.floor, next.kill)) {
      // The full intro card only the first time you meet each boss; later floors just show the BOSS tag
      const id = bossIdFor(next.floor)
      if (!save.habit.bossesMet.includes(id)) { setBossIntro(id); patch(s => ({ ...s, habit: { ...s.habit, bossesMet: [...s.habit.bossesMet, id] } })) }
    }
    sceneRef.current?.resetMonster()
    if (next.floor > run.floor) { setFloorBanner(`FLOOR ${next.floor}`); window.setTimeout(() => setFloorBanner(''), 1800); setFloorStats(emptyStats()) }
  }

  /** Leave the in-place reveal of a right answer: next question, or next monster after a kill. */
  const advanceAuto = () => {
    if (!reveal) return
    const mode = reveal.plan.mode
    setReveal(null)
    if (mode === 'enemy') nextEnemy()
    else { setCaption(null); setNextCard(makeCard(save.mastery, card?.word.id ?? null)); setEliminated([]); answerLock.current = false }
  }
  // The reveal runs on a timer; it waits while a popup, drawer or the menu is open.
  const blockingOpen = explain !== null || showBag || showWords || menuOpen || lootReveal !== null || bossIntro !== null || introQueue.length > 0
  useEffect(() => {
    if (!reveal || blockingOpen) return
    const t = window.setTimeout(advanceAuto, reveal.plan.delay)
    return () => window.clearTimeout(t)
    /* eslint-disable-next-line */
  }, [reveal, blockingOpen])

  const equipItem = (name: string) => {
    if (!run) return
    const next = equipGear(run, name, GEAR, bonuses)
    if (!next) return
    patch(s => ({ ...s, run: next }))
    setSelectedGearName(null)
    setSelectedGearSlot(null)
  }

  const usePotion = () => {
    if (!run || feedback || reveal) return
    const next = drinkPotion(run, bonuses, GEAR)
    if (!next) return
    patch(s => ({ ...s, run: next }))
    setCaption({ side: 'hero', kind: 'heal', text: `+${next.hp - run.hp} HP` })
  }

  const useHint = () => {
    if (!run || !card || feedback || reveal || run.hintsLeft < 1 || run.phase !== 'fighting') return
    const wrong = card.question.options.filter(o => o !== card.question.answer && !eliminated.includes(o))
    if (wrong.length <= 1) return
    setEliminated(e => [...e, shuffle(wrong)[0]])
    patch(s => ({ ...s, run: s.run && { ...s.run, hintsLeft: s.run.hintsLeft - 1 } }))
  }

  const endRun = () => {
    if (!run) return
    setReveal(null)
    forcedWord.current = null
    const { meta, summary } = bankRun(save.meta, run)
    patch(s => ({ ...s, meta, run: null, lastRun: summary }))
    setCampMsg(''); setFeedback(null); setCard(null); setNoCard(false); setShowBag(false); setShowWords(false); answerLock.current = false
    setSummary(null); setLevelUp(null); setLootReveal(null); setBossIntro(null)
  }

  const startRun = () => {
    setReveal(null)
    const fresh = newRun(bonuses, GEAR, ENEMIES)
    patch(s => ({ ...s, run: fresh }))
    setFloorStats(emptyStats()); setRunStats(emptyStats()); setSummary(null)
    setNextCard(makeCard()); setEliminated([]); setFeedback(null); setCampMsg(''); answerLock.current = false
  }

  // ---- daily warm-up -----------------------------------------------------------------------
  const today = localDay()
  const warm = { available: warmupAvailable(save.habit, save.mastery, today), done: save.habit.warmupDay === today, words: pickWarmup(save.mastery, today) }
  const startWarmup = () => { setCampMsg(''); setWarmup(pickWarmup(save.mastery, today)) }
  const warmupAnswer = (id: string, isCorrect: boolean) => {
    const mastery = updateMastery(save.mastery, id, isCorrect)
    let habit = recordPlay(save.habit, localDay()); if (isCorrect) habit = recordCorrect(habit)
    const earned = newBadges(habit, contextFor(mastery, habit, save.meta.bestFloor, save.meta.runs))
    if (earned.length) { habit = { ...habit, badges: [...habit.badges, ...earned.map(b => b.id)] }; setToast(`🏅 New badge: ${earned.map(b => b.name).join(', ')}`) }
    patch(s => ({ ...s, mastery, habit }))
  }
  const warmupDone = (correct: number) => {
    const gold = correct * WARMUP_GOLD_PER_CORRECT
    patch(s => ({ ...s, meta: { ...s.meta, gold: s.meta.gold + gold }, habit: { ...s.habit, warmupDay: localDay() } }))
    setWarmup(null); setCampMsg(`Warm-up done: ${correct} right, +${gold} gold.`)
  }

  const buy = (id: string) => {
    const meta = buyUpgrade(save.meta, id)
    if (!meta) return
    patch(s => ({ ...s, meta }))
    setCampMsg(`Bought ${nodeById(id)?.name}!`)
  }

  const exportProgress = () => {
    try {
      const blob = new Blob([serializeBackup(save)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `hanzi-hunters-progress-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      setCampMsg('Progress exported. Keep the file somewhere safe.')
    } catch { setCampMsg('Could not export on this browser.') }
  }
  const importProgress = async (file: File) => {
    const restored = parseBackup(await file.text().catch(() => ''))
    if (!restored) { setCampMsg('That file is not a Hanzi Hunters progress file.'); return }
    if (!window.confirm(`Replace your current progress with the file? (${Object.keys(restored.mastery).length} words, ${restored.meta.gold} gold banked, ${restored.meta.upgrades.length} upgrades)`)) return
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(restored)) } catch { setCampMsg('Could not write the save.'); return }
    window.location.reload()
  }

  const resetAll = () => {
    if (!window.confirm('Delete ALL progress — upgrades, gold and word mastery — and start over?')) return
    try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
    const fresh = sanitizeSave(null)
    setSave({ ...fresh, run: newRun(computeBonuses([]), GEAR, ENEMIES) })
    setReveal(null); setNextCard(null); setNoCard(false); setFeedback(null); setEliminated([]); setCampMsg(''); answerLock.current = false
  }

  // ---- camp -----------------------------------------------------------------------------
  const menu = menuOpen ? <MenuSheet settings={settings} onChange={setSettings} hasVoice={hasVoice} fullscreen={fs} outdated={isOutdated(latestBuild)} onUpdate={refreshApp} onExport={exportProgress} onImport={importProgress} onClose={() => setMenuOpen(false)} tools={run ? { potions: run.potions, words: seenCount(save.mastery), onGear: () => { setMenuOpen(false); toggleGear() }, onWords: () => { setMenuOpen(false); setShowWords(true); setShowBag(false) } } : undefined} /> : null
  const topbar = (
    <header className="topbar">
      <div className="brand"><span className="brand-mark">HH</span><div><strong>HANZI HUNTERS</strong><small>THE FIRST DESCENT</small></div></div>
      <div className="top-stats">
        {run ? <><span>✦ LVL {run.level}</span><span>🪙 {run.gold} G</span></> : <span>🪙 {save.meta.gold} G</span>}
        <button className="chip-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Settings">⚙</button>
      </div>
    </header>
  )
  if (!run || !stats || !foe) {
    return (
      <main className="app-shell in-camp">
        {topbar}
        {warmup
          ? <WarmupScreen words={warmup} mastery={save.mastery} clozeEligible={sentenceCheck(save.mastery)} canListen={canListen} speakWord={h => speak(h, true)} sfx={n => feel(n)} onAnswer={warmupAnswer} onDone={warmupDone} onExit={() => setWarmup(null)} />
          : <CampScreen save={save} course={courseLine(courseStatus(courseFor()))} warmup={warm} onWarmup={startWarmup} onBuy={buy} onStart={startRun} onReset={resetAll} message={campMsg} outdated={isOutdated(latestBuild)} onUpdate={refreshApp} onExport={exportProgress} onImport={importProgress} />}
        <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.2</span><span>Die. Learn. Return stronger.</span></footer>
      {menu}
      </main>
    )
  }

  // ---- battle ---------------------------------------------------------------------------
  if (!card) {
    // Nothing to ask yet: either the introduction cards are about to show, or the content cannot produce a fair question.
    const plan = introPlanFor(save.mastery)
    const problem = introQueue.length === 0 && run.phase === 'fighting' && (noCard || (seenCount(save.mastery) === 0 && plan.ids.length === 0))
    return (
      <main className="app-shell">
        {topbar}
        {problem && <section className="content-error" role="alert">
          <h2>No words to practise</h2>
          <p>{seenCount(save.mastery) === 0
            ? `The course “${ACTIVE_CURRICULUM.title}” has no word that can be introduced.`
            : 'None of the words you know can be asked as a fair question right now.'}</p>
          <p className="hint-text">This is a content or configuration problem, not something you did. Your progress is safe. If you maintain this game: run <code>npm run validate:content</code> and check <code>src/content/curricula.json</code> and <code>words.json</code>. ({plan.reason}: {plan.detail})</p>
          <button className="bar-btn main" onClick={endRun}>Back to camp</button>
        </section>}
        {introQueue.length > 0 && <NewWordCard id={introQueue[0]} index={introTotal - introQueue.length + 1} total={introTotal} lessonLine={introCardLine(courseFor(), introQueue[0])} muted={settings.muted} onSpeak={h => speak(h, true)} onMore={setExplain} onGotIt={introGotIt} />}
        {explain !== null && <ExplainModal id={explain} onClose={closeExplain} onOpen={setExplain} onSpeak={pressSpeaker} />}
        {menu}
      </main>
    )
  }
  const { word, question } = card
  const entry = save.mastery[word.id]
  const canSpeak = audioReliable(word, WORDS)
  const revealed = !!feedback
  const fighting = run.phase === 'fighting'
  const revealing = !!reveal   // a right answer is being shown in place before the game moves on
  const show = { hanzi: question.show.hanzi || revealed || revealing, pinyin: question.show.pinyin || revealed || revealing, meaning: question.show.meaning || revealed || revealing }
  const showCard = (fighting && !feedback) || revealing || !!feedback
  // Each field of the word card has its OWN fixed slot. A hidden field shows the same placeholder; the asked one is highlighted.
  const slot = (shown: boolean, asked: boolean) => (shown ? 'on' : asked ? 'ask' : 'dim')
  const lastOfFloor = run.kill + 1 >= ENEMIES_PER_FLOOR
  const pips = entry ? entry.lv : -1
  const equippedAttack = equipped.reduce((n, item) => n + item.attack, 0)
  const equippedHp = equipped.reduce((n, item) => n + item.hp, 0)
  const lootChance = Math.min(0.95, 0.5 + bonuses.lootPct + (foe.boss ? 0.3 : 0))
  const ownedUpgrades = save.meta.upgrades.map(id => nodeById(id)).filter((node): node is NonNullable<typeof node> => !!node)
  const toggleGear = () => {
    setShowBag(v => !v); setShowWords(false)
    setSelectedGearSlot(null); setSelectedGearName(null)
  }

  return (
    <main className={`app-shell in-battle`}>
      {topbar}

      <section className="hero-strip">
        <div><p className="eyebrow">FLOOR {pad(run.floor)} · ENEMY {run.kill + 1}/{ENEMIES_PER_FLOOR}{foe.boss ? ' · BOSS' : ''}</p><h1>The Mosslight Cavern</h1><p className="subtitle">Every word is a weapon. Every run makes you stronger.</p></div>
        <div className="progress-chip"><span>📖</span><strong>{masteredCount(save.mastery)}<small> / {WORDS.length} mastered</small></strong></div>
      </section>

      <header className="compact-header" aria-label="Dungeon progress">
        <div><strong>FLOOR {pad(run.floor)}</strong><small className="floor-path" role="img" aria-label={`Enemy ${run.kill + 1} of ${ENEMIES_PER_FLOOR}${foe.boss ? ', boss' : ''}`}>{Array.from({ length: ENEMIES_PER_FLOOR }, (_, i) => <i key={i} className={`${i < run.kill || (i === run.kill && run.phase === 'victory') ? 'done' : i === run.kill ? 'cur' : ''} ${i === ENEMIES_PER_FLOOR - 1 ? (isBoss(run.floor, i) ? 'boss' : '') : ''}`} />)}</small></div>
        <span className="compact-gold" aria-label={`${run.gold} gold`}>🪙 {run.gold}</span>
        <button className="chip-btn" onClick={() => setMenuOpen(true)} aria-label="Menu">☰</button>
      </header>
      <section className="game-layout">
        <div className="left-column">
          <div className="scene-frame">
            <div className="scene-label"><span className="live-dot"></span><span className="scene-where"><span className="scene-floor"><span className="sf-wide">F{run.floor} · {run.kill + 1}/{ENEMIES_PER_FLOOR}</span><span className="sf-narrow">F{run.floor}·{run.kill + 1}/{ENEMIES_PER_FLOOR}</span></span><span className="scene-gold">🪙 {run.gold}</span></span>
              <div className="scene-actions">
                <button className="chip-btn" onClick={usePotion} disabled={run.potions < 1 || run.hp >= stats.maxHp || !fighting || !!feedback || revealing} aria-label={`Use potion, ${run.potions} left`}>🧪<b>{run.potions}</b></button>
                <button className="chip-btn" onClick={() => { setShowBag(v => { const next = !v; if (next) { setSelectedGearSlot(null); setSelectedGearName(null) } return next }) }} aria-label="Character stats">⚔️</button>
                <button className="chip-btn" onClick={() => setShowWords(v => !v)} aria-label="Wordbook">📚<b>{seenCount(save.mastery)}</b></button>
                <button className="chip-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Settings">⚙</button>
              </div></div>
            <div className="arena-stage">
              <div className="phaser-mount" ref={mountRef} aria-label="Pixel art dungeon battle arena" />
              <div className="arena-hud" aria-hidden={!caption && !floorBanner}>
                {run.phase === 'fighting' || run.phase === 'victory' ? <ComboBadge streak={run.streak} bonusPct={Math.round(bonuses.streakDmgPct * 100)} /> : null}
                {foe.boss && hasShield(foe.boss) && (run.shield > 0 || foe.boss === 'scribe') && run.phase === 'fighting' && <div className="boss-shield" role="img" aria-label={`${foe.boss === 'scribe' ? 'Seals' : 'Shield'}: ${run.shield} of ${shieldFor(run.floor)} left`}>{foe.boss === 'scribe' ? 'INK SEALS' : 'SHIELD'} {Array.from({ length: shieldFor(run.floor) }, (_, i) => <i key={i} className={i < run.shield ? '' : 'off'} />)}</div>}
                {foe.boss === 'wraith' && run.phase === 'fighting' && bossPhase(run, foe.hp) === 2 && <div className="boss-shield echo" role="img" aria-label="Echo phase: your weak spot comes back">ECHO</div>}
                {foe.boss === 'trickster' && run.phase === 'fighting' && <div className="boss-shield echo" role="img" aria-label={bossPhase(run, foe.hp) === 2 ? 'A wrong answer heals it a lot' : 'A wrong answer heals it'}>{bossPhase(run, foe.hp) === 2 ? 'MISS = HEAL ×2' : 'MISS = HEAL'}</div>}
                {run.phase === 'victory' && <span className="arena-banner win">{foe.boss ? 'BOSS DEFEATED' : 'VICTORY'}</span>}
                {run.phase === 'defeat' && <span className="arena-banner lose">YOU DIED</span>}
                {floorBanner && run.phase === 'fighting' && <span className="arena-banner floor">{floorBanner}</span>}
                {levelUp && <div className="arena-levelup" role="status"><span className="lu-badge">LEVEL UP</span><strong>LV {levelUp.from} → {levelUp.to}</strong><small>{[levelUp.hp > 0 && `+${levelUp.hp} max HP`, levelUp.attack > 0 && `+${levelUp.attack} attack`].filter(Boolean).join(' · ') || 'Stronger'}</small></div>}
                {caption && run.phase !== 'defeat' && <span className={`arena-caption ${caption.side} ${caption.kind}`} role="status">{caption.text}</span>}
              </div>
            </div>
            <div className="combatant-row arena-combatants">
              <div className="combatant player-card">
                <div className="bar-label"><span>Lv {run.level}</span><span>{run.hp} / {stats.maxHp}</span></div><div className="health-track"><div className={`health-fill player-fill ${levelUp ? "hp-glow" : ""}`} style={{ width: `${Math.max(0, run.hp) / stats.maxHp * 100}%` }} /></div><div className="xp-mini" aria-label="experience"><div style={{ width: `${Math.min(100, run.xp / xpForLevel(run.level) * 100)}%` }} /></div>
              </div>
              <div className="combatant enemy-card">
                <div className="bar-label"><span>{foe.enemy.name}</span><span>{run.enemyHp} / {foe.hp}</span></div><div className="health-track"><div className="health-fill enemy-fill" style={{ width: `${Math.max(0, run.enemyHp) / foe.hp * 100}%` }} /></div>
              </div>
            </div>
          </div>
          {showBag && <section className="drawer character-drawer">
            <div className="drawer-title"><span>CHARACTER · GEAR & STATS</span><button onClick={() => { setShowBag(false); setSelectedGearSlot(null); setSelectedGearName(null) }} aria-label="Close character inventory">✕</button></div>
            <>
            <div className="character-summary">
              <div className="character-stat-card level-stat-card">
                <small>LEVEL</small><strong>{run.level}</strong>
                <div className="stat-progress-track"><span style={{ width: `${Math.min(100, run.xp / xpForLevel(run.level) * 100)}%` }} /></div>
                <span className="stat-context">{run.xp} / {xpForLevel(run.level)} XP to next level</span>
              </div>
              <div className="character-stat-card attack-stat-card">
                <small>ATTACK</small><strong>⚔ {stats.attack}</strong>
                <span className="stat-context">Base {5 + run.level - 1} <i>·</i> Upgrades +{bonuses.attack} <i>·</i> Gear +{equippedAttack}</span>
              </div>
              <div className="character-stat-card hp-stat-card">
                <small>MAX HP</small><strong>♥ {stats.maxHp}</strong>
                <span className="stat-context">{run.hp} current <i>·</i> +{bonuses.maxHp + equippedHp} bonus</span>
              </div>
            </div>
            <section className="character-section active-bonuses-section">
              <div className="character-section-title">ACTIVE BONUSES <span>EXPAND FOR SOURCES</span></div>
              <div className="bonus-accordion-list">
                <details className="bonus-accordion">
                  <summary><span className="bonus-accordion-icon">🛡️</span><b>Defense</b><strong>{bonuses.armor + equipped.reduce((n, item) => n + item.armor, 0)} armor · +{bonuses.maxHp + equipped.reduce((n, item) => n + item.hp, 0)} HP</strong></summary>
                  <div className="bonus-sources">
                    {UPGRADES.filter(node => save.meta.upgrades.includes(node.id) && (node.fx.armor || node.fx.maxHp)).map(node => <div key={node.id}><span>{node.icon} {node.name}</span><b>{node.fx.armor ? `+${node.fx.armor} armor` : ''}{node.fx.armor && node.fx.maxHp ? ' · ' : ''}{node.fx.maxHp ? `+${node.fx.maxHp} max HP` : ''}</b></div>)}
                    {equipped.filter(item => item.armor || item.hp).map(item => <div key={item.name}><span>{item.icon} {item.name}</span><b>{item.armor ? `+${item.armor} armor` : ''}{item.armor && item.hp ? ' · ' : ''}{item.hp ? `+${item.hp} max HP` : ''}</b></div>)}
                    {!bonuses.armor && !bonuses.maxHp && !equipped.some(item => item.armor || item.hp) && <p>No armor or health bonuses are active.</p>}
                  </div>
                </details>
                <details className="bonus-accordion">
                  <summary><span className="bonus-accordion-icon">✨</span><b>XP gain</b><strong>+{Math.round((bonuses.xpPct + equipped.reduce((n, item) => n + item.xpPct, 0)) * 100)}%</strong></summary>
                  <div className="bonus-sources">
                    {UPGRADES.filter(node => save.meta.upgrades.includes(node.id) && node.fx.xpPct).map(node => <div key={node.id}><span>{node.icon} {node.name}</span><b>+{Math.round((node.fx.xpPct ?? 0) * 100)}%</b></div>)}
                    {equipped.filter(item => item.xpPct).map(item => <div key={item.name}><span>{item.icon} {item.name}</span><b>+{Math.round(item.xpPct * 100)}%</b></div>)}
                  </div>
                </details>
                <details className="bonus-accordion">
                  <summary><span className="bonus-accordion-icon">🪙</span><b>Gold gain</b><strong>+{Math.round(bonuses.goldPct * 100)}%{equipped.reduce((n, item) => n + item.goldFlat, 0) ? ` + ${equipped.reduce((n, item) => n + item.goldFlat, 0)} per win` : ''}</strong></summary>
                  <div className="bonus-sources">
                    {UPGRADES.filter(node => save.meta.upgrades.includes(node.id) && node.fx.goldPct).map(node => <div key={node.id}><span>{node.icon} {node.name}</span><b>+{Math.round((node.fx.goldPct ?? 0) * 100)}%</b></div>)}
                    {equipped.filter(item => item.goldFlat).map(item => <div key={item.name}><span>{item.icon} {item.name}</span><b>+{item.goldFlat} gold per win</b></div>)}
                  </div>
                </details>
                <details className="bonus-accordion">
                  <summary><span className="bonus-accordion-icon">💚</span><b>Recovery</b><strong>{bonuses.healOnKill} HP / win · +{bonuses.potionHeal} potion</strong></summary>
                  <div className="bonus-sources">
                    {UPGRADES.filter(node => save.meta.upgrades.includes(node.id) && (node.fx.healOnKill || node.fx.potionHeal || node.fx.startPotions)).map(node => <div key={node.id}><span>{node.icon} {node.name}</span><b>{[node.fx.healOnKill ? `Heal ${node.fx.healOnKill} HP after victory` : '',node.fx.potionHeal ? `+${node.fx.potionHeal} potion healing` : '',node.fx.startPotions ? `+${node.fx.startPotions} starting potion` : ''].filter(Boolean).join(' · ')}</b></div>)}
                    <div><span>🧪 Current potions</span><b>{run.potions} remaining · heal {12 + bonuses.potionHeal} HP</b></div>
                  </div>
                </details>
                <details className="bonus-accordion">
                  <summary><span className="bonus-accordion-icon">🎒</span><b>Loot chance</b><strong>+{Math.round(bonuses.lootPct * 100)}% base chance</strong></summary>
                  <div className="bonus-sources">
                    {UPGRADES.filter(node => save.meta.upgrades.includes(node.id) && node.fx.lootPct).map(node => <div key={node.id}><span>{node.icon} {node.name}</span><b>+{Math.round((node.fx.lootPct ?? 0) * 100)}%</b></div>)}
                  </div>
                </details>
              </div>
            </section>
            <section className="character-section gear-overview">
              <div className="character-section-title">EQUIPPED GEAR <span>{equipped.length}/3</span></div>
              <div className="gear-equipped-list">
                {(['Weapon', 'Armor', 'Accessory'] as const).map(slot => {
                  const item = GEAR.find(g => g.name === run.loadout[slot])
                  return <div className={`gear-equipped-row ${item ? 'is-filled' : 'is-empty'}`} key={slot}>
                    <span className="gear-equipped-icon">{item?.icon ?? '◇'}</span>
                    <div className="gear-equipped-info"><b>{item?.name ?? 'Empty slot'}</b><small>{slot.toUpperCase()}</small></div>
                    <span className="gear-equipped-effect">{item?.bonus ?? 'Find gear to equip'}</span>
                  </div>
                })}
              </div>

            </section>
            <section className="character-section upgrade-passives-section">
              <div className="character-section-title">UPGRADE PASSIVES <span>{ownedUpgrades.length} UNLOCKED</span></div>
              {ownedUpgrades.length ? <>
                <div className="upgrade-passive-list">{ownedUpgrades.slice(0, 3).map(node => <div className="upgrade-passive-row" key={node.id}><span className="upgrade-passive-icon">{node.icon}</span><div><b>{node.name}</b><small>{node.branch} · Tier {node.tier}</small></div><span className="upgrade-passive-effect">{node.desc}</span><span className="bonus-source upgrade-source">ACTIVE</span></div>)}</div>
                {ownedUpgrades.length > 3 && <details className="more-passives-details"><summary>Show all passives <span>{ownedUpgrades.length - 3} more</span></summary><div className="upgrade-passive-list">{ownedUpgrades.slice(3).map(node => <div className="upgrade-passive-row" key={node.id}><span className="upgrade-passive-icon">{node.icon}</span><div><b>{node.name}</b><small>{node.branch} · Tier {node.tier}</small></div><span className="upgrade-passive-effect">{node.desc}</span><span className="bonus-source upgrade-source">ACTIVE</span></div>)}</div></details>}
              </> : <p className="hint-text">Unlock upgrades at camp to gain passive effects.</p>}
              <details className="character-details run-resources-details">
                <summary>Run resources & other effects <span>VIEW</span></summary>
                <div className="character-section">
                  <div className="bonus-line"><span>🧪 Potions<small>Available now</small></span><b>{run.potions} remaining · heal {12 + bonuses.potionHeal} HP</b></div>
                  <div className="bonus-line"><span>💡 Hints<small>Per fight</small></span><b>{run.hintsLeft} remaining</b></div>
                  <div className="bonus-line"><span>🔁 Second chance<small>Per fight</small></span><b>{run.secondLeft} remaining</b></div>
                  <div className="bonus-line"><span>🎒 Loot chance<small>Current enemy</small></span><b>{Math.round(lootChance * 100)}%</b></div>
                </div>
              </details>
            </section>
            </>
          </section>}
          {showWords && <div className="drawer"><div className="drawer-title">WORDBOOK <button onClick={() => setShowWords(false)} aria-label="Close wordbook">×</button></div><div className="wordbook-grid">{WORDS.filter(w => save.mastery[w.id] && !(fighting && !feedback && card?.word.id === w.id)).sort((a, b) => save.mastery[b.id].lv - save.mastery[a.id].lv).map(w => { const lv = save.mastery[w.id].lv; const rich = hasDetails(w); const body = <><strong className={`wb-len${lenClass(w.hanzi)}`}>{w.hanzi}</strong><span>{w.pinyin}</span><small>{w.meaning}</small>{w.kind === 'particle' && <u className="kind-tag">particle</u>}<i className="pips" aria-label={lv >= MAX_LV ? 'mastered' : `level ${lv}`}>{Array.from({ length: MAX_LV }, (_, k) => <u key={k} className={k < lv ? 'on' : ''} />)}</i>{rich && <em className="tip-badge" aria-hidden>💡</em>}</>; return <button className={`wordbook-word has-tip lv${lv}`} key={w.id} onClick={() => setExplain(w.id)} aria-label={`${w.hanzi}, ${w.pinyin}, ${w.meaning}. Open details`}>{body}</button> })}{seenCount(save.mastery) === 0 && <p className="hint-text">Words you meet in battle appear here with their mastery level.</p>}</div></div>}
        </div>

        <div className="right-column">
          <section className={`question-panel`}>
            <div className={`question-title ${run.phase}`}><div className="title-text"><h2>{fighting || revealing || feedback ? (question.kind === 'intro' && !feedback && !revealing ? 'Learn this word' : question.text.replace(/^New word!\s*/i, '')) : run.phase === 'victory' ? (lastOfFloor ? '⚔️ Floor cleared!' : '⚔️ Victory!') : '💀 You have fallen'}</h2></div></div>

            {/* The word card never leaves its slot. Feedback replaces the choices below it. */}
            {showCard && <>
              <div className={`stage stage-card ${revealing ? 'ok' : feedback ? (feedback.correct ? 'ok' : 'wrong') : ''}`} onClick={revealing ? advanceAuto : undefined}>
                <div className="card-strip">
                <span className="stage-badge">{pips < 0 ? 'NEW WORD' : pips >= MAX_LV ? 'MASTERED' : `WORD LV ${pips}`}<i className="pips">{Array.from({ length: MAX_LV }, (_, k) => <u key={k} className={k < pips ? 'on' : ''} />)}</i></span>
                <div className="corner-btns">
                  {hasDetails(word) && (question.cloze ? revealed || revealing : show.hanzi && show.pinyin && show.meaning) && <button className={`speak-btn tip-btn ${tipPulse === word.id ? 'pulse' : ''}`} onClick={e => { e.stopPropagation(); setExplain(word.id) }} aria-label={`More about ${word.hanzi}`}>💡</button>}
                  {canSpeak && <button className={`speak-btn ${question.audio && !settings.muted ? 'cue' : ''} ${settings.muted ? 'muted' : ''}`} onClick={e => { e.stopPropagation(); pressSpeaker(word.hanzi) }} aria-label={settings.muted ? 'Sound is off: tap to turn on' : 'Hear the word'}>{settings.muted ? '🔇' : '🔊'}</button>}
                </div>
                </div>
                {ceremony === word.id && (feedback || revealing) && <div className="confetti" aria-hidden="true">{Array.from({ length: 22 }, (_, k) => <i key={k} style={{ left: `${4 + ((k * 37) % 92)}%`, animationDelay: `${(k % 7) * 60}ms`, background: ['#ffd166', '#8ee0a9', '#6fb5e8', '#ff8a3d'][k % 4] }} />)}</div>}
                {question.cloze ? <div className={`cloze-block cloze-${question.cloze.zh.length <= 9 ? 's' : question.cloze.zh.length <= 13 ? 'm' : 'l'}`} lang="zh">
                  <div className="cloze-zh">{fillBlank(question.cloze.zh, revealed || revealing ? word.hanzi : null)}</div>
                  <div className="cloze-py">{fillBlank(question.cloze.pinyin, revealed || revealing ? word.pinyin : null)}</div>
                  <div className="cloze-en">{question.cloze.en}</div>
                </div> : <>
                  <div className={`slot slot-hanzi ${slot(show.hanzi, question.ask === 'hanzi')} len${lenClass(word.hanzi)}`}>{show.hanzi ? word.hanzi : '?'}</div>
                  <div className={`slot slot-pinyin ${slot(show.pinyin, question.ask === 'pinyin')} len${lenClass(word.pinyin)}`}>{show.pinyin ? word.pinyin : '? ? ?'}</div>
                  <div className={`slot slot-meaning ${slot(show.meaning, question.ask === 'meaning')} ${word.meaning.length > 24 ? 'meaning-long' : ''}`}>{show.meaning ? word.meaning : '“ ? ”'}</div>
                </>}
              </div>
              {feedback && !revealing ? (
                <div className={`answer-list answer-feedback ${feedback.correct ? 'is-correct' : 'is-incorrect'} ${feedback.masteredNow ? 'is-mastered' : ''}`} role="status" aria-live="polite">
                  <div className="result-line">
                    <strong>{feedback.correct ? '✓ Correct' : 'Not quite'}{feedback.correct && feedback.word.variants.length > 0 && <small className="result-also"> also {feedback.word.variants.join(', ')}</small>}</strong>
                  </div>
                  {!feedback.correct && <p className="result-answer">Answer: <b>{feedback.answer}</b> <span>(you chose <s>{feedback.chosen}</s>)</span></p>}
                  <p className="result-note">{feedback.correct ? (card?.question.cloze?.note ?? feedback.word.note) : (card?.question.cloze?.why[feedback.chosen] ?? feedback.word.note)}</p>
                </div>
              ) : <div className="answer-list">{question.options.map((option, i) => {
                const gone = eliminated.includes(option)
                return <button key={`${option}-${i}`} className={`answer-btn ${option.length > 36 ? 'xlong' : option.length > 22 ? 'long' : ''} ${question.optionsAreHanzi ? 'opt-hanzi' : ''} ${question.ask === 'pinyin' ? 'opt-pinyin' : ''} ${gone ? 'answer-gone' : ''} ${revealing && option === question.answer ? 'answer-correct' : ''}`} disabled={gone || revealing} onClick={() => answerQuestion(option)}><span className="answer-key">{String.fromCharCode(65 + i)}</span><span className="answer-text">{gone ? '—' : option}</span></button>
              })}</div>}
            </>}

            {/* Only terminal states without answer feedback use the fallback stage. */}
            {(!fighting && !feedback) && !revealing && <div className={`stage stage-wide stage-fb ${run.phase === 'victory' ? 'good' : 'bad'}`}>
              <div className="stage-end"><div className="end-banner">{run.phase === 'victory' ? (lastOfFloor ? '🏆' : '⚔️') : '💀'}</div></div>
              {run.phase === 'defeat' && <p className="fb-defeat">You fell on floor <b>{run.floor}</b> with <b>{run.gold} gold</b> — banked for upgrades. Next run: level 1, no gear. Word mastery stays.</p>}
            </div>}

            <div className="action-bar">
              {revealing
                ? <button className="bar-btn ghost auto-continue" data-kind="continue" onClick={advanceAuto}><span>✓ Correct</span><span>Tap to continue →</span></button>
                : fighting && !feedback
                ? <>
                    {bonuses.hints > 0 && <button className="bar-btn ghost hint-btn" onClick={useHint} disabled={run.hintsLeft < 1} aria-label={`Hint, ${run.hintsLeft} left this fight`}>💡 Hint <b>{run.hintsLeft}</b></button>}
                    {run.potions > 0 && <button className="bar-btn ghost potion-btn" onClick={usePotion} disabled={run.hp >= stats.maxHp} aria-label={`Use potion, ${run.potions} left`}>🧪 Potion <b>{run.potions}</b></button>}
                  </>
                : <button className="bar-btn main" data-kind={fighting ? 'continue' : run.phase === 'victory' ? 'next' : 'camp'} onClick={fighting ? dismissFeedback : run.phase === 'victory' ? (lastOfFloor ? () => setSummary('floor') : nextEnemy) : () => setSummary('defeat')}>
                    {fighting ? 'Continue' : run.phase === 'victory' ? (lastOfFloor ? 'Floor summary' : 'Next enemy') : 'Go to camp'} <span>{run.phase === 'defeat' && !fighting ? '⛺' : '→'}</span>
                  </button>}
            </div>
          </section>
          {toast && <div className="toast"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss">×</button></div>}
          <section className="build-panel"><div className="build-title"><div><span className="eyebrow">THIS RUN</span><h3>Build & Progress</h3></div><span className="level-badge">LV {run.level}</span></div><div className="xp-line"><span>Experience</span><span>{run.xp} / {xpForLevel(run.level)} XP</span></div><div className="xp-track"><div style={{ width: `${Math.min(100, run.xp / xpForLevel(run.level) * 100)}%` }} /></div><div className="build-grid"><div><span className="build-icon">⚔️</span><small>Attack</small><strong>{stats.attack}</strong></div><div><span className="build-icon">🛡️</span><small>Gear found</small><strong>{run.gear.length}</strong></div><div><span className="build-icon">📖</span><small>Words mastered</small><strong>{masteredCount(save.mastery)}</strong></div></div><button className="reset-btn" onClick={resetAll}>Reset ALL progress</button></section>
        </div>
      </section>
      <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.2</span><span>Die. Learn. Return stronger.</span></footer>
      {isOutdated(latestBuild) && !updateDismissed && <div className="update-banner" role="status"><span>A new version is available. Your progress is kept.</span><button onClick={refreshApp}>Update</button><button className="x" onClick={() => setUpdateDismissed(true)} aria-label="Dismiss">×</button></div>}
        {summary && <SummaryModal kind={summary} floor={run.floor} stats={summary === 'floor' ? floorStats : runStats} gold={run.gold} onClose={() => setSummary(null)} onContinue={() => { if (summary === 'floor') { setSummary(null); nextEnemy() } else endRun() }} />}
      {introQueue.length > 0 && <NewWordCard id={introQueue[0]} index={introTotal - introQueue.length + 1} total={introTotal} lessonLine={introCardLine(courseFor(), introQueue[0])} muted={settings.muted} onSpeak={h => speak(h, true)} onMore={setExplain} onGotIt={introGotIt} />}
      {bossIntro && <BossIntro boss={bossIntro} floor={run.floor} onClose={() => setBossIntro(null)} />}
      {lootReveal && (() => { const item = GEAR.find(g => g.name === lootReveal.name); return item ? <LootReveal item={item} current={GEAR.find(g => g.name === lootReveal.current) ?? null} choice={lootReveal.choice} onEquip={() => equipItem(item.name)} onClose={() => setLootReveal(null)} /> : null })()}
      {menu}
      {explain !== null && <ExplainModal id={explain} hidden={fighting && !feedback && !revealing ? card?.word.id : undefined} onClose={closeExplain} onOpen={setExplain} onSpeak={pressSpeaker} />}
    </main>
  )
}
