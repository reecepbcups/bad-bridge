import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Unit tests only: src/**/*.test.ts(x). Live mainnet tests have their own config (vitest.live.config.ts).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      restoreMocks: true,
    },
  }),
)
