//! Cosmos Hub reads: escrow records over REST, proofs and headers over CometBFT RPC.

use anyhow::{anyhow, bail, Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use std::time::Duration;

pub struct Hub {
    http: reqwest::blocking::Client,
    /// tried in order, the first one that still has the height wins
    rpcs: Vec<String>,
    rest: String,
}

#[derive(Deserialize)]
pub struct Record {
    pub token_id: u32,
    pub eth_recipient: String,
}

/// A proven escrow record: the raw store key/value plus its ICS-23 proof.
pub struct ProvenRecord {
    pub token_id: u32,
    pub store_key: Vec<u8>,
    pub value: Vec<u8>,
    /// protobuf ibc.core.commitment.v1.MerkleProof
    pub merkle_proof: Vec<u8>,
}

pub struct Header {
    pub timestamp_ns: u128,
    pub app_hash: [u8; 32],
    pub next_validators_hash: [u8; 32],
}

impl Hub {
    pub fn new(rpcs: Vec<String>, rest: String) -> Result<Self> {
        let http = reqwest::blocking::Client::builder().timeout(Duration::from_secs(30)).build()?;
        Ok(Self { http, rpcs, rest })
    }

    /// Every record in the escrow, paging through the `pending` query.
    pub fn records(&self, escrow: &str) -> Result<Vec<Record>> {
        let mut out: Vec<Record> = Vec::new();
        loop {
            let start_after = out.last().map_or("null".to_string(), |r| r.token_id.to_string());
            let q = format!(r#"{{"pending":{{"start_after":{start_after},"limit":500}}}}"#);
            let url = format!("{}/cosmwasm/wasm/v1/contract/{escrow}/smart/{}", self.rest, B64.encode(q));
            #[derive(Deserialize)]
            struct Resp {
                data: Vec<Record>,
            }
            let page: Resp = self.http.get(&url).send()?.error_for_status()?.json().context("decode pending")?;
            let done = page.data.len() < 500;
            out.extend(page.data);
            if done {
                return Ok(out);
            }
        }
    }

    /// Proves `store_key` in the wasm store at `height`. Ok(None) if the key isn't there yet.
    pub fn prove(&self, store_key: &[u8], height: u64) -> Result<Option<(Vec<u8>, Vec<u8>)>> {
        let mut last_err = anyhow!("no hub rpcs configured");
        for rpc in &self.rpcs {
            match self.prove_at(rpc, store_key, height) {
                Ok(r) => return Ok(r),
                Err(e) => {
                    tracing::warn!(rpc, height, error = %e, "abci_query failed, trying next rpc");
                    last_err = e;
                }
            }
        }
        Err(last_err)
    }

    fn prove_at(&self, rpc: &str, store_key: &[u8], height: u64) -> Result<Option<(Vec<u8>, Vec<u8>)>> {
        let url = format!(
            "{rpc}/abci_query?path=%22/store/wasm/key%22&data=0x{}&height={height}&prove=true",
            hex::encode(store_key)
        );
        let v: serde_json::Value = self.http.get(&url).send()?.error_for_status()?.json()?;
        let resp = &v["result"]["response"];
        if resp["code"].as_u64().unwrap_or(0) != 0 {
            bail!("abci code {}: {}", resp["code"], resp["log"]);
        }
        let value = B64.decode(resp["value"].as_str().unwrap_or(""))?;
        if value.is_empty() {
            return Ok(None);
        }
        let ops = resp["proofOps"]["ops"].as_array().ok_or_else(|| anyhow!("no proof ops"))?;
        if ops.len() != 2 {
            bail!("expected 2 proof ops (iavl, simple), got {}", ops.len());
        }
        // MerkleProof { repeated CommitmentProof proofs = 1 }, each op's data is already a CommitmentProof
        let mut mp = Vec::new();
        for op in ops {
            let data = B64.decode(op["data"].as_str().ok_or_else(|| anyhow!("op without data"))?)?;
            mp.push(0x0a);
            put_varint(&mut mp, data.len() as u64);
            mp.extend_from_slice(&data);
        }
        Ok(Some((value, mp)))
    }

    pub fn header(&self, height: u64) -> Result<Header> {
        let url = format!("{}/block?height={height}", self.rpcs[0]);
        let v: serde_json::Value = self.http.get(&url).send()?.error_for_status()?.json()?;
        let h = &v["result"]["block"]["header"];
        let time = chrono::DateTime::parse_from_rfc3339(h["time"].as_str().unwrap_or(""))
            .with_context(|| format!("parse header time at {height}"))?;
        let ns = time.timestamp_nanos_opt().ok_or_else(|| anyhow!("header time out of range"))?;
        Ok(Header {
            timestamp_ns: u128::try_from(ns)?,
            app_hash: hex32(&h["app_hash"])?,
            next_validators_hash: hex32(&h["next_validators_hash"])?,
        })
    }
}

/// `0x03 || escrow addr || b"b" || token_id BE`, the wasmd contract store key of a record.
pub fn store_key(escrow_raw: &[u8; 32], token_id: u32) -> Vec<u8> {
    let mut k = Vec::with_capacity(38);
    k.push(0x03);
    k.extend_from_slice(escrow_raw);
    k.push(b'b');
    k.extend_from_slice(&token_id.to_be_bytes());
    k
}

pub fn escrow_raw(bech: &str) -> Result<[u8; 32]> {
    let (_, data) = bech32::decode(bech).with_context(|| format!("decode {bech}"))?;
    data.try_into().map_err(|d: Vec<u8>| anyhow!("escrow address is {} bytes, want 32", d.len()))
}

fn hex32(v: &serde_json::Value) -> Result<[u8; 32]> {
    let b = hex::decode(v.as_str().unwrap_or(""))?;
    b.try_into().map_err(|_| anyhow!("want 32 bytes"))
}

fn put_varint(out: &mut Vec<u8>, mut n: u64) {
    while n >= 0x80 {
        out.push((n as u8) | 0x80);
        n >>= 7;
    }
    out.push(n as u8);
}
