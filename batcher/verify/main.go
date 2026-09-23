// Command verify checks an abci_query proof for ["wasm", storekey] against an app hash.
package main

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	cmtcrypto "github.com/cometbft/cometbft/proto/tendermint/crypto"
	commitmenttypes "github.com/cosmos/ibc-go/v10/modules/core/23-commitment/types"
)

type queryResp struct {
	Result struct {
		Response struct {
			Value    string `json:"value"`
			ProofOps struct {
				Ops []struct {
					Type string `json:"type"`
					Key  string `json:"key"`
					Data string `json:"data"`
				} `json:"ops"`
			} `json:"proofOps"`
		} `json:"response"`
	} `json:"result"`
}

func main() {
	queryPath := flag.String("query", "", "abci_query json")
	appHashHex := flag.String("apphash", "", "app hash of block H")
	storeKeyHex := flag.String("storekey", "", "full wasm store key hex")
	flag.Parse()

	if err := run(*queryPath, *appHashHex, *storeKeyHex); err != nil {
		fmt.Println("VERIFY FAILED:", err)
		os.Exit(1)
	}
	fmt.Println("VERIFY OK: [\"wasm\", 0x03||addr||key] proven against app_hash of H")
}

func run(queryPath, appHashHex, storeKeyHex string) error {
	raw, err := os.ReadFile(queryPath)
	if err != nil {
		return fmt.Errorf("read %s: %w", queryPath, err)
	}
	var q queryResp
	if err := json.Unmarshal(raw, &q); err != nil {
		return fmt.Errorf("decode query: %w", err)
	}

	value, err := base64.StdEncoding.DecodeString(q.Result.Response.Value)
	if err != nil {
		return fmt.Errorf("decode value: %w", err)
	}
	ops := &cmtcrypto.ProofOps{}
	for _, op := range q.Result.Response.ProofOps.Ops {
		k, err := base64.StdEncoding.DecodeString(op.Key)
		if err != nil {
			return fmt.Errorf("decode op key: %w", err)
		}
		d, err := base64.StdEncoding.DecodeString(op.Data)
		if err != nil {
			return fmt.Errorf("decode op data: %w", err)
		}
		ops.Ops = append(ops.Ops, cmtcrypto.ProofOp{Type: op.Type, Key: k, Data: d})
	}

	appHash, err := hex.DecodeString(strings.TrimPrefix(appHashHex, "0x"))
	if err != nil {
		return fmt.Errorf("decode app hash: %w", err)
	}
	storeKey, err := hex.DecodeString(strings.TrimPrefix(storeKeyHex, "0x"))
	if err != nil {
		return fmt.Errorf("decode store key: %w", err)
	}

	proof, err := commitmenttypes.ConvertProofs(ops)
	if err != nil {
		return fmt.Errorf("convert proofs: %w", err)
	}
	path := commitmenttypes.NewMerklePath([]byte("wasm"), storeKey)
	if err := proof.VerifyMembership(commitmenttypes.GetSDKSpecs(), commitmenttypes.NewMerkleRoot(appHash), path, value); err != nil {
		return err
	}

	// raw inputs for the SP1 membership program
	proofBz, err := proof.Marshal()
	if err != nil {
		return fmt.Errorf("marshal proof: %w", err)
	}
	for name, bz := range map[string][]byte{"app_hash.bin": appHash, "proof.bin": proofBz, "value.bin": value} {
		if err := os.WriteFile("out/"+name, bz, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}
	return nil
}
