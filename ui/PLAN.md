# Bad Bridge UI: production plan

Turn `ui/mockup/index.html` into a real app that bridges Bad Kids from the Cosmos Hub to Ethereum. The mockup's look, copy tone and flow are approved. This plan covers everything the mockup fakes.

## Decisions

| | Choice | Why |
|-|-|-|
| Stack | Vite + React + TypeScript, pnpm | Best wallet library support. It's a static SPA. |
| Backend | None | The browser reads everything straight from public Hub/Eth RPCs (all CORS-open, checked). It matches the "no admin, nobody to trust" story. |
| Hosting | Decide later | Build a plain `dist/` with hash routing and relative assets, so Vercel, Cloudflare, Railway and IPFS all work. |
| Eth wallets | wagmi v2 + viem. Injected (EIP-6963), WalletConnect, Coinbase | Custom connect sheet, no RainbowKit, so it matches the crayon look. |
| Hub wallets | graz (Keplr, Leap, Cosmostation, WalletConnect) + cosmjs | Also a custom connect sheet. |
| Images | `badkidsweb.storage.googleapis.com/badkids/images/256/{id}.jpg`, falling back to IPFS `QmbGvE3…/{id}.jpg` via a gateway | Only `kidImage(id)` knows about sources, so they're easy to swap. |
| Styling | Plain CSS with the mockup's tokens (`--paper`, `--ink`, `--hub`, `--eth`, `--wobble`…), one file per component | The design system is small. No Tailwind. |
| First target | ReeceBadTest on mainnet (3 tokens: #2 and #3 already bridged, #1 still on the Hub) | Lets us test against real state now. Real Bad Kids is a config switch once its escrow and bridge exist. |

## What the app talks to (verified 2026-09-27)

**Hub reads** (REST, with an RPC fallback list)

- Kids a wallet owns: `tokens {owner, start_after, limit}` on the cw721. Bad Kids is `cw721-migration` (code 434), 9,995 tokens, `non_transferable: false`.
- A kid's record: escrow `record {token_id}` returns the 20-byte hex recipient or null.
- Every record: escrow `pending {start_after, limit: 500}`. At most 20 pages for the whole collection. The tracker uses this to find kids by ETH address.
- Send tx, height and sender for a kid: tx search `wasm._contract_address='<escrow>' AND wasm.token_id='<id>'`. Works on publicnode REST and on polkachu/publicnode RPC `tx_search`.
- Trips by Hub address: the same search with `wasm.from='<hub addr>'`.
- Hub height and time: the latest block, plus the block at a given height.
- Gas price: `/feemarket/v1/gas_price/uatom` (0.005 today).

**Hub write**

- One tx holding N `MsgExecuteContract`s to the cw721: `{"send_nft":{"contract":<escrow>,"token_id":"<id>","msg":<base64 of the raw 20 recipient bytes>}}`.
- That's one signature for any number of kids. The mockup's "sign once per kid" copy gets fixed.
- Always simulate first.
- Golden vector from the real tx `0C72F725…`: recipient `0xd2c392084761cb6e44c544b6f39dcc001fde9775` encodes to msg `0sOSCEdhy25ExUS2853MAB/el3U=`.

**Eth reads** (viem, batched with Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11`)

- `bridge.lightClient()`, then `client.clientState()` gives `latestHeight.revisionHeight` and `isFrozen`.
- Per kid: `bridge.proven(id)` and `bridge.ownerOf(id)`. `ownerOf` reverts until minted, so it goes through `allowFailure`.
- `eth_getCode(recipient)` warns when the recipient is a contract.
- `bridge.ESCROW()` feeds the startup sanity check below.

**Eth write**

- `claim(id)` for one kid.
- For several kids: `Multicall3.aggregate3` of `claim` calls with `allowFailure: true`. `claim` ignores `msg.sender`, so this works, and it means one tx instead of N. The mockup's "one transaction per kid" copy gets fixed.

## The trip state machine

A **trip** is one kid's journey. Its state is always rebuilt from chain. localStorage only remembers which trips to show.

| Stage | Chain condition | Mockup stage |
|-|-|-|
| `home-hub` | no escrow record | Pick screen |
| `locked` | record exists, send height `Hs` known | 1 "Locked in the Hub escrow" ✓ |
| `catching-up` | `client.latestHeight <= Hs` | 2 "Ethereum catches up to the Hub" |
| `proving` | `latestHeight > Hs` and `proven(id) == 0` | 3 "Making the proof" |
| `ready` | `proven(id) != 0` and not minted | 4 ✓, Claim button |
| `home-eth` | `ownerOf(id)` succeeds | Done, shows the current owner |

- The `latestHeight > Hs` rule is from the batcher. It proves at `H-1`, and the record is in state after block `Hs`.
- If tx search can't find `Hs`, the kid shows as a generic "crossing" between stages 2 and 3. Don't guess.
- Live context replaces the mockup's made-up "20–60 minutes":
  - **Ethereum is N min behind the Hub** = (hub height − client height) × block time.
  - For `catching-up`: blocks still to go.
  - For `proving`: time since the checkpoint passed.
- If `proving` lasts more than 30 min, say the batcher looks stuck. Explain that anyone can run one and link the repo.
- If `isFrozen` is set: show a site-wide "bridge paused" banner and disable sending. Claims of already-proven kids still work.
- The claim step is still being researched. The UI shouldn't care who claims: if a batcher starts auto-claiming, `ready` just flashes by.

## Send safety (the only irreversible action)

1. **Config sanity at startup.**
   - The escrow's `config {}` must equal the deployment's cw721.
   - `bridge.ESCROW()` must equal the bech32-decoded escrow.
   - If either check fails, the Send button is hard-disabled and a visible error explains why.
2. **Recipient.**
   - It defaults to the connected ETH wallet.
   - A pasted address must be 0x plus 40 hex characters, not the zero address, and pass the EIP-55 checksum when mixed-case.
   - A pasted address that isn't the connected wallet gets a "this isn't your connected wallet" note.
   - A contract recipient (`getCode != 0x`) gets a warning, plus a second checkbox confirming it can hold NFTs.
3. **Encoding** is tested against the golden vector above, and the decode round-trip is tested too.
4. **Simulate before signing.**
   - Map escrow errors to kid-friendly copy: `WrongCollection`, `BadTokenId`, `BadRecipient`, `ZeroRecipient`, `AlreadyBridged`.
   - A failed simulation never opens the wallet.
   - This also catches the open question of whether `cw721-migration` calls the receiver hook.
5. **Disclosure on the commit screen**, per design doc §9 step 5: it's one way, and Ethereum kids trade separately from Hub/Stargaze kids. The final wording is yours.

## Layout

```
ui/
  PLAN.md
  mockup/                   reference, untouched
  index.html  vite.config.ts  package.json  tsconfig.json  playwright.config.ts
  src/
    main.tsx  App.tsx  router.ts          hash routes: #/ #/kids #/kids/<0x|cosmos1> #/kid/<id> #/about
    config/deployments.ts                 reece-test, badkids (addresses TBD → "not live yet"), demo
    styles/tokens.css base.css            ported from the mockup
    chain/types.ts                        HubReader, HubWriter, EthReader, EthWriter, shared types
    chain/hub/                            Workstream A
    chain/eth/                            Workstream B
    chain/demo/                           in-memory adapter replaying the mockup's example data
    trips/                                Workstream C
    ui/                                   Workstream D: components + views
    kids/image.ts                         kidImage(id) → ordered URL candidates
  e2e/                                    Playwright (demo adapter)
  test/live/                              read-only mainnet smoke tests (reece-test)
```

`demo` is a real adapter behind the same interfaces, turned on with `?demo`. The mockup's jump bar lives on there as a dev toolbar. It drives the e2e tests and design review.

## Execution

- Every workstream is run by an Opus 5.5 subagent with a self-contained brief: this file, the mockup, and its own acceptance list.
- Workstreams in the same phase own disjoint directories.
- `package.json` is frozen after Phase 0, so parallel agents never fight over deps.
- Agents don't commit. I commit after each phase on branch `ui-app`, cut from `ui-mockup`.

### Phase 0: Foundation (1 agent, sequential)

- Scaffold Vite, React and strict TS, install **every** dep up front, and configure ESLint, Vitest and Playwright.
- Port the tokens and base CSS: fonts, wobble borders, light and chalkboard-dark themes.
- Write `deployments.ts`, `chain/types.ts`, `kidImage` and the router.
- Build the app shell: header, wallet chip placeholders, tabs, stepper, card, with empty views.

**Done when:** `pnpm check` (typecheck + lint + unit) and `pnpm build` pass, and the shell matches the mockup chrome at 375px and 1280px in both themes.

### Phase 1: Four parallel workstreams

| | Owns | Delivers | Done when |
|-|-|-|-|
| **A: Hub** | `src/chain/hub/` | REST/RPC client with fallback and retry; owned-kids paging; record/pending/tx-search reads; feemarket gas; send tx builder + simulate + broadcast; escrow error mapping; graz provider + hooks | Unit tests incl. the golden vector; `test/live` confirms #1 is on the Hub, #2/#3 have records, and `Hs` for #3 is 33092463 |
| **B: Eth** | `src/chain/eth/` | wagmi config; multicall status reads; client height/frozen; claim + claimAll (Multicall3); address validation + contract check; startup sanity check | Unit tests; an Anvil mainnet-fork test sets `proven[1]` via `anvil_setStorageAt`, runs claimAll and sees `ownerOf(1)`; `test/live` confirms #2/#3 are minted |
| **C: Trips** | `src/trips/` | Pure `deriveStage()`; discovery by ETH address / Hub address / token id; localStorage (try/catch, never required); react-query polling (30s, faster while on the crossing screen); health metrics (lag, frozen, stuck) | Table-driven tests for every row of the state table plus edge cases (unknown `Hs`, frozen client, RPC failure, owner ≠ recipient) |
| **D: UI** | `src/ui/` | All mockup views as React components against the interfaces + demo adapter: pick (paging, lazy images, keyboard), review (all safety states), crossing scene driven by real stage (reduced-motion fallback), claim, done, tracker + address lookup, about, connect sheets, loading/empty/error states | Playwright on demo: full flow, tracker, about, at 375px and 1280px, light and dark, axe clean, no horizontal scroll |

### Phase 2: Integration (1 agent)

- Wire the real adapters in `App.tsx` and add the paused/health banner.
- The tracker must work read-only against reece-test mainnet: `#/kid/2` shows home on Ethereum, and `#/kid/1` shows on the Hub.
- Copy pass: replace every guessed line, keeping a list of the lines needing your sign-off.
- Check the bundle size.

**Done when:** `pnpm check`, e2e and `test:live` pass, and a manual click-through in the browser pane works.

### Phase 3: Review (2 agents in parallel, then fixes)

- **Security review** of the send and claim paths, config sanity and encoding. Findings are verified before anything is fixed.
- **Design/UX/a11y review** against the mockup: both themes, phone width, reduced motion, focus order, error copy.

### Phase 4: Mainnet dry run (with you)

- Whoever holds ReeceBadTest #1 bridges it through the real UI.
- This needs the batcher running, and **the prover key rotated first** (the README says it leaked).
- Hosting and deploy come after this.

## Things you'll need to provide

- A WalletConnect project ID (free, from Reown) → `VITE_WC_PROJECT_ID`. Injected wallets work without it.
- Final copy for the disclosure, and sign-off on the flagged lines.
- The real Bad Kids escrow and BadBridge addresses, when they exist.

## Out of scope for this build (follow-ups)

- **Claim research**: who pays the ~79k claim gas. The UI works either way.
- **"Hurry it up"**:
  - A self-serve Eureka nudge: send a tiny ATOM transfer via Skip Go to move the client forward. The README shows this took about 10 min.
  - Or a paid "prove now" service. That one needs a backend with a prover key.
- A thumbnail set we host ourselves, if the badkids.com bucket turns out unreliable.
- Deploy and hosting.
