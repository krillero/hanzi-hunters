import { useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { PixelScene } from './game/PixelScene'
import { ENEMIES, GEAR, WORDS, type Word } from './data'
import {
  SAVE_KEY, buildQuestion, defaultSave, enemyForFloor, enemyMaxHp, equippedGear, gearBonus, pickWord,
  resolveAnswer, sanitizeSave, usePotion as drinkPotion, xpForLevel, type Saved
} from './game/rules'

const HANZI = WORDS.map(w => w.hanzi)

function readSave(): Saved {
  try { return sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'), GEAR, HANZI) }
  catch { return sanitizeSave(null, GEAR, HANZI) }
}

export default function App() {
  const sceneRef = useRef<PixelScene | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const answerLock = useRef(false)
  const enemyIndexRef = useRef(0)
  const [save, setSave] = useState<Saved>(readSave)
  const [enemyIndex, setEnemyIndex] = useState(() => ENEMIES.indexOf(enemyForFloor(ENEMIES, save.floor)))
  const [enemyMax, setEnemyMax] = useState(() => enemyMaxHp(enemyForFloor(ENEMIES, save.floor), save.floor))
  const [enemyHp, setEnemyHp] = useState(enemyMax)
  const [battleHp, setBattleHp] = useState(save.hp)
  const [word, setWord] = useState<Word>(() => pickWord(WORDS, save.missed, null))
  const [feedback, setFeedback] = useState<{correct:boolean; text:string; word:Word} | null>(null)
  const [battleState, setBattleState] = useState<'fighting' | 'victory' | 'defeat'>('fighting')
  const [reward, setReward] = useState({ xp: 0, gold: 0 })
  const [streak, setStreak] = useState(0)
  const [toast, setToast] = useState('')
  const [showBag, setShowBag] = useState(false)
  const [showWords, setShowWords] = useState(false)

  const enemy = ENEMIES[enemyIndex]
  enemyIndexRef.current = enemyIndex
  const equipped = useMemo(() => equippedGear(GEAR, save.gear), [save.gear])
  const attackBonus = gearBonus(equipped, 'attack')
  const hpBonus = gearBonus(equipped, 'hp')
  const maxHp = save.maxHp + hpBonus
  const question = useMemo(() => buildQuestion(word, WORDS), [word])
  // The field being tested must not be printed on the card before the player answers.
  const hidePinyin = !feedback && question.type === 'pinyin'
  const hideMeaning = !feedback && question.type === 'meaning'
  const correctAnswer = question.type === 'character' ? word.hanzi : word.answer

  useEffect(() => {
    if (!mountRef.current) return
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: mountRef.current,
      width: 640,
      height: 300,
      backgroundColor: '#101827',
      pixelArt: true,
      antialias: false,
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [PixelScene],
      render: { pixelArt: true, roundPixels: true }
    })
    game.events.once(Phaser.Core.Events.READY, () => {
      sceneRef.current = game.scene.getScene('PixelScene') as PixelScene
      sceneRef.current.setEnemy(ENEMIES[enemyIndexRef.current].sprite)
    })
    return () => { game.destroy(true); sceneRef.current = null }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...save, hp: battleHp })) } catch { /* storage unavailable */ }
  }, [save, battleHp])

  const startFight = (index: number, floor: number) => {
    answerLock.current = false
    setEnemyIndex(index)
    sceneRef.current?.setEnemy(ENEMIES[index].sprite)
    const max = enemyMaxHp(ENEMIES[index], floor)
    setEnemyMax(max); setEnemyHp(max)
    setBattleState('fighting'); setFeedback(null); setStreak(0)
    setWord(prev => pickWord(WORDS, save.missed, prev.hanzi))
    sceneRef.current?.resetMonster()
  }
  const nextEnemy = () => startFight(ENEMIES.indexOf(enemyForFloor(ENEMIES, save.floor)), save.floor)

  const answerQuestion = (answer: string) => {
    if (answerLock.current || feedback || battleState !== 'fighting') return
    answerLock.current = true
    const isCorrect = answer === correctAnswer
    const r = resolveAnswer({
      save, battleHp, enemyHp, enemy, gear: equipped, word, isCorrect, allGear: GEAR,
      roll: { drop: Math.random(), item: Math.random() }
    })
    sceneRef.current?.playHit('monster', r.playerDamage)
    if (r.outcome === 'victory') sceneRef.current?.hideMonster()
    else sceneRef.current?.playHit('hero', enemy.damage)

    setEnemyHp(r.enemyHp); setBattleHp(r.battleHp); setSave(r.save); setBattleState(r.outcome === 'continue' ? 'fighting' : r.outcome)
    setStreak(s => isCorrect ? s + 1 : 0)
    setFeedback({
      correct: isCorrect, word,
      text: isCorrect
        ? `Direct hit! ${word.hanzi} (${word.pinyin}) means “${word.meaning}”.`
        : `Not quite. ${word.hanzi} is ${word.pinyin} — “${word.meaning}”. ${r.outcome === 'victory' ? 'It was still enough to win!' : 'The monster counterattacks! This word will come back for review.'}`
    })
    if (r.outcome === 'victory') {
      setReward({ xp: r.xpGained, gold: r.goldGained })
      setToast(r.leveledUp ? `Level up! You are now level ${r.save.level}.`
        : r.loot ? `Loot found: ${r.loot.icon} ${r.loot.name}!`
          : r.duplicateGold ? 'Duplicate gear converted into 4 bonus gold!' : 'Dungeon cleared! Gold and XP earned.')
    }
  }

  const dismissFeedback = () => {
    setFeedback(null)
    if (battleState === 'fighting') { setWord(prev => pickWord(WORDS, save.missed, prev.hanzi)); answerLock.current = false }
  }

  const usePotion = () => {
    if (battleState !== 'fighting' || feedback) return
    const r = drinkPotion(battleHp, maxHp, save.potions)
    if (!r) return
    setBattleHp(r.battleHp); setSave(p => ({ ...p, potions: r.potions }))
    setToast('Potion used: restored up to 12 HP.')
  }

  const restartRun = () => {
    setBattleHp(maxHp)
    startFight(Math.floor(Math.random() * ENEMIES.length), save.floor)
    setToast('A new run begins. Your permanent progress remains.')
  }

  const resetSave = () => {
    if (!window.confirm('Delete all saved progress and start over?')) return
    try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
    setSave(defaultSave); setBattleHp(defaultSave.hp)
    startFight(0, 1)
    setToast('Progress reset. A fresh adventure awaits.')
  }

  const speakWord = () => {
    if (!('speechSynthesis' in window)) { setToast('Speech playback is not supported in this browser.'); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(word.hanzi)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.82
    window.speechSynthesis.speak(utterance)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">HH</span><div><strong>HANZI HUNTERS</strong><small>THE FIRST DESCENT</small></div></div>
        <div className="top-stats"><span>✦ LVL {save.level}</span><span>◈ {save.gold} G</span></div>
      </header>

      <section className="hero-strip">
        <div><p className="eyebrow">BEGINNER ADVENTURE · FLOOR {String(save.floor).padStart(2, '0')}</p><h1>The Mosslight Cavern</h1><p className="subtitle">Every word is a weapon. Every run makes you stronger.</p></div>
        <div className="progress-chip"><span>📖</span><strong>{save.learned.length}<small> / {WORDS.length} words</small></strong></div>
      </section>

      <section className="game-layout">
        <div className="left-column">
          <div className="scene-frame">
            <div className="scene-label"><span className="live-dot"></span> LIVE ENCOUNTER <span>•</span> FLOOR {String(save.floor).padStart(2, '0')}</div>
            <div className="phaser-mount" ref={mountRef} aria-label="Pixel art dungeon battle scene" />
            <div className="scene-footer"><span>✦ Mosslight Cavern</span><span>ROOM {String(save.floor).padStart(2, '0')} / ∞</span></div>
          </div>
          <div className="combatant-row">
            <div className="combatant player-card">
              <div className="combatant-head"><div className="avatar hero-avatar">⚔</div><div><strong>Wanderer</strong><small>Level {save.level} Adventurer</small></div></div>
              <div className="bar-label"><span>HP</span><span>{battleHp} / {maxHp}</span></div><div className="health-track"><div className="health-fill player-fill" style={{width:`${Math.max(0,battleHp)/maxHp*100}%`}} /></div>
              <div className="mini-stats"><span>⚔ ATK {save.attack + attackBonus}</span><span>✦ XP {save.xp}/{xpForLevel(save.level)}</span></div>
            </div>
            <div className="versus">VS</div>
            <div className="combatant enemy-card">
              <div className="combatant-head"><div className="avatar enemy-avatar">{enemy.emoji}</div><div><strong>{enemy.name}</strong><small>Dungeon creature</small></div></div>
              <div className="bar-label"><span>HP</span><span>{enemyHp} / {enemyMax}</span></div><div className="health-track"><div className="health-fill enemy-fill" style={{width:`${Math.max(0,enemyHp)/enemyMax*100}%`}} /></div>
              <div className="mini-stats"><span>☠ DMG {enemy.damage}</span><span>✦ XP {enemy.xp}</span></div>
            </div>
          </div>
          <div className="quick-actions">
            <button className="secondary-btn" onClick={usePotion} disabled={save.potions < 1 || battleHp >= maxHp || battleState !== 'fighting' || !!feedback}>🧪 Potion <b>{save.potions}</b></button>
            <button className="secondary-btn" onClick={() => setShowBag(v => !v)}>🎒 Gear <b>{equipped.length}</b></button>
            <button className="secondary-btn" onClick={() => setShowWords(v => !v)}>📚 Wordbook <b>{save.learned.length}</b></button>
          </div>
          {showBag && <div className="drawer"><div className="drawer-title">YOUR GEAR <button onClick={() => setShowBag(false)}>×</button></div>{GEAR.map(item => <div className="gear-line" key={item.name}><span className="gear-icon">{item.icon}</span><div><b>{item.name}</b><small>{item.slot} · {item.bonus}</small></div><span className={`gear-state ${save.gear.includes(item.name) ? 'owned' : 'locked'}`}>{save.gear.includes(item.name) ? '✓ Equipped' : '🔒 Not found'}</span></div>)}<p className="hint-text">Gear drops from defeated monsters. Found gear is equipped automatically and its bonuses stack.</p></div>}
          {showWords && <div className="drawer"><div className="drawer-title">WORDBOOK <button onClick={() => setShowWords(false)}>×</button></div><div className="wordbook-grid">{WORDS.filter(w => save.learned.includes(w.hanzi)).map(w => <div className="wordbook-word" key={w.hanzi}><strong>{w.hanzi}</strong><span>{w.pinyin}</span><small>{w.meaning}</small></div>)}{save.learned.length === 0 && <p className="hint-text">Answer questions correctly to discover your first words.</p>}</div></div>}
        </div>

        <div className="right-column">
          <section className="question-panel">
            <div className="panel-kicker"><span>SCROLL OF KNOWLEDGE</span><span>✧ +5 XP</span></div>
            <div className="question-title"><span className="question-icon">文</span><div><h2>{battleState === 'fighting' ? question.text : battleState === 'victory' ? 'Victory, adventurer!' : 'You have fallen...'}</h2><p>{battleState === 'fighting' ? 'Answer correctly to unleash a stronger attack.' : battleState === 'victory' ? 'The cavern rewards your growing knowledge.' : 'Rest, recover, and descend again.'}</p></div></div>
            {battleState === 'fighting' && <div className="word-card"><div className="hanzi">{word.hanzi}</div><div className="word-meta"><span className={`pinyin ${hidePinyin ? 'is-hidden' : ''}`} aria-label={hidePinyin ? 'pinyin hidden until you answer' : undefined}>{hidePinyin ? '? ? ?' : word.pinyin}</span><button className="audio-btn" onClick={speakWord} aria-label="Hear pronunciation">🔊 Listen</button></div><div className={`word-meaning ${hideMeaning ? 'is-hidden' : ''}`}>{hideMeaning ? '“ ? ”' : word.meaning}</div></div>}
            {battleState === 'fighting' && <div className="answer-list">{question.options.map((option, i) => <button key={`${option}-${i}`} className={`answer-btn ${feedback && option === correctAnswer ? 'answer-correct' : ''}`} disabled={!!feedback} onClick={() => answerQuestion(option)}><span className="answer-key">{String.fromCharCode(65+i)}</span><span>{option}</span><span className="answer-arrow">↗</span></button>)}</div>}
            {feedback && <div className={`feedback-box ${feedback.correct ? 'good' : 'bad'}`}><strong>{feedback.correct ? '✦ Excellent strike!' : '↻ Keep learning!'}</strong><p>{feedback.text}</p><small>{feedback.word.note}</small><button className="continue-btn" onClick={dismissFeedback}>Continue →</button></div>}
            {battleState === 'victory' && <div className="end-panel"><div className="reward-row"><span>✦ XP earned</span><b>+{reward.xp}</b></div><div className="reward-row"><span>◈ Gold found</span><b>+{reward.gold} G</b></div><button className="primary-btn" onClick={nextEnemy}>Descend deeper <span>→</span></button></div>}
            {battleState === 'defeat' && <div className="end-panel"><p>Your knowledge remains, even after a tough encounter. Your permanent gear and XP are safe.</p><button className="primary-btn" onClick={restartRun}>Start a new run <span>↻</span></button></div>}
            <div className="panel-foot"><span>🧠 Missed words come back for review</span><span>STREAK ×{streak}</span></div>
          </section>
          {toast && <div className="toast"><span>{toast}</span><button onClick={() => setToast('')}>×</button></div>}
          <section className="build-panel"><div className="build-title"><div><span className="eyebrow">YOUR ADVENTURER</span><h3>Build & Progress</h3></div><span className="level-badge">LV {save.level}</span></div><div className="xp-line"><span>Experience</span><span>{save.xp} / {xpForLevel(save.level)} XP</span></div><div className="xp-track"><div style={{width:`${Math.min(100,save.xp/xpForLevel(save.level)*100)}%`}} /></div><div className="build-grid"><div><span className="build-icon">⚔️</span><small>Attack</small><strong>{save.attack+attackBonus}</strong></div><div><span className="build-icon">🛡️</span><small>Gear owned</small><strong>{save.gear.length}</strong></div><div><span className="build-icon">📖</span><small>Words found</small><strong>{save.learned.length}</strong></div></div><button className="reset-btn" onClick={resetSave}>Reset prototype save</button></section>
        </div>
      </section>
      <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.1</span><span>Learn a word. Win a fight. Go deeper.</span></footer>
    </main>
  )
}