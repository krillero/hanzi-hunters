import { useEffect, useRef } from 'react'
import { WORDS } from './data'
import { accuracyPct, type RunStats } from './game/runStats'

type Props = {
  kind: 'floor' | 'defeat'
  floor: number
  stats: RunStats
  gold: number
  onContinue: () => void
  onClose: () => void
}

const wordTile = (h: string) => {
  const w = WORDS.find(x => x.hanzi === h)
  return <div className="sum-tile" key={h}><span>{h}</span><small>{w?.pinyin ?? ''}</small></div>
}

/** Floor-clear and defeat card: what you learned, not just what you earned. Real modal styling, no new design tokens. */
export default function SummaryModal({ kind, floor, stats, gold, onContinue, onClose }: Props) {
  const btn = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key); btn.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const won = kind === 'floor'
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal summary-card" role="dialog" aria-modal="true" aria-labelledby="sum-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="sum-icon" aria-hidden="true">{won ? '🏆' : '💀'}</span>
          <div className="ex-titles"><h2 id="sum-title">{won ? `Floor ${floor} cleared` : `You fell on floor ${floor}`}</h2><small>{won ? `${stats.total} answer${stats.total === 1 ? "" : "s"} this floor` : `${gold} gold banked for upgrades`}</small></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <section>
            <h3>{won ? 'What you learned' : 'What you learned this run'}</h3>
            <div className="sum-row">
              <div className="sum-stat"><b>{stats.newWords.length}</b><small>NEW WORDS</small></div>
              <div className="sum-stat"><b>{stats.leveled.length}</b><small>LEVELED UP</small></div>
              <div className="sum-stat good"><b>{stats.mastered.length}</b><small>MASTERED</small></div>
            </div>
          </section>
          <section>
            <h3>{won ? 'Floor stats' : 'Run stats'}</h3>
            <div className="sum-row">
              <div className="sum-stat"><b>🔥 {stats.bestStreak}</b><small>BEST STREAK</small></div>
              <div className="sum-stat"><b>{accuracyPct(stats)}%</b><small>ACCURACY</small></div>
              <div className="sum-stat"><b>🪙 {stats.gold}</b><small>GOLD FOUND</small></div>
            </div>
          </section>
          {stats.mastered.length > 0 && <section><h3>Mastered</h3><div className="sum-tiles">{stats.mastered.map(wordTile)}</div></section>}
          {stats.missed.length > 0 && <section><h3>Review soon</h3><div className="sum-tiles">{stats.missed.slice(0, 8).map(wordTile)}</div><p className="hint-text">Words you missed come back first.</p></section>}
          <section><button ref={btn} className="bar-btn main sum-go" onClick={onContinue}>{won ? `Descend to floor ${floor + 1}` : 'Go to camp'} <span aria-hidden="true">{won ? '→' : '⛺'}</span></button></section>
        </div>
      </div>
    </div>
  )
}
