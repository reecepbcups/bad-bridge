/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which preset in src/config/deployments.ts to run: reece-test, badkids or demo. Required for production builds. */
  readonly VITE_DEPLOYMENT?: string
  /** "1" lets a production build honour `?demo` (the e2e build). Dev always does. */
  readonly VITE_ALLOW_DEMO?: string
  /** Reown (WalletConnect) project id. Optional; injected wallets work without it. */
  readonly VITE_WC_PROJECT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
