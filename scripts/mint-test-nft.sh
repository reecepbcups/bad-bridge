#!/usr/bin/env bash
# Mint token ids on the ReeceBadTest cw721, with token_uri copied from the real Bad Kids
# collection so test tokens use real art. One tx per id, sequential (sequence numbers
# don't survive fire-and-forget parallel broadcast).
#
# Usage: scripts/mint-test-nft.sh <owner-bech32> <id> [id ...]
# Example: scripts/mint-test-nft.sh cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr 9 10 11

set -euo pipefail

CW721=cosmos158d2rz0aw8cxx86j0tl8gfwleqyqefr9xdgth2jdfse2d9uumltsu83rfr
BADKIDS_IPFS_CID=QmUoHk4hY6mNoHgNEJDcy94APUky6o8xVmyD3YzddJtUWe
FROM_KEY=income
NODE=https://cosmos-rpc.polkachu.com:443

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <owner-bech32> <id> [id ...]" >&2
  exit 1
fi

owner="$1"
shift

for id in "$@"; do
  gaiad tx wasm execute "$CW721" \
    '{"mint":{"token_id":"'"$id"'","owner":"'"$owner"'","token_uri":"ipfs://'"$BADKIDS_IPFS_CID"'/'"$id"'","extension":{}}}' \
    --from "$FROM_KEY" --chain-id cosmoshub-4 --gas auto --gas-adjustment 1.3 --gas-prices 0.005uatom \
    --node "$NODE" -y
  sleep 7
done
