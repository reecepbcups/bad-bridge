// Workstream A: the Hub adapter. Heavy imports (graz, cosmjs) live behind this module; only the lazy-loaded
// real.tsx imports it, so the demo bundle never pulls them in.

export { createHubReader } from './reader'
export { createHubWriter, type HubWriterConfig } from './writer'
export { HubWalletProvider } from './provider'
export { useHubWallet, useHubWriter } from './wallet'
export { decodeRecipient, encodeRecipient, parseKidId, sendNftMsg } from './encode'
