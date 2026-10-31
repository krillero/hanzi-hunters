import { useEffect, useRef } from 'react'
import type { GearItem } from './data'
import { compareGear, isUpgrade, rarityOf, type StatRow } from './game/rarity'

type Props = {
  item: GearItem
  current: GearItem | null            // what is worn in that slot now (null = nothing)
  autoEquipped: boolean               // the slot was empty, so the game already equipped it
  onEquip: () => void
  onClose: () => void
}

const fmt = (v: number, f: StatRow['fmt']) => (f === 'pct' ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v > 0 ? '+' : ''}${v}`)

/** Chest reveal with a comparison against what you wear. Never changes the HP or the fight; "Equip now" uses the normal equip action. */
export default function LootReveal({ item, current, autoEquipped, onEquip, onClose }: Props) {
  const rarity = rarityOf(item)
  const rows = compareGear(item, current)
  const better = !autoEquipped && isUpgrade(item, current)
  const keep = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key); keep.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className={`modal loot-reveal r-${rarity}`} role="dialog" aria-modal="true" aria-labelledby="loot-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="loot-head-icon" aria-hidden="true">{item.icon}</span>
          <div className="ex-titles"><h2 id="loot-title">{item.name}</h2><small>{item.slot} · {item.boss ? 'boss reward' : 'found in a chest'}</small></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="loot-hero">
            <span className={`loot-rarity r-${rarity}`}>{rarity.toUpperCase()}</span>
            <div className="loot-icon" aria-hidden="true">{item.icon}</div>
            <p className="loot-bonus">{item.bonus}</p>
          </div>
          <section>
            <h3>{current ? `Compared with ${current.name}` : 'Your slot was empty'}</h3>
            <div className="loot-compare">
              {rows.map(r => (
                <div key={r.label} className={`loot-row ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}`}>
                  <span>{r.label}</span>
                  <span className="loot-vals">{current ? `${fmt(r.now, r.fmt)} → ` : ''}<b>{fmt(r.next, r.fmt)}</b></span>
                  <span className="loot-delta" aria-label={r.delta > 0 ? 'better' : r.delta < 0 ? 'worse' : 'same'}>{r.delta > 0 ? '▲' : r.delta < 0 ? '▼' : '='}</span>
                </div>
              ))}
            </div>
            {autoEquipped && <p className="hint-text">Equipped automatically because the slot was empty.</p>}
          </section>
          <section className="loot-actions">
            <button ref={keep} className={`bar-btn ghost ${better ? '' : 'main'}`} onClick={onClose}>{autoEquipped ? 'Nice' : 'Keep in bag'}</button>
            {!autoEquipped && <button className={`bar-btn ${better ? 'main' : 'ghost'}`} onClick={() => { onEquip(); onClose() }}>Equip now</button>}
          </section>
        </div>
      </div>
    </div>
  )
}
