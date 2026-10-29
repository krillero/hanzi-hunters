import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { PixelScene } from './game/PixelScene'
import CampScreen from './CampScreen'
import { ENEMIES, GEAR, WORDS, type Word } from './data'
import { MAX_LV, masteredCount, pickWord, seenCount, updateMastery } from './game/mastery'
import { buildQuestion, shuffle, type Question } from './game/questions'
import {
  ENEMIES_PER_FLOOR, advance, bankRun, drinkPotion, enemyStats, equippedGear, newRun, playerStats, resolveAnswer, xpForLevel
} from './game/rules'
import { SAVE_KEY, loadSave, sanitizeSave } from './game/save'
import type { Run, Saved } from './game/types'
import { buyUpgrade, computeBonuses, nodeById } from './game/upgrades'

type Card = { word: Word; question: Question }
type Feedback = { correct: boolean; word: Word; mastery: string; masteryUp: boolean; chosen: string; answer: string; title: string }

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
  const noteRef = useRef<HTMLParagraphElement | null>(null)
  const [save, setSave] = useState<Saved>(() => { try { return initialSave() } catch { return sanitizeSave(null) } })
  const [canListen, setCanListen] = useState(false)
  const [card, setCard] = useState<Card | null>(null)
  const [eliminated, setEliminated] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [toast, setToast] = useState('')
  const [campMsg, setCampMsg] = useState('')
  const [showBag, setShowBag] = useState(false)
  const [showWords, setShowWords] = useState(false)
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
  const equipped = run ? equippedGear(GEAR, run.gear) : []
  const enemyKey = foe ? `${foe.enemy.sprite}:${foe.elite}` : ''
  const enemyKeyRef = useRef(enemyKey)
  enemyKeyRef.current = enemyKey
  const phaseRef = useRef<Run['phase']>('fighting')
  phaseRef.current = run?.phase ?? 'fighting'

  const makeCard = (mastery = save.mastery, current: string | null = null, listen = canListen): Card => {
    const word = pickWord(WORDS, mastery, current)
    return { word, question: buildQuestion(word, mastery[word.hanzi], WORDS, { canListen: listen }) }
  }
  const patch = (fn: (s: Saved) => Saved) => setSave(fn)

  // ---- one-time setup -----------------------------------------------------------------
  useEffect(() => {
    const check = () => setCanListen(hasChineseVoice())
    check()
    try { window.speechSynthesis.addEventListener('voiceschanged', check) } catch { /* no speech support */ }
    return () => { try { window.speechSynthesis.removeEventListener('voiceschanged', check) } catch { /* ignore */ } }
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
      const [sprite, elite] = enemyKeyRef.current.split(':')
      if (sprite) scene.setEnemy(sprite as 'slime' | 'imp' | 'bat', elite === 'true')
      if (phaseRef.current === 'victory') scene.hideMonster()
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
  const speak = (hanzi: string) => {
    if (!('speechSynthesis' in window)) { setToast('Speech playback is not supported in this browser.'); return }
    if (!hasChineseVoice()) setToast('No Mandarin voice found on this device. Install a Chinese (Simplified) text-to-speech voice in your system settings.')
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(hanzi)
    u.lang = 'zh-CN'; u.rate = 0.82
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().replace('_', '-').startsWith('zh-cn')) ?? window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('zh'))
    if (voice) u.voice = voice
    window.speechSynthesis.speak(u)
  }
  useEffect(() => { if (card?.question.kind === 'listen' && !feedback) speak(card.word.hanzi) /* eslint-disable-next-line */ }, [card])

  // ---- actions --------------------------------------------------------------------------
  const answerQuestion = (option: string) => {
    if (!run || !card || answerLock.current || feedback || run.phase !== 'fighting' || eliminated.includes(option)) return
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
    const before = entry?.lv ?? -1, after = mastery[word.hanzi].lv
    sceneRef.current?.playHit('monster', r.damage)
    if (r.outcome === 'victory') sceneRef.current?.hideMonster()
    else if (r.counter > 0) sceneRef.current?.playHit('hero', r.counter)
    else if (r.savedBySecondChance) sceneRef.current?.float('hero', 'BLOCKED', '#8ed1ff')

    patch(s => ({ ...s, run: r.run, mastery }))
    const masteryNote = !entry ? 'New word added to your wordbook.'
      : after > before ? (after >= MAX_LV ? `Mastered! ${word.hanzi} is now level ${MAX_LV}.` : `Word level up! ${word.hanzi} is now level ${after}.`)
        : after < before ? `${word.hanzi} slipped back to level ${after}. It will return for review.`
          : isCorrect ? 'One more correct answer to level this word up.' : 'Review this one — it will come back.'
    setFeedback({
      correct: isCorrect, word, mastery: masteryNote, masteryUp: after > before && before >= 0, chosen: option, answer: question.answer,
      title: isCorrect ? (r.comboHit ? '✦ Combo strike!' : '✦ Excellent strike!')
        : r.outcome === 'victory' ? '↻ Wrong, but enough to win!'
          : r.savedBySecondChance ? '↻ Second Chance: no counterattack!' : '↻ Keep learning!'
    })
    if (r.outcome === 'victory') {
      // Rewards live in the scene and the recap chips; no toast.
      const lines = [r.loot ? `LOOT: ${r.loot.name}` : r.duplicateGold ? `Duplicate gear → +${r.duplicateGold} gold` : ''].filter(Boolean)
      if (lines.length) sceneRef.current?.float('banner', lines.join('\n'), '#f4d58c')
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

  const usePotion = () => {
    if (!run || feedback) return
    const next = drinkPotion(run, bonuses, GEAR)
    if (!next) return
    patch(s => ({ ...s, run: next }))
    sceneRef.current?.float('hero', `+${next.hp - run.hp}`, '#8ee0a9')
  }

  const useHint = () => {
    if (!run || !card || feedback || run.hintsLeft < 1 || run.phase !== 'fighting') return
    const wrong = card.question.options.filter(o => o !== card.question.answer && !eliminated.includes(o))
    if (wrong.length <= 1) return
    setEliminated(e => [...e, shuffle(wrong)[0]])
    patch(s => ({ ...s, run: s.run && { ...s.run, hintsLeft: s.run.hintsLeft - 1 } }))
  }

  const endRun = () => {
    if (!run) return
    const { meta, summary } = bankRun(save.meta, run)
    patch(s => ({ ...s, meta, run: null, lastRun: summary }))
    setCampMsg(''); setFeedback(null); setCard(null); setShowBag(false); setShowWords(false); answerLock.current = false
  }

  const startRun = () => {
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

  const resetAll = () => {
    if (!window.confirm('Delete ALL progress — upgrades, gold and word mastery — and start over?')) return
    try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
    const fresh = sanitizeSave(null)
    setSave({ ...fresh, run: newRun(computeBonuses([]), GEAR, ENEMIES) })
    setCard(null); setFeedback(null); setEliminated([]); setCampMsg(''); answerLock.current = false
  }

  // ---- camp -----------------------------------------------------------------------------
  const topbar = (
    <header className="topbar">
      <div className="brand"><span className="brand-mark">HH</span><div><strong>HANZI HUNTERS</strong><small>THE FIRST DESCENT</small></div></div>
      <div className="top-stats">
        {run ? <><span>✦ LVL {run.level}</span><span>◈ {run.gold} G</span></> : <span>◈ {save.meta.gold} G</span>}
        {fs.supported && <button className="chip-btn fs-btn" onClick={fs.toggle} aria-label={fs.on ? 'Exit fullscreen' : 'Fullscreen'}>{fs.on ? '🗗' : '⛶'}</button>}
      </div>
    </header>
  )
  if (!run || !stats || !foe) {
    return (
      <main className="app-shell in-camp">
        {topbar}
        <CampScreen save={save} onBuy={buy} onStart={startRun} onReset={resetAll} message={campMsg} />
        <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.2</span><span>Die. Learn. Return stronger.</span></footer>
      </main>
    )
  }

  // ---- battle ---------------------------------------------------------------------------
  if (!card) return <main className="app-shell">{topbar}</main>
  const { word, question } = card
  const entry = save.mastery[word.hanzi]
  const revealed = !!feedback
  const show = { hanzi: question.show.hanzi || revealed, pinyin: question.show.pinyin || revealed, meaning: question.show.meaning || revealed }
  const fighting = run.phase === 'fighting'
  const lastOfFloor = run.kill + 1 >= ENEMIES_PER_FLOOR
  const pips = entry ? entry.lv : -1

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
            <div className="scene-label"><span className="live-dot"></span><span className="scene-where">F{pad(run.floor)} <span>·</span> {run.kill + 1}/{ENEMIES_PER_FLOOR}{foe.elite && <b className="elite-tag">ELITE</b>}<span className="scene-gold">◈ {run.gold}</span></span>
              <div className="scene-actions">
                <button className="chip-btn" onClick={usePotion} disabled={run.potions < 1 || run.hp >= stats.maxHp || !fighting || !!feedback} aria-label={`Use potion, ${run.potions} left`}>🧪<b>{run.potions}</b></button>
                <button className="chip-btn" onClick={() => setShowBag(v => !v)} aria-label="Gear">🎒<b>{equipped.length}</b></button>
                <button className="chip-btn" onClick={() => setShowWords(v => !v)} aria-label="Wordbook">📚<b>{seenCount(save.mastery)}</b></button>
                {fs.supported && <button className="chip-btn fs-btn" onClick={fs.toggle} aria-label={fs.on ? 'Exit fullscreen' : 'Fullscreen'}>{fs.on ? '🗗' : '⛶'}</button>}
              </div></div>
            <div className="phaser-mount" ref={mountRef} aria-label="Pixel art dungeon battle scene" />
            <div className="scene-footer"><span>✦ Mosslight Cavern</span><span>RUN GOLD ◈ {run.gold}</span></div>
          </div>
          <div className="combatant-row">
            <div className="combatant player-card">
              <div className="combatant-head"><div className="avatar hero-avatar">⚔</div><div><strong>Wanderer <span className="lv-tag">Lv {run.level}</span></strong><small>Level {run.level} Adventurer</small></div></div>
              <div className="bar-label"><span>HP</span><span>{run.hp} / {stats.maxHp}</span></div><div className="health-track"><div className="health-fill player-fill" style={{ width: `${Math.max(0, run.hp) / stats.maxHp * 100}%` }} /></div><div className="xp-mini" aria-label="experience"><div style={{ width: `${Math.min(100, run.xp / xpForLevel(run.level) * 100)}%` }} /></div>
              <div className="mini-stats"><span>⚔ ATK {stats.attack}</span><span>✦ XP {run.xp}/{xpForLevel(run.level)}</span></div>
            </div>
            <div className="versus">VS</div>
            <div className="combatant enemy-card">
              <div className="combatant-head"><div className="avatar enemy-avatar">{foe.enemy.emoji}</div><div><strong>{foe.elite ? 'Elite ' : ''}{foe.enemy.name}</strong><small>Dungeon creature</small></div></div>
              <div className="bar-label"><span>HP</span><span>{run.enemyHp} / {foe.hp}</span></div><div className="health-track"><div className="health-fill enemy-fill" style={{ width: `${Math.max(0, run.enemyHp) / foe.hp * 100}%` }} /></div>
              <div className="mini-stats"><span>☠ DMG {Math.max(1, foe.damage - bonuses.armor)}</span><span>✦ XP {foe.xp}</span></div>
            </div>
          </div>
          {showBag && <div className="drawer"><div className="drawer-title">GEAR THIS RUN <button onClick={() => setShowBag(false)} aria-label="Close gear">×</button></div>{GEAR.map(item => <div className="gear-line" key={item.name}><span className="gear-icon">{item.icon}</span><div><b>{item.name}</b><small>{item.slot} · {item.bonus}</small></div><span className={`gear-state ${run.gear.includes(item.name) ? 'owned' : 'locked'}`}>{run.gear.includes(item.name) ? '✓ Equipped' : '🔒 Not found'}</span></div>)}<p className="hint-text">Gear drops from monsters and stacks, but is lost when your run ends. Start-of-run gear comes from the Fortune upgrades.</p></div>}
          {showWords && <div className="drawer"><div className="drawer-title">WORDBOOK <button onClick={() => setShowWords(false)} aria-label="Close wordbook">×</button></div><div className="wordbook-grid">{WORDS.filter(w => save.mastery[w.hanzi]).sort((a, b) => save.mastery[b.hanzi].lv - save.mastery[a.hanzi].lv).map(w => { const lv = save.mastery[w.hanzi].lv; return <div className={`wordbook-word lv${lv}`} key={w.hanzi}><strong>{w.hanzi}</strong><span>{w.pinyin}</span><small>{w.meaning}</small><i className="pips" aria-label={lv >= MAX_LV ? 'mastered' : `level ${lv}`}>{Array.from({ length: MAX_LV }, (_, k) => <u key={k} className={k < lv ? 'on' : ''} />)}</i></div> })}{seenCount(save.mastery) === 0 && <p className="hint-text">Words you meet in battle appear here with their mastery level.</p>}</div></div>}
        </div>

        <div className="right-column">
          <section className="question-panel">
            <div className="question-title"><span className="question-icon">文</span><div className="title-text"><h2>{fighting ? question.text : run.phase === 'victory' ? (lastOfFloor ? 'Floor cleared!' : 'Victory, adventurer!') : 'You have fallen...'}</h2><p>{fighting ? 'Answer correctly to unleash a stronger attack.' : run.phase === 'victory' ? 'The cavern rewards your growing knowledge.' : 'Your gold and word mastery are safe.'}</p></div><span className="streak-chip" aria-label="streak">🔥 ×{run.streak}</span></div>

            {/* Fixed-size regions: stage, choices, action bar never change size or position. */}
            {fighting && !feedback && <>
              <div className="stage stage-card"><span className="stage-badge">{pips < 0 ? 'NEW WORD' : pips >= MAX_LV ? 'MASTERED' : `WORD LV ${pips}`}<i className="pips">{Array.from({ length: MAX_LV }, (_, k) => <u key={k} className={k < pips ? 'on' : ''} />)}</i></span>
                {question.kind === 'listen'
                  ? <button className="listen-big" onClick={() => speak(word.hanzi)} aria-label="Play the word again">🔊<span>Tap to hear it again</span></button>
                  : <div className={`hanzi ${show.hanzi ? '' : 'is-hidden'}`}>{show.hanzi ? word.hanzi : '？'}</div>}
                <div className="pinyin-line"><span className={`pinyin ${show.pinyin ? '' : 'is-hidden'}`}>{show.pinyin ? word.pinyin : question.kind === 'pinyin' ? '? ? ?' : '\u00a0'}</span></div>
                <div className={`word-meaning ${show.meaning ? '' : 'is-hidden'}`}>{show.meaning ? word.meaning : question.kind === 'meaning' || question.kind === 'intro' ? '“ ? ”' : '\u00a0'}</div>
              </div>
              <div className="answer-list">{question.options.map((option, i) => {
                const gone = eliminated.includes(option)
                return <button key={`${option}-${i}`} className={`answer-btn ${question.optionsAreHanzi ? 'opt-hanzi' : ''} ${gone ? 'answer-gone' : ''}`} disabled={gone} onClick={() => answerQuestion(option)}><span className="answer-key">{String.fromCharCode(65 + i)}</span><span className="answer-text">{gone ? '—' : option}</span></button>
              })}</div>
            </>}

            {/* After answering, the recap takes over the stage + choices area; the action bar below never moves. */}
            {(feedback || !fighting) && <div className={`stage stage-wide stage-fb ${feedback ? (feedback.correct ? 'good' : 'bad') : run.phase === 'victory' ? 'good' : 'bad'}`}>
              {feedback
                ? <>
                    <p className="fb-head"><strong>{feedback.title}</strong></p>
                    {!feedback.correct && <p className="fb-answer">You chose <s>{feedback.chosen}</s> · answer <b>{feedback.answer}</b></p>}
                    <div className="fb-word">
                      <span className="fb-hanzi">{feedback.word.hanzi}</span>
                      <div className="fb-info"><span className="fb-pinyin">{feedback.word.pinyin}</span><span className="fb-meaning">{feedback.word.meaning}</span></div>
                      <button className="icon-btn" onClick={() => speak(feedback.word.hanzi)} aria-label="Hear pronunciation">🔊</button>
                    </div>
                    <p className="fb-note" ref={noteRef}>{feedback.word.note}</p>
                    {feedback.mastery && <p className={`fb-mastery ${feedback.masteryUp ? 'up' : ''}`}>{feedback.mastery}</p>}
                  </>
                : <div className="stage-end"><div className="end-banner">{run.phase === 'victory' ? (lastOfFloor ? '🏆' : '⚔️') : '💀'}</div></div>}
              {run.phase === 'victory' && <div className="fb-chips"><span>+{run.reward.xp} XP</span><span>◈ +{run.reward.gold}</span>{run.reward.levelUps > 0 && <span className="hot">Level {run.level}!</span>}{run.reward.loot && <span className="hot wide">{run.reward.loot}</span>}{run.reward.dupGold > 0 && <span>dupe +{run.reward.dupGold}◈</span>}</div>}
              {run.phase === 'defeat' && <p className="fb-defeat">You fell on floor <b>{run.floor}</b> with <b>{run.gold} gold</b> — banked for upgrades. Next run: level 1, no gear. Word mastery stays.</p>}
            </div>}

            <div className="action-bar">
              {fighting && !feedback
                ? <>
                    <button className="bar-btn ghost" onClick={() => speak(word.hanzi)} aria-label="Hear pronunciation">🔊 Listen</button>
                    {bonuses.hints > 0 && <button className="bar-btn ghost hint-btn" onClick={useHint} disabled={run.hintsLeft < 1} aria-label={`Hint, ${run.hintsLeft} left this fight`}>💡 Hint <b>{run.hintsLeft}</b></button>}
                  </>
                : <button className="bar-btn main" data-kind={fighting ? 'continue' : run.phase === 'victory' ? 'next' : 'camp'} onClick={fighting ? dismissFeedback : run.phase === 'victory' ? nextEnemy : endRun}>
                    {fighting ? 'Continue' : run.phase === 'victory' ? (lastOfFloor ? `Descend to floor ${run.floor + 1}` : 'Next enemy') : 'Go to camp'} <span>{run.phase === 'defeat' && !fighting ? '⛺' : '→'}</span>
                  </button>}
            </div>
          </section>
          {toast && <div className="toast"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss">×</button></div>}
          <section className="build-panel"><div className="build-title"><div><span className="eyebrow">THIS RUN</span><h3>Build & Progress</h3></div><span className="level-badge">LV {run.level}</span></div><div className="xp-line"><span>Experience</span><span>{run.xp} / {xpForLevel(run.level)} XP</span></div><div className="xp-track"><div style={{ width: `${Math.min(100, run.xp / xpForLevel(run.level) * 100)}%` }} /></div><div className="build-grid"><div><span className="build-icon">⚔️</span><small>Attack</small><strong>{stats.attack}</strong></div><div><span className="build-icon">🛡️</span><small>Gear this run</small><strong>{run.gear.length}</strong></div><div><span className="build-icon">📖</span><small>Words mastered</small><strong>{masteredCount(save.mastery)}</strong></div></div><button className="reset-btn" onClick={resetAll}>Reset ALL progress</button></section>
        </div>
      </section>
      <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.2</span><span>Die. Learn. Return stronger.</span></footer>
    </main>
  )
}
