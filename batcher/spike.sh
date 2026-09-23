#!/usr/bin/env bash
# Bad Bridge spike, steps 2-4: prove a wasm storage key at H-1 against the root Ethereum stores for H.
set -euo pipefail
cd "$(dirname "$0")"

ETH=https://ethereum-rpc.publicnode.com
HUB=${HUB:-https://cosmos-rpc.publicnode.com:443}
REST=https://cosmos-rest.publicnode.com
LC=0x4bB8A05D5b40dF7a3B97770E1943461B681B62E9
mkdir -p out

# latest height the Eth client knows about
H=${H:-$(cast call $LC "clientState()(string,(uint8,uint8),(uint64,uint64),uint32,uint32,bool,uint8)" --rpc-url $ETH | sed -n 3p | sed -E 's/^\(4, ([0-9]+).*/\1/')}
echo "H=$H (query at $((H - 1)))"

# step 3: rebuild consensus state for H from the Hub header, compare with Eth
curl -s "$HUB/block?height=$H" > out/block.json
APP=0x$(jq -r .result.block.header.app_hash out/block.json | tr A-F a-f)
NVH=0x$(jq -r .result.block.header.next_validators_hash out/block.json | tr A-F a-f)
TIME=$(jq -r .result.block.header.time out/block.json)
TS_NS=$(python3 -c "
import sys,datetime
t=sys.argv[1].rstrip('Z'); base,frac=(t.split('.')+['0'])[:2]
d=datetime.datetime.fromisoformat(base).replace(tzinfo=datetime.timezone.utc)
print(int(d.timestamp())*10**9+int(frac.ljust(9,'0')[:9]))" "$TIME")
ONCHAIN=$(cast call $LC "getConsensusStateHash(uint64)(bytes32)" $H --rpc-url $ETH)
echo "app_hash=$APP time=$TIME onchain=$ONCHAIN"
ANCHOR=no
for ts in $TS_NS $((TS_NS / 1000000000)); do
  calc=$(cast keccak $(cast abi-encode "f(uint128,bytes32,bytes32)" $ts $APP $NVH))
  [ "$calc" = "$ONCHAIN" ] && { echo "ANCHOR OK (timestamp=$ts)"; ANCHOR=yes; }
done
[ $ANCHOR = yes ] || echo "ANCHOR MISMATCH"

# step 2: pick a contract + one raw key, abci_query with proof at H-1
CONTRACT=${CONTRACT:-$(curl -s "$REST/cosmwasm/wasm/v1/code/1/contracts?pagination.limit=1" | jq -r '.contracts[0]')}
ADDR_HEX=$(gaiad debug addr "$CONTRACT" | awk '/Address \(hex\)/{print tolower($3)}')
RAWKEY=${RAWKEY:-$(curl -s "$REST/cosmwasm/wasm/v1/contract/$CONTRACT/state?pagination.limit=1" | jq -r '.models[0].key' | tr A-F a-f)}
STOREKEY=03${ADDR_HEX}${RAWKEY}
echo "contract=$CONTRACT addr=$ADDR_HEX rawkey=$RAWKEY"
curl -s "$HUB/abci_query?path=%22/store/wasm/key%22&data=0x$STOREKEY&height=$((H - 1))&prove=true" > out/query.json
jq -c '.result.response | {code, log, height, value_len: (.value // "" | length), ops: [.proofOps.ops[]?.type]}' out/query.json

# step 4: verify ICS-23 proof locally against app_hash of H
go run ./verify -query out/query.json -apphash "$APP" -storekey "$STOREKEY"

# SP1 input: abi.encode(KVPair{bytes[] path; bytes value})
VALUE=0x$(xxd -p out/value.bin | tr -d '\n')
cast abi-encode "f((bytes[],bytes))" "([$(cast from-utf8 wasm),0x$STOREKEY],$VALUE)" | xxd -r -p > out/kv.bin
echo "wrote out/{app_hash,kv,proof}.bin for SP1"

# consensus state for BadBridge.submitBatch
printf 'HEIGHT=%s\nCS_TIMESTAMP=%s\nCS_ROOT=%s\nCS_NVH=%s\n' "$H" "$TS_NS" "$APP" "$NVH" > out/cs.env
echo "wrote out/cs.env"
