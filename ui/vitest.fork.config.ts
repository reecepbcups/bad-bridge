import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Tests against a local Anvil mainnet fork (test/fork/). Tests should skip when anvil isn't installed.
// Needs network for the fork's upstream RPC: never part of `pnpm check`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['test/fork/**/*.test.ts'],
      environment: 'node',
      testTimeout: 120_000,
      hookTimeout: 120_000,
      fileParallelism: false,
      passWithNoTests: true,
    },
  }),
)
