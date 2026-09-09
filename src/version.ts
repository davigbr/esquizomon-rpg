/** App version + build — injected by Vite (`define` in vite.config.ts: version
 *  from package.json, build = commit SHA on Netlify / dev stamp). Shown in
 *  Config and recorded on every sync-log entry, so an exported log tells which
 *  BUILD each device ran (stale service workers have repeatedly caused sync
 *  bugs). */
export const APP_VERSION: string = __APP_VERSION__
export const APP_BUILD: string = __APP_BUILD__

/** Rótulo curto p/ exibição e logs: ex. "0.1.0 (66cb3dc)". */
export const APP_LABEL = `${APP_VERSION} (${APP_BUILD})`
