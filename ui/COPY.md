# Copy for sign-off

Every line marked `COPY:` in `src/`, grouped by how much it matters. Line numbers point at the marker; the text
is right above it. Anything with `${…}` is filled in at runtime (kid numbers, wallet names, the collection).

Reply with edits per line, or "ok" per group. Once a line is signed off, delete its `COPY:` marker.

## Disclosure and safety

These make promises or warn about things that can't be undone. They need your final wording.

| Where | Current text | Why it needs you |
|-|-|-|
| `src/ui/views/bridge/ReviewStep.tsx:189` | **No take-backs.** This bridge only goes one way. Once a kid leaves the Hub, it lives on Ethereum for good. Ethereum kids trade on Ethereum, separately from Bad Kids on the Hub and Stargaze. Checkbox: *Got it, one way only* | The disclosure from design doc §9 step 5. It's the last thing people read before the only irreversible action, and it gates the Send button. |
| `src/ui/views/AboutView.tsx:126` | *Ethereum and Hub kids: are they the same?* Same number, same art, but they trade separately. An Ethereum kid trades on Ethereum marketplaces, not on Stargaze or other Hub marketplaces. | The trading disclosure, in the FAQ. Should agree with the one above. |
| `src/ui/views/bridge/ReviewStep.tsx:170` | **That's a contract, not a wallet.** Some contracts can't hold NFTs, and a kid minted to one could be stuck for good. Only go on if you're sure this one can. Checkbox: *This address can hold NFTs* | Shown when the recipient has code. Accurate: `claim` uses `_mint`, not `_safeMint`, so nothing stops a mint to a contract that can't move it. |
| `src/ui/views/bridge/ReviewStep.tsx:15` | Format: *That doesn't look like an Ethereum address (0x + 40 characters).* Zero: *That's the zero address. Kids sent there are gone forever.* Checksum: *The capital letters don't match this address's checksum, so there may be a typo. Copy it again from your wallet.* | Recipient validation. The zero check matters most on reece-test, whose escrow still accepts a zero recipient. |
| `src/ui/chrome/Banners.tsx:21` | **The bridge is paused** Ethereum's light client of the Hub is frozen, so new kids can't be proven and sending is off. Kids that are already proven can still be claimed. | Site-wide when the Eureka client is frozen. States what still works, so it has to stay true. |
| `src/ui/chrome/Banners.tsx:30` | **Sending is switched off** The bridge contracts don't match this site's settings, so nothing can be sent until that's fixed. Your kids are safe. | Shown when the startup check fails. The per-problem lines under it come from `describeConfigProblem` in `src/trips/sanity.ts`. |
| `src/ui/views/AboutView.tsx:207` | OK: *✓ Checked live: the escrow only takes ${collection}, and the Ethereum bridge only trusts this escrow.* Mismatch: *✗ These don't match what the chains say, so sending is switched off.* Failed: *Couldn't double-check these against the chains just now.* Loading: *Double-checking these against the chains…* | New in Phase 2. A trust claim: it must say exactly what the check proves (escrow `config {}` is this cw721; `bridge.ESCROW()` is this escrow), no more. |
| `src/ui/views/bridge/PickStep.tsx:38` | **The bridge isn't open yet** ${collection} can't cross until the Hub escrow and the Ethereum contract are deployed. Nothing to do yet: your kids are safe where they are. | What the real Bad Kids build shows until the addresses exist. |

## Errors

| Where | Current text | Why it needs you |
|-|-|-|
| `src/ui/errors.ts:49` | The whole table, one entry per error code: | First drafts for every failure people can hit. Headlines never show the code; the raw detail sits in a "Details" disclosure. |
| | WrongCollection: *The escrow doesn't take this collection* / It only accepts Bad Kids from the official collection. Nothing was sent. | |
| | BadTokenId: *${kid}'s number looks off* / The escrow couldn't read the token number, so nothing was sent. | |
| | BadRecipient: *That address won't work* / The escrow wants a plain 0x Ethereum address (0x + 40 characters). Check it and try again. | |
| | ZeroRecipient: *That's the zero address* / Kids minted there are gone forever, so the escrow said no. Nothing was sent. | |
| | AlreadyBridged: *${kid} already crossed* / It's already in the escrow, and a kid can only cross once. Take it out of your pick and try again. | |
| | NotOwner: *${kid} isn't in this wallet* / The Hub says this wallet doesn't own it anymore. It may have moved since the list loaded. Nothing was sent. | |
| | NotProven: *Not quite there yet* / The proof for ${kid} hasn't landed on Ethereum yet. Give it a few minutes and try again. | |
| | UserRejected: *No worries* / You said no in ${wallet}, so nothing happened. Try again whenever you're ready. (Connect: ${wallet} didn't connect. Try again whenever you're ready.) | |
| | InsufficientFunds: *Not enough ETH for gas* / Claiming is a normal Ethereum transaction. Top up a little ETH and try again. (Send: *Not enough ATOM for the fee* / Sending needs a tiny bit of ATOM for the Hub fee. Top up and try again.) | |
| | WrongChain: *Wrong network* / ${wallet} is on a different network. Switch it to Ethereum mainnet (or Cosmos Hub) and try again. | |
| | NotLive: *The bridge isn't open yet* / This collection's escrow and Ethereum contract aren't deployed yet. Check back soon. | |
| | Network: *Can't reach the chains* / The public endpoints aren't answering. Check your connection and try again in a moment. | For a send, the review screen adds: *Before sending again, check My kids in case it went through.* |
| | Unknown: *Something went wrong* / Try again in a moment. If it keeps happening, the details below help us fix it. | |
| `src/ui/lookup.ts:12` | Empty: *Paste an Ethereum address (0x…), a Hub address (cosmos1…) or a kid number like #1234.* Out of range: *There's no kid #${id}.* Checksum: *That address's capital letters don't match its checksum, so there may be a typo.* Zero: *That's the zero address. No kids go there.* Format: *That doesn't look like an Ethereum address (0x + 40 characters).* Bad bech32: *That Hub address has a typo somewhere.* | The tracker's lookup box. |
| `src/ui/Broken.tsx:31` | Didn't load: **The bridge didn't finish loading** Part of the page didn't download. Check your connection and reload. Anything else: **Something broke while starting up** Reload to try again. If it keeps happening, let us know. Both end: *Your kids are safe: nothing here can move them without your wallet.* Buttons: *Reload*, *Report it ↗* (GitHub issues) | New in Phase 2, replacing the Phase 0 "not wired yet" page. Shown when the chain code itself fails. |
| `src/ui/Root.tsx:53` | **Oops, this page tripped** Something broke while drawing it. Your kids are safe: nothing here can move them without your wallet. | One view crashed; the rest of the app still works. |

## Explanations

| Where | Current text | Why it needs you |
|-|-|-|
| `src/ui/views/AboutView.tsx:41` | Step 1, **You send your kids**: They go into an escrow on the Hub, along with the Ethereum address they should land at. One signature sends as many as you like. | Fixed from the mockup ("sign once per kid" was wrong). |
| `src/ui/views/AboutView.tsx:53` | Step 3, **You claim them**: The same kids, with the same numbers, get minted to your Ethereum address. One transaction claims them all. | Fixed from the mockup ("one transaction per kid"). Unmarked step 2 reads **We prove they left**; "we" may oversell who runs the prover. |
| `src/ui/views/AboutView.tsx:94` | *Why does it take a while?* Ethereum only learns about new Hub blocks when IBC Eureka relays a transfer. After that, the prover bundles waiting kids into one proof. So the wait depends on how far behind Ethereum is: right now that's ${lag}. | Replaces the mockup's made-up "20–60 minutes" with the live lag. |
| `src/ui/views/AboutView.tsx:110` | *What does it cost?* One Hub transaction sends any number of kids, for a small ATOM fee. Then one Ethereum transaction claims them all, at roughly 79,000 gas per kid. The prover pays for the proof. | Numbers from the mainnet run. "The prover pays" depends on the claim research (PLAN.md follow-ups). |
| `src/ui/views/AboutView.tsx:118` | *Who can claim my kid?* Anyone. A claim always mints the kid to the address it was sent to, so it's safe for a friend (or a bot) to claim for you. | True of the contract today; keep it in step with the claim research. |
| `src/ui/views/AboutView.tsx:240` | **Running.** Ethereum is ${about N min} behind the Hub (${N} blocks). Hub block ${h} · Ethereum has seen ${c}. Checked ${when}. Stale: *Ethereum is a long way behind the Hub right now.* Failed: *Couldn't check just now, so these numbers may be old.* Paused: **Paused**: the light client is frozen, so no new proofs. | The live health strip. Phase 2 added the two heights. |
| `src/ui/StageList.tsx:69` | The prover looks slow right now. It can't lie, it can only stall, and anyone can run one. *How to run a prover ↗* | After 30 minutes in "proving". Links the repo README. |
| `src/ui/views/bridge/CrossingStep.tsx:54` | Right now Ethereum is ${about N min} behind the Hub (or: *all caught up* with the Hub). Close this tab if you like. Your ${kids} will be waiting under *My kids*. | Crossing screen lede. |
| `src/ui/views/bridge/CrossingStep.tsx:72` | You can close this tab: your ${kids} keep crossing without it. Come back to *this link* from any device to claim. | Says the same as the lede; one of the two could go. |
| `src/ui/views/bridge/ClaimStep.tsx:93` | One Ethereum transaction claims ${it / them all}. Anyone can claim; it always goes to ${recipient}. | Under the claim button. |
| `src/ui/views/bridge/ReviewStep.tsx:24` | Button: *Checking…* → *Check ${wallet}…* → *Sending…*. Line under it: *Checking the send with the Hub…* → *Approve it in ${wallet}. Once signed, it lands on the Hub in a few seconds.* → *Signed. Waiting for the Hub to put it in a block…* | New in Phase 2: driven by the writer's real progress (simulating, signing, broadcasting) instead of a focus guess. |
| `src/ui/Claim.tsx:48` | Button: *Check ${wallet}…* → *Claiming…*. Status: *Approve it in ${wallet}.* → *Sent. Waiting for Ethereum to mine it…* | New in Phase 2, same idea for claims (signing, confirming). |
| `src/ui/views/KidsView.tsx:146` | *Found by (your) Ethereum address, so it works from any device.* / *Found by (your) Hub address, …* / *Kids sent from this browser. Look up an address to see them from any device.* Then: *Checks again every 30 seconds.* | New in Phase 2. It used to say "your Ethereum address" for anyone's address. |

## Other

| Where | Current text | Why it needs you |
|-|-|-|
| `src/ui/Connect.tsx:117` | Hub: *Pick the wallet that holds your Bad Kids on the Cosmos Hub.* Ethereum: *Pick the wallet you use on Ethereum. You can also paste any address instead.* | Connect sheet ledes. The sheet also says *Looking for wallets…* while the wallet code loads, and *No wallets found in this browser.* |
| `src/ui/views/bridge/PickStep.tsx:121` | **No ${collection} in this wallet** ${wallet} doesn't hold any on the Cosmos Hub. Using another account? Switch it in your wallet and this list updates. | Empty pick screen. |

## Unmarked, worth a glance

- `src/ui/chrome/Footer.tsx`: *One way only: Cosmos Hub → Ethereum. There's no bridge back.* / *Same token IDs, same art. Metadata stays on IPFS; only the kid moves.*
- `src/ui/wallets.ts` and the connect sheet tag web wallets (Coinbase Wallet, WalletConnect) as *installed*, because they need no extension. "Available" might read better.
