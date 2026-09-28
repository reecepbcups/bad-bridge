# NFT features: implementation plan

The why is in `nft-features.md`. This file is the how: what changes, in what order, and how we know each step is done.

Branch: `worktree-nft-features`, cut from `main` at `40e7ff3`.

Status: steps 0-6 done 2026-09-28. Numbers and deviations are under "Results" at the bottom.

## Decisions (2026-09-28)

| | Decision |
|-|-|
| Voting | `ERC721Votes` |
| Delegation | Self by default (Nouns-style) |
| Clock | `block.timestamp`, `mode=timestamp` |
| Owner | Limited, `Ownable2Step`. Only sets royalty and `contractURI` |
| Royalty cap | 10% (1000 bps) |
| Batch claim | `claimMany(uint32[])`, skips already minted ids, reverts on unproven |
| Burn | None. `claim` keeps relying on `_mint` reverting |

Still open, but they don't block code: initial owner address, royalty recipient and rate, `contractURI` JSON. They're deploy-time env values (step 6).

## Scope

| File | Change |
|-|-|
| `eth/src/BadBridge.sol` | Votes, royalty, owner, `contractURI`, `totalSupply`, `claimMany` |
| `eth/test/BadBridge.t.sol` | New constructor args, new unit tests, a second invariant suite |
| `eth/script/Deploy.s.sol` | New env vars |
| `eth/script/E2E.s.sol` | New constructor args with test defaults |
| `README.md`, `bad-bridge-design.md` | "No owner" wording, section 6 "Actual" notes |
| `spec/badbridge.qnt` | Nothing. None of this touches the bridge state machine |
| `batcher/` | Nothing. It only calls `lightClient`, `proven`, `submitBatch`, and those are unchanged |
| `escrow/` | Nothing |

What must not change: `submitBatch`, `parse`, `proven`, `claim`'s behaviour, `tokenURI`, the `Proven` event, every existing test. If an existing test has to be edited for anything other than the constructor call, stop and look at why.

---

## Step 0: Setup

- `git submodule update --init --recursive` in the worktree. `eth/lib/*` is empty here
- `cd eth && forge build && forge test` on the untouched code. Everything passes
- Baseline gas: `forge test --gas-report --match-contract BadBridgeTest > /tmp/gas-before.txt`. Record `claim` and `submitBatch`
- Baseline size: `forge build --sizes`, record `BadBridge`

Done when: green tests, baseline numbers written into the "Results" section at the bottom of this file.

## Step 1: Votes

### Contract

- Inherit `ERC721Votes`. Add `EIP712(name_, "1")` to the constructor
- Overrides the compiler demands: `_update` and `_increaseBalance` as `override(ERC721, ERC721Votes)`
- `clock()` returns `uint48(block.timestamp)`. `CLOCK_MODE()` returns `"mode=timestamp"`
- `delegates(account)` returns `account` when nothing is set
- `_delegate(account, delegatee)` maps `delegatee == address(0)` to `account`. **Required**, see `nft-features.md` section 2. Without it `delegate(address(0))` silently destroys votes
- `totalSupply()` returns `_getTotalSupply()`
- Add a line to `claim`'s existing comment: the double-mint guard depends on there being no burn path

### Tests (`BadBridgeTest`)

| Test | Checks |
|-|-|
| `test_claimGivesVote` | After claim, `getVotes(alice) == 1`, `delegates(alice) == alice`, no delegate tx sent |
| `test_transferMovesVote` | alice to bob moves 1 vote |
| `test_delegateAndBack` | `delegate(carol)` moves votes to carol. `delegate(address(0))` returns them to alice. Carol ends at 0 |
| `test_delegateZeroNeverLosesVotes` | Fuzz: any sequence of delegate targets (including 0) keeps the sum of votes equal to `totalSupply` |
| `test_delegateBySig` | Signed delegation works. Replaying it reverts. An expired signature reverts |
| `test_pastVotesAndSupply` | Claim at t1, warp, claim at t2. `getPastTotalSupply(t1)` and `getPastVotes` report the older values. Querying `clock()` itself reverts |
| `test_clockMode` | `CLOCK_MODE() == "mode=timestamp"`, `clock() == block.timestamp` |
| `test_totalSupplyTracksClaims` | Sparse ids (1, 7012, 9999) give a supply of 3 |
| `test_contractRecipientGetsVotes` | `NoReceiver` gets its vote. This is the "escrow contracts vote" trade-off, written down |

### Invariant suite (new, separate)

The existing `invariant_recordsStickAndMintsMatch` assumes nobody transfers. Leave it alone and add:

- `VotesHandler`, which takes a fixed actor set (5 addresses) and does:
  - `submit`, recipients only from the actor set
  - `claim`, same pattern as the existing handler
  - `transfer(seed, toIdx)`, the owner moves a random minted kid to an actor
  - `delegate(fromIdx, toIdx)`, where `toIdx` can pick `address(0)`
  - `warp(secs)`, bounded 1 s to 1 day
- `BadBridgeVotesInvariantTest` with:
  - `invariant_votesSumToSupply`: the sum of `getVotes(actor)` equals `totalSupply()`
  - `invariant_votesMatchDelegations`: for each actor, `getVotes(a)` equals the sum of `balanceOf(h)` over holders `h` with `delegates(h) == a`
  - `invariant_supplyMatchesMints`: `totalSupply()` equals the handler's minted count

`fail_on_revert = true` stays on. A handler revert still means a claim got stuck.

Done when: all old tests pass untouched (except the constructor call), new tests pass, both invariant suites pass at the configured runs.

## Step 2: Royalty, contractURI, owner

### Contract

- Inherit `ERC2981` and `Ownable2Step`. Constructor takes `owner_`, `royaltyReceiver`, `royaltyBps`, `contractURI_`
- `MAX_ROYALTY_BPS = 1000`. `setRoyalty(receiver, bps)` is `onlyOwner`, reverts `RoyaltyTooHigh(bps)` above the cap. The constructor goes through the same private `_setRoyalty`
- `setContractURI(uri)` is `onlyOwner`, emits `ContractURIUpdated()` (ERC-7572)
- `contractURI()` view
- `supportsInterface` as `override(ERC721, ERC2981)`
- Nothing else gets `onlyOwner`

Watch for stack-too-deep in the constructor (10 args, 4 of them strings). If it hits, group the cosmetic args into one `Collection` struct rather than turning on `via_ir` for the whole project.

### Tests

| Test | Checks |
|-|-|
| `test_royaltyInfo` | Configured receiver and rate on a 1 ETH sale |
| `test_royaltyCap` | 1000 bps passes, 1001 reverts, both in the constructor and in `setRoyalty` |
| `test_royaltyZeroReceiverReverts` | OZ's `ERC2981InvalidDefaultRoyaltyReceiver` |
| `test_onlyOwner` | A non-owner calling `setRoyalty` or `setContractURI` reverts `OwnableUnauthorizedAccount` |
| `test_ownershipTwoStep` | `transferOwnership` doesn't move ownership until `acceptOwnership` |
| `test_renounceFreezes` | After `renounceOwnership`, both setters revert |
| `test_contractURI` | Initial value, update, and the `ContractURIUpdated` event |
| `test_supportsInterface` | True for 165, 721, 721 Metadata, 2981. False for `0xffffffff` |
| `testFuzz_ownerCantTouchBridge` | Random owner calls between a submit and a claim. `proven`, `ownerOf`, `tokenURI`, `ESCROW`, `clientId`, and votes are unchanged |

Add `setRoyalty` and `setContractURI` (called as the owner) to `VotesHandler`, so owner actions are mixed into the invariant runs.

## Step 3: `claimMany`

### Contract

```solidity
function claimMany(uint32[] calldata tokenIds) external {
    for (uint256 i = 0; i < tokenIds.length; ++i) {
        uint32 id = tokenIds[i];
        address to = proven[id];
        if (to == address(0)) revert NotProven(id);
        // already claimed by someone, skip so one front-run can't sink the batch
        if (_ownerOf(id) == address(0)) _mint(to, id);
    }
}
```

### Tests

| Test | Checks |
|-|-|
| `test_claimMany` | 3 proven ids, one call, all minted to their recipients |
| `test_claimManySkipsClaimed` | Claim one, then `claimMany` all three. No revert, and the other two mint |
| `test_claimManyDuplicateIds` | `[5, 5]` mints once |
| `test_claimManyUnprovenReverts` | Reverts `NotProven(id)`, nothing minted |
| `test_claimManyEmpty` | `[]` is a no-op |

Add `claimMany` to both handlers.

## Step 4: Scripts

`Deploy.s.sol`:

| Env | Rule |
|-|-|
| `OWNER` | Required, non-zero |
| `ROYALTY_RECEIVER` | Defaults to `OWNER` |
| `ROYALTY_BPS` | Required. No default, so nobody ships 0 by accident |
| `CONTRACT_URI` | Required |

Log owner, royalty, and `contractURI` after deploy.

`E2E.s.sol`: owner defaults to the broadcaster, royalty 0 to the broadcaster, `contractURI` empty.

## Step 5: Fork run

- Run `E2E.s.sol` on an Anvil mainnet fork, reusing `eth/sp1_proof.json` and the env from the last mainnet run. `submitBatch` and `claim` must work exactly as before
- On the fork, check that `getVotes(recipient) == 1`, `royaltyInfo`, and `contractURI` return what was deployed

## Step 6: Numbers and docs

- Gas report and sizes again. Fill in "Results" below. Flag it if `claim` grew by more than ~60k or the size is near 24 KB
- `README.md`: the "no owner" claims become "owner can only set royalty and contractURI"
- `bad-bridge-design.md` section 6 "Actual": list the new pieces. Section 8 risk table: add a row for the owner
- `nft-features.md` section 8 (ABI changes for the UI) should still match. Fix any drift

## Commits

One per step, so each can be reviewed alone:

1. `docs: nft features report and plan`
2. `votes: ERC721Votes, timestamp clock, default self-delegation`
3. `royalty: ERC2981 + limited owner + contractURI`
4. `claimMany`
5. `scripts: owner, royalty, contractURI env`
6. `docs: owner model, gas and size results`

Don't push or open a PR until asked.

## Out of scope

- The Governor itself
- The OpenSea collection page setup (done off-chain once deployed)
- The `contractURI` JSON content and its IPFS pin, which needs input from the creators
- Frontend. The other agent owns it, and `nft-features.md` section 8 is the handoff

## Results (2026-09-28)

From a single claim to a fresh address, then one transfer. Optimizer on for "After" (see deviations).

| | Before (`40e7ff3`, no optimizer) | After |
|-|-|-|
| `claim` gas | 70,849 | 167,775 |
| `submitBatch` gas (1 record, mocked verifier) | 74,603 | 69,622 |
| `transferFrom` gas | 55,585 | 117,481 |
| `BadBridge` runtime size | 13,471 B | 13,974 B (10,602 B headroom) |
| Deploy gas | 3,077,821 | 3,269,471 |

For comparison, the original code with the optimizer on: `claim` 70,550, `transferFrom` 55,032, runtime 7,551 B. So votes cost about +97k per first claim and +62k per transfer. Self-delegation was kept knowing that (2026-09-28).

Tests: 41 unit and fuzz tests, 4 invariants across 2 suites.

Fork run (step 5), `forge script` against mainnet state via publicnode, no broadcast:

- `E2E.s.sol` with the 2026-09-23 proof (Hub height 33092173, escrow `0xdc1f…182b`, token 1). Went through the real `cosmoshub-0` client and SP1 verifier. Minted to `0xD2C3…9775`, holder votes 1, total supply 1
- `Deploy.s.sol` logged owner, royalty receiver, 5% royalty, and `contractURI` as configured. With `ROYALTY_BPS` unset it reverts

### Deviations from the plan

- **Optimizer on (200 runs)**, its own commit. Votes took the unoptimized runtime to 21.7 KB of 24 KB. Approved 2026-09-28
- **Scripts landed with step 2**, not step 4. The constructor change broke both scripts, and `forge build` compiles them
- **Step 5 used `forge script --fork-url`**, not a separate Anvil. Same state, and nothing to clean up
- **Full invariant runs are slow**: 5,000 runs × 500 depth took ~50 min per suite. While iterating we ran them with `FOUNDRY_INVARIANT_RUNS=64 FOUNDRY_INVARIANT_DEPTH=100`
