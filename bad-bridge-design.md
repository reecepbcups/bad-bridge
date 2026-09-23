# Bad Bridge

**A one-way, opt-in exit door for Bad Kids: Cosmos Hub to Ethereum, secured by SP1.**

Status: design draft, revision 3
Verdict: feasible. Every load-bearing assumption has now been verified against source or on-chain deployment data, and the spike (section 9) passed on mainnet data on 2026-09-23.

---

## 1. Summary

Bad Kids live on Cosmos Hub as cw721 tokens following the Stargaze 2.0 migration. Cosmos Hub is also the one Cosmos chain with a production SP1 Tendermint light client deployed on Ethereum mainnet, built and maintained for IBC Eureka by Interchain Labs and Succinct.

Bad Bridge exploits that coincidence. It does not implement ICS-721, does not run a relayer, does not open an IBC channel, and does not maintain a light client. It reuses the existing Eureka light client as a read-only oracle for Cosmos Hub state roots, and proves a single fact on Ethereum:

> "Bad Kid #N was irrevocably committed to the Bad Bridge escrow on Cosmos Hub, with Ethereum recipient 0xABC."

It is deliberately one-way. It is deliberately opt-in. Holders who do nothing are unaffected.

### Why one-way

A two-way bridge requires ICS-721 in Solidity, a debt-voucher accounting model, packet timeouts, acknowledgements, and a relayer. That is a multi-month protocol project and it belongs upstream in `cosmos/ibc-contracts`, not in a side project. One-way removes all of it. There are no packets, no timeouts, no acks, no relayer, and no return path to get wrong.

### Why opt-in

A forced migration of the whole collection is a fork, and forks need social legitimacy a side project cannot manufacture. An opt-in exit door needs none. Nobody is moved without acting. The Cosmos-side collection remains intact for everyone who stays. The resulting sparse ERC-721 supply is self-documenting: the gaps are the kids who stayed.

The honest cost: partial migration splits liquidity across two thin markets, and neither floor is the real floor. State this to holders before they commit, not after.

---

## 2. Verified findings

Everything below was checked against source or live deployment data rather than assumed.

### 2.1 The critical one: arbitrary CosmWasm state is provable

This is the single assumption the project rests on, and it holds.

`ibc-rs` `ProofSpecs::cosmos()` is exactly two specs, in `ibc-core/ics23-commitment/types/src/specs.rs`:

```rust
vec![ ics23::iavl_spec(), ics23::tendermint_spec() ]
```

And `MerkleProof::verify_membership` is fully generic. It checks only that `keys.key_path.len() == specs.len() == proofs.len()`, then walks the path leaf-to-root:

```rust
if keys.key_path.len() != num { return Err(MismatchedNumberOfProofs { .. }) }
...
for ((proof, spec), key) in self.proofs.iter().zip(ics23_specs.iter())
                                .zip(keys.key_path.iter().rev())
```

**Nothing hardcodes the `ibc` store.** A path of `["wasm", <contract store key>]` verifies exactly as well as an IBC commitment path, using the unmodified upstream `membership` SP1 program.

### 2.2 The `merklePrefix` is enforced at the router, not the client

The mainnet Eureka deployment config lists `merklePrefix: ["ibc", ""]` for the `cosmoshub-0` client, which initially looks fatal. It is not. That prefix is applied by `ICS26Router`, not the light client:

```solidity
// ICS26Router.sol
path: ICS24Host.prefixedPath(cInfo.merklePrefix, commitmentPath),
```

A grep for `merklePrefix` across `contracts/light-clients/` returns nothing. `SP1ICS07Tendermint.verifyMembership` accepts a fully caller-supplied `bytes[] path`.

### 2.3 wasmd store layout

From `wasmd/x/wasm/types/keys.go` and `types.go`:

```go
ContractStorePrefix = []byte{0x03}
func GetContractStorePrefix(addr sdk.AccAddress) []byte { return append(ContractStorePrefix, addr...) }
var ContractAddrLen = 32
```

Plain concatenation via `prefix.NewStore`, no length prefixing, and contract addresses are **32 bytes**. So the full store key is:

```
0x03 || <32-byte contract address> || <contract's own key>
```

*(Correction from revision 1, which said `sha256(contract_addr)`. It is the raw bech32-decoded address, unhashed.)*

### 2.4 The off-by-one that would have cost a day

Directly from `ibc-go/testing/chain.go`:

```go
&abci.RequestQuery{ Path: "store/<key>/key", Height: height - 1, Prove: true }
...
// proof height + 1 is returned as the proof created corresponds to the height the proof
// was created in the IAVL tree. Tendermint and subsequently the clients that rely on it
// have heights 1 above the IAVL tree.
return proof, clienttypes.NewHeight(revision, uint64(res.Height)+1)
```

**Query at `H - 1`. Verify against `consensusState[H].root`.** The app hash in a Tendermint header commits to state after the *previous* block. Getting this backwards produces a proof that fails verification with no diagnostic.

`ConvertProofs(res.ProofOps)` then produces the protobuf `MerkleProof` that `MerkleProof::decode_vec` in the SP1 program consumes directly. The pipeline connects with no glue.

### 2.5 Cosmos Hub CosmWasm is permissionless, and the contradictory reporting was about something else

**Proposal 1007 passed in August 2025**, enabling permissionless CosmWasm deployment on the Hub and removing the address whitelist. Reporting elsewhere that the Hub "scrapped smart contract support in July 2025" refers to the **Cosmos EVM** launch being paused, a different program. CosmWasm is live and open. There is no governance dependency for deploying the escrow.

### 2.6 Mainnet deployment addresses

From `cosmos/eureka-ops/deployments/mainnet/1.json`:

| Component | Address |
|---|---|
| ICS26Router (proxy) | `0x3aF134307D5Ee90faa2ba9Cdba14ba66414CF1A7` |
| SP1 verifier | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` |
| `cosmoshub-0` light client | see note below |
| Eureka Security Council (Gnosis Safe) | `0x7B96CD54aA750EF83ca90eA487e0bA321707559a` |

Verification keys for `cosmoshub-0` (`proofApiSrcChain: cosmoshub-4`):

| Program | vKey |
|---|---|
| `membership` | `0x000bd8ec43ea65b85c87eb57ace44692c3292ff297e01f29542b9fb476ed3e4f` |
| `uc-and-membership` | `0x009fe47dbd3934f92417fbe4f17e79fe89417d61a724f66fadbc361b475dc091` |
| `update-client` | `0x00d38536f65ab10e7eff0895b1b9f7cf12f89691631742bb487fe090027e0e6d` |

**Address discrepancy, resolved.** Skip's docs list the `cosmoshub-0` client at `0xeA6F72650da80093A1012606Cc7328f5474ed378`; `eureka-ops` lists `0x4bB8A05D5b40dF7a3B97770E1943461B681B62E9`. The router says `eureka-ops` is right (checked 2026-09-23), so the Skip docs are stale:

```bash
cast call 0x3aF134307D5Ee90faa2ba9Cdba14ba66414CF1A7 "getClient(string)(address)" "cosmoshub-0"
# 0x4bB8A05D5b40dF7a3B97770E1943461B681B62E9
```

The live client reports chain `cosmoshub-4`, not frozen, Groth16, and `MEMBERSHIP_PROGRAM_VKEY` matches the table above. Still don't hardcode it. Store the router and resolve the client on every call, since a redeploy will happen again.

Side note: the router itself uses an OpenZeppelin `AccessManager` (`0x3fa3f45acE1645614c80679AeEcE0A82A93c77Ec`), not `AccessControl`. `recvPacket` and `timeoutPacket` need role 1, so relaying is permissioned.

### 2.7 Inherited audit coverage

`cosmos/ibc-contracts/docs/audits/` contains a Zellic report (2025-03-25) and a Sherlock report (2025-04-03) covering the light client and SP1 programs Bad Bridge depends on. Bad Bridge's own audit surface is therefore small and sharply defined, which matters for scoping cost.

---

## 3. Architecture

Three independent, permissionless transactions. Each is decoupled, so no holder's mint is blocked by anyone else and nothing stalls if the operator disappears.

```
  COSMOS HUB                    OFF-CHAIN                     ETHEREUM
  ==========                    =========                     ========

  [1] holder                    [2] batcher                   [3] holder
      send_nft ──> BadBridge        abci_query prove=true          claim(tokenId)
                   Escrow           SP1 membership proof                │
                     │              ────────────────────>               │
                     │                                    BadBridge.sol │
                 writes record                                  │       │
                 to wasm store                            verify proof  │
                                                          store record  │
                                                                        │
                                                                 mint ERC-721
```

---

## 4. Component 1: the CosmWasm escrow

Target size: roughly 200 lines of Rust.

### The constraint that drives the design

The value bytes stored on Cosmos Hub are the exact bytes `BadBridge.sol` reads out of the SP1 proof's public values. `cw-storage-plus` serializes with `serde_json_wasm`, and parsing JSON in Solidity is miserable and expensive.

**Bypass `cw-storage-plus` for the bridged records. Write raw storage in an ABI-friendly layout.**

```rust
// key:   b"b" || token_id.to_be_bytes()   (u32, 4 bytes)
// value: 20-byte Ethereum address, nothing else
//
// The token ID does not need to be in the value. It is already in the key,
// and the SP1 membership program commits the full path to its public values,
// so BadBridge.sol reads the token ID from the path suffix and the recipient
// from the value.

fn record_key(token_id: u32) -> Vec<u8> {
    let mut k = Vec::with_capacity(5);
    k.push(b'b');
    k.extend_from_slice(&token_id.to_be_bytes());
    k
}

deps.storage.set(&record_key(token_id), recipient_20_bytes);
```

Resulting full store key, which is what the batcher queries:

```
0x03 || <32-byte escrow address> || b"b" || <token_id u32 BE>
```

### Messages

```rust
pub enum ExecuteMsg {
    /// cw721 receiver hook. msg payload is the 20-byte ETH address.
    ReceiveNft(Cw721ReceiveMsg),
}

pub enum QueryMsg {
    Pending { start_after: Option<u32>, limit: Option<u32> },
    Record { token_id: u32 },
}
```

### Rules

- Accepts NFTs only from the canonical Bad Kids cw721, hardcoded at instantiation. Reject anything else.
- Rejects a token ID that already has a record. One shot per kid.
- Validates the payload is exactly 20 bytes. A malformed address means permanently stranded value, so fail at commit time.
- **No migrate admin.** Instantiate with `admin: None`. An exit door the operator can rewrite is not an exit door. This is the single most important line in the project.

### Burn or hold

Recommendation: **hold**, with `admin: None` making it functionally equivalent to a burn. The NFTs sit in a contract that cannot release them and cannot be upgraded to release them. Same finality, better optics, and it leaves governance a path to build a return leg later without having destroyed anything.

---

## 5. Component 2: the batcher

An off-chain script with no special privileges. Anyone can run one.

### Height selection

Read the client's latest height directly. `clientState` is a public getter on `SP1ICS07Tendermint` and `ClientState` includes `latestHeight`:

```solidity
struct ClientState {
    string chainId; TrustThreshold trustLevel; Height latestHeight;
    uint32 trustingPeriod; uint32 unbondingPeriod; bool isFrozen; SupportedZkAlgorithm zkAlgorithm;
}
```

Then query Cosmos Hub at `latestHeight - 1` and prove against `consensusState[latestHeight]`.

**This mostly removes the archive node problem, but not fully.** In practice the client lags. On 2026-09-23 it sat ~1,100 blocks (~1.5h) behind the Hub, and publicnode had already pruned `H - 1` (`proof is unexpectedly empty`). Polkachu, kjnodes, ecostake and cosmos.directory all still had it. So you don't need a true archive node, but you do need one that keeps more than the aggressive default. Retry against a few RPCs.

**The corresponding dependency:** Bad Bridge cannot call `updateClient` on the canonical client, so it cannot advance the root itself. It depends on Eureka relayer traffic for fresh heights. Eureka carries real volume so this is fine in practice, but if Eureka traffic dried up, Bad Bridge would stall. Escape hatch in section 8.

The light client emits no events on update, so there is no log to subscribe to. Poll `clientState()`.

### The query

```bash
# path is /store/<store_key>/key ; data is the full contract store key, hex
# NOTE the height: latestHeight - 1
curl "$RPC/abci_query?path=%22/store/wasm/key%22&data=0x03...&height=<H-1>&prove=true"
```

Convert `ProofOps` to a protobuf `MerkleProof` (two ops: IAVL, then multistore) and feed it to the SP1 program alongside the app hash.

### The merkle path

```
path[0] = b"wasm"
path[1] = 0x03 || <escrow address> || b"b" || <token_id BE>
value   = <20-byte ETH recipient>
```

### Batching

The `membership` program reads a `u16` count and loops, accepting up to 65,535 KV pairs per proof. The upstream test suite has a passing 100-pair Groth16 fixture (`membership_100-groth16_fixture.json`), so a hundred is known-good territory. Opt-in volume will not approach the ceiling.

Use `uc-and-membership` instead of `membership` if you end up running your own client and want the update and the state proof in a single proof.

Reference prover implementation to crib from: `packages/sp1-ics07-tendermint-prover` in `cosmos/ibc-contracts`. Submit with `--groth16`.

---

## 6. Component 3: BadBridge.sol

Target size: roughly 150 lines.

### Why you cannot just call the light client

`verifyMembership` is gated by `onlyProofSubmitter`:

```solidity
modifier onlyProofSubmitter() {
    if (!hasRole(PROOF_SUBMITTER_ROLE, address(0))) { _checkRole(PROOF_SUBMITTER_ROLE); }
    _;
}
```

The role opens to everyone only when granted to `address(0)`, which the constructor does when `roleManager == address(0)`. The constructor's own docs say `roleManager` "Should be the ICS26Router if used in IBC," which is what the Eureka deployment does. **Assume it is gated.** Confirm in one call:

```bash
cast call <client> "hasRole(bytes32,address)(bool)" \
  $(cast keccak "PROOF_SUBMITTER_ROLE") 0x0000000000000000000000000000000000000000
```

### Verify against the client's root without touching it

The read surface is public and that is all you need. `getConsensusStateHash(uint64)` is a `public view` returning `keccak256(abi.encode(ConsensusState))`, and the program vKeys are public immutables.

`ConsensusState` is `(uint128 timestamp, bytes32 root, bytes32 nextValidatorsHash)` and the timestamp is in **nanoseconds**. Verified: rebuilding it from the Hub header at 33090075 reproduces the on-chain hash exactly.

```solidity
function submitBatch(
    uint64 proofHeight,
    ConsensusState calldata cs,      // reconstructed by the batcher
    SP1Proof calldata sp1Proof
) external {
    // 1. Anchor to the canonical Eureka client
    require(
        keccak256(abi.encode(cs)) == LIGHT_CLIENT.getConsensusStateHash(proofHeight),
        "bad consensus state"
    );
    require(sp1Proof.vKey == LIGHT_CLIENT.MEMBERSHIP_PROGRAM_VKEY(), "bad vkey");

    // 2. Verify the ZK proof against the same verifier Eureka uses
    VERIFIER.verifyProof(sp1Proof.vKey, sp1Proof.publicValues, sp1Proof.proof);

    // 3. Bind proven state to the Hub's app hash
    MembershipOutput memory out = abi.decode(sp1Proof.publicValues, (MembershipOutput));
    require(out.commitmentRoot == cs.root, "root mismatch");

    // 4. Record every proven kid
    for (uint256 i = 0; i < out.kvPairs.length; ++i) {
        (uint32 tokenId, address recipient) = _parse(out.kvPairs[i]);
        if (proven[tokenId] == address(0)) { proven[tokenId] = recipient; }
    }
}

function claim(uint32 tokenId) external {
    address to = proven[tokenId];
    require(to != address(0), "not proven");
    require(!claimed[tokenId], "already claimed");   // NON-NEGOTIABLE
    claimed[tokenId] = true;
    _safeMint(to, tokenId);
}
```

Read `LIGHT_CLIENT` from `ICS26Router.getClient("cosmoshub-0")` rather than hardcoding, given the address discrepancy in section 2.6.

### `_parse` is the entire attack surface

It must validate:

- `path.length == 2`
- `path[0] == "wasm"`
- `path[1]` starts with the exact 33-byte prefix `0x03 || <escrow address>`
- the next byte is `b"b"`
- exactly 4 bytes of token ID follow, and nothing else
- `value.length == 20`

Skip any one of these and an attacker proves an arbitrary key from an arbitrary contract on Cosmos Hub and mints whatever they like. Fuzz it. This function plus the escrow receive path is the whole audit scope.

### Collection rules

- **Token IDs mirror Cosmos exactly.** #7012 is #7012, not sequential mint order.
- **`tokenURI` points at the same IPFS CIDs.** Same art, no re-hosting, no new trust assumption.
- **Bridge is sole minter, ownership renounced.** ERC-2981 royalties, if any, immutable at deploy.
- **Replay protection keyed on token ID**, not on batch or proof. A record can legitimately appear in multiple proofs if the batcher's pending-set bookkeeping drifts.

---

## 7. Cost model

From the upstream end-to-end benchmarks:

| Item | Cost |
|---|---|
| Groth16 verification | ~230,000 gas |
| Proof generation | ~25 seconds |
| `submitBatch` | ~230k + ~25k per kid recorded |
| `claim` | ~80k gas |
| `updateClient` | zero, inherited from Eureka |

The fixed ~230k plus prover fee applies per batch regardless of size. With opt-in trickle volume that overhead cannot be amortized on a schedule you control, which is exactly why the three-transaction split matters: whoever wants to go now pays the full fixed cost, everyone else waits and splits it.

---

## 8. Trust model and risks

**Inherited, and strong:** Cosmos Hub validator honesty, correctness of `tendermint-rs` and `ibc-rs` compiled into SP1, SP1 Groth16 soundness, and the liveness of Eureka's relayers. All audited by Zellic and Sherlock.

**Added, and small:** the escrow receive logic, `_parse`, and batcher honesty. Note that a dishonest batcher cannot mint anything false, since every mint is backed by a ZK proof of real Hub state. It can only refuse to prove records, and anyone else can run a batcher.

| Risk | Mitigation |
|---|---|
| Escrow admin rug | `admin: None`. Non-negotiable. |
| `_parse` bug mints arbitrary tokens | Strict prefix validation plus fuzzing. Primary audit target. |
| Malformed recipient strands an NFT | Validate 20-byte length at commit, fail the receive. |
| Off-by-one on proof height | Query at `H-1`. Section 2.4. |
| Stale client address in docs | Resolve via `ICS26Router.getClient` at runtime. |
| Eureka relayer traffic stops, roots go stale | Deploy an own `SP1ICS07Tendermint` with `roleManager = address(0)`, then self-serve `uc-and-membership`. Costs upkeep, but it is a copy-paste recovery from an audited contract. |
| Security Council freezes the client | Same escape hatch. |
| Liquidity fragmentation | Disclosure, not mitigation. |

---

## 9. Build order

**Spike, one afternoon, before any contract code.** Run `abci_query` with `prove=true` against any existing Cosmos Hub contract's storage key at `latestHeight - 1`. Feed the ICS-23 proof and app hash into the upstream `membership` program under `cargo run --release -- --execute`. Confirm the `["wasm", 0x03||addr||key]` path verifies and check the cycle count.

Everything in section 2 says this should work. The spike is what turns "should" into "does."

**Result (2026-09-23): it does.**

| Check | Result |
|-|-|
| client latest height `H` | 33090075 |
| rebuilt `ConsensusState` vs `getConsensusStateHash(H)` | match (ns timestamp) |
| `abci_query /store/wasm/key` at `H-1` | 2 ops, `ics23:iavl` + `ics23:simple` |
| ibc-go `VerifyMembership` with `["wasm", 0x03\|\|addr\|\|key]` | OK |
| upstream `membership` program, `--execute` | OK, 273,410 cycles, root matches |

Program built from `solidity-ibc-eureka` HEAD `0759094` with SP1 6.1. Heads up, `sp1-sdk` 6.1 needs rustc >= 1.91. HEAD's ELF does **not** match the deployed vkey (`0x007f9c22...`). The released `sp1-programs-v2.0.0` ELF asset does: `0x000bd8ec...`, 276,981 cycles on the same proof. Don't build it, download it: `gh release download sp1-programs-v2.0.0 -R cosmos/solidity-ibc-eureka -p sp1-ics07-tendermint-membership`.

Then:

1. Escrow contract plus unit tests, deployed to a Hub testnet
2. Batcher, end to end against testnet, one record
3. `BadBridge.sol` against a mocked client, then against the real mainnet client and a real historical root
4. Fuzz `_parse` until it is boring
5. Frontend, with the liquidity disclosure on the commit screen
6. Audit, scoped to `_parse` and the escrow receive path
7. Mainnet, ownership renounced, admin absent

---

## 10. Remaining open questions

All are lookups, not research.

- **Is `PROOF_SUBMITTER_ROLE` open on the live client?** One `cast call`. Does not block anything; if open, the Solidity gets slightly shorter.
- ~~Does the `membership` ELF vkey match the deployed one?~~ Use the `sp1-programs-v2.0.0` release asset. Section 9.
- ~~Which `cosmoshub-0` client address is live?~~ `0x4bB8A05D...62E9`. Section 2.6.
- **What is the post-migration Bad Kids cw721 address and code ID on Cosmos Hub?** Query the Stargaze indexer or `gaiad query wasm list-contract-by-code`. Also worth confirming the new contract supports `send_nft` with a receiver hook, which the standard requires but Stargaze's variants sometimes wrap.
- **Does the Bad Kids DAO want to bless this, ignore it, or oppose it?** Opt-in means it ships without blessing. Blessing makes the Ethereum collection canonical rather than merely real.

---

## 11. Rejected alternative: ICS20 "ticket" tokens

The idea was to skip the batcher and prover entirely. The escrow would mint a unique tokenfactory denom per kid (`factory/<escrow>/7012`) and send it over Eureka ICS20, and the ERC721 would redeem the resulting IBCERC20 voucher. The denom path is the proof, and relaying is Eureka's problem.

Dead on arrival. Tried on mainnet 2026-09-23 (tx `E80B6940...`):

```
base denomination factory/.../badbridgetest cannot contain slashes for IBC v2 packet
```

ibc-go v10 `transfer/v2/ibc_module.go` bans `/` in base denoms for v2 packets, and every tokenfactory denom has one. CW20 can't go over native ICS20 either. Even without that, `recvPacket` on the Eth router is gated (role 1), so you'd be at the mercy of whoever runs the relayer.

Other gotchas we hit along the way, in case this comes back:

- wasmd's `IbcMsg::Transfer` has no encoding field, so it'd go out JSON. Eth ICS20 wants `application/x-solidity-abi`, meaning you'd need `AnyMsg`.
- IBC v2 timeouts are absolute **seconds**, max 24h. The CLI's relative ns default gets rejected.
- The Hub's live Eth client is `08-wasm-1369`. `1363`-`1371` all point at the same router but the others are stale.
