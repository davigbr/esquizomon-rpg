/** Sync diagnostic log: recorded on sync events AND never uploaded to the cloud. */
import { expect, test } from '@playwright/test'

test('sync log: events are recorded and NOT included in the synced blob', async ({ page }) => {
  await page.goto('/#/today')
  const r = await page.evaluate(async () => {
    const { logSync, readSyncLog, exportSyncLog } = await import('/src/sync/syncLog')
    logSync('test', 'hello')
    logSync('test', 'world')
    const entries = readSyncLog()
    // the log must be a SEPARATE localStorage key, not part of the data blob
    const dataKeys = Object.keys(JSON.parse(localStorage.getItem('esquizomon-rpg:v1') ?? '{}'))
    return {
      count: entries.length,
      last: entries[entries.length - 1],
      hasTs: typeof entries[0]?.ts === 'string',
      logInDataBlob: 'syncLog' in dataKeys || 'sync-log' in dataKeys,
      exportHasApp: (exportSyncLog() as string).includes('esquizomon-rpg'),
    }
  })
  expect(r.count).toBeGreaterThanOrEqual(2)
  expect(r.hasTs).toBe(true)
  expect(r.logInDataBlob).toBe(false) // crucially NOT synced
  expect(r.exportHasApp).toBe(true)
  expect(typeof r.last?.event).toBe('string')
})