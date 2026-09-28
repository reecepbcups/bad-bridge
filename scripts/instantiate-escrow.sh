#!/usr/bin/env bash
# Instantiate the escrow contract, with EmergencyUnlock admin set to reece's hub address.
# No CosmWasm admin (--no-admin): production escrow deployments stay non-migratable.
#
# Usage: scripts/instantiate-escrow.sh <code-id> [label]
# Example: scripts/instantiate-escrow.sh 812

set -euo pipefail

CW721=cosmos158d2rz0aw8cxx86j0tl8gfwleqyqefr9xdgth2jdfse2d9uumltsu83rfr
ADMIN=cosmos1reece3m8g4m3d0qrpj93rnnseudnpzhrey64rr
FROM_KEY=income
NODE=https://cosmos-rpc.polkachu.com:443

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <code-id> [label]" >&2
  exit 1
fi

code_id="$1"
label="${2:-bad-bridge-escrow}"

gaiad tx wasm instantiate "$code_id" \
  '{"cw721":"'"$CW721"'","admin":"'"$ADMIN"'"}' \
  --label "$label" --no-admin \
  --from "$FROM_KEY" --chain-id cosmoshub-4 --gas auto --gas-adjustment 1.3 --gas-prices 0.005uatom \
  --node "$NODE" -y
