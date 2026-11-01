// Repeat protection for encounters and boss trials: the last RECENT_MAX ids shown ("scene:<id>", "trial:<id>"), newest first,
// saved as Saved.recentEvents. Offers prefer anything not in the list and fall back to the full pool only when everything is recent.
export const RECENT_MAX = 12

/** Add `key` as the newest entry (moving it up if it was already there). */
export const noteRecent = (recent: string[] | undefined, key: string): string[] => [key, ...(recent ?? []).filter(k => k !== key)].slice(0, RECENT_MAX)

/** The items whose key is not recent, or every item when all of them are recent. */
export function freshFirst<T>(items: T[], key: (t: T) => string, recent: string[] | undefined): T[] {
  const r = new Set(recent ?? []), fresh = items.filter(t => !r.has(key(t)))
  return fresh.length ? fresh : items
}

export function cleanRecent(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 200))].slice(0, RECENT_MAX)
}
