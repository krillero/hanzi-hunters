import { useEffect, useRef, useState } from 'react'

type Props = { hearts: number; max: number }

/**
 * The player's hearts: filled and empty hearts (run.hearts is the only player-health value).
 * A heart that was just lost or restored pulses once; screen readers get "3 of 5 hearts remaining".
 */
export default function Hearts({ hearts, max }: Props) {
  const prev = useRef(hearts)
  const [changed, setChanged] = useState<{ index: number; kind: 'lost' | 'gained' } | null>(null)
  useEffect(() => {
    if (hearts < prev.current) setChanged({ index: hearts, kind: 'lost' })
    else if (hearts > prev.current) setChanged({ index: hearts - 1, kind: 'gained' })
    prev.current = hearts
    const t = window.setTimeout(() => setChanged(null), 700)
    return () => window.clearTimeout(t)
  }, [hearts])
  return (
    <div className="hearts" role="img" aria-label={`${hearts} of ${max} hearts remaining`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={`heart ${i < hearts ? 'full' : 'empty'} ${changed?.index === i ? changed.kind : ''}`} aria-hidden="true">{i < hearts ? '♥' : '♡'}</i>
      ))}
    </div>
  )
}
