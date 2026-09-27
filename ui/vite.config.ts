import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Chunking follows the app's own layers, all through import():
// 1. the entry (React, react-query, the views), which every page loads;
// 2. src/chain/real.tsx, the readers (viem's public client, a little cosmjs): what a real page needs to show anything;
// 3. src/chain/wallets.tsx (graz, cosmjs signing, wagmi), ~1.9 MB, loaded beside the page instead of before it;
// 4. the SDKs wagmi's connectors import on demand (Coinbase, WalletConnect's modal), only when someone uses them.
// Rolldown's automatic splitting keeps shared modules in the lowest layer that needs them. Name-based vendor
// groups (graz/cosmjs, wagmi/viem, WalletConnect) were tried and dropped: a group captures its modules'
// dependencies too, so the viem and noble modules the entry and the readers share would move into the wallet
// chunk and drag it into the first paint. Turning that off (includeDependenciesRecursively: false) needs
// strictExecutionOrder for the whole bundle, which isn't worth it for cache granularity. See README.md.

export default defineConfig({
  // relative asset URLs, so dist/ works from any path: a static host, a subfolder or an IPFS gateway
  base: './',
  plugins: [react()],
  optimizeDeps: {
    // Only scan the app, never ui/mockup/ (a static reference page). The lazy chunks are listed too: the scanner
    // doesn't follow import(), so without them the first dev load finds graz, wagmi and cosmjs late,
    // re-optimizes, and the in-flight import of real.tsx fails with "Outdated Optimize Dep".
    entries: ['index.html', 'src/chain/real.tsx', 'src/chain/wallets.tsx', 'src/chain/demo/provider.tsx'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // the wallets chunk is ~1.9 MB (graz statically imports every cosmjs client), but it's lazy and off the
    // first paint; the entry is what has to stay small
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
})
