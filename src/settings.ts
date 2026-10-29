// Player preferences. Separate from the game save, so resetting or importing progress never changes them.
import type { AutoContinue } from './game/flow.ts'

export type Settings = { muted: boolean; autoContinue: AutoContinue }
export const SETTINGS_KEY = 'hanzi-hunters-settings-v1'
export const DEFAULT_SETTINGS: Settings = { muted: false, autoContinue: 'learning' }

export function sanitizeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    muted: r.muted === true,
    autoContinue: r.autoContinue === 'learning' || r.autoContinue === 'relaxed' || r.autoContinue === 'off' || r.autoContinue === 'quick' ? r.autoContinue : DEFAULT_SETTINGS.autoContinue
  }
}

export function loadSettings(storage: Pick<Storage, 'getItem'>): Settings {
  try { return sanitizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null')) } catch { return { ...DEFAULT_SETTINGS } }
}
