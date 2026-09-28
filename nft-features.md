# Bad Bridge NFT features

Research for what `BadBridge.sol` should look like as an NFT contract before the real Bad Kids deploy. Voting, royalties, OpenSea, and which OpenZeppelin extensions are worth it.

Status: decisions made 2026-09-28 (section 7). The step-by-step plan is in `nft-implementation-plan.md`. Branch `worktree-nft-features`.

---

## 1. Why this has to be decided now

`BadBridge` has no owner and no proxy. Whatever ships in the real Bad Kids deploy is permanent:

- Voting can't be bolted on later. OZ `Governor` needs the token to implement `IVotes`.
- Nobody can set royalties, a collection image, or claim the OpenSea page unless the contract gives someone that power.
- Every extension runs inside `_update`, which runs on every `claim`. If an extension can revert there, a proven kid can get stuck.

The `ReeceBadTest` deploy (`0xDe185D79...`) is a test collection and stays as it is. Everything here targets the next deploy.

OZ is pinned at v5.4.0 (`eth/foundry.lock`). Every API below was checked against that version.

---

## 2. Voting

### Recommendation: `ERC721Votes`, timestamp clock, self-delegated by default

`ERC721Votes` gives each kid one vote, with checkpoints so a Governor can read voting power at a past timepoint. It brings `EIP712` and `Nonces` with it, so `delegateBySig` works too.

If we skip it, the fallbacks for a later DAO are:

| Fallback | Works? | Catch |
|-|-|-|
| Snapshot (off-chain, `erc721` strategy) | Yes, uses `balanceOf` | Not binding on-chain. Needs a Safe + trusted executor or oSnap |
| OZ `ERC721Wrapper` + `ERC721Votes` | Yes | Holders have to wrap their kids to vote. The wrapped token is what trades, which splits the collection again |
| Staking contract (DAO DAO style) | Yes | Same wrapping problem, plus custody risk |

Including it is cheap insurance. Snapshot still works either way.

### Clock

Default `Votes` clock is `block.number`. Override to `block.timestamp` (`mode=timestamp`). Times in proposals then read as real times, and Tally supports it. It has to match the Governor we deploy later, which reads `CLOCK_MODE()` from the token.

### Delegation

Stock OZ gives a holder zero votes until they call `delegate`. Most holders never do. With a sparse, slowly growing supply, quorum would be hard to reach.

Nouns fixes this by treating "no delegate set" as "delegated to self". In OZ v5 this works by overriding `delegates()`, because `_transferVotingUnits` and `_delegate` both go through it (checked in `Votes.sol` v5.4.0):

```solidity
function _transferVotingUnits(address from, address to, uint256 amount) internal virtual {
    if (from == address(0)) _push(_totalCheckpoints, _add, SafeCast.toUint208(amount));
    if (to == address(0)) _push(_totalCheckpoints, _subtract, SafeCast.toUint208(amount));
    _moveDelegateVotes(delegates(from), delegates(to), amount);
}
```

**Pitfall.** If we only override `delegates()`, then `delegate(address(0))` moves votes to `address(0)`, but `delegates()` now claims they sit with the holder. Those votes are gone from everyone's count. `_delegate` has to map a zero delegatee back to the account too. Both overrides are in section 5.

Trade-offs of self-delegation by default:

- Every transfer writes two account checkpoints (sender and receiver). Mints write one plus the total supply checkpoint. Measured: a transfer goes from 55.6k to 117.5k gas, and a first claim from 70.8k to 167.8k. That's about 0.000012 ETH extra per transfer at 0.2 gwei, and about 0.0012 ETH at 20 gwei. Kept anyway (2026-09-28).
- Kids held by lending or escrow contracts carry votes to that contract. Seaport doesn't hold NFTs, so normal OpenSea listings are unaffected.

### Things for the later Governor, not this contract

- Only bridged kids vote. Cosmos-side holders have no voice on Ethereum.
- Early on, whoever bridges first could control the DAO. `GovernorVotesQuorumFraction` uses `getPastTotalSupply`, so quorum grows with supply. Add a fixed minimum on top.
- There's already a Bad Kids DAO on the Hub. An Ethereum DAO next to it is a social question (design doc section 10).

---

## 3. Royalties and OpenSea

### What OpenSea does today

- Creator fees have been optional on OpenSea since Aug 2023. OpenSea enforces them only for ERC721-C / ERC1155-C contracts wired to Limit Break's transfer validator ([OpenSea blog](https://opensea.io/blog/articles/creator-earnings-erc721-c-compatibility-on-opensea), [docs](https://docs.opensea.io/docs/creator-fee-enforcement)).
- For any other contract, the collection owner can set an optional fee in OpenSea's settings, and each seller chooses whether to pay it ([help center](https://support.opensea.io/en/articles/8867026-how-do-i-set-creator-earnings-on-opensea)).
- OpenSea finds the collection owner through `owner()` (ERC-173) ([Better Programming](https://betterprogramming.pub/how-to-integrate-your-nft-smart-contracts-with-opensea-b2925789a62f)). The deployer wallet reportedly also gets edit access. Not confirmed for the current OpenSea, and deployer access is not something to rely on.
- OpenSea reads collection name, image, and description from `contractURI()` ([contract-level metadata](https://docs.opensea.io/docs/contract-level-metadata)).

ERC-2981 still matters. Other marketplaces and aggregators read `royaltyInfo`.

### Options

| | A. Ownerless | B. Limited owner (recommended) | C. ERC721-C |
|-|-|-|-|
| ERC-2981 | Fixed at deploy | Owner can change it, capped | Yes |
| `contractURI` | Fixed at deploy | Owner can change it | Yes |
| OpenSea page | Unclaimed (maybe deployer) | Owner claims it, sets optional fee | Owner, fees enforced |
| Trust | Nobody controls anything | Owner has cosmetic powers only | Owner can block transfers and marketplaces |
| Can a claim get stuck | No | No | Yes, if the validator reverts on mint |

**Go with B.** C gives the owner control over who can trade kids, adds an external contract to every transfer, and breaks the "proven kid can always be claimed" property. A is the cleanest trust story, but a lost recipient key loses royalties forever and nobody can ever touch the OpenSea page.

B's owner powers are two setters: royalty recipient and rate (capped at 10%), and `contractURI`. The owner **cannot** change `baseURI`, `ESCROW`, `ROUTER`, `clientId`, `proven`, or mint anything. Ownership can go from the creators' Safe to the DAO's timelock later, or be renounced to freeze both setters.

Use `Ownable2Step`, so a typo in `transferOwnership` can't send ownership to a dead address.

### Who "original creators" are

Needs an answer before deploy (section 7). Whoever it is needs an Ethereum address: a Safe for a group, or an immutable 0xSplits split if the percentages should be fixed on-chain. Check whether the Hub cw721 records a creator or royalty setting we should mirror.

---

## 4. Other extensions

| Extension | Verdict | Why |
|-|-|-|
| `contractURI()` (ERC-7572) | **Add** | Collection page metadata. Not in OZ 5.4.0, just a string + `ContractURIUpdated()` event |
| `totalSupply()` | **Add** | Explorers want it. With Votes it's free: return `_getTotalSupply()`, no extra storage |
| `claimMany(uint32[])` | **Add** | Claim a batch in one tx. Skip ids already minted so one front-run claim can't grief the batch |
| `ERC721Enumerable` | Skip | Heavy gas on every transfer. Indexers don't need it |
| `ERC721Burnable` | **Skip, and see 4.1** | Opens a double mint |
| `ERC721Pausable` | Skip | Admin kill switch, and pausing blocks claims |
| `ERC721URIStorage` / ERC-4906 | Skip | Metadata never changes |
| `ERC721Consecutive` | Skip | Ids aren't sequential |
| OZ `Multicall` | Skip | `claimMany` covers the only real use |
| Upgradeable proxy | Skip | Contradicts the whole trust model |

### 4.1 Burn would allow a double mint

`claim` relies on `_mint` reverting when the token already exists. `proven[id]` is never cleared. Add any burn path (`ERC721Burnable`, a future return trip, anything calling `_burn`) and this works:

1. Kid 7 is proven to Alice and claimed
2. Alice burns kid 7
3. Anyone calls `claim(7)`, and kid 7 is minted to Alice again

The design doc's sketch had a `claimed` mapping for this. The shipped contract dropped it because there's no burn. **Decided: no burn.** If that ever changes, bring back a `claimed` bitmap in the same change. `claim`'s comment should say so.

---

## 5. Contract sketch

Not final code. It shows the inheritance, the overrides the compiler will demand, and the self-delegation fix.

```solidity
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Votes } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ERC2981 } from "@openzeppelin/contracts/token/common/ERC2981.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract BadBridge is ERC721, ERC721Votes, ERC2981, Ownable2Step {
    uint96 public constant MAX_ROYALTY_BPS = 1000;
    string private _contractURI;

    event ContractURIUpdated();
    error RoyaltyTooHigh(uint96 bps);

    constructor(
        IRouter router, string memory clientId_, bytes32 escrow,
        string memory name_, string memory symbol_, string memory baseURI_,
        address owner_, address royaltyReceiver, uint96 royaltyBps, string memory contractURI_
    )
        ERC721(name_, symbol_)
        EIP712(name_, "1")
        Ownable(owner_)
    {
        // ... existing assignments
        _setRoyalty(royaltyReceiver, royaltyBps);
        _contractURI = contractURI_;
    }

    // --- cosmetic admin, the only thing onlyOwner touches ---

    function setRoyalty(address receiver, uint96 bps) external onlyOwner { _setRoyalty(receiver, bps); }

    function setContractURI(string calldata uri) external onlyOwner {
        _contractURI = uri;
        emit ContractURIUpdated();
    }

    function _setRoyalty(address receiver, uint96 bps) private {
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh(bps);
        _setDefaultRoyalty(receiver, bps);
    }

    function contractURI() external view returns (string memory) { return _contractURI; }

    function totalSupply() external view returns (uint256) { return _getTotalSupply(); }

    // --- claims ---

    function claimMany(uint32[] calldata tokenIds) external {
        for (uint256 i = 0; i < tokenIds.length; ++i) {
            uint32 id = tokenIds[i];
            address to = proven[id];
            if (to == address(0)) revert NotProven(id);
            // someone already claimed it, skip so the rest still land
            if (_ownerOf(id) == address(0)) _mint(to, id);
        }
    }

    // --- votes ---

    function clock() public view override returns (uint48) { return uint48(block.timestamp); }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) { return "mode=timestamp"; }

    /// @dev Unset means self. Nouns-style, so holders vote without a delegate tx.
    function delegates(address account) public view override returns (address) {
        address d = super.delegates(account);
        return d == address(0) ? account : d;
    }

    /// @dev delegate(0) would strand votes at address(0) while delegates() reports self. Map it to self.
    function _delegate(address account, address delegatee) internal override {
        super._delegate(account, delegatee == address(0) ? account : delegatee);
    }

    // --- required overrides ---

    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721, ERC721Votes) returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount) internal override(ERC721, ERC721Votes) {
        super._increaseBalance(account, amount);
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }
}
```

Notes:

- `delegates(address(0))` still returns `address(0)`, so mints and burns keep the zero-address path in `_transferVotingUnits` intact.
- `_setDefaultRoyalty` already reverts on a zero receiver and on bps above 10000. The cap is ours.
- Bytecode grows. Without the optimizer, votes alone took the runtime to 21.7 KB of the 24 KB limit, so the optimizer is now on (200 runs). The finished contract is 13.97 KB.

---

## 6. Implementation plan

Moved to `nft-implementation-plan.md`.

Audit scope grows by three things, on top of `parse()` and the escrow receive path:

- the `delegates` / `_delegate` overrides
- `claimMany`
- the owner surface, checking it can't reach mint or metadata

---

## 7. Decisions

Made 2026-09-28.

| Decision | Choice |
|-|-|
| Include Votes | Yes |
| Default self-delegation | Yes |
| Clock | Timestamp |
| Owner model | B, limited owner |
| Cap | 10% |
| `claimMany` | Yes |
| Burn | No |

Still open. These are deploy-time values and don't block the code:

| Question | Who |
|-|-|
| Initial owner (creators' Safe?) | Creators |
| Royalty recipient (Safe or 0xSplits split) | Creators |
| Royalty rate (match the Hub/Stargaze setting, if there is one) | Creators |
| Does the Hub cw721 store a creator or royalty setting to mirror | Jake, query it |
| `contractURI` JSON content | Creators |

---

## 8. ABI changes for the UI

For whoever is building the frontend:

- New reads: `getVotes`, `getPastVotes`, `getPastTotalSupply`, `delegates`, `nonces`, `totalSupply`, `royaltyInfo`, `contractURI`, `owner`, `pendingOwner`, `MAX_ROYALTY_BPS`, `clock`, `CLOCK_MODE`
- New writes: `claimMany(uint32[])`, `delegate(address)`, `delegateBySig(...)`. Owner only: `setRoyalty`, `setContractURI`, `transferOwnership`, `acceptOwnership`, `renounceOwnership`
- New events: `DelegateChanged`, `DelegateVotesChanged`, `ContractURIUpdated`, `OwnershipTransferStarted`, `OwnershipTransferred`
- New error: `RoyaltyTooHigh(uint96)`
- `delegates(holder)` returns the holder itself when they haven't picked anyone, never `address(0)`
- `delegateBySig` uses the EIP-712 domain name = collection name, version `"1"`
- Unchanged: `claim`, `submitBatch`, `proven`, `parse`, `Proven`
- The constructor has four extra args. Deploy tooling that builds constructor calldata has to change
