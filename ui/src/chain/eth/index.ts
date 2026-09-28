// Workstream B: the Ethereum adapter. Imported only by real.tsx (lazy), so wagmi and the connectors stay out
// of the demo bundle. The UI imports recipient.ts directly, never this file.

export { bridgeAbi, lightClientAbi, multicall3WriteAbi } from './abi'
export { createEthPublicClient, ethChain, ethTransport } from './client'
export { CONNECTOR_IDS, createWagmiConfig, wagmiConfigFor, type WagmiConfigOptions } from './config'
export { toEthError } from './errors'
export { EthWalletProvider } from './provider'
export { createEthReader, isContractCode, KID_STATUS_CHUNK, type EthReaderOptions } from './reader'
export { checkRecipient, type RecipientCheck } from './recipient'
export { ethWalletOptions, useEthWallet, useEthWriter, type ConnectorInfo } from './wallet'
export { createEthWriter, type EthWriterDeps, type ReadClient, type SignerClient } from './writer'
