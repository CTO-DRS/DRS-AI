import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Dev/preview server: when VITE_API_URL is relative (/api/v1), all API calls
// stay same-origin and are proxied to the gateway — this is how the app is
// served behind the sandbox preview proxy (single public port, no CORS).
const GATEWAY = process.env.GATEWAY_ORIGIN || 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    // FC_CUSTOM_LISTEN_PORT in the sandbox preview environment
    port: Number(process.env.PORT) || 81,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      // Gateway REST API (auth, chat SSE, teams, knowledge, skills, ...)
      '/api': { target: GATEWAY, changeOrigin: true },
      // Gateway WebSocket event hub (drSai live events)
      '/ws': { target: GATEWAY, changeOrigin: true, ws: true },
    },
  },
})
