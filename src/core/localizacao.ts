/** City name for diary records — browser geolocation + reverse geocoding.
 *  Uses BigDataCloud's free reverse-geocode client (no key, CORS open,
 *  `localityLanguage=pt`): https://api.bigdatacloud.net/data/reverse-geocode-client
 *  PRIVACY: only the resolved CITY STRING is kept by the app (attached to the
 *  note/entry); coordinates never persist and are discarded after the call.
 *  Fails SILENTLY (permission denied, offline, geocoder down) → no city.
 *  The browser asks permission once; after denial we don't retry this session. */

let cached: string | undefined
let denied = false
let inFlight: Promise<string | undefined> | null = null

const TIMEOUT_MS = 8000

/** City (city → locality → state → continent, whatever resolves). */
export function getCity(): Promise<string | undefined> {
  if (cached) return Promise.resolve(cached)
  if (denied) return Promise.resolve(undefined)
  if (inFlight) return inFlight

  inFlight = new Promise<string | undefined>((resolve) => {
    if (!('geolocation' in navigator)) {
      denied = true
      resolve(undefined)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`,
        )
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`geo http ${r.status}`))))
          .then((j) => {
            cached = clean(j?.city ?? j?.locality ?? j?.principalSubdivision ?? j?.continent)
            resolve(cached)
          })
          .catch(() => resolve(undefined))
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) denied = true
        resolve(undefined)
      },
      { maximumAge: 10 * 60_000, timeout: TIMEOUT_MS },
    )
  }).finally(() => {
    inFlight = null
  })
  return inFlight
}

function clean(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && s.length <= 60 && !/POINT|^[-0-9.]+$/.test(s) ? s : undefined
}