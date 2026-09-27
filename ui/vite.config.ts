import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset URLs, so dist/ works from any path: a static host, a subfolder or an IPFS gateway
  base: './',
  plugins: [react()],
  // only scan the app entry; ui/mockup/ is a static reference page, not part of the app
  optimizeDeps: { entries: ['index.html'] },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
})
