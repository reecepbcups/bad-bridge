//! Bad Bridge escrow. Holds cw721 tokens sent to it and records the Ethereum recipient
//! under a raw key that BadBridge.sol can parse straight out of an SP1 membership proof.

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    entry_point, to_json_binary, Addr, Binary, Deps, DepsMut, Env, HexBinary, MessageInfo,
    Response, StdResult,
};
use cw_storage_plus::Item;

/// Raw record key prefix. Full key is `b"b" || token_id (u32 BE)`, value is the 20-byte ETH address.
pub const RECORD_PREFIX: u8 = b'b';

const CW721: Item<Addr> = Item::new("cw721");

#[derive(thiserror::Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] cosmwasm_std::StdError),
    #[error("only {expected} can send nfts here")]
    WrongCollection { expected: Addr },
    #[error("token id {0} is not a u32")]
    BadTokenId(String),
    #[error("recipient must be exactly 20 bytes, got {0}")]
    BadRecipient(usize),
    #[error("token {0} already bridged")]
    AlreadyBridged(u32),
}

#[cw_serde]
pub struct InstantiateMsg {
    pub cw721: String,
}

/// cw721 receiver hook payload, inlined to avoid depending on a specific cw721 version.
#[cw_serde]
pub struct Cw721ReceiveMsg {
    pub sender: String,
    pub token_id: String,
    /// raw 20-byte Ethereum recipient
    pub msg: Binary,
}

#[cw_serde]
pub enum ExecuteMsg {
    ReceiveNft(Cw721ReceiveMsg),
}

#[cw_serde]
pub enum QueryMsg {
    Record { token_id: u32 },
    Config {},
}

pub fn record_key(token_id: u32) -> Vec<u8> {
    let mut k = Vec::with_capacity(5);
    k.push(RECORD_PREFIX);
    k.extend_from_slice(&token_id.to_be_bytes());
    k
}

#[entry_point]
pub fn instantiate(deps: DepsMut, _env: Env, _info: MessageInfo, msg: InstantiateMsg) -> Result<Response, ContractError> {
    let cw721 = deps.api.addr_validate(&msg.cw721)?;
    CW721.save(deps.storage, &cw721)?;
    Ok(Response::new().add_attribute("cw721", cw721))
}

#[entry_point]
pub fn execute(deps: DepsMut, _env: Env, info: MessageInfo, msg: ExecuteMsg) -> Result<Response, ContractError> {
    let ExecuteMsg::ReceiveNft(rcv) = msg;

    let expected = CW721.load(deps.storage)?;
    if info.sender != expected {
        return Err(ContractError::WrongCollection { expected });
    }
    let token_id: u32 = rcv.token_id.parse().map_err(|_| ContractError::BadTokenId(rcv.token_id.clone()))?;
    // a malformed address strands the nft forever, so fail the send instead
    if rcv.msg.len() != 20 {
        return Err(ContractError::BadRecipient(rcv.msg.len()));
    }
    let key = record_key(token_id);
    if deps.storage.get(&key).is_some() {
        return Err(ContractError::AlreadyBridged(token_id));
    }
    deps.storage.set(&key, rcv.msg.as_slice());

    Ok(Response::new()
        .add_attribute("action", "bridge")
        .add_attribute("token_id", token_id.to_string())
        .add_attribute("from", rcv.sender)
        .add_attribute("eth_recipient", HexBinary::from(rcv.msg.as_slice()).to_hex()))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Record { token_id } => {
            to_json_binary(&deps.storage.get(&record_key(token_id)).map(HexBinary::from))
        }
        QueryMsg::Config {} => to_json_binary(&CW721.load(deps.storage)?),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env};
    use cosmwasm_std::Storage;

    fn setup() -> (cosmwasm_std::OwnedDeps<cosmwasm_std::MemoryStorage, cosmwasm_std::testing::MockApi, cosmwasm_std::testing::MockQuerier>, Addr) {
        let mut deps = mock_dependencies();
        let cw721 = deps.api.addr_make("cw721");
        let admin = deps.api.addr_make("admin");
        instantiate(deps.as_mut(), mock_env(), message_info(&admin, &[]), InstantiateMsg { cw721: cw721.to_string() }).unwrap();
        (deps, cw721)
    }

    fn rcv(token_id: &str, msg: &[u8]) -> ExecuteMsg {
        ExecuteMsg::ReceiveNft(Cw721ReceiveMsg { sender: "holder".into(), token_id: token_id.into(), msg: Binary::from(msg) })
    }

    #[test]
    fn receive_nft() {
        let eth = [0xab; 20];
        let other = [0u8; 19];
        let cases: Vec<(&str, &str, &[u8], Option<ContractError>)> = vec![
            ("ok", "7012", &eth, None),
            ("short recipient", "1", &other, Some(ContractError::BadRecipient(19))),
            ("non numeric id", "abc", &eth, Some(ContractError::BadTokenId("abc".into()))),
        ];
        for (name, id, msg, want) in cases {
            let (mut deps, cw721) = setup();
            let got = execute(deps.as_mut(), mock_env(), message_info(&cw721, &[]), rcv(id, msg));
            match want {
                None => {
                    got.unwrap();
                    assert_eq!(deps.storage.get(&record_key(id.parse().unwrap())).unwrap(), msg, "{name}");
                }
                Some(e) => assert_eq!(got.unwrap_err(), e, "{name}"),
            }
        }
    }

    #[test]
    fn rejects_wrong_collection_and_replays() {
        let (mut deps, cw721) = setup();
        let stranger = deps.api.addr_make("stranger");
        let err = execute(deps.as_mut(), mock_env(), message_info(&stranger, &[]), rcv("1", &[1; 20])).unwrap_err();
        assert_eq!(err, ContractError::WrongCollection { expected: cw721.clone() });

        execute(deps.as_mut(), mock_env(), message_info(&cw721, &[]), rcv("1", &[1; 20])).unwrap();
        let err = execute(deps.as_mut(), mock_env(), message_info(&cw721, &[]), rcv("1", &[2; 20])).unwrap_err();
        assert_eq!(err, ContractError::AlreadyBridged(1));
    }

    #[test]
    fn record_key_layout() {
        assert_eq!(record_key(7012), vec![b'b', 0x00, 0x00, 0x1b, 0x64]);
    }
}
