// Search ranking for the review screen. Pure. Exact matches come first; English is matched from word starts only, so "ge"
// finds 个 ge and 哥哥 gēge, not "younger" or "age".
import { toneless } from '../content/recordings.ts'
import type { SourceRecord } from './types.ts'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 0 = no match; higher = better. */
export function searchScore(r: SourceRecord, query: string): number {
  const raw = query.trim()
  if (!raw) return 1
  const q = raw.toLowerCase()
  const c = r.candidate
  const tq = toneless(q).replace(/\s+/g, '')
  const readings = c.readings.map(p => p.toLowerCase())
  const tl = readings.map(p => toneless(p).replace(/\s+/g, ''))
  if (r.originalId.toLowerCase() === q || r.key.toLowerCase() === q) return 100
  if (c.simplified.includes(raw) || c.traditional.includes(raw)) return 95
  if (readings.some(p => p.replace(/\s+/g, '') === q.replace(/\s+/g, ''))) return 90          // with tone marks: gè
  if (tl.includes(tq)) return 85                                                               // toneless: ge
  if (c.meanings.some(m => m.toLowerCase() === q)) return 80
  if (c.simplified.some(s => s.includes(raw)) || c.traditional.some(s => s.includes(raw))) return 60
  if (tq.length > 0 && tl.some(p => p.startsWith(tq))) return 50
  if (c.meanings.some(m => new RegExp(`(^|[^a-z])${esc(q)}`, 'i').test(m))) return 40       // English, from a word start
  if (r.originalId.toLowerCase().includes(q)) return 30
  if (tq.length > 1 && tl.some(p => p.includes(tq))) return 20
  return 0
}
