import { useEffect, useRef } from 'react'
import { BOSS_INFO, BOSSES, type BossId } from './data'
import { SHIELD_SEGMENTS } from './game/rules'

/** Intro card shown once when a boss fight starts: the boss, its one rule, its phases and what it drops. */
export default function BossIntro({ boss, onClose }: { boss: BossId; onClose: () => void }) {
  const go = useRef<HTMLButtonElement | null>(null)
  const info = BOSS_INFO[boss]
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key); go.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const sprite = `${import.meta.env.BASE_URL}assets/enemies/${BOSSES[boss].sprite}.png`
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal boss-intro" role="dialog" aria-modal="true" aria-labelledby="boss-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="sum-icon" aria-hidden="true">{BOSSES[boss].emoji}</span>
          <div className="ex-titles"><h2 id="boss-title">Boss: {info.title}</h2><small>Floor boss · replaces the elite</small></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="boss-portrait" aria-hidden="true"><div className={`boss-sprite ${boss}`} style={{ backgroundImage: `url(${sprite})` }} /></div>
          <section><h3>How it works</h3><p>{info.rule}</p>
            {boss === 'golem' && <div className="boss-shield static" aria-hidden="true">SHIELD {Array.from({ length: SHIELD_SEGMENTS }, (_, i) => <i key={i} />)}</div>}
          </section>
          <section><h3>Phases</h3><ol className="boss-phases">{info.phases.map(p => <li key={p}>{p}</li>)}</ol></section>
          <section><h3>Reward</h3><p>{info.reward}</p></section>
          <section><button ref={go} className="bar-btn main sum-go" onClick={onClose}>Fight <span aria-hidden="true">→</span></button></section>
        </div>
      </div>
    </div>
  )
}
