import { defineConfig } from 'vite'
import { iaDevProxy } from './scripts/ia-dev-middleware'

export default defineConfig({
  plugins: [iaDevProxy()],
  server: {
    port: 5176,
    strictPort: true,
  },
})
