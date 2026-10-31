// Little coloured dots that fly from the defeated monster into the gold counter / XP bar. Pure DOM (Web Animations API),
// purely decorative: the real numbers are already in the reward chips, and nothing here can block a tap.
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export function flyMotes(from: { x: number; y: number }, target: Element | null, color: string, count: number) {
  if (!target || reduced() || typeof document.body.animate !== 'function') return
  const r = target.getBoundingClientRect(); const tx = r.left + r.width / 2, ty = r.top + r.height / 2
  for (let i = 0; i < count; i++) {
    const m = document.createElement('i')
    m.setAttribute('aria-hidden', 'true')
    m.style.cssText = `position:fixed;z-index:80;left:0;top:0;width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};pointer-events:none`
    document.body.appendChild(m)
    const dx = (i - count / 2) * 9, rise = 18 + (i % 3) * 8
    const a = m.animate([
      { transform: `translate(${from.x}px,${from.y}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${from.x + dx}px,${from.y - rise}px) scale(1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${tx}px,${ty}px) scale(.5)`, opacity: 0.2 }
    ], { duration: 650 + i * 45, delay: i * 35, easing: 'cubic-bezier(.4,.0,.6,1)', fill: 'both' })
    a.onfinish = () => m.remove()
    window.setTimeout(() => m.remove(), 1600)   // never leave a stranded dot if the animation is cancelled
  }
  window.setTimeout(() => { try { target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 260 }) } catch { /* optional */ } }, 650)
}
