import { useState } from 'react'
import { WORDS } from './data'
import { BRANCHES, branchNodes, nodeState, upgradeCost } from './game/upgrades'
import { MAX_LV, masteredCount } from './game/mastery'
import type { Saved } from './game/types'
import AppData from './AppData'
import { BADGES } from './game/habit'

type Props = { save: Saved; warmup: { available: boolean; done: boolean; words: string[] }; onWarmup: () => void; onBuy: (id: string) => void; onStart: () => void; onReset: () => void; message: string; outdated: boolean; onUpdate: () => void; onExport: () => void; onImport: (file: File) => void }

export default function CampScreen({ save, warmup, onWarmup, onBuy, onStart, onReset, message, outdated, onUpdate, onExport, onImport }: Props) {
  const { meta, lastRun, mastery, habit } = save
  const [tab, setTab] = useState(BRANCHES[0].id)
  const owned = (branch: string) => branchNodes(branch).filter(n => meta.upgrades.includes(n.id)).length

  return (
    <section className="camp" aria-label="Base camp">
      <div className="camp-head">
        <p className="eyebrow">{lastRun ? 'RUN OVER' : 'BASE CAMP'}</p>
        <h1>{lastRun ? `You fell on floor ${lastRun.floor}` : 'Prepare for the descent'}</h1>
        {lastRun
          ? <div className="camp-summary">
              <div><small>Floor</small><b>{lastRun.floor}</b></div>
              <div><small>Slain</small><b>{lastRun.kills}</b></div>
              <div><small>Level</small><b>{lastRun.level}</b></div>
              <div className="gain"><small>Gold banked</small><b>+{lastRun.goldBanked}</b></div>
            </div>
          : <p className="subtitle">Spend gold on permanent upgrades. Every run starts at level 1 with no gear, but your upgrades and word mastery stay.</p>}
      </div>

      <div className="camp-bank" role="status">
        <span className="bank-gold">🪙 {meta.gold} G</span>
        <span>Best floor {meta.bestFloor}</span>
        <span>Runs {meta.runs}</span>
        <span>Mastered {masteredCount(mastery)}/{WORDS.length}</span>
      </div>
      <div className="camp-counters" role="status" aria-label="Your learning progress">
        <div><b>{Object.keys(mastery).length}</b><small>WORDS KNOWN</small></div>
        <div className="good"><b>{masteredCount(mastery)}</b><small>MASTERED</small></div>
        <div><b>{habit.daysPlayed}</b><small>DAYS PLAYED</small></div>
      </div>
      {warmup.available && (
        <div className="warmup-offer">
          <div><span className="eyebrow">DAILY WARM-UP · OPTIONAL</span><strong>Review {warmup.words.length} words · no HP risk</strong><small>{warmup.words.join(' · ')}</small></div>
          <button className="bar-btn main" onClick={onWarmup}>Start</button>
        </div>
      )}
      {!warmup.available && warmup.done && <p className="hint-text warmup-done">✓ Today's warm-up is done. A new one is ready tomorrow.</p>}
      {message && <div className="toast camp-toast"><span>{message}</span></div>}

      <div className="badges" aria-label="Milestones">
        {BADGES.map(b => { const got = habit.badges.includes(b.id); return <span key={b.id} className={`badge ${got ? 'got' : ''}`} title={`${b.name}: ${b.desc}`} aria-label={`${b.name}, ${got ? 'earned' : 'not yet: ' + b.desc}`}><i aria-hidden="true">{b.icon}</i>{b.name}</span> })}
      </div>

      <div className="tree-tabs" role="tablist">
        {BRANCHES.map(b => (
          <button key={b.id} role="tab" aria-selected={tab === b.id} className={tab === b.id ? 'on' : ''} onClick={() => setTab(b.id)}>
            <span>{b.icon}</span>{b.name}<small>{owned(b.id)}/5</small>
          </button>
        ))}
      </div>

      <div className="tree">
        {BRANCHES.map(b => (
          <div key={b.id} className={`branch ${tab === b.id ? 'show' : ''}`}>
            <div className="branch-head"><span className="branch-icon">{b.icon}</span><div><strong>{b.name}</strong><small>{b.tagline}</small></div><span className="branch-count">{owned(b.id)}/5</span></div>
            <ol>
              {branchNodes(b.id).map(n => {
                const state = nodeState(meta.upgrades, n)
                const cost = upgradeCost(n.tier)
                const canBuy = state === 'available' && meta.gold >= cost
                return (
                  <li key={n.id} className={`node ${state} ${canBuy ? 'affordable' : ''}`}>
                    <button disabled={!canBuy} onClick={() => onBuy(n.id)} aria-label={`${n.name}, tier ${n.tier}, ${n.desc}, ${state === 'owned' ? 'owned' : `${cost} gold`}`}>
                      <span className="node-icon">{n.icon}</span>
                      <span className="node-text"><b>{n.name}</b><small>{n.desc}</small></span>
                      <span className="node-cost">
                        {state === 'owned' ? '✓' : state === 'locked' ? `🔒 ${cost}` : canBuy ? `🪙 ${cost}` : `🪙 ${cost}`}
                        {state === 'available' && !canBuy && <small>need {cost - meta.gold}</small>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>

      <button className="primary-btn camp-start" onClick={onStart}>Start new run <span>→</span></button>
      <AppData outdated={outdated} onUpdate={onUpdate} onExport={onExport} onImport={onImport} />
      <button className="reset-btn" onClick={onReset}>Reset ALL progress</button>
      <p className="hint-text camp-note">Max mastery level is {MAX_LV}. Upgrades never answer questions for you.</p>
    </section>
  )
}
