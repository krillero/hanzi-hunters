// Export / import of the save so progress can survive "clear site data" or a move to another browser. Pure.
import type { Saved } from './types.ts'
import { SUPPORTED_VERSIONS, sanitizeSave } from './save.ts'

export const BACKUP_FORMAT = 'hanzi-hunters-backup'

export function serializeBackup(save: Saved, now = new Date()): string {
  return JSON.stringify({ format: BACKUP_FORMAT, exportedAt: now.toISOString(), save }, null, 2)
}

/** Accepts a backup file or a bare save of a supported format (v1 is migrated); returns a validated Saved, or null if it is not one. */
export function parseBackup(text: string, now: number = Date.now()): Saved | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const inner = o.format === BACKUP_FORMAT && o.save && typeof o.save === 'object' ? (o.save as Record<string, unknown>) : o
  return typeof inner.version === 'number' && SUPPORTED_VERSIONS.includes(inner.version) && inner.meta && typeof inner.meta === 'object' ? sanitizeSave(inner, undefined, undefined, now) : null
}
