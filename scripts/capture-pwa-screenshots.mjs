// Captures PWA install screenshots (mobile viewport) for manifest.webmanifest.
// Depends on a running production preview (npm run preview). Usage: node scripts/capture-pwa-screenshots.mjs [port]
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const PORT = process.argv[2] ?? '4173'
const BASE = `http://localhost:${PORT}`
const OUT = 'public/screenshots'

function pngSize(path) {
  const b = readFileSync(path)
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
}

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})

await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/today.png` })

await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' })
await page.waitForTimeout(1200)
const hasSection = (await page.locator('.settings-section', { hasText: 'Notificações e instalação' }).count()) > 0
const status = await page.locator('[data-push-status]').textContent().catch(() => '(sem elemento)')
await page.screenshot({ path: `${OUT}/settings.png` })

await browser.close()

const today = `${OUT}/today.png`
const settings = `${OUT}/settings.png`
console.log(JSON.stringify({ hasSection, status, today: `${pngSize(today)}`, settings: `${pngSize(settings)}` }, null, 2))