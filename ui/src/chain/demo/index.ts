// In-memory adapter replaying the mockup's example wallet. Turned on with ?demo; drives e2e and design review.
export { default as DemoBridgeProvider } from './provider'
export { useDemoControls, type DemoControls } from './controls'
export { demoOptionsFromSearch } from './options'
export { DemoSim, DEFAULT_TIMELINE, INSTANT, type DemoOptions, type DemoSnapshot, type DemoTimeline } from './sim'
export { createDemoEthWriter, createDemoHubWriter, createDemoReaders, createDemoWallet } from './adapter'
export * as demoSeed from './seed'
