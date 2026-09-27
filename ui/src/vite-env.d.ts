/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which preset in src/config/deployments.ts to run: reece-test (default), badkids or demo. */
  readonly VITE_DEPLOYMENT?: string
  /** Reown (WalletConnect) project id. Optional; injected wallets work without it. */
  readonly VITE_WC_PROJECT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
