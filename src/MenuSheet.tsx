import { useEffect, useRef } from 'react'
import AppData from './AppData'
import { WORDS } from './data'
import { CLOZE, EXPLANATIONS, SOURCES } from './content'
import { reviewCounts, usedSources } from './content/provenance'
import { BADGES } from './game/habit'
import type { AutoContinue } from './game/flow'
import type { Settings } from './settings'

type Props = {
  settings: Settings; onChange: (s: Settings) => void; hasVoice: boolean
  fullscreen: { supported: boolean; on: boolean; toggle: () => void }
  tools?: { potions: number; words: number; onGear: () => void; onWords: () => void }
  progress: { bestFloor: number; runs: number; known: number; mastered: number; badges: string[] }
  outdated: boolean; onUpdate: () => void; onExport: () => void; onImport: (file: File) => void; onReset: () => void; onClose: () => void
}

const SPEEDS: { id: AutoContinue; label: string; hint: string }[] = [
  { id: 'learning', label: 'Learn first', hint: 'Lv 2 · 0.5 s' }, { id: 'quick', label: 'Quick', hint: '0.5 s' }, { id: 'relaxed', label: 'Relaxed', hint: '2.5 s' }, { id: 'off', label: 'Off', hint: 'tap' }
]

/** Settings sheet: your stats and milestones, sound, auto-continue, fullscreen, credits, backups and reset. */
export default function MenuSheet({ settings, onChange, hasVoice, fullscreen, progress, outdated, tools, onUpdate, onExport, onImport, onReset, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key); closeRef.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const rc = reviewCounts(WORDS, EXPLANATIONS, CLOZE)
  const sourcesUsed = usedSources(WORDS, EXPLANATIONS, CLOZE)
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator
  const earned = BADGES.filter(b => progress.badges.includes(b.id))
  const next = BADGES.find(b => !progress.badges.includes(b.id))
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div className="ex-titles"><h2 id="menu-title">Settings</h2></div><button className="icon-btn" ref={closeRef} onClick={onClose} aria-label="Close settings">×</button></div>
        <div className="modal-body">
          {tools && <section className="menu-tools">
            <button className="bar-btn ghost" onClick={tools.onGear}>⚔ Gear</button>
            <button className="bar-btn ghost" onClick={tools.onWords}>📚 Wordbook · {tools.words}</button>
          </section>}
          <section>
            <h3>Your stats</h3>
            <div className="menu-stats">
              <div><b>{progress.bestFloor}</b><small>Best floor</small></div>
              <div><b>{progress.runs}</b><small>Runs</small></div>
              <div><b>{progress.known}</b><small>Words learning</small></div>
              <div className="good"><b>{progress.mastered}</b><small>Mastered</small></div>
            </div>
          </section>
          <section>
            <h3 className="menu-h-row">Milestones <small>{earned.length} of {BADGES.length}</small></h3>
            {earned.length > 0 && <div className="milestones">{earned.map(b => <span key={b.id} className="milestone">{b.name}</span>)}</div>}
            <p className="hint-text">{next ? `Next: ${next.name} (${next.desc.charAt(0).toLowerCase()}${next.desc.slice(1)})` : 'All milestones earned.'}</p>
          </section>
          <section>
            <h3>Sound</h3>
            <button className={`switch-row ${settings.muted ? '' : 'on'}`} role="switch" aria-checked={!settings.muted} onClick={() => onChange({ ...settings, muted: !settings.muted })}>
              <span className="switch-label">{settings.muted ? '🔇 Spoken words off' : '🔊 Spoken words on'}</span><span className="switch-knob" aria-hidden />
            </button>
            <p className="hint-text">{settings.muted ? 'Words are not played and listening questions are skipped.' : hasVoice ? 'Words are played aloud and listening questions can appear.' : 'No Mandarin voice was found on this device, so listening questions are skipped.'}</p>
          </section>
          <section>
            <h3>Effects</h3>
            <button className={`switch-row ${settings.sfx ? 'on' : ''}`} role="switch" aria-checked={settings.sfx} onClick={() => { onChange({ ...settings, sfx: !settings.sfx }) }}>
              <span className="switch-label">{settings.sfx ? '🎵 Sound effects on' : '🎵 Sound effects off'}</span><span className="switch-knob" aria-hidden />
            </button>
            {canVibrate && <button className={`switch-row ${settings.haptics ? 'on' : ''}`} role="switch" aria-checked={settings.haptics} onClick={() => onChange({ ...settings, haptics: !settings.haptics })}>
              <span className="switch-label">{settings.haptics ? '📳 Vibration on' : '📳 Vibration off'}</span><span className="switch-knob" aria-hidden />
            </button>}
            <p className="hint-text">Hits, kills, level-ups and loot make short sounds{canVibrate ? ' and a small vibration' : ''}. These are separate from the spoken Mandarin words above.</p>
          </section>
          <section>
            <h3>Auto-continue after a right answer</h3>
            <div className="segmented" role="radiogroup" aria-label="Auto-continue speed">
              {SPEEDS.map(o => <button key={o.id} role="radio" aria-checked={settings.autoContinue === o.id} className={settings.autoContinue === o.id ? 'on' : ''} onClick={() => onChange({ ...settings, autoContinue: o.id })}>{o.label}<small>{o.hint}</small></button>)}
            </div>
            <p className="hint-text">Learn first pauses on every answer until that word reaches mastery level 2, then advances after 0.5 seconds. All modes pause after a wrong answer, defeat and clearing a floor.</p>
          </section>
          <section>
            <h3>Credits &amp; content review</h3>
            <p className="hint-text">{rc.entriesReviewed} of {rc.entries} entries, {rc.examplesReviewed} of {rc.examples} example sentences and {rc.clozeReviewed} of {rc.cloze} sentence questions have been reviewed by a person. Everything else is an unreviewed draft: treat it with care and report mistakes.</p>
            <ul className="credits">{[...sourcesUsed].map(([name, n]) => { const info = SOURCES[name]; return <li key={name}><b>{info?.title ?? name}</b> <small>({n} item{n === 1 ? '' : 's'})</small><br /><small>{info ? `${info.license}. ${info.attribution}` : 'Not registered in sources.json'}</small>{info?.url && <><br /><small>{info.url}</small></>}</li> })}</ul>
          </section>
          {fullscreen.supported && <section><h3>Screen</h3><button className="secondary-btn menu-wide" onClick={fullscreen.toggle}>{fullscreen.on ? '🗗 Exit fullscreen' : '⛶ Fullscreen'}</button></section>}
          <AppData outdated={outdated} onUpdate={onUpdate} onExport={onExport} onImport={onImport} />
          <button className="danger-btn menu-wide" onClick={onReset}>Reset all progress…</button>
        </div>
      </div>
    </div>
  )
}
