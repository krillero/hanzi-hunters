import { useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { PixelScene } from './game/PixelScene'
import { ENEMIES, GEAR, WORDS, type Word } from './data'

type Gear = typeof GEAR[number]
type Saved = {
  level: number; xp: number; gold: number; maxHp: number; hp: number
  attack: number; learned: string[]; gear: string[]; potions: number; floor: number
}
const SAVE_KEY = 'hanzi-hunters-save-v1'
const defaultSave: Saved = { level: 1, xp: 0, gold: 0, maxHp: 30, hp: 30, attack: 5, learned: [], gear: [], potions: 1, floor: 1 }

function readSave(): Saved {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
    return parsed ? { ...defaultSave, ...parsed } : defaultSave
  } catch { return defaultSave }
}
function shuffle<T>(items: T[]) { return [...items].sort(() => Math.random() - 0.5) }

export default function App() {
  const sceneRef = useRef<PixelScene | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [save, setSave] = useState<Saved>(readSave)
  const [enemyIndex, setEnemyIndex] = useState(0)
  const [enemyHp, setEnemyHp] = useState(ENEMIES[0].hp)
  const [battleHp, setBattleHp] = useState(save.hp)
  const [wordIndex, setWordIndex] = useState(0)
  const [questionType, setQuestionType] = useState<'meaning' | 'pinyin' | 'character'>('meaning')
  const [feedback, setFeedback] = useState<{correct:boolean; text:string; word:Word} | null>(null)
  const [battleState, setBattleState] = useState<'fighting' | 'victory' | 'defeat'>('fighting')
  const [toast, setToast] = useState('')
  const [showBag, setShowBag] = useState(false)
  const [showWords, setShowWords] = useState(false)

  const enemy = ENEMIES[enemyIndex]
  const word = WORDS[wordIndex]
  const equipped = useMemo(() => GEAR.filter(item => save.gear.includes(item.name)), [save.gear])
  const attackBonus = equipped.reduce((n, item) => n + item.attack, 0)
  const hpBonus = equipped.reduce((n, item) => n + item.hp, 0)

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
    game.events.once('ready', () => {})
    game.scene.start('PixelScene')
    const onReady = () => { sceneRef.current = game.scene.getScene('PixelScene') as PixelScene }
    game.events.on('step', onReady)
    return () => { game.destroy(true); sceneRef.current = null }
  }, [])

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...save, hp: battleHp }))
  }, [save, battleHp])

  const patchSave = (patch: Partial<Saved>) => setSave(prev => ({ ...prev, ...patch }))
  const chooseWord = () => {
    let next = Math.floor(Math.random() * WORDS.length)
    if (WORDS.length > 1 && next === wordIndex) next = (next + 1) % WORDS.length
    setWordIndex(next)
    // Keep the question mode aligned with this word's answer choices.
    setQuestionType(WORDS[next].prompt)
  }
  const nextEnemy = () => {
    const idx = (enemyIndex + 1) % ENEMIES.length
    setEnemyIndex(idx)
    setEnemyHp(ENEMIES[idx].hp + Math.max(0, save.floor - 1) * 3)
    setBattleState('fighting')
    setFeedback(null)
    chooseWord()
    sceneRef.current?.resetMonster()
  }

  const answerQuestion = (answer: string) => {
    if (feedback || battleState !== 'fighting') return
    const isCorrect = answer === word.answer
    const newLearned = isCorrect && !save.learned.includes(word.hanzi) ? [...save.learned, word.hanzi] : save.learned
    const gearDrop = Math.random() < 0.24 ? GEAR[Math.floor(Math.random() * GEAR.length)] : null
    const playerDamage = isCorrect ? 8 + save.attack + attackBonus : 2
    const remainingEnemyHp = Math.max(0, enemyHp - playerDamage)
    const nextPlayerHp = Math.max(0, battleHp - (isCorrect && remainingEnemyHp === 0 ? 0 : enemy.damage))
    sceneRef.current?.playHit('monster', playerDamage)
    if (remainingEnemyHp === 0) sceneRef.current?.hideMonster()
    else sceneRef.current?.playHit('hero', enemy.damage)

    setEnemyHp(remainingEnemyHp)
    setBattleHp(nextPlayerHp)
    setFeedback({
      correct: isCorrect,
      word,
      text: isCorrect
        ? `Direct hit! ${word.hanzi} means “${word.meaning}”.`
        : `Not quite. ${word.hanzi} is ${word.pinyin} — “${word.meaning}”. The monster counterattacks!`
    })

    let xp = save.xp + (isCorrect ? 5 : 2)
    let level = save.level
    let maxHp = save.maxHp + hpBonus
    let gold = save.gold
    let potions = save.potions
    let floor = save.floor
    let gear = save.gear

    if (remainingEnemyHp === 0) {
      xp += enemy.xp
      gold += enemy.gold + (equipped.some(i => i.name === 'Lucky Coin') ? 3 : 0)
      floor += 1
      if (Math.random() < 0.65) {
        const item = gearDrop || GEAR[Math.floor(Math.random() * GEAR.length)]
        if (!gear.includes(item.name)) {
          gear = [...gear, item.name]
          setToast(`Loot found: ${item.icon} ${item.name}!`)
        } else {
          gold += 4
          setToast('Duplicate gear converted into 4 bonus gold!')
        }
      } else setToast('Dungeon cleared! Gold and XP earned.')
      if (xp >= level * 30) {
        xp -= level * 30
        level += 1
        maxHp += 5
        setBattleHp(h => Math.min(maxHp, h + 8))
        setToast(`Level up! You are now level ${level}.`)
      }
      setBattleState('victory')
    } else if (nextPlayerHp <= 0) {
      setBattleState('defeat')
    }

    patchSave({ xp, level, maxHp: Math.max(30, maxHp - hpBonus), gold, potions, floor, gear, learned: newLearned })
  }

  const usePotion = () => {
    if (save.potions < 1 || battleHp >= save.maxHp + hpBonus || battleState !== 'fighting') return
    const healed = Math.min(save.maxHp + hpBonus, battleHp + 12)
    setBattleHp(healed)
    patchSave({ potions: save.potions - 1 })
    setToast('Potion used: restored up to 12 HP.')
  }

  const restartRun = () => {
    setBattleHp(Math.max(15, save.maxHp + hpBonus))
    const nextIndex = Math.floor(Math.random() * ENEMIES.length)
    setEnemyIndex(nextIndex)
    setEnemyHp(ENEMIES[nextIndex].hp + Math.max(0, save.floor - 1) * 3)
    setBattleState('fighting')
    setFeedback(null)
    setToast('A new run begins. Your permanent progress remains.')
    chooseWord()
    sceneRef.current?.resetMonster()
  }

  const question = questionType === 'meaning'
    ? `What does ${word.hanzi} mean?`
    : questionType === 'pinyin'
      ? `Choose the correct pinyin for ${word.hanzi}`
      : `Which character means “${word.meaning}”?`
  const options = questionType === 'meaning'
    ? word.choices
    : questionType === 'pinyin'
      ? word.choices
      : shuffle(WORDS.filter(w => w.hanzi !== word.hanzi).slice(0, 3).map(w => w.hanzi).concat(word.hanzi))

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
              <div className="bar-label"><span>HP</span><span>{battleHp} / {save.maxHp + hpBonus}</span></div><div className="health-track"><div className="health-fill player-fill" style={{width:`${Math.max(0,battleHp)/(save.maxHp+hpBonus)*100}%`}} /></div>
              <div className="mini-stats"><span>⚔ ATK {save.attack + attackBonus}</span><span>✦ XP {save.xp}/{save.level*30}</span></div>
            </div>
            <div className="versus">VS</div>
            <div className="combatant enemy-card">
              <div className="combatant-head"><div className="avatar enemy-avatar">{enemy.emoji}</div><div><strong>{enemy.name}</strong><small>Dungeon creature</small></div></div>
              <div className="bar-label"><span>HP</span><span>{enemyHp} / {enemy.hp + Math.max(0, save.floor - 1) * 3}</span></div><div className="health-track"><div className="health-fill enemy-fill" style={{width:`${Math.max(0,enemyHp)/(enemy.hp+Math.max(0,save.floor-1)*3)*100}%`}} /></div>
              <div className="mini-stats"><span>☠ DMG {enemy.damage}</span><span>✦ XP {enemy.xp}</span></div>
            </div>
          </div>
          <div className="quick-actions">
            <button className="secondary-btn" onClick={usePotion} disabled={save.potions < 1 || battleHp >= save.maxHp + hpBonus || battleState !== 'fighting'}>🧪 Potion <b>{save.potions}</b></button>
            <button className="secondary-btn" onClick={() => setShowBag(v => !v)}>🎒 Gear <b>{equipped.length}</b></button>
            <button className="secondary-btn" onClick={() => setShowWords(v => !v)}>📚 Wordbook <b>{save.learned.length}</b></button>
          </div>
          {showBag && <div className="drawer"><div className="drawer-title">YOUR GEAR <button onClick={() => setShowBag(false)}>×</button></div>{GEAR.map(item => <div className="gear-line" key={item.name}><span className="gear-icon">{item.icon}</span><div><b>{item.name}</b><small>{item.slot} · {item.bonus}</small></div><button disabled={save.gear.includes(item.name)} onClick={() => {patchSave({gear:[...save.gear,item.name]});setToast(`${item.name} equipped!`)}}>{save.gear.includes(item.name) ? 'Owned' : 'Equip'}</button></div>)}<p className="hint-text">Prototype note: found gear is permanently unlocked and its bonuses stack.</p></div>}
          {showWords && <div className="drawer"><div className="drawer-title">WORDBOOK <button onClick={() => setShowWords(false)}>×</button></div><div className="wordbook-grid">{WORDS.filter(w => save.learned.includes(w.hanzi)).map(w => <div className="wordbook-word" key={w.hanzi}><strong>{w.hanzi}</strong><span>{w.pinyin}</span><small>{w.meaning}</small></div>)}{save.learned.length === 0 && <p className="hint-text">Answer questions correctly to discover your first words.</p>}</div></div>}
        </div>

        <div className="right-column">
          <section className="question-panel">
            <div className="panel-kicker"><span>SCROLL OF KNOWLEDGE</span><span>✧ +5 XP</span></div>
            <div className="question-title"><span className="question-icon">文</span><div><h2>{battleState === 'fighting' ? question : battleState === 'victory' ? 'Victory, adventurer!' : 'You have fallen...'}</h2><p>{battleState === 'fighting' ? 'Answer correctly to unleash a stronger attack.' : battleState === 'victory' ? 'The cavern rewards your growing knowledge.' : 'Rest, recover, and descend again.'}</p></div></div>
            {battleState === 'fighting' && <div className="word-card"><div className="hanzi">{word.hanzi}</div><div className="word-meta"><span className="pinyin">{word.pinyin}</span><button className="audio-btn" onClick={speakWord} aria-label="Hear pronunciation">🔊 Listen</button></div><div className="word-meaning">{word.meaning}</div></div>}
            {battleState === 'fighting' && <div className="answer-list">{options.map((option, i) => <button key={`${option}-${i}`} className={`answer-btn ${feedback && option === word.answer ? 'answer-correct' : ''}`} disabled={!!feedback} onClick={() => answerQuestion(option)}><span className="answer-key">{String.fromCharCode(65+i)}</span><span>{option}</span><span className="answer-arrow">↗</span></button>)}</div>}
            {feedback && <div className={`feedback-box ${feedback.correct ? 'good' : 'bad'}`}><strong>{feedback.correct ? '✦ Excellent strike!' : '↻ Keep learning!'}</strong><p>{feedback.text}</p><small>{feedback.word.note}</small><button className="continue-btn" onClick={() => {setFeedback(null);if(battleState === 'fighting') chooseWord()}}>Continue →</button></div>}
            {battleState === 'victory' && <div className="end-panel"><div className="reward-row"><span>✦ XP earned</span><b>+{enemy.xp}</b></div><div className="reward-row"><span>◈ Gold found</span><b>+{enemy.gold} G</b></div><button className="primary-btn" onClick={nextEnemy}>Descend deeper <span>→</span></button></div>}
            {battleState === 'defeat' && <div className="end-panel"><p>Your knowledge remains, even after a tough encounter. Your permanent gear and XP are safe.</p><button className="primary-btn" onClick={restartRun}>Start a new run <span>↻</span></button></div>}
            <div className="panel-foot"><span>🧠 Wrong answers return later for review</span><span>STREAK ×{feedback?.correct ? 1 : 0}</span></div>
          </section>
          {toast && <div className="toast"><span>{toast}</span><button onClick={() => setToast('')}>×</button></div>}
          <section className="build-panel"><div className="build-title"><div><span className="eyebrow">YOUR ADVENTURER</span><h3>Build & Progress</h3></div><span className="level-badge">LV {save.level}</span></div><div className="xp-line"><span>Experience</span><span>{save.xp} / {save.level*30} XP</span></div><div className="xp-track"><div style={{width:`${Math.min(100,save.xp/(save.level*30)*100)}%`}} /></div><div className="build-grid"><div><span className="build-icon">⚔️</span><small>Attack</small><strong>{save.attack+attackBonus}</strong></div><div><span className="build-icon">🛡️</span><small>Gear owned</small><strong>{save.gear.length}</strong></div><div><span className="build-icon">📖</span><small>Words found</small><strong>{save.learned.length}</strong></div></div><button className="reset-btn" onClick={() => {localStorage.removeItem(SAVE_KEY);setSave(defaultSave);setBattleHp(defaultSave.hp);setEnemyIndex(0);setEnemyHp(ENEMIES[0].hp);setBattleState('fighting');setFeedback(null);setToast('Progress reset. A fresh adventure awaits.')}}>Reset prototype save</button></section>
        </div>
      </section>
      <footer className="footer"><span>HANZI HUNTERS <b>·</b> PROTOTYPE 0.1</span><span>Learn a word. Win a fight. Go deeper.</span></footer>
    </main>
  )
}