//! Bad Bridge batcher. Finds escrow records not yet proven on Ethereum, proves them against the
//! Eureka cosmoshub-0 client's latest height with the SP1 membership program, and submits one batch.
//! Holds no special privileges: every submission is checked on-chain, anyone can run one.

mod hub;

use alloy::network::EthereumWallet;
use alloy::primitives::{keccak256, Address, Bytes, FixedBytes};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::signers::local::PrivateKeySigner;
use alloy::sol;
use alloy::sol_types::SolValue;
use anyhow::{bail, Context, Result};
use sp1_sdk::blocking::{NetworkProver, ProveRequest, Prover, ProverClient};
use sp1_sdk::{Elf, HashableKey, ProvingKey, SP1ProvingKey, SP1Stdin};
use std::time::Duration;

sol! {
    struct ConsensusState { uint128 timestamp; bytes32 root; bytes32 nextValidatorsHash; }
    struct SP1Proof { bytes32 vKey; bytes publicValues; bytes proof; }
    struct KVPair { bytes[] path; bytes value; }
    struct TrustThreshold { uint8 numerator; uint8 denominator; }
    struct Height { uint64 revisionNumber; uint64 revisionHeight; }

    #[sol(rpc)]
    interface IBadBridge {
        function lightClient() external view returns (address);
        function proven(uint32 tokenId) external view returns (address);
        function submitBatch(uint64 proofHeight, ConsensusState cs, SP1Proof sp1Proof) external;
    }

    #[sol(rpc)]
    interface IClient {
        function clientState() external view returns (string chainId, TrustThreshold trustLevel, Height latestHeight, uint32 trustingPeriod, uint32 unbondingPeriod, bool isFrozen, uint8 zkAlgorithm);
        function getConsensusStateHash(uint64 revisionHeight) external view returns (bytes32);
        function MEMBERSHIP_PROGRAM_VKEY() external view returns (bytes32);
    }
}

struct Config {
    hub_rpcs: Vec<String>,
    hub_rest: String,
    eth_rpc: String,
    bridge: Address,
    escrow: String,
    elf: String,
    eth_key: PrivateKeySigner,
    poll: Duration,
    max_batch: usize,
    once: bool,
}

impl Config {
    fn from_env() -> Result<Self> {
        let var = |k: &str| std::env::var(k).with_context(|| format!("{k} must be set"));
        let or = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        let cfg = Self {
            hub_rpcs: or("HUB_RPCS", "https://cosmos-rpc.polkachu.com,https://cosmoshub.rpc.kjnodes.com,https://rpc-cosmoshub.ecostake.com")
                .split(',')
                .map(|s| s.trim().trim_end_matches('/').to_string())
                .collect(),
            hub_rest: or("HUB_REST", "https://cosmos-rest.publicnode.com"),
            eth_rpc: or("ETH_RPC", "https://ethereum-rpc.publicnode.com"),
            bridge: var("BRIDGE")?.parse().context("BRIDGE")?,
            escrow: var("ESCROW")?,
            elf: var("MEMBERSHIP_ELF")?,
            eth_key: var("ETH_PRIVATE_KEY")?.parse().context("ETH_PRIVATE_KEY")?,
            poll: Duration::from_secs(or("POLL_SECS", "60").parse().context("POLL_SECS")?),
            max_batch: or("MAX_BATCH", "50").parse().context("MAX_BATCH")?,
            once: or("ONCE", "0") == "1",
        };
        var("NETWORK_PRIVATE_KEY")?; // read by sp1-sdk, fail fast here instead of mid-proof
        if cfg.max_batch == 0 || cfg.max_batch > u16::MAX as usize {
            bail!("MAX_BATCH must be 1..=65535");
        }
        Ok(cfg)
    }
}

fn main() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into())).init();
    let cfg = Config::from_env()?;
    let escrow_raw = hub::escrow_raw(&cfg.escrow)?;
    let hub = hub::Hub::new(cfg.hub_rpcs.clone(), cfg.hub_rest.clone())?;

    // alloy is async, sp1's blocking client builds its own runtime, so keep them apart
    let rt = tokio::runtime::Runtime::new()?;
    let provider = ProviderBuilder::new().wallet(EthereumWallet::from(cfg.eth_key.clone())).connect_http(cfg.eth_rpc.parse()?);
    let bridge = IBadBridge::new(cfg.bridge, &provider);

    let elf = std::fs::read(&cfg.elf).with_context(|| format!("read {}", cfg.elf))?;
    let prover = ProverClient::builder().network().build();
    let pk = prover.setup(Elf::from(elf)).context("sp1 setup")?;
    let vkey: FixedBytes<32> = pk.verifying_key().bytes32().parse()?;

    let client_addr = rt.block_on(async { bridge.lightClient().call().await })?;
    let onchain_vkey = rt.block_on(async { IClient::new(client_addr, &provider).MEMBERSHIP_PROGRAM_VKEY().call().await })?;
    if vkey != onchain_vkey {
        bail!("elf vkey {vkey} != client MEMBERSHIP_PROGRAM_VKEY {onchain_vkey}, use the matching sp1-programs release");
    }
    tracing::info!(bridge = %cfg.bridge, client = %client_addr, %vkey, escrow = %cfg.escrow, "batcher started");

    loop {
        if let Err(e) = tick(&cfg, &hub, &escrow_raw, &rt, &provider, &prover, &pk) {
            tracing::error!(error = format!("{e:#}"), "tick failed");
        }
        if cfg.once {
            return Ok(());
        }
        std::thread::sleep(cfg.poll);
    }
}

fn tick<P: Provider>(
    cfg: &Config,
    hub: &hub::Hub,
    escrow_raw: &[u8; 32],
    rt: &tokio::runtime::Runtime,
    provider: &P,
    prover: &NetworkProver,
    pk: &SP1ProvingKey,
) -> Result<()> {
    let bridge = IBadBridge::new(cfg.bridge, provider);
    // resolve every tick, the router can repoint cosmoshub-0 after a client redeploy
    let client = IClient::new(rt.block_on(async { bridge.lightClient().call().await })?, provider);
    let cs = rt.block_on(async { client.clientState().call().await })?;
    if cs.isFrozen {
        bail!("client is frozen");
    }
    let height = cs.latestHeight.revisionHeight;

    let mut unproven = Vec::new();
    for r in hub.records(&cfg.escrow)? {
        if rt.block_on(async { bridge.proven(r.token_id).call().await })? == Address::ZERO {
            unproven.push(r);
        }
    }
    if unproven.is_empty() {
        tracing::info!(height, "nothing to prove");
        return Ok(());
    }

    // app hash at H commits to state after H-1, so query there
    let mut batch = Vec::new();
    for r in unproven.iter().take(cfg.max_batch) {
        let key = hub::store_key(escrow_raw, r.token_id);
        match hub.prove(&key, height - 1)? {
            None => tracing::info!(token_id = r.token_id, height, "record newer than client height, waiting"),
            Some((value, merkle_proof)) => {
                if hex::encode(&value) != r.eth_recipient.to_lowercase() {
                    bail!("token {}: proven value {} != escrow record {}", r.token_id, hex::encode(&value), r.eth_recipient);
                }
                batch.push(hub::ProvenRecord { token_id: r.token_id, store_key: key, value, merkle_proof });
            }
        }
    }
    if batch.is_empty() {
        return Ok(());
    }

    let header = hub.header(height)?;
    let cs = ConsensusState {
        timestamp: header.timestamp_ns,
        root: header.app_hash.into(),
        nextValidatorsHash: header.next_validators_hash.into(),
    };
    let want = rt.block_on(async { client.getConsensusStateHash(height).call().await })?;
    if keccak256(cs.abi_encode()) != want {
        bail!("rebuilt consensus state at {height} doesn't match the client, wrong hub rpc?");
    }

    let ids: Vec<u32> = batch.iter().map(|r| r.token_id).collect();
    tracing::info!(height, count = batch.len(), ?ids, "proving batch");
    let mut stdin = SP1Stdin::new();
    stdin.write_slice(&header.app_hash);
    stdin.write_slice(&(batch.len() as u16).to_le_bytes());
    for r in &batch {
        let kv = KVPair { path: vec![Bytes::from_static(b"wasm"), Bytes::from(r.store_key.clone())], value: Bytes::from(r.value.clone()) };
        stdin.write_vec(kv.abi_encode());
        stdin.write_vec(r.merkle_proof.clone());
    }
    let proof = prover.prove(pk, stdin).groth16().run().context("sp1 prove")?;

    let sp1_proof = SP1Proof {
        vKey: pk.verifying_key().bytes32().parse()?,
        publicValues: Bytes::from(proof.public_values.to_vec()),
        proof: Bytes::from(proof.bytes()),
    };
    let receipt = rt.block_on(async {
        let pending = bridge.submitBatch(height, cs, sp1_proof).send().await?;
        anyhow::Ok(pending.get_receipt().await?)
    })?;
    if !receipt.status() {
        bail!("submitBatch reverted in {}", receipt.transaction_hash);
    }
    tracing::info!(tx = %receipt.transaction_hash, gas = receipt.gas_used, ?ids, "batch submitted");
    Ok(())
}
