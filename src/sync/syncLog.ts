/** Local sync diagnostic log — NEVER uploaded to the cloud.
 *
 *  Stores an append-only, timestamped list of every relevant sync event
 *  (boot, GET/PUT, merge decisions, auth/token, flush, etc.) in a SEPARATE
 *  localStorage key that is NOT part of the synced data blob. This lets the
 *  user export the log from each device and compare both sides to diagnose
 *  why data is lost/drifted between them.
 */

const LOG_KEY = 'esquizomon-rpg:sync-log'
const MAX_SYNC_LOG = 800

export interface SyncLogEntry {
  /** ISO timestamp of the event (local clock of that device). */
  ts: string
  /** Short event name, e.g. 'boot', 'get', 'put', 'merge', 'flush'. */
  event: string
  /** Human/technical detail — what happened, what was decided. */
  detail?: string
}

/** Appends an entry (most recent last) and trims to the cap. */
export function logSync(event: string, detail?: string): void {
  try {
    const next: SyncLogEntry[] = [...readSyncLog(), { ts: new Date().toISOString(), event, detail }]
    const trimmed = next.slice(-MAX_SYNC_LOG)
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed))
    // eslint-disable-next-line no-console
    console.log('[sync-log]', event, detail ?? '')
  } catch {
    /* storage blocked/full — diagnostic log is best-effort only */
  }
}

/** Returns the current log (oldest first). */
export function readSyncLog(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is SyncLogEntry =>
        typeof e === 'object' && e !== null && typeof (e as SyncLogEntry).ts === 'string' && typeof (e as SyncLogEntry).event === 'string',
    )
  } catch {
    return []
  }
}

/** Clears the local sync log (used by the Config export/clear row). */
export function clearSyncLog(): void {
  try {
    localStorage.removeItem(LOG_KEY)
  } catch {
    /* ignore */
  }
}

/** Returns the log as a pretty-printed JSON string for export/download. */
export function exportSyncLog(): string {
  const entries = readSyncLog()
  return JSON.stringify(
    {
      app: 'esquizomon-rpg',
      exportedAt: new Date().toISOString(),
      entries,
    },
    null,
    2,
  )
}