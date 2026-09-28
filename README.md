# Bad Bridge

One-way NFT bridge, Cosmos Hub cw721 -> Ethereum ERC721. It reuses the IBC Eureka `cosmoshub-0` SP1 light client that's already on Ethereum mainnet, so there's no relayer, no channel and no light client of our own. Full design is in `bad-bridge-design.md`.

Result: ReeceBadTest #2 and #3 left the Hub and got minted on Ethereum mainnet on 2026-09-23. #1 stayed on the Hub.

## How it works (short version)

1. You `send_nft` to the escrow contract on the Hub, with your ETH address as the message
2. The escrow writes a raw record: key `"b" || token_id`, value `<20 byte ETH address>`
3. The batcher proves that record against the app hash the Eureka client already stores on Ethereum, then turns it into a Groth16 proof with SP1
4. `BadBridge.submitBatch` checks the proof against the live client, parses the token id and recipient out of the proven key/value, and records them
5. Anyone calls `claim(id)`, which mints the same token id to the recorded address

The batcher can't lie. Every record is checked on-chain, so the worst it can do is not submit.

Metadata doesn't move. `tokenURI` is `baseURI + id` pointing at the same IPFS folder the Hub uses.

## Steps we took

### 1. Tried the "ticket token" idea first (dead)

The idea was to mint a tokenfactory denom per NFT and send it over Eureka ICS20. It doesn't work: IBC v2 rejects any base denom with a `/`, and every tokenfactory denom has one.

- failed transfer: https://www.mintscan.io/cosmos/tx/E80B694077289531AACE64AFDAA54A4C8C4E74F9C216E628FC0ACACD6B923ED1

Also learned the Eth router's `recvPacket` is permissioned (AccessManager role 1), so we can't relay ourselves.

### 2. Spike: can we prove arbitrary wasm state?

Yes. We queried a random contract's storage at `H-1`, rebuilt the consensus state for `H` and matched it to `getConsensusStateHash(H)` on the live client, then verified `["wasm", 0x03||addr||key]` with ibc-go and the upstream SP1 `membership` program.

Things we found along the way:

- The live client is `0x4bB8A05D5b40dF7a3B97770E1943461B681B62E9` (eureka-ops was right, Skip docs are stale)
- `ConsensusState.timestamp` is in nanoseconds
- publicnode prunes too hard. polkachu / kjnodes / ecostake keep enough history
- HEAD of solidity-ibc-eureka builds the wrong vkey. Use the `sp1-programs-v2.0.0` release ELF, it matches `0x000bd8ec...`

### 3. Built the three pieces

| Piece | Where | What |
|-|-|-|
| escrow | `escrow/` | CosmWasm, raw record storage, `pending` query, rejects wrong collection / bad address / replays |
| bridge | `eth/` | `BadBridge.sol`, ERC721 + proof check + strict `parse()`, no owner |
| batcher | `batcher/service/` | Rust, finds unproven records, proves via Succinct network, submits |

Tested on an Anvil mainnet fork first with a real Groth16 proof.

### 4. Mainnet run

**Hub side**

- ReeceBadTest cw721 (code 431): `cosmos158d2rz0aw8cxx86j0tl8gfwleqyqefr9xdgth2jdfse2d9uumltsu83rfr`
  - https://www.mintscan.io/cosmos/wasm/contract/cosmos158d2rz0aw8cxx86j0tl8gfwleqyqefr9xdgth2jdfse2d9uumltsu83rfr
  - instantiate: https://www.mintscan.io/cosmos/tx/8F3C4064C49A19413215D9B90C3317CC08F121CD8316A0C31464455328590E3B
  - mint 1: https://www.mintscan.io/cosmos/tx/E49125904DF4517574D7B9639C0244A61F6999DC53E511B64C6C15F20E813E2F
  - mint 2: https://www.mintscan.io/cosmos/tx/262982BA52AF8EE81D966E73B84B115ED5580900CD8082A736FAF8151D333938
  - mint 3: https://www.mintscan.io/cosmos/tx/F9471AB9EA96DE612EDDC243F73836C68E0C3A1D24933A7F296951C54723F165
  - mint 4: https://www.mintscan.io/cosmos/tx/42EBEBA6524A79C2CBED1ED00573CF76DCF36E705962D1DE3EF27D927022D59B
  - mint 5: https://www.mintscan.io/cosmos/tx/EBA0AE761209D431758F0A810347C122383314ADFAF4ED7F4AFA131DE3646B27
  - mint 6: https://www.mintscan.io/cosmos/tx/320C03938AF5B3D1651825BF256A564351D06E73CDA65CBA2533904B84600520
  - mint 7: https://www.mintscan.io/cosmos/tx/8FE3313718F60749BCB3798ED08B13537E1737D3A9C497AC21ACEE31F7B51E28
  - mint 8: https://www.mintscan.io/cosmos/tx/C6706712783C4E68BFBA398FB2D1B39989E875234FEFFE7A0D0641CA3B87D8FA
- Escrow (code 750): `cosmos1zr8k7ch8e9g7lqcgcd0peaklj43ymxvcusvqk7ver4zaqgdvragq8gumtv`
  - https://www.mintscan.io/cosmos/wasm/contract/cosmos1zr8k7ch8e9g7lqcgcd0peaklj43ymxvcusvqk7ver4zaqgdvragq8gumtv
  - send #2: https://www.mintscan.io/cosmos/tx/0C72F725E53CD2B4EB6159EA0FF2C0C85DA1B9189FD84BA28DEA6F0071BAC2E5
  - send #3: https://www.mintscan.io/cosmos/tx/27258AA868B73A71A75DFB3174627894ED5EAC77410813EDC2FBD614C40BB9F6

**The nudge (Skip Go)**

The Eth client only moves when Eureka relays something. So we sent 0.01 ATOM over Eureka to force a client update. It got relayed in about 10 min.

- Hub send: https://www.mintscan.io/cosmos/tx/7581E6EC8BF2E7B51A623D414131723526D9A028414514BF1A3895D8A456FCEF
- Skip explorer: https://explorer.skip.build/?tx_hash=7581E6EC8BF2E7B51A623D414131723526D9A028414514BF1A3895D8A456FCEF&chain_id=cosmoshub-4
- Skip API:

```bash
curl -s "https://api.skip.build/v2/tx/status?tx_hash=7581E6EC8BF2E7B51A623D414131723526D9A028414514BF1A3895D8A456FCEF&chain_id=cosmoshub-4" | jq .state
```

- Eureka client (watch its updates): https://etherscan.io/address/0x4bB8A05D5b40dF7a3B97770E1943461B681B62E9

**Ethereum side**

- BadBridge (ReeceBadTest / RBT): https://etherscan.io/address/0xDe185D7902340086cc4C37322584e246DC5eE198

| Step | Tx | Gas |
|-|-|-|
| deploy | https://etherscan.io/tx/0xfb0665ed4888474382620e7f9c6b79750974173dbe913862c2b3df16c7badd64 | 2.95M |
| submitBatch (#2 + #3, one proof) | https://etherscan.io/tx/0x87bf06465f250d105196f199bcdd24eb467c1e4f90ef828248bb8d17a0fccd93 | 345,791 |
| claim(2) | https://etherscan.io/tx/0x3dddea64d7603513225780583831558cb89d2ef250997644ece6f1e3a5b5f6c0 | ~79k |
| claim(3) | https://etherscan.io/tx/0x64faa31fce85547521e14460853e3105dc6a7b9845ad460823bfc6955f2dde8b | ~79k |

Total was about 0.00046 ETH at ~0.13 to 0.26 gwei.

## Where to look at the NFTs

- Etherscan, my wallet: https://etherscan.io/address/0xD2C392084761cb6E44c544B6f39dcc001fDe9775#nfttransfers
- Etherscan, collection: https://etherscan.io/token/0xDe185D7902340086cc4C37322584e246DC5eE198
- OpenSea #2: https://opensea.io/assets/ethereum/0xDe185D7902340086cc4C37322584e246DC5eE198/2
- OpenSea #3: https://opensea.io/assets/ethereum/0xDe185D7902340086cc4C37322584e246DC5eE198/3
- Hub #1 (still on Cosmos): https://www.mintscan.io/cosmos/wasm/contract/cosmos158d2rz0aw8cxx86j0tl8gfwleqyqefr9xdgth2jdfse2d9uumltsu83rfr

Stargaze probably won't show the Hub collection, it looks like it only indexes its own migrated ones.

## Before real Bad Kids

- Confirm `cw721-migration` (Bad Kids is `cosmos12gsv9tmjhhg86wg9fnd9cnju28jx3fxva9cn8dh9meketkfxxajqmg3exz`) actually calls the receiver hook on `send_nft`. There's no `send_nft` in its history yet
- Deploy the escrow with `--no-admin`
- Audit `parse()` and the escrow receive path, fuzz a lot more
- Rotate the prover key, it leaked into a chat log
