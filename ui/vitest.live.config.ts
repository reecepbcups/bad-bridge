import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Read-only smoke tests against mainnet (reece-test). Slow and network-bound: never part of `pnpm check`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['test/live/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
      retry: 1,
    },
  }),
)
