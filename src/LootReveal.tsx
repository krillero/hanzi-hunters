import { useEffect, useRef } from 'react'
import type { GearItem } from './data'
import { compareGear, rarityOf, type StatRow } from './game/rarity'

type Props = {
  item: GearItem
  current: GearItem | null            // what is worn in that slot now (null = nothing)
  choice: boolean                     // a trade-off: the player decides. Otherwise the item is already worn.
  onEquip: () => void
  onClose: () => void
}

const fmt = (v: number, f: StatRow['fmt']) => (f === 'pct' ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v > 0 ? '+' : ''}${v}`)

/**
 * Chest reveal. One item per slot, so there is nothing to keep in a bag:
 *  - an item that is simply better (or fills an empty slot) is already worn: one button, "Nice";
 *  - a trade-off asks "Replace X?" with the stats that change, and two buttons.
 * Each fact appears once: the stat rows are the description.
 */
export default function LootReveal({ item, current, choice, onEquip, onClose }: Props) {
  const rarity = rarityOf(item)
  const rows = compareGear(item, current)
  const go = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key); go.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className={`modal loot-reveal r-${rarity}`} role="dialog" aria-modal="true" aria-labelledby="loot-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="ex-titles"><h2 id="loot-title">{choice && current ? `Replace ${current.name}?` : 'Equipped'}</h2><small>{item.slot} · {item.boss ? 'boss reward' : 'found in a chest'}</small></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="loot-hero">
            <div className="loot-icon" aria-hidden="true">{item.icon}</div>
            <strong className="loot-name">{item.name}</strong>
            <span className={`loot-rarity r-${rarity}`}>{rarity.toUpperCase()}</span>
          </div>
          <div className="loot-compare">
            {rows.map(r => (
              <div key={r.label} className={`loot-row ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}`}>
                <span>{r.label}</span>
                <span className="loot-vals">{current ? `${fmt(r.now, r.fmt)} → ` : ''}<b>{fmt(r.next, r.fmt)}</b></span>
                <span className="loot-delta" aria-label={r.delta > 0 ? 'better' : r.delta < 0 ? 'worse' : 'same'}>{r.delta > 0 ? '▲' : r.delta < 0 ? '▼' : '='}</span>
              </div>
            ))}
          </div>
          <section className="loot-actions">
            {choice
              ? <><button className="bar-btn main" ref={go} onClick={() => { onEquip(); onClose() }}>Replace</button><button className="bar-btn ghost" onClick={onClose}>Keep {current?.name ?? 'mine'}</button></>
              : <button ref={go} className="bar-btn main" onClick={onClose}>Nice</button>}
          </section>
        </div>
      </div>
    </div>
  )
}
