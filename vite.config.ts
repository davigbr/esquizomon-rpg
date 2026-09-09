import { defineConfig } from 'vite'
import { iaDevProxy } from './scripts/ia-dev-middleware'
import pkg from './package.json'

// Hash do build: no Netlify é o SHA do commit (SOURCE_VERSION) → muda a cada
// deploy, então logs/UI revelam device rodando build velha (causa recorrente de
// bugs de sync). Local/dev cai pra um carimbo de tempo.
const APP_BUILD = process.env.SOURCE_VERSION
  ? String(process.env.SOURCE_VERSION).slice(0, 7)
  : `dev-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`

export default defineConfig({
  // Expõe a versão do package.json + o hash do build ao bundle (a UI mostra em
  // Config e os logs de sync registram — indispensável pra saber se um device
  // roda build velha).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(APP_BUILD),
  },
  plugins: [iaDevProxy()],
  server: {
    port: 5176,
    strictPort: true,
  },
})
