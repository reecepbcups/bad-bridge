// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { BadBridge, IRouter, ISP1ICS07Tendermint, ISP1Verifier } from "../src/BadBridge.sol";

contract BadBridgeTest is Test {
    address constant ROUTER = address(0x1001);
    address constant CLIENT = address(0x1002);
    address constant VERIFIER = address(0x1003);
    bytes32 constant ESCROW = bytes32(uint256(0xe5c0));
    bytes32 constant VKEY = bytes32(uint256(0x0bd8ec));
    uint64 constant HEIGHT = 100;

    BadBridge bridge;
    BadBridge.ConsensusState cs;

    function setUp() public {
        bridge = new BadBridge(IRouter(ROUTER), "cosmoshub-0", ESCROW, "Bad Kids", "BADKIDS", "ipfs://x/");
        cs = BadBridge.ConsensusState({ timestamp: 1, root: keccak256("root"), nextValidatorsHash: bytes32(0) });

        vm.mockCall(ROUTER, abi.encodeCall(IRouter.getClient, ("cosmoshub-0")), abi.encode(CLIENT));
        vm.mockCall(CLIENT, abi.encodeCall(ISP1ICS07Tendermint.getConsensusStateHash, (HEIGHT)), abi.encode(keccak256(abi.encode(cs))));
        vm.mockCall(CLIENT, abi.encodeCall(ISP1ICS07Tendermint.MEMBERSHIP_PROGRAM_VKEY, ()), abi.encode(VKEY));
        vm.mockCall(CLIENT, abi.encodeCall(ISP1ICS07Tendermint.VERIFIER, ()), abi.encode(VERIFIER));
        vm.mockCall(VERIFIER, bytes(""), bytes(""));
        mockFrozen(false);
    }

    function mockFrozen(bool frozen) internal {
        vm.mockCall(
            CLIENT,
            abi.encodeCall(ISP1ICS07Tendermint.clientState, ()),
            abi.encode(
                "cosmoshub-4",
                ISP1ICS07Tendermint.TrustThreshold(1, 3),
                ISP1ICS07Tendermint.Height(4, HEIGHT),
                uint32(1),
                uint32(2),
                frozen,
                uint8(1)
            )
        );
    }

    function key(bytes32 escrow, bytes1 tag, uint32 tokenId) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes1(0x03), escrow, tag, tokenId);
    }

    function kv(bytes memory k, bytes memory value) internal pure returns (BadBridge.KVPair memory p) {
        p.path = new bytes[](2);
        p.path[0] = "wasm";
        p.path[1] = k;
        p.value = value;
    }

    function proofFor(BadBridge.KVPair memory p) internal view returns (BadBridge.SP1Proof memory) {
        BadBridge.KVPair[] memory kvs = new BadBridge.KVPair[](1);
        kvs[0] = p;
        bytes memory pv = abi.encode(BadBridge.MembershipOutput({ commitmentRoot: cs.root, kvPairs: kvs }));
        return BadBridge.SP1Proof({ vKey: VKEY, publicValues: pv, proof: "" });
    }

    function test_submitAndClaim() public {
        address alice = makeAddr("alice");
        bridge.submitBatch(HEIGHT, cs, proofFor(kv(key(ESCROW, "b", 7012), abi.encodePacked(alice))));
        assertEq(bridge.proven(7012), alice);

        bridge.claim(7012);
        assertEq(bridge.ownerOf(7012), alice);
        assertEq(bridge.tokenURI(7012), "ipfs://x/7012");

        vm.expectRevert();
        bridge.claim(7012);
    }

    function test_claimToContractWithoutReceiver() public {
        // a multisig or plain contract must still receive the kid, _safeMint would revert here
        address vault = address(new NoReceiver());
        bridge.submitBatch(HEIGHT, cs, proofFor(kv(key(ESCROW, "b", 1), abi.encodePacked(vault))));
        bridge.claim(1);
        assertEq(bridge.ownerOf(1), vault);
    }

    function test_parseRejects() public {
        address alice = makeAddr("alice");
        bytes memory good = abi.encodePacked(alice);
        BadBridge.KVPair[6] memory bad = [
            kv(key(bytes32(uint256(0xbad)), "b", 1), good), // other contract
            kv(key(ESCROW, "c", 1), good), // other key namespace
            kv(abi.encodePacked(key(ESCROW, "b", 1), bytes1(0)), good), // trailing byte
            kv(abi.encodePacked(bytes1(0x04), ESCROW, bytes1("b"), uint32(1)), good), // other store prefix
            kv(key(ESCROW, "b", 1), abi.encodePacked(alice, bytes1(0))), // 21-byte value
            kv(key(ESCROW, "b", 1), good)
        ];
        bad[5].path[0] = "ibc"; // other store
        for (uint256 i = 0; i < bad.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(BadBridge.BadPath.selector, 0));
            bridge.submitBatch(HEIGHT, cs, proofFor(bad[i]));
        }
    }

    function test_rejectsWrongRootAndVKey() public {
        BadBridge.SP1Proof memory p = proofFor(kv(key(ESCROW, "b", 1), abi.encodePacked(address(1))));
        p.vKey = bytes32(uint256(1));
        vm.expectRevert(BadBridge.BadVKey.selector);
        bridge.submitBatch(HEIGHT, cs, p);

        BadBridge.ConsensusState memory other = cs;
        other.root = keccak256("other");
        vm.expectRevert(BadBridge.BadConsensusState.selector);
        bridge.submitBatch(HEIGHT, other, proofFor(kv(key(ESCROW, "b", 1), abi.encodePacked(address(1)))));
    }

    function test_rejectsFrozenClient() public {
        mockFrozen(true);
        vm.expectRevert(BadBridge.ClientFrozen.selector);
        bridge.submitBatch(HEIGHT, cs, proofFor(kv(key(ESCROW, "b", 1), abi.encodePacked(address(1)))));
    }

    function testFuzz_parseOnlyAcceptsExactLayout(bytes calldata k, uint32 tokenId, address to) public view {
        BadBridge.KVPair memory p = kv(k, abi.encodePacked(to));
        try bridge.parse(p, 0) returns (uint32 id, address recipient) {
            assertEq(keccak256(k), keccak256(key(ESCROW, "b", id)));
            assertEq(recipient, to);
        } catch { }
        (uint32 id2,) = bridge.parse(kv(key(ESCROW, "b", tokenId), abi.encodePacked(to)), 0);
        assertEq(id2, tokenId);
    }
}

contract NoReceiver { }
