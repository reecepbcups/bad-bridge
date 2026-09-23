//! Runs the SP1 membership program on the spike's wasm-store proof.
//! Default executes only. PROVE=1 requests a Groth16 proof from the Succinct prover network
//! (needs NETWORK_PRIVATE_KEY) and writes <out>/sp1_proof.json for BadBridge.submitBatch.

use sp1_sdk::blocking::{ProveRequest, Prover, ProverClient};
use sp1_sdk::{Elf, HashableKey, ProvingKey, SP1Stdin};

fn main() {
    let elf_path = std::env::args().nth(1).expect("usage: spike-host <membership elf> [out dir]");
    let out = std::env::args().nth(2).unwrap_or_else(|| "../out".into());
    let read = |f: &str| std::fs::read(format!("{out}/{f}")).unwrap_or_else(|e| panic!("read {f}: {e}"));

    let app_hash = read("app_hash.bin");
    let mut stdin = SP1Stdin::new();
    stdin.write_slice(&app_hash);
    stdin.write_slice(&1u16.to_le_bytes());
    stdin.write_vec(read("kv.bin"));
    stdin.write_vec(read("proof.bin"));

    let elf = std::fs::read(&elf_path).expect("read elf");

    // must equal the deployed client's MEMBERSHIP_PROGRAM_VKEY or on-chain verification fails
    let mock = ProverClient::builder().mock().build();
    let pk = mock.setup(Elf::from(elf.clone())).expect("setup failed");
    let vkey = pk.verifying_key().bytes32();
    println!("vkey={vkey}");

    let client = ProverClient::builder().cpu().build();
    let (public_values, report) = client.execute(Elf::from(elf.clone()), stdin.clone()).run().expect("execute failed");

    let pv = public_values.to_vec();
    // abi.encode(MembershipOutput): head offset, then commitmentRoot as the first field
    let root_ok = pv.len() >= 64 && pv[32..64] == app_hash[..];
    println!("EXECUTE OK cycles={} public_values_len={} root_matches_app_hash={root_ok}", report.total_instruction_count(), pv.len());

    if std::env::var("PROVE").as_deref() != Ok("1") {
        return;
    }
    let network = ProverClient::builder().network().build();
    let npk = network.setup(Elf::from(elf)).expect("network setup failed");
    let proof = network.prove(&npk, stdin).groth16().run().expect("network prove failed");
    let json = format!(
        "{{\"vKey\":\"{vkey}\",\"publicValues\":\"0x{}\",\"proof\":\"0x{}\"}}\n",
        hex(proof.public_values.as_slice()),
        hex(&proof.bytes())
    );
    std::fs::write(format!("{out}/sp1_proof.json"), json).expect("write proof");
    println!("PROVE OK wrote {out}/sp1_proof.json");
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
