import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { PixelScene } from './game/PixelScene'
import CampScreen from './CampScreen'
import ExplainModal from './ExplainModal'
import MenuSheet from './MenuSheet'
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, type Settings } from './settings'
import { autoContinuePlan, type AutoPlan } from './game/flow'
import { hasExplanation } from './content'
import { fetchLatestBuild, isOutdated, refreshApp, type BuildInfo } from './appInfo'
import { parseBackup, serializeBackup } from './game/backup'
import { ENEMIES, GEAR, WORDS, type Word } from './data'
import { MAX_LV, masteredCount, pickWord, seenCount, updateMastery } from './game/mastery'
import { buildQuestion, shuffle, type KindResult, type QKind, type Question } from './game/questions'
import {
  ENEMIES_PER_FLOOR, advance, isElite, bankRun, drinkPotion, enemyStats, equipGear, equippedGear, newRun, playerStats, resolveAnswer, xpForLevel
} from './game/rules'
import { SAVE_KEY, loadSave, sanitizeSave } from './game/save'
import type { Run, Saved } from './game/types'
import { buyUpgrade, computeBonuses, nodeById } from './game/upgrades'

type Card = { word: Word; question: Question }
type Feedback = { correct: boolean; word: Word; mastery: string; masteryUp: boolean; chosen: string; answer: string; title: string; foeName: string }

const pad = (n: number) => String(n).padStart(2, '0')

function initialSave(): Saved {
  const s = loadSave(window.localStorage)
  // Brand-new players go straight into a first run; returning players land wherever they left off.
  const brandNew = s.meta.runs === 0 && s.meta.gold === 0 && s.meta.upgrades.length === 0 && Object.keys(s.mastery).length === 0
  if (!s.run && !s.lastRun && brandNew) return { ...s, run: newRun(computeBonuses(s.meta.upgrades), GEAR, ENEMIES) }
  return s
}

/** Shrinks the text until it fits its fixed-size box (teaching notes vary from 40 to 100 characters). */
function useFitText(ref: { current: HTMLElement | null }, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      const box = el.parentElement ?? el
      let size = parseFloat(getComputedStyle(el).fontSize)
      while ((box.scrollHeight > box.clientHeight + 1 || el.scrollHeight > el.clientHeight + 1) && size > 10.5) { size -= 0.5; el.style.fontSize = `${size}px` }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
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
  const noteRef = useRef<HTMLParagraphElement | null>(null)
  const [save, setSave] = useState<Saved>(() => { try { return initialSave() } catch { return sanitizeSave(null) } })
  const [settings, setSettings] = useState<Settings>(() => { try { return loadSettings(window.localStorage) } catch { return { ...DEFAULT_SETTINGS } } })
  const [hasVoice, setHasVoice] = useState(hasChineseVoice)
  const canListen = hasVoice && !settings.muted          // muted => listening questions are never asked
  const [reveal, setReveal] = useState<{ chosen: string; plan: Exclude<AutoPlan, null> } | null>(null)   // a right answer that continues by itself
  const [menuOpen, setMenuOpen] = useState(false)
  const [newLoot, setNewLoot] = useState(false)
  const [pop, setPop] = useState<{ key: number; gold: number; xp: number } | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [eliminated, setEliminated] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [toast, setToast] = useState('')
  const [campMsg, setCampMsg] = useState('')
  const [showBag, setShowBag] = useState(false)
  const [selectedGearName, setSelectedGearName] = useState<string | null>(null)
  const [showWords, setShowWords] = useState(false)
  const [explain, setExplain] = useState<string[]>([])
  const [latestBuild, setLatestBuild] = useState<BuildInfo | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const closeExplain = useMemo(() => () => setExplain([]), [])
  useFitText(noteRef, [feedback])
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
  const enemyKey = foe ? `${foe.enemy.sprite}:${foe.elite}` : ''
  const enemyKeyRef = useRef(enemyKey)
  enemyKeyRef.current = enemyKey
  const phaseRef = useRef<Run['phase']>('fighting')
  phaseRef.current = run?.phase ?? 'fighting'
  const killRef = useRef(0)
  killRef.current = run?.kill ?? 0
  const streakRef = useRef(0)
  streakRef.current = run?.streak ?? 0

  const makeCard = (mastery = save.mastery, current: string | null = null, listen = canListen): Card => {
    // Only the very first card of a session (no current word). Not consumed here: React StrictMode runs effects twice.
    const forced = current === null && forcedWord.current ? WORDS.find(w => w.hanzi === forcedWord.current) : undefined
    const word = forced ?? pickWord(WORDS, mastery, current)
    return { word, question: buildQuestion(word, mastery[word.hanzi], WORDS, { canListen: listen, known: new Set(Object.keys(mastery)), history: kindHistory.current, kind: forced && forcedKind.current ? forcedKind.current : undefined }) }
  }
  const patch = (fn: (s: Saved) => Saved) => setSave(fn)

  // ---- one-time setup -----------------------------------------------------------------
  useEffect(() => {
    const check = () => setHasVoice(hasChineseVoice())
    check()
    try { window.speechSynthesis.addEventListener('voiceschanged', check) } catch { /* no speech support */ }
    return () => { try { window.speechSynthesis.removeEventListener('voiceschanged', check) } catch { /* ignore */ } }
  }, [])
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage unavailable */ } }, [settings])
  // Muting while a listening question is open: ask the same word as a normal question instead.
  useEffect(() => {
    if (!settings.muted || !card?.question.audio || feedback || reveal) return
    window.speechSynthesis?.cancel?.()
    setCard({ word: card.word, question: buildQuestion(card.word, save.mastery[card.word.hanzi], WORDS, { canListen: false, known: new Set(Object.keys(save.mastery)), history: kindHistory.current }) })
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
  useEffect(() => { if (!card && run) setCard(makeCard()) /* eslint-disable-next-line */ }, [inCamp])

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
      const [sprite, elite] = enemyKeyRef.current.split(':')
      if (sprite) scene.setEnemy(sprite as 'slime' | 'imp' | 'bat', elite === 'true')
      if (phaseRef.current === 'victory') { scene.hideMonster(); scene.showVictory(killRef.current >= ENEMIES_PER_FLOOR - 1 ? 'ELITE SLAIN!' : 'ENEMY SLAIN!', false) }
      scene.setCombo(streakRef.current)
      if (phaseRef.current === 'defeat') scene.showDefeat(false)
    })
    const ro = new ResizeObserver(() => game.scale.refresh())
    ro.observe(mountRef.current)
    return () => { ro.disconnect(); game.destroy(true); sceneRef.current = null }
  }, [inCamp, hasCard])

  useEffect(() => {
    const [sprite, elite] = enemyKey.split(':')
    if (sprite) sceneRef.current?.setEnemy(sprite as 'slime' | 'imp' | 'bat', elite === 'true')
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
  // The speaker button: when muted, tapping it turns sound back on (and plays the word).
  const pressSpeaker = (hanzi: string) => { if (settings.muted) setSettings(st => ({ ...st, muted: false })); speak(hanzi, true) }
  useEffect(() => { if (card?.question.audio && !feedback && !reveal) speak(card.word.hanzi) /* eslint-disable-next-line */ }, [card])

  // ---- actions --------------------------------------------------------------------------
  const answerQuestion = (option: string) => {
    if (!run || !card || answerLock.current || feedback || reveal || run.phase !== 'fighting' || eliminated.includes(option)) return
    answerLock.current = true
    sceneRef.current?.clearFloats()
    const { word, question } = card
    const entry = save.mastery[word.hanzi]
    const isCorrect = option === question.answer
    const r = resolveAnswer({
      run, bonuses, enemies: ENEMIES, allGear: GEAR, lv: entry?.lv ?? 0, isCorrect,
      roll: { drop: Math.random(), item: Math.random() }
    })
    const mastery = updateMastery(save.mastery, word.hanzi, isCorrect)
    if (question.kind !== 'intro') kindHistory.current = [...kindHistory.current, { kind: question.kind, ok: isCorrect }].slice(-16)
    const before = entry?.lv ?? -1, after = mastery[word.hanzi].lv
    sceneRef.current?.playHit('monster', r.damage, r.comboHit ? 'COMBO!' : !isCorrect ? 'WEAK HIT' : undefined)
    if (r.outcome === 'victory') { sceneRef.current?.hideMonster(); sceneRef.current?.showVictory(isElite(run.kill) ? 'ELITE SLAIN!' : 'ENEMY SLAIN!') }
    else if (r.counter > 0) sceneRef.current?.playHit('hero', r.counter)
    else if (r.savedBySecondChance) sceneRef.current?.float('hero', 'BLOCKED', '#8ed1ff')

    sceneRef.current?.setCombo(r.run.streak)
    if (r.outcome === 'defeat') sceneRef.current?.showDefeat(true)
    patch(s => ({ ...s, run: r.run, mastery }))
    const plan = autoContinuePlan({ isCorrect, outcome: r.outcome, eliteKill: r.outcome === 'victory' && isElite(run.kill), setting: settings.autoContinue, masteryLevel: after })
    const masteryNote = !entry ? 'New word added to your wordbook.'
      : after > before ? (after >= MAX_LV ? `Mastered! ${word.hanzi} is now level ${MAX_LV}.` : `Word level up! ${word.hanzi} is now level ${after}.`)
        : after < before ? `${word.hanzi} slipped back to level ${after}. It will return for review.`
          : isCorrect ? 'One more correct answer to level this word up.' : 'Review this one — it will come back.'
    if (plan) setReveal({ chosen: option, plan })
    else setFeedback({
      correct: isCorrect, word, mastery: masteryNote, masteryUp: after > before && before >= 0, chosen: option, answer: question.answer,
      title: isCorrect ? '✦ Correct!' : '↻ Not quite', foeName: foe?.enemy.name ?? 'monster'
    })
    if (r.outcome === 'victory') {
      // Rewards pop up in the scene and tick the counters; they fade on their own, so the game can keep going.
      const rw = r.run.reward
      const lines = [{ text: `+${rw.xp} XP   🪙 +${rw.gold}`, color: '#f4d58c' }]
      if (rw.levelUps > 0) lines.push({ text: `LEVEL UP!  Lv ${r.run.level}`, color: '#8ee0a9' })
      if (r.loot) lines.push({ text: `LOOT: ${r.loot.name}`, color: '#ffd166' })
      else if (r.duplicateGold) lines.push({ text: `Duplicate gear → +${r.duplicateGold} gold`, color: '#c9d6e4' })
      sceneRef.current?.popReward(lines)
      setPop({ key: Date.now(), gold: rw.gold, xp: rw.xp })
      if (r.loot) setNewLoot(true)
    }
  }

  const dismissFeedback = () => {
    setFeedback(null)
    sceneRef.current?.clearFloats()
    if (run?.phase === 'fighting') { setCard(makeCard(save.mastery, card?.word.hanzi ?? null)); setEliminated([]); answerLock.current = false }
  }

  const nextEnemy = () => {
    if (!run) return
    const next = advance(run, bonuses, ENEMIES)
    patch(s => ({ ...s, run: next }))
    setCard(makeCard(save.mastery, card?.word.hanzi ?? null)); setEliminated([]); setFeedback(null); answerLock.current = false
    sceneRef.current?.clearFloats()
    sceneRef.current?.resetMonster()
    if (next.floor > run.floor) { sceneRef.current?.float('banner', `FLOOR ${next.floor}`, '#f0cb78'); window.setTimeout(() => sceneRef.current?.clearBanner(), 1800) }
  }

  /** Leave the in-place reveal of a right answer: next question, or next monster after a kill. */
  const advanceAuto = () => {
    if (!reveal) return
    const mode = reveal.plan.mode
    setReveal(null)
    if (mode === 'enemy') nextEnemy()
    else { sceneRef.current?.clearFloats(); setCard(makeCard(save.mastery, card?.word.hanzi ?? null)); setEliminated([]); answerLock.current = false }
  }
  // The reveal runs on a timer; it waits while a popup, drawer or the menu is open.
  const blockingOpen = explain.length > 0 || showBag || showWords || menuOpen
  useEffect(() => {
    if (!reveal || blockingOpen) return
    const t = window.setTimeout(advanceAuto, reveal.plan.delay)
    return () => window.clearTimeout(t)
    /* eslint-disable-next-line */
  }, [reveal, blockingOpen])
  useEffect(() => { if (!pop) return; const t = window.setTimeout(() => setPop(null), 1800); return () => window.clearTimeout(t) }, [pop])

  const equipItem = (name: string) => {
    if (!run) return
    const next = equipGear(run, name, GEAR, bonuses)
    if (!next) return
    patch(s => ({ ...s, run: next }))
    setSelectedGearName(null)
    setToast(`Equipped ${name}.`)
  }

  const usePotion = () => {
    if (!run || feedback || reveal) return
    const next = drinkPotion(run, bonuses, GEAR)
    if (!next) return
    patch(s => ({ ...s, run: next }))
    sceneRef.current?.float('hero', `+${next.hp - run.hp}`, '#8ee0a9')
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
    setCampMsg(''); setFeedback(null); setCard(null); setShowBag(false); setShowWords(false); answerLock.current = false
  }

  const startRun = () => {
    setReveal(null)
    const fresh = newRun(bonuses, GEAR, ENEMIES)
    patch(s => ({ ...s, run: fresh }))
    setCard(makeCard()); setEliminated([]); setFeedback(null); setCampMsg(''); answerLock.current = false
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
    setReveal(null); setCard(null); setFeedback(null); setEliminated([]); setCampMsg(''); answerLock.current = false
  }

  // ---- camp -----------------------------------------------------------------------------
  const menu = menuOpen ? <MenuSheet settings={settings} onChange={setSettings} hasVoice={hasVoice} fullscreen={fs} outdated={isOutdated(latestBuild)} onUpdate={refreshApp} onExport={exportProgress} onImport={importProgress} onClose={() => setMenuOpen(false)} /> : null
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
        <CampScreen save={save} onBuy={buy} onStart={startRun} onReset={resetAll} message={campMsg} outdated={isOutdated(latestBuild)} onUpdate={refreshApp} onExport={exportProgress} onImport={importProgress} />
        <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.2</span><span>Die. Learn. Return stronger.</span></footer>
        {menu}
      </main>
    )
  }

  // ---- battle ---------------------------------------------------------------------------
  if (!card) return <main className="app-shell">{topbar}</main>
  const { word, question } = card
  const entry = save.mastery[word.hanzi]
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
  const lootChance = Math.min(0.95, 0.5 + bonuses.lootPct + (foe.elite ? 0.3 : 0))
  const ownedUpgrades = save.meta.upgrades.map(id => nodeById(id)).filter((node): node is NonNullable<typeof node> => !!node)

  return (
    <main className="app-shell in-battle">
      {topbar}

      <section className="hero-strip">
        <div><p className="eyebrow">FLOOR {pad(run.floor)} · ENEMY {run.kill + 1}/{ENEMIES_PER_FLOOR}{foe.elite ? ' · ELITE' : ''}</p><h1>The Mosslight Cavern</h1><p className="subtitle">Every word is a weapon. Every run makes you stronger.</p></div>
        <div className="progress-chip"><span>📖</span><strong>{masteredCount(save.mastery)}<small> / {WORDS.length} mastered</small></strong></div>
      </section>

      <section className="game-layout">
        <div className="left-column">
          <div className="scene-frame">
            <div className="scene-label"><span className="live-dot"></span><span className="scene-where"><span className="scene-floor"><span className="sf-wide">F{run.floor} · {run.kill + 1}/{ENEMIES_PER_FLOOR}</span><span className="sf-narrow">F{run.floor}·{run.kill + 1}/{ENEMIES_PER_FLOOR}</span></span><span className="scene-gold">🪙 {run.gold}</span></span>
              <div className="scene-actions">
                <button className="chip-btn" onClick={usePotion} disabled={run.potions < 1 || run.hp >= stats.maxHp || !fighting || !!feedback || revealing} aria-label={`Use potion, ${run.potions} left`}>🧪<b>{run.potions}</b></button>
                <button className="chip-btn" onClick={() => { setShowBag(v => !v); setNewLoot(false) }} aria-label={newLoot ? 'Gear, new item found' : 'Gear'}>🎒<b>{equipped.length}</b>{newLoot && <i className="new-dot" aria-hidden />}</button>
                <button className="chip-btn" onClick={() => setShowWords(v => !v)} aria-label="Wordbook">📚<b>{seenCount(save.mastery)}</b></button>
                <button className="chip-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Settings">⚙</button>
              </div></div>
            <div className="phaser-mount" ref={mountRef} aria-label="Pixel art dungeon battle scene" />
            <div className="scene-footer"><span>✦ Mosslight Cavern</span><span>RUN GOLD 🪙 {run.gold}</span></div>
          </div>
          <div className="combatant-row">
            <div className="combatant player-card">
              <div className="combatant-head"><div className="avatar hero-avatar">⚔</div><div><strong>Wanderer <span className="lv-tag">Lv {run.level}</span></strong><small>Level {run.level} Adventurer</small></div></div>
              <div className="bar-label"><span>HP</span><span>{run.hp} / {stats.maxHp}</span></div><div className="health-track"><div className="health-fill player-fill" style={{ width: `${Math.max(0, run.hp) / stats.maxHp * 100}%` }} /></div><div className="xp-mini" aria-label="experience"><div style={{ width: `${Math.min(100, run.xp / xpForLevel(run.level) * 100)}%` }} /></div>{pop && <em key={pop.key} className="xp-pop">+{pop.xp} XP</em>}
              <div className="mini-stats"><span>⚔ ATK {stats.attack}</span><span>✦ XP {run.xp}/{xpForLevel(run.level)}</span></div>
            </div>
            <div className="versus">VS</div>
            <div className="combatant enemy-card">
              <div className="combatant-head"><div className="avatar enemy-avatar">{foe.enemy.emoji}</div><div><strong>{foe.elite ? 'Elite ' : ''}{foe.enemy.name}</strong><small>Dungeon creature</small></div></div>
              <div className="bar-label"><span>HP</span><span>{run.enemyHp} / {foe.hp}</span></div><div className="health-track"><div className="health-fill enemy-fill" style={{ width: `${Math.max(0, run.enemyHp) / foe.hp * 100}%` }} /></div>
              <div className="mini-stats"><span>☠ DMG {Math.max(1, foe.damage - bonuses.armor)}</span><span>✦ XP {foe.xp}</span></div>
            </div>
          </div>
          {showBag && <section className="drawer character-drawer">
            <div className="drawer-title"><span>CHARACTER · GEAR & STATS</span><button onClick={() => setShowBag(false)} aria-label="Close character inventory">×</button></div>
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
              <div className="character-section-title">ACTIVE BONUSES <span>WHAT AFFECTS THIS RUN</span></div>
              <div className="active-bonus-list">
                <div className="active-bonus-row"><span className="active-bonus-icon">🛡️</span><strong>Armor</strong><span className="active-bonus-value">{bonuses.armor + equipped.reduce((n, item) => n + item.armor, 0)}</span><small className="bonus-source gear-source">GEAR / UPGRADES</small></div>
                <div className="active-bonus-row"><span className="active-bonus-icon">✨</span><strong>XP gain</strong><span className="active-bonus-value">+{Math.round((bonuses.xpPct + equipped.reduce((n, item) => n + item.xpPct, 0)) * 100)}%</span><small className="bonus-source upgrade-source">UPGRADES + GEAR</small></div>
                <div className="active-bonus-row"><span className="active-bonus-icon">🪙</span><strong>Gold gain</strong><span className="active-bonus-value">+{Math.round(bonuses.goldPct * 100)}%{equipped.reduce((n, item) => n + item.goldFlat, 0) ? ` + ${equipped.reduce((n, item) => n + item.goldFlat, 0)} per win` : ''}</span><small className="bonus-source gear-source">GEAR / UPGRADES</small></div>
                {bonuses.healOnKill > 0 && <div className="active-bonus-row"><span className="active-bonus-icon">💚</span><strong>Heal on kill</strong><span className="active-bonus-value">Restore {bonuses.healOnKill} HP</span><small className="bonus-source upgrade-source">UPGRADE</small></div>}
                {bonuses.potionHeal > 0 && <div className="active-bonus-row"><span className="active-bonus-icon">🧪</span><strong>Potion strength</strong><span className="active-bonus-value">+{bonuses.potionHeal} healing</span><small className="bonus-source upgrade-source">UPGRADE</small></div>}
                {bonuses.lootPct > 0 && <div className="active-bonus-row"><span className="active-bonus-icon">🎒</span><strong>Loot chance</strong><span className="active-bonus-value">+{Math.round(bonuses.lootPct * 100)}% base chance</span><small className="bonus-source upgrade-source">UPGRADE</small></div>}
                {equipped.some(item => item.masteryPct > 0) && <div className="active-bonus-row"><span className="active-bonus-icon">📖</span><strong>Mastery damage</strong><span className="active-bonus-value">+{Math.round(equipped.reduce((n, item) => n + item.masteryPct, 0) * 100)}%</span><small className="bonus-source gear-source">GEAR</small></div>}
              </div>
            </section>
            <section className="character-section gear-overview">
              <div className="character-section-title">EQUIPPED GEAR <span>{equipped.length}/3</span></div>
              <div className="gear-equipped-list">
                {(['Weapon', 'Armor', 'Accessory'] as const).map(slot => {
                  const item = GEAR.find(g => g.name === run.loadout[slot])
                  const alternative = GEAR.find(g => g.slot === slot && run.gear.includes(g.name) && run.loadout[slot] !== g.name)
                  return <div className={`gear-equipped-row ${item ? 'is-filled' : 'is-empty'}`} key={slot}>
                    <span className="gear-equipped-icon">{item?.icon ?? '◇'}</span>
                    <div className="gear-equipped-info"><b>{item?.name ?? 'Empty slot'}</b><small>{slot.toUpperCase()}</small></div>
                    <span className="gear-equipped-effect">{item?.bonus ?? 'Find gear to equip'}</span>
                    {item && <button className="gear-change-btn" onClick={() => alternative ? setSelectedGearName(alternative.name) : setToast(`Find another ${slot.toLowerCase()} to compare it here.`)}>{alternative ? 'CHANGE' : 'EQUIPPED'}</button>}
                  </div>
                })}
              </div>
              <div className="character-section-title gear-inventory-title">YOUR INVENTORY <span>{run.gear.length} / {GEAR.length}</span></div>
              {selectedGearName && (() => {
                const candidate = GEAR.find(g => g.name === selectedGearName)
                if (!candidate || !run.gear.includes(candidate.name) || run.loadout[candidate.slot] === candidate.name) return null
                const current = GEAR.find(g => g.name === run.loadout[candidate.slot])
                const fields = [
                  { label: 'Attack', key: 'attack' as const, icon: '⚔️', pct: false },
                  { label: 'Max HP', key: 'hp' as const, icon: '❤️', pct: false },
                  { label: 'Armor', key: 'armor' as const, icon: '🛡️', pct: false },
                  { label: 'XP gain', key: 'xpPct' as const, icon: '✨', pct: true },
                  { label: 'Mastery damage', key: 'masteryPct' as const, icon: '📖', pct: true },
                  { label: 'Gold per win', key: 'goldFlat' as const, icon: '🪙', pct: false }
                ]
                const changes = fields.map(field => ({ ...field, delta: candidate[field.key] - (current?.[field.key] ?? 0) })).filter(field => field.delta !== 0)
                return <div className="gear-compare" aria-label={`Compare ${candidate.name}`}>
                  <div className="gear-compare-head"><strong>ITEM COMPARISON</strong><button className="text-btn" onClick={() => setSelectedGearName(null)}>Close</button></div>
                  <div className="gear-compare-cards">
                    <div className="gear-compare-card"><small>CURRENT</small><span className="gear-compare-icon">{current?.icon ?? '◇'}</span><b>{current?.name ?? 'Empty slot'}</b><span>{current?.bonus ?? 'No bonus'}</span></div>
                    <div className="gear-compare-card candidate"><small>NEW ITEM</small><span className="gear-compare-icon">{candidate.icon}</span><b>{candidate.name}</b><span>{candidate.bonus}</span></div>
                  </div>
                  <div className="gear-deltas">
                    {changes.length ? changes.map(field => <div key={field.key}><span>{field.icon} {field.label}</span><strong className={field.delta > 0 ? 'delta-up' : 'delta-down'}>{field.delta > 0 ? '+' : '−'}{field.pct ? Math.abs(Math.round(field.delta * 100)) + '%' : Math.abs(field.delta)}</strong></div>) : <p className="hint-text">This item changes no numeric stats.</p>}
                  </div>
                  <button className="secondary-btn gear-equip-btn" onClick={() => equipItem(candidate.name)}>Equip {candidate.name}</button>
                </div>
              })()}
              <div className="gear-inventory-grid">
                {GEAR.filter(item => run.gear.includes(item.name)).map(item => {
                  const isEquipped = run.loadout[item.slot] === item.name
                  return <div className={`gear-item-card ${isEquipped ? 'is-equipped' : ''}`} key={item.name}>
                    <span className="gear-item-icon">{item.icon}</span>
                    <div className="gear-item-info"><b>{item.name}</b><span><small>{item.slot}</small><i> · </i>{item.bonus}</span></div>
                    {isEquipped ? <span className="gear-state owned">✓ Equipped</span> : <button onClick={() => setSelectedGearName(item.name)} aria-label={`Compare ${item.name} with currently equipped ${item.slot}`}>{selectedGearName === item.name ? 'Selected' : 'Compare'}</button>}
                  </div>
                })}
                {!run.gear.length && <p className="hint-text">Gear you discover during a run will appear here.</p>}
              </div>
              <details className="gear-undiscovered">
                <summary>Undiscovered gear <span>{GEAR.length - run.gear.length} items</span></summary>
                <div className="gear-locked-grid">
                  {GEAR.filter(item => !run.gear.includes(item.name)).map(item => <div className="gear-locked-item" key={item.name}><span>{item.icon}</span><div><b>{item.name}</b><small>{item.slot} · {item.bonus}</small></div><span className="gear-state locked">🔒</span></div>)}
                </div>
              </details>
              <p className="hint-text">Gear is lost when a run ends. Compare found items before swapping them into a slot.</p>
            </section>
            <section className="character-section upgrade-passives-section">
              <div className="character-section-title">UPGRADE PASSIVES <span>{ownedUpgrades.length} UNLOCKED</span></div>
              {ownedUpgrades.length ? <div className="upgrade-passive-list">{ownedUpgrades.map(node => <div className="upgrade-passive-row" key={node.id}><span className="upgrade-passive-icon">{node.icon}</span><div><b>{node.name}</b><small>{node.branch} · Tier {node.tier}</small></div><span className="upgrade-passive-effect">{node.desc}</span><span className="bonus-source upgrade-source">ACTIVE</span></div>)}</div> : <p className="hint-text">Unlock upgrades at camp to gain passive effects.</p>}
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
          </section>}
          {showWords && <div className="drawer"><div className="drawer-title">WORDBOOK <button onClick={() => setShowWords(false)} aria-label="Close wordbook">×</button></div><div className="wordbook-grid">{WORDS.filter(w => save.mastery[w.hanzi] && !(fighting && !feedback && card?.word.hanzi === w.hanzi)).sort((a, b) => save.mastery[b.hanzi].lv - save.mastery[a.hanzi].lv).map(w => { const lv = save.mastery[w.hanzi].lv; const tip = hasExplanation(w.hanzi); const body = <><strong>{w.hanzi}</strong><span>{w.pinyin}</span><small>{w.meaning}</small><i className="pips" aria-label={lv >= MAX_LV ? 'mastered' : `level ${lv}`}>{Array.from({ length: MAX_LV }, (_, k) => <u key={k} className={k < lv ? 'on' : ''} />)}</i>{tip && <em className="tip-badge" aria-hidden>💡</em>}</>; return tip ? <button className={`wordbook-word has-tip lv${lv}`} key={w.hanzi} onClick={() => setExplain([w.hanzi])} aria-label={`${w.hanzi}, ${w.meaning}. Open explanation`}>{body}</button> : <div className={`wordbook-word lv${lv}`} key={w.hanzi}>{body}</div> })}{seenCount(save.mastery) === 0 && <p className="hint-text">Words you meet in battle appear here with their mastery level.</p>}</div></div>}
        </div>

        <div className="right-column">
          <section className="question-panel">
            <div className={`question-title ${run.phase}`}><div className="title-text"><h2>{fighting || revealing || feedback ? question.text : run.phase === 'victory' ? (lastOfFloor ? '⚔️ Floor cleared!' : '⚔️ Victory!') : '💀 You have fallen'}</h2></div></div>

            {/* The word card never leaves its slot. Feedback replaces the choices below it. */}
            {showCard && <>
              <div className={`stage stage-card ${revealing ? 'ok' : feedback ? (feedback.correct ? 'ok' : 'wrong') : ''}`} onClick={revealing ? advanceAuto : undefined}>
                <span className="stage-badge">{pips < 0 ? 'NEW WORD' : pips >= MAX_LV ? 'MASTERED' : `WORD LV ${pips}`}<i className="pips">{Array.from({ length: MAX_LV }, (_, k) => <u key={k} className={k < pips ? 'on' : ''} />)}</i></span>
                <div className="corner-btns">
                  {hasExplanation(word.hanzi) && <button className="speak-btn tip-btn" onClick={e => { e.stopPropagation(); setExplain([word.hanzi]) }} aria-label={`More about ${word.hanzi}`}>💡</button>}
                  <button className={`speak-btn ${question.audio && !settings.muted ? 'cue' : ''} ${settings.muted ? 'muted' : ''}`} onClick={e => { e.stopPropagation(); pressSpeaker(word.hanzi) }} aria-label={settings.muted ? 'Sound is off: tap to turn on' : 'Hear the word'}>{settings.muted ? '🔇' : '🔊'}</button>
                </div>
                <div className={`slot slot-hanzi ${slot(show.hanzi, question.ask === 'hanzi')}`}>{show.hanzi ? word.hanzi : '?'}</div>
                <div className={`slot slot-pinyin ${slot(show.pinyin, question.ask === 'pinyin')}`}>{show.pinyin ? word.pinyin : '? ? ?'}</div>
                <div className={`slot slot-meaning ${slot(show.meaning, question.ask === 'meaning')}`}>{show.meaning ? word.meaning : '“ ? ”'}</div>
              </div>
              {feedback && !revealing ? (
                <div className={`answer-list answer-feedback ${feedback.correct ? 'is-correct' : 'is-incorrect'}`}>
                  <div className="result-line">
                    <strong>{feedback.correct ? '✓ Correct!' : 'Not quite'}</strong>
                    {!feedback.correct && <span>You chose <s>{feedback.chosen}</s> · answer <b>{feedback.answer}</b></span>}
                  </div>
                  <p className="result-note" ref={noteRef}>{feedback.word.note}</p>
                  {feedback.mastery && <p className={`result-mastery ${feedback.masteryUp ? 'up' : ''}`}>{feedback.mastery}</p>}
                  {run.phase === 'victory' && <div className="result-rewards">
                    <span>+{run.reward.xp} XP</span><span>🪙 +{run.reward.gold}</span>
                    {run.reward.levelUps > 0 && <span className="hot">Level {run.level}!</span>}
                    {run.reward.loot && <span className="hot">{run.reward.loot}</span>}
                    {run.reward.dupGold > 0 && <span>Dupe +{run.reward.dupGold}🪙</span>}
                  </div>}
                </div>
              ) : <div className="answer-list">{question.options.map((option, i) => {
                const gone = eliminated.includes(option)
                return <button key={`${option}-${i}`} className={`answer-btn ${question.optionsAreHanzi ? 'opt-hanzi' : ''} ${gone ? 'answer-gone' : ''} ${revealing && option === question.answer ? 'answer-correct' : ''}`} disabled={gone || revealing} onClick={() => answerQuestion(option)}><span className="answer-key">{String.fromCharCode(65 + i)}</span><span className="answer-text">{gone ? '—' : option}</span></button>
              })}</div>}
            </>}

            {/* Only terminal states without answer feedback use the fallback stage. */}
            {(!fighting && !feedback) && !revealing && <div className={`stage stage-wide stage-fb ${run.phase === 'victory' ? 'good' : 'bad'}`}>
              <div className="stage-end"><div className="end-banner">{run.phase === 'victory' ? (lastOfFloor ? '🏆' : '⚔️') : '💀'}</div></div>
              {run.phase === 'victory' && <div className="fb-chips"><span>+{run.reward.xp} XP</span><span>🪙 +{run.reward.gold}</span>{run.reward.levelUps > 0 && <span className="hot">Level {run.level}!</span>}{run.reward.loot && <span className="hot wide">{run.reward.loot}</span>}{run.reward.dupGold > 0 && <span>dupe +{run.reward.dupGold}🪙</span>}</div>}
              {run.phase === 'defeat' && <p className="fb-defeat">You fell on floor <b>{run.floor}</b> with <b>{run.gold} gold</b> — banked for upgrades. Next run: level 1, no gear. Word mastery stays.</p>}
            </div>}

            <div className="action-bar">
              {revealing
                ? <button className="bar-btn ghost" data-kind="continue" onClick={advanceAuto}>Tap to continue →</button>
                : fighting && !feedback
                ? <>
                    {bonuses.hints > 0
                      ? <button className="bar-btn ghost hint-btn" onClick={useHint} disabled={run.hintsLeft < 1} aria-label={`Hint, ${run.hintsLeft} left this fight`}>💡 Hint <b>{run.hintsLeft}</b></button>
                      : <p className="bar-hint">Choose an answer</p>}
                  </>
                : <button className="bar-btn main" data-kind={fighting ? 'continue' : run.phase === 'victory' ? 'next' : 'camp'} onClick={fighting ? dismissFeedback : run.phase === 'victory' ? nextEnemy : endRun}>
                    {fighting ? 'Continue' : run.phase === 'victory' ? (lastOfFloor ? `Descend to floor ${run.floor + 1}` : 'Next enemy') : 'Go to camp'} <span>{run.phase === 'defeat' && !fighting ? '⛺' : '→'}</span>
                  </button>}
            </div>
          </section>
          {toast && <div className="toast"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss">×</button></div>}
          <section className="build-panel"><div className="build-title"><div><span className="eyebrow">THIS RUN</span><h3>Build & Progress</h3></div><span className="level-badge">LV {run.level}</span></div><div className="xp-line"><span>Experience</span><span>{run.xp} / {xpForLevel(run.level)} XP</span></div><div className="xp-track"><div style={{ width: `${Math.min(100, run.xp / xpForLevel(run.level) * 100)}%` }} /></div><div className="build-grid"><div><span className="build-icon">⚔️</span><small>Attack</small><strong>{stats.attack}</strong></div><div><span className="build-icon">🛡️</span><small>Gear found</small><strong>{run.gear.length}</strong></div><div><span className="build-icon">📖</span><small>Words mastered</small><strong>{masteredCount(save.mastery)}</strong></div></div><button className="reset-btn" onClick={resetAll}>Reset ALL progress</button></section>
        </div>
      </section>
      <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.2</span><span>Die. Learn. Return stronger.</span></footer>
      {isOutdated(latestBuild) && !updateDismissed && <div className="update-banner" role="status"><span>A new version is available. Your progress is kept.</span><button onClick={refreshApp}>Update</button><button className="x" onClick={() => setUpdateDismissed(true)} aria-label="Dismiss">×</button></div>}
      {menu}
      {explain.length > 0 && <ExplainModal stack={explain} onClose={closeExplain} onBack={() => setExplain(st => st.slice(0, -1))} onOpen={h => setExplain(st => [...st, h])} onSpeak={pressSpeaker} />}
    </main>
  )
}
