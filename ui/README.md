# Bad Bridge UI

The web app for Bad Bridge: send Bad Kids from your Cosmos Hub wallet, watch them cross, claim them on Ethereum. One way only. It's a static single-page app with no backend: the browser reads both chains straight from public RPCs and signs with your own wallets.

The plan and its decisions are in `PLAN.md`. The approved look is `mockup/index.html`. Lines waiting on copy sign-off are in `COPY.md`.

## Run it

Needs Node 24 and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:5173, real chains (reece-test)
pnpm build        # dist/, static files with relative paths: any host, a subfolder or IPFS
pnpm preview      # serve dist/ on http://localhost:4173
```

Add `?demo` to any URL for the demo: an in-memory sim of the mockup's example wallet, with a toolbar to skip ahead, freeze the bridge or inject failures. It touches no network. `?demo=paused,instant,disconnected` combine; see `src/chain/demo/options.ts`.

Settings (copy `.env.example` to `.env.local`, both optional):

| Variable | What |
|-|-|
| `VITE_DEPLOYMENT` | Which preset in `src/config/deployments.ts` to build: `reece-test` (default), `badkids` or `demo`. `?demo` always wins. |
| `VITE_WC_PROJECT_ID` | Reown (WalletConnect) project id. Without it only extension wallets and Coinbase Wallet are offered. The project's allowlist has to include the site's origin. |

## Deployments

| Preset | Hub escrow | Hub cw721 | Ethereum bridge | State |
|-|-|-|-|-|
| `reece-test` | `cosmos1zr8k7ch8…q8gumtv` | ReeceBadTest `cosmos158d2rz0a…tsu83rfr` | `0xDe185D79…DC5eE198` | Live on mainnet. #2 and #3 crossed, #1 is still on the Hub. |
| `badkids` | not deployed | Bad Kids `cosmos12gsv9tmj…ajqmg3exz` | not deployed | Shows "the bridge isn't open yet". |
| `demo` | reece-test's addresses | | | In-memory, for review and e2e. |

Full addresses and RPC lists are in `src/config/deployments.ts`. At startup the app checks that the escrow accepts the configured cw721 and that `bridge.ESCROW()` is the configured escrow; if either fails, Send is disabled and a banner says why.

## Tests

| Command | What | Needs |
|-|-|-|
| `pnpm check` | Typecheck, lint and unit tests (`src/**/*.test.ts(x)`, Vitest + jsdom) | Nothing |
| `pnpm test:e2e` | Playwright on the production build in demo mode: the whole flow, tracker, About, both themes, phone and desktop width, axe | Chromium (`pnpm exec playwright install chromium`) |
| `pnpm test:live` | Read-only mainnet checks of the adapters against reece-test (`test/live/`) | Network |
| `pnpm test:fork` | Claims through the real writer on an Anvil mainnet fork, with proofs seeded by `anvil_setStorageAt` (`test/fork/`) | `anvil` on PATH (skips without it) and network |
| `pnpm test:e2e:live` | Playwright on the real build against mainnet with no wallet: kid pages, tracker by Eth and Hub address, About health and contract check, connect sheets, no console errors, no requests outside the RPC and image hosts (`e2e-live/`) | Chromium and network |

Only `check` and `test:e2e` are hermetic. The three live ones depend on public RPCs and on chain state that can only move forward; if #1 ever crosses, update the facts at the top of `e2e-live/live.spec.ts`. Screenshots land in `test-results/screens/` (demo) and `test-results-live/screens/` (live).

## How it's built

Every component reads chain state through one interface, `BridgeContext` (`src/chain/context.tsx`): a Hub reader, an Ethereum reader, a wallet per chain and a writer per chain, all defined in `src/chain/types.ts` with no library types in them. Either the demo sim fills it, or the real adapters, which come in two lazy chunks. The readers (fetch against Hub REST/RPC with fallback, viem with Multicall3) load first, so a kid's page renders without waiting for the wallet libraries; graz, cosmjs signing and wagmi load beside the page and slot in when ready. On top of that, `src/trips/` turns raw reads into a trip per kid, whose stage is always rebuilt from chain (localStorage only remembers which kids to show), and `src/ui/` draws it.

```
src/
  main.tsx  App.tsx  router.ts       hash routes: #/ #/kids #/kids/<0x…|cosmos1…> #/kid/<id> #/about
  config/deployments.ts              presets: addresses, RPCs, explorer links
  chain/
    types.ts  context.tsx            the adapter interface, and the React context around it
    real.tsx  wallets.tsx            real adapters: readers first, wallets lazily beside them
    hub/                             Cosmos Hub: REST/RPC transport, reader, send tx (simulate, sign, broadcast), graz + Leap
    eth/                             Ethereum: viem reader, claim/claim-many writer, wagmi config and wallets
    demo/                            in-memory sim behind the same interface (?demo)
    bech32.ts                        the one bech32 decoder the entry chunk needs
  trips/                             trip stages, discovery by address or id, health, react-query hooks
  ui/                                views and components, ported from the mockup
  kids/image.ts                      kid pictures: badkids.com bucket, IPFS fallback
  styles/                            tokens and base CSS from the mockup
e2e/  e2e-live/  test/live/  test/fork/
```

Bundle, gzipped: the entry is ~110 kB (React and react-query are most of it), a real page needs ~215 kB before it can draw, and the wallet chunk adds ~375 kB behind it. Most of that chunk is graz, which imports every cosmjs client and so all of `cosmjs-types`. Coinbase Wallet and WalletConnect load only when someone picks them, or on a reload when they were the last wallet used.
