// Build identity + the safe "update the app without touching my progress" action.
export type BuildInfo = { commit: string; time: string }

export const BUILD: BuildInfo = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { commit: 'dev', time: '' }

export const formatBuild = (b: BuildInfo) => `${b.commit}${b.time ? ` · ${b.time.slice(0, 16).replace('T', ' ')} UTC` : ''}`

/** Fetches the deployed build id, bypassing every cache (version.json is not precached). Null when unavailable (dev, offline). */
export async function fetchLatestBuild(): Promise<BuildInfo | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const j = await res.json()
    return typeof j?.commit === 'string' ? { commit: j.commit, time: typeof j.time === 'string' ? j.time : '' } : null
  } catch { return null }
}

export const isOutdated = (latest: BuildInfo | null) => !!latest && BUILD.commit !== 'dev' && BUILD.commit !== 'local' && latest.commit !== BUILD.commit

/**
 * Forces the newest version: unregisters the service worker and deletes the offline caches, then reloads with a fresh URL.
 * The saved game lives in localStorage, which this never touches.
 */
export async function refreshApp(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map(r => r.unregister()))
  } catch { /* no service worker support */ }
  try {
    if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k)))
  } catch { /* ignore */ }
  const url = new URL(window.location.href)
  url.searchParams.set('v', String(Date.now()))
  window.location.replace(url.toString())
}
