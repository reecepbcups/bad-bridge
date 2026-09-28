// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Votes } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IRouter {
    function getClient(string calldata clientId) external view returns (address);
}

interface ISP1Verifier {
    function verifyProof(bytes32 programVKey, bytes calldata publicValues, bytes calldata proofBytes) external view;
}

interface ISP1ICS07Tendermint {
    struct TrustThreshold {
        uint8 numerator;
        uint8 denominator;
    }

    struct Height {
        uint64 revisionNumber;
        uint64 revisionHeight;
    }

    function clientState()
        external
        view
        returns (
            string memory chainId,
            TrustThreshold memory trustLevel,
            Height memory latestHeight,
            uint32 trustingPeriod,
            uint32 unbondingPeriod,
            bool isFrozen,
            uint8 zkAlgorithm
        );
    function getConsensusStateHash(uint64 revisionHeight) external view returns (bytes32);
    function MEMBERSHIP_PROGRAM_VKEY() external view returns (bytes32);
    function VERIFIER() external view returns (ISP1Verifier);
}

/// @notice One-way exit for cw721 tokens escrowed on Cosmos Hub. Proves escrow records with the
/// SP1 membership program against the canonical Eureka cosmoshub-0 client, then mints the same token id.
/// One kid is one vote, delegated to its holder unless they pick someone else.
contract BadBridge is ERC721, ERC721Votes {
    struct ConsensusState {
        uint128 timestamp;
        bytes32 root;
        bytes32 nextValidatorsHash;
    }

    struct SP1Proof {
        bytes32 vKey;
        bytes publicValues;
        bytes proof;
    }

    struct KVPair {
        bytes[] path;
        bytes value;
    }

    struct MembershipOutput {
        bytes32 commitmentRoot;
        KVPair[] kvPairs;
    }

    IRouter public immutable ROUTER;
    /// @notice raw 32-byte escrow contract address on Cosmos Hub
    bytes32 public immutable ESCROW;
    string public clientId;
    string private baseURI;

    mapping(uint32 tokenId => address recipient) public proven;

    event Proven(uint32 indexed tokenId, address indexed recipient);

    error ClientFrozen();
    error BadConsensusState();
    error BadVKey();
    error RootMismatch();
    error BadPath(uint256 index);
    error NotProven(uint32 tokenId);

    constructor(
        IRouter router,
        string memory clientId_,
        bytes32 escrow,
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    )
        ERC721(name_, symbol_)
        EIP712(name_, "1")
    {
        ROUTER = router;
        clientId = clientId_;
        ESCROW = escrow;
        baseURI = baseURI_;
    }

    function lightClient() public view returns (ISP1ICS07Tendermint) {
        return ISP1ICS07Tendermint(ROUTER.getClient(clientId));
    }

    /// @notice Records every escrow entry proven by `sp1Proof` at `proofHeight`. Anyone can call it.
    function submitBatch(uint64 proofHeight, ConsensusState calldata cs, SP1Proof calldata sp1Proof) external {
        ISP1ICS07Tendermint client = lightClient();
        // getConsensusStateHash still answers on a frozen client, membership doesn't
        (,,,,, bool isFrozen,) = client.clientState();
        if (isFrozen) revert ClientFrozen();
        // anchor to the canonical client's stored root, same checks the client does for membership
        if (keccak256(abi.encode(cs)) != client.getConsensusStateHash(proofHeight)) revert BadConsensusState();
        if (sp1Proof.vKey != client.MEMBERSHIP_PROGRAM_VKEY()) revert BadVKey();

        client.VERIFIER().verifyProof(sp1Proof.vKey, sp1Proof.publicValues, sp1Proof.proof);

        MembershipOutput memory out = abi.decode(sp1Proof.publicValues, (MembershipOutput));
        if (out.commitmentRoot != cs.root) revert RootMismatch();

        for (uint256 i = 0; i < out.kvPairs.length; ++i) {
            (uint32 tokenId, address recipient) = parse(out.kvPairs[i], i);
            // replay protection is keyed on token id, a record can show up in many proofs
            if (proven[tokenId] == address(0)) {
                proven[tokenId] = recipient;
                emit Proven(tokenId, recipient);
            }
        }
    }

    /// @notice Mints a proven token to its recorded recipient. Anyone can call it.
    function claim(uint32 tokenId) external {
        address to = proven[tokenId];
        if (to == address(0)) revert NotProven(tokenId);
        // _mint reverts if the token exists, so a second claim can't mint twice. That only holds
        // because nothing can burn: a burn path would need a claimed flag here. Not _safeMint:
        // a recipient contract without onERC721Received would strand the kid forever.
        _mint(to, tokenId);
    }

    /// @notice Kids minted so far. Sparse, since only bridged ids exist.
    function totalSupply() external view returns (uint256) {
        return _getTotalSupply();
    }

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    /// @dev Unset means self, so holders vote without sending a delegate tx first (Nouns-style).
    function delegates(address account) public view override returns (address) {
        address delegatee = super.delegates(account);
        return delegatee == address(0) ? account : delegatee;
    }

    /// @dev delegate(0) would move votes to address(0) while delegates() still reports self. Map it to self.
    function _delegate(address account, address delegatee) internal override {
        super._delegate(account, delegatee == address(0) ? account : delegatee);
    }

    /// @dev Whole attack surface. Path must be exactly ["wasm", 0x03 || ESCROW || "b" || u32 BE] with a 20-byte value.
    function parse(KVPair memory kv, uint256 index) public view returns (uint32 tokenId, address recipient) {
        if (kv.path.length != 2 || keccak256(kv.path[0]) != keccak256("wasm")) revert BadPath(index);
        bytes memory key = kv.path[1];
        if (key.length != 38 || key[0] != 0x03 || key[33] != "b" || kv.value.length != 20) revert BadPath(index);

        bytes32 addr;
        bytes memory value = kv.value;
        assembly {
            addr := mload(add(key, 33))
            tokenId := shr(224, mload(add(key, 66)))
            recipient := shr(96, mload(add(value, 32)))
        }
        if (addr != ESCROW) revert BadPath(index);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Votes)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount) internal override(ERC721, ERC721Votes) {
        super._increaseBalance(account, amount);
    }
}
